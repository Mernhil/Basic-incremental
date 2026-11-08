import { describe, expect, it } from 'vitest';
import {
  addCard,
  advance,
  advanceChunked,
  approxEq,
  burstStats,
  cardCollection,
  cardEffectModifiers,
  cardHealth,
  cardInfo,
  cardModifiers,
  cardPower,
  CARD_LEVEL_STEP_MS,
  collectModifiers,
  createSaveText,
  Decimal,
  effectiveDamage,
  emptyCardLoadout,
  fightingXpPerKill,
  levelCap,
  loadoutCostCap,
  loadoutInfo,
  loadoutProblem,
  MIGRATIONS,
  migrateState,
  newOwnedCard,
  producerRate,
  productionXpPerUnit,
  readSave,
  serializeState,
  setLoadout,
  setLoadoutSlot,
  simulateOffline,
  starUp,
  starUpCheck,
  tierUpCost,
  tierUp,
  tierUpCheck,
  xpToNextLevel,
  type CardResult,
  type GameState,
  type Modifier,
  type OwnedCard,
} from '../src/game';
import { bareState, constantRng, plainContent as content, freshState, withDps } from './helpers';

const rng = constantRng(0.5);

function ok(result: CardResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}

function own(state: GameState, id: string, card: Partial<OwnedCard> = {}): GameState {
  state.cards.owned[id] = { ...newOwnedCard(), ...card };
  return state;
}

function give(state: GameState, resource: string, amount: number): GameState {
  state.resources[resource] = new Decimal(amount);
  return state;
}

describe('a new game (DESIGN.md §5)', () => {
  it('owns the three Common cards at Bronze ★1 Lv 1, each leading its job', () => {
    const state = freshState();
    expect(Object.keys(state.cards.owned).sort()).toEqual([
      'apprentice_feller',
      'cave_digger',
      'ember_squire',
    ]);
    for (const owned of Object.values(state.cards.owned)) {
      expect(owned).toMatchObject({ tier: 'bronze', stars: 1, level: 1, starFill: 0 });
      expect(owned.xp.eq(0)).toBe(true);
    }
    expect(state.cards.loadouts.fighting).toEqual({
      main: 'ember_squire',
      supports: [null, null, null],
    });
    expect(state.cards.loadouts.logging.main).toBe('apprentice_feller');
    expect(state.cards.loadouts.mining.main).toBe('cave_digger');
    expect(state.cards.shards).toBe(0);
  });
});

describe('levels (DESIGN.md §5)', () => {
  it('caps levels by tier only: 20 / 40 / 60 / 80 / 100, whatever the stars', () => {
    expect(levelCap(content, { tier: 'bronze', stars: 1 })).toBe(20);
    expect(levelCap(content, { tier: 'bronze', stars: 6 })).toBe(20);
    expect(levelCap(content, { tier: 'silver', stars: 1 })).toBe(40);
    expect(levelCap(content, { tier: 'gold', stars: 3 })).toBe(60);
    expect(levelCap(content, { tier: 'prismatic', stars: 6 })).toBe(80);
    expect(levelCap(content, { tier: 'unique', stars: 1 })).toBe(100);
  });

  it('follows the XP curve from data', () => {
    const { base, growth } = content.cardRules.xpCurve;
    expect(xpToNextLevel(content, 1).eq(base)).toBe(true);
    expect(approxEq(xpToNextLevel(content, 5), base.mul(growth.pow(4)))).toBe(true);
  });

  it('gives production cards XP per unit harvested, only in their loadout', () => {
    let state = own(bareState(), 'grove_keeper');
    state.cards.loadouts.logging.main = 'apprentice_feller';
    state = advance(state, content, 5000, rng).state; // 5 Oak Gem, no level-up yet
    const perUnit = productionXpPerUnit(content, 'logging');
    expect(state.cards.owned['apprentice_feller']!.xp.eq(perUnit.mul(5))).toBe(true);
    expect(state.cards.owned['grove_keeper']!.xp.eq(0)).toBe(true); // owned, not in a loadout
    expect(state.cards.owned['cave_digger']!.xp.eq(0)).toBe(true); // not in the mining loadout
  });

  it('counts harvest-burst output as harvested', () => {
    const state = bareState();
    state.cards.loadouts.mining.main = 'cave_digger';
    state.bursts.mining = { gauge: 29, timer: 0 };
    const after = advance(state, content, 1000, rng).state; // 0.5 ore + a 10 s burst (5 ore)
    const expected = productionXpPerUnit(content, 'mining').mul(5.5);
    const owned = after.cards.owned['cave_digger']!;
    // 11 XP: level 1 -> 2 (10 XP) on the whole second, 1 left.
    expect(owned.level).toBe(2);
    expect(approxEq(owned.xp, expected.sub(xpToNextLevel(content, 1)))).toBe(true);
  });

  it('levels up on whole seconds of play time and reports it', () => {
    const state = bareState();
    state.cards.loadouts.logging.main = 'apprentice_feller';
    // 10 XP is due at 10 s of Oak (1 XP per unit, 1 unit per second).
    let { state: after, report } = advance(state, content, 9_500, rng);
    expect(after.cards.owned['apprentice_feller']!.level).toBe(1);
    expect(report.cardLevels).toEqual({});
    ({ state: after, report } = advance(after, content, 500, rng));
    expect(after.cards.owned['apprentice_feller']!.level).toBe(2);
    expect(report.cardLevels).toEqual({ apprentice_feller: { from: 1, to: 2 } });
    expect(after.stats.playTimeMs % CARD_LEVEL_STEP_MS).toBe(0);
  });

  it('gives fighting cards XP per boss kill (on top of the time fought), more in harder dungeons', () => {
    const [mossy, ember, frost] = content.dungeons;
    const perKill = fightingXpPerKill(content, mossy!);
    expect(perKill.eq(content.cardRules.xp.perKill)).toBe(true);
    const growth = content.cardRules.xp.tierGrowth;
    expect(fightingXpPerKill(content, ember!).eq(perKill.mul(growth))).toBe(true);
    expect(fightingXpPerKill(content, frost!).eq(perKill.mul(growth.pow(2)))).toBe(true);

    const state = bareState();
    state.cards.loadouts.fighting.main = 'ember_squire';
    // The first boss falls in exactly 12 s: its HP over 12 is the damage per second.
    const hp = content.dungeons[0]!.boss.hp.toNumber();
    const { state: after, report } = advance(state, withDps(hp / 12), 12_000, constantRng(0.9));
    expect(report.bossKills).toBe(1);
    const squire = after.cards.owned['ember_squire']!;
    // 12 s fought (1 XP each) and 50 XP on the kill = 62: levels 1..5 cost 10 + 11.2 + 12.544 +
    // 14.049 = 47.793; 14.207 is left, short of the 15.735 for level 6.
    expect(squire.level).toBe(5);
    expect(squire.xp.toNumber()).toBeCloseTo(62 - 47.79328, 6);
  });

  it('stops XP at the level cap until a tier-up raises it', () => {
    const state = own(bareState(), 'apprentice_feller', { level: 20 });
    state.cards.loadouts.logging.main = 'apprentice_feller';
    const after = advance(state, content, 60_000, rng).state;
    expect(after.cards.owned['apprentice_feller']).toMatchObject({ level: 20 });
    expect(after.cards.owned['apprentice_feller']!.xp.eq(0)).toBe(true);
  });

  it('gives XP while offline exactly like the live game loop', () => {
    const start = freshState();
    // A Mossy Cellar kill per ~4 min.
    const strong = withDps(content.dungeons[0]!.boss.hp.toNumber() / 240);
    const offline = simulateOffline(start, strong, 0, 3_600_000, rng);
    const live = advanceChunked(start, strong, 3_600_000, rng, 1000).state;
    expect(offline.summary!.cardLevels['apprentice_feller']).toEqual({
      from: 1,
      to: live.cards.owned['apprentice_feller']!.level,
    });
    expect(offline.summary!.cardLevels['ember_squire']!.to).toBeGreaterThan(1);
    for (const [id, card] of Object.entries(live.cards.owned)) {
      const other = offline.state.cards.owned[id]!;
      expect(other.level).toBe(card.level);
      expect(approxEq(other.xp, card.xp)).toBe(true);
    }
    for (const id of ['oak_gem', 'copper_gem', 'moss_sigil']) {
      expect(approxEq(offline.state.resources[id]!, live.resources[id]!)).toBe(true);
    }
    expect(offline.summary!.bossKills).toBe(live.stats.bossKills);
  });
});

describe('card effects through the modifier pipeline (DESIGN.md §14, §5)', () => {
  const fighting = (state: GameState) =>
    burstStats(content, 'fighting', collectModifiers(state, content));

  it('applies a main ability only to the card leading the job', () => {
    let state = own(bareState(), 'storm_duelist');
    expect(fighting(state).interval).toBe(1); // no card: 1 s
    state = ok(setLoadoutSlot(state, content, 'fighting', 'main', 'storm_duelist'));
    expect(fighting(state).interval).toBe(0.5);
    expect(fighting(state).fill).toBe(2);
    const mods = collectModifiers(state, content);
    expect(mods.some((m) => m.source.kind === 'card' && m.source.id === 'storm_duelist')).toBe(
      true,
    );
  });

  it('gives Dawnblade Regent heavy hits and a ×15 signature attack', () => {
    const state = own(bareState(), 'dawnblade_regent');
    state.cards.loadouts.fighting.main = 'dawnblade_regent';
    expect(fighting(state).interval).toBe(2);
    expect(fighting(state).power.eq(15)).toBe(true);
  });

  it('gives Elder Treant and Geode Golem 15 s harvest bursts', () => {
    const state = own(own(bareState(), 'elder_treant'), 'geode_golem');
    state.cards.loadouts.logging.main = 'elder_treant';
    state.cards.loadouts.mining.main = 'geode_golem';
    const mods = collectModifiers(state, content);
    expect(burstStats(content, 'logging', mods).power.eq(15)).toBe(true);
    expect(burstStats(content, 'mining', mods).power.eq(15)).toBe(true);
    expect(burstStats(content, 'fighting', mods).power.eq(10)).toBe(true);
  });

  it('applies a support effect only from a support slot of its job', () => {
    let state = own(bareState(), 'storm_duelist');
    state.cards.loadouts.fighting.main = 'ember_squire';
    const base = effectiveDamage(state, content);
    state.account.level = 2; // cost cap 8: Squire 2 + Duelist 5 fit
    state = ok(setLoadoutSlot(state, content, 'fighting', 0, 'storm_duelist'));
    expect(fighting(state).interval).toBe(1); // a support leaves the main ability alone
    expect(effectiveDamage(state, content).eq(base.mul(1.12))).toBe(true); // Duelist support +12%
    state = ok(setLoadoutSlot(state, content, 'fighting', 'main', 'storm_duelist')); // swap
    expect(state.cards.loadouts.fighting).toEqual({
      main: 'storm_duelist',
      supports: ['ember_squire', null, null],
    });
    // An Epic main deals 2.25x a Common's base damage, plus the Squire support +5%.
    expect(effectiveDamage(state, content).eq(base.mul(2.25).mul(1.05))).toBe(true);
    expect(fighting(state).interval).toBe(0.5); // Duelist main: a hit every 0.5 s
  });

  it('scales bonuses with level, stars and tier, with a big step at ★6 and per tier', () => {
    const at = (card: Partial<OwnedCard>) => cardPower(content, { ...newOwnedCard(), ...card });
    expect(at({})).toBe(1);
    expect(at({ level: 11 })).toBeCloseTo(1.2);
    expect(at({ stars: 6 }) - at({ stars: 5 })).toBeGreaterThan(
      at({ stars: 5 }) - at({ stars: 4 }) * 2,
    );
    expect(at({ tier: 'silver' })).toBeCloseTo(1.5);
    expect(at({ tier: 'prismatic', stars: 6, level: 100 })).toBeGreaterThan(10);

    const lv11 = { ...newOwnedCard(), level: 11 };
    const support = cardEffectModifiers(content, 'storm_duelist', 'support', lv11);
    expect(support[0]!.value.toNumber()).toBeCloseTo(12 * 1.2); // +12% damage at power 1.2
    const main = cardEffectModifiers(content, 'storm_duelist', 'main', lv11);
    // The fill ×2 is a `mult` that stays fixed; main growth adds +2% fill. Damage grows through
    // the card's base damage instead (DESIGN.md §5), so there is no damage percent here.
    expect(main.find((m) => m.stat === 'burst.fill' && m.kind === 'mult')!.value.eq(2)).toBe(true);
    const growth = main.filter((m) => m.kind === 'percent');
    expect(growth.map((m) => [m.stat, Math.round(m.value.toNumber() * 1000) / 1000])).toEqual([
      ['burst.fill', 2],
    ]);
  });

  it('gives each card health by rarity, scaled by its power', () => {
    const base = newOwnedCard();
    expect(cardHealth(content, 'ember_squire', base).eq(100)).toBe(true);
    expect(cardHealth(content, 'dawnblade_regent', base).eq(350)).toBe(true);
    const silver = { ...base, tier: 'silver' as const, level: 11 };
    expect(cardHealth(content, 'ember_squire', silver).toNumber()).toBeCloseTo(100 * 1.2 * 1.5);
    expect(cardHealth(content, 'nope', base).eq(0)).toBe(true);
  });

  it('makes a levelled main card raise its job output', () => {
    const state = own(bareState(), 'apprentice_feller', { level: 11 });
    const oak = content.treeById.get('oak')!;
    expect(producerRate(oak, 'logging', collectModifiers(state, content)).eq(1)).toBe(true);
    state.cards.loadouts.logging.main = 'apprentice_feller';
    const rate = producerRate(oak, 'logging', collectModifiers(state, content));
    expect(rate.toNumber()).toBeCloseTo(1.2);
  });

  it('lists nothing for cards in the wrong job or not owned', () => {
    const state = bareState();
    state.cards.loadouts.fighting.main = 'apprentice_feller'; // a logging card
    state.cards.loadouts.logging.main = 'moonwood_dryad'; // not owned
    expect(cardModifiers(state, content)).toEqual([]);
  });
});

describe('loadouts (DESIGN.md §5)', () => {
  it('has a cost cap of 6 at account level 1, read through loadout.costCap', () => {
    const state = freshState();
    expect(loadoutCostCap(state, content, 'fighting')).toBe(6);
    const raise: Modifier = {
      stat: 'loadout.costCap',
      kind: 'flat',
      value: new Decimal(2),
      scope: { job: 'fighting' },
      source: { kind: 'skill', id: 'test' },
    };
    expect(loadoutCostCap(state, content, 'fighting', [raise])).toBe(8);
    expect(loadoutCostCap(state, content, 'logging', [raise])).toBe(6);
    expect(loadoutInfo(state, content, 'fighting')).toEqual({
      job: 'fighting',
      main: 'ember_squire',
      supports: [null, null, null],
      cost: 2,
      cap: 6,
    });
  });

  it('checks job, ownership, duplicates, slots and the cost cap', () => {
    const state = own(freshState(), 'storm_duelist');
    const set = (slot: 'main' | number, id: string | null) =>
      setLoadoutSlot(state, content, 'fighting', slot, id);
    expect(set(0, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    expect(set(0, 'dawnblade_regent')).toEqual({ ok: false, reason: 'not-owned' });
    expect(set(0, 'apprentice_feller')).toEqual({ ok: false, reason: 'wrong-job' });
    expect(set(3, 'storm_duelist')).toEqual({ ok: false, reason: 'invalid-slot' });
    expect(set(-1, 'storm_duelist')).toEqual({ ok: false, reason: 'invalid-slot' });
    // Squire 2 + Duelist 5 = 7 does not fit the starting cap of 6; at account level 2 (cap 8) it does.
    expect(set(0, 'storm_duelist')).toEqual({ ok: false, reason: 'over-cost-cap' });
    const roomy = own(freshState(), 'storm_duelist');
    roomy.account.level = 2;
    ok(setLoadoutSlot(roomy, content, 'fighting', 0, 'storm_duelist'));
    expect(
      setLoadout(state, content, 'fighting', {
        main: 'storm_duelist',
        supports: ['storm_duelist', null, null],
      }),
    ).toEqual({ ok: false, reason: 'duplicate' });
    expect(loadoutProblem(state, content, 'fighting', { main: null, supports: [null, null] })).toBe(
      'invalid-slot',
    );
    // The main card alone must fit too.
    const heavy = own(freshState(), 'dawnblade_regent');
    expect(setLoadoutSlot(heavy, content, 'fighting', 'main', 'dawnblade_regent')).toEqual({
      ok: false,
      reason: 'over-cost-cap',
    });
  });

  it('moves a card already in the loadout and clears slots', () => {
    let state = own(freshState(), 'storm_duelist');
    state.account.level = 2; // room for Squire 2 + Duelist 5
    state = ok(setLoadoutSlot(state, content, 'fighting', 0, 'storm_duelist'));
    state = ok(setLoadoutSlot(state, content, 'fighting', 2, 'storm_duelist'));
    expect(state.cards.loadouts.fighting.supports).toEqual([null, null, 'storm_duelist']);
    state = ok(setLoadoutSlot(state, content, 'fighting', 'main', null));
    expect(state.cards.loadouts.fighting.main).toBeNull();
    state = ok(setLoadout(state, content, 'fighting', emptyCardLoadout()));
    expect(state.cards.loadouts.fighting).toEqual(emptyCardLoadout());
  });
});

describe('star-up and tier-up (DESIGN.md §5)', () => {
  it('lists what a star-up needs: the star bar fill, nothing else', () => {
    const state = own(freshState(), 'ember_squire', { level: 12 });
    const check = starUpCheck(state, content, 'ember_squire')!;
    expect(check.available).toBe(true);
    expect(check.to).toEqual({ tier: 'bronze', stars: 2 });
    expect(check.met).toBe(false);
    expect(
      check.requirements.map((r) => [
        r.kind,
        r.resource,
        r.have.toNumber(),
        r.need.toNumber(),
        r.met,
      ]),
    ).toEqual([['starFill', undefined, 0, content.cardRules.starBar.needs.common[0], false]]);
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
    expect(starUpCheck(state, content, 'storm_duelist')).toBeNull();
    expect(starUp(state, content, 'storm_duelist')).toEqual({ ok: false, reason: 'not-owned' });
    expect(starUp(state, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('spends the fill and keeps the level; the cap stays', () => {
    const need = content.cardRules.starBar.needs.common[0]!;
    const state = own(freshState(), 'ember_squire', { level: 20, starFill: need + 2 });
    const after = ok(starUp(state, content, 'ember_squire'));
    expect(after.cards.owned['ember_squire']).toMatchObject({ stars: 2, level: 20, starFill: 2 });
    expect(cardInfo(after, content, 'ember_squire')!.levelCap).toBe(20); // stars do not raise it
    expect(state.cards.owned['ember_squire']!.stars).toBe(1); // pure
  });

  it("has no star-up at ★6 and no tier-up past the card's top tier", () => {
    const state = own(own(freshState(), 'ember_squire', { stars: 6 }), 'storm_duelist', {
      tier: 'prismatic',
      stars: 6,
    });
    expect(starUpCheck(state, content, 'ember_squire')).toMatchObject({
      available: false,
      to: null,
    });
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'unavailable' });
    expect(tierUpCheck(state, content, 'storm_duelist')!.available).toBe(false);
    expect(tierUp(state, content, 'storm_duelist')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('tiers up with Money, Cores and higher-tier gems, carrying level and XP over', () => {
    let state = freshState();
    own(state, 'apprentice_feller', { level: 20 });
    own(state, 'ember_squire', { level: 19, xp: new Decimal(3) });
    const fighting = tierUpCheck(state, content, 'ember_squire')!;
    expect(fighting.to).toEqual({ tier: 'silver', stars: 1 });
    expect(fighting.requirements.map((r) => [r.kind, r.resource ?? null])).toEqual([
      ['level', null],
      ['resource', 'money'],
      ['resource', 'moss_core'],
      ['resource', 'iron_gem'],
      ['resource', 'ironbark_gem'],
    ]);
    const logging = tierUpCheck(state, content, 'apprentice_feller')!;
    expect(logging.requirements.map((r) => r.resource ?? null)).toEqual([
      null,
      'money',
      'moss_core',
      'ironbark_gem',
      'iron_gem',
    ]);
    for (const cost of content.cardRules.tierUp.bronze.logging) {
      state = give(state, cost.resource, cost.amount.toNumber());
    }
    state = ok(tierUp(state, content, 'apprentice_feller'));
    expect(state.cards.owned['apprentice_feller']).toMatchObject({
      tier: 'silver',
      stars: 1,
      level: 20,
    });
    for (const cost of content.cardRules.tierUp.bronze.logging) {
      expect(state.resources[cost.resource]!.eq(0)).toBe(true);
    }
    expect(tierUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
  });

  it('uses Cinder Cores + Moonwillow Gem / Grotto Gem, then Frost Cores + Frost Sigils', () => {
    const state = freshState();
    own(state, 'cave_digger', { tier: 'silver', level: 40 });
    own(state, 'ember_squire', { tier: 'gold', level: 60 });
    const resources = (id: string) =>
      tierUpCheck(state, content, id)!.requirements.flatMap((r) => r.resource ?? []);
    expect(resources('cave_digger')).toEqual([
      'money',
      'cinder_core',
      'grotto_gem',
      'moonwillow_gem',
    ]);
    expect(resources('ember_squire')).toEqual([
      'money',
      'frost_core',
      'frost_sigil',
      'grotto_gem',
      'moonwillow_gem',
    ]);
  });

  it('mixes a Core, a tree gem and a mine gem into every tier-up of every job', () => {
    const kindOf = (id: string) => content.resourceById.get(id)!.kind;
    for (const card of ['ember_squire', 'apprentice_feller', 'cave_digger']) {
      for (const tier of ['bronze', 'silver', 'gold'] as const) {
        const state = own(freshState(), card, { tier });
        const up = tierUpCost(content, content.cardById.get(card)!, state.cards.owned[card]!);
        const kinds = new Set(up.map((p) => kindOf(p.resource)));
        for (const k of ['currency', 'material', 'tree_gem', 'mine_gem'])
          expect(kinds.has(k as never), `${card} ${tier} ${k}`).toBe(true);
      }
    }
  });

  it('leans on the job’s own loop: logging cards need more tree gems, mining cards more mine gems', () => {
    const amount = (card: string, resource: string): number => {
      const state = own(freshState(), card, { tier: 'silver' });
      const cost = tierUpCost(content, content.cardById.get(card)!, state.cards.owned[card]!);
      return cost.find((p) => p.resource === resource)!.amount.toNumber();
    };
    expect(amount('apprentice_feller', 'moonwillow_gem')).toBeGreaterThan(
      amount('apprentice_feller', 'grotto_gem'),
    );
    expect(amount('cave_digger', 'grotto_gem')).toBeGreaterThan(
      amount('cave_digger', 'moonwillow_gem'),
    );
    // Fighting uses both.
    expect(amount('ember_squire', 'grotto_gem')).toBeGreaterThan(0);
    expect(amount('ember_squire', 'moonwillow_gem')).toBeGreaterThan(0);
  });
});

describe('gaining cards (DESIGN.md §5)', () => {
  it('adds a new card, then duplicates into the star bar, then shards at ★6', () => {
    let result = addCard(freshState(), content, 'dawnblade_regent')!;
    expect(result.gain).toEqual({ kind: 'new' });
    expect(result.state.cards.owned['dawnblade_regent']).toMatchObject({
      tier: 'bronze',
      stars: 1,
    });
    result = addCard(result.state, content, 'dawnblade_regent')!;
    expect(result.gain).toEqual({ kind: 'duplicate', duplicates: 1 });
    const maxed = own(result.state, 'dawnblade_regent', { stars: 6 });
    result = addCard(maxed, content, 'dawnblade_regent')!;
    expect(result.gain).toEqual({ kind: 'shards', shards: 8 }); // Legendary
    expect(result.state.cards.shards).toBe(8);
    expect(addCard(freshState(), content, 'nope')).toBeNull();
  });

  it('gives shards by rarity as in DESIGN.md §5', () => {
    expect(content.cardRules.shards).toEqual({
      common: 1,
      rare: 2,
      epic: 4,
      legendary: 8,
      mythic: 15,
      exotic: 25,
      void: 40,
    });
  });
});

describe('views for the Cards page', () => {
  it('describes owned and unowned cards', () => {
    const state = freshState();
    const squire = cardInfo(state, content, 'ember_squire')!;
    expect(squire).toMatchObject({
      rank: { tier: 'bronze', stars: 1 },
      levelCap: 20,
      power: 1,
      cost: 2,
      slot: { job: 'fighting', slot: 'main' },
      maxRank: false,
    });
    expect(squire.xpToNext!.eq(10)).toBe(true);
    expect(squire.supportModifiers.map((m) => m.stat)).toEqual(['combat.damage']);
    const regent = cardInfo(state, content, 'dawnblade_regent')!;
    expect(regent).toMatchObject({ owned: null, rank: null, slot: null, cost: 8, starUp: null });
    expect(regent.mainModifiers.map((m) => m.stat)).toEqual(['burst.interval', 'burst.power']);
    expect(cardInfo(state, content, 'nope')).toBeNull();
    expect(cardCollection(state, content).map((c) => c.card.id)).toHaveLength(11);
    expect(cardCollection(state, content, 'mining').map((c) => c.card.id)).toEqual([
      'cave_digger',
      'gem_cutter',
      'geode_golem',
      'core_titan',
    ]);
  });
});

describe('saving cards (save format v5)', () => {
  it('round-trips the collection, loadouts and shards', () => {
    const state = own(freshState(), 'storm_duelist', {
      tier: 'gold',
      stars: 3,
      level: 55,
      xp: new Decimal('123.5'),
      starFill: 4,
    });
    state.cards.loadouts.fighting.supports = [null, 'storm_duelist', null];
    state.cards.shards = 17;
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(serializeState(loaded)).toEqual(serializeState(state));
    expect(loaded.cards.owned['storm_duelist']!.xp.eq('123.5')).toBe(true);
  });

  it('drops unknown cards, clamps levels and empties invalid loadout slots', () => {
    const text = createSaveText(freshState(), 1);
    const envelope = JSON.parse(text);
    const cards = envelope.state.cards;
    cards.owned['removed_card'] = {
      tier: 'bronze',
      stars: 1,
      level: 1,
      xp: '0',
      starFill: 0,
      enhancements: [],
    };
    cards.owned['ember_squire'].level = 99;
    cards.owned['ember_squire'].xp = '5';
    cards.loadouts.fighting = {
      main: 'removed_card',
      supports: ['ember_squire', 'ember_squire', 'apprentice_feller'],
    };
    cards.loadouts.mining = { main: 'gem_cutter', supports: [] };
    const loaded = readSave(JSON.stringify(envelope), content).state;
    expect(loaded.cards.owned['removed_card']).toBeUndefined();
    expect(loaded.cards.owned['ember_squire']).toMatchObject({ level: 20 });
    expect(loaded.cards.owned['ember_squire']!.xp.eq(0)).toBe(true);
    expect(loaded.cards.loadouts.fighting).toEqual({
      main: null,
      supports: ['ember_squire', null, null],
    });
    expect(loaded.cards.loadouts.mining).toEqual({ main: null, supports: [null, null, null] });
  });

  it('migrates a v4 save: the three Commons, each leading its job', () => {
    const v4 = {
      resources: { oak_gem: '12' },
      cosmetics: {
        loadout: {
          slots: {},
          cards: { example_fighting_main: { border: { id: 'ember_crown', level: 1 } } },
        },
        owned: {},
      },
    };
    const migrated = migrateState(v4, 4, 5, MIGRATIONS) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(migrated['cards']).toEqual({
      owned: {
        ember_squire: { tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 },
        apprentice_feller: { tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 },
        cave_digger: { tier: 'bronze', stars: 1, level: 1, xp: '0', duplicates: 0 },
      },
      loadouts: {
        fighting: { main: 'ember_squire', supports: [null, null, null] },
        logging: { main: 'apprentice_feller', supports: [null, null, null] },
        mining: { main: 'cave_digger', supports: [null, null, null] },
      },
      shards: 0,
    });
    expect(migrated['cosmetics'].loadout.cards).toEqual({
      dawnblade_regent: { border: { id: 'ember_crown', level: 1 } },
    });
    expect(v4.cosmetics.loadout.cards).toHaveProperty('example_fighting_main'); // not mutated
  });

  it('loads a real v4 save file into the same cards as a new game', () => {
    const v4 = JSON.parse(createSaveText(freshState(), 1));
    delete v4.state.cards;
    v4.version = 4;
    const loaded = readSave(JSON.stringify(v4), content).state;
    expect(serializeState(loaded).cards).toEqual(serializeState(freshState()).cards);
  });
});
