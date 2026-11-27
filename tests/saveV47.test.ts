import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  createSaveText,
  initialArena,
  readSave,
} from '../src/game';
import { content, freshState } from './helpers';

/** v47 -> v48, the arena and the raid shops (DESIGN.md Arena and raids): an empty arena record. */
describe('v47 -> v48 (the arena)', () => {
  it('is format 48 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(48);
  });

  it('gives a format 47 save an empty arena record and keeps the rest', () => {
    const state = freshState();
    state.prestigeCount = 3;
    state.raids.best = { tide_queen: 0.4 };
    const envelope = JSON.parse(createSaveText(state, 0)) as {
      version: number;
      state: Record<string, unknown>;
    };
    envelope.version = 47;
    delete envelope.state['arena'];
    const back = readSave(JSON.stringify(envelope), content).state;
    expect(back.arena).toEqual(initialArena());
    expect(back.prestigeCount).toBe(3);
    expect(back.raids.best).toEqual({ tide_queen: 0.4 });
  });

  it('migrates the raw state directly, without changing its input', () => {
    const input = { a: 1 };
    const out = MIGRATIONS[47]!(input) as Record<string, unknown>;
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
