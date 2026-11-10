import { describe, expect, it } from 'vitest';
import {
  Decimal,
  incomePerSecond,
  outputGainMultiplier,
  previewTreeLevel,
  timeToAfford,
  treeLevelCost,
} from '../src/game';
import { content, freshState } from './helpers';

describe('timeToAfford (Production "Next buy")', () => {
  it('is 0 when the price is already affordable', () => {
    const s = freshState();
    s.resources['oak_gem'] = new Decimal(1000);
    expect(timeToAfford(s, content, { resource: 'oak_gem', amount: new Decimal(10) })).toBe(0);
  });

  it('is null when the resource has no income', () => {
    const s = freshState();
    expect(
      timeToAfford(s, content, { resource: 'no_such_gem', amount: new Decimal(10) }),
    ).toBeNull();
  });

  it('is the missing amount over the income per second', () => {
    const s = freshState();
    const income = incomePerSecond(s, content, 'oak_gem');
    expect(income.gt(0)).toBe(true);
    s.resources['oak_gem'] = new Decimal(4);
    const price = { resource: 'oak_gem', amount: new Decimal(4).add(income.mul(30)) };
    expect(timeToAfford(s, content, price)).toBeCloseTo(30, 6);
  });
});

describe('outputGainMultiplier', () => {
  it('is rateAfter over rateBefore of a preview', () => {
    const s = freshState();
    const p = previewTreeLevel(s, content, 'oak')!;
    const gain = outputGainMultiplier(p)!;
    expect(gain).toBeCloseTo(p.rateAfter.div(p.rateBefore).toNumber(), 9);
    expect(gain).toBeGreaterThan(1);
  });

  it('is null when the producer makes nothing yet', () => {
    expect(
      outputGainMultiplier({
        levels: 1,
        resource: 'x',
        rateBefore: new Decimal(0),
        rateAfter: new Decimal(1),
      }),
    ).toBeNull();
  });

  it('works with a real tree cost price', () => {
    const s = freshState();
    expect(treeLevelCost(s, content, 'oak')).not.toBeNull();
  });
});
