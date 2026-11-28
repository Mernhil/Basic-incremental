import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  createNewGame,
  createSaveText,
  initialProgress,
  isDungeonUnlocked,
  readSave,
} from '../src/game';
import { loadContent } from '../src/data';
import { freshState } from './helpers';

const content = loadContent();

/** v49 -> v50, the tutorial area Thistledown Farm (DESIGN.md section 2): a save with a beaten
 *  Mossy Cellar floor counts the area as done and gets no cards; one without starts in the area. */
function asV49(state: ReturnType<typeof freshState>): {
  version: number;
  state: Record<string, unknown>;
} {
  const envelope = JSON.parse(createSaveText(state, 0)) as {
    version: number;
    state: Record<string, unknown>;
  };
  envelope.version = 49;
  delete envelope.state['tutorial'];
  return envelope;
}

describe('v49 -> v50 (the tutorial area)', () => {
  it('is format 50 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(50);
  });

  it('counts the area as done for a save with a beaten Mossy Cellar floor', () => {
    const s = freshState();
    s.combat.floors['mossy_cellar'] = initialProgress();
    s.combat.floors['mossy_cellar']!.tiers.normal = { best: 4, floor: 4 };
    s.activeDungeonId = 'mossy_cellar';
    const back = readSave(JSON.stringify(asV49(s)), content).state;
    expect(back.tutorial).toEqual({ given: 3 });
    expect(isDungeonUnlocked(back, content, 'mossy_cellar')).toBe(true);
    expect(back.activeDungeonId).toBe('mossy_cellar');
    expect(back.cards.owned['ember_squire']).toBeDefined();
  });

  it('counts a cleared Mossy Cellar as done too', () => {
    const s = freshState();
    s.clearedDungeons = ['mossy_cellar'];
    const back = readSave(JSON.stringify(asV49(s)), content).state;
    expect(back.tutorial).toEqual({ given: 3 });
  });

  it('starts a save with nothing beaten in the area, Mossy Cellar locked behind it', () => {
    const s = createNewGame(content);
    s.activeDungeonId = 'mossy_cellar';
    const env = asV49(s);
    const back = readSave(JSON.stringify(env), content).state;
    expect(back.tutorial).toEqual({ given: 0 });
    expect(back.activeDungeonId).toBe('thistledown_farm');
    expect(isDungeonUnlocked(back, content, 'mossy_cellar')).toBe(false);
  });

  it('round-trips the new format and migrates without changing its input', () => {
    const s = createNewGame(content);
    s.tutorial.given = 2;
    const back = readSave(createSaveText(s, 0), content).state;
    expect(back.tutorial).toEqual({ given: 2 });
    const input = { a: 1 };
    MIGRATIONS[49]!(input);
    expect(input).toEqual({ a: 1 });
  });
});
