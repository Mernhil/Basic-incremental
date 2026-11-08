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

describe('v7 -> v8 (gem mastery, DESIGN.md §4)', () => {
  const step = MIGRATIONS[7]!;

  it('starts each gem lifetime total at the amount owned and leaves tiers to be settled', () => {
    const resources = {
      oak_gem: '1200',
      ironbark_gem: '3',
      moonwillow_gem: '0',
      copper_gem: '1.5e5',
      iron_gem: '7',
      grotto_gem: '2',
      moss_sigil: '9',
      frost_core: '4',
    };
    expect(step({ resources, other: 1 })).toEqual({
      resources,
      other: 1,
      mastery: {
        harvested: {
          oak_gem: '1200',
          ironbark_gem: '3',
          moonwillow_gem: '0',
          copper_gem: '1.5e5',
          iron_gem: '7',
          grotto_gem: '2',
        },
      },
    });
  });

  it('copes with missing or junk resources and does not mutate its input', () => {
    expect(step({})).toEqual({ mastery: { harvested: {} } });
    expect(step({ resources: { oak_gem: 5, copper_gem: 'x' } })).toEqual({
      resources: { oak_gem: 5, copper_gem: 'x' },
      mastery: { harvested: {} },
    });
    const input = { resources: { oak_gem: '1' } };
    step(input);
    expect(input).toEqual({ resources: { oak_gem: '1' } });
  });
});

describe('v13 -> v14 (three loops: Money and crystals, DESIGN.md §3)', () => {
  const step = MIGRATIONS[13]!;

  it('turns the Moss and Ember Sigils into the Summon and Glamour Crystal', () => {
    const out = step({
      resources: { moss_sigil: '40', ember_sigil: '7', frost_sigil: '12', oak_gem: '5' },
    }) as { resources: Record<string, string> };
    expect(out.resources['summon_crystal']).toBe('40');
    expect(out.resources['glamour_crystal']).toBe('7');
    expect('moss_sigil' in out.resources).toBe(false);
    expect('ember_sigil' in out.resources).toBe(false);
    // The Frost Sigil is a material now, with the same id.
    expect(out.resources['frost_sigil']).toBe('12');
    expect(out.resources['oak_gem']).toBe('5');
  });

  it('renames the skill, Starlight shop item and shard shop bundles that were about sigils', () => {
    const out = step({
      resources: {},
      account: { skills: { sigil_luck: 3, might: 1 } },
      prestige: { shop: { constellation_sigils: 2, starlit_groves: 1 }, starlightEarned: '4' },
      shardShop: { moss_sigils: 2, ember_sigils: 1, frost_cores: 3 },
    }) as {
      account: { skills: Record<string, number> };
      prestige: { shop: Record<string, number>; starlightEarned: string };
      shardShop: Record<string, number>;
    };
    expect(out.account.skills).toEqual({ crystal_luck: 3, might: 1 });
    expect(out.prestige.shop).toEqual({ constellation_crystals: 2, starlit_groves: 1 });
    expect(out.prestige.starlightEarned).toBe('4');
    expect(out.shardShop).toEqual({ summon_crystals: 2, glamour_crystals: 1, frost_cores: 3 });
  });

  it('gives the starting Money to a save that bought nothing', () => {
    const out = step({ resources: {} }) as { resources: Record<string, string> };
    expect(out.resources['money']).toBe('100');
  });

  it('refunds the price of every mine level, plot, slot and damage line as Money', () => {
    const out = step({
      resources: { money: '0' },
      production: {
        logging: { expansions: 2, plots: [] },
        mining: { expansions: 1, plots: [] },
        mineLevels: { copper_quarry: 3 },
      },
      combat: { damageLevels: { copper_edge: 2, iron_edge: 1 } },
    }) as { resources: Record<string, string> };
    // Start 100 + copper levels 15 + 15 * 1.3 + 15 * 1.3^2 + logging plots 25 + 25 * 1.4
    // + mining slot 25 + copper edge 10 + 10 * 1.11 + iron edge 200.
    const expected =
      100 + (15 + 15 * 1.3 + 15 * 1.69) + (25 + 25 * 1.4) + 25 + (10 + 10 * 1.11) + 200;
    expect(Number(out.resources['money'])).toBeCloseTo(expected, 6);
  });

  it('adds the refund to Money already held and does not mutate its input', () => {
    const input = {
      resources: { money: '50' },
      production: { logging: { expansions: 0, plots: [] }, mining: { expansions: 0, plots: [] } },
    };
    const out = step(input) as { resources: Record<string, string> };
    expect(Number(out.resources['money'])).toBe(150);
    expect(input.resources.money).toBe('50');
  });

  it('copes with missing or junk sections', () => {
    expect(() => step({})).not.toThrow();
    expect(() =>
      step({ resources: 'x', production: 3, combat: { damageLevels: { copper_edge: 'many' } } }),
    ).not.toThrow();
  });
});

describe('v14 -> v15 (tree levels and the upgrade shelf, DESIGN.md §4)', () => {
  const step = MIGRATIONS[14]!;

  it('adds empty tree levels and keeps the plots and mine levels', () => {
    const out = step({
      production: {
        logging: { expansions: 4, plots: ['oak', 'oak'] },
        mining: { expansions: 1, plots: [] },
        unlockedTrees: ['ironbark'],
        mineLevels: { copper_quarry: 7 },
      },
    }) as { production: Record<string, unknown> };
    expect(out.production['treeLevels']).toEqual({});
    expect(out.production['mineLevels']).toEqual({ copper_quarry: 7 });
    expect(out.production['unlockedTrees']).toEqual(['ironbark']);
    expect((out.production['logging'] as { expansions: number }).expansions).toBe(4);
  });

  it('owns no upgrade and starts the lifetime Money at the Money held', () => {
    const out = step({ resources: { money: '4500' } }) as {
      upgrades: { owned: string[]; moneyEarned: string };
    };
    expect(out.upgrades).toEqual({ owned: [], moneyEarned: '4500' });
    const none = step({}) as { upgrades: { moneyEarned: string } };
    expect(none.upgrades.moneyEarned).toBe('0');
  });

  it('does not mutate its input and copes with a missing production section', () => {
    const input = { production: { logging: { expansions: 1, plots: [] } } };
    step(input);
    expect(input).toEqual({ production: { logging: { expansions: 1, plots: [] } } });
    expect(() => step({})).not.toThrow();
  });
});
