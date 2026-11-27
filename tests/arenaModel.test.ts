import { describe, expect, it } from 'vitest';
import { arenaLadder, seasonStartMs, syncSeason } from '../src/game';
import {
  arenaScreen,
  chestTrack,
  durationText,
  frameText,
  ladderWindow,
} from '../src/renderer/src/views/arena/arenaModel';
import { content, freshState } from './helpers';

const S1 = seasonStartMs(content, 1);
const DAY = 86_400_000;

describe('the Arena view model', () => {
  it('writes the time left in days and hours, hours and minutes, or minutes', () => {
    expect(durationText(3 * DAY + 14 * 3_600_000 + 5000)).toBe('3d 14h');
    expect(durationText(5 * 3_600_000 + 12 * 60_000)).toBe('5h 12m');
    expect(durationText(9 * 60_000)).toBe('9m');
    expect(durationText(-5)).toBe('0m');
  });

  it('shows seven ladder rows with the player among them, or the whole ladder', () => {
    const rows = arenaLadder(content, 1, S1 + 10 * DAY, 2500);
    const near = ladderWindow(rows, false, content);
    expect(near).toHaveLength(7);
    expect(near.filter((r) => r.you)).toHaveLength(1);
    expect(near.map((r) => r.rank)).toEqual([...near.map((r) => r.rank)].sort((a, b) => a - b));
    expect(ladderWindow(rows, true, content)).toHaveLength(rows.length);
    // the player at the very top keeps seven rows too
    expect(ladderWindow(arenaLadder(content, 1, S1, 99999), false, content)).toHaveLength(7);
  });

  it('lists the chest track from Champion down with the player band marked', () => {
    const steps = chestTrack(content, 30, (id) => id, 'arena');
    expect(steps.map((s) => s.rank.id)).toEqual([
      'champion',
      'top10',
      'top50',
      'top100',
      'contender',
    ]);
    expect(steps.filter((s) => s.current).map((s) => s.rank.id)).toEqual(['top50']);
    expect(steps[0]!.frame).toBe(true);
    expect(steps[4]!.frame).toBe(false);
  });

  it('writes the top number and the season on a frame', () => {
    expect(frameText(content, 'top10', 4)).toEqual({ top: 'TOP 10', season: 'S4' });
    expect(frameText(content, 'champion', 12)).toEqual({ top: 'TOP 1', season: 'S12' });
  });

  it('builds the screen of a player with a team', () => {
    const state = syncSeason(freshState(), content, S1 + DAY);
    const s = arenaScreen(state, content, S1 + DAY, '2026-12-01', false, 100);
    expect(s.season).toBe(1);
    expect(s.triesMax).toBe(content.arena.fights.perDay);
    expect(s.rival).not.toBeNull();
    expect(s.rival!.slots).toHaveLength(4);
  });
});
