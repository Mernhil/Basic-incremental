import { describe, expect, it } from 'vitest';
import { addCard } from '../src/game';
import { createCardsModel } from '../src/renderer/src/pages/cardsAdapter';
import { slotChoices } from '../src/renderer/src/pages/cardsModel';
import { content, freshState } from './helpers';

const model = createCardsModel(content);

describe('Cards page model', () => {
  it('lists every card: the Squire leads, the two other commons work', () => {
    const entries = model.entries(freshState());
    expect(entries).toHaveLength(content.cards.length);
    const owned = entries.filter((e) => e.owned);
    expect(owned.map((e) => [e.id, e.role?.slot ?? null, e.workplace])).toEqual([
      ['ember_squire', 'main', null],
      ['apprentice_feller', null, 'Oak'],
      ['cave_digger', null, 'Copper Quarry'],
    ]);
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

  it('keeps workers out of the loadout: they work on the Production page', () => {
    const state = freshState();
    expect(model.setMain(state, 'apprentice_feller').ok).toBe(false);
    expect(model.addSupport(state, 'cave_digger').ok).toBe(false);
    const feller = model.entries(state).find((e) => e.id === 'apprentice_feller')!;
    expect(feller.supportEffect).toBe('');
    expect(feller.mainAbility).toBe('+20% card XP here');
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

  it('offers a slot the cards of its job with what picking each would cost', () => {
    let state = freshState();
    const epic = content.cards.find((c) => c.job === 'fighting' && c.rarity === 'epic')!;
    const mythic = content.cards.find((c) => c.job === 'fighting' && c.rarity === 'mythic')!;
    state.account.level = 2; // cost cap 8: the Squire costs 2, an Epic 6, a Mythic 14
    state = addCard(state, content, epic.id)!.state;
    state = addCard(state, content, mythic.id)!.state;
    const lo = model.loadout(state, 'fighting');
    const choices = slotChoices(model.entries(state), lo, 1);
    // Only owned fighting cards; the ones that fit lead, the costliest first.
    expect(choices.map((c) => c.id)).toEqual([epic.id, 'ember_squire', mythic.id]);
    expect(choices[0]).toMatchObject({ from: null, current: false, costAfter: 8, fits: true });
    // The main card would swap into the support slot: the cost stays.
    expect(choices[1]).toMatchObject({ from: 0, costAfter: lo.cost, fits: true });
    expect(choices[2]).toMatchObject({ costAfter: 16, fits: false });
  });

  it('places a card in a slot and swaps two cards of a loadout', () => {
    let state = freshState();
    const epic = content.cards.find((c) => c.job === 'fighting' && c.rarity === 'epic')!;
    state.account.level = 2;
    state = addCard(state, content, epic.id)!.state;
    const placed = model.place(state, 2, epic.id);
    if (!placed.ok) throw new Error(placed.reason);
    expect(model.loadout(placed.state, 'fighting').slots).toEqual([
      'ember_squire',
      null,
      epic.id,
      null,
    ]);
    // Picking the support for the main slot swaps it with the main card.
    const swapped = model.place(placed.state, 0, epic.id);
    if (!swapped.ok) throw new Error(swapped.reason);
    expect(model.loadout(swapped.state, 'fighting').slots).toEqual([
      epic.id,
      null,
      'ember_squire',
      null,
    ]);
    const current = slotChoices(
      model.entries(swapped.state),
      model.loadout(swapped.state, 'fighting'),
      0,
    );
    expect(current.find((c) => c.id === epic.id)!.current).toBe(true);
  });
});
