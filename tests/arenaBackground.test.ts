import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  ARENA_BACKGROUNDS,
  DEFAULT_BACKGROUND,
  TRIAL_BACKGROUND_ID,
  backgroundFor,
  stageBox,
  stageScale,
  type ArenaBackground,
} from '../src/renderer/src/stage/arenaBackground';

describe('arena backgrounds (DESIGN.md §6)', () => {
  it('draws the default picture when a dungeon names no background', () => {
    expect(backgroundFor(undefined)).toBe(DEFAULT_BACKGROUND);
    expect(backgroundFor(null)).toBe(DEFAULT_BACKGROUND);
    expect(backgroundFor('')).toBe(DEFAULT_BACKGROUND);
  });

  it('draws the default picture for an unknown id', () => {
    expect(backgroundFor('not_a_background')).toBe(DEFAULT_BACKGROUND);
    // ids that look like object keys are plain ids too
    expect(backgroundFor('constructor')).toBe(DEFAULT_BACKGROUND);
    expect(backgroundFor('__proto__')).toBe(DEFAULT_BACKGROUND);
  });

  it('every dungeon has a painted picture of its own, and only the two bright ones are marked bright', () => {
    const rooms = loadContent().dungeons.map((d) => backgroundFor(d.background));
    expect(new Set(rooms.map((r) => r.url)).size).toBe(rooms.length);
    for (const d of loadContent().dungeons) {
      expect(Object.keys(ARENA_BACKGROUNDS)).toContain(d.background);
    }
    const bright = Object.entries(ARENA_BACKGROUNDS)
      .filter(([, r]) => r.bright)
      .map(([id]) => id);
    expect(bright.sort()).toEqual(['frostspire_vault', 'sunken_sanctum']);
    expect(ARENA_BACKGROUNDS[TRIAL_BACKGROUND_ID]).toBeDefined();
  });

  it('new art drops in as one table entry, with no other change', () => {
    const table: Record<string, ArenaBackground> = {
      mossy_cellar: { url: 'x.png', bright: false },
    };
    expect(backgroundFor('mossy_cellar', table).url).toBe('x.png');
    expect(backgroundFor('ember_crypt', table)).toBe(DEFAULT_BACKGROUND);
  });

  it('the dungeon data names a background for every dungeon', () => {
    expect(loadContent().dungeons.map((d) => d.background)).toEqual([
      'mossy_cellar',
      'ember_crypt',
      'frostspire_vault',
      'thunderpeak_aerie',
      'sunken_sanctum',
      'void_hollow',
    ]);
  });
});

describe('the picture covers the duel exactly (the UI is laid out at 1920 x 1080)', () => {
  it('3x at the design size, whatever the window (the zoom scales the rest)', () => {
    expect(stageScale(1920, 1016)).toBe(3);
    expect(stageScale(1920, 1080)).toBe(3);
    expect(stageScale(300, 200)).toBe(1);
  });

  it('a taller design area grows the picture just enough to cover it', () => {
    expect(stageScale(1920, 1164)).toBeCloseTo(1164 / 360, 6);
    expect(stageScale(2400, 1016)).toBeCloseTo(3.75, 6);
  });

  it('is centred, the overflow cut evenly off both edges', () => {
    const b = stageBox(1920, 1016);
    expect(b).toEqual({ x: 0, y: -32, w: 1920, h: 1080, scale: 3 });
    expect(b.x * 2 + b.w).toBeGreaterThanOrEqual(1920);
    expect(stageBox(1280, 656).y).toBe(-32);
    expect(stageBox(1920, 1164).x).toBe(Math.floor((1920 - 640 * (1164 / 360)) / 2));
  });
});
