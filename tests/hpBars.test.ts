import { describe, expect, it } from 'vitest';
import { barMoment, Decimal, hpBarState } from '../src/game';

const d = (n: number | string) => new Decimal(n);

describe('hpBarState (stacked HP bars)', () => {
  it('shows all bars full at max HP', () => {
    expect(hpBarState(d(100), d(100), 5)).toEqual({ remaining: 5, fraction: 1, index: 4 });
  });

  it('drains the top bar first', () => {
    const s = hpBarState(d(90), d(100), 5); // each bar is 20
    expect(s.remaining).toBe(5);
    expect(s.fraction).toBeCloseTo(0.5);
  });

  it('moves to the next bar exactly at a boundary', () => {
    expect(hpBarState(d(80), d(100), 5)).toEqual({ remaining: 4, fraction: 1, index: 3 });
    const s = hpBarState(d(79), d(100), 5);
    expect(s.remaining).toBe(4);
    expect(s.fraction).toBeCloseTo(0.95);
  });

  it('keeps one bar while any HP is left, and none when dead', () => {
    expect(hpBarState(d(0.001), d(100), 5).remaining).toBe(1);
    expect(hpBarState(d(0), d(100), 5)).toEqual({ remaining: 0, fraction: 0, index: 0 });
  });

  it('works for huge numbers and clamps overheal', () => {
    const s = hpBarState(d('5e400'), d('1e401'), 10);
    expect(s.remaining).toBe(5);
    expect(s.fraction).toBeCloseTo(1);
    expect(hpBarState(d(200), d(100), 4).remaining).toBe(4);
  });

  it('treats a bar count below 1 as a single bar', () => {
    expect(hpBarState(d(50), d(100), 0)).toEqual({ remaining: 1, fraction: 0.5, index: 0 });
  });
});

describe('a boss dies once (DESIGN.md §6)', () => {
  const look = (key: string, remaining: number) => ({ key, remaining });

  it('shatters a bar that runs out while the same enemy stands', () => {
    expect(barMoment(look('10:1:root_warden', 5), look('10:1:root_warden', 4), false)).toBe(
      'shatter',
    );
    expect(barMoment(look('10:1:root_warden', 4), look('10:1:root_warden', 4), false)).toBeNull();
  });

  it('plays the death only when the game reports the kill, never at a bar', () => {
    expect(barMoment(look('10:1:root_warden', 1), look('10:1:root_warden', 5), true)).toBe('death');
    // A fresh enemy stepping up (more bars, or the next one of the wave) is no moment of its own.
    expect(barMoment(look('10:1:root_warden', 1), look('10:1:root_warden', 5), false)).toBeNull();
    expect(barMoment(look('3:1:moss_slime', 1), look('3:2:root_sprite', 1), false)).toBeNull();
    expect(barMoment(null, look('3:1:moss_slime', 1), false)).toBeNull();
  });
});
