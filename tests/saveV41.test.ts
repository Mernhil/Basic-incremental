import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  createSaveText,
  newOwnedCard,
  readSave,
} from '../src/game';
import { content, freshState } from './helpers';

/** v40 -> v41, three attacks per card (DESIGN.md §2): every owned card gets a closed skill. */
describe('v40 -> v41 (skills opened with Cores)', () => {
  it('is format 41 or later', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(41);
  });

  it('gives every owned card of a format 40 save a closed skill, and keeps the rest of the card', () => {
    const state = freshState();
    state.cards.owned['brass_vanguard'] = { ...newOwnedCard('bronze'), stars: 3, level: 7 };
    const envelope = JSON.parse(createSaveText(state, 0)) as {
      version: number;
      state: { cards: { owned: Record<string, Record<string, unknown>> } };
    };
    envelope.version = 40;
    for (const c of Object.values(envelope.state.cards.owned)) delete c['skillOpen'];
    const back = readSave(JSON.stringify(envelope), content).state;
    const card = back.cards.owned['brass_vanguard']!;
    expect(card.skillOpen).toBe(false);
    expect(card.stars).toBe(3);
    expect(card.level).toBe(7);
    for (const c of Object.values(back.cards.owned)) expect(c.skillOpen).toBe(false);
  });

  it('migrates the raw cards directly', () => {
    const out = MIGRATIONS[40]!({ cards: { owned: { a: { stars: 1 } } } });
    expect(out).toEqual({ cards: { owned: { a: { stars: 1, skillOpen: false } } } });
  });
});
