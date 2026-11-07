import { describe, expect, it } from 'vitest';
import type { ModifierData } from '../src/data';
import {
  advance,
  assignPlot,
  buyExpansion,
  buyMineLevel,
  canAfford,
  clearDungeon,
  curvePrice,
  Decimal,
  expansionCost,
  isProducerUnlocked,
  mineLevelCost,
  plotCapacity,
  plots,
  producerCounts,
  producerRate,
  productionPerSecond,
  resetProduction,
  treeUnlockCost,
  unlockTree,
  unlockedProducers,
  type GameState,
  type Modifier,
  type ProductionResult,
} from '../src/game';
import { constantRng, bareState, content, freshState } from './helpers';

const mod = (
  stat: ModifierData['stat'],
  kind: ModifierData['kind'],
  value: string,
  scope?: ModifierData['scope'],
): Modifier => ({
  stat,
  kind,
  value: new Decimal(value),
  ...(scope ? { scope } : {}),
  source: { kind: 'skill', id: 'test' },
});

function give(state: GameState, resource: string, amount: number | string): GameState {
  return { ...state, resources: { ...state.resources, [resource]: new Decimal(amount) } };
}

function ok(result: ProductionResult): GameState {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result.state;
}

const reason = (result: ProductionResult): string | undefined =>
  result.ok ? undefined : result.reason;

describe('a new game', () => {
  it('starts with one Oak plot and one Copper Quarry slot', () => {
    const state = freshState();
    expect(plots(state, content, 'logging')).toEqual(['oak']);
    expect(plots(state, content, 'mining')).toEqual(['copper_quarry']);
    expect(producerCounts(state, content)).toEqual({ oak: 1, copper_quarry: 1 });
  });

  it('has only the start tree kind and mine type unlocked', () => {
    const state = freshState();
    expect(unlockedProducers(state, content, 'logging').map((p) => p.id)).toEqual(['oak']);
    expect(unlockedProducers(state, content, 'mining').map((p) => p.id)).toEqual(['copper_quarry']);
    expect(isProducerUnlocked(state, content, 'logging', 'copper_quarry')).toBe(false);
  });

  it('produces Oak Gem and Copper Gem per second', () => {
    const rates = productionPerSecond(freshState(), content);
    expect(rates['oak_gem']!.eq(1)).toBe(true);
    expect(rates['copper_gem']!.eq(0.5)).toBe(true);
  });
});

describe('plot and slot expansions', () => {
  it('cost base * growth^owned in the job tier-1 resource, rounded up', () => {
    const state = freshState();
    expect(expansionCost(state, content, 'logging')).toEqual({
      resource: 'oak_gem',
      amount: new Decimal(25),
    });
    state.production.logging.expansions = 3;
    const { base, growth } = content.production.logging.expansion;
    const third = Math.ceil(base.toNumber() * growth.toNumber() ** 3); // base * growth^3, rounded up
    expect(expansionCost(state, content, 'logging').amount.eq(third)).toBe(true);
    expect(expansionCost(freshState(), content, 'mining').resource).toBe('copper_gem');
  });

  it('adds an empty plot and spends the price', () => {
    const state = ok(buyExpansion(give(freshState(), 'oak_gem', 30), content, 'logging'));
    expect(state.resources['oak_gem']!.eq(5)).toBe(true);
    expect(plotCapacity(state, content, 'logging')).toBe(2);
    expect(plots(state, content, 'logging')).toEqual(['oak', null]);
    const { base, growth } = content.production.logging.expansion;
    const second = Math.ceil(base.toNumber() * growth.toNumber());
    expect(expansionCost(state, content, 'logging').amount.eq(second)).toBe(true);
  });

  it('refuses when unaffordable and leaves the state alone', () => {
    const start = give(freshState(), 'oak_gem', 24);
    expect(reason(buyExpansion(start, content, 'logging'))).toBe('unaffordable');
    expect(start.production.logging.expansions).toBe(0);
  });

  it('reads cost.growth, cost.multiplier and production.capacity modifiers', () => {
    const state = freshState();
    state.production.mining.expansions = 2;
    const mods = [
      mod('cost.growth', 'set', '1'),
      mod('cost.multiplier', 'mult', '0.5', { job: 'mining' }),
      mod('production.capacity', 'flat', '2', { job: 'mining' }),
    ];
    expect(expansionCost(state, content, 'mining', mods).amount.eq(13)).toBe(true); // 25*0.5 -> 13
    expect(expansionCost(state, content, 'logging', mods).amount.eq(25)).toBe(true); // 25 * 1^2
    expect(plotCapacity(state, content, 'mining', mods)).toBe(5);
    expect(plotCapacity(state, content, 'logging', mods)).toBe(1);
  });

  it('never prices below zero or grows below 1', () => {
    const mods = [mod('cost.growth', 'set', '0.1'), mod('cost.multiplier', 'set', '-3')];
    const state = freshState();
    state.production.logging.expansions = 4;
    expect(expansionCost(state, content, 'logging', mods).amount.eq(0)).toBe(true);
    expect(
      expansionCost(state, content, 'logging', [mod('cost.growth', 'set', '0.1')]).amount.eq(25),
    ).toBe(true);
  });
});

describe('assigning plots', () => {
  it('is free and can empty a plot', () => {
    const start = give(freshState(), 'oak_gem', 7);
    const emptied = ok(assignPlot(start, content, 'logging', 0, null));
    expect(plots(emptied, content, 'logging')).toEqual([null]);
    expect(emptied.resources['oak_gem']!.eq(7)).toBe(true);
    const back = ok(assignPlot(emptied, content, 'logging', 0, 'oak'));
    expect(plots(back, content, 'logging')).toEqual(['oak']);
  });

  it('only accepts unlocked producers of the same job within the capacity', () => {
    const state = freshState();
    expect(reason(assignPlot(state, content, 'logging', 0, 'ironbark'))).toBe('locked');
    expect(reason(assignPlot(state, content, 'logging', 0, 'copper_quarry'))).toBe('unknown');
    expect(reason(assignPlot(state, content, 'mining', 0, 'iron_deeps'))).toBe('locked');
    expect(reason(assignPlot(state, content, 'logging', 1, 'oak'))).toBe('invalid-plot');
    expect(reason(assignPlot(state, content, 'logging', -1, 'oak'))).toBe('invalid-plot');
    expect(reason(assignPlot(state, content, 'logging', 0.5, 'oak'))).toBe('invalid-plot');
  });

  it('fills a plot granted by a capacity modifier', () => {
    const mods = [mod('production.capacity', 'flat', '2')];
    const state = ok(assignPlot(freshState(), content, 'logging', 2, 'oak', mods));
    expect(plots(state, content, 'logging', mods)).toEqual(['oak', null, 'oak']);
    // Without the modifier those plots are idle and produce nothing.
    expect(producerCounts(state, content)['oak']).toBe(1);
  });

  it('does not mutate the previous state', () => {
    const start = freshState();
    ok(assignPlot(start, content, 'logging', 0, null));
    expect(start.production.logging.plots).toEqual(['oak']);
  });
});

describe('tree kinds', () => {
  it('unlock with wood of the tier below and are kept', () => {
    expect(treeUnlockCost(content, 'ironbark')).toEqual([
      { resource: 'oak_gem', amount: new Decimal(500) },
    ]);
    expect(treeUnlockCost(content, 'moonwillow')[0]!.resource).toBe('ironbark_gem');
    expect(treeUnlockCost(content, 'oak')).toEqual([]);

    const state = ok(unlockTree(give(freshState(), 'oak_gem', 600), content, 'ironbark'));
    expect(state.resources['oak_gem']!.eq(100)).toBe(true);
    expect(isProducerUnlocked(state, content, 'logging', 'ironbark')).toBe(true);
    const planted = ok(assignPlot(state, content, 'logging', 0, 'ironbark'));
    expect(productionPerSecond(planted, content)['ironbark_gem']!.eq(0.5)).toBe(true);
  });

  it('refuses unknown, already unlocked and unaffordable trees', () => {
    const rich = give(freshState(), 'oak_gem', '1e9');
    expect(reason(unlockTree(rich, content, 'nope'))).toBe('unknown');
    expect(reason(unlockTree(rich, content, 'oak'))).toBe('already-unlocked');
    expect(reason(unlockTree(rich, content, 'moonwillow'))).toBe('unaffordable');
    const once = ok(unlockTree(rich, content, 'ironbark'));
    expect(reason(unlockTree(once, content, 'ironbark'))).toBe('already-unlocked');
  });

  it('apply cost.multiplier scoped to the producer', () => {
    const mods = [mod('cost.multiplier', 'percent', '-50', { producer: 'ironbark' })];
    expect(treeUnlockCost(content, 'ironbark', mods)[0]!.amount.eq(250)).toBe(true);
    expect(treeUnlockCost(content, 'moonwillow', mods)[0]!.amount.eq(2000)).toBe(true);
  });
});

describe('mine types and levels', () => {
  it('unlock when their dungeon is cleared', () => {
    const first = clearDungeon(freshState(), content, 'mossy_cellar');
    expect(first.unlockedMines).toEqual(['iron_deeps']);
    expect(first.state.clearedDungeons).toEqual(['mossy_cellar']);
    expect(isProducerUnlocked(first.state, content, 'mining', 'iron_deeps')).toBe(true);
    expect(isProducerUnlocked(first.state, content, 'mining', 'crystal_grotto')).toBe(false);

    const again = clearDungeon(first.state, content, 'mossy_cellar');
    expect(again.unlockedMines).toEqual([]);
    expect(again.state).toBe(first.state);
    expect(clearDungeon(freshState(), content, 'nope').unlockedMines).toEqual([]);
    expect(clearDungeon(freshState(), content, 'frostspire_vault').unlockedMines).toEqual([]);
    expect(clearDungeon(freshState(), content, 'ember_crypt').unlockedMines).toEqual([
      'crystal_grotto',
    ]);
  });

  it('level up with their own ore and raise that mine only', () => {
    let state = give(freshState(), 'copper_gem', 100);
    expect(mineLevelCost(state, content, 'copper_quarry')).toEqual({
      resource: 'copper_gem',
      amount: new Decimal(15),
    });
    state = ok(buyMineLevel(state, content, 'copper_quarry'));
    state = ok(buyMineLevel(state, content, 'copper_quarry')); // 15 + ceil(15 * growth)
    const growth = content.mineById.get('copper_quarry')!.level.cost.growth.toNumber();
    expect(state.resources['copper_gem']!.eq(100 - 15 - Math.ceil(15 * growth))).toBe(true);
    expect(state.production.mineLevels['copper_quarry']).toBe(2);
    // 0.5 * (1 + 2 * 10%) = 0.6
    expect(productionPerSecond(state, content)['copper_gem']!.eq(0.6)).toBe(true);
    expect(mineLevelCost(state, content, 'iron_deeps')!.resource).toBe('iron_gem');
  });

  it('refuse locked, unknown and unaffordable levels', () => {
    const rich = give(give(freshState(), 'iron_gem', '1e9'), 'copper_gem', 0);
    expect(reason(buyMineLevel(rich, content, 'iron_deeps'))).toBe('locked');
    expect(reason(buyMineLevel(rich, content, 'nope'))).toBe('unknown');
    expect(reason(buyMineLevel(rich, content, 'copper_quarry'))).toBe('unaffordable');
  });

  it('read production.levelBonus before production.rate', () => {
    const mine = content.mineById.get('copper_quarry')!;
    const mods = [
      mod('production.levelBonus', 'flat', '10', { producer: 'copper_quarry' }), // 20% a level
      mod('production.rate', 'mult', '2'),
    ];
    // 0.5 * (1 + 3 * 20%) * 2 = 1.6
    expect(producerRate(mine, 'mining', mods, 3).eq(1.6)).toBe(true);
    expect(producerRate(mine, 'mining', [], 0).eq(0.5)).toBe(true);
  });
});

describe('production in the tick', () => {
  it('counts every active plot and ignores empty ones', () => {
    let state = give(bareState(), 'oak_gem', 25);
    state = ok(buyExpansion(state, content, 'logging'));
    let { state: after } = advance(state, content, 10_000, constantRng(0.5));
    expect(after.resources['oak_gem']!.eq(10)).toBe(true); // one Oak plot, one empty

    state = ok(assignPlot(state, content, 'logging', 1, 'oak'));
    ({ state: after } = advance(state, content, 10_000, constantRng(0.5)));
    expect(after.resources['oak_gem']!.eq(20)).toBe(true);
  });
});

describe('canAfford', () => {
  it('checks every price', () => {
    const state = give(give(freshState(), 'oak_gem', 10), 'copper_gem', 5);
    const prices = [
      { resource: 'oak_gem', amount: new Decimal(10) },
      { resource: 'copper_gem', amount: new Decimal(6) },
    ];
    expect(canAfford(state, prices.slice(0, 1))).toBe(true);
    expect(canAfford(state, prices)).toBe(false);
  });
});

describe('prestige reset', () => {
  it('resets plots, slots and mine levels but keeps unlocked trees and cleared dungeons', () => {
    let state = give(give(freshState(), 'oak_gem', '1e6'), 'copper_gem', '1e6');
    state = ok(unlockTree(state, content, 'ironbark'));
    state = ok(buyExpansion(state, content, 'logging'));
    state = ok(assignPlot(state, content, 'logging', 1, 'ironbark'));
    state = ok(buyMineLevel(state, content, 'copper_quarry'));
    state = clearDungeon(state, content, 'mossy_cellar').state;

    const reset = resetProduction(state, content);
    expect(reset.production.logging).toEqual({ expansions: 0, plots: ['oak'] });
    expect(reset.production.mining).toEqual({ expansions: 0, plots: ['copper_quarry'] });
    expect(reset.production.mineLevels).toEqual({});
    expect(reset.production.unlockedTrees).toEqual(['ironbark']);
    expect(reset.clearedDungeons).toEqual(['mossy_cellar']);
    expect(isProducerUnlocked(reset, content, 'mining', 'iron_deeps')).toBe(true);
    expect(state.production.logging.expansions).toBe(1); // input untouched
  });
});

describe('curve prices', () => {
  it('rounds float noise away before rounding up (10 x 2^5 costs 320, not 321)', () => {
    const curve = { resource: 'copper_gem', base: new Decimal(10), growth: new Decimal(2) };
    expect(curvePrice(curve, 3, []).amount.toNumber()).toBe(80);
    expect(curvePrice(curve, 5, []).amount.toNumber()).toBe(320);
    const odd = { ...curve, growth: new Decimal(1.15) };
    expect(curvePrice(odd, 1, []).amount.toNumber()).toBe(12); // 11.5 still rounds up
  });
});
