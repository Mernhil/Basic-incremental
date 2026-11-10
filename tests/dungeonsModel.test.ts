import { describe, expect, it } from 'vitest';
import {
  DRAWER_TABS,
  barsGone,
  drawerStatus,
  floorParts,
  healthPercent,
  parseTab,
  signatureCount,
  tabAfterKey,
} from '../src/renderer/src/pages/dungeonsModel';

describe('Dungeons drawer tabs', () => {
  it('has Dungeons, Weapon and Upgrades, in that order', () => {
    expect(DRAWER_TABS).toEqual(['dungeons', 'weapon', 'upgrades']);
  });

  it('remembers a tab, and falls back to the first for anything else', () => {
    expect(parseTab('weapon')).toBe('weapon');
    expect(parseTab('upgrades')).toBe('upgrades');
    expect(parseTab('nope')).toBe('dungeons');
    expect(parseTab(null)).toBe('dungeons');
    expect(parseTab(undefined)).toBe('dungeons');
  });

  it('moves with the arrow keys, wrapping round, and with Home and End', () => {
    expect(tabAfterKey('dungeons', 'ArrowRight')).toBe('weapon');
    expect(tabAfterKey('upgrades', 'ArrowRight')).toBe('dungeons');
    expect(tabAfterKey('dungeons', 'ArrowLeft')).toBe('upgrades');
    expect(tabAfterKey('weapon', 'ArrowLeft')).toBe('dungeons');
    expect(tabAfterKey('weapon', 'Home')).toBe('dungeons');
    expect(tabAfterKey('weapon', 'End')).toBe('upgrades');
    expect(tabAfterKey('weapon', 'Enter')).toBeNull();
  });
});

describe('drawer status line', () => {
  it('says to pick a dungeon when nothing is being fought', () => {
    expect(drawerStatus({ fight: 'none', knockoutSeconds: 0, rareKillsLeft: null })).toEqual({
      kind: 'idle',
    });
  });

  it('counts down a knockout first, rounding the seconds up', () => {
    expect(drawerStatus({ fight: 'dungeon', knockoutSeconds: 3.2, rareKillsLeft: 10 })).toEqual({
      kind: 'knockout',
      seconds: 4,
    });
    expect(drawerStatus({ fight: 'trial', knockoutSeconds: 1, rareKillsLeft: null })).toEqual({
      kind: 'knockout',
      seconds: 1,
    });
  });

  it('names a special dungeon, and the kills left to the guaranteed rare drop', () => {
    expect(drawerStatus({ fight: 'trial', knockoutSeconds: 0, rareKillsLeft: null })).toEqual({
      kind: 'trial',
    });
    expect(drawerStatus({ fight: 'dungeon', knockoutSeconds: 0, rareKillsLeft: 188 })).toEqual({
      kind: 'pity',
      kills: 188,
    });
    // never "0 kills": the next kill is the guaranteed one
    expect(drawerStatus({ fight: 'dungeon', knockoutSeconds: 0, rareKillsLeft: 0 })).toEqual({
      kind: 'pity',
      kills: 1,
    });
    expect(drawerStatus({ fight: 'dungeon', knockoutSeconds: 0, rareKillsLeft: null })).toEqual({
      kind: 'fighting',
    });
  });
});

describe('arena counts', () => {
  it('counts the boss bars that are gone', () => {
    expect(barsGone(5, 3)).toEqual({ gone: 2, total: 5 });
    expect(barsGone(5, 5)).toEqual({ gone: 0, total: 5 });
    expect(barsGone(5, 0)).toEqual({ gone: 5, total: 5 });
    expect(barsGone(5, 9)).toEqual({ gone: 0, total: 5 });
    expect(barsGone(0, 0)).toEqual({ gone: 1, total: 1 });
  });

  it('shows the signature gauge as whole points out of its size', () => {
    expect(signatureCount(13.9, 20)).toEqual({ n: 13, size: 20 });
    expect(signatureCount(20, 20)).toEqual({ n: 20, size: 20 });
    expect(signatureCount(25, 20)).toEqual({ n: 20, size: 20 });
    expect(signatureCount(-1, 20)).toEqual({ n: 0, size: 20 });
    expect(signatureCount(12.9999999999, 20)).toEqual({ n: 13, size: 20 });
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

describe('the interim floor line', () => {
  const base = { floor: 3, floors: 10, wave: { index: 2, size: 4 }, bestFloor: 0 };

  it('names the floor and the enemy of the wave our hits are on', () => {
    expect(floorParts({ ...base, floorKind: 'wave' })).toEqual([
      { kind: 'floor', floor: 3, floors: 10 },
      { kind: 'enemy', index: 2, size: 4 },
    ]);
  });

  it('marks a mini-boss or boss floor instead, and adds the best floor once one is beaten', () => {
    expect(floorParts({ ...base, floor: 10, floorKind: 'boss', bestFloor: 9 })).toEqual([
      { kind: 'floor', floor: 10, floors: 10 },
      { kind: 'boss' },
      { kind: 'best', best: 9 },
    ]);
    expect(floorParts({ ...base, floorKind: 'miniboss' })[1]).toEqual({ kind: 'miniboss' });
  });
});
