import { describe, expect, it } from 'vitest';
import { Decimal, type HarvestEvent } from '../src/game';
import {
  burstCountText,
  gaugePercent,
  harvestMoments,
  lungeVector,
  strikeLook,
  strikeNumberKind,
  pickOptions,
  workerCellText,
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
  worker: 'apprentice_feller',
  ...over,
});

describe('harvestMoments', () => {
  it('keeps only the asked job', () => {
    const m = harvestMoments([ev({}), ev({ job: 'mining', kind: 1 })], 'logging');
    expect(m.strikes.map((s) => s.kind)).toEqual([0]);
  });

  it('merges strikes on the same kind: amounts, strikes and crit', () => {
    const m = harvestMoments(
      [ev({ amount: new Decimal(5) }), ev({ amount: new Decimal(7), crits: 1 })],
      'logging',
    );
    expect(m.strikes).toHaveLength(1);
    expect(m.strikes[0]!.amount.toNumber()).toBe(12);
    expect(m.strikes[0]!.strikes).toBe(2);
    expect(m.strikes[0]!.crit).toBe(true);
    expect(m.strikes[0]!.worker).toBe('apprentice_feller');
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

describe('worker cells and the picker', () => {
  const target = {
    worker: { name: 'Grove Keeper', level: 7, power: 1.92 } as never,
    gauge: 0.5,
    burst: { size: 30 } as never,
  };

  it('a worked place shows its card, level and power', () => {
    expect(workerCellText(target, true)).toEqual({ name: 'Grove Keeper', sub: 'Lv 7 · ×1.92' });
  });

  it('an empty place offers a worker, or says there is no free slot', () => {
    expect(workerCellText({ ...target, worker: null }, true).name).toBe('Add a worker');
    expect(workerCellText({ ...target, worker: null }, false)).toEqual({
      name: 'No worker',
      sub: 'No free slot',
    });
  });

  it('turns the game’s choices into options saying where each card works', () => {
    const base = {
      rarity: 'rare' as const,
      rank: { tier: 'wood' as const, stars: 1 },
      level: 1,
      abilityText: '+10% output here',
    };
    const options = pickOptions([
      {
        ...base,
        cardId: 'a',
        name: 'A',
        power: 2,
        workplace: 'oak',
        workplaceName: 'Oak',
        here: true,
        needsSlot: false,
      },
      {
        ...base,
        cardId: 'b',
        name: 'B',
        power: 1.5,
        workplace: 'ironbark',
        workplaceName: 'Ironbark',
        here: false,
        needsSlot: false,
      },
      {
        ...base,
        cardId: 'c',
        name: 'C',
        power: 1,
        workplace: null,
        workplaceName: null,
        here: false,
        needsSlot: true,
      },
    ]);
    expect(options.map((o) => [o.id, o.current, o.disabled])).toEqual([
      ['a', true, false],
      ['b', false, false],
      ['c', false, true],
    ]);
    expect(options[0]!.power).toBe('×2');
    expect(options[1]!.note).toBe('+10% output here · Works at Ironbark (moves here)');
    expect(options[2]!.note).toBe('+10% output here · No free slot');
  });
});
