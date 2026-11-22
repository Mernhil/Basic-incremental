import { describe, expect, it } from 'vitest';
import { CURRENT_SAVE_VERSION, MIGRATIONS, createSaveText, readSave } from '../src/game';
import { content, freshState } from './helpers';

/** v43 -> v44, raid bosses (DESIGN.md §2): an empty raid record; it is saved and loaded. */
describe('v43 -> v44 (raids)', () => {
  it('is format 44 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(44);
  });

  it('gives a format 43 save an empty raid record and keeps the rest', () => {
    const state = freshState();
    state.prestigeCount = 2;
    const envelope = JSON.parse(createSaveText(state, 0)) as {
      version: number;
      state: Record<string, unknown>;
    };
    envelope.version = 43;
    delete envelope.state['raids'];
    const back = readSave(JSON.stringify(envelope), content).state;
    expect(back.raids).toEqual({ day: null, used: {}, best: {}, paid: {}, level: {} });
    expect(back.prestigeCount).toBe(2);
  });

  it('migrates the raw state directly', () => {
    expect(MIGRATIONS[43]!({ a: 1 })).toEqual({
      a: 1,
      raids: { day: null, used: {}, best: {}, paid: {}, level: {} },
    });
  });

  it('saves and loads tries, best scores and paid ranks', () => {
    const state = freshState();
    state.raids = {
      day: '2026-12-01',
      used: { tide_queen: 2 },
      best: { tide_queen: 0.42 },
      paid: { tide_queen: 8 },
      level: { tide_queen: 2 },
    };
    const back = readSave(createSaveText(state, 0), content).state;
    expect(back.raids).toEqual(state.raids);
  });
});
