import { describe, expect, it } from 'vitest';
import {
  challengeButton,
  challengeVerdict,
  barsGone,
  healthPercent,
  overflowSwitch,
  stageCell,
  starTotal,
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

describe('the stage map and overflow switch (DESIGN.md §6 Stage stars, Overflow)', () => {
  it('reads a cell: its pips, kills, kills to the next level and its switch; a closed tier is locked', () => {
    const info = {
      level: 3,
      kills: 150,
      nextKills: 1000,
      overflowUnlocked: true,
      overflowOn: false,
    };
    expect(stageCell(info, true)).toEqual({
      locked: false,
      level: 3,
      kills: 150,
      toNext: 850,
      overflow: 'off',
    });
    expect(stageCell({ ...info, level: 6, nextKills: null }, true).toNext).toBeNull();
    expect(stageCell({ ...info, level: 9 }, false)).toMatchObject({ locked: true, level: 6 });
  });

  it('keeps the switch locked until the stage opens it, then shows it off or on', () => {
    expect(overflowSwitch({ overflowUnlocked: false, overflowOn: false })).toBe('locked');
    expect(overflowSwitch({ overflowUnlocked: true, overflowOn: false })).toBe('off');
    expect(overflowSwitch({ overflowUnlocked: true, overflowOn: true })).toBe('on');
  });

  it('counts a dungeon’s stars against the most it can have', () => {
    expect(starTotal(4, 36)).toEqual({ levels: 4, max: 36 });
    expect(starTotal(40, 36)).toEqual({ levels: 36, max: 36 });
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
