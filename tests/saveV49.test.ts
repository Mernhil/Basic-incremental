import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  createSaveText,
  initialArena,
  newOwnedCard,
  readSave,
} from '../src/game';
import { content, freshState } from './helpers';

/** v48 -> v49, the arena and the raid shops (DESIGN.md Arena and raids): an empty arena record,
 *  run after farming's 47 -> 48 step, so farming posts must survive it. */
describe('v48 -> v49 (the arena)', () => {
  it('is format 49 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(49);
  });

  it('gives a format 48 save with farming posts an empty arena record and keeps the rest', () => {
    const state = freshState();
    state.prestigeCount = 3;
    state.raids.best = { tide_queen: 0.4 };
    state.cards.owned['ember_squire'] = newOwnedCard('wood');
    state.farming.posts['mossy_cellar'] = {
      team: ['ember_squire', null, null, null],
      level: 7,
      xp: 0.5,
      traits: [],
      rerolls: 2,
      upgrade: 3,
      carry: {},
    };
    const envelope = JSON.parse(createSaveText(state, 0)) as {
      version: number;
      state: Record<string, unknown>;
    };
    envelope.version = 48;
    delete envelope.state['arena'];
    const back = readSave(JSON.stringify(envelope), content).state;
    expect(back.arena).toEqual(initialArena());
    expect(back.prestigeCount).toBe(3);
    expect(back.raids.best).toEqual({ tide_queen: 0.4 });
    expect(back.farming.posts['mossy_cellar']).toMatchObject({ level: 7, upgrade: 3 });
  });

  it('runs after the farming step: a format 47 save gets both', () => {
    const envelope = JSON.parse(createSaveText(freshState(), 0)) as {
      version: number;
      state: Record<string, unknown>;
    };
    envelope.version = 47;
    delete envelope.state['arena'];
    delete envelope.state['farming'];
    const back = readSave(JSON.stringify(envelope), content).state;
    expect(back.farming).toEqual({ posts: {} });
    expect(back.arena).toEqual(initialArena());
  });

  it('migrates the raw state directly, without changing its input', () => {
    const input = { a: 1 };
    const out = MIGRATIONS[48]!(input) as Record<string, unknown>;
    expect(input).toEqual({ a: 1 });
    expect(out['a']).toBe(1);
    expect(out['arena']).toEqual(initialArena());
  });

  it('drops a bought Heirloom the game no longer has', () => {
    const state = freshState();
    state.arena.bought = ['laurel_staff', 'no_such_card'];
    const back = readSave(createSaveText(state, 0), content).state;
    expect(back.arena.bought).toEqual(['laurel_staff']);
  });
});
