import { describe, expect, it } from 'vitest';
import {
  advance,
  createSaveText,
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  portalInfo,
  pull,
  readSave,
  type GameState,
  type Modifier,
} from '../src/game';
import { RARITIES } from '../src/data';
import { constantRng, content, CRYSTAL_UNIT, freshState, withDps } from './helpers';

const PORTAL = 'card_portal';
const withSigils = (n: number): GameState => {
  const state = freshState();
  state.resources['summon_crystal'] = new Decimal(n * CRYSTAL_UNIT);
  return state;
};
const rank = (r: string) => RARITIES.indexOf(r as (typeof RARITIES)[number]);

describe('Card Portal (DESIGN.md §7, beta portals)', () => {
  it('costs a single pull for one and ten times that for ten', () => {
    const info = portalInfo(withSigils(50), content, PORTAL)!;
    const single = new Decimal(10 * CRYSTAL_UNIT);
    expect(info.single.price).toEqual({ resource: 'summon_crystal', amount: single });
    expect(info.ten.price).toEqual({ resource: 'summon_crystal', amount: single.mul(10) });
    expect(info.single.affordable).toBe(true);
    expect(info.ten.affordable).toBe(false);
  });

  it('exposes rates by rarity and by item for the tooltip, each summing to 1', () => {
    const info = portalInfo(freshState(), content, PORTAL)!;
    const byRarity = info.rates.byRarity.reduce((a, r) => a + r.chance, 0);
    const byItem = info.rates.byItem.reduce((a, r) => a + r.chance, 0);
    expect(byRarity).toBeCloseTo(1, 9);
    expect(byItem).toBeCloseTo(1, 9);
    expect(info.rates.byRarity.map((r) => r.rarity)).toContain('legendary');
  });

  it('shows pity progress: Legendary or better at 90, and the 10-pull Rare guarantee', () => {
    const state = freshState();
    state.portals[PORTAL] = { pity: 45, pulls: 45, pityHits: 0 };
    const info = portalInfo(state, content, PORTAL)!;
    expect(info.pity).toEqual({ rarity: 'legendary', count: 45, threshold: 90, progress: 0.5 });
    expect(info.tenPullGuarantee).toBe('rare');
  });

  it('refuses a pull it cannot afford, and an unknown portal', () => {
    expect(pull(withSigils(9), content, PORTAL, 1, constantRng(0))).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
    expect(pull(withSigils(100), content, 'nope', 1, constantRng(0))).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('a single pull spends the cost, adds the card and counts toward pity', () => {
    const result = pull(withSigils(10), content, PORTAL, 1, constantRng(0));
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.resources['summon_crystal']!.toNumber()).toBe(0);
    expect(result.results).toHaveLength(1);
    const [first] = result.results;
    expect(first).toMatchObject({ itemId: 'ember_squire', rarity: 'common', pity: false });
    expect(first!.gain).toEqual({ kind: 'duplicate', duplicates: 1 });
    expect(result.state.cards.owned['ember_squire']!.starFill).toBe(1);
    expect(result.state.portals[PORTAL]).toEqual({ pity: 1, pulls: 1, pityHits: 0 });
  });

  it('every 10-pull has at least one Rare or better: the last pull is upgraded', () => {
    const result = pull(withSigils(100), content, PORTAL, 10, constantRng(0));
    if (!result.ok) throw new Error(result.reason);
    expect(result.results).toHaveLength(10);
    expect(result.results.slice(0, 9).every((r) => r.rarity === 'common')).toBe(true);
    const last = result.results[9]!;
    expect(rank(last.rarity)).toBeGreaterThanOrEqual(rank('rare'));
    expect(last.guaranteed).toBe(true);
    expect(result.state.cards.owned[last.itemId]).toBeDefined();
  });

  it('a 10-pull that already hit a Rare needs no guarantee', () => {
    // 0.95 picks from the top of the pool: always Rare or better.
    const result = pull(withSigils(100), content, PORTAL, 10, constantRng(0.95));
    if (!result.ok) throw new Error(result.reason);
    expect(result.results.some((r) => r.guaranteed)).toBe(false);
  });

  it('hard pity: the 90th pull without a Legendary is Legendary or better and resets', () => {
    const state = withSigils(10);
    state.portals[PORTAL] = { pity: 89, pulls: 89, pityHits: 0 };
    const result = pull(state, content, PORTAL, 1, constantRng(0));
    if (!result.ok) throw new Error(result.reason);
    const [hit] = result.results;
    expect(rank(hit!.rarity)).toBeGreaterThanOrEqual(rank('legendary'));
    expect(hit!.pity).toBe(true);
    expect(result.state.portals[PORTAL]).toEqual({ pity: 0, pulls: 90, pityHits: 1 });
  });

  it('a Legendary or better without pity also resets the counter', () => {
    const state = withSigils(10);
    state.portals[PORTAL] = { pity: 30, pulls: 30, pityHits: 0 };
    const result = pull(state, content, PORTAL, 1, constantRng(0.999));
    if (!result.ok) throw new Error(result.reason);
    expect(result.results[0]).toMatchObject({ rarity: 'void', pity: false });
    expect(result.state.portals[PORTAL]!.pity).toBe(0);
  });

  it('reads the pity threshold through summon.pityThreshold (scope: portal)', () => {
    const state = withSigils(10);
    state.portals[PORTAL] = { pity: 9, pulls: 9, pityHits: 0 };
    const tenPity: Modifier = {
      stat: 'summon.pityThreshold',
      kind: 'set',
      value: new Decimal(10),
      scope: { portal: PORTAL },
      source: { kind: 'skill', id: 'test' },
    };
    expect(portalInfo(state, content, PORTAL, [tenPity])!.pity.threshold).toBe(10);
    const result = pull(state, content, PORTAL, 1, constantRng(0), [tenPity]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.results[0]!.pity).toBe(true);
  });

  it('gives the reveal orb colour: the rarity, or one lower for an upgrade flash', () => {
    // rng 0: every flash roll succeeds; commons cannot go lower.
    const ten = pull(withSigils(100), content, PORTAL, 10, constantRng(0));
    if (!ten.ok) throw new Error(ten.reason);
    // The ladder has an Uncommon step now, so a Rare is revealed from an Uncommon orb.
    expect(ten.results[0]!.orb).toBe('common');
    expect(ten.results[9]!.rarity).toBe('rare');
    expect(ten.results[9]!.orb).toBe('uncommon');
    // rng 0.999: no flash.
    const top = pull(withSigils(10), content, PORTAL, 1, constantRng(0.999));
    if (!top.ok) throw new Error(top.reason);
    expect(top.results[0]!.orb).toBe(top.results[0]!.rarity);
  });
});

describe('Card Portal replaces the boss card drop (DESIGN.md §5)', () => {
  it('boss kills no longer drop cards', () => {
    const state = freshState();
    const { state: after, report } = advance(state, withDps(1e6, content), 60_000, constantRng(0));
    expect(report.bossKills).toBeGreaterThan(0);
    expect(report.cardDrops).toEqual([]);
    expect(Object.keys(after.cards.owned).sort()).toEqual(Object.keys(state.cards.owned).sort());
  });
});

describe('saving pity (save format v9)', () => {
  it('round-trips pity counters per portal', () => {
    const state = freshState();
    state.portals[PORTAL] = { pity: 42, pulls: 120, pityHits: 1 };
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.portals[PORTAL]).toEqual({ pity: 42, pulls: 120, pityHits: 1 });
  });

  it('drops counters of portals that no longer exist', () => {
    const state = freshState();
    state.portals['gone'] = { pity: 3, pulls: 3, pityHits: 0 };
    expect(readSave(createSaveText(state, 1), content).state.portals['gone']).toBeUndefined();
  });

  it('migrates v8 -> v9 with no pulls made yet', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(9);
    expect(MIGRATIONS[8]!({ resources: {} })).toEqual({ resources: {}, portals: {} });
  });
});
