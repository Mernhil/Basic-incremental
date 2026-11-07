import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  migrateState,
  SaveError,
  type MigrationTable,
} from '../src/game';

// A made-up v1 -> v2 migration used only to exercise the pipeline:
// v1 stored `coins`; v2 renames it to `gold` and adds a `gems` field.
const v1ToV2 = (state: Record<string, unknown>): Record<string, unknown> => {
  const { coins, ...rest } = state;
  return { ...rest, gold: coins, gems: 0 };
};
const v2ToV3 = (state: Record<string, unknown>): Record<string, unknown> => ({
  ...state,
  gems: Number(state['gems']) + 5,
});

const table: MigrationTable = { 1: v1ToV2, 2: v2ToV3 };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof SaveError) return error.code;
    throw error;
  }
  return undefined;
}

describe('migration pipeline', () => {
  it('migrates v1 to v2', () => {
    expect(migrateState({ coins: 7, name: 'x' }, 1, 2, table)).toEqual({
      gold: 7,
      gems: 0,
      name: 'x',
    });
  });

  it('chains steps in order (v1 to v3)', () => {
    expect(migrateState({ coins: 7 }, 1, 3, table)).toEqual({ gold: 7, gems: 5 });
  });

  it('starts from the right step when the save is already newer', () => {
    expect(migrateState({ gold: 7, gems: 1 }, 2, 3, table)).toEqual({ gold: 7, gems: 6 });
  });

  it('leaves current-version data untouched', () => {
    const data = { gold: 1 };
    expect(migrateState(data, 3, 3, table)).toBe(data);
  });

  it('does not mutate its input', () => {
    const input = { coins: 7 };
    migrateState(input, 1, 2, table);
    expect(input).toEqual({ coins: 7 });
  });

  it('fails clearly when a step is missing', () => {
    expect(codeOf(() => migrateState({}, 1, 3, { 1: v1ToV2 }))).toBe('missing-migration');
  });

  it('refuses data from a newer version', () => {
    expect(codeOf(() => migrateState({}, 4, 3, table))).toBe('future-version');
  });

  it('rejects invalid version numbers', () => {
    for (const version of [0, -1, 1.5, NaN]) {
      expect(codeOf(() => migrateState({}, version, 3, table))).toBe('invalid-format');
    }
  });

  it('has a real step for every version below the current one', () => {
    for (let v = 1; v < CURRENT_SAVE_VERSION; v++) expect(MIGRATIONS[v]).toBeTypeOf('function');
    expect(MIGRATIONS[1]!({ damage: '1' })).toEqual({
      damage: '1',
      cosmetics: { loadout: { slots: {}, cards: {} }, owned: {} },
    });
  });
});

describe('v2 -> v3 (production)', () => {
  const step = MIGRATIONS[2]!;

  it('turns producer counts into plots and renames the example ids', () => {
    const out = step({
      resources: { example_wood: '5', other: '1' },
      producers: { example_tree: 3, example_mine: 2 },
      pity: { example_boss: 4 },
      activeDungeonId: 'example_dungeon',
    });
    expect(out).toEqual({
      resources: { oak_wood: '5', other: '1' },
      pity: { root_warden: 4 },
      activeDungeonId: 'mossy_cellar',
      production: {
        logging: { expansions: 2, plots: ['oak', 'oak', 'oak'] },
        mining: { expansions: 1, plots: ['copper_quarry', 'copper_quarry'] },
        unlockedTrees: [],
        mineLevels: {},
      },
      clearedDungeons: [],
    });
  });

  it('gives the start plot and slot when producers are missing or junk', () => {
    const out = step({ producers: 'junk', activeDungeonId: null }) as {
      production: { logging: unknown; mining: unknown };
      activeDungeonId: unknown;
    };
    expect(out.production.logging).toEqual({ expansions: 0, plots: ['oak'] });
    expect(out.production.mining).toEqual({ expansions: 0, plots: ['copper_quarry'] });
    expect(out.activeDungeonId).toBeNull();
  });

  it('does not mutate its input', () => {
    const input = { resources: { example_wood: '1' }, producers: { example_tree: 1 } };
    step(input);
    expect(input).toEqual({ resources: { example_wood: '1' }, producers: { example_tree: 1 } });
  });
});

describe('v5 -> v6 (woods and ores become gems)', () => {
  const step = MIGRATIONS[5]!;

  it('renames every wood and ore to its gem and keeps the amounts', () => {
    const out = step({
      resources: {
        oak_wood: '12',
        ironwood: '3',
        moonwood: '1',
        copper_ore: '40',
        iron_ore: '5',
        crystal_ore: '2',
        moss_sigil: '7',
      },
      cards: { owned: { moonwood_dryad: { level: 1 } } },
    });
    expect(out).toEqual({
      resources: {
        oak_gem: '12',
        ironbark_gem: '3',
        moonwillow_gem: '1',
        copper_gem: '40',
        iron_gem: '5',
        grotto_gem: '2',
        moss_sigil: '7',
      },
      cards: { owned: { moonwood_dryad: { level: 1 } } },
    });
  });

  it('leaves a save without resources alone and does not mutate its input', () => {
    expect(step({ other: 1 })).toEqual({ other: 1 });
    const input = { resources: { oak_wood: '1' } };
    step(input);
    expect(input).toEqual({ resources: { oak_wood: '1' } });
  });
});
