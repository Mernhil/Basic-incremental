import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
import { content } from './helpers';

/** Save format 27: the state of the table update (docs/plans/table-update.md, Interfaces). */
const step = MIGRATIONS[26]!;
type Out = Record<string, Record<string, unknown>>;

/** The parts of a serialized state that format 27 added, so the rest can be compared with 0.6.0. */
const V27_TOP = ['summon', 'presets', 'discoveredBonds', 'expeditions', 'ascensionChallenges'];
const V27_COMBAT = ['enemyIndex', 'challenge', 'challengeWaitSeconds', 'cardDamage'];

describe('v26 -> v27 (the table update)', () => {
  it('is the current format', () => {
    expect(CURRENT_SAVE_VERSION).toBe(27);
  });

  it('turns the crystals held into scrolls at the pull price, rounded down, and keeps the crystals', () => {
    expect(V27_CRYSTALS_PER_SCROLL).toBe(300);
    const out = step({
      resources: { summon_crystal: '1526', glamour_crystal: '299.9', money: '5' },
    }) as Out;
    expect(out.resources).toEqual({
      summon_crystal: '1526',
      glamour_crystal: '299.9',
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
      floors: {},
      enemyIndex: 0,
      challenge: null,
      challengeWaitSeconds: 0,
      cardDamage: {},
    });
    expect(out.summon).toEqual({ focusKind: null, dailyClaimedDay: null });
    expect(out.presets).toEqual({
      dungeons: {},
      production: { logging: [null, null, null], mining: [null, null, null] },
    });
    expect(out['discoveredBonds']).toEqual([]);
    expect(out.expeditions).toEqual({ trips: [] });
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
    expect(state.resources['glamour_scroll']!.toString()).toBe('3'); // 1,044.5 crystals
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
    expect(again).toEqual({ ...saved.state, bossHp: null });

    // Saved again it is format 27 and loads to the same state.
    const resaved = createSaveText(state, 1);
    expect(JSON.parse(resaved).version).toBe(27);
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
      mode: 'farm',
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
