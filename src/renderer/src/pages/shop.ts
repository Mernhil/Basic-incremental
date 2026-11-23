import { buyShardItem, shardShop, type GameState } from '../../../game';
import { COPY } from '../copy';
import { svg } from '../art/gems';
import { keptIconMarkup } from '../ui/resourceIcons';
import { ITEM_VIEWBOX } from '../art/items';
import { animatedSpriteHtml, sprite } from '../art/pixel/sprites';
import { h } from '../shell/shell';
import { icon, type IconName } from '../shell/icons';
import { hide as hideTip } from '../shell/tooltip';
import { showReveal } from '../stage/reveal';
import { toast } from '../stage/toast';
import { shardGainView, shardOfferViews, shardsText, type OfferArt } from './achievementsModel';
import { cardFaceProps, cardItemArt } from './loadoutCards';
import type { PageContext } from './production';
import './shop.css';

/**
 * Shop page (UI_RULES.md §2 "Shop page: Signboards"): three counters side by side, each under a
 * wooden signboard on two chains, every counter visible at once. Starlight shop (permanent
 * levels), Shard shop (card copies, supplies and exclusives for card shards) and the Ascension
 * gate. The Ascension rules and the shop prices come from game; this file only draws them. The
 * boards, shelves and chips are CSS (shop.css); the stamp, ring and coin are the candy pixel sprites.
 */

export interface ShopContext extends PageContext {
  sound?: (id: string) => void;
}

const RESOURCE_ICON: Record<string, IconName> = {
  tree_gem: 'wood',
  mine_gem: 'ore',
  material: 'material',
  portal: 'portal',
  prestige: 'starlight',
};

export function createShopPage(page: HTMLElement, ctx: ShopContext): { render(): void } {
  const { content } = ctx;
  const ts = COPY.shop;

  const table = h('div', 'shop-table');
  page.append(table);

  /** One counter: a wooden signboard on two chains, and the shelf under it. */
  function stall(
    cls: string,
    label: string,
    signText: string,
  ): { el: HTMLElement; body: HTMLElement; sign: HTMLElement; count: HTMLElement } {
    const el = h('section', `shop-stall ${cls}`);
    el.dataset.deal = '';
    const sign = h('h2', 'shop-sign');
    const name = h('span', 'shop-sign__name px-display', signText);
    const count = h('em', 'shop-sign__count px-display bi-num');
    sign.id = `shop-sign-${cls}`;
    sign.append(name);
    el.setAttribute('aria-labelledby', sign.id);
    el.dataset.label = label;
    const body = h('div', 'shop-body px-panel');
    el.append(sign, body);
    table.append(el);
    sign.append(count);
    return { el, body, sign, count };
  }

  /** A pixel sprite in a box that is a whole number of device pixels per art pixel (`want` x). */
  const spriteBox = (name: string, want = 1): string => {
    const s = sprite(name);
    if (!s) return '';
    return `<span class="shop-spr" style="--nw:${s.w};--nh:${s.h};--want:${want}">${animatedSpriteHtml(name, 1)}</span>`;
  };

  /** A price chip: a gold button with the currency icon and the price. */
  const priceBtn = (onClick: () => void, coin: 'star' | 'shard'): HTMLButtonElement => {
    const b = h('button', 'shop-price bi-num');
    b.type = 'button';
    const ico = h('span', coin === 'star' ? 'shop-price__ico' : 'shop-price__ico shop-gem');
    ico.setAttribute('aria-hidden', 'true');
    if (coin === 'star') ico.innerHTML = keptIconMarkup('starlight') ?? '';
    b.append(ico, h('span', 'shop-price__txt'));
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      onClick();
    });
    return b;
  };
  /** `coin` false drops the icon, for a chip that says "Max" or "Sold out". */
  const setPrice = (
    b: HTMLButtonElement,
    price: string,
    affordable: boolean,
    label: string,
    coin = true,
  ) => {
    set(b.lastElementChild as HTMLElement, price);
    b.classList.toggle('no-ico', !coin);
    b.setAttribute('aria-disabled', String(!affordable));
    b.classList.toggle('is-no', !affordable);
    b.setAttribute('aria-label', label);
  };

  // =====================================================================================
  // The Shard shop
  // =====================================================================================
  const shard = stall('shop-stall--shards', COPY.achievements.shop, ts.boards.shards);
  const coinEl = h('span', 'shop-coin');
  coinEl.setAttribute('aria-hidden', 'true');
  coinEl.innerHTML = spriteBox('shop-coin');
  shard.sign.insertBefore(coinEl, shard.count);
  const shardHint = h('p', 'shop-note', COPY.achievements.shardsHint);
  const tiles = h('ul', 'shop-tiles');
  const supplies = h('ul', 'shop-list shop-list--supplies');
  const exclusives = h('ul', 'shop-list shop-list--exclusive');
  const exclusiveHead = h('h3', 'shop-head', COPY.achievements.groups.exclusive);
  shard.body.append(shardHint, tiles, supplies, exclusiveHead, exclusives);

  /** Pixel supply icons by resource: one per supply line, in the order the shop sells them. */
  const SUPPLY_SPRITES: Record<string, string> = {
    summon_scroll: 'res-summon_scroll',
    glamour_scroll: 'res-glamour_scroll',
    frost_core: 'res-frost_core',
    glimmer_dust: 'res-glimmer_dust',
    facet_shard: 'res-facet_shard',
  };

  function offerArt(art: OfferArt, s: GameState): string {
    switch (art.kind) {
      case 'card':
        // a whole-scale weapon in a window that crops what does not fit (shop.css)
        return svg(cardItemArt(content, art.cardId, s.cards.owned[art.cardId], s), ITEM_VIEWBOX);
      case 'coin': {
        return keptIconMarkup(art.resource) ?? '';
      }
      case 'resource': {
        const sup = SUPPLY_SPRITES[art.resource];
        const px = sup ? spriteBox(sup) : '';
        if (px) return px;
        const kind = content.resourceById.get(art.resource)?.kind ?? 'material';
        if (kind === 'prestige') return icon('starlight', 'shop-icon').outerHTML;
        return icon(RESOURCE_ICON[kind] ?? 'material', 'shop-icon').outerHTML;
      }
      case 'cosmetic':
        return icon('wardrobe', 'shop-icon').outerHTML;
    }
  }

  type ShardUi = { li: HTMLElement; price: HTMLButtonElement; stock: HTMLElement };
  const shardUis = new Map<string, ShardUi>();

  function buildShards(s: GameState): void {
    for (const v of shardOfferViews(shardShop(s, content), s, content)) {
      const tile = v.group === 'cards';
      const li = h('li', tile ? 'shop-tile' : 'shop-it shop-it--supply');
      li.dataset.item = v.id;
      li.dataset.art = v.art.kind;
      const art = h('span', tile ? 'shop-tile__art' : 'shop-it__art');
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = offerArt(v.art, s);
      const stock = h('span', 'shop-it__sub shop-stock');
      const price = priceBtn(() => buyShard(v.id), 'shard');
      if (tile) {
        li.append(art, h('span', 'shop-tile__name', v.name), stock, price);
        tiles.append(li);
      } else {
        const text = h('span', 'shop-it__text');
        text.append(h('b', 'shop-it__name', v.name), h('span', 'shop-it__sub', v.detail), stock);
        li.append(art, text, price);
        (v.group === 'supplies' ? supplies : exclusives).append(li);
      }
      shardUis.set(v.id, { li, price, stock });
    }
  }

  let busy = false;
  function buyShard(id: string): void {
    if (busy) return;
    const before = ctx.state();
    const result = buyShardItem(before, content, id);
    if (!result.ok) return;
    hideTip();
    ctx.apply(result.state);
    const gain = shardGainView(content, id, result.gain);
    if (!gain) return;
    if (gain.kind === 'toast') {
      ctx.sound?.('buy');
      toast(gain.title, gain.detail, 'info');
      return;
    }
    busy = true;
    const after = ctx.state();
    showReveal({
      portalName: COPY.achievements.shop,
      views: [gain.view],
      face: (itemId) =>
        content.cardById.has(itemId) ? cardFaceProps(content, after, itemId) : null,
      ...(ctx.sound ? { sound: ctx.sound } : {}),
      onClose: () => {
        busy = false;
        shardUis.get(id)?.price.focus({ preventScroll: true });
      },
    });
  }

  // =====================================================================================
  // Render
  // =====================================================================================
  let artKey = '';
  function render(): void {
    const s = ctx.state();
    // ---- Shard shop ----
    if (shardUis.size === 0) buildShards(s);
    set(shard.count, shardsText(s));
    const key = Object.entries(s.cards.owned)
      .map(([id, c]) => `${id}:${c.tier}:${c.stars}`)
      .join(',');
    const refreshArt = key !== artKey;
    artKey = key;
    for (const v of shardOfferViews(shardShop(s, content), s, content)) {
      const ui = shardUis.get(v.id);
      if (!ui) continue;
      if (v.soldOut)
        setPrice(ui.price, COPY.achievements.soldOut, false, `${v.name}: sold out`, false);
      else
        setPrice(
          ui.price,
          String(v.buy.offer.price.amount.toNumber()),
          v.buy.offer.affordable,
          COPY.achievements.buyLabel(v.name, v.buy.price, v.buy.preview),
        );
      ui.li.classList.toggle('is-soldout', v.soldOut);
      set(ui.stock, v.stockText);
      ui.stock.hidden = v.stockText === '';
      if (refreshArt && v.art.kind === 'card') {
        const art = ui.li.querySelector('.shop-tile__art');
        if (art) art.innerHTML = offerArt(v.art, s);
      }
    }
  }

  render();
  return { render };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
