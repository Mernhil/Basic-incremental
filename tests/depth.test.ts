import { describe, expect, it } from 'vitest';
import type { Content } from '../src/data';
import {
  advance,
  advanceChunked,
  depthDue,
  depthInfo,
  depthYield,
  deserializeState,
  serializeState,
  Decimal,
  layerHardness,
  newOwnedCard,
  resetProduction,
  settleDepth,
  workSites,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content as pinned } from './helpers';

/**
 * Depth and growth (DESIGN.md §4): a layer's hardness is broken by the worker's digging, the next
 * layer multiplies the yield, no worker means no digging, the layer settles on the 1 s grid so any
 * split of time gives the same totals, and an Ascension resets it.
 */
const rng = constantRng(0.5);

/** The pinned content with Oak's depth set: layer 1 has `hardness`, then ×2 harder, ×3 yield. */
function withOakDepth(hardness: string, layers = 4): Content {
  const names = Array.from({ length: layers }, (_, i) => `L${i + 1}`);
  const oak = {
    ...pinned.treeById.get('oak')!,
    depth: {
      names,
      hardness: new Decimal(hardness),
      hardnessGrowth: new Decimal(2),
      yieldGrowth: new Decimal(3),
      digRate: new Decimal(1),
    },
  };
  const trees = pinned.trees.map((t) => (t.id === 'oak' ? oak : t));
  return { ...pinned, trees, treeById: new Map(trees.map((t) => [t.id, t])) };
}

const worked = (): GameState => {
  const state = bareState();
  state.cards.owned['apprentice_feller'] = newOwnedCard();
  state.production.workers = { oak: ['apprentice_feller'] };
  return state;
};
const oakGems = (s: GameState): number => s.resources['oak_gem']!.toNumber();

describe('depth data', () => {
  it('every tree and mine has layers with a rising hardness and yield', () => {
    for (const p of [...pinned.trees, ...pinned.mines]) {
      expect(p.depth.names.length, p.id).toBeGreaterThanOrEqual(2);
      expect(layerHardness(p.depth, 2).gt(layerHardness(p.depth, 1)), p.id).toBe(true);
    }
  });
});

describe('digging', () => {
  it('a worker breaks the layer’s hardness; no worker means no digging', () => {
    const c = withOakDepth('100');
    const dug = advance(worked(), c, 10_000, rng).state;
    expect(dug.production.depth['oak']!.progress.toNumber()).toBeCloseTo(10, 0);
    const idle = advance(bareState(), c, 10_000, rng).state;
    expect(idle.production.depth['oak']).toBeUndefined();
  });

  it('a stronger worker digs faster, by its power', () => {
    const c = withOakDepth('100');
    const strong = worked();
    strong.cards.owned['apprentice_feller']!.stars = 3;
    const power = workSites(strong, c, 'logging')[0]!.dig.toNumber();
    expect(power).toBeGreaterThan(workSites(worked(), c, 'logging')[0]!.dig.toNumber() - 1e-9);
  });

  it('breaking a layer moves down and multiplies the yield from then on', () => {
    const c = withOakDepth('20');
    const state = advance(worked(), c, 25_000, rng).state;
    const info = depthInfo(state, c, 'oak')!;
    expect(info.layer).toBe(2);
    expect(info.progress.toNumber()).toBeGreaterThan(4);
    expect(info.progress.toNumber()).toBeLessThan(7);
    expect(depthYield(state, c, 'oak').toNumber()).toBe(3);
    const before = oakGems(state);
    const later = advance(state, c, 1_000, rng).state;
    const rate = workSites(state, c, 'logging')[0]!.rate.toNumber();
    expect(oakGems(later) - before).toBeCloseTo(rate, 1);
    expect(rate / pinned.treeById.get('oak')!.baseRate.toNumber()).toBeGreaterThan(2.9);
  });

  it('the deepest layer is never broken and keeps no progress', () => {
    const c = withOakDepth('1', 2);
    const state = advance(worked(), c, 600_000, rng).state;
    const info = depthInfo(state, c, 'oak')!;
    expect(info.layer).toBe(2);
    expect(info.atMax).toBe(true);
    expect(info.progress.toNumber()).toBe(0);
    expect(depthDue(state, c)).toBe(false);
  });

  it('settleDepth carries leftover progress through several layers', () => {
    const c = withOakDepth('10');
    const state = worked();
    state.production.depth['oak'] = { layer: 1, progress: new Decimal(75) };
    expect(depthDue(state, c)).toBe(true);
    expect(settleDepth(state, c)).toEqual({ oak: 4 });
    // 10 + 20 + 40 broken, 5 left, and the 4th is the deepest of 4
    expect(state.production.depth['oak']!.layer).toBe(4);
  });

  it('gives the same totals however time is split, across layer breaks', () => {
    const c = withOakDepth('20');
    const whole = advance(worked(), c, 90_000, rng).state;
    const chunked = advanceChunked(worked(), c, 90_000, rng, 700).state;
    const minute = advanceChunked(worked(), c, 90_000, rng, 60_000).state;
    expect(depthInfo(chunked, c, 'oak')!.layer).toBe(depthInfo(whole, c, 'oak')!.layer);
    expect(oakGems(chunked)).toBeCloseTo(oakGems(whole), 3);
    expect(oakGems(minute)).toBeCloseTo(oakGems(whole), 3);
  });

  it('is reset by an Ascension', () => {
    const c = withOakDepth('20');
    const state = advance(worked(), c, 25_000, rng).state;
    expect(depthInfo(state, c, 'oak')!.layer).toBe(2);
    expect(depthInfo(resetProduction(state), c, 'oak')!.layer).toBe(1);
  });
});

describe('depth in a save', () => {
  it('survives a round trip, and a layer past the deepest comes back to the deepest', () => {
    const state = worked();
    state.production.depth['oak'] = { layer: 3, progress: new Decimal(12.5) };
    state.production.tools = { logging_yield: 4, gone_line: 9 };
    const copy = deserializeState(serializeState(state), pinned);
    expect(copy.production.depth['oak']!.layer).toBe(3);
    expect(copy.production.depth['oak']!.progress.toNumber()).toBe(12.5);
    expect(copy.production.tools).toEqual({ logging_yield: 4 });
    const deep = worked();
    deep.production.depth['oak'] = { layer: 999, progress: new Decimal(1) };
    const names = pinned.treeById.get('oak')!.depth.names.length;
    expect(deserializeState(serializeState(deep), pinned).production.depth['oak']!.layer).toBe(
      names,
    );
  });
});
