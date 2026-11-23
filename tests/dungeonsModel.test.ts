import { describe, expect, it } from 'vitest';
import {
  challengeButton,
  challengeVerdict,
  barsGone,
  bossElements,
  healthPercent,
} from '../src/renderer/src/pages/dungeonsModel';

describe('arena counts', () => {
  it('counts the boss bars that are gone', () => {
    expect(barsGone(5, 3)).toEqual({ gone: 2, total: 5 });
    expect(barsGone(5, 5)).toEqual({ gone: 0, total: 5 });
    expect(barsGone(5, 0)).toEqual({ gone: 5, total: 5 });
    expect(barsGone(5, 9)).toEqual({ gone: 0, total: 5 });
    expect(barsGone(0, 0)).toEqual({ gone: 1, total: 1 });
  });

  it('shows party health as a whole percent, a sliver as 1%', () => {
    expect(healthPercent(1)).toBe(100);
    expect(healthPercent(0.864)).toBe(86);
    expect(healthPercent(0.004)).toBe(1);
    expect(healthPercent(0)).toBe(0);
    expect(healthPercent(Number.NaN)).toBe(0);
    expect(healthPercent(1.4)).toBe(100);
  });
});

describe('the Challenge controls (DESIGN.md §6 Farming and Challenge)', () => {
  it('shows the Challenge button ready, running, waiting out a knockout or with nothing left', () => {
    const at = (running: boolean, hasNext: boolean, knockoutSeconds = 0) =>
      challengeButton({ running, hasNext, knockoutSeconds });
    expect(at(false, true)).toBe('ready');
    expect(at(true, true)).toBe('running');
    expect(at(false, true, 4)).toBe('knocked');
    expect(at(false, false)).toBe('none');
  });

  it('turns a finished Challenge into Victory, or Defeat with its reason', () => {
    expect(challengeVerdict({ won: true, reason: null, hpLeftPositive: false })).toEqual({
      kind: 'victory',
      reason: null,
      showHpLeft: false,
    });
    expect(challengeVerdict({ won: false, reason: 'timer', hpLeftPositive: true })).toEqual({
      kind: 'defeat',
      reason: 'timer',
      showHpLeft: true,
    });
    expect(challengeVerdict({ won: false, reason: 'health', hpLeftPositive: true }).reason).toBe(
      'health',
    );
  });
});

describe('boss elements', () => {
  const sizes = { weakness: 50, resistance: -25 };
  it('gives the boss element, what it is weak to and what it resists, with their percents', () => {
    expect(bossElements({ element: 'earth' }, sizes)).toEqual({
      own: 'earth',
      weak: { element: 'fire', percent: 50 },
      resist: { element: 'water', percent: -25 },
    });
  });
  it('has no resistance line for a light or dark boss (nothing resists them)', () => {
    expect(bossElements({ element: 'dark' }, sizes)).toEqual({
      own: 'dark',
      weak: { element: 'light', percent: 50 },
    });
  });
});
