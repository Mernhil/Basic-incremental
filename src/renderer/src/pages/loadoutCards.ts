import type { Content } from '../../../data';
import {
  burstStats,
  cardInfo,
  cardItem,
  resolveCard,
  type CardRole,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import { evolutionArt, EVOLUTIONS, type Evolution } from '../art/evolutions';
import { itemArt } from '../art/items';
import type { CardProps } from '../ui/card';

/**
 * A card's item art: its unique item at the Unique tier (DESIGN.md §5), otherwise its item drawn
 * at the rarity its tier gives (weaponLookRarity).
 */
export function cardItemArt(
  content: Content,
  cardId: string,
  owned: Parameters<typeof cardItem>[2],
): string {
  const card = content.cardById.get(cardId);
  if (!card) return '';
  const item = cardItem(content, cardId, owned);
  if (item?.unique && (EVOLUTIONS as readonly string[]).includes(item.kind))
    return evolutionArt(item.kind as Evolution);
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
  const level = { label: 'Level', value: `${info.owned.level}/${info.levelCap}` };
  const stats: CardProps['stats'] =
    role === 'main'
      ? [
          level,
          { label: 'Hits every', value: `${burstStats(content, 'fighting', mods).interval}s` },
        ]
      : [level, { label: 'Bonus', value: card.support.description }];
  return {
    name: card.name,
    label: role === 'main' ? COPY.table.main : COPY.table.support,
    job: card.job,
    emblem: role === 'main' ? 'blade' : 'gem',
    item: cardItemArt(content, card.id, info.owned),
    element: card.element,
    rank,
    stats,
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
  return JSON.stringify(
    [main, ...supports].map((id) => {
      const owned = id ? state.cards.owned[id] : undefined;
      return owned ? [id, owned.tier, owned.stars, owned.level] : null;
    }),
  );
}
