import { describe, expect, it } from 'vitest';
import { addCard } from '../src/game';
import { createCardsModel } from '../src/renderer/src/pages/cardsAdapter';
import { content, freshState } from './helpers';

const model = createCardsModel(content);

describe('Cards page model', () => {
  it('lists every card, owned commons leading their jobs', () => {
    const entries = model.entries(freshState());
    expect(entries).toHaveLength(content.cards.length);
    const owned = entries.filter((e) => e.owned);
    expect(owned.map((e) => e.role?.slot)).toEqual(['main', 'main', 'main']);
    for (const e of owned) {
      expect(e.next?.kind).toBe('star');
      expect(e.tier).toBeNull(); // commons stop at Wood (rarity caps the tier)
    }
    expect(entries.filter((e) => !e.owned).every((e) => e.next === null && e.tier === null)).toBe(
      true,
    );
  });

  it('adds, moves and removes supports through the loadout rules', () => {
    let state = freshState();
    const rare = content.cards.find((c) => c.job === 'fighting' && c.rarity === 'epic')!;
    state.account.level = 2; // cost cap 8: Squire 2 + an Epic 5
    state = addCard(state, content, rare.id)!.state;
    const added = model.addSupport(state, rare.id);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(model.loadout(added.state, 'fighting').slots[1]).toBe(rare.id);
    const removed = model.remove(added.state, rare.id);
    expect(removed.ok && model.loadout(removed.state, 'fighting').slots[1]).toBe(null);
  });

  it('explains refusals in words', () => {
    const state = freshState();
    const unowned = content.cards.find((c) => !state.cards.owned[c.id])!;
    const result = model.setMain(state, unowned.id);
    expect(result).toEqual({ ok: false, reason: "You don't own this card yet." });
    expect(model.upgrade(state, content.cards[0]!.id, 'star').ok).toBe(false);
  });

  it('changes its signature when a loadout changes', () => {
    const state = freshState();
    const main = model.entries(state).find((e) => e.role?.slot === 'main')!;
    const result = model.remove(state, main.id);
    expect(result.ok && model.signature(result.state)).not.toBe(model.signature(state));
  });
});
