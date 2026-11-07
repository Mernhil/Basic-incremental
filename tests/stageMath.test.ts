import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/game';
import {
  POPUP_SCALE_MAX,
  POPUP_SCALE_MIN,
  createMerger,
  createThrottle,
  nextAverage,
  overCap,
  popText,
  popupScale,
  rollToward,
} from '../src/renderer/src/stage/math';
import { bestLine, damageLineViews, formatRate } from '../src/renderer/src/pages/buyModel';
import { collectModifiers } from '../src/game';
import { content, freshState } from './helpers';

const d = (n: number) => new Decimal(n);

describe('stage math', () => {
  it('sizes popups by the hit relative to the average', () => {
    expect(popupScale(d(100), d(100))).toBe(1);
    expect(popupScale(d(200), d(100))).toBeCloseTo(1.35);
    expect(popupScale(d(1e9), d(1))).toBe(POPUP_SCALE_MAX);
    expect(popupScale(d(1), d(1e9))).toBe(POPUP_SCALE_MIN);
    expect(popupScale(d(5), d(0))).toBe(1);
  });

  it('keeps a running average seeded by the first value', () => {
    expect(nextAverage(null, d(10)).toNumber()).toBe(10);
    expect(nextAverage(d(10), d(20), 0.5).toNumber()).toBe(15);
  });

  it('rolls a counter toward its target and settles on it', () => {
    let shown = d(0);
    for (let i = 0; i < 5; i++) shown = rollToward(shown, d(100), 16);
    expect(shown.gt(0) && shown.lt(100)).toBe(true);
    for (let i = 0; i < 400; i++) shown = rollToward(shown, d(100), 16);
    expect(shown.eq(100)).toBe(true);
    // rolling down works too, and a zero-length frame does not move it
    expect(rollToward(d(50), d(10), 0).eq(50)).toBe(true);
    expect(rollToward(d(50), d(10), 1000).lt(50)).toBe(true);
  });

  it('merges rapid values per key inside the window', () => {
    const m = createMerger<number>(400, (a, b) => a + b);
    expect(m.push('a', 1, 0)).toEqual({ merged: false, value: 1 });
    expect(m.push('a', 2, 100)).toEqual({ merged: true, value: 3 });
    expect(m.push('b', 5, 150)).toEqual({ merged: false, value: 5 });
    expect(m.push('a', 4, 500)).toEqual({ merged: false, value: 4 });
    m.close('a');
    expect(m.push('a', 1, 510).merged).toBe(false);
  });

  it('throttles events per key', () => {
    const t = createThrottle(2, 1000);
    expect([t.allow('hit', 0), t.allow('hit', 10), t.allow('hit', 20)]).toEqual([
      true,
      true,
      false,
    ]);
    expect(t.allow('coin', 20)).toBe(true);
    expect(t.allow('hit', 1001)).toBe(true);
  });

  it('caps a list oldest first', () => {
    const items = [1, 2, 3, 4, 5];
    expect(overCap(items, 3)).toEqual([1, 2]);
    expect(items).toEqual([3, 4, 5]);
    expect(overCap(items, 10)).toEqual([]);
  });

  it('writes floating numbers without noisy decimals', () => {
    expect(popText(d(398.82))).toBe('399');
    expect(popText(d(4.26))).toBe('4.3');
    expect(popText(d(12345))).toBe('12,345');
  });
});

describe('buy lines', () => {
  const line = (affordable: boolean, gain: number, progress: number, available = true) => ({
    available,
    gain: d(gain),
    offer: { count: 1, price: { resource: 'x', amount: d(1) }, affordable, progress },
  });

  it('offers the affordable line with the biggest gain', () => {
    const lines = [line(true, 5, 1), line(true, 9, 1), line(false, 50, 0.5)];
    expect(bestLine(lines)).toBe(lines[1]);
  });

  it('falls back to the line closest to affordable, skipping unavailable ones', () => {
    const lines = [line(false, 5, 0.2), line(false, 1, 0.9, false), line(false, 1, 0.6)];
    expect(bestLine(lines)).toBe(lines[2]);
    expect(bestLine([line(false, 1, 1, false)])).toBeNull();
  });

  it('builds damage line views with previews and milestone tags', () => {
    const state = freshState();
    const views = damageLineViews(state, content, 10, collectModifiers(state, content));
    expect(views).toHaveLength(content.combat.damageUpgrades.length);
    for (const v of views) {
      expect(v.label).toBe('Buy ×10');
      expect(v.preview).toMatch(/^DPS /);
      expect(v.milestone).toMatch(/^Lv \d+: ×/);
    }
  });

  it('formats kills per minute', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(0.55)).toBe('0.6');
    expect(formatRate(42.4)).toBe('42');
  });
});
