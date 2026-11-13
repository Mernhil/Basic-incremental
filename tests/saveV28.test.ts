import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSaveText, CURRENT_SAVE_VERSION, MIGRATIONS, readSave } from '../src/game';
import { content } from './helpers';

/** Save format 28: the cosmetics cleanup (DESIGN.md §8). */
const fixture = readFileSync(
  resolve(__dirname, 'fixtures/saves/v27-removed-cosmetics.save.txt'),
  'utf8',
);

interface Migrated {
  cosmetics: {
    owned: Record<string, unknown>;
    loadout: { slots: Record<string, unknown>; cards: Record<string, unknown> };
  };
  legacySkins: string[];
  weaponSkins: Record<string, string>;
  resources: Record<string, string>;
}

const removedIds = (): string[] => {
  const json = JSON.parse(fixture) as { state: { cosmetics: { owned: Record<string, unknown> } } };
  return Object.keys(json.state.cosmetics.owned);
};

describe('v27 -> v28 (the cosmetics cleanup)', () => {
  it('is an older format than the current one, and the fixture is format 27', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThan(27);
    expect(JSON.parse(fixture).version).toBe(27);
  });

  it('unequips and removes every removed cosmetic, keeps the rest worn, and refunds the owned ones', () => {
    const before = readFileSync(
      resolve(__dirname, 'fixtures/saves/v27-removed-cosmetics.save.txt'),
      'utf8',
    );
    const json = JSON.parse(before);
    const oldScrolls = Number(json.state.resources['glamour_scroll']);
    const migrated = MIGRATIONS[27]!(json.state) as unknown as Migrated;

    // the owned list: nothing removed is left, what is kept is untouched
    const ownedAfter = Object.keys(migrated.cosmetics.owned);
    for (const id of [
      'gn_attack',
      'gn_finish',
      'gn_tick',
      'gn_number',
      'gt_attack',
      'gt_tick',
      'holo_hex',
      'holo_waves',
      'prism_pointer',
      'aurora_veil',
      'verdant_finish',
      'vine_tick',
      'fern_number',
      'core_pulse',
      'forge_attack',
    ]) {
      expect(ownedAfter, id).not.toContain(id);
    }
    for (const id of ['gn_border', 'gn_table', 'gt_border', 'verdant_table', 'heartwood_halo']) {
      expect(ownedAfter, id).toContain(id);
    }

    // the loadout: the attack slot and every removed item are gone, the kept ones stay
    expect(migrated.cosmetics.loadout.slots).toEqual({
      border: { id: 'gt_border', level: 2 },
      table: { id: 'verdant_table', level: 1 },
    });
    expect(Object.values(migrated.cosmetics.loadout.cards)).toEqual([
      { border: { id: 'gt_border', level: 2 } },
    ]);

    // the skins: the two removed bows leave and the worn one is unworn
    expect(migrated.legacySkins).toEqual(['legacy-sword-01']);
    expect(migrated.weaponSkins).toEqual({ sword: 'legacy-sword-01' });

    // the refund: a fifth of a Glamour Scroll per owned copy (item and duplicates) of the 11
    // removed items it owned (15 copies, starters not counted) plus the 2 removed skins
    const refunded = 15 * 0.2 + 2 * 0.2;
    expect(Number(migrated.resources.glamour_scroll)).toBeCloseTo(oldScrolls + refunded, 9);
  });

  it('loads at the current format with nothing removed worn, and saves and loads to the same state', () => {
    const { state } = readSave(fixture, content);
    expect(Object.keys(state.cosmetics.loadout.slots).sort()).toEqual(['border', 'table']);
    expect(state.cosmetics.owned['holo_hex']).toBeUndefined();
    expect(state.legacySkins).toEqual(['legacy-sword-01']);
    expect(state.weaponSkins).toEqual({ sword: 'legacy-sword-01' });
    for (const id of removedIds()) {
      if (!content.cosmeticById.has(id)) expect(state.cosmetics.owned[id]).toBeUndefined();
    }
    const again = readSave(createSaveText(state, 1), content).state;
    expect(JSON.parse(createSaveText(state, 1)).version).toBe(CURRENT_SAVE_VERSION);
    expect(again).toEqual(state);
  });

  it('does not refund a save that owns none of them', () => {
    const json = JSON.parse(fixture);
    json.state.cosmetics.owned = { gn_border: { level: 1, copies: 1 } };
    json.state.cosmetics.loadout = { slots: {}, cards: {} };
    json.state.legacySkins = [];
    json.state.weaponSkins = {};
    const before = json.state.resources['glamour_scroll'];
    const migrated = MIGRATIONS[27]!(json.state) as unknown as Migrated;
    expect(migrated.resources.glamour_scroll).toBe(before);
  });
});
