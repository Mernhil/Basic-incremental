import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  collectModifiers,
  createSaveText,
  createSeededRng,
  Decimal,
  freshCard,
  MIGRATIONS,
  portalInfo,
  portalLevel,
  pull,
  readSave,
  setFocusKind,
  settleTierRewards,
  statValue,
  tierChances,
  tierCardIds,
  tierComplete,
  tierProgress,
  resolvePortal,
  FOCUS_PORTAL_ID,
  type GameState,
} from '../src/game';
import { MAX_STARS } from '../src/data/schemas';
import type { Rarity } from '../src/data';
import { constantRng, content, CRYSTAL_UNIT, freshState } from './helpers';

/**
 * The four summoning rules of 2026-11-20 (DESIGN.md §2 Summoning): the Card Portal's level, the
 * T6 pity with a rising chance, the first 10-pull's Gold and the tier completion reward.
 */
const PORTAL = 'card_portal';
const portal = content.portals.find((p) => p.id === PORTAL)!;
const ofRarity = (r: Rarity): string[] =>
  portal.pool.filter((e) => e.rarity === r).map((e) => e.itemId);

const rich = (pulls = 0): GameState => {
  const s = freshState();
  s.resources['summon_scroll'] = new Decimal(1e9 * CRYSTAL_UNIT);
  s.portals[PORTAL] = { pity: 0, pulls, pityHits: 0 };
  s.summon.firstTenPullDone = true;
  return s;
};
const chanceOf = (s: GameState, r: Rarity): number =>
  portalInfo(s, content, PORTAL)!.rates.byRarity.find((x) => x.rarity === r)?.chance ?? 0;
/** Every card of the tier at six stars. */
const complete = (s: GameState, r: Rarity): GameState => {
  for (const id of tierCardIds(content, r)) {
    s.cards.owned[id] = { ...freshCard(content.cardById.get(id)!), stars: MAX_STARS };
  }
  return s;
};

describe('Portal level (DESIGN.md §2 Summoning)', () => {
  it('has levels whose chances each sum to 1, rise to Gold and Prismatic, and open at 0 pulls', () => {
    expect(portal.levels.length).toBeGreaterThanOrEqual(8);
    expect(portal.levels[0]!.pulls).toBe(0);
    for (const level of portal.levels) {
      const sum = Object.values(level.chances).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
    const first = portal.levels[0]!.chances;
    const last = portal.levels[portal.levels.length - 1]!.chances;
    expect(last.common).toBeLessThan(first.common);
    expect(last.epic + last.legendary).toBeGreaterThan(0.85);
    const t6 = last.mythic + last.void;
    expect(t6).toBeGreaterThan(0.02);
    expect(t6).toBeLessThan(0.08);
  });

  it('level 1 keeps the chances the pool always had', () => {
    const info = portalInfo(rich(0), content, PORTAL)!;
    expect(info.level).toMatchObject({ level: 1, from: 0 });
    const wood = info.rates.byRarity.find((r) => r.rarity === 'common')!;
    expect(wood.chance).toBeCloseTo(0.532, 3);
  });

  it('goes up with the pulls made, and the chances move up with it', () => {
    expect(portalLevel(portal, 0)).toBe(1);
    expect(portalLevel(portal, portal.levels[1]!.pulls - 1)).toBe(1);
    expect(portalLevel(portal, portal.levels[1]!.pulls)).toBe(2);
    expect(portalLevel(portal, 1e9)).toBe(portal.levels.length);
    const low = rich(0);
    const high = rich(portal.levels[portal.levels.length - 1]!.pulls);
    expect(chanceOf(high, 'common')).toBeLessThan(chanceOf(low, 'common'));
    expect(chanceOf(high, 'legendary')).toBeGreaterThan(chanceOf(low, 'legendary'));
    expect(chanceOf(high, 'mythic') + chanceOf(high, 'void')).toBeGreaterThan(
      chanceOf(low, 'mythic') + chanceOf(low, 'void'),
    );
  });

  it('counts a pull from the Focus Portal and a 10-pull toward the level', () => {
    const state = rich(0);
    const r = pull(state, content, PORTAL, 10, createSeededRng(1));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.portals[PORTAL]!.pulls).toBe(10);
    const focused = setFocusKind(rich(5), content, 'sword');
    if (!focused.ok) throw new Error('focus');
    const f = pull(focused.state, content, FOCUS_PORTAL_ID, 1, createSeededRng(1));
    if (!f.ok) throw new Error(f.reason);
    expect(f.state.portals[PORTAL]!.pulls).toBe(6);
  });

  it('shows the progress to the next level', () => {
    const [, second, third] = portal.levels;
    const mid = Math.floor((second!.pulls + third!.pulls) / 2);
    const info = portalInfo(rich(mid), content, PORTAL)!.level!;
    expect(info.level).toBe(2);
    expect(info.next).toBe(third!.pulls);
    expect(info.progress).toBeGreaterThan(0.3);
    expect(info.progress).toBeLessThan(0.7);
  });

  describe('the guard: a tier leaves the pool only once all its cards are at six stars', () => {
    const top = portal.levels[portal.levels.length - 1]!.pulls;

    it('a complete tier has no chance, and the others grow to fill it', () => {
      const before = rich(top);
      const after = complete(rich(top), 'common');
      expect(chanceOf(before, 'common')).toBeGreaterThan(0);
      expect(chanceOf(after, 'common')).toBe(0);
      expect(chanceOf(after, 'epic')).toBeGreaterThan(chanceOf(before, 'epic'));
      const sum = portalInfo(after, content, PORTAL)!.rates.byRarity.reduce(
        (a, r) => a + r.chance,
        0,
      );
      expect(sum).toBeCloseTo(1, 9);
    });

    it('a player with every Wood card at six stars pulls no Wood at all', () => {
      const state = complete(rich(top), 'common');
      const result = pull(state, content, PORTAL, 10, createSeededRng(7));
      if (!result.ok) throw new Error(result.reason);
      expect(result.results.some((x) => x.rarity === 'common')).toBe(false);
      let s = result.state;
      for (let i = 0; i < 60; i++) {
        const next = pull(s, content, PORTAL, 10, createSeededRng(100 + i));
        if (!next.ok) throw new Error(next.reason);
        expect(next.results.some((x) => x.rarity === 'common')).toBe(false);
        s = next.state;
      }
    });

    it('a player missing one Wood star still has a small Wood share', () => {
      const state = complete(rich(top), 'common');
      const missing = ofRarity('common')[0]!;
      state.cards.owned[missing]!.stars = MAX_STARS - 1;
      expect(tierComplete(state, content, 'common')).toBe(false);
      const wood = chanceOf(state, 'common');
      expect(wood).toBeGreaterThan(portal.minShare * 0.9);
      expect(wood).toBeLessThan(0.05);
    });

    it('the wishlist still steers the small share of an unfinished tier', () => {
      const state = complete(rich(top), 'common');
      const missing = ofRarity('common')[0]!;
      state.cards.owned[missing]!.stars = MAX_STARS - 1;
      state.cards.wishlist = [missing];
      const result = pull(state, content, PORTAL, 1, constantRng(0));
      if (!result.ok) throw new Error(result.reason);
      // rng 0 lands on the lowest tier left in the pool: Wood, redirected to the marked card
      expect(result.results[0]).toMatchObject({ rarity: 'common', itemId: missing });
    });

    it('the Focus Portal follows the same guard', () => {
      const state = complete(rich(top), 'common');
      const focused = setFocusKind(state, content, 'sword');
      if (!focused.ok) throw new Error('focus');
      const resolved = resolvePortal(focused.state, content, FOCUS_PORTAL_ID)!;
      const chances = tierChances(focused.state, content, resolved, top);
      expect(chances.find((c) => c.rarity === 'common')?.chance ?? 0).toBe(0);
    });
  });
});

describe('T6 pity (DESIGN.md §2 Summoning)', () => {
  const t6 = (s: GameState): number => chanceOf(s, 'mythic') + chanceOf(s, 'void');
  const withPity = (count: number, pulls = 0): GameState => {
    const s = rich(pulls);
    s.portals[PORTAL] = { pity: count, pulls, pityHits: 0 };
    return s;
  };

  it('guarantees a T6 and counts toward it (it replaces the old Prismatic pity)', () => {
    expect(portal.pity.rarity).toBe('mythic');
    const result = pull(withPity(portal.pity.threshold - 1), content, PORTAL, 1, constantRng(0));
    if (!result.ok) throw new Error(result.reason);
    expect(result.results[0]).toMatchObject({ pity: true });
    expect(['mythic', 'void']).toContain(result.results[0]!.rarity);
    expect(result.state.portals[PORTAL]).toMatchObject({ pity: 0, pityHits: 1 });
  });

  it('keeps the level chance before the soft start and rises after it', () => {
    const base = t6(withPity(0));
    expect(t6(withPity(portal.pity.softFrom! - 1))).toBeCloseTo(base, 9);
    const mid = t6(withPity(Math.floor((portal.pity.softFrom! + portal.pity.threshold) / 2)));
    expect(mid).toBeGreaterThan(base * 5);
    const near = t6(withPity(portal.pity.threshold - 2));
    expect(near).toBeGreaterThan(mid);
    expect(t6(withPity(portal.pity.threshold - 1))).toBeCloseTo(1, 9);
  });

  it('the chance rises on every pull of the run, and the whole stays 1', () => {
    let last = 0;
    for (let n = portal.pity.softFrom!; n < portal.pity.threshold; n++) {
      const s = withPity(n);
      const sum = portalInfo(s, content, PORTAL)!.rates.byRarity.reduce((a, r) => a + r.chance, 0);
      expect(sum).toBeCloseTo(1, 9);
      expect(t6(s)).toBeGreaterThanOrEqual(last);
      last = t6(s);
    }
  });

  it('a T6 by luck resets the counter', () => {
    const s = withPity(10);
    const result = pull(s, content, PORTAL, 1, constantRng(0.99999));
    if (!result.ok) throw new Error(result.reason);
    expect(['mythic', 'void']).toContain(result.results[0]!.rarity);
    expect(result.results[0]!.pity).toBe(false);
    expect(result.state.portals[PORTAL]!.pity).toBe(0);
  });

  it('a Prismatic no longer resets it', () => {
    const s = withPity(10);
    const result = pull(s, content, PORTAL, 1, constantRng(0.9835));
    if (!result.ok) throw new Error(result.reason);
    expect(result.results[0]!.rarity).toBe('legendary');
    expect(result.state.portals[PORTAL]!.pity).toBe(11);
  });

  it('gives nothing more once every T6 card is at six stars', () => {
    const s = complete(complete(withPity(portal.pity.threshold - 1), 'mythic'), 'void');
    expect(portalInfo(s, content, PORTAL)!.pity.open).toBe(false);
    const result = pull(s, content, PORTAL, 1, constantRng(0.5));
    if (!result.ok) throw new Error(result.reason);
    expect(result.results[0]!.pity).toBe(false);
  });

  it('still reads the threshold through summon.pityThreshold', () => {
    const s = withPity(9);
    const cap = {
      stat: 'summon.pityThreshold',
      kind: 'set',
      value: new Decimal(10),
      scope: { portal: PORTAL },
      source: { kind: 'skill', id: 'test' },
    } as const;
    const result = pull(s, content, PORTAL, 1, constantRng(0), [cap]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.results[0]!.pity).toBe(true);
    expect(statValue('summon.pityThreshold', 60, [cap], { portal: PORTAL }).toNumber()).toBe(10);
  });
});

describe('First 10-pull gives a Gold (DESIGN.md §2 Summoning)', () => {
  const fresh = (): GameState => {
    const s = freshState();
    s.resources['summon_scroll'] = new Decimal(1e9 * CRYSTAL_UNIT);
    return s;
  };
  const rank = (r: Rarity): number =>
    ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'void'].indexOf(r);

  it('the first 10-pull of a new game holds a Gold or better, and later ones a Silver', () => {
    const s = fresh();
    expect(s.summon.firstTenPullDone).toBe(false);
    expect(portalInfo(s, content, PORTAL)!.firstTenPull).toBe('epic');
    const first = pull(s, content, PORTAL, 10, constantRng(0));
    if (!first.ok) throw new Error(first.reason);
    expect(rank(first.results[9]!.rarity)).toBeGreaterThanOrEqual(rank('epic'));
    expect(first.results[9]!.guaranteed).toBe(true);
    expect(first.state.summon.firstTenPullDone).toBe(true);
    expect(portalInfo(first.state, content, PORTAL)!.firstTenPull).toBeNull();
    const second = pull(first.state, content, PORTAL, 10, constantRng(0));
    if (!second.ok) throw new Error(second.reason);
    expect(second.results[9]!.rarity).toBe('rare');
  });

  it('single pulls do not use it up', () => {
    const one = pull(fresh(), content, PORTAL, 1, constantRng(0));
    if (!one.ok) throw new Error(one.reason);
    expect(one.state.summon.firstTenPullDone).toBe(false);
  });

  it('a 10-pull that already holds a Gold needs no guarantee but still uses it up', () => {
    const lucky = pull(fresh(), content, PORTAL, 10, constantRng(0.97));
    if (!lucky.ok) throw new Error(lucky.reason);
    expect(lucky.results.some((r) => r.guaranteed)).toBe(false);
    expect(lucky.state.summon.firstTenPullDone).toBe(true);
  });

  it('every first 10-pull seed holds a Gold or better', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = pull(fresh(), content, PORTAL, 10, createSeededRng(seed));
      if (!r.ok) throw new Error(r.reason);
      expect(r.results.some((x) => rank(x.rarity) >= rank('epic'))).toBe(true);
    }
  });
});

describe('Tier completion reward (DESIGN.md §2 Summoning)', () => {
  const reward = content.cardRules.tierReward;

  it('pays scrolls once when a tier is complete, and not again', () => {
    const s = complete(freshState(), 'common');
    const before = s.resources['summon_scroll'] ?? new Decimal(0);
    expect(settleTierRewards(s, content)).toEqual(['wood']);
    expect(s.resources['summon_scroll']!.sub(before).eq(reward.scrolls.wood)).toBe(true);
    expect(s.summon.tierRewardsClaimed).toEqual(['wood']);
    expect(settleTierRewards(s, content)).toEqual([]);
    expect(s.resources['summon_scroll']!.sub(before).eq(reward.scrolls.wood)).toBe(true);
  });

  it('pays nothing for a tier one star short', () => {
    const s = complete(freshState(), 'common');
    s.cards.owned[ofRarity('common')[0]!]!.stars = MAX_STARS - 1;
    expect(settleTierRewards(s, content)).toEqual([]);
  });

  it('gives a small permanent damage bonus for each tier paid, through the pipeline', () => {
    const none = collectModifiers(freshState(), content).filter((m) =>
      m.source.id.startsWith('tier:'),
    );
    expect(none).toEqual([]);
    const s = complete(complete(freshState(), 'common'), 'uncommon');
    settleTierRewards(s, content);
    const mods = collectModifiers(s, content).filter((m) => m.source.id.startsWith('tier:'));
    expect(mods.map((m) => m.source.id).sort()).toEqual(['tier:bronze', 'tier:wood']);
    for (const m of mods) {
      expect(m).toMatchObject({ stat: 'combat.damage', kind: 'percent' });
    }
    // small: all seven tiers together stay under 10%
    expect(reward.damagePercent.toNumber() * 7).toBeLessThan(10);
    const one = statValue('combat.damage', 100, mods.slice(0, 1), {}).toNumber();
    expect(one).toBeCloseTo(100 + reward.damagePercent.toNumber(), 6);
  });

  it('the pull that completes a tier pays it at once', () => {
    const s = rich(0);
    const ids = ofRarity('common');
    complete(s, 'common');
    s.cards.owned[ids[0]!]!.stars = MAX_STARS - 1;
    s.cards.owned[ids[0]!]!.starFill = 0;
    s.cards.wishlist = [ids[0]!];
    const before = s.resources['summon_scroll']!;
    const r = pull(s, content, PORTAL, 1, constantRng(0));
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]).toMatchObject({ itemId: ids[0] });
    expect(r.state.cards.owned[ids[0]!]!.starFill).toBeGreaterThan(0);
    // the copy fills the bar; the star-up itself is the player's, so the tier is not done yet
    expect(r.state.summon.tierRewardsClaimed).toEqual([]);
    expect(r.state.resources['summon_scroll']!.lte(before)).toBe(true);
  });

  it('lists a check box per tier: both T6 sides, claimed once paid', () => {
    const s = complete(freshState(), 'common');
    settleTierRewards(s, content);
    const rows = tierProgress(s, content);
    expect(rows.map((r) => r.grade)).toEqual([
      'wood',
      'bronze',
      'silver',
      'gold',
      'prismatic',
      'mythic',
      'void',
    ]);
    expect(rows[0]).toMatchObject({ complete: true, claimed: true, done: 11, total: 11 });
    expect(rows[1]).toMatchObject({ complete: false, claimed: false });
    expect(rows[5]!.total).toBeGreaterThan(30);
  });

  it('an unknown tier in a save is dropped, and a paid tier is kept through a save', () => {
    const s = complete(freshState(), 'common');
    settleTierRewards(s, content);
    s.summon.tierRewardsClaimed.push('nonsense');
    const loaded = readSave(createSaveText(s, 1), content).state;
    expect(loaded.summon.tierRewardsClaimed).toEqual(['wood']);
    expect(loaded.summon.firstTenPullDone).toBe(false);
  });
});

describe('Save format 40: summoning chances', () => {
  const migrate = MIGRATIONS[39]!;

  it('is the current format', () => {
    expect(content.portals.find((p) => p.id === PORTAL)).toBeDefined();
    const { version } = JSON.parse(createSaveText(freshState(), 1)) as { version: number };
    expect(version).toBeGreaterThanOrEqual(40);
    expect(createSaveText(freshState(), 1)).toContain(`"version":${CURRENT_SAVE_VERSION}`);
  });

  it('a save with 10 or more Card Portal pulls has had its first 10-pull; the level comes from the pulls', () => {
    const old = {
      portals: { card_portal: { pity: 70, pulls: 250, pityHits: 0 } },
      summon: { focusKind: null, dailyClaimedDay: null },
    };
    const out = migrate(old) as {
      portals: Record<string, { pity: number; pulls: number }>;
      summon: Record<string, unknown>;
    };
    expect(out.summon).toMatchObject({ firstTenPullDone: true, tierRewardsClaimed: [] });
    // the T6 counter starts again; the pulls (and so the level) are kept
    expect(out.portals['card_portal']).toMatchObject({ pity: 0, pulls: 250 });
    expect(portalLevel(portal, 250)).toBeGreaterThan(4);
  });

  it('a save with fewer pulls, or none, still gets its first Gold', () => {
    const few = migrate({
      portals: { card_portal: { pity: 3, pulls: 3, pityHits: 0 } },
      summon: {},
    });
    expect((few as { summon: { firstTenPullDone: boolean } }).summon.firstTenPullDone).toBe(false);
    const none = migrate({ portals: {}, summon: {} });
    expect((none as { summon: { firstTenPullDone: boolean } }).summon.firstTenPullDone).toBe(false);
  });

  it('a save that had completed a tier is paid when it loads', () => {
    const s = complete(freshState(), 'common');
    const text = createSaveText(s, 1);
    const envelope = JSON.parse(text) as { state: { summon: Record<string, unknown> } };
    envelope.state.summon['tierRewardsClaimed'] = [];
    const loaded = readSave(JSON.stringify(envelope), content).state;
    expect(loaded.summon.tierRewardsClaimed).toEqual(['wood']);
    expect(loaded.resources['summon_scroll']!.gte(content.cardRules.tierReward.scrolls.wood)).toBe(
      true,
    );
  });
});
