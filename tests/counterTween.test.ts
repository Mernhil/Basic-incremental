import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import {
  COUNTER_GLIDE_MS,
  easeOut,
  restingTween,
  retarget,
  tweenValue,
} from '../src/renderer/src/stage/counterTween';

const d = (n: number) => new Decimal(n);

describe('counter tween', () => {
  it('eases out and clamps', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-3)).toBe(0);
    expect(easeOut(9)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('glides up to the real value and never passes it', () => {
    const t = retarget(restingTween(d(100)), d(160), 1000);
    expect(tweenValue(t, 1000).eq(100)).toBe(true);
    let last = d(100);
    for (let ms = 1000; ms <= 1000 + COUNTER_GLIDE_MS + 200; ms += 16) {
      const v = tweenValue(t, ms);
      expect(v.gte(last)).toBe(true);
      expect(v.lte(160)).toBe(true);
      last = v;
    }
    expect(last.eq(160)).toBe(true);
    const mid = tweenValue(t, 1000 + COUNTER_GLIDE_MS / 2);
    expect(mid.gt(100) && mid.lt(160)).toBe(true);
  });

  it('restarts from the value shown when a new payout lands', () => {
    const first = retarget(restingTween(d(0)), d(100), 0);
    const shown = tweenValue(first, 200);
    const second = retarget(first, d(150), 200);
    expect(second.from.eq(shown)).toBe(true);
    expect(second.to.eq(150)).toBe(true);
    expect(second.startMs).toBe(200);
    expect(tweenValue(second, 200 + COUNTER_GLIDE_MS).eq(150)).toBe(true);
  });

  it('keeps the same glide when the target did not move', () => {
    const t = retarget(restingTween(d(0)), d(100), 0);
    expect(retarget(t, d(100), 300)).toBe(t);
  });

  it('shows a spend at once, even in the middle of a glide', () => {
    const t = retarget(restingTween(d(0)), d(100), 0);
    const spent = retarget(t, d(20), 100);
    expect(tweenValue(spent, 100).eq(20)).toBe(true);
    expect(tweenValue(spent, 5000).eq(20)).toBe(true);
    // a drop below the target of a glide still in flight is also shown at once
    const half = retarget(t, d(10), 300);
    expect(tweenValue(half, 300).eq(10)).toBe(true);
  });

  it('shows a payout at once under reduced motion', () => {
    const t = retarget(restingTween(d(5)), d(500), 0, { reduced: true });
    expect(tweenValue(t, 0).eq(500)).toBe(true);
  });
});
