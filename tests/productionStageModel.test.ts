import { describe, expect, it } from 'vitest';
import { Decimal, type HarvestEvent } from '../src/game';
import {
  burstCountText,
  gaugePercent,
  harvestMoments,
  lungeVector,
  strikeLook,
  strikeNumberKind,
  supportChips,
} from '../src/renderer/src/pages/productionStageModel';

const ev = (over: Partial<HarvestEvent>): HarvestEvent => ({
  job: 'logging',
  kind: 0,
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
    const m = harvestMoments([ev({}), ev({ job: 'mining', kind: 1 })], 'logging');
    expect(m.strikes.map((s) => s.kind)).toEqual([0]);
  });

  it('merges strikes on the same kind: amounts, strikes, crit and supports', () => {
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
        ev({ burst: true, kind: 2, amount: new Decimal(4) }),
        ev({ burst: true, kind: 0, amount: new Decimal(6) }),
        ev({ burst: true, kind: 1, resource: 'ore', amount: new Decimal(1) }),
      ],
      'logging',
    );
    expect(m.strikes).toHaveLength(0);
    expect(m.burst!.kinds.map((p) => p.kind)).toEqual([0, 1, 2]);
    expect(m.burst!.totals).toEqual([
      { resource: 'wood_gem', amount: new Decimal(10) },
      { resource: 'ore', amount: new Decimal(1) },
    ]);
  });

  it('caps strike moments, dropping the smallest', () => {
    const events = Array.from({ length: 6 }, (_, i) => ev({ kind: i, amount: new Decimal(i + 1) }));
    const m = harvestMoments(events, 'logging', 3);
    expect(m.strikes.map((s) => s.kind)).toEqual([3, 4, 5]);
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

describe('burstCountText', () => {
  it('says how full the gauge is out of its size', () => {
    expect(burstCountText({ gauge: 0.7, burst: { size: 30 } as never })).toBe('Burst 21 / 30');
    expect(burstCountText({ gauge: 0, burst: { size: 30 } as never })).toBe('Burst 0 / 30');
    expect(burstCountText({ gauge: 1.2, burst: { size: 30 } as never })).toBe('Burst 30 / 30');
  });
});

describe('supportChips', () => {
  it('lists the three slots, null for an empty one', () => {
    const card = {
      cardId: 'grove_keeper',
      name: 'Grove Keeper',
      rarity: 'rare',
      abilityText: '+1 burst fill per tick',
      helpsHarvest: true,
    };
    const chips = supportChips({ supports: [card as never, undefined, undefined] });
    expect(chips).toHaveLength(3);
    expect(chips[0]).toEqual({
      id: 'grove_keeper',
      name: 'Grove Keeper',
      effect: '+1 burst fill per tick',
      rarity: 'rare',
      helps: true,
    });
    expect(chips[1]).toBeNull();
    expect(chips[2]).toBeNull();
  });
});
