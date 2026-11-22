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

/** Save format 43, the starter weapon (DESIGN.md §2 Starter weapon): a format 42 save. */
describe('v42 -> v43', () => {
  const state = createInitialState(content);
  const parsed = JSON.parse(createSaveText(state, 5_000)) as {
    version: number;
    state: Record<string, unknown>;
  };
  parsed.version = 42;
  delete parsed.state['starter'];
  const loaded = readSave(JSON.stringify(parsed), content);

  it('is a format 42 save and the game is newer', () => {
    expect(parsed.version).toBe(42);
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(43);
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
