import {
  ascend,
  ascensionPreview,
  buyShardItem,
  buyStarlightItem,
  collectModifiers,
  shardShop,
  starlightShop,
  type GameState,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { PLAQUE_VIEWBOX, gemCoin, navPlaque, svg } from '../art/gems';
import { ITEM_VIEWBOX } from '../art/items';
import { animatedSpriteHtml } from '../art/pixel/sprites';
import { h } from '../shell/shell';
import { icon, type IconName } from '../shell/icons';
import { starlightSvg } from '../ui/skins';
import { hide as hideTip } from '../shell/tooltip';
import { reducedMotion } from '../stage/motion';
import { showReveal } from '../stage/reveal';
import { toast } from '../stage/toast';
import { gateView, rewardView, starlightViews, type RewardView } from './ascensionModel';
import { shardGainView, shardOfferViews, shardsText, type OfferArt } from './achievementsModel';
import { cardFaceProps, cardItemArt } from './loadoutCards';
import type { PageContext } from './production';
import './shop.css';

/**
 * Shop page (DESIGN.md §11 "Market stalls"): three striped-awning stalls on a light table, every
 * counter visible at once. Starlight shop (permanent levels), Shard shop (card copies, supplies
 * and exclusives for card shards) and the Ascension gate. The Ascension rules and the shop
 * prices come from game; this file only draws them.
 */

export interface ShopContext extends PageContext {
  sound?: (id: string) => void;
}

type Mode = 'ready' | 'confirm' | 'walking' | 'done';

const RESOURCE_ICON: Record<string, IconName> = {
  tree_gem: 'wood',
  mine_gem: 'ore',
  material: 'material',
  portal: 'portal',
  prestige: 'starlight',
};

/** How long the BOUGHT stamp stays on a Starlight line. */
const STAMP_MS = 1400;

export function createShopPage(page: HTMLElement, ctx: ShopContext): { render(): void } {
  const { content } = ctx;
  const t = COPY.ascension;
  const ts = COPY.shop;
  let mode: Mode = 'ready';

  const table = h('div', 'shop-table');
  page.append(table);

  /** One stall: the awning sprite, a body, a sign. */
  function stall(
    cls: string,
    awning: string,
    label: string,
    signText: string,
  ): { el: HTMLElement; body: HTMLElement; sign: HTMLElement; count: HTMLElement } {
    const el = h('section', `shop-stall ${cls}`);
    const awn = h('div', 'shop-awn');
    awn.setAttribute('aria-hidden', 'true');
    awn.innerHTML = animatedSpriteHtml(awning, 1, 'shop-awn__img');
    const body = h('div', 'shop-body');
    const sign = h('h2', 'shop-sign');
    const name = h('span', 'shop-sign__name', signText);
    const count = h('em', 'shop-sign__count bi-num');
    sign.id = `shop-sign-${cls}`;
    sign.append(name);
    el.setAttribute('aria-labelledby', sign.id);
    el.dataset.label = label;
    body.append(sign);
    el.append(awn, body);
    table.append(el);
    sign.append(count);
    return { el, body, sign, count };
  }

  const priceBtn = (onClick: () => void): HTMLButtonElement => {
    const b = h('button', 'shop-price bi-num');
    b.type = 'button';
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      onClick();
    });
    return b;
  };
  const setPrice = (b: HTMLButtonElement, price: string, affordable: boolean, label: string) => {
    set(b, price);
    b.setAttribute('aria-disabled', String(!affordable));
    b.classList.toggle('is-no', !affordable);
    b.setAttribute('aria-label', label);
  };

  // =====================================================================================
  // Stall 1: Starlight shop
  // =====================================================================================
  const star = stall('shop-stall--starlight', 'shop-awn-a', t.shop, t.shop);
  const offers = h('ul', 'shop-list');
  star.body.append(offers);

  type OfferUi = {
    li: HTMLElement;
    level: HTMLElement;
    fill: HTMLElement;
    price: HTMLButtonElement;
    effect: HTMLElement;
    stamp: HTMLElement;
    timer: number;
  };
  const offerUis = new Map<string, OfferUi>();
  for (const item of content.prestige.shop) {
    const li = h('li', 'shop-it');
    li.dataset.item = item.id;
    const coin = h('span', 'shop-it__art');
    coin.setAttribute('aria-hidden', 'true');
    coin.innerHTML = starlightSvg();
    const text = h('span', 'shop-it__text');
    const level = h('span', 'shop-it__sub bi-num');
    const effect = h('span', 'shop-it__sub');
    const track = h('i', 'shop-lv');
    track.setAttribute('aria-hidden', 'true');
    const fill = h('u');
    track.append(fill);
    text.append(h('b', 'shop-it__name', item.name), effect, level, track);
    const price = priceBtn(() => buyStarlight(item.id));
    const stamp = h('span', 'shop-stamp');
    stamp.setAttribute('aria-hidden', 'true');
    stamp.hidden = true;
    stamp.innerHTML = animatedSpriteHtml('shop-stamp', 1);
    li.append(coin, text, price, stamp);
    offers.append(li);
    offerUis.set(item.id, { li, level, fill, price, effect, stamp, timer: 0 });
  }

  function buyStarlight(id: string): void {
    const result = buyStarlightItem(ctx.state(), content, id);
    if (!result.ok) return;
    ctx.apply(result.state);
    ctx.sound?.('buy');
    const ui = offerUis.get(id);
    if (!ui) return;
    ui.stamp.hidden = false;
    ui.stamp.classList.remove('is-slam');
    if (!reducedMotion()) {
      void ui.stamp.offsetWidth;
      ui.stamp.classList.add('is-slam');
    }
    window.clearTimeout(ui.timer);
    ui.timer = window.setTimeout(() => (ui.stamp.hidden = true), STAMP_MS);
  }

  // =====================================================================================
  // Stall 2: Shard shop
  // =====================================================================================
  const shard = stall('shop-stall--shards', 'shop-awn-b', COPY.achievements.shop, ts.shards);
  const coinEl = h('span', 'shop-coin');
  coinEl.setAttribute('aria-hidden', 'true');
  coinEl.innerHTML = animatedSpriteHtml('shop-coin', 1);
  shard.sign.insertBefore(coinEl, shard.count);
  const shardHint = h('p', 'shop-note', COPY.achievements.shardsHint);
  const tiles = h('ul', 'shop-tiles');
  const supplies = h('ul', 'shop-list shop-list--supplies');
  const exclusives = h('ul', 'shop-list shop-list--exclusive');
  const exclusiveHead = h('h3', 'shop-head', COPY.achievements.groups.exclusive);
  shard.body.append(shardHint, tiles, supplies, exclusiveHead, exclusives);

  /** Pixel supply icons by resource: one per supply line, in the order the shop sells them. */
  const SUPPLY_SPRITES: Record<string, string> = {
    summon_crystal: 'shop-sup1',
    glamour_crystal: 'shop-sup2',
    frost_core: 'shop-sup3',
    glimmer_dust: 'shop-sup4',
    facet_shard: 'shop-sup5',
  };

  function offerArt(art: OfferArt, s: GameState): string {
    switch (art.kind) {
      case 'card':
        return svg(cardItemArt(content, art.cardId, s.cards.owned[art.cardId], s), ITEM_VIEWBOX);
      case 'coin': {
        const gem = content.resourceById.get(art.resource)?.gem;
        return gem ? svg(gemCoin(gem, 1)) : '';
      }
      case 'resource': {
        const sup = SUPPLY_SPRITES[art.resource];
        const px = sup ? animatedSpriteHtml(sup, 1) : '';
        if (px) return px;
        const kind = content.resourceById.get(art.resource)?.kind ?? 'material';
        if (kind === 'prestige') return starlightSvg();
        return icon(RESOURCE_ICON[kind] ?? 'material', 'shop-icon').outerHTML;
      }
      case 'cosmetic':
        return svg(navPlaque('wardrobe'), PLAQUE_VIEWBOX);
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
      const price = priceBtn(() => buyShard(v.id));
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
        shardUis.get(id)?.price.focus();
      },
    });
  }

  // =====================================================================================
  // Stall 3: Ascension
  // =====================================================================================
  const asc = stall('shop-stall--ascension', 'shop-awn-c', t.gate, t.gate);
  const nth = h('em', 'shop-sign__count');
  asc.sign.append(nth);
  asc.count.remove();
  const gate = h('div', 'shop-gate');
  asc.body.append(gate);

  const ringWrap = h('div', 'shop-ring');
  ringWrap.setAttribute('aria-hidden', 'true');
  const ring = h('span', 'shop-ring__sprite');
  ring.innerHTML = animatedSpriteHtml('shop-ring', 1);
  const ringCoin = h('span', 'shop-ring__coin');
  ringCoin.innerHTML = starlightSvg();
  ringWrap.append(ring, ringCoin);

  const ready = h('div', 'shop-panel');
  const gainValue = h('p', 'shop-gain bi-num');
  const needs = h('p', 'shop-needs');
  const rewardsNote = h('p', 'shop-needs');
  const ascendBtn = h('button', 'shop-ascend');
  ascendBtn.type = 'button';
  ascendBtn.addEventListener('click', () => {
    if (ascendBtn.getAttribute('aria-disabled') === 'true') return;
    setMode('confirm');
  });
  ready.append(gainValue, needs, rewardsNote, ascendBtn);

  const confirm = h('div', 'shop-panel');
  confirm.setAttribute('role', 'group');
  const confirmTitle = h('h3', 'shop-head', t.confirmTitle);
  confirmTitle.id = 'shop-confirm-title';
  confirm.setAttribute('aria-labelledby', confirmTitle.id);
  const confirmBody = h('p', 'shop-needs shop-needs--left');
  const goBtn = h('button', 'shop-ascend', t.confirm);
  goBtn.type = 'button';
  const cancelBtn = h('button', 'shop-cancel', t.cancel);
  cancelBtn.type = 'button';
  confirm.append(confirmTitle, confirmBody, goBtn, cancelBtn);
  goBtn.addEventListener('click', walkThrough);
  cancelBtn.addEventListener('click', () => setMode('ready', true));
  confirm.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setMode('ready', true);
    }
  });

  const done = h('div', 'shop-panel');
  done.setAttribute('aria-live', 'polite');
  const doneTitle = h('h3', 'shop-head');
  const doneGain = h('p', 'shop-gain bi-num');
  const doneLabel = h('p', 'shop-needs', t.doneGainLabel);
  const doneRewardsHead = h('h3', 'shop-head', t.doneRewards);
  const doneRewards = h('ul', 'shop-bullets');
  const nextBtn = h('button', 'shop-ascend', t.doneNext);
  nextBtn.type = 'button';
  nextBtn.addEventListener('click', () => setMode('ready', true));
  done.append(doneTitle, doneGain, doneLabel, doneRewardsHead, doneRewards, nextBtn);

  const keptHead = h('h3', 'shop-head', ts.kept);
  const keptList = h('ul', 'shop-bullets shop-bullets--kept');
  const resetHead = h('h3', 'shop-head', ts.reset);
  const resetList = h('ul', 'shop-bullets shop-bullets--reset');
  gate.append(ringWrap, ready, confirm, done, keptHead, keptList, resetHead, resetList);

  function setMode(next: Mode, focus = false): void {
    mode = next;
    table.dataset.mode = next;
    ready.hidden = next !== 'ready' && next !== 'walking';
    confirm.hidden = next !== 'confirm';
    done.hidden = next !== 'done';
    render();
    if (next === 'confirm') goBtn.focus();
    else if (focus && next === 'ready') ascendBtn.focus();
    else if (focus && next === 'done') nextBtn.focus();
  }

  const rewardLi = (r: RewardView): HTMLElement => {
    const li = h('li', '', r.text);
    li.dataset.rarity = String(r.rarity);
    return li;
  };

  function walkThrough(): void {
    if (mode !== 'confirm') return;
    const result = ascend(ctx.state(), content);
    if (!result.ok) {
      setMode('ready', true);
      return;
    }
    hideTip();
    mode = reducedMotion() ? 'done' : 'walking';
    ctx.apply(result.state);
    const gainText = fmt(result.gained);
    const rewards = result.cosmetics.map((id) => rewardView(content, id));
    doneTitle.textContent = t.doneTitle(result.state.prestigeCount);
    doneGain.textContent = t.doneGain(gainText);
    doneRewards.replaceChildren(...rewards.map(rewardLi));
    doneRewardsHead.hidden = rewards.length === 0;
    doneRewards.hidden = rewards.length === 0;
    ctx.sound?.('ascend');
    toast(
      t.toast,
      t.toastDetail(
        gainText,
        rewards.map((r) => r.name),
      ),
      'milestone',
      'prismatic',
    );
    if (reducedMotion()) {
      setMode('done', true);
      return;
    }
    setMode('walking');
    table.classList.add('is-walking');
    window.setTimeout(() => {
      sweep();
      window.setTimeout(() => {
        table.classList.remove('is-walking');
        setMode('done', true);
      }, 700);
    }, 650);
  }

  // =====================================================================================
  // Render
  // =====================================================================================
  let keptKey = '';
  let resetKey = '';
  let artKey = '';
  function render(): void {
    const s = ctx.state();
    const mods = collectModifiers(s, content);

    // ---- ascension ----
    if (mode !== 'walking') {
      const view = gateView(ascensionPreview(s, content, mods), s, content);
      table.dataset.ready = String(view.canAscend);
      set(nth, ts.no(view.ascension));
      if (mode === 'ready' || mode === 'confirm') {
        set(gainValue, ts.gain(view.gain));
        set(needs, view.needs);
        needs.hidden = view.canAscend;
        const extra = view.rewards.map((r) => r.text).join('; ');
        set(rewardsNote, extra ? `${t.rewardsLabel}: ${extra}` : '');
        rewardsNote.hidden = extra === '';
        set(ascendBtn, view.button);
        ascendBtn.setAttribute('aria-disabled', String(!view.canAscend));
        ascendBtn.classList.toggle('is-no', !view.canAscend);
        set(confirmBody, t.confirmBody(view.gain));
        if (mode === 'confirm' && !view.canAscend) setMode('ready');
      }
      const kk = view.kept.map((k) => k.id).join(',');
      if (kk !== keptKey) {
        keptKey = kk;
        keptList.replaceChildren(
          ...view.kept.map((k) => {
            const li = h('li', '', k.label);
            li.title = k.detail;
            return li;
          }),
        );
      }
      const rk = view.resets.map((r) => r.id).join(',');
      if (rk !== resetKey) {
        resetKey = rk;
        resetList.replaceChildren(
          ...view.resets.map((r) => {
            const li = h('li', '', r.label);
            li.title = r.detail;
            return li;
          }),
        );
      }
    }

    // ---- Starlight shop ----
    const have = s.resources[content.prestige.currency];
    set(star.count, have ? fmt(have) : '0');
    for (const v of starlightViews(starlightShop(s, content, mods), s, content)) {
      const ui = offerUis.get(v.id);
      if (!ui) continue;
      set(ui.effect, v.buy.preview);
      set(ui.level, v.levelText);
      ui.fill.style.width = `${((v.level / Math.max(1, v.maxLevel)) * 100).toFixed(1)}%`;
      ui.li.classList.toggle('is-maxed', v.maxed);
      if (v.maxed) {
        set(ui.price, t.maxed);
        ui.price.setAttribute('aria-disabled', 'true');
        ui.price.classList.add('is-no', 'is-max');
        ui.price.setAttribute('aria-label', `${v.name}: ${t.maxed}`);
      } else {
        ui.price.classList.remove('is-max');
        setPrice(
          ui.price,
          fmt(v.buy.offer.price.amount),
          v.buy.offer.affordable,
          `${v.name}: ${v.buy.label}, ${v.buy.price}. ${v.buy.preview}`,
        );
      }
    }

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
      if (v.soldOut) setPrice(ui.price, COPY.achievements.soldOut, false, `${v.name}: sold out`);
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

  setMode('ready');
  return { render };
}

/** The prismatic sweep across the window when walking through the gate. */
function sweep(): void {
  const el = h('div', 'shop-sweep');
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  window.setTimeout(() => el.remove(), 1300);
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
