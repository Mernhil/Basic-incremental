import type { Content, ItemKind } from '../../../data';
import {
  cardInfo,
  cardItem,
  resolveCardSkin,
  lookTier,
  resolveCard,
  type CardRole,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import { evolutionArt } from '../art/evolutions';
import { cardTierArt, itemArt, itemBoxSprite } from '../art/items';
import type { CardProps } from '../ui/card';
import { cardFaceOf } from './cardFaceModel';
import type { SkinPic } from './cardSkinsModel';

/** Markup of a skin's art: a sprite (with its strip when it has one), or Flameblade's live motion. */
export function skinMarkup(artId: string): string {
  if (artId === 'evo-flameblade') return evolutionArt('flameblade');
  return itemBoxSprite(artId);
}

/**
 * A card's item art: the skin it wears (DESIGN.md §8 Card skins: a legacy skin, or another card's own
 * weapon picture), otherwise its type's item at its tier, or its own weapon at its top tier. Without
 * `state` (or for a card not owned) the Original is drawn.
 */
export function cardItemArt(
  content: Content,
  cardId: string,
  owned: Parameters<typeof cardItem>[2],
  state?: GameState,
): string {
  const card = content.cardById.get(cardId);
  if (!card) return '';
  if (state && owned) {
    const skin = resolveCardSkin(state, content, cardId);
    if (skin?.kind === 'legacy') {
      const markup = skinMarkup(skin.art);
      if (markup) return markup;
    } else if (skin) {
      const source = content.cardById.get(skin.sourceCardId);
      if (source) return cardTierArt(source, 'mythic');
    }
  }
  // an Heirloom card shows its Heirloom, owned or not (DESIGN.md §5 An Heirloom card)
  const tier = card.heirloom ? 'heirloom' : lookTier(card.rarity, owned?.tier ?? 'wood');
  return cardTierArt(card, tier);
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
    state.cardSkins,
    ...[main, ...supports].map((id) => {
      const owned = id ? state.cards.owned[id] : undefined;
      return owned ? [id, owned.tier, owned.stars, owned.level] : null;
    }),
  ]);
}

/** Markup of a weapon's art for the skin picker: a skin's art, or the type's own (interim) art. */
export function weaponArtMarkup(weaponKind: string, artId: string | null): string {
  if (artId) return skinMarkup(artId);
  return itemArt(weaponKind as ItemKind, 'epic', 'wood');
}

/** The picture markup of a skin tile (the Original is the card's own, unskinned). */
export function skinTileMarkup(
  content: Content,
  cardId: string,
  owned: Parameters<typeof cardItem>[2],
  pic: SkinPic,
): string {
  if (pic.kind === 'legacy') return skinMarkup(pic.art);
  if (pic.kind === 'card') {
    const source = content.cardById.get(pic.cardId);
    return source ? cardTierArt(source, 'heirloom') : '';
  }
  return cardItemArt(content, cardId, owned);
}
