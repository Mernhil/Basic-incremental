import { describe, expect, it } from 'vitest';
import { Decimal, type HarvestEvent } from '../src/game';
import {
  gaugePercent,
  harvestMoments,
  lungeVector,
  strikeLook,
  strikeNumberKind,
} from '../src/renderer/src/pages/productionStageModel';

const ev = (over: Partial<HarvestEvent>): HarvestEvent => ({
  job: 'logging',
  plot: 0,
  producer: 'oak',
  resource: 'wood_gem',
  amount: new Decimal(10),
  strikes: 1,
  crits: 0,
  burst: false,
  supports: [],
  ...over,
});

describe('harvestMoments', () => {
  it('keeps only the asked job', () => {
    const m = harvestMoments([ev({}), ev({ job: 'mining', plot: 1 })], 'logging');
    expect(m.strikes.map((s) => s.plot)).toEqual([0]);
  });

  it('merges strikes on the same plot: amounts, strikes, crit and supports', () => {
    const m = harvestMoments(
      [
        ev({ amount: new Decimal(5), supports: ['a'] }),
        ev({ amount: new Decimal(7), crits: 1, supports: ['a', 'b'] }),
      ],
      'logging',
    );
    expect(m.strikes).toHaveLength(1);
    expect(m.strikes[0]!.amount.toNumber()).toBe(12);
    expect(m.strikes[0]!.strikes).toBe(2);
    expect(m.strikes[0]!.crit).toBe(true);
    expect(m.strikes[0]!.supports).toEqual(['a', 'b']);
  });

  it('turns burst events into one wave with totals per resource', () => {
    const m = harvestMoments(
      [
        ev({ burst: true, plot: 2, amount: new Decimal(4) }),
        ev({ burst: true, plot: 0, amount: new Decimal(6) }),
        ev({ burst: true, plot: 1, resource: 'ore', amount: new Decimal(1) }),
      ],
      'logging',
    );
    expect(m.strikes).toHaveLength(0);
    expect(m.burst!.plots.map((p) => p.plot)).toEqual([0, 1, 2]);
    expect(m.burst!.totals).toEqual([
      { resource: 'wood_gem', amount: new Decimal(10) },
      { resource: 'ore', amount: new Decimal(1) },
    ]);
  });

  it('caps strike moments, dropping the smallest', () => {
    const events = Array.from({ length: 6 }, (_, i) => ev({ plot: i, amount: new Decimal(i + 1) }));
    const m = harvestMoments(events, 'logging', 3);
    expect(m.strikes.map((s) => s.plot)).toEqual([3, 4, 5]);
  });

  it('ignores empty yields and returns nothing for no events', () => {
    expect(harvestMoments([ev({ amount: new Decimal(0) })], 'logging')).toEqual({
      strikes: [],
      burst: null,
    });
  });
});

describe('strike looks', () => {
  it('differ by pattern: chop is slow, big and shakes, flurry is quick and small', () => {
    const chop = strikeLook({ style: 'chop' });
    const flurry = strikeLook({ style: 'flurry' });
    expect(chop.shake).toBe(true);
    expect(flurry.shake).toBe(false);
    expect(chop.ms).toBeGreaterThan(flurry.ms);
    expect(chop.numberScale).toBeGreaterThan(flurry.numberScale);
    expect(flurry.staggerMs).toBeLessThan(chop.staggerMs);
  });

  it('crits use the crit number look', () => {
    expect(strikeNumberKind({ crit: true })).toBe('crit');
    expect(strikeNumberKind({ crit: false })).toBe('gain');
  });

  it('aims a fraction of the way and caps the distance', () => {
    expect(lungeVector({ x: 0, y: 0 }, { x: 100, y: 0 }, { reach: 0.2 })).toEqual({
      dx: 20,
      dy: 0,
    });
    const far = lungeVector({ x: 0, y: 0 }, { x: 1000, y: 0 }, { reach: 0.5 }, 90);
    expect(far).toEqual({ dx: 90, dy: 0 });
  });

  it('clamps the gauge', () => {
    expect(gaugePercent(1.4)).toBe(100);
    expect(gaugePercent(-1)).toBe(0);
    expect(gaugePercent(0.456)).toBe(46);
  });
});
