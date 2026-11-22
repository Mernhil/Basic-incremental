import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  createInitialState,
  createSaveText,
  CURRENT_SAVE_VERSION,
  readSave,
  starterPickDue,
} from '../src/game';

const content = loadContent();

/** Save format 41, the starter weapon (DESIGN.md §2 Starter weapon): a format 40 save. */
describe('v40 -> v41', () => {
  const state = createInitialState(content);
  const parsed = JSON.parse(createSaveText(state, 5_000)) as {
    version: number;
    state: Record<string, unknown>;
  };
  parsed.version = 40;
  delete parsed.state['starter'];
  const loaded = readSave(JSON.stringify(parsed), content);

  it('is a format 40 save and the game is newer', () => {
    expect(parsed.version).toBe(40);
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(41);
  });

  it('offers the pick once, and the screen may be closed', () => {
    expect(loaded.state.starter).toEqual({ done: false, skippable: true });
    expect(starterPickDue(loaded.state, content)).toBe(true);
  });

  it('changes no card', () => {
    expect(Object.keys(loaded.state.cards.owned).sort()).toEqual(
      Object.keys(state.cards.owned).sort(),
    );
    for (const c of Object.values(loaded.state.cards.owned)) expect(c.seal).toBeUndefined();
  });
});
