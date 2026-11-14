import type { Card, Content, Rarity } from '../data';
import { cloneState, type GameState } from './state';

/**
 * Card skins (DESIGN.md §8). A skin is a weapon picture a card can wear instead of its own
 * ("Original"), chosen per card. Two kinds: a legacy skin (weaponSkins.json, earned from the
 * Legacy Gate) for the card's item type, and a card skin, the own weapon picture (`heirloomArt`)
 * of any owned card of that item type. An Heirloom's picture is never a skin and an Heirloom card
 * wears only its own picture. Art only: nothing here touches stats, element, name or frame.
 */

/** Prefix of a card skin's id; the rest is the id of the card whose weapon it is. */
export const CARD_SKIN_PREFIX = 'card:';

/** Whether a card has an own weapon picture a skin can be made of (never an Heirloom). */
export function givesSkin(card: Card): boolean {
  return card.heirloomArt !== undefined && card.heirloom !== true;
}

/** Whether a legacy skin was pulled from the Legacy Gate. */
export function ownsLegacySkin(state: GameState, skinId: string): boolean {
  return state.legacySkins.includes(skinId);
}

/** One skin in a card's picker. */
export interface CardSkinChoice {
  /** The id stored in `state.cardSkins`: a legacy skin's id, or `card:<cardId>`. */
  id: string;
  kind: 'legacy' | 'card';
  /** Legacy skin: its short name. Card skin: the skin's own weapon name (Frostjade). */
  name: string;
  /** A legacy skin's art id; null for a card skin (its picture is the source card's own). */
  art: string | null;
  /** The card whose own weapon this is (card skins only). */
  sourceCardId: string | null;
  /** The source card's name (card skins only), for "Own <card> to unlock". */
  sourceCardName: string | null;
  /** A legacy skin's rarity; a card skin has the rarity of its source card. */
  rarity: Rarity;
  /** Owned, so it can be worn now. */
  available: boolean;
  /** The one the card wears now. */
  equipped: boolean;
}

/** The card, when it can wear skins at all: a known, non-Heirloom card. */
function wearer(content: Content, cardId: string): Card | null {
  const card = content.cardById.get(cardId);
  return card && !card.heirloom ? card : null;
}

/** The raw choice stored for a card (not checked against what is owned); null = Original. */
export function cardSkinFor(state: GameState, cardId: string): string | null {
  return state.cardSkins[cardId] ?? null;
}

/**
 * Every skin the card could wear, in the picker's order: card skins (owned ones first, in card
 * order), then legacy skins. Empty for an Heirloom card or an unknown id. Locked ones are in the list
 * with `available: false`. The card's own picture is not listed for the card itself: that is its Original.
 */
export function cardSkinChoices(
  state: GameState,
  content: Content,
  cardId: string,
): CardSkinChoice[] {
  const card = wearer(content, cardId);
  if (!card) return [];
  const kind = card.item.kind;
  const worn = cardSkinFor(state, cardId);
  const out: CardSkinChoice[] = [];
  for (const source of content.cards) {
    if (source.item.kind !== kind || !givesSkin(source) || source.id === cardId) continue;
    const id = CARD_SKIN_PREFIX + source.id;
    out.push({
      id,
      kind: 'card',
      name: source.heirloomName ?? source.name,
      art: null,
      sourceCardId: source.id,
      sourceCardName: source.name,
      rarity: source.rarity,
      available: state.cards.owned[source.id] !== undefined,
      equipped: worn === id,
    });
  }
  out.sort((a, b) => Number(b.available) - Number(a.available));
  for (const skin of content.weaponSkinsByWeapon.get(kind)?.skins ?? []) {
    if (!skin.legacy) continue;
    out.push({
      id: skin.id,
      kind: 'legacy',
      name: skin.name,
      art: skin.art,
      sourceCardId: null,
      sourceCardName: null,
      rarity: skin.rarity ?? 'rare',
      available: ownsLegacySkin(state, skin.id),
      equipped: worn === skin.id,
    });
  }
  return out;
}

/** Whether the card may wear that skin right now. */
export function canWearSkin(
  state: GameState,
  content: Content,
  cardId: string,
  skinId: string,
): boolean {
  return cardSkinChoices(state, content, cardId).some((c) => c.id === skinId && c.available);
}

/** What a card shows in place of its own weapon: a legacy skin's art, or another card's own picture. */
export type ResolvedSkin =
  { kind: 'legacy'; id: string; art: string } | { kind: 'card'; id: string; sourceCardId: string };

/** The skin the card shows now, or null for its Original (also when the stored choice is no longer wearable). */
export function resolveCardSkin(
  state: GameState,
  content: Content,
  cardId: string,
): ResolvedSkin | null {
  const id = state.cardSkins[cardId];
  if (id === undefined || !canWearSkin(state, content, cardId, id)) return null;
  const choice = cardSkinChoices(state, content, cardId).find((c) => c.id === id)!;
  return choice.kind === 'legacy'
    ? { kind: 'legacy', id, art: choice.art! }
    : { kind: 'card', id, sourceCardId: choice.sourceCardId! };
}

export type SetCardSkinResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'unknown-card' | 'not-owned' | 'unknown-skin' | 'unavailable' };

/** Makes a card wear a skin, or `null` to go back to its Original. Does not touch stats or cosmetics. */
export function setCardSkin(
  state: GameState,
  content: Content,
  cardId: string,
  skinId: string | null,
): SetCardSkinResult {
  if (!wearer(content, cardId)) return { ok: false, reason: 'unknown-card' };
  if (!state.cards.owned[cardId]) return { ok: false, reason: 'not-owned' };
  const next = cloneState(state);
  if (skinId === null) {
    delete next.cardSkins[cardId];
    return { ok: true, state: next };
  }
  const choice = cardSkinChoices(state, content, cardId).find((c) => c.id === skinId);
  if (!choice) return { ok: false, reason: 'unknown-skin' };
  if (!choice.available) return { ok: false, reason: 'unavailable' };
  next.cardSkins[cardId] = skinId;
  return { ok: true, state: next };
}

/** Drops every stored choice that is no longer wearable (a skin or card that is gone); mutates `state`. */
export function pruneCardSkins(state: GameState, content: Content): void {
  for (const cardId of Object.keys(state.cardSkins)) {
    const id = state.cardSkins[cardId]!;
    if (!state.cards.owned[cardId] || !canWearSkin(state, content, cardId, id)) {
      delete state.cardSkins[cardId];
    }
  }
}
