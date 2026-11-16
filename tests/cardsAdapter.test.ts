import { cardStyle } from '../src/data';
import { describe, expect, it } from 'vitest';
import { addCard, cardDisplayName, itemName } from '../src/game';
import { RANK_TIERS } from '../src/data/schemas';
import { createCardsModel, previewArt, previewTiers } from '../src/renderer/src/pages/cardsAdapter';
import { slotChoices } from '../src/renderer/src/pages/cardsModel';
import { content, freshState } from './helpers';

const model = createCardsModel(content);

describe('Cards page model', () => {
  it('lists every card: the Squire leads, the two other commons work', () => {
    const entries = model.entries(freshState());
    expect(entries).toHaveLength(content.cards.length);
    const owned = entries.filter((e) => e.owned);
    expect(owned.map((e) => [e.id, e.role?.slot ?? null, e.workplace])).toEqual([
      ['ember_squire', 0, null],
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

  it('adds, moves and removes loadout cards through the loadout rules', () => {
    let state = freshState();
    const rare = content.cards.find((c) => c.job === 'fighting' && cardStyle(c) === 'epic')!;
    state.account.level = 2; // cost cap 8: Squire 2 + an Epic 5
    state = addCard(state, content, rare.id)!.state;
    const added = model.addToLoadout(state, rare.id);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(model.loadout(added.state, 'fighting').slots[1]).toBe(rare.id);
    const removed = model.remove(added.state, rare.id);
    expect(removed.ok && model.loadout(removed.state, 'fighting').slots[1]).toBe(null);
  });

  it('keeps workers out of the loadout: they work on the Production page', () => {
    const state = freshState();
    expect(model.addToLoadout(state, 'apprentice_feller').ok).toBe(false);
    expect(model.addToLoadout(state, 'cave_digger').ok).toBe(false);
    const feller = model.entries(state).find((e) => e.id === 'apprentice_feller')!;
    expect(feller.teamBonus).toBe('');
    expect(feller.ability).toBe('+20% card XP here');
  });

  it('explains refusals in words', () => {
    const state = freshState();
    const unowned = content.cards.find((c) => !state.cards.owned[c.id])!;
    const result = model.addToLoadout(state, unowned.id);
    expect(result).toEqual({ ok: false, reason: "You don't own this card yet." });
    expect(model.upgrade(state, content.cards[0]!.id, 'star').ok).toBe(false);
  });

  it('changes its signature when a loadout changes', () => {
    const state = freshState();
    const main = model.entries(state).find((e) => e.role?.slot === 0)!;
    const result = model.remove(state, main.id);
    expect(result.ok && model.signature(result.state)).not.toBe(model.signature(state));
  });

  it('offers a slot the cards of its job with what picking each would cost', () => {
    let state = freshState();
    const epic = content.cards.find((c) => c.job === 'fighting' && cardStyle(c) === 'epic')!;
    const mythic = content.cards.find((c) => c.job === 'fighting' && cardStyle(c) === 'mythic')!;
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
    const epic = content.cards.find((c) => c.job === 'fighting' && cardStyle(c) === 'epic')!;
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

describe('Next tier preview', () => {
  const byRarity = (r: string) => content.cards.find((c) => cardStyle(c) === r)!;

  it("steps from the card's own tier through the type's weapons of the higher tiers, up to T6", () => {
    const first: Record<string, string> = {
      common: 'wood',
      uncommon: 'bronze',
      rare: 'silver',
      epic: 'gold',
      legendary: 'prismatic',
    };
    for (const [style, own] of Object.entries(first)) {
      const tiers = previewTiers(content, byRarity(style).id);
      expect(tiers[0]).toBe(own);
      expect(tiers[tiers.length - 1]).toBe('mythic');
    }
    expect(previewTiers(content, byRarity('epic').id)).toEqual(['gold', 'prismatic', 'mythic']);
    // a T6 card and an Heirloom card have only their own
    expect(previewTiers(content, byRarity('void').id)).toEqual(['mythic']);
    expect(previewTiers(content, content.cards.find((c) => c.heirloom)!.id)).toEqual(['heirloom']);
  });

  it('cycles round to the own tier and never touches the state', () => {
    const card = byRarity('common');
    const state = freshState();
    const before = JSON.stringify(state);
    const stops = [0, 1, 2, 3, 4, 5, 6].map((i) => model.preview(state, card.id, i));
    expect(stops.slice(0, 6).map((p) => p!.tierName)).toEqual([
      'Wood',
      'Bronze',
      'Silver',
      'Gold',
      'Prismatic',
      'Mythic',
    ]);
    expect(stops[0]!.own).toBe(true);
    expect(stops[6]!.own).toBe(true); // back to the own tier
    expect(stops[4]!.itemName).toBe(itemName(content, card.item.kind, 'prismatic', undefined));
    expect(stops[1]!.item).not.toBe(stops[0]!.item);
    expect(stops[1]!.item).toBe(previewArt(card, 'bronze'));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('has nothing for a T6 card, an Heirloom or an unknown card', () => {
    expect(model.preview(freshState(), byRarity('void').id, 1)).toBeNull();
    expect(model.preview(freshState(), content.cards.find((c) => c.heirloom)!.id, 1)).toBeNull();
    expect(model.preview(freshState(), 'nope', 1)).toBeNull();
  });
});

describe("cardDisplayName: a card has one name, its weapon's (DESIGN.md §5 Item names)", () => {
  it('is material + type from T1 to T5, each tier its own card, owned or not', () => {
    const swords = [
      'ember_squire',
      'brass_vanguard',
      'silver_cavalier',
      'gilded_knight',
      'prism_paladin',
    ];
    const names = swords.map((id) => cardDisplayName(content, content.cardById.get(id)!));
    expect(names).toEqual(
      ['Wooden', 'Bronze', 'Silver', 'Golden', 'Prismatic'].map((m) => `${m} Sword`),
    );
    const card = content.cardById.get('ember_squire')!;
    expect(cardDisplayName(content, card)).toBe('Wooden Sword');
  });
  it('never shows a character name from cards.json', () => {
    // an Heirloom card's character name is its weapon's name, so it is the one name there
    for (const card of content.cards.filter((c) => !c.heirloom)) {
      expect(cardDisplayName(content, card), card.id).not.toBe(card.name);
    }
  });
  it('keeps the unique names at T6 and as an Heirloom', () => {
    const heirloom = content.cards.find((c) => c.heirloom)!;
    expect(cardDisplayName(content, heirloom)).toBe(
      itemName(content, heirloom.item.kind, 'heirloom', heirloom.side, heirloom),
    );
  });
});
