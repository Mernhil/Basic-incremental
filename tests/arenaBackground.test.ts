import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  ARENA_BACKGROUNDS,
  DEFAULT_BACKGROUND,
  backgroundFor,
  type ArenaBackground,
} from '../src/renderer/src/stage/arenaBackground';

describe('arena backgrounds (DESIGN.md §6)', () => {
  it('draws the default brick room when a dungeon names no background', () => {
    expect(backgroundFor(undefined)).toBe(DEFAULT_BACKGROUND);
    expect(backgroundFor(null)).toBe(DEFAULT_BACKGROUND);
    expect(backgroundFor('')).toBe(DEFAULT_BACKGROUND);
  });

  it('draws the default room for an id that has no art yet', () => {
    expect(backgroundFor('mossy_cellar')).toBe(DEFAULT_BACKGROUND);
    expect(backgroundFor('not_a_background')).toBe(DEFAULT_BACKGROUND);
    // ids that look like object keys are plain ids too
    expect(backgroundFor('constructor')).toBe(DEFAULT_BACKGROUND);
    expect(backgroundFor('__proto__')).toBe(DEFAULT_BACKGROUND);
  });

  it('every background named in the dungeon data resolves to a drawn room', () => {
    for (const d of loadContent().dungeons) {
      expect(backgroundFor(d.background).cls).toMatch(/^ar-bg--[a-z0-9-]+$/);
    }
    // Dungeons 4 to 6 have a room of their own, each different; 1 to 3 draw the default
    const own = loadContent().dungeons.map((d) => backgroundFor(d.background).cls);
    expect(Object.keys(ARENA_BACKGROUNDS).sort()).toEqual(
      ['sunken_sanctum', 'thunderpeak_aerie', 'void_hollow'].sort(),
    );
    expect(own.slice(0, 3)).toEqual(Array(3).fill(DEFAULT_BACKGROUND.cls));
    expect(new Set(own.slice(3)).size).toBe(3);
    expect(own.slice(3)).not.toContain(DEFAULT_BACKGROUND.cls);
  });

  it('new art drops in as one table entry, with no other change', () => {
    const table: Record<string, ArenaBackground> = { mossy_cellar: { cls: 'ar-bg--moss' } };
    expect(backgroundFor('mossy_cellar', table).cls).toBe('ar-bg--moss');
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
