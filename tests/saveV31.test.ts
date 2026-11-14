import { describe, expect, it } from 'vitest';
import {
  createSaveText,
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  readSave,
  resolveGlobal,
} from '../src/game';
import { content, newGame } from './helpers';

/** v30 -> v31: Plum Pixel is the starter table again (DESIGN.md §8); Castle Stone was withdrawn after 0.7.9. */
describe('v30 -> v31 (Plum Pixel is an owned table, Castle Stone is gone)', () => {
  const base = (loadoutSlots: Record<string, unknown>, owned: Record<string, unknown>) => ({
    cosmetics: { loadout: { slots: loadoutSlots, cards: {} }, owned },
  });

  it('is format 31', () => {
    expect(CURRENT_SAVE_VERSION).toBe(31);
  });

  it('adds Plum Pixel to the owned items', () => {
    const out = MIGRATIONS[30]!(base({}, { gn_border: { level: 1, copies: 1 } })) as ReturnType<
      typeof base
    >;
    expect(out.cosmetics.owned['gn_table']).toEqual({ level: 1, copies: 1 });
    expect(out.cosmetics.owned['gn_border']).toEqual({ level: 1, copies: 1 });
  });

  it('keeps a Plum Pixel the save already owns as it is', () => {
    const out = MIGRATIONS[30]!(base({}, { gn_table: { level: 1, copies: 3 } })) as ReturnType<
      typeof base
    >;
    expect(out.cosmetics.owned['gn_table']).toEqual({ level: 1, copies: 3 });
  });

  it('clears a slot that wore Plum Pixel, so the new starter shows', () => {
    const out = MIGRATIONS[30]!(
      base({ table: { id: 'gn_table', level: 1 }, border: { id: 'gt_border', level: 1 } }, {}),
    ) as ReturnType<typeof base>;
    expect(out.cosmetics.loadout.slots['table']).toBeUndefined();
    expect(out.cosmetics.loadout.slots['border']).toBeDefined();
  });

  it('leaves another worn table alone', () => {
    const out = MIGRATIONS[30]!(base({ table: { id: 'vine_table', level: 1 } }, {})) as ReturnType<
      typeof base
    >;
    expect(out.cosmetics.loadout.slots['table']).toEqual({ id: 'vine_table', level: 1 });
  });

  it('a new game owns Plum Pixel and no Castle Stone exists', () => {
    const owned = newGame().cosmetics.owned;
    expect(owned['gn_table']).toEqual({ level: 1, copies: 1 });
    expect(owned['castle_stone_table']).toBeUndefined();
    expect(content.cosmetics.some((c) => c.id === 'castle_stone_table')).toBe(false);
  });

  it('a save that owns and wears Castle Stone loads cleanly and shows Plum Pixel', () => {
    const raw = JSON.parse(createSaveText(newGame(), 1));
    raw.state.cosmetics.owned['castle_stone_table'] = { level: 1, copies: 1 };
    raw.state.cosmetics.loadout.slots['table'] = { id: 'castle_stone_table', level: 1 };
    const { state } = readSave(JSON.stringify(raw), content);
    expect(state.cosmetics.owned['castle_stone_table']).toBeUndefined();
    expect(state.cosmetics.loadout.slots['table']).toBeUndefined();
    expect(resolveGlobal(content, state.cosmetics.loadout).table.cosmetic.id).toBe('gn_table');
  });
});
