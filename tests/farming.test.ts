import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  advance,
  ascend,
  buyPostUpgrade,
  collectModifiers,
  cloneState,
  createInitialState,
  createSeededRng,
  Decimal,
  farmPostRates,
  farmPostView,
  finishedDifficulty,
  newOwnedCard,
  pickPostTrait,
  postTraitOffer,
  rerollPostTraits,
  setFarmSlot,
  setFarmTeam,
  setLoadoutSlot,
  simulateOffline,
  type GameState,
} from '../src/game';
import { openAscension } from './helpers';

const content = loadContent();
const HOUR = 3_600_000;
const CARDS = ['ember_squire', 'hollow_spearman', 'brass_vanguard', 'reaper_test'];

/** A game with Mossy Cellar beaten to its last floor on Normal, and the four cheap cards owned. */
function finished(difficulty: 'normal' | 'hard' | 'nightmare' = 'normal'): GameState {
  const s = createInitialState(content);
  const mossy = content.dungeonById.get('mossy_cellar')!;
  s.combat.floors['mossy_cellar'] = {
    difficulty: 'normal',
    autoChallenge: false,
    tiers: {
      normal: { floor: 1, best: mossy.floors },
      ...(difficulty !== 'normal' ? { hard: { floor: 1, best: mossy.floors } } : {}),
      ...(difficulty === 'nightmare' ? { nightmare: { floor: 1, best: mossy.floors } } : {}),
    },
  };
  for (const id of CARDS) s.cards.owned[id] = newOwnedCard(content.cardById.get(id)!.tier);
  s.cards.loadouts.fighting = { slots: [null, null, null, null] };
  return s;
}

function team(s: GameState, ids: (string | null)[] = CARDS): GameState {
  const r = setFarmTeam(s, content, 'mossy_cellar', ids);
  if (!r.ok) throw new Error(`team refused: ${r.reason}`);
  return r.state;
}

/** Spends the card cap so a four-card farm team fits in the tests. */
function roomy(s: GameState): GameState {
  s.account.level = 20;
  return s;
}

describe('a finished dungeon', () => {
  it('is open once every floor of one difficulty is beaten, and grows with the difficulty', () => {
    const fresh = createInitialState(content);
    expect(finishedDifficulty(fresh, content, 'mossy_cellar')).toBeNull();
    expect(finishedDifficulty(finished(), content, 'mossy_cellar')).toBe('normal');
    expect(finishedDifficulty(finished('hard'), content, 'mossy_cellar')).toBe('hard');
    expect(finishedDifficulty(finished('nightmare'), content, 'mossy_cellar')).toBe('nightmare');
  });

  it('is not finished one floor short', () => {
    const s = finished();
    s.combat.floors['mossy_cellar']!.tiers['normal']!.best -= 1;
    expect(finishedDifficulty(s, content, 'mossy_cellar')).toBeNull();
  });
});

describe('a post team', () => {
  it('refuses a dungeon that is not finished', () => {
    const r = setFarmTeam(createInitialState(content), content, 'mossy_cellar', [
      null,
      null,
      null,
      null,
    ]);
    expect(r).toEqual({ ok: false, reason: 'locked' });
  });

  it('takes up to four owned fighting cards under the cost cap', () => {
    const s = roomy(finished());
    const next = team(s);
    expect(next.farming.posts['mossy_cellar']!.team).toEqual(CARDS);
    expect(s.farming.posts['mossy_cellar']).toBeUndefined();
  });

  it('refuses a team over the cost cap, a duplicate, and a card that is not owned', () => {
    const s = finished();
    expect(setFarmTeam(s, content, 'mossy_cellar', CARDS)).toEqual({
      ok: false,
      reason: 'over-cost-cap',
    });
    const t = roomy(finished());
    expect(
      setFarmTeam(t, content, 'mossy_cellar', ['ember_squire', 'ember_squire', null, null]),
    ).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    expect(setFarmTeam(t, content, 'mossy_cellar', ['storm_duelist', null, null, null])).toEqual({
      ok: false,
      reason: 'not-owned',
    });
  });

  it('keeps a card in one team at a time: not in the fighting loadout, not in another post', () => {
    const s = roomy(finished());
    s.cards.loadouts.fighting = { slots: ['ember_squire', null, null, null] };
    expect(setFarmTeam(s, content, 'mossy_cellar', CARDS)).toEqual({
      ok: false,
      reason: 'in-loadout',
    });
    const t = roomy(finished('hard'));
    const ember = content.dungeonById.get('ember_crypt')!;
    t.combat.floors['ember_crypt'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 1, best: ember.floors } },
    };
    const placed = setFarmTeam(t, content, 'ember_crypt', ['ember_squire', null, null, null]);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(setFarmTeam(placed.state, content, 'mossy_cellar', CARDS)).toEqual({
      ok: false,
      reason: 'in-other-team',
    });
  });

  it('keeps the fighting loadout from taking a card that sits in a post', () => {
    const s = team(roomy(finished()));
    const r = setLoadoutSlot(s, content, 'fighting', 0, 'ember_squire');
    expect(r).toEqual({ ok: false, reason: 'in-farm-team' });
  });

  it('puts one card in one slot, moving and swapping inside the team', () => {
    const s = roomy(finished());
    const a = setFarmSlot(s, content, 'mossy_cellar', 0, 'ember_squire');
    expect(a.ok && a.state.farming.posts['mossy_cellar']!.team[0]).toBe('ember_squire');
    if (!a.ok) return;
    const b = setFarmSlot(a.state, content, 'mossy_cellar', 2, 'ember_squire');
    expect(b.ok && b.state.farming.posts['mossy_cellar']!.team).toEqual([
      null,
      null,
      'ember_squire',
      null,
    ]);
    const empty = b.ok ? setFarmSlot(b.state, content, 'mossy_cellar', 2, null) : b;
    expect(empty.ok && empty.state.farming.posts['mossy_cellar']!.team).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('what a post earns', () => {
  const rates = (s: GameState) => farmPostRates(s, content, 'mossy_cellar');

  it('is nothing without a team, and grows with the team and the difficulty', () => {
    expect(rates(roomy(finished())).money.toNumber()).toBe(0);
    const one = rates(team(roomy(finished()), ['ember_squire', null, null, null]));
    const full = rates(team(roomy(finished())));
    expect(full.money.toNumber()).toBeGreaterThan(0);
    expect(full.money.toNumber()).toBeCloseTo(one.money.toNumber() * 4, 6);
    const hard = rates(team(roomy(finished('hard'))));
    expect(hard.money.toNumber()).toBeCloseTo(
      (full.money.toNumber() * content.farming.difficultyShare.hard) /
        content.farming.difficultyShare.normal,
      6,
    );
  });

  it("is a share of what the dungeon's table pays and has the farming-only drops", () => {
    const r = rates(team(roomy(finished())));
    const money = content.dungeonById
      .get('mossy_cellar')!
      .drops.currencies.find((c) => c.resource === 'money')!;
    const expected =
      ((money.min + money.max) / 2) *
      content.farming.rollsPerHour *
      content.farming.difficultyShare.normal;
    expect(r.money.toNumber()).toBeCloseTo(expected, 4);
    expect(r.materials['moss_core']!.toNumber()).toBeGreaterThan(0);
    expect(r.shards).toBeGreaterThan(0);
    expect(r.fragments).toBeGreaterThan(0);
    expect(r.herbs).toBeGreaterThan(0);
  });
});

describe('a post at work', () => {
  const run = (s: GameState, ms: number, chunk = ms): GameState => {
    let cur = s;
    const rng = createSeededRng(7);
    for (let done = 0; done < ms; done += chunk)
      cur = advance(cur, content, Math.min(chunk, ms - done), rng).state;
    return cur;
  };
  const base = (): GameState => {
    const s = team(roomy(finished()));
    s.combat.floors['mossy_cellar']!.autoChallenge = false;
    s.activeDungeonId = null;
    return s;
  };

  const withoutTeam = (s: GameState): GameState => {
    const t = cloneState(s);
    t.farming.posts['mossy_cellar']!.team = [null, null, null, null];
    return t;
  };

  it('pays Money, the dungeon material and the farming-only drops', () => {
    const s = base();
    const rates = farmPostRates(s, content, 'mossy_cellar');
    const after = run(s, HOUR);
    // The main fight earns too: the same hour without the team is the baseline.
    const alone = run(withoutTeam(s), HOUR);
    const gained = (id: string): number =>
      (after.resources[id] ?? new Decimal(0)).sub(alone.resources[id] ?? new Decimal(0)).toNumber();
    expect(gained('money')).toBeCloseTo(rates.money.toNumber(), 0);
    expect(Math.abs(gained('moss_core') - rates.materials['moss_core']!.toNumber())).toBeLessThan(
      1,
    );
    expect(Math.abs(after.resources['herb_bundle']!.toNumber() - rates.herbs)).toBeLessThan(1);
  });

  it('gives the same result however the time is split', () => {
    const whole = run(base(), 2 * HOUR, 2 * HOUR);
    const split = run(base(), 2 * HOUR, 60_000);
    expect(split.resources['money']!.toNumber()).toBeCloseTo(
      whole.resources['money']!.toNumber(),
      0,
    );
    const a = whole.farming.posts['mossy_cellar']!;
    const b = split.farming.posts['mossy_cellar']!;
    expect(b.level).toBe(a.level);
    expect(b.xp).toBeCloseTo(a.xp, 6);
    expect(split.resources['herb_bundle']!.toNumber()).toBeCloseTo(
      whole.resources['herb_bundle']!.toNumber(),
      6,
    );
  });

  it('turns scroll fragments into Summon Scrolls when enough add up', () => {
    const s = base();
    const per = content.farming.fragmentsPerScroll;
    const hours = Math.ceil((per * 3) / farmPostRates(s, content, 'mossy_cellar').fragments);
    const after = run(s, hours * HOUR, 10 * 60_000);
    expect(
      after.resources['summon_scroll']!.sub(s.resources['summon_scroll']!).toNumber(),
    ).toBeGreaterThanOrEqual(3);
    expect((after.resources['scroll_fragment'] ?? new Decimal(0)).toNumber()).toBeLessThan(per);
  });

  it('earns nothing and levels nothing with an empty team', () => {
    const s = base();
    s.farming.posts['mossy_cellar']!.team = [null, null, null, null];
    const after = run(s, HOUR);
    expect(after.resources['money']!.toNumber()).toBe(s.resources['money']!.toNumber());
    expect(after.farming.posts['mossy_cellar']!.xp).toBe(0);
  });

  it('works while the time is away, like the main fight', () => {
    const s = base();
    const { state, summary } = simulateOffline(s, content, 0, 3 * HOUR, createSeededRng(3));
    expect(summary).not.toBeNull();
    expect(state.resources['herb_bundle']!.toNumber()).toBeGreaterThan(0);
    expect(summary!.gains['herb_bundle']!.toNumber()).toBeGreaterThan(0);
    expect(state.farming.posts['mossy_cellar']!.xp).toBeGreaterThan(0);
  });

  it('pays Heirloom shards to the Heirlooms', () => {
    const s = base();
    const rates = farmPostRates(s, content, 'mossy_cellar');
    const hours = Math.ceil(3 / rates.shards);
    const after = run(s, hours * HOUR, 30 * 60_000);
    const held = Object.values(after.heirlooms.shards).reduce((a, b) => a + b, 0);
    const owned = Object.keys(after.cards.owned).filter(
      (id) => content.cardById.get(id)?.heirloom,
    ).length;
    expect(held + owned).toBeGreaterThan(0);
  });
});

describe('post levels, traits and upgrades', () => {
  const levelled = (levels: number): GameState => {
    const s = team(roomy(finished()));
    s.farming.posts['mossy_cellar']!.level = levels;
    return s;
  };

  it('levels up with the hours a full team farms, and never past the top', () => {
    let s = team(roomy(finished()));
    s.activeDungeonId = null;
    s = advance(s, content, 40 * HOUR, createSeededRng(1)).state;
    const post = s.farming.posts['mossy_cellar']!;
    expect(post.level).toBeGreaterThan(5);
    expect(post.level).toBeLessThanOrEqual(content.farming.level.max);
  });

  it('opens a trait pick at every few levels, with two different traits to choose from', () => {
    const every = content.farming.level.traitEvery;
    expect(postTraitOffer(levelled(every - 1), content, 'mossy_cellar')).toBeNull();
    const offer = postTraitOffer(levelled(every), content, 'mossy_cellar')!;
    expect(offer).toHaveLength(2);
    expect(offer[0]).not.toBe(offer[1]);
    expect(postTraitOffer(levelled(every), content, 'mossy_cellar')).toEqual(offer);
  });

  it('picks one of the two and then waits for the next milestone', () => {
    const every = content.farming.level.traitEvery;
    const s = levelled(every);
    const [a, b] = postTraitOffer(s, content, 'mossy_cellar')!;
    expect(pickPostTrait(s, content, 'mossy_cellar', 'not_a_trait')).toEqual({
      ok: false,
      reason: 'not-offered',
    });
    const r = pickPostTrait(s, content, 'mossy_cellar', a!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.farming.posts['mossy_cellar']!.traits).toEqual([a]);
    expect(postTraitOffer(r.state, content, 'mossy_cellar')).toBeNull();
    expect(b).not.toBe(a);
    const later = levelled(every * 2);
    later.farming.posts['mossy_cellar']!.traits = [a!];
    const next = postTraitOffer(later, content, 'mossy_cellar')!;
    expect(next).not.toContain(a);
  });

  it('a trait changes what the post earns through the modifier pipeline', () => {
    const s = levelled(content.farming.level.traitEvery);
    const before = farmPostRates(s, content, 'mossy_cellar');
    s.farming.posts['mossy_cellar']!.traits = ['deep_pockets'];
    const after = farmPostRates(s, content, 'mossy_cellar');
    expect(after.money.toNumber()).toBeCloseTo(before.money.toNumber() * 1.3, 6);
    expect(after.herbs).toBeCloseTo(before.herbs, 9);
    expect(collectModifiers(s, content).some((m) => m.stat === 'farm.money')).toBe(true);
  });

  it('rerolls the offer for herb bundles, with another pair', () => {
    const s = levelled(content.farming.level.traitEvery);
    const first = postTraitOffer(s, content, 'mossy_cellar')!;
    expect(rerollPostTraits(s, content, 'mossy_cellar')).toEqual({ ok: false, reason: 'no-herbs' });
    s.resources['herb_bundle'] = new Decimal(content.farming.rerollCost + 5);
    const r = rerollPostTraits(s, content, 'mossy_cellar');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.resources['herb_bundle']!.toNumber()).toBe(5);
    expect(postTraitOffer(r.state, content, 'mossy_cellar')).not.toEqual(first);
  });

  it('buys post upgrades with herb bundles, up to the maximum', () => {
    const s = levelled(1);
    expect(buyPostUpgrade(s, content, 'mossy_cellar')).toEqual({ ok: false, reason: 'no-herbs' });
    s.resources['herb_bundle'] = new Decimal(1e9);
    const before = farmPostRates(s, content, 'mossy_cellar');
    const r = buyPostUpgrade(s, content, 'mossy_cellar');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.farming.posts['mossy_cellar']!.upgrade).toBe(1);
    expect(r.state.resources['herb_bundle']!.toNumber()).toBeLessThan(1e9);
    expect(farmPostRates(r.state, content, 'mossy_cellar').money.toNumber()).toBeGreaterThan(
      before.money.toNumber(),
    );
    const top = levelled(1);
    top.resources['herb_bundle'] = new Decimal(1e9);
    top.farming.posts['mossy_cellar']!.upgrade = content.farming.upgrade.maxLevel;
    expect(buyPostUpgrade(top, content, 'mossy_cellar')).toEqual({ ok: false, reason: 'max' });
  });

  it('swapping cards loses no level, trait or upgrade', () => {
    const s = levelled(7);
    s.farming.posts['mossy_cellar']!.traits = ['herbalist'];
    const r = setFarmSlot(s, content, 'mossy_cellar', 0, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const post = r.state.farming.posts['mossy_cellar']!;
    expect([post.level, post.traits]).toEqual([7, ['herbalist']]);
  });
});

describe('the view of a post', () => {
  it('says open or closed, the team, the level bar and the rates', () => {
    expect(farmPostView(createInitialState(content), content, 'mossy_cellar').open).toBe(false);
    const s = team(roomy(finished('hard')));
    const v = farmPostView(s, content, 'mossy_cellar');
    expect(v.open).toBe(true);
    expect(v.difficulty).toBe('hard');
    expect(v.level).toBe(1);
    expect(v.team).toEqual(CARDS);
    expect(v.nextTraitLevel).toBe(content.farming.level.traitEvery);
    expect(v.traitReady).toBe(false);
  });
});

describe('Ascension', () => {
  it('keeps the posts, their teams, levels and traits', () => {
    const s = openAscension(team(roomy(finished())));
    s.mastery.harvested['oak_gem'] = new Decimal(1e14);
    s.resources['money'] = new Decimal(1e12);
    s.farming.posts['mossy_cellar']!.level = 9;
    s.farming.posts['mossy_cellar']!.traits = ['herbalist'];
    const r = ascend(s, content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const post = r.state.farming.posts['mossy_cellar']!;
    expect(post.level).toBe(9);
    expect(post.traits).toEqual(['herbalist']);
    expect(post.team).toEqual(CARDS);
  });
});
