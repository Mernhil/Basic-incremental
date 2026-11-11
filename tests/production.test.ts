import { describe, expect, it } from 'vitest';
import type { ModifierData } from '../src/data';
import {
  advance,
  buyMineLevel,
  buyTreeLevel,
  canAfford,
  clearDungeon,
  collectModifiers,
  curvePrice,
  Decimal,
  isProducerUnlocked,
  mineLevelCost,
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

  it('has no plots, slots or expansions in the state', () => {
    expect(Object.keys(freshState().production).sort()).toEqual([
      'depth',
      'forge',
      'harvestGauges',
      'mineLevels',
      'tools',
      'treeLevels',
      'unlockedTrees',
      'workers',
    ]);
  });
});

describe('one of each (DESIGN.md §4)', () => {
  it('an unlocked tree kind produces at once, with nothing to place', () => {
    const state = ok(unlockTree(give(freshState(), 'oak_gem', 600), content, 'ironbark'));
    const rates = productionPerSecond(state, content);
    expect(rates['ironbark_gem']!.eq(0.5)).toBe(true);
    expect(rates['oak_gem']!.eq(1)).toBe(true); // oak still counts once
  });

  it('a locked tree kind or mine type produces nothing', () => {
    const rates = productionPerSecond(freshState(), content);
    expect(rates['ironbark_gem']).toBeUndefined();
    expect(rates['iron_gem']).toBeUndefined();
  });

  it('a mine type produces once its dungeon is cleared', () => {
    const state = clearDungeon(freshState(), content, 'mossy_cellar').state;
    const mine = content.mineById.get('iron_deeps')!;
    const rates = productionPerSecond(state, content);
    expect(
      rates[mine.resource]!.eq(producerRate(mine, 'mining', collectModifiers(state, content))),
    ).toBe(true);
    expect(rates[mine.resource]!.gt(0)).toBe(true);
  });

  it('each kind yields once, at its own level', () => {
    let state = ok(unlockTree(give(freshState(), 'oak_gem', 600), content, 'ironbark'));
    state = give(state, 'money', '1e9');
    state = ok(buyTreeLevel(state, content, 'ironbark'));
    state = ok(buyTreeLevel(state, content, 'ironbark'));
    const mods = collectModifiers(state, content);
    const ironbark = content.treeById.get('ironbark')!;
    const oak = content.treeById.get('oak')!;
    const rates = productionPerSecond(state, content);
    expect(rates['ironbark_gem']!.eq(producerRate(ironbark, 'logging', mods, 2))).toBe(true);
    expect(rates['oak_gem']!.eq(producerRate(oak, 'logging', mods, 0))).toBe(true);
    expect(rates['ironbark_gem']!.gt(producerRate(ironbark, 'logging', mods, 0))).toBe(true);
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
    expect(productionPerSecond(state, content)['ironbark_gem']!.eq(0.5)).toBe(true);
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

  it('level up with Money and raise that mine only', () => {
    const quarry = content.mineById.get('copper_quarry')!.level.cost;
    const base = quarry.base.toNumber();
    let state = give(freshState(), 'money', base * 10);
    expect(mineLevelCost(state, content, 'copper_quarry')).toEqual({
      resource: 'money',
      amount: new Decimal(base),
    });
    state = ok(buyMineLevel(state, content, 'copper_quarry'));
    state = ok(buyMineLevel(state, content, 'copper_quarry')); // base + ceil(base * growth)
    const growth = quarry.growth.toNumber();
    expect(state.resources['money']!.eq(base * 10 - base - Math.ceil(base * growth))).toBe(true);
    expect(state.production.mineLevels['copper_quarry']).toBe(2);
    // 0.5 * (1 + 2 * 10%) = 0.6
    expect(productionPerSecond(state, content)['copper_gem']!.eq(0.6)).toBe(true);
    expect(mineLevelCost(state, content, 'iron_deeps')!.resource).toBe('money');
  });

  it('refuse locked, unknown and unaffordable levels', () => {
    const rich = give(freshState(), 'money', '1e9');
    expect(reason(buyMineLevel(rich, content, 'iron_deeps'))).toBe('locked');
    expect(reason(buyMineLevel(rich, content, 'nope'))).toBe('unknown');
    expect(reason(buyMineLevel(give(freshState(), 'money', 0), content, 'copper_quarry'))).toBe(
      'unaffordable',
    );
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
  it('every unlocked kind yields its rate per second, once', () => {
    let state = ok(unlockTree(give(bareState(), 'oak_gem', 600), content, 'ironbark'));
    state = clearDungeon(state, content, 'mossy_cellar').state;
    const { state: after } = advance(state, content, 10_000, constantRng(0.5));
    expect(after.resources['oak_gem']!.sub(100).eq(10)).toBe(true); // 600 held - 500 to unlock Ironbark
    expect(after.resources['ironbark_gem']!.eq(5)).toBe(true);
    expect(after.resources['copper_gem']!.eq(5)).toBe(true);
    expect(after.resources[content.mineById.get('iron_deeps')!.resource]!.gt(0)).toBe(true);
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
  it('resets mine and tree levels but keeps unlocked trees and cleared dungeons', () => {
    let state = give(give(freshState(), 'oak_gem', '1e6'), 'money', '1e6');
    state = ok(unlockTree(state, content, 'ironbark'));
    state = ok(buyMineLevel(state, content, 'copper_quarry'));
    state = ok(buyTreeLevel(state, content, 'oak'));
    state = clearDungeon(state, content, 'mossy_cellar').state;

    const reset = resetProduction(state);
    expect(reset.production.mineLevels).toEqual({});
    expect(reset.production.treeLevels).toEqual({});
    expect(reset.production.unlockedTrees).toEqual(['ironbark']);
    expect(reset.clearedDungeons).toEqual(['mossy_cellar']);
    expect(isProducerUnlocked(reset, content, 'mining', 'iron_deeps')).toBe(true);
    expect(state.production.mineLevels['copper_quarry']).toBe(1); // input untouched
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
