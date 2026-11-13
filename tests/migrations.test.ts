import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createSaveText,
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  migrateState,
  readSave,
  SaveError,
  stageKey,
  type MigrationTable,
} from '../src/game';
import { Decimal } from '../src/game';
import { content, floorsContent, freshState } from './helpers';

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

  it('refunds the price of every mine level as Money, and leaves the expansions to v16 and the damage lines to v17', () => {
    const out = step({
      resources: { money: '0' },
      production: {
        logging: { expansions: 2, plots: [] },
        mining: { expansions: 1, plots: [] },
        mineLevels: { copper_quarry: 3 },
      },
      combat: { damageLevels: { copper_edge: 2, iron_edge: 1 } },
    }) as { resources: Record<string, string> };
    // Start 100 + copper levels 15 + 15 * 1.3 + 15 * 1.3^2. The plots and slots are refunded once,
    // by v15 -> v16, and the damage lines once, by v16 -> v17 (not here).
    const expected = 100 + (15 + 15 * 1.3 + 15 * 1.69);
    expect(Number(out.resources['money'])).toBeCloseTo(expected, 6);
    expect(
      (out as unknown as { production: { logging: { expansions: number } } }).production.logging
        .expansions,
    ).toBe(2); // kept in the state for v16
    expect((out as unknown as { combat: { damageLevels: unknown } }).combat.damageLevels).toEqual({
      copper_edge: 2,
      iron_edge: 1,
    }); // kept in the state for v17
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

describe('v15 -> v16 (one of each: no plots, slots or expansions, DESIGN.md §4)', () => {
  const step = MIGRATIONS[15]!;

  it('drops the plots, slots and expansions and keeps levels and unlocks', () => {
    const out = step({
      production: {
        logging: { expansions: 4, plots: ['oak', 'ironbark'] },
        mining: { expansions: 1, plots: ['copper_quarry'] },
        unlockedTrees: ['ironbark'],
        mineLevels: { copper_quarry: 7 },
        treeLevels: { oak: 3 },
      },
    }) as { production: Record<string, unknown> };
    expect(out.production).toEqual({
      unlockedTrees: ['ironbark'],
      mineLevels: { copper_quarry: 7 },
      treeLevels: { oak: 3 },
    });
  });

  it('pays back the Money of every expansion, each price rounded up', () => {
    const out = step({
      resources: { money: '10', oak_gem: '5' },
      production: {
        logging: { expansions: 3, plots: [] },
        mining: { expansions: 2, plots: [] },
      },
    }) as { resources: Record<string, string> };
    // Plots 25 + 35 + 49 and slots 25 + 35, on top of the 10 held. Other resources stay.
    expect(out.resources['money']).toBe(String(10 + 109 + 60));
    expect(out.resources['oak_gem']).toBe('5');
  });

  it('refunds nothing for a save with no expansions', () => {
    const out = step({
      resources: { money: '40' },
      production: {
        logging: { expansions: 0, plots: ['oak'] },
        mining: { expansions: 0, plots: [] },
      },
    }) as { resources: Record<string, string> };
    expect(out.resources['money']).toBe('40');
  });

  it('does not mutate its input and copes with missing or junk sections', () => {
    const input = {
      resources: { money: '0' },
      production: { logging: { expansions: 1, plots: [] }, mining: 'junk' },
    };
    step(input);
    expect(input).toEqual({
      resources: { money: '0' },
      production: { logging: { expansions: 1, plots: [] }, mining: 'junk' },
    });
    expect(() => step({})).not.toThrow();
    expect(() => step({ resources: 3, production: 'x' })).not.toThrow();
  });
});

describe('v16 -> v17 (damage comes from cards: no damage lines, Temper or Hardening, DESIGN.md §5)', () => {
  const step = MIGRATIONS[16]!;

  it('drops the damage line levels from the combat part and keeps the rest', () => {
    const out = step({
      combat: { damageLevels: { copper_edge: 2 }, kills: { mossy_cellar: 4 }, trialBest: {} },
    }) as { combat: Record<string, unknown> };
    expect(out.combat).toEqual({ kills: { mossy_cellar: 4 }, trialBest: {} });
  });

  it('pays back every level of every line, each price rounded up', () => {
    const out = step({
      resources: { money: '10', oak_gem: '5' },
      combat: { damageLevels: { copper_edge: 3, iron_edge: 1, crystal_edge: 2 } },
    }) as { resources: Record<string, string> };
    // Copper Edge 10 x 1.11^n: 10 + 12 + 13. Iron Edge 200. Crystal Edge 3000 + 3390.
    expect(out.resources['money']).toBe(String(10 + (10 + 12 + 13) + 200 + (3000 + 3390)));
    expect(out.resources['oak_gem']).toBe('5');
  });

  it('pays back the price of each owned Temper and Hardening and removes it from the shelf', () => {
    const out = step({
      resources: { money: '0' },
      upgrades: {
        owned: ['keen_axes', 'copper_temper', 'iron_hardening', 'crystal_temper'],
        moneyEarned: '77',
      },
    }) as { resources: Record<string, string>; upgrades: { owned: string[]; moneyEarned: string } };
    expect(out.upgrades.owned).toEqual(['keen_axes']);
    expect(out.upgrades.moneyEarned).toBe('77');
    // Copper Temper 5,000 + Iron Hardening 30,000,000 + Crystal Temper 1,500,000.
    expect(out.resources['money']).toBe('31505000');
  });

  it('adds nothing for a save with no lines and no shelf items', () => {
    const out = step({ resources: { money: '40' }, combat: { damageLevels: {} } }) as {
      resources: Record<string, string>;
    };
    expect(out.resources['money']).toBe('40');
  });

  it('sets a card above its new tier cap to the cap and clears its XP', () => {
    const card = (tier: string, stars: number, level: number) => ({
      tier,
      stars,
      level,
      xp: '12',
      duplicates: 0,
      enhancements: [],
    });
    const out = step({
      cards: {
        owned: {
          a: card('bronze', 6, 36),
          b: card('silver', 2, 44),
          c: card('gold', 6, 80),
          d: card('prismatic', 6, 100),
          e: card('bronze', 1, 7),
          f: card('silver', 1, 40),
        },
      },
    }) as { cards: { owned: Record<string, { level: number; xp: string }> } };
    const levels = Object.fromEntries(
      Object.entries(out.cards.owned).map(([id, c]) => [id, [c.level, c.xp]]),
    );
    expect(levels).toEqual({
      a: [20, '0'],
      b: [40, '0'],
      c: [60, '0'],
      d: [80, '0'],
      e: [7, '12'],
      f: [40, '12'],
    });
  });

  it('does not mutate its input and copes with missing or junk sections', () => {
    const input = {
      resources: { money: '0' },
      combat: { damageLevels: { copper_edge: 1 } },
      upgrades: { owned: ['copper_temper'], moneyEarned: '1' },
      cards: { owned: { a: { tier: 'bronze', stars: 6, level: 30, xp: '5' } } },
    };
    const copy = JSON.parse(JSON.stringify(input));
    step(input);
    expect(input).toEqual(copy);
    expect(() => step({})).not.toThrow();
    expect(() => step({ resources: 3, combat: 'x', upgrades: 7, cards: [] })).not.toThrow();
  });
});

describe('v17 -> v18 (tiers, stars and the Unique tier: the star bar, DESIGN.md §5)', () => {
  const step = MIGRATIONS[17]!;

  it('turns duplicates into an empty star bar and keeps tier, stars and level', () => {
    const card = (tier: string, stars: number, duplicates: number) => ({
      tier,
      stars,
      level: 30,
      xp: '4',
      duplicates,
      enhancements: ['edge'],
    });
    const out = step({
      cards: { owned: { a: card('gold', 6, 3), b: card('bronze', 2, 0) }, shards: 5 },
    }) as { cards: { owned: Record<string, Record<string, unknown>>; shards: number } };
    expect(out.cards.owned['a']).toEqual({
      tier: 'gold',
      stars: 6,
      level: 30,
      xp: '4',
      starFill: 0,
      enhancements: ['edge'],
    });
    expect(out.cards.owned['b']).toMatchObject({ tier: 'bronze', stars: 2, starFill: 0 });
    expect(out.cards.shards).toBe(5);
  });

  it('does not mutate its input and copes with missing or junk sections', () => {
    const input = { cards: { owned: { a: { tier: 'gold', stars: 6, duplicates: 2 } } } };
    const copy = JSON.parse(JSON.stringify(input));
    step(input);
    expect(input).toEqual(copy);
    expect(() => step({})).not.toThrow();
    expect(() => step({ cards: 3 })).not.toThrow();
    expect(() => step({ cards: { owned: { a: 1 } } })).not.toThrow();
  });
});

describe('v18 -> v19 (the Shield Warden card was removed, DESIGN.md §5)', () => {
  const step = MIGRATIONS[18]!;
  type Out = {
    cards: {
      owned: Record<string, unknown>;
      shards: number;
      loadouts: Record<string, { main: string | null; supports: (string | null)[] }>;
    };
    cosmetics: { loadout: { cards: Record<string, unknown> } };
    shardShop: Record<string, number>;
  };
  const card = (stars: number) => ({ tier: 'gold', stars, level: 30, xp: '0', starFill: 0 });

  it('pays an owned Shield Warden back in shards (2 per star) and empties its slots', () => {
    const out = step({
      cards: {
        owned: { ember_squire: card(1), shield_warden: card(4) },
        shards: 5,
        loadouts: {
          fighting: { main: 'ember_squire', supports: ['shield_warden', null, null] },
          logging: { main: 'apprentice_feller', supports: [null, null, null] },
        },
      },
      cosmetics: {
        loadout: { slots: {}, cards: { shield_warden: { border: 'x' }, ember_squire: {} } },
      },
      shardShop: { copy_shield_warden: 2, copy_cave_digger: 1 },
    }) as Out;
    expect(Object.keys(out.cards.owned)).toEqual(['ember_squire']);
    expect(out.cards.shards).toBe(5 + 2 * 4);
    expect(out.cards.loadouts['fighting']).toEqual({
      main: 'ember_squire',
      supports: [null, null, null],
    });
    expect(Object.keys(out.cosmetics.loadout.cards)).toEqual(['ember_squire']);
    expect(out.shardShop).toEqual({ copy_cave_digger: 1 });
  });

  it('empties the main slot too, and leaves a save without the card as it was', () => {
    const lead = step({
      cards: {
        owned: { shield_warden: card(1) },
        shards: 0,
        loadouts: { fighting: { main: 'shield_warden', supports: [null, null, null] } },
      },
    }) as Out;
    expect(lead.cards.loadouts['fighting']!.main).toBeNull();
    expect(lead.cards.shards).toBe(2);
    const plain = { cards: { owned: { ember_squire: card(2) }, shards: 3, loadouts: {} } };
    expect(step(plain)).toMatchObject({ cards: { shards: 3 } });
  });

  it('does not mutate its input and copes with missing or junk sections', () => {
    const input = { cards: { owned: { shield_warden: card(2) }, shards: 1 } };
    const copy = JSON.parse(JSON.stringify(input));
    step(input);
    expect(input).toEqual(copy);
    expect(() => step({})).not.toThrow();
    expect(() => step({ cards: 3, cosmetics: 'x', shardShop: [] })).not.toThrow();
    expect(() => step({ cards: { owned: 1, loadouts: { fighting: 4 } } })).not.toThrow();
  });
});

describe('v19 -> v20 (weapon skins: nothing equipped)', () => {
  const step = MIGRATIONS[19]!;

  it('adds an empty weaponSkins and keeps the rest', () => {
    const out = step({ prestigeCount: 2, cosmetics: { owned: {} } }) as Record<string, unknown>;
    expect(out['weaponSkins']).toEqual({});
    expect(out['prestigeCount']).toBe(2);
    expect(out['cosmetics']).toEqual({ owned: {} });
  });

  it('turns a whole v19 save into a v20 state with no skins', () => {
    const v19 = JSON.parse(createSaveText(freshState(), 1));
    delete v19.state.weaponSkins;
    v19.version = 19;
    const loaded = readSave(JSON.stringify(v19), content);
    expect(loaded.state.weaponSkins).toEqual({});
  });
});

describe('v21 -> v22 (the weapon base: tiers Wood to Mythic/Void, Heirloom, item types)', () => {
  const ownedCard = (tier: string) => ({
    tier,
    stars: 2,
    level: 30,
    xp: '0',
    starFill: 0,
    enhancements: [],
  });

  /** A v21 save text: a Common at Gold, a Legendary and a Mythic at Unique, a worn Soul Reaper skin and two kept-or-dropped Maul skins. */
  function v21Save(): string {
    const save = JSON.parse(createSaveText(freshState(), 1));
    save.version = 21;
    save.state.cards.owned['ember_squire'] = ownedCard('gold');
    save.state.cards.owned['dawnblade_regent'] = ownedCard('unique');
    save.state.cards.owned['moonwood_dryad'] = ownedCard('unique');
    save.state.weaponSkins = { soul_reaper: 'skin-05', maul: 'legacy-maul-06' };
    save.state.legacySkins = ['legacy-maul-06', 'legacy-maul-01'];
    return JSON.stringify(save);
  }

  it('has a step at key 21 that renames the Unique tier Mythic', () => {
    const out = MIGRATIONS[21]!({
      cards: { owned: { a: { tier: 'unique' }, b: { tier: 'gold' } } },
    }) as { cards: { owned: Record<string, { tier: string }> } };
    expect(out.cards.owned['a']!.tier).toBe('mythic');
    expect(out.cards.owned['b']!.tier).toBe('gold');
  });

  it('has a step at key 22 that multiplies the crystals held by 30 (the repricing)', () => {
    const out = MIGRATIONS[22]!({
      resources: { summon_crystal: '7', glamour_crystal: '2', money: '5', oak_gem: '1' },
    }) as { resources: Record<string, string> };
    expect(out.resources).toEqual({
      summon_crystal: '210',
      glamour_crystal: '60',
      money: '5',
      oak_gem: '1',
    });
    expect(MIGRATIONS[22]!({}) as unknown).toEqual({ resources: {} });
  });

  it('loads at the current format with the Soul Reaper skin owned and worn as a legacy scythe skin', () => {
    expect(CURRENT_SAVE_VERSION).toBe(29);
    const loaded = readSave(v21Save(), content);
    // Soul Reaper skin-05 becomes legacy-scythe-06 on the scythe; Maul 06 became Hammer 01, Maul 01 was not kept.
    expect(loaded.state.weaponSkins).toEqual({
      scythe: 'legacy-scythe-06',
      hammer: 'legacy-hammer-01',
    });
    expect([...loaded.state.legacySkins].sort()).toEqual(['legacy-hammer-01', 'legacy-scythe-06']);
  });

  it('turns a Unique card into the Mythic tier and keeps its stars and level', () => {
    const loaded = readSave(v21Save(), content);
    expect(loaded.state.cards.owned['moonwood_dryad']).toMatchObject({
      tier: 'mythic',
      stars: 2, // saved stars are kept as they are
      level: 30,
    });
  });

  it('clamps a Common saved at Gold to Wood and a Legendary saved at Unique to Prismatic', () => {
    const loaded = readSave(v21Save(), content);
    expect(loaded.state.cards.owned['ember_squire']).toMatchObject({ tier: 'wood', stars: 2 });
    expect(loaded.state.cards.owned['dawnblade_regent']).toMatchObject({
      tier: 'prismatic',
      stars: 2,
    });
  });

  it('pays back the base price of the tier-up steps beyond each cap, never the Wood step', () => {
    const before = freshState();
    const loaded = readSave(v21Save(), content);
    // Both cards fight. The Common (Gold, cap Wood) paid the steps leaving Bronze and Silver; the
    // Wood step was never paid. The Legendary (Unique -> Mythic, cap Prismatic) paid the step
    // leaving Prismatic. The Mythic card is at its cap: nothing back.
    const owed = new Map<string, Decimal>();
    for (const step of ['bronze', 'silver', 'prismatic'] as const)
      for (const cost of content.cardRules.tierUp[step]['fighting'])
        owed.set(cost.resource, (owed.get(cost.resource) ?? new Decimal(0)).add(cost.amount));
    for (const [resource, amount] of owed) {
      const gained = (loaded.state.resources[resource] ?? new Decimal(0)).sub(
        before.resources[resource] ?? new Decimal(0),
      );
      // the Money and gems the save held moved to the readable scale first (format 29), so the
      // refund is counted to the nearest hundredth of a percent
      expect(gained.sub(amount).abs().lte(amount.mul(1e-4)), resource).toBe(true);
    }
    // Resources only the Wood step would have paid stay untouched.
    for (const cost of content.cardRules.tierUp.wood['fighting']) {
      if (owed.has(cost.resource)) continue;
      expect(
        (loaded.state.resources[cost.resource] ?? new Decimal(0)).toString(),
        cost.resource,
      ).toBe((before.resources[cost.resource] ?? new Decimal(0)).toString());
    }
  });

  it('leaves a Mythic card at Mythic with no refund beyond the Common and Legendary ones', () => {
    const loaded = readSave(v21Save(), content);
    expect(loaded.state.cards.owned['moonwood_dryad']!.tier).toBe('mythic');
  });
});

describe('v25 -> v26 (the balance update: workers, stage stars, DESIGN.md §4 to §10)', () => {
  /** A format 25 payload with only what the step reads. */
  const v25 = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    cards: {
      owned: { apprentice_feller: { tier: 'bronze', stars: 4 }, cave_digger: { tier: 'wood' } },
      loadouts: {
        logging: { main: 'apprentice_feller', supports: ['moss_forager', null, null] },
        mining: { main: 'cave_digger', supports: [null, null, null] },
        fighting: { main: 'ember_squire', supports: [null, null, null] },
      },
      shards: 3,
    },
    bursts: {
      fighting: { gauge: 4, timer: 0.5 },
      logging: { gauge: 12, timer: 0.25 },
      mining: { gauge: 7, timer: 1 },
    },
    production: { unlockedTrees: ['ironbark'], treeLevels: { oak: 3 }, mineLevels: {} },
    combat: { kills: { mossy_cellar: 78, void_hollow: 2 }, floors: {}, training: { sharpen: 4 } },
    ...over,
  });
  const step = MIGRATIONS[25]!;
  type Out = {
    production: Record<string, unknown>;
    combat: Record<string, unknown>;
    cards: Record<string, unknown>;
    bursts: Record<string, unknown>;
    automation: unknown;
  };

  it('makes each production job main card the worker of its first tree or mine', () => {
    const out = step(v25()) as Out;
    expect(out.production['workers']).toEqual({
      oak: ['apprentice_feller'],
      copper_quarry: ['cave_digger'],
    });
    // Supports become nothing; a job with no main card gives no worker.
    const empty = v25();
    (empty['cards'] as { loadouts: Record<string, { main: unknown }> }).loadouts['mining']!.main =
      null;
    expect((step(empty) as Out).production['workers']).toEqual({ oak: ['apprentice_feller'] });
    // What the production already held stays.
    expect(out.production).toMatchObject({ unlockedTrees: ['ironbark'], treeLevels: { oak: 3 } });
  });

  it('moves the old harvest gauges to that worker and keeps the old ones readable', () => {
    const out = step(v25()) as Out;
    expect(out.production['harvestGauges']).toEqual({
      oak: { gauge: 12, timer: 0.25 },
      copper_quarry: { gauge: 7, timer: 1 },
    });
    expect(out.bursts).toEqual(v25()['bursts']);
    // No worker, no gauge.
    const empty = v25();
    (empty['cards'] as { loadouts: Record<string, { main: unknown }> }).loadouts['logging']!.main =
      null;
    expect((step(empty) as Out).production['harvestGauges']).toEqual({
      copper_quarry: { gauge: 7, timer: 1 },
    });
    // An empty gauge needs no entry (missing = empty).
    const idle = v25({
      bursts: {
        fighting: { gauge: 0, timer: 0 },
        logging: { gauge: 0, timer: 0 },
        mining: { gauge: 3, timer: 0 },
      },
    });
    expect((step(idle) as Out).production['harvestGauges']).toEqual({
      copper_quarry: { gauge: 3, timer: 0 },
    });
  });

  it("turns each dungeon's boss kills into the stage kills of its Normal last floor", () => {
    const out = step(
      v25({
        combat: { kills: { mossy_cellar: 78, void_hollow: 2, glimmer_trial: 5, ember_crypt: 0 } },
      }),
    ) as Out;
    expect(out.combat['stageKills']).toEqual({
      [stageKey('mossy_cellar', 'normal', 10)]: 78,
      [stageKey('void_hollow', 'normal', 60)]: 2,
    });
    // The old kill counts stay readable (the medals still read them until package 3).
    expect(out.combat['kills']).toEqual({
      mossy_cellar: 78,
      void_hollow: 2,
      glimmer_trial: 5,
      ember_crypt: 0,
    });
  });

  it('keeps the stars, loadouts and everything else of the cards; the wishlist starts empty', () => {
    const before = v25();
    const out = step(before) as Out;
    expect(out.cards).toEqual({ ...(before['cards'] as object), wishlist: [] });
  });

  it('starts everything else empty', () => {
    const out = step(v25()) as Out;
    expect(out.production).toMatchObject({
      tools: {},
      depth: {},
      forge: { recipe: null, progress: '0', worker: null },
    });
    expect(out.combat).toMatchObject({ stageChests: {}, overflow: {}, training: { sharpen: 4 } });
    expect(out.automation).toEqual({ treeLevels: false, mineLevels: false, reservePercent: 0 });
  });

  it('copes with a payload missing every part it reads', () => {
    const out = step({}) as Out;
    expect(out.production['workers']).toEqual({});
    expect(out.production['harvestGauges']).toEqual({});
    expect(out.combat['stageKills']).toEqual({});
    expect(out.cards).toEqual({ wishlist: [] });
  });

  it('loads a format 25 save written by the 0.5.5 game (dev tools and ten minutes of play)', () => {
    const text = readFileSync(resolve(__dirname, 'fixtures/saves/v25-dev-tools.save.txt'), 'utf8');
    expect(JSON.parse(text).version).toBe(25);
    const { state } = readSave(text, floorsContent);
    expect(state.production.workers).toEqual({
      oak: ['apprentice_feller'],
      copper_quarry: ['cave_digger'],
    });
    expect(Object.keys(state.production.harvestGauges).sort()).toEqual(['copper_quarry', 'oak']);
    // the old job gauges moved to the first tree and mine; the state keeps the fighting one only
    const saved = JSON.parse(text) as { state: { bursts: Record<string, unknown> } };
    expect(state.production.harvestGauges['oak']).toEqual(saved.state.bursts['logging']);
    expect(state.production.harvestGauges['copper_quarry']).toEqual(saved.state.bursts['mining']);
    expect(Object.keys(state.bursts)).toEqual(['fighting']);
    expect(state.combat.stageKills).toEqual({ [stageKey('mossy_cellar', 'normal', 10)]: 78 });
    // Stars, levels and loadouts are what the 0.5.5 game wrote.
    expect(state.cards.owned['ember_squire']).toMatchObject({ tier: 'wood', stars: 6, level: 20 });
    expect(state.cards.owned['apprentice_feller']).toMatchObject({ tier: 'wood', stars: 3 });
    expect(Object.keys(state.cards.loadouts)).toEqual(['fighting']);
    expect(state.cards.loadouts.fighting.main).toBe('ember_squire');
    expect(state.cards.wishlist).toEqual([]);
    expect(state.production.tools).toEqual({});
    expect(state.production.depth).toEqual({});
    expect(state.production.forge.recipe).toBeNull();
    expect(state.combat.stageChests).toEqual({});
    expect(state.combat.overflow).toEqual({});
    expect(state.automation).toEqual({ treeLevels: false, mineLevels: false, reservePercent: 0 });
    // Saved again, it is format 26 and loads to the same state.
    const again = readSave(createSaveText(state, 1), floorsContent);
    expect(JSON.parse(createSaveText(state, 1)).version).toBe(CURRENT_SAVE_VERSION);
    expect(again.state).toEqual(state);
  });
});
