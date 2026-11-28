import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  ascend,
  createSaveText,
  finishedDifficulty,
  floorPosition,
  isDungeonUnlocked,
  isSpeedUnlocked,
  readSave,
  unlockedDungeons,
  type GameState,
} from '../src/game';
import { floorsContent as content, freshState, openAscension } from './helpers';

const mossy = content.dungeonById.get('mossy_cellar')!;
const ember = content.dungeonById.get('ember_crypt')!;

/** Mossy Cellar fully beaten, Ember Crypt open at floor 15, Thistledown Farm done, a post on Mossy. */
function run(): GameState {
  const s = freshState();
  s.clearedDungeons = ['thistledown_farm', 'mossy_cellar', 'frostspire_vault'];
  s.combat.floors['mossy_cellar'] = {
    difficulty: 'hard',
    autoChallenge: false,
    tiers: { normal: { floor: 10, best: 10 }, hard: { floor: 4, best: 4 } },
  };
  s.combat.floors['ember_crypt'] = {
    difficulty: 'normal',
    autoChallenge: false,
    tiers: { normal: { floor: 15, best: 15 } },
  };
  s.farming.posts['mossy_cellar'] = {
    team: ['ember_squire', null, null, null],
    level: 4,
    xp: 0.5,
    traits: [],
    rerolls: 0,
    upgrade: 1,
    carry: {},
  };
  return openAscension(s);
}

const after = (s: GameState): GameState => {
  const r = ascend(s, content);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('Ascension fully resets the maps (DESIGN.md section 2)', () => {
  it('locks Ember Crypt and every later dungeon again', () => {
    expect(isDungeonUnlocked(run(), content, 'ember_crypt')).toBe(true);
    const s = after(run());
    expect(isDungeonUnlocked(s, content, 'ember_crypt')).toBe(false);
    expect(isDungeonUnlocked(s, content, 'frostspire_vault')).toBe(false);
    expect(unlockedDungeons(s, content).map((d) => d.id)).toEqual(['mossy_cellar']);
  });

  it('starts Mossy Cellar on floor 1, on Normal, with the records kept', () => {
    const s = after(run());
    expect(floorPosition(s, mossy, 'normal')).toMatchObject({ floor: 1, best: 0, record: 10 });
    expect(floorPosition(s, mossy, 'hard')).toMatchObject({ best: 0, record: 4 });
    expect(floorPosition(s, mossy).difficulty).toBe('normal');
    expect(floorPosition(s, ember, 'normal')).toMatchObject({ floor: 1, best: 0, record: 15 });
  });

  it('Head Start skips 10% of the best floor per level (through the shop data)', () => {
    const s = run();
    s.prestige.shop['head_start'] = 2;
    const next = after(s);
    expect(floorPosition(next, ember, 'normal')).toMatchObject({ floor: 3, best: 3, record: 15 });
    // The Mossy Cellar's best is 10 floors: 20% of it is 2, never its boss.
    expect(floorPosition(next, mossy, 'normal')).toMatchObject({ floor: 2, best: 2, record: 10 });
  });

  it('keeps Thistledown Farm done and the farming posts with their levels', () => {
    const before = run();
    const s = after(before);
    expect(s.clearedDungeons).toEqual(['thistledown_farm']);
    expect(s.farming.posts['mossy_cellar']).toEqual(before.farming.posts['mossy_cellar']);
    // The post still counts Mossy Cellar as finished, so it keeps earning.
    expect(finishedDifficulty(s, content, 'mossy_cellar')).toBe('normal');
  });

  it('keeps what a clear opened for good: speed, and no second first-clear', () => {
    const s = after(run());
    expect(isSpeedUnlocked(s, 2)).toBe(true);
    expect(s.clearedBefore).toEqual(
      expect.arrayContaining(['mossy_cellar', 'frostspire_vault', 'thistledown_farm']),
    );
  });
});

describe('save format 51', () => {
  it('is format 51 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(51);
  });

  it('migrates a format 50 save: no earlier runs, each tier record is its best', () => {
    const envelope = JSON.parse(createSaveText(run(), 0)) as {
      version: number;
      state: Record<string, unknown>;
    };
    envelope.version = 50;
    delete envelope.state['clearedBefore'];
    const back = readSave(JSON.stringify(envelope), content).state;
    expect(back.clearedBefore).toEqual([]);
    expect(floorPosition(back, ember, 'normal').record).toBe(15);
    expect(back.clearedDungeons).toContain('mossy_cellar');
  });

  it('round-trips records and earlier clears, and migrates without changing its input', () => {
    const back = readSave(createSaveText(after(run()), 0), content).state;
    expect(back.clearedBefore).toContain('mossy_cellar');
    expect(floorPosition(back, ember, 'normal').record).toBe(15);
    const input = { combat: { floors: { a: { tiers: { normal: { best: 3 } } } } } };
    const copy = structuredClone(input);
    MIGRATIONS[50]!(input);
    expect(input).toEqual(copy);
  });
});
