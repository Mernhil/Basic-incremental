import { describe, expect, it } from 'vitest';
import {
  advance,
  cloneState,
  CURRENT_SAVE_VERSION,
  createSaveText,
  Decimal,
  exportSaveString,
  importSaveString,
  loadBestSave,
  readSave,
  SaveError,
  serializeState,
  V23_CRYSTAL_FACTOR,
} from '../src/game';
import { constantRng, bareState, plainContent as content, freshState, withDps } from './helpers';

/** Damage that makes the first boss fall twice in 25 s (about 5000 dps at 60,000 HP). */
const STRONG_DPS = 1 + Math.round((4999 * content.dungeons[0]!.boss.hp.toNumber()) / 60_000);

/** A state with non-trivial values everywhere. */
function busyState() {
  const strong = bareState();
  // 25 s plus one signature attack: 2.9 times the first boss HP = 2 kills (2 rares).
  let state = advance(strong, withDps(STRONG_DPS), 25_000, constantRng(0.001)).state;
  state = {
    ...state,
    prestigeCount: 3,
    resources: { ...state.resources, oak_gem: new Decimal('1.5e500') },
  };
  state.combat.trialBest = { glimmer_trial: 0.5 };
  state.combat.trialAttempt = { elapsedSeconds: 12.5, dealt: new Decimal('3e400') };
  state.production.harvestGauges.copper_quarry = { gauge: 7, timer: 0.25 };
  state.pity = { root_warden: 17 };
  return state;
}

const NOW = 1_700_000_000_000;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof SaveError) return error.code;
    throw error;
  }
  return undefined;
}

describe('save round-trip', () => {
  it('restores the exact state, including huge numbers', () => {
    const state = busyState();
    const loaded = readSave(createSaveText(state, NOW), content);
    expect(loaded.savedAt).toBe(NOW);
    expect(serializeState(loaded.state)).toEqual(serializeState(state));
    expect(loaded.state.resources['oak_gem']!.eq(new Decimal('1.5e500'))).toBe(true);
    expect(loaded.state.combat.trialAttempt.dealt.eq(new Decimal('3e400'))).toBe(true);
    expect(loaded.state.combat.stageKills).toEqual({ 'mossy_cellar:normal:1': 2 });
    expect(loaded.state.inventory['holo_hex']).toBe(2);
    expect(loaded.state.pity['root_warden']).toBe(17);
    expect(loaded.state.bossHp!.eq(state.bossHp!)).toBe(true);
  });

  it('stamps the current save version', () => {
    expect(JSON.parse(createSaveText(freshState(), NOW)).version).toBe(CURRENT_SAVE_VERSION);
  });

  it('fills in resources that were added to the content after the save', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    delete json.state.resources['copper_gem'];
    const loaded = readSave(JSON.stringify(json), content);
    expect(loaded.state.resources['copper_gem']!.eq(0)).toBe(true);
  });

  it('falls back to a valid dungeon if the saved one no longer exists', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.activeDungeonId = 'deleted_dungeon';
    const loaded = readSave(JSON.stringify(json), content);
    expect(loaded.state.activeDungeonId).toBe('mossy_cellar');
  });
});

describe('invalid saves', () => {
  it('rejects non-JSON, wrong shapes, and bad values with specific codes', () => {
    expect(codeOf(() => readSave('{nope', content))).toBe('invalid-json');
    expect(codeOf(() => readSave('{"hello":1}', content))).toBe('invalid-format');
    const bad = JSON.parse(createSaveText(freshState(), NOW));
    bad.state.combat.trialAttempt.dealt = 'banana';
    expect(codeOf(() => readSave(JSON.stringify(bad), content))).toBe('invalid-format');
    bad.version = 0;
    expect(codeOf(() => readSave(JSON.stringify(bad), content))).toBe('invalid-format');
  });

  it('refuses saves from a newer game version', () => {
    const future = JSON.parse(createSaveText(freshState(), NOW));
    future.version = CURRENT_SAVE_VERSION + 1;
    expect(codeOf(() => readSave(JSON.stringify(future), content))).toBe('future-version');
  });

  it('flags an old save when no migration path exists', () => {
    // Pretend the app is at version 1 but a v0-style save has no migration: version 0 is invalid.
    expect(codeOf(() => readSave('{"version":0,"savedAt":1,"state":{}}', content))).toBe(
      'invalid-format',
    );
  });
});

describe('loadBestSave', () => {
  const good = createSaveText(busyState(), NOW);

  it('prefers the main save', () => {
    const result = loadBestSave(good, createSaveText(freshState(), 1), content);
    expect(result.source).toBe('primary');
    expect(result.save!.savedAt).toBe(NOW);
    expect(result.errors).toEqual([]);
  });

  it('falls back to the backup when the main save is corrupted', () => {
    const result = loadBestSave('{"version":1,"savedAt":', good, content);
    expect(result.source).toBe('backup');
    expect(result.save!.savedAt).toBe(NOW);
    expect(result.errors).toHaveLength(1);
  });

  it('reports nothing-to-load for a fresh install, and errors when both are bad', () => {
    expect(loadBestSave(null, null, content)).toEqual({ save: null, source: 'none', errors: [] });
    const both = loadBestSave('x', 'y', content);
    expect(both.source).toBe('none');
    expect(both.errors).toHaveLength(2);
  });
});

describe('export / import', () => {
  it('round-trips through a single-line string', () => {
    const state = busyState();
    const text = exportSaveString(state, NOW);
    expect(text).not.toMatch(/\s/);
    const loaded = importSaveString(text, content);
    expect(serializeState(loaded.state)).toEqual(serializeState(state));
    expect(loaded.savedAt).toBe(NOW);
  });

  it('tolerates whitespace added when copy-pasting', () => {
    const text = exportSaveString(freshState(), NOW);
    const wrapped = `  ${text.slice(0, 20)}\n${text.slice(20)}  \n`;
    expect(importSaveString(wrapped, content).savedAt).toBe(NOW);
  });

  it('rejects garbage, truncated and tampered strings', () => {
    const text = exportSaveString(freshState(), NOW);
    expect(codeOf(() => importSaveString('hello', content))).toBe('invalid-export');
    expect(codeOf(() => importSaveString('BIv1:!!!notbase64', content))).toBe('invalid-export');
    expect(codeOf(() => importSaveString(text.slice(0, text.length - 12), content))).toBeDefined();
  });
});

describe('save format v2: cosmetics', () => {
  it('round-trips the equipped loadout and owned items', () => {
    const state = freshState();
    state.cosmetics.owned['gilded_filigree'] = { level: 3, copies: 4 };
    state.cosmetics.loadout = {
      slots: { border: { id: 'gilded_filigree', level: 3 } },
      cards: { dawnblade_regent: { border: { id: 'ember_crown', level: 1 } } },
    };
    const loaded = readSave(createSaveText(state, NOW), content);
    expect(loaded.state.cosmetics).toEqual(state.cosmetics);
  });

  it('starts a new game owning every starter item', () => {
    const owned = freshState().cosmetics.owned;
    for (const starter of Object.values(content.starterBySlot)) {
      expect(owned[starter.id]).toEqual({ level: 1, copies: 1 });
    }
  });

  it('migrates a v1 save (no cosmetics) to v2 with starters owned', () => {
    const v1 = JSON.parse(createSaveText(freshState(), NOW));
    v1.version = 1;
    delete v1.state.cosmetics;
    const loaded = readSave(JSON.stringify(v1), content);
    expect(loaded.state.cosmetics.loadout).toEqual({ slots: {}, cards: {} });
    expect(loaded.state.cosmetics.owned['gn_border']).toEqual({ level: 1, copies: 1 });
  });

  it('drops cosmetics that no longer exist and clamps levels', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.cosmetics.owned['removed_item'] = { level: 1, copies: 1 };
    json.state.cosmetics.owned['aurora_veil'] = { level: 9, copies: 0 };
    json.state.cosmetics.loadout.slots.border = { id: 'removed_item', level: 1 };
    const loaded = readSave(JSON.stringify(json), content);
    expect(loaded.state.cosmetics.owned['removed_item']).toBeUndefined();
    // Epic: max level 4 (DESIGN.md §8).
    expect(loaded.state.cosmetics.owned['aurora_veil']!.level).toBe(4);
    expect(loaded.state.cosmetics.loadout.slots.border).toBeUndefined();
  });
});

describe('save format v3: production', () => {
  it('round-trips unlocked trees, tree and mine levels and cleared dungeons', () => {
    const state = freshState();
    state.production = {
      ...state.production,
      unlockedTrees: ['ironbark'],
      mineLevels: { copper_quarry: 4, iron_deeps: 1 },
      treeLevels: { oak: 6 },
    };
    state.clearedDungeons = ['mossy_cellar'];
    const loaded = readSave(createSaveText(state, NOW), content);
    expect(loaded.state.production).toEqual(state.production);
    expect(loaded.state.clearedDungeons).toEqual(['mossy_cellar']);
  });

  it('drops removed ids from unlocks, levels and cleared dungeons', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.production.unlockedTrees = ['removed_tree'];
    json.state.production.mineLevels = { removed_mine: 3, copper_quarry: 2 };
    json.state.clearedDungeons = ['removed_dungeon'];
    const loaded = readSave(JSON.stringify(json), content).state;
    expect(loaded.production.unlockedTrees).toEqual([]);
    expect(loaded.production.mineLevels).toEqual({ copper_quarry: 2 });
    expect(loaded.clearedDungeons).toEqual([]);
  });

  it('rejects malformed production data', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.production.mineLevels = { copper_quarry: -1 };
    expect(codeOf(() => readSave(JSON.stringify(json), content))).toBe('invalid-format');
  });

  it('migrates a v0.2 (format 2) save: example content becomes the beta content', () => {
    const v2 = {
      version: 2,
      savedAt: NOW,
      state: {
        resources: { example_wood: '1234.5', example_ore: '0', example_portal_shard: '7' },
        producers: { example_tree: 1 },
        damage: '1',
        activeDungeonId: 'example_dungeon',
        bossHp: '42',
        pity: { example_boss: 12 },
        inventory: { holo_hex: 1 },
        prestigeCount: 0,
        cosmetics: { loadout: { slots: {}, cards: {} }, owned: {} },
        stats: { playTimeMs: 1000, bossKills: 3 },
      },
    };
    const { state } = readSave(JSON.stringify(v2), content);
    expect(state.resources['oak_gem']!.eq(1234.5)).toBe(true);
    expect(state.resources['summon_scroll']!.eq(Math.floor((7 * V23_CRYSTAL_FACTOR) / 300))).toBe(
      true,
    ); // repriced in format 23, then scrolls in format 27
    expect(state.activeDungeonId).toBe('mossy_cellar');
    expect(state.pity).toEqual({ root_warden: 12 });
    // v3 -> v4: the 3 earlier kills were in the Mossy Cellar, so it counts as cleared.
    expect(state.clearedDungeons).toEqual(['mossy_cellar']);
    expect(state.combat.stageKills).toEqual({ 'mossy_cellar:normal:10': 3 });
    expect(state.bossHp).toBeNull();
    expect(serializeState(state).production).toEqual(serializeState(freshState()).production);
  });
});

describe('save format v14: the three loops (DESIGN.md §3)', () => {
  it('loads a v13 save: sigils become crystals, levels stay, Money pays them back', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.version = 13;
    delete json.state.resources.money;
    delete json.state.resources.summon_scroll;
    delete json.state.resources.glamour_scroll;
    json.state.resources.moss_sigil = '42';
    json.state.resources.ember_sigil = '9';
    json.state.resources.frost_sigil = '5';
    json.state.production.mineLevels = { copper_quarry: 2 };
    json.state.production.logging = { expansions: 1, plots: ['oak', null] };
    json.state.production.mining = { expansions: 0, plots: ['copper_quarry'] };
    json.state.combat.damageLevels = { copper_edge: 1 };
    json.state.account.skills = { sigil_luck: 2 };
    const { state } = readSave(JSON.stringify(json), content);
    expect(state.resources['summon_scroll']!.toNumber()).toBe(
      Math.floor((42 * V23_CRYSTAL_FACTOR) / 300),
    ); // format 23, then scrolls (format 27)
    expect(state.resources['glamour_scroll']!.toNumber()).toBe(
      Math.floor((9 * V23_CRYSTAL_FACTOR) / 300),
    );
    expect(state.resources['frost_sigil']!.toNumber()).toBe(5);
    expect('moss_sigil' in state.resources).toBe(false);
    expect(state.production.mineLevels).toEqual({ copper_quarry: 2 });
    expect('damageLevels' in state.combat).toBe(false);
    expect(state.account.skills).toEqual({ luck_s1: 2 });
    // Start 100 + two copper levels (15 + 19.5) + a Copper Edge level (10) + the one plot (25),
    // which is paid back once, when plots go away (v16).
    expect(state.resources['money']!.toNumber()).toBeCloseTo(100 + 34.5 + 10 + 25);
  });

  it('writes the current version, so a v14 save loads without the refund twice', () => {
    const state = freshState();
    state.resources['money'] = new Decimal(777);
    const { state: back } = readSave(createSaveText(state, NOW), content);
    expect(back.resources['money']!.toNumber()).toBe(777);
  });
});

describe('save format v8: mastery', () => {
  it('loads a v7 save with lifetime totals from the gems owned and tiers settled from them', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.version = 7;
    delete json.state.mastery;
    json.state.resources.oak_gem = '2e5';
    json.state.resources.copper_gem = '50';
    json.state.combat.kills = { mossy_cellar: 150 };
    const { state } = readSave(JSON.stringify(json), content);
    expect(state.mastery.harvested['oak_gem']!.toNumber()).toBe(2e5);
    expect(state.mastery.harvested['copper_gem']!.toNumber()).toBe(50);
    expect(state.mastery.gemTiers).toEqual({ oak_gem: 2 });
    // Dungeon medals are gone (DESIGN.md §6 Stage stars): the kills became stage kills.
    expect(state.mastery.bossTiers).toEqual({});
  });

  it('drops totals of resources that are not production gems', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.mastery.harvested = { oak_gem: '5', summon_scroll: '9', removed_gem: '3' };
    const { state } = readSave(JSON.stringify(json), content);
    expect(Object.keys(state.mastery.harvested)).toEqual(['oak_gem']);
  });

  it('rejects malformed mastery data', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.mastery.harvested = { oak_gem: 'lots' };
    expect(codeOf(() => readSave(JSON.stringify(json), content))).toBe('invalid-format');
  });
});

describe('save format v16: one of each (DESIGN.md §4)', () => {
  it('pays a v13 save with plots and slots exactly one expansion refund, the v16 one', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.version = 13;
    delete json.state.resources.money;
    json.state.resources.moss_sigil = '0';
    json.state.production.logging = { expansions: 3, plots: ['oak', null, null, null] };
    json.state.production.mining = { expansions: 2, plots: ['copper_quarry', null, null] };
    const { state } = readSave(JSON.stringify(json), content);
    // Start 100 + plots 25 + 35 + 49 + slots 25 + 35, each paid once.
    expect(state.resources['money']!.toNumber()).toBe(100 + 109 + 60);
  });

  it('loads a v15 save: plots and slots are gone, the Money of the expansions comes back', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.version = 15;
    json.state.resources.money = '100';
    json.state.production.logging = { expansions: 2, plots: ['oak', 'ironbark', 'oak'] };
    json.state.production.mining = { expansions: 1, plots: ['copper_quarry', null] };
    json.state.production.unlockedTrees = ['ironbark'];
    json.state.production.treeLevels = { oak: 4, ironbark: 1 };
    json.state.production.mineLevels = { copper_quarry: 2 };
    const { state } = readSave(JSON.stringify(json), content);
    expect(Object.keys(state.production).sort()).toEqual([
      'depth',
      'forge',
      'harvestGauges',
      'mineLevels',
      'tools',
      'treeLevels',
      'unlockedTrees',
      'workers',
    ]);
    expect(state.production.unlockedTrees).toEqual(['ironbark']);
    expect(state.production.treeLevels).toEqual({ oak: 4, ironbark: 1 });
    expect(state.production.mineLevels).toEqual({ copper_quarry: 2 });
    // Plots 25 + 35 and one slot 25.
    expect(state.resources['money']!.toNumber()).toBe(100 + 60 + 25);
  });

  it('writes the current version, so a v16 save never pays the refund twice', () => {
    const state = freshState();
    state.resources['money'] = new Decimal(321);
    const { state: back } = readSave(createSaveText(state, NOW), content);
    expect(back.resources['money']!.toNumber()).toBe(321);
  });
});

describe('save format v17: damage comes from cards (DESIGN.md §5)', () => {
  it('loads a v16 save: lines and Temper items are gone and their Money comes back', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.version = 16;
    json.state.resources.money = '100';
    json.state.combat.damageLevels = { copper_edge: 3, iron_edge: 1 };
    json.state.upgrades.owned = ['copper_temper'];
    const { state } = readSave(JSON.stringify(json), content);
    expect('damageLevels' in state.combat).toBe(false);
    expect(state.upgrades.owned).not.toContain('copper_temper');
    // Copper Edge 10 + 12 + 13, Iron Edge 200, Copper Temper 5,000.
    expect(state.resources['money']!.toNumber()).toBe(100 + 35 + 200 + 5000);
  });

  it('caps the level of a card above its new cap, so it can tier up at once', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.version = 16;
    json.state.cards.owned.ember_squire = {
      ...json.state.cards.owned.ember_squire,
      stars: 6,
      level: 40,
      xp: '99',
    };
    const { state } = readSave(JSON.stringify(json), content);
    const squire = state.cards.owned['ember_squire']!;
    expect(squire.level).toBe(20);
    expect(squire.stars).toBe(6);
    expect(squire.xp.eq(0)).toBe(true);
  });

  it('writes the current version, so a v17 save never pays the refund twice', () => {
    const state = freshState();
    state.resources['money'] = new Decimal(321);
    const { state: back } = readSave(createSaveText(state, NOW), content);
    expect(back.resources['money']!.toNumber()).toBe(321);
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(17);
  });
});

describe('save format v26: the balance update state (DESIGN.md §4 to §10)', () => {
  /** A state with every format 26 field filled. */
  function balanceState() {
    const state = freshState();
    state.cards.owned['moss_forager'] = { ...state.cards.owned['apprentice_feller']! };
    state.production.workers = {
      oak: ['apprentice_feller'],
      ironbark: ['moss_forager'],
      copper_quarry: ['cave_digger'],
    };
    state.production.harvestGauges = { oak: { gauge: 12.5, timer: 0.25 } };
    state.production.tools = { logging_yield: 7 };
    state.production.depth = {
      oak: { layer: 3, progress: new Decimal('4.5e300') },
      copper_quarry: { layer: 1, progress: new Decimal(0) },
    };
    state.production.forge = {
      recipe: 'star_dust',
      progress: new Decimal('12.5'),
      worker: null,
    };
    state.cards.wishlist = ['ember_squire', 'reaper_test'];
    state.combat.stageKills = { 'mossy_cellar:normal:10': 78, 'ember_crypt:hard:10': 3 };
    state.combat.stageChests = { 'mossy_cellar:normal:10': 2 };
    state.combat.overflow = { 'mossy_cellar:normal:10': true };
    state.automation = { treeLevels: true, mineLevels: false, reservePercent: 25 };
    return state;
  }

  it('starts a new game with its start cards as workers and every other new field empty', () => {
    const state = freshState();
    expect(state.production).toMatchObject({
      workers: { oak: ['apprentice_feller'], copper_quarry: ['cave_digger'] },
      harvestGauges: {},
      tools: {},
      depth: {},
    });
    expect(state.production.forge.recipe).toBeNull();
    expect(state.production.forge.worker).toBeNull();
    expect(state.production.forge.progress.eq(0)).toBe(true);
    expect(state.cards.wishlist).toEqual([]);
    expect(state.combat).toMatchObject({ stageKills: {}, stageChests: {}, overflow: {} });
    expect(state.automation).toEqual({ treeLevels: false, mineLevels: false, reservePercent: 0 });
    expect(content.resourceById.get('star_dust')?.kind).toBe('material');
    expect(state.resources['star_dust']!.eq(0)).toBe(true);
  });

  it('round-trips every new field exactly, including huge numbers', () => {
    const state = balanceState();
    const loaded = readSave(createSaveText(state, NOW), content);
    expect(serializeState(loaded.state)).toEqual(serializeState(state));
    expect(loaded.state.production.depth['oak']!.progress.eq(new Decimal('4.5e300'))).toBe(true);
    expect(loaded.state.production.forge.progress.eq(new Decimal('12.5'))).toBe(true);
  });

  it('cloneState copies the new containers, so a change never reaches the original', () => {
    const state = balanceState();
    const copy = cloneState(state);
    copy.production.workers['oak']!.push('x');
    copy.production.harvestGauges['oak']!.gauge = 0;
    copy.production.tools['logging_yield'] = 0;
    copy.production.depth['oak']!.layer = 9;
    copy.production.forge.recipe = null;
    copy.cards.wishlist.push('x');
    copy.combat.stageKills['mossy_cellar:normal:10'] = 0;
    copy.combat.stageChests['mossy_cellar:normal:10'] = 0;
    copy.combat.overflow['mossy_cellar:normal:10'] = false;
    copy.automation.treeLevels = false;
    expect(serializeState(state)).toEqual(serializeState(balanceState()));
  });

  it('drops broken worker assignments on load', () => {
    const json = JSON.parse(createSaveText(balanceState(), NOW));
    json.state.production.workers = {
      oak: ['apprentice_feller', 'unknown_card'],
      // A mining card cannot work a tree; an unowned card cannot work at all.
      ironbark: ['cave_digger', 'pebble_prospector'],
      // A card works one place only: the first place wins.
      copper_quarry: ['apprentice_feller', 'cave_digger'],
      gone_tree: ['moss_forager'],
      moonwillow: [],
    };
    json.state.production.harvestGauges = {
      oak: { gauge: 1, timer: 0 },
      gone_tree: { gauge: 1, timer: 0 },
    };
    json.state.production.depth = { gone_mine: { layer: 2, progress: '5' } };
    json.state.production.forge.worker = 'cave_digger';
    const { state } = readSave(JSON.stringify(json), content);
    expect(state.production.workers).toEqual({
      oak: ['apprentice_feller'],
      copper_quarry: ['cave_digger'],
    });
    expect(Object.keys(state.production.harvestGauges)).toEqual(['oak']);
    expect(state.production.depth).toEqual({});
    // The card already works a mine, so it cannot also work the forge.
    expect(state.production.forge.worker).toBeNull();
  });

  it('keeps an owned card that works nowhere else as the forge worker', () => {
    const json = JSON.parse(createSaveText(balanceState(), NOW));
    json.state.cards.owned['elder_treant'] = structuredClone(
      json.state.cards.owned['apprentice_feller'],
    );
    json.state.production.forge.worker = 'elder_treant';
    expect(readSave(JSON.stringify(json), content).state.production.forge.worker).toBe(
      'elder_treant',
    );
    // a fighting card never works the forge
    json.state.production.forge.worker = 'ember_squire';
    expect(readSave(JSON.stringify(json), content).state.production.forge.worker).toBeNull();
    json.state.production.forge.worker = 'pebble_prospector';
    expect(readSave(JSON.stringify(json), content).state.production.forge.worker).toBeNull();
  });

  it('drops unknown cards and stages on load and keeps chests within the six star levels', () => {
    const json = JSON.parse(createSaveText(balanceState(), NOW));
    json.state.cards.wishlist = ['ember_squire', 'ember_squire', 'unknown_card'];
    json.state.combat.stageKills = { 'mossy_cellar:normal:10': 5, 'gone:normal:10': 9, junk: 1 };
    json.state.combat.stageChests = { 'mossy_cellar:normal:10': 9 };
    json.state.combat.overflow = { 'gone:hard:10': true, 'ember_crypt:hard:10': true };
    const { state } = readSave(JSON.stringify(json), content);
    expect(state.cards.wishlist).toEqual(['ember_squire']);
    expect(state.combat.stageKills).toEqual({ 'mossy_cellar:normal:10': 5 });
    expect(state.combat.stageChests).toEqual({ 'mossy_cellar:normal:10': 6 });
    expect(state.combat.overflow).toEqual({ 'ember_crypt:hard:10': true });
  });

  it('rejects malformed format 26 data', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw save JSON
    const bad = (mutate: (s: Record<string, any>) => void) => {
      const json = JSON.parse(createSaveText(balanceState(), NOW));
      mutate(json.state);
      return codeOf(() => readSave(JSON.stringify(json), content));
    };
    expect(bad((s) => (s.production.workers = { oak: 'apprentice_feller' }))).toBe(
      'invalid-format',
    );
    expect(bad((s) => (s.production.depth.oak.layer = 0))).toBe('invalid-format');
    expect(bad((s) => (s.production.forge.progress = 'lots'))).toBe('invalid-format');
    expect(bad((s) => (s.automation.reservePercent = 101))).toBe('invalid-format');
    expect(bad((s) => delete s.automation)).toBe('invalid-format');
    expect(bad((s) => (s.combat.stageKills['mossy_cellar:normal:10'] = -1))).toBe('invalid-format');
  });
});
