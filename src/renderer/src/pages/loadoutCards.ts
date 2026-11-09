import type { Content, ItemKind } from '../../../data';
import {
  cardInfo,
  cardItem,
  legacyWeaponArt,
  resolveCard,
  type CardRole,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import { evolutionArt } from '../art/evolutions';
import { itemArt, itemBoxSprite } from '../art/items';
import type { CardProps } from '../ui/card';
import { cardFaceOf } from './cardFaceModel';

/** Markup of a skin's art: a sprite (with its strip when it has one), or Flameblade's live motion. */
export function skinMarkup(artId: string): string {
  if (artId === 'evo-flameblade') return evolutionArt('flameblade');
  return itemBoxSprite(artId);
}

/**
 * A card's item art: the legacy skin worn on its item type (DESIGN.md §8), otherwise its type's
 * item drawn at the rarity its tier gives (weaponLookRarity; interim art until the new pictures).
 */
export function cardItemArt(
  content: Content,
  cardId: string,
  owned: Parameters<typeof cardItem>[2],
  state?: GameState,
): string {
  const card = content.cardById.get(cardId);
  if (!card) return '';
  const item = cardItem(content, cardId, owned);
  if (state && item && owned) {
    const skin = legacyWeaponArt(state, content, item.kind, owned.tier);
    const markup = skin ? skinMarkup(skin) : '';
    if (markup) return markup;
  }
  return itemArt(item?.kind ?? card.item.kind, item?.rarity ?? card.rarity);
}

/** A fighting loadout card's props. Null when the card is unknown or not owned. */
export function loadoutProps(
  content: Content,
  state: GameState,
  cardId: string,
  role: CardRole,
  mods: Modifier[],
): CardProps | null {
  const info = cardInfo(state, content, cardId, mods);
  if (!info?.owned || !info.rank) return null;
  const { card, rank } = info;
  return {
    name: card.name,
    label: role === 'main' ? COPY.table.main : COPY.table.support,
    job: card.job,
    emblem: role === 'main' ? 'blade' : 'gem',
    item: cardItemArt(content, card.id, info.owned, state),
    element: card.element,
    rank,
    rarity: card.rarity,
    face: cardFaceOf(content, info, mods),
    theme: resolveCard(content, state.cosmetics.loadout, {
      id: card.id,
      rank,
      rarity: card.rarity,
    }),
  };
}

/** A card face for a reveal or showcase: the card at its rank now, labelled with its job. */
export function cardFaceProps(
  content: Content,
  state: GameState,
  cardId: string,
): CardProps | null {
  const props = loadoutProps(content, state, cardId, 'main', []);
  const card = content.cardById.get(cardId);
  if (!props || !card) return null;
  return { ...props, label: card.job.charAt(0).toUpperCase() + card.job.slice(1) };
}

/** Key that changes whenever the fighting loadout or one of its cards' rank / level does. */
export function loadoutKey(state: GameState): string {
  const { main, supports } = state.cards.loadouts.fighting;
  return JSON.stringify([
    state.weaponSkins,
    ...[main, ...supports].map((id) => {
      const owned = id ? state.cards.owned[id] : undefined;
      return owned ? [id, owned.tier, owned.stars, owned.level] : null;
    }),
  ]);
}

/** Markup of a weapon's art for the skin picker: a skin's art, or the type's own (interim) art. */
export function weaponArtMarkup(weaponKind: string, artId: string | null): string {
  if (artId) return skinMarkup(artId);
  return itemArt(weaponKind as ItemKind, 'epic');
}
