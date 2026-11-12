import { describe, expect, it } from 'vitest';
import {
  buyTreeLevel,
  buyTreeLevels,
  collectModifiers,
  Decimal,
  jobProductionPerSecond,
  previewTreeLevel,
  producerLevel,
  producerRate,
  resetProduction,
  tileStage,
  treeLevel,
  treeLevelCost,
  treeLevelMilestone,
  treeLevelOffer,
} from '../src/game';
import { content, freshState } from './helpers';

const oak = content.treeById.get('oak')!;

function rich() {
  const state = freshState();
  state.resources['money'] = new Decimal('1e40');
  return state;
}

describe('tree levels (DESIGN.md §4)', () => {
  it('gives every tree a Money level line like the mines', () => {
    for (const tree of content.trees) {
      expect(tree.level.cost.resource).toBe('money');
      expect(tree.level.ratePercent.gt(0)).toBe(true);
      expect(tree.level.milestones).toEqual({ every: 15, multiplier: new Decimal(2) });
    }
  });

  it('prices the next level on its exponential Money curve', () => {
    const state = freshState();
    expect(treeLevel(state, 'oak')).toBe(0);
    const first = treeLevelCost(state, content, 'oak')!;
    expect(first.resource).toBe('money');
    expect(first.amount.eq(oak.level.cost.base.ceil())).toBe(true);
    state.production.treeLevels['oak'] = 3;
    const fourth = treeLevelCost(state, content, 'oak')!;
    expect(fourth.amount.gt(first.amount)).toBe(true);
    expect(treeLevelCost(state, content, 'nope')).toBeNull();
  });

  it('adds ratePercent per level to the tree output', () => {
    const mods = collectModifiers(freshState(), content);
    const base = producerRate(oak, 'logging', mods, 0);
    const lv5 = producerRate(oak, 'logging', mods, 5);
    const factor = oak.level.ratePercent.mul(5).div(100).add(1);
    expect(lv5.eq(base.mul(factor))).toBe(true);
  });

  it('doubles the output at every 15th level', () => {
    const mods = collectModifiers(freshState(), content);
    const at24 = producerRate(oak, 'logging', mods, 14);
    const at25 = producerRate(oak, 'logging', mods, 15);
    const lin = (n: number) => oak.level.ratePercent.mul(n).div(100).add(1);
    expect(at24.eq(oak.baseRate.mul(lin(14)))).toBe(true);
    expect(at25.eq(oak.baseRate.mul(lin(15)).mul(2))).toBe(true);
  });

  it('feeds the level into the job output', () => {
    const state = freshState();
    state.production.treeLevels['oak'] = 10;
    const out = jobProductionPerSecond(state, content, 'logging')['oak_gem']!;
    const expected = producerRate(oak, 'logging', collectModifiers(state, content), 10);
    expect(out.eq(expected)).toBe(true);
    expect(producerLevel(state, 'logging', 'oak')).toBe(10);
    expect(producerLevel(state, 'mining', 'copper_quarry')).toBe(0);
  });

  it('buys one level and several, paying like one at a time', () => {
    const state = rich();
    const one = buyTreeLevel(state, content, 'oak');
    expect(one.ok && one.state.production.treeLevels['oak']).toBe(1);
    let step = state;
    for (let i = 0; i < 5; i++) {
      const r = buyTreeLevel(step, content, 'oak');
      if (!r.ok) throw new Error(r.reason);
      step = r.state;
    }
    const bulk = buyTreeLevels(state, content, 'oak', 5);
    expect(bulk.ok && bulk.state.resources['money']!.eq(step.resources['money']!)).toBe(true);
    expect(bulk.ok && bulk.bought).toBe(5);
  });

  it('refuses locked trees, unknown trees, bad counts and empty purses', () => {
    const state = rich();
    expect(buyTreeLevels(state, content, 'ironbark', 1)).toEqual({ ok: false, reason: 'locked' });
    expect(buyTreeLevels(state, content, 'nope', 1)).toEqual({ ok: false, reason: 'unknown' });
    expect(buyTreeLevels(state, content, 'oak', 0)).toEqual({ ok: false, reason: 'invalid-count' });
    const broke = freshState();
    broke.resources['money'] = new Decimal(0);
    expect(buyTreeLevels(broke, content, 'oak', 1)).toEqual({ ok: false, reason: 'unaffordable' });
    expect(treeLevelOffer(state, content, 'ironbark', 1)!.affordable).toBe(false);
    expect(treeLevelOffer(state, content, 'nope', 1)).toBeNull();
  });

  it('offers x1, x10, x100 and Max', () => {
    const state = freshState();
    state.resources['money'] = new Decimal(500);
    const max = treeLevelOffer(state, content, 'oak', 'max')!;
    expect(max.count).toBeGreaterThan(1);
    const bought = buyTreeLevels(state, content, 'oak', 'max');
    expect(bought.ok && bought.bought).toBe(max.count);
    expect(treeLevelOffer(state, content, 'oak', 10)!.count).toBe(10);
    expect(treeLevelOffer(state, content, 'oak', 100)!.count).toBe(100);
  });

  it('reports the milestones crossed as tree tier-ups', () => {
    const state = rich();
    const r = buyTreeLevels(state, content, 'oak', 15);
    expect(r.ok && r.tierUps).toEqual([
      { kind: 'tree_milestone', id: 'oak', from: 0, to: 1, metal: 'bronze' },
    ]);
  });

  it('previews the tree output before and after (Oak 4/s -> 5/s)', () => {
    const state = rich();
    const p = previewTreeLevel(state, content, 'oak', 5)!;
    const bought = buyTreeLevels(state, content, 'oak', 5);
    if (!bought.ok) throw new Error(bought.reason);
    expect(p.resource).toBe('oak_gem');
    expect(p.levels).toBe(5);
    expect(p.rateAfter.gt(p.rateBefore)).toBe(true);
    expect(
      p.rateAfter.eq(jobProductionPerSecond(bought.state, content, 'logging')['oak_gem']!),
    ).toBe(true);
    expect(previewTreeLevel(state, content, 'nope')).toBeNull();
  });

  it('shows the next milestone like the mines', () => {
    const state = freshState();
    state.production.treeLevels['oak'] = 20;
    const info = treeLevelMilestone(state, content, 'oak')!;
    expect(info.reached).toBe(1);
    expect(info.nextLevel).toBe(30);
    expect(treeLevelMilestone(state, content, 'nope')).toBeNull();
  });

  it('grows the tree tile one stage per milestone and resets with the run', () => {
    const state = freshState();
    expect(tileStage(state, content, 'logging', 'oak')).toBe(0);
    state.production.treeLevels['oak'] = 30;
    expect(tileStage(state, content, 'logging', 'oak')).toBe(2);
    expect(tileStage(state, content, 'logging', 'ironbark')).toBe(0);
    const after = resetProduction(state);
    expect(after.production.treeLevels).toEqual({});
    expect(tileStage(after, content, 'logging', 'oak')).toBe(0);
  });
});
