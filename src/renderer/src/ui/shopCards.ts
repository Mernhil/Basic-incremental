import type { Content } from '../../../data';
import type { GameState, ShopEntry } from '../../../game';
import { cardFaceProps } from '../pages/loadoutCards';
import { lockedHeirloomState } from '../pages/summonModel';
import { createCard, type CardProps } from './card';
import { fitCard } from './pixelFit';
import { animatedSpriteHtml, sprite } from '../art/pixel/sprites';
import { fmt } from '../settings/numberFormat';
import { h } from '../shell/shell';
import './shopCards.css';

/**
 * The big Heirloom cards of the arena Shop and the raid shops (DESIGN.md Arena and raids): the
 * picture, the name, its perk, the price in the shop's coin and a Buy button. A card whose picture is
 * not drawn yet shows an empty slot; the art controller drops the sprite in later.
 */

export const SHOP_COPY = {
  arenaPerk: 'Arena perk',
  raidPerk: 'Raid perk',
  noPerk: 'A worker Heirloom: it has no fight perk.',
  buy: 'Buy',
  owned: 'Owned',
  tooPoor: 'Not enough coins',
  emptySlot: 'Picture not drawn yet',
  heirloom: 'Heirloom',
  season: (n: number) => `Season ${n}`,
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** The sprite name of a shop Heirloom's picture. */
export function shopSpriteName(card: ShopEntry['card']): string | null {
  return card.shop ? `item-${card.item.kind}-${card.shop.set}-heirloom` : null;
}

/** The card an arena or raid shop Heirloom shows as: its owned face, or a fresh one (no level chip) while it is not owned. */
export function shopCardProps(
  content: Content,
  state: GameState,
  cardId: string,
): CardProps | null {
  const owned = Boolean(state.cards.owned[cardId]);
  const props = cardFaceProps(content, owned ? state : lockedHeirloomState(state, cardId), cardId);
  if (!props) return null;
  if (owned) return props;
  const bare = { ...props };
  delete bare.face;
  return bare;
}

/** A coin picture (48 x 48 sprite) at a scale, or a plain dot when it has none. */
export function coinHtml(name: string, scale = 1): string {
  return sprite(name)
    ? animatedSpriteHtml(name, scale, 'sh-coin')
    : '<span class="sh-coin sh-coin--none"></span>';
}

export function shopCards(
  entries: readonly ShopEntry[],
  coinSprite: string,
  mode: 'arena' | 'raid',
  content: Content,
  state: GameState,
  onBuy: (cardId: string) => void,
): HTMLElement {
  const grid = h('div', 'sh-grid');
  for (const e of entries) {
    const card = h('article', 'sh-card px-panel');
    card.dataset['card'] = e.card.id;
    const art = h('div', 'sh-card__art');
    const name = shopSpriteName(e.card);
    // the Heirloom as a real card: the batch's kit and backdrop around its picture
    const props = name && sprite(name) ? shopCardProps(content, state, e.card.id) : null;
    if (props) {
      const fit = h('span', 'cp-fit');
      fit.append(createCard(props).el);
      art.append(fit);
      // a whole scale of the card (2x: 264 CSS px of art), as every card host is fitted
      fitCard(art, { want: 264 });
    } else {
      art.classList.add('is-empty');
      art.append(h('span', 'sh-card__none', SHOP_COPY.emptySlot));
    }
    const title = h('h3', 'px-display sh-card__name', e.card.name);
    const kind = content.itemTypeByKind.get(e.card.item.kind);
    const sub = h(
      'p',
      'sh-card__sub',
      `${SHOP_COPY.heirloom} · ${cap(kind?.kind ?? e.card.item.kind)}${e.card.element ? ` · ${cap(e.card.element)}` : ''}${e.season ? ` · ${SHOP_COPY.season(e.season)}` : ''}`,
    );
    const perk = h('div', 'sh-card__perk');
    if (e.perk) {
      perk.append(
        h('b', 'sh-card__perkname', mode === 'arena' ? SHOP_COPY.arenaPerk : SHOP_COPY.raidPerk),
        h('span', 'sh-card__perkline', e.perk.line),
      );
    } else perk.append(h('span', 'sh-card__perkline', SHOP_COPY.noPerk));
    const price = h('p', 'sh-card__price bi-num');
    price.innerHTML = `${coinHtml(coinSprite, 1)}<span>${fmt(e.price)}</span>`;
    const buy = h(
      'button',
      `px-btn sh-card__buy${e.owned || !e.canAfford ? '' : ' px-btn--gold'}`,
      e.owned ? SHOP_COPY.owned : SHOP_COPY.buy,
    );
    buy.type = 'button';
    buy.dataset['key'] = `shop-buy-${e.card.id}`;
    buy.disabled = e.owned || !e.canAfford;
    if (!e.owned && !e.canAfford) buy.title = SHOP_COPY.tooPoor;
    buy.addEventListener('click', () => onBuy(e.card.id));
    card.append(art, title, sub, perk, price, buy);
    grid.append(card);
  }
  return grid;
}
