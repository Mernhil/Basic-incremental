import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src/game/migrations';
import { CURRENT_SAVE_VERSION } from '../src/game/save';
import { newGame } from './helpers';

/** v30 -> v31: the Castle Stone shell (DESIGN.md §8 Plum Pixel and Tavern Wood tables). */
describe('v30 -> v31 (Castle Stone is the starter table, Plum Pixel an owned one)', () => {
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

  it('a new game owns Plum Pixel and Castle Stone', () => {
    const owned = newGame().cosmetics.owned;
    expect(owned['gn_table']).toEqual({ level: 1, copies: 1 });
    expect(owned['castle_stone_table']).toEqual({ level: 1, copies: 1 });
  });
});
