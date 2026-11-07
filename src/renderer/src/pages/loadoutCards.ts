import type { Content } from '../../../data';
import {
  burstStats,
  cardInfo,
  resolveCard,
  type CardRole,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import { itemArt } from '../art/items';
import type { CardProps } from '../ui/card';

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
    item: itemArt(card.item.kind, card.rarity),
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
