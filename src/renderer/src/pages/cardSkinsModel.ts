import type { Content, Rarity } from '../../../data';
import { cardDisplayName, cardSkinChoices, resolveCardSkin, type GameState } from '../../../game';
import { COPY } from '../copy';

/**
 * View model of the card skin picker (DESIGN.md §8 Card skins), shared by the Cards panel and the
 * Wardrobe's "Weapon skins" tab. The rules (what a card may wear, what it wears) come from game;
 * this only shapes them, with the picture of each choice, for the screen.
 */

export type SkinPic =
  { kind: 'original' } | { kind: 'legacy'; art: string } | { kind: 'card'; cardId: string };

export interface SkinTileView {
  /** The skin id, or null for the card's Original. */
  id: string | null;
  kind: 'original' | 'card' | 'legacy';
  name: string;
  /** Which picture to draw (`skinTileMarkup` in loadoutCards.ts makes the markup; this model stays free of art code). */
  pic: SkinPic;
  /** The card wears it now. */
  worn: boolean;
  /** Not owned yet: shown greyed and cannot be chosen. */
  locked: boolean;
  /** "Own <card> to unlock" on a locked card skin, a gate hint on a locked legacy skin. */
  lockedNote: string | null;
  rarity: Rarity | null;
}

export interface SkinPickerView {
  cardId: string;
  cardName: string;
  /** The item type's noun (Sword, Bow). */
  weapon: string;
  /** Original first, then the owned card skins, the owned legacy skins, then the locked card skins. */
  tiles: SkinTileView[];
  /** The name of the look the card wears now. */
  wornName: string;
  /** How many skins the card could wear now besides its Original. */
  ownedSkins: number;
}

/** The picker of one card, or null when it cannot wear skins (unknown, not owned, an Heirloom, or its type has none). */
export function skinPickerView(
  state: GameState,
  content: Content,
  cardId: string,
): SkinPickerView | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  const choices = cardSkinChoices(state, content, cardId);
  if (choices.length === 0) return null;
  const worn = resolveCardSkin(state, content, cardId)?.id ?? null;
  const T = COPY.cardSkins;
  const tile = (c: (typeof choices)[number]): SkinTileView => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    pic:
      c.kind === 'legacy'
        ? { kind: 'legacy', art: c.art! }
        : { kind: 'card', cardId: c.sourceCardId! },
    worn: c.id === worn,
    locked: !c.available,
    lockedNote: c.available
      ? null
      : c.kind === 'card'
        ? T.ownToUnlock(c.sourceCardName ?? c.name)
        : T.legacyLocked,
    rarity: c.rarity,
  });
  const tiles: SkinTileView[] = [
    {
      id: null,
      kind: 'original',
      name: T.original,
      pic: { kind: 'original' },
      worn: worn === null,
      locked: false,
      lockedNote: null,
      rarity: null,
    },
    ...choices.filter((c) => c.available).map(tile),
    ...choices.filter((c) => !c.available && c.kind === 'card').map(tile),
  ];
  const wornTile = tiles.find((t) => t.worn) ?? tiles[0]!;
  return {
    cardId,
    cardName: cardDisplayName(content, card, owned),
    weapon: content.itemTypeByKind.get(card.item.kind)?.noun ?? card.item.kind,
    tiles,
    wornName: wornTile.name,
    ownedSkins: choices.filter((c) => c.available).length,
  };
}

/** One card in the Wardrobe tab's card list. */
export interface SkinCardView {
  id: string;
  name: string;
  kind: string;
  weapon: string;
  wornName: string;
}

/** Every owned card that has at least one skin to wear, in card order (the Wardrobe tab's first choice). */
export function skinCards(state: GameState, content: Content): SkinCardView[] {
  const out: SkinCardView[] = [];
  for (const card of content.cards) {
    if (card.heirloom || !state.cards.owned[card.id]) continue;
    const view = skinPickerView(state, content, card.id);
    if (!view || view.ownedSkins === 0) continue;
    out.push({
      id: card.id,
      name: cardDisplayName(content, card, state.cards.owned[card.id]),
      kind: card.item.kind,
      weapon: view.weapon,
      wornName: view.wornName,
    });
  }
  return out;
}

/** Changes whenever a card's picker has to be rebuilt. */
export function cardSkinsSignature(state: GameState): string {
  return JSON.stringify([
    state.cardSkins,
    state.legacySkins,
    Object.keys(state.cards.owned).sort(),
  ]);
}
