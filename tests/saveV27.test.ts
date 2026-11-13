import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advance,
  ascend,
  createInitialState,
  createSaveText,
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  readSave,
  serializeState,
  V27_CRYSTALS_PER_SCROLL,
  type GameState,
} from '../src/game';
import { loadContent } from '../src/data';
import { content } from './helpers';

/** The shipped numbers: the play-through tests below need the real floors. */
const real = loadContent();

/** Save format 27: the state of the table update. */
const step = MIGRATIONS[26]!;
type Out = Record<string, Record<string, unknown>>;

/** The parts of a serialized state that format 27 added, so the rest can be compared with 0.6.0. */
const V27_TOP = ['summon', 'presets', 'discoveredBonds', 'expeditions', 'ascensionChallenges'];
const V27_COMBAT = ['enemyIndex', 'challenge', 'challengeWaitSeconds', 'cardDamage', 'cardsOut'];

const owned = (tier: string, stars: number, level: number) => ({ tier, stars, level });

describe('v26 -> v27: the team and the floor of an old save (DESIGN.md §6)', () => {
  const lone = (extra: Record<string, unknown> = {}) => ({
    account: { level: 1 },
    activeDungeonId: 'ember_crypt',
    cards: {
      loadouts: { fighting: { main: 'ember_squire', supports: [null, null, null] } },
      owned: {
        ember_squire: owned('wood', 6, 20),
        apprentice_feller: owned('wood', 1, 20), // a logging card: never a fighter
        field_reaper: owned('wood', 1, 1),
        hedge_acolyte: owned('wood', 1, 9),
        hollow_spearman: owned('wood', 1, 1), // uncommon, cost 3
        golden_sage: owned('wood', 1, 1), // epic, cost 6
      },
    },
    combat: {
      floors: {
        mossy_cellar: { difficulty: 'normal', tiers: { normal: { floor: 10, best: 10 } } },
      } as Record<string, unknown>,
    },
    ...extra,
  });
  const supports = (out: Record<string, unknown>) =>
    ((out['cards'] as Out)['loadouts']!['fighting'] as { supports: unknown[] }).supports;

  it('fills the support slots with the best owned fighters the cost cap allows', () => {
    // Cap 6, the Squire costs 2: two more slots of the cheapest cost fit, so the uncommon (3)
    // and the epic (6) stay out and the higher-level common comes first.
    expect(supports(step(lone()))).toEqual(['hedge_acolyte', 'field_reaper', null]);
  });

  it('fills all three slots when the cap allows, best first, and keeps the main card', () => {
    const out = step(lone({ account: { level: 6 } })); // cap 16
    expect(supports(out)).toEqual(['golden_sage', 'hollow_spearman', 'hedge_acolyte']);
    expect(((out['cards'] as Out)['loadouts']!['fighting'] as { main: string }).main).toBe(
      'ember_squire',
    );
  });

  it('leaves a filled slot alone and never repeats a card', () => {
    const save = lone();
    (save.cards.loadouts.fighting as { supports: unknown[] }).supports = [
      'field_reaper',
      null,
      null,
    ];
    expect(supports(step(save))).toEqual(['field_reaper', 'hedge_acolyte', null]);
  });

  it('moves a player off a dungeon with nothing beaten to the last dungeon with a beaten floor', () => {
    expect(step(lone())['activeDungeonId']).toBe('mossy_cellar');
    expect(step(lone({ activeDungeonId: 'mossy_cellar' }))['activeDungeonId']).toBe('mossy_cellar');
  });

  it('keeps a player where a floor is beaten, and where nothing is beaten anywhere', () => {
    const beaten = lone({ activeDungeonId: 'ember_crypt' });
    (beaten.combat.floors as Record<string, unknown>)['ember_crypt'] = {
      difficulty: 'normal',
      tiers: { normal: { floor: 3, best: 3 } },
    };
    expect(step(beaten)['activeDungeonId']).toBe('ember_crypt');
    const none = lone();
    none.combat.floors = {};
    expect(step(none)['activeDungeonId']).toBe('ember_crypt');
  });

  it('the 0.6.0 fixture farms on from the migrated save: no knockout loop in two minutes', () => {
    const text = readFileSync(resolve(__dirname, 'fixtures/saves/v26-0.6.0.save.txt'), 'utf8');
    let state = readSave(text, real).state;
    expect(state.cards.loadouts.fighting.supports.filter((id) => id !== null)).toHaveLength(2);
    const farmed = state.combat.floors[state.activeDungeonId!]!.tiers['normal']!;
    expect(farmed.best).toBeGreaterThan(0);
    expect(state.combat.knockoutSeconds).toBe(0); // the old save was parked mid-knockout
    let knockouts = 0;
    let out = false;
    for (let s = 0; s < 120; s++) {
      state = advance(state, real, 1000, () => 0.5).state;
      if (state.combat.knockoutSeconds > 0 && !out) knockouts++;
      out = state.combat.knockoutSeconds > 0;
    }
    // At most one stumble on the boss floor (it drops one floor), then it farms: no loop.
    expect(knockouts).toBeLessThanOrEqual(1);
    expect(state.combat.knockoutSeconds).toBe(0);
    expect(state.combat.floors[state.activeDungeonId!]!.tiers['normal']!.floor).toBeGreaterThan(0);
  });

  it('a brand-new game never opens on a knocked-out fight', () => {
    let state = createInitialState(real);
    for (let s = 0; s < 60; s++) {
      state = advance(state, real, 1000, () => 0.5).state;
      expect(state.combat.cardsOut).toEqual([]);
      expect(state.combat.knockoutSeconds).toBe(0);
    }
  });
});

describe('v26 -> v27 (the table update)', () => {
  it('is an older format than the current one', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThan(27);
  });

  it('turns the crystals held into scrolls at the pull price, rounded down, and drops the crystals', () => {
    expect(V27_CRYSTALS_PER_SCROLL).toBe(300);
    const out = step({
      resources: { summon_crystal: '1526', glamour_crystal: '299.9', money: '5' },
    }) as Out;
    expect(out.resources).toEqual({
      money: '5',
      summon_scroll: '5',
      glamour_scroll: '0',
    });
  });

  it('switches auto-challenge on where a dungeon was pushing and off where it was farming', () => {
    const out = step({
      combat: {
        floors: {
          a: { difficulty: 'normal', mode: 'push', tiers: {} },
          b: { difficulty: 'hard', mode: 'farm', tiers: { hard: { floor: 3, best: 2 } } },
        },
        stageKills: { 'a:normal:10': 3 },
      },
    }) as Out;
    expect(out.combat!['floors']).toEqual({
      a: { difficulty: 'normal', mode: 'push', autoChallenge: true, tiers: {} },
      b: {
        difficulty: 'hard',
        mode: 'farm',
        autoChallenge: false,
        tiers: { hard: { floor: 3, best: 2 } },
      },
    });
    expect(out.combat!['stageKills']).toEqual({ 'a:normal:10': 3 });
  });

  it('starts the fight fresh and every new part empty', () => {
    const out = step({ bossHp: '55', combat: { loadoutDamage: '7' } }) as Out & {
      bossHp: unknown;
    };
    expect(out.bossHp).toBeNull();
    expect(out.combat).toEqual({
      loadoutDamage: '7',
      knockoutSeconds: 0,
      floors: {},
      enemyIndex: 0,
      challenge: null,
      challengeWaitSeconds: 0,
      cardDamage: {},
      cardsOut: [],
    });
    expect(out.summon).toEqual({ focusKind: null, dailyClaimedDay: null });
    expect(out.presets).toEqual({
      dungeons: {},
      production: { logging: [null, null, null], mining: [null, null, null] },
    });
    expect(out['discoveredBonds']).toEqual([]);
    expect(out.expeditions).toEqual({ trips: [], completed: 0 });
    expect(out.ascensionChallenges).toEqual({ active: null, completions: {} });
  });

  it('copes with a payload missing every part it reads', () => {
    const out = step({}) as Out;
    expect(out.resources).toEqual({ summon_scroll: '0', glamour_scroll: '0' });
    expect(out.combat!['floors']).toEqual({});
  });

  it('loads a format 26 save written by the 0.6.0 game and keeps everything it held', () => {
    const text = readFileSync(resolve(__dirname, 'fixtures/saves/v26-0.6.0.save.txt'), 'utf8');
    const saved = JSON.parse(text) as { version: number; state: Record<string, unknown> };
    expect(saved.version).toBe(26);
    const { state } = readSave(text, content);

    // The new parts are what the migration gave.
    expect(state.resources['summon_scroll']!.toString()).toBe('5'); // 1,526 crystals
    // 1,044.5 crystals, and the save owned Gilded Numerals and Hex Lattice, which format 28 refunds at 0.2 each
    expect(state.resources['glamour_scroll']!.toString()).toBe('3.4');
    expect(state.combat.floors['mossy_cellar']!.autoChallenge).toBe(true);
    expect(state.combat.floors['ember_crypt']!.autoChallenge).toBe(false);
    expect(state.combat.enemyIndex).toBe(0);
    expect(state.combat.challenge).toBeNull();
    expect(state.summon.focusKind).toBeNull();
    expect(state.discoveredBonds).toEqual([]);

    // Everything else is what 0.6.0 wrote: written again and stripped of the format 27 parts, it
    // is the same save.
    const again = serializeState(state) as unknown as Record<string, unknown>;
    for (const key of V27_TOP) delete again[key];
    const combat = again['combat'] as Record<string, unknown>;
    for (const key of V27_COMBAT) delete combat[key];
    for (const p of Object.values(combat['floors'] as Record<string, Record<string, unknown>>)) {
      delete p['autoChallenge'];
    }
    const resources = again['resources'] as Record<string, unknown>;
    delete resources['summon_scroll'];
    delete resources['glamour_scroll'];
    // The push / farm `mode` is gone: auto-challenge replaced it (package 2).
    const expected = structuredClone(saved.state);
    const floors = (expected['combat'] as Record<string, unknown>)['floors'];
    for (const p of Object.values(floors as Record<string, Record<string, unknown>>)) {
      delete p['mode'];
    }
    // The shared health pool is gone: each team card's own health replaced it (package 7).
    delete (expected['combat'] as Record<string, unknown>)['loadoutDamage'];
    // A knockout the old save was parked in does not carry over.
    (expected['combat'] as Record<string, unknown>)['knockoutSeconds'] = 0;
    // the crystals became scrolls: the save no longer holds them
    const kept = expected['resources'] as Record<string, unknown>;
    delete kept['summon_crystal'];
    delete kept['glamour_crystal'];
    // Format 28 took the removed cosmetics (the four starters, Gilded Numerals, Hex Lattice) out.
    const ownedCosmetics = (expected['cosmetics'] as { owned: Record<string, unknown> }).owned;
    for (const id of ['gn_attack', 'gn_finish', 'gn_tick', 'gn_number', 'gt_tick', 'holo_hex']) {
      delete ownedCosmetics[id];
    }
    // The team was filled and the player moved off the dungeon with nothing beaten (below).
    const exp = expected as { cards: { loadouts: { fighting: { supports: unknown[] } } } };
    exp.cards.loadouts.fighting.supports = state.cards.loadouts.fighting.supports;
    // Format 29 moved the numbers onto the readable scale (DESIGN.md §14 Readable numbers).
    // Format 30 added the Heirloom Gate's state (no Heirloom-tier card in this save); format 31 made Plum Pixel an owned table.
    const scaled = MIGRATIONS[30]!(MIGRATIONS[29]!(MIGRATIONS[28]!(expected))) as Record<
      string,
      unknown
    >;
    delete scaled['heirloomMigration'];
    // The new starter table is filled in when the save is read (starters are always owned).
    (scaled['cosmetics'] as { owned: Record<string, unknown> }).owned['castle_stone_table'] = {
      level: 1,
      copies: 1,
    };
    const scaledCombat = scaled['combat'] as Record<string, unknown>;
    for (const key of Object.keys(scaledCombat)) if (!(key in combat)) delete scaledCombat[key];
    delete (scaled['resources'] as Record<string, unknown>)['summon_scroll'];
    delete (scaled['resources'] as Record<string, unknown>)['glamour_scroll'];
    delete resources['heirloom_scroll'];
    expect(again).toEqual({ ...scaled, bossHp: null, activeDungeonId: 'mossy_cellar' });

    // Saved again it is the current format and loads to the same state.
    const resaved = createSaveText(state, 1);
    expect(JSON.parse(resaved).version).toBe(CURRENT_SAVE_VERSION);
    expect(readSave(resaved, content).state).toEqual(state);
  });
});

describe('format 27 state', () => {
  it('starts a new game with one Summon Scroll and every new part empty', () => {
    const state = createInitialState(content);
    expect(state.resources['summon_scroll']!.toString()).toBe('1');
    expect(state.resources['glamour_scroll']!.toString()).toBe('0');
    expect(state.combat).toMatchObject({
      enemyIndex: 0,
      challenge: null,
      challengeWaitSeconds: 0,
      cardDamage: {},
      cardsOut: [],
    });
    expect(state.presets.production.logging).toEqual([null, null, null]);
    expect(state.expeditions.trips).toEqual([]);
    expect(state.ascensionChallenges).toEqual({ active: null, completions: {} });
  });

  /** A state with every format 27 part filled in. */
  function filled(): GameState {
    const state = createInitialState(content);
    state.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 4, best: 4 } },
    };
    state.combat.enemyIndex = 2;
    state.combat.challenge = {
      dungeonId: 'mossy_cellar',
      difficulty: 'normal',
      elapsedSeconds: 12.5,
    };
    state.combat.challengeWaitSeconds = 30;
    state.combat.cardDamage = { ember_squire: new Decimal('1e5') };
    state.summon = { focusKind: 'hammer', dailyClaimedDay: '2026-11-11' };
    state.presets.dungeons['mossy_cellar'] = {
      main: 'ember_squire',
      supports: [null, null, null],
    };
    state.presets.production.logging[1] = {
      name: 'Oaks',
      workers: { oak: ['apprentice_feller'] },
    };
    state.discoveredBonds = ['old_growth'];
    state.expeditions.trips = [
      { cardId: 'cave_digger', placeId: 'mossy_outskirts', hours: 4, elapsedSeconds: 100 },
    ];
    state.ascensionChallenges = { active: null, completions: {} };
    return state;
  }

  it('saves and loads every new part unchanged', () => {
    const state = filled();
    expect(readSave(createSaveText(state, 1), content).state).toEqual(state);
  });

  it('drops what the game does not have or the player does not own on load', () => {
    const state = filled();
    state.combat.challenge = { dungeonId: 'gone', difficulty: 'normal', elapsedSeconds: 1 };
    state.combat.cardDamage = { ember_squire: new Decimal(1), dawnblade_regent: new Decimal(1) };
    state.combat.cardsOut = ['ember_squire', 'ember_squire', 'dawnblade_regent', 'cave_digger'];
    state.summon.focusKind = 'twin_blades';
    state.presets.dungeons['gone'] = { main: 'ember_squire', supports: [null, null, null] };
    state.presets.dungeons['ember_crypt'] = {
      main: 'apprentice_feller', // not a fighting card
      supports: ['ember_squire', 'ember_squire', 'dawnblade_regent'], // repeat, not owned
    };
    state.presets.production.mining[0] = {
      name: 'Mixed',
      workers: { copper_quarry: ['cave_digger', 'apprentice_feller'], oak: ['cave_digger'] },
    };
    state.discoveredBonds = ['old_growth', 'old_growth', 'no_such_bond'];
    state.expeditions.trips = [
      { cardId: 'cave_digger', placeId: 'mossy_outskirts', hours: 4, elapsedSeconds: 1 },
      { cardId: 'cave_digger', placeId: 'ember_catacombs', hours: 1, elapsedSeconds: 1 },
      { cardId: 'apprentice_feller', placeId: 'nowhere', hours: 1, elapsedSeconds: 1 },
      { cardId: 'apprentice_feller', placeId: 'mossy_outskirts', hours: 2, elapsedSeconds: 1 },
    ];
    state.ascensionChallenges = { active: 'no_such_challenge', completions: { gone: 2 } };

    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.combat.challenge).toBeNull();
    expect(Object.keys(loaded.combat.cardDamage)).toEqual(['ember_squire']);
    expect(loaded.combat.cardsOut).toEqual(['ember_squire']);
    expect(loaded.summon.focusKind).toBeNull();
    expect(loaded.presets.dungeons).toEqual({
      mossy_cellar: { main: 'ember_squire', supports: [null, null, null] },
      ember_crypt: { main: null, supports: ['ember_squire', null, null] },
    });
    expect(loaded.presets.production.mining[0]).toEqual({
      name: 'Mixed',
      workers: { copper_quarry: ['cave_digger'] },
    });
    expect(loaded.discoveredBonds).toEqual(['old_growth']);
    expect(loaded.expeditions.trips).toEqual([
      { cardId: 'cave_digger', placeId: 'mossy_outskirts', hours: 4, elapsedSeconds: 1 },
    ]);
    expect(loaded.ascensionChallenges).toEqual({ active: null, completions: {} });
  });

  it('saves and loads a new game unchanged', () => {
    const state = createInitialState(content);
    expect(readSave(createSaveText(state, 1), content).state).toEqual(state);
  });
});

describe('format 27 state through an Ascension', () => {
  it('keeps the scrolls, presets, bonds, expeditions and challenge progress', () => {
    const before = createInitialState(content);
    before.mastery.harvested['oak_gem'] = new Decimal(1e14);
    before.resources['summon_scroll'] = new Decimal(4);
    before.resources['glamour_scroll'] = new Decimal(2);
    before.presets.dungeons['mossy_cellar'] = {
      main: 'ember_squire',
      supports: [null, null, null],
    };
    before.discoveredBonds = ['old_growth'];
    before.expeditions.trips = [
      { cardId: 'cave_digger', placeId: 'mossy_outskirts', hours: 1, elapsedSeconds: 5 },
    ];
    before.ascensionChallenges.completions = { some_challenge: 1 };
    before.summon.focusKind = 'bow';
    const r = ascend(before, content);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    expect(s.resources['summon_scroll']!.toNumber()).toBe(4);
    expect(s.resources['glamour_scroll']!.toNumber()).toBe(2);
    expect(s.presets).toEqual(before.presets);
    expect(s.discoveredBonds).toEqual(before.discoveredBonds);
    expect(s.expeditions).toEqual(before.expeditions);
    expect(s.ascensionChallenges).toEqual(before.ascensionChallenges);
    expect(s.summon).toEqual(before.summon);
  });
});
