import { describe, expect, it } from 'vitest';
import {
  advance,
  CURRENT_SAVE_VERSION,
  createSaveText,
  Decimal,
  exportSaveString,
  importSaveString,
  loadBestSave,
  readSave,
  SaveError,
  serializeState,
} from '../src/game';
import { constantRng, bareState, plainContent as content, freshState } from './helpers';

/** A state with non-trivial values everywhere. */
function busyState() {
  const strong = bareState();
  strong.combat.damageLevels = { copper_edge: 4999 };
  // 5000 dps for 25 s plus one signature attack: 175,000 damage = 2 kills (2 rares) of 60,000 HP.
  let state = advance(strong, content, 25_000, constantRng(0.001)).state;
  state = {
    ...state,
    prestigeCount: 3,
    resources: { ...state.resources, oak_gem: new Decimal('1.5e500') },
  };
  state.combat.trialBest = { glimmer_trial: 0.5 };
  state.combat.trialAttempt = { elapsedSeconds: 12.5, dealt: new Decimal('3e400') };
  state.bursts.mining = { gauge: 7, timer: 0.25 };
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
    expect(loaded.state.combat.damageLevels).toEqual({ copper_edge: 4999 });
    expect(loaded.state.combat.kills).toEqual({ mossy_cellar: 2 });
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
    // Epic: max level 4 (DESIGN.md 11.1).
    expect(loaded.state.cosmetics.owned['aurora_veil']!.level).toBe(4);
    expect(loaded.state.cosmetics.loadout.slots.border).toBeUndefined();
  });
});

describe('save format v3: production', () => {
  it('round-trips plots, slots, unlocked trees, mine levels and cleared dungeons', () => {
    const state = freshState();
    state.production = {
      logging: { expansions: 2, plots: ['oak', null, 'ironbark'] },
      mining: { expansions: 1, plots: ['copper_quarry', 'iron_deeps'] },
      unlockedTrees: ['ironbark'],
      mineLevels: { copper_quarry: 4, iron_deeps: 1 },
    };
    state.clearedDungeons = ['mossy_cellar'];
    const loaded = readSave(createSaveText(state, NOW), content);
    expect(loaded.state.production).toEqual(state.production);
    expect(loaded.state.clearedDungeons).toEqual(['mossy_cellar']);
  });

  it('drops removed ids and empties plots whose producer is locked', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.production.logging.plots = ['oak', 'moonwillow', 'removed_tree'];
    json.state.production.mining.plots = ['iron_deeps'];
    json.state.production.unlockedTrees = ['removed_tree'];
    json.state.production.mineLevels = { removed_mine: 3, copper_quarry: 2 };
    json.state.clearedDungeons = ['removed_dungeon'];
    const loaded = readSave(JSON.stringify(json), content).state;
    expect(loaded.production.logging.plots).toEqual(['oak', null, null]);
    expect(loaded.production.mining.plots).toEqual([null]);
    expect(loaded.production.unlockedTrees).toEqual([]);
    expect(loaded.production.mineLevels).toEqual({ copper_quarry: 2 });
    expect(loaded.clearedDungeons).toEqual([]);
  });

  it('rejects malformed production data', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.production.logging.expansions = -1;
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
    expect(state.resources['moss_sigil']!.eq(7)).toBe(true);
    expect(state.activeDungeonId).toBe('mossy_cellar');
    expect(state.pity).toEqual({ root_warden: 12 });
    expect(state.production.logging).toEqual({ expansions: 0, plots: ['oak'] });
    expect(state.production.mining).toEqual({ expansions: 0, plots: ['copper_quarry'] });
    // v3 -> v4: the 3 earlier kills were in the Mossy Cellar, so it counts as cleared.
    expect(state.clearedDungeons).toEqual(['mossy_cellar']);
    expect(state.combat.kills).toEqual({ mossy_cellar: 3 });
    expect(state.bossHp).toBeNull();
    expect(serializeState(state).production).toEqual(serializeState(freshState()).production);
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
    expect(state.mastery.bossTiers).toEqual({ mossy_cellar: 2 });
  });

  it('drops totals of resources that are not production gems', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.mastery.harvested = { oak_gem: '5', moss_sigil: '9', removed_gem: '3' };
    const { state } = readSave(JSON.stringify(json), content);
    expect(Object.keys(state.mastery.harvested)).toEqual(['oak_gem']);
  });

  it('rejects malformed mastery data', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.mastery.harvested = { oak_gem: 'lots' };
    expect(codeOf(() => readSave(JSON.stringify(json), content))).toBe('invalid-format');
  });
});
