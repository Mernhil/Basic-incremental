import { describe, expect, it } from 'vitest';
import {
  buyDamageLevels,
  buyDamageUpgrade,
  buyExpansion,
  buyExpansions,
  buyMineLevel,
  buyMineLevels,
  curveBulkPrice,
  curveMaxAffordable,
  curveOffer,
  curvePrice,
  damageLineOffer,
  Decimal,
  expansionOffer,
  MAX_BULK_LEVELS,
  mineLevelOffer,
  type GameState,
  type Modifier,
} from '../src/game';
import { content, freshState } from './helpers';

const curve = { resource: 'copper_gem', base: new Decimal(10), growth: new Decimal(2) };
const discount: Modifier = {
  stat: 'cost.multiplier',
  kind: 'mult',
  value: new Decimal(0.5),
  source: { kind: 'skill', id: 'x' },
};

function rich(resource: string, amount: number, state = freshState()): GameState {
  state.resources[resource] = new Decimal(amount);
  return state;
}

/** Buys one level at a time `n` times, the reference for every bulk buy. */
function oneByOne(
  state: GameState,
  n: number,
  buy: (s: GameState) => { ok: true; state: GameState } | { ok: false },
): GameState {
  let s = state;
  for (let i = 0; i < n; i++) {
    const r = buy(s);
    if (!r.ok) throw new Error(`single buy ${i} failed`);
    s = r.state;
  }
  return s;
}

describe('bulk prices on exponential curves', () => {
  it('sums the next N single prices from the owned count', () => {
    // 10*2^3 + 10*2^4 + 10*2^5 = 80 + 160 + 320
    expect(curveBulkPrice(curve, 3, 3).amount.toNumber()).toBe(560);
    expect(curveBulkPrice(curve, 3, 0).amount.toNumber()).toBe(0);
    expect(curveBulkPrice(curve, 0, 1).amount.eq(curvePrice(curve, 0, []).amount)).toBe(true);
  });

  it('applies cost modifiers per level, like single buys', () => {
    let sum = new Decimal(0);
    for (let i = 0; i < 5; i++) sum = sum.add(curvePrice(curve, 2 + i, [discount]).amount);
    expect(curveBulkPrice(curve, 2, 5, [discount]).amount.eq(sum)).toBe(true);
  });

  it('finds the most levels a budget affords', () => {
    // From 0: 10, 20, 40, 80 -> 150 for four; 310 for five.
    expect(curveMaxAffordable(curve, 0, new Decimal(149)).count).toBe(3);
    expect(curveMaxAffordable(curve, 0, new Decimal(150)).count).toBe(4);
    expect(curveMaxAffordable(curve, 0, new Decimal(150)).price.amount.toNumber()).toBe(150);
    expect(curveMaxAffordable(curve, 0, new Decimal(9)).count).toBe(0);
  });

  it('stops at the safety cap on a flat curve with a huge budget', () => {
    const flat = { ...curve, growth: new Decimal(1) };
    expect(curveMaxAffordable(flat, 0, new Decimal('1e300')).count).toBe(MAX_BULK_LEVELS);
  });
});

describe('buy offers (x1 / x10 / x100 / Max)', () => {
  it('xN is affordable only when all N levels are, with progress budget / price', () => {
    const offer = curveOffer(curve, 0, 3, new Decimal(35))!; // 10 + 20 + 40 = 70
    expect(offer.count).toBe(3);
    expect(offer.price.amount.toNumber()).toBe(70);
    expect(offer.affordable).toBe(false);
    expect(offer.progress).toBeCloseTo(0.5);
    const can = curveOffer(curve, 0, 3, new Decimal(100))!;
    expect(can.affordable).toBe(true);
    expect(can.progress).toBe(1);
  });

  it('Max buys as many as affordable, its bar filling toward one more level', () => {
    const offer = curveOffer(curve, 0, 'max', new Decimal(50))!; // 10 + 20 = 30, then 40
    expect(offer.count).toBe(2);
    expect(offer.price.amount.toNumber()).toBe(30);
    expect(offer.affordable).toBe(true);
    expect(offer.progress).toBeCloseTo(20 / 40);
  });

  it('Max with nothing affordable shows the next single level', () => {
    const offer = curveOffer(curve, 1, 'max', new Decimal(5))!; // next level costs 20
    expect(offer.count).toBe(1);
    expect(offer.price.amount.toNumber()).toBe(20);
    expect(offer.affordable).toBe(false);
    expect(offer.progress).toBeCloseTo(0.25);
  });

  it('rejects counts that are not whole, positive and within the cap', () => {
    expect(curveOffer(curve, 0, 0, new Decimal(1))).toBeNull();
    expect(curveOffer(curve, 0, 2.5, new Decimal(1))).toBeNull();
    expect(curveOffer(curve, 0, MAX_BULK_LEVELS + 1, new Decimal(1))).toBeNull();
  });
});

describe('bulk buys for damage lines, mine levels and expansions', () => {
  it('buys exactly N damage levels for the same price as N single buys', () => {
    const start = rich('money', 1e6);
    const bulk = buyDamageLevels(start, content, 'copper_edge', 10);
    if (!bulk.ok) throw new Error(bulk.reason);
    expect(bulk.bought).toBe(10);
    const ref = oneByOne(start, 10, (s) => buyDamageUpgrade(s, content, 'copper_edge'));
    expect(bulk.state.combat.damageLevels['copper_edge']).toBe(10);
    expect(bulk.state.resources['money']!.eq(ref.resources['money']!)).toBe(true);
    expect(start.combat.damageLevels['copper_edge']).toBeUndefined(); // input untouched
  });

  it('fails an xN buy that is not fully affordable, without buying part of it', () => {
    const start = rich('money', 15); // one level costs 10, two cost 10 + 11.5 -> 22
    const r = buyDamageLevels(start, content, 'copper_edge', 2);
    expect(r).toEqual({ ok: false, reason: 'unaffordable' });
  });

  it('Max buys every affordable damage level and fails when none is', () => {
    const start = rich('money', 1000);
    const offer = damageLineOffer(start, content, 'copper_edge', 'max')!;
    const r = buyDamageLevels(start, content, 'copper_edge', 'max');
    if (!r.ok) throw new Error(r.reason);
    expect(r.bought).toBe(offer.count);
    expect(r.bought).toBeGreaterThan(1);
    expect(r.state.resources['money']!.eq(new Decimal(1000).sub(offer.price.amount))).toBe(true);
    expect(buyDamageLevels(rich('money', 0), content, 'copper_edge', 'max')).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
    expect(buyDamageLevels(start, content, 'nope', 1)).toEqual({ ok: false, reason: 'unknown' });
    expect(buyDamageLevels(start, content, 'copper_edge', 0)).toEqual({
      ok: false,
      reason: 'invalid-count',
    });
  });

  it('buys mine levels in bulk, only for unlocked mines', () => {
    const start = rich('money', 1e6);
    const r = buyMineLevels(start, content, 'copper_quarry', 5);
    if (!r.ok) throw new Error(r.reason);
    const ref = oneByOne(start, 5, (s) => buyMineLevel(s, content, 'copper_quarry'));
    expect(r.state.production.mineLevels['copper_quarry']).toBe(5);
    expect(r.state.resources['money']!.eq(ref.resources['money']!)).toBe(true);
    const iron = rich('money', 1e6);
    expect(buyMineLevels(iron, content, 'iron_deeps', 1)).toEqual({ ok: false, reason: 'locked' });
    expect(mineLevelOffer(iron, content, 'iron_deeps', 1)!.affordable).toBe(false);
    expect(mineLevelOffer(iron, content, 'nope', 1)).toBeNull();
  });

  it('buys plots and slots in bulk', () => {
    const start = rich('money', 1e6);
    const r = buyExpansions(start, content, 'logging', 'max');
    if (!r.ok) throw new Error(r.reason);
    const ref = oneByOne(start, r.bought, (s) => buyExpansion(s, content, 'logging'));
    expect(r.state.production.logging.expansions).toBe(r.bought);
    expect(r.state.resources['money']!.eq(ref.resources['money']!)).toBe(true);
    const offer = expansionOffer(rich('money', 0), content, 'mining', 1);
    expect(offer!.price.resource).toBe('money');
    expect(offer!.affordable).toBe(false);
    expect(offer!.progress).toBe(0);
  });
});
