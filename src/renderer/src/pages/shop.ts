import {
  ascend,
  ascensionPreview,
  autobuyerOwned,
  setAutomation,
  type AutomationState,
  buyShardItem,
  buyStarlightItem,
  collectModifiers,
  shardShop,
  starlightShop,
  type GameState,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { gemCoin, svg } from '../art/gems';
import { ITEM_VIEWBOX } from '../art/items';
import { animatedSpriteHtml, sprite } from '../art/pixel/sprites';
import { h } from '../shell/shell';
import { icon, type IconName } from '../shell/icons';
import { starlightSvg } from '../ui/skins';
import { hide as hideTip } from '../shell/tooltip';
import { reducedMotion } from '../stage/motion';
import { showReveal } from '../stage/reveal';
import { toast } from '../stage/toast';
import { gateView, rewardView, starlightViews, type RewardView } from './ascensionModel';
import { shardGainView, shardOfferViews, shardsText, type OfferArt } from './achievementsModel';
import { createChallengesPanel } from './challengesPanel';
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

  /** One counter: a wooden signboard on two chains, and the shelf under it. */
  function stall(
    cls: string,
    label: string,
    signText: string,
  ): { el: HTMLElement; body: HTMLElement; sign: HTMLElement; count: HTMLElement } {
    const el = h('section', `shop-stall ${cls}`);
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
    // a line icon: the coin art (48 px) would have to shrink to fit a chip
    if (coin === 'star') ico.append(icon('starlight', 'shop-icon'));
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
  // Counter 1: Starlight shop
  // =====================================================================================
  const star = stall('shop-stall--starlight', t.shop, ts.boards.starlight);
  const offers = h('ul', 'shop-list');
  star.body.append(offers);

  // Autobuyer switches (DESIGN.md §15): shown once an autobuyer is owned, stored in state.automation.
  const auto = h('div', 'shop-auto');
  auto.hidden = true;
  const autoHead = h('h3', 'shop-head', t.autobuyers);
  const autoTrees = switchRow(t.autoTrees, (on) => setAuto({ treeLevels: on }));
  const autoMines = switchRow(t.autoMines, (on) => setAuto({ mineLevels: on }));
  const reserveLabel = h('label', 'shop-auto__row');
  const reserveIn = h('input', 'shop-auto__reserve bi-num') as HTMLInputElement;
  reserveIn.type = 'number';
  reserveIn.min = '0';
  reserveIn.max = '100';
  reserveIn.step = '5';
  reserveIn.addEventListener('change', () => setAuto({ reservePercent: Number(reserveIn.value) }));
  reserveLabel.append(h('span', '', t.autoReserve + ' (%)'), reserveIn);
  auto.append(
    autoHead,
    autoTrees.row,
    autoMines.row,
    reserveLabel,
    h('p', 'shop-note', t.autoNote),
  );
  star.body.append(auto);

  function switchRow(label: string, onChange: (on: boolean) => void) {
    const row = h('label', 'shop-auto__row');
    const box = h('input') as HTMLInputElement;
    box.type = 'checkbox';
    box.addEventListener('change', () => onChange(box.checked));
    row.append(box, h('span', '', label));
    return { row, box };
  }
  function setAuto(patch: Partial<AutomationState>): void {
    ctx.apply(setAutomation(ctx.state(), patch));
  }

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
    const li = h('li', 'shop-it shop-it--star');
    li.dataset.item = item.id;
    const level = h('span', 'shop-it__level bi-num');
    const effect = h('span', 'shop-it__sub');
    const track = h('i', 'shop-lv');
    track.setAttribute('aria-hidden', 'true');
    const fill = h('u');
    track.append(fill);
    const price = priceBtn(() => buyStarlight(item.id), 'star');
    const stamp = h('span', 'shop-stamp');
    stamp.setAttribute('aria-hidden', 'true');
    stamp.hidden = true;
    stamp.innerHTML = spriteBox('shop-stamp');
    li.append(h('b', 'shop-it__name', item.name), level, effect, track, price, stamp);
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
  // Counter 2: Shard shop
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
    summon_crystal: 'shop-sup1',
    glamour_crystal: 'shop-sup2',
    frost_core: 'shop-sup3',
    glimmer_dust: 'shop-sup4',
    facet_shard: 'shop-sup5',
  };

  function offerArt(art: OfferArt, s: GameState): string {
    switch (art.kind) {
      case 'card':
        // a whole-scale weapon in a window that crops what does not fit (shop.css)
        return svg(cardItemArt(content, art.cardId, s.cards.owned[art.cardId], s), ITEM_VIEWBOX);
      case 'coin': {
        const gem = content.resourceById.get(art.resource)?.gem;
        return gem ? svg(gemCoin(gem, 1)) : '';
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
        shardUis.get(id)?.price.focus();
      },
    });
  }

  // =====================================================================================
  // Counter 3: Ascension
  // =====================================================================================
  const asc = stall('shop-stall--ascension', t.gate, ts.boards.ascension);
  const nth = h('em', 'shop-sign__count shop-sign__nth');
  asc.sign.append(nth);
  asc.count.remove();
  const gate = h('div', 'shop-gate');
  asc.body.append(gate);

  // the ring at 2x around the Starlight coin
  const ringWrap = h('div', 'shop-ring');
  ringWrap.setAttribute('aria-hidden', 'true');
  const ringSprite = sprite('shop-ring');
  if (ringSprite) {
    ringWrap.classList.add('shop-spr');
    ringWrap.style.cssText = `--nw:${ringSprite.w};--nh:${ringSprite.h};--want:2`;
  }
  const ring = h('span', 'shop-ring__sprite');
  ring.innerHTML = animatedSpriteHtml('shop-ring', 1);
  const ringCoin = h('span', 'shop-ring__coin');
  ringCoin.innerHTML = starlightSvg();
  ringWrap.append(ring, ringCoin);

  const ready = h('div', 'shop-panel');
  const gainValue = h('p', 'shop-gain px-display bi-num');
  const needs = h('p', 'shop-needs');
  const rewardsNote = h('p', 'shop-needs');
  const ascendBtn = h('button', 'shop-ascend px-display');
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
  const doneGain = h('p', 'shop-gain px-display bi-num');
  const doneLabel = h('p', 'shop-needs', t.doneGainLabel);
  const doneRewardsHead = h('h3', 'shop-head', t.doneRewards);
  const doneRewards = h('ul', 'shop-bullets');
  const nextBtn = h('button', 'shop-ascend', t.doneNext);
  nextBtn.type = 'button';
  nextBtn.addEventListener('click', () => setMode('ready', true));
  done.append(doneTitle, doneGain, doneLabel, doneRewardsHead, doneRewards, nextBtn);

  // Kept and Reset: two tiles side by side
  const keptList = h('ul', 'shop-bullets shop-bullets--kept');
  const resetList = h('ul', 'shop-bullets shop-bullets--reset');
  const lists = h('div', 'shop-lists');
  for (const [head, list] of [
    [ts.kept, keptList],
    [ts.reset, resetList],
  ] as const) {
    const tile = h('section', 'shop-keep px-tile');
    tile.append(h('h3', 'shop-head', head), list);
    lists.append(tile);
  }
  const challenges = createChallengesPanel(ctx, content, () => {
    mode = 'ready';
    render();
  });
  gate.append(ringWrap, ready, confirm, done, lists, challenges.el);

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

    challenges.render();

    // ---- ascension ----
    if (mode !== 'walking') {
      const view = gateView(ascensionPreview(s, content, mods), s, content);
      table.dataset.ready = String(view.canAscend);
      set(nth, ts.no(view.ascension));
      if (mode === 'ready' || mode === 'confirm') {
        set(gainValue, ts.gain(view.gain));
        // the line under the gain: what is still needed, or what the gain grows with
        set(needs, view.canAscend ? t.gainHint : view.needs);
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
      ui.li.style.setProperty('--max', String(Math.max(1, v.maxLevel)));
      ui.fill.style.width = `${((v.level / Math.max(1, v.maxLevel)) * 100).toFixed(1)}%`;
      ui.li.classList.toggle('is-maxed', v.maxed);
      if (v.maxed) {
        setPrice(ui.price, ts.max, false, `${v.name}: ${t.maxed}`, false);
        ui.price.classList.add('is-max');
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

    const ownTrees = autobuyerOwned(s, content, 'treeLevels');
    const ownMines = autobuyerOwned(s, content, 'mineLevels');
    auto.hidden = !ownTrees && !ownMines;
    autoTrees.row.hidden = !ownTrees;
    autoMines.row.hidden = !ownMines;
    autoTrees.box.checked = s.automation.treeLevels;
    autoMines.box.checked = s.automation.mineLevels;
    if (document.activeElement !== reserveIn) reserveIn.value = String(s.automation.reservePercent);

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
