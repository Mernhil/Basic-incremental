import { achievementList, buyShardItem, shardShop, type GameState } from '../../../game';
import { COPY } from '../copy';
import { PLAQUE_VIEWBOX, gemCoin, navPlaque, svg } from '../art/gems';
import { STICKER_VIEWBOX, stickerArt } from '../art/cosmetics';
import { shardSvg, skinStyle, starlightSvg } from '../ui/skins';
import { ITEM_VIEWBOX } from '../art/items';
import { frame, h } from '../shell/shell';
import { icon, type IconName } from '../shell/icons';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { reducedMotion } from '../stage/motion';
import { showReveal } from '../stage/reveal';
import { toast } from '../stage/toast';
import { createBuyButton, type BuyButton } from '../ui/buy';
import {
  SHARD_GROUPS,
  bookView,
  shardGainView,
  shardOfferViews,
  shardsText,
  spread,
  type ChapterView,
  type OfferArt,
  type StickerView,
} from './achievementsModel';
import { cardFaceProps, cardItemArt } from './loadoutCards';
import type { PageContext } from './production';
import './achievements.css';

/**
 * Achievements page (DESIGN.md 11.6, 12.20, 17 "sticker book", A10 C). Two tabs: the sticker
 * book, a two-page spread with one chapter per area where every achievement is a sticker slot
 * (locked: a dashed outline with a faint print of the art and a progress bar; unlocked: the
 * sticker slapped in with a bounce), and the shard shop, where card shards buy card copies,
 * bundles and one Ember Crown.
 */

export interface AchievementsContext extends PageContext {
  sound?: (id: string) => void;
}

type Tab = 'book' | 'shop';

const RESOURCE_ICON: Record<string, IconName> = {
  tree_gem: 'wood',
  mine_gem: 'ore',
  material: 'material',
  portal: 'portal',
  prestige: 'starlight',
};

export function createAchievementsPage(
  page: HTMLElement,
  ctx: AchievementsContext,
): { render(): void; show(tab: Tab): void } {
  const { content } = ctx;
  const t = COPY.achievements;
  let tab: Tab = 'book';

  // ---- tabs ----
  const tabBar = h('div', 'ac-tabs');
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', t.tabs);
  const tabs: Record<Tab, HTMLButtonElement> = {
    book: h('button', 'ac-tab', t.bookTab),
    shop: h('button', 'ac-tab', t.shopTab),
  };
  const panels: Record<Tab, HTMLElement> = {
    book: h('div', 'ac-panel ac-panel--book'),
    shop: h('div', 'ac-panel ac-panel--shop'),
  };
  (Object.keys(tabs) as Tab[]).forEach((id, i, all) => {
    const b = tabs[id];
    b.type = 'button';
    b.id = `ac-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `ac-panel-${id}`);
    panels[id].id = `ac-panel-${id}`;
    panels[id].setAttribute('role', 'tabpanel');
    panels[id].setAttribute('aria-labelledby', b.id);
    b.addEventListener('click', () => show(id));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]!;
      show(next);
      tabs[next].focus();
    });
    tabBar.append(b);
  });
  page.append(tabBar, panels.book, panels.shop);

  function show(next: Tab): void {
    tab = next;
    for (const id of Object.keys(tabs) as Tab[]) {
      const on = id === tab;
      tabs[id].setAttribute('aria-selected', String(on));
      tabs[id].tabIndex = on ? 0 : -1;
      panels[id].hidden = !on;
    }
    hideTip();
    render();
  }

  // ---- sticker book ----
  const book = h('section', 'ac-book');
  book.setAttribute('aria-labelledby', 'ac-book-title');
  const head = h('header', 'ac-book__head');
  const title = h('h2', 'ac-book__title', t.book);
  title.id = 'ac-book-title';
  const summary = h('p', 'ac-book__summary bi-num');
  const meter = h('span', 'ac-book__meter');
  meter.setAttribute('aria-hidden', 'true');
  const meterFill = h('i');
  meter.append(meterFill);
  head.append(title, summary, meter);
  const pages = [h('div', 'ac-sheet ac-sheet--left'), h('div', 'ac-sheet ac-sheet--right')];
  const spreadEl = h('div', 'ac-spread');
  spreadEl.append(...pages);
  book.append(head, spreadEl);
  panels.book.append(book);

  type SlotUi = {
    li: HTMLElement;
    sticker: HTMLElement;
    art: HTMLElement;
    /** Style and lock state the picture was drawn for. */
    artKey: string;
    meta: HTMLElement;
    fill: HTMLElement;
    view: StickerView;
    unlocked: boolean | null;
  };
  const slots = new Map<string, SlotUi>();
  type ChapterUi = { el: HTMLElement; count: HTMLElement };
  const chapterUis = new Map<string, ChapterUi>();
  /** Stickers already shown stuck in; a newly unlocked one is slapped in on the next render. */
  const seen = new Set(
    achievementList(ctx.state(), content)
      .filter((e) => e.unlocked)
      .map((e) => e.achievement.id),
  );

  function buildBook(chapters: ChapterView[]): void {
    const [left, right] = spread(chapters);
    [left, right].forEach((list, side) => {
      for (const c of list) {
        const sec = h('section', 'ac-chapter');
        sec.dataset.chapter = c.id;
        const tape = h('h3', 'ac-tape');
        tape.id = `ac-chapter-${c.id}`;
        sec.setAttribute('aria-labelledby', tape.id);
        const count = h('span', 'ac-tape__count bi-num');
        tape.append(h('span', 'ac-tape__name', c.title), count);
        const grid = h('ul', 'ac-grid');
        for (const s of c.stickers) grid.append(slot(s));
        sec.append(tape, grid);
        pages[side]!.append(sec);
        chapterUis.set(c.id, { el: sec, count });
      }
    });
  }

  function slot(s: StickerView): HTMLElement {
    const li = h('li', 'ac-slot');
    li.dataset.id = s.id;
    li.tabIndex = 0;
    li.style.setProperty('--tilt', `${s.tilt}deg`);
    const sticker = h('span', 'ac-sticker');
    sticker.setAttribute('aria-hidden', 'true');
    const art = h('span', 'ac-sticker__art');
    sticker.append(art);
    const bar = h('i', 'ac-slot__bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = h('i');
    bar.append(fill);
    const meta = h('span', 'ac-slot__meta bi-num');
    li.append(sticker, h('span', 'ac-slot__name', s.name), bar, meta);
    const ui: SlotUi = { li, sticker, art, artKey: '', meta, fill, view: s, unlocked: null };
    attachTooltip(li, () => tip(ui.view));
    slots.set(s.id, ui);
    return li;
  }

  function tip(s: StickerView): HTMLElement {
    const box = h('div', 'ac-tip');
    box.append(h('strong', '', s.name), h('span', '', s.description));
    if (s.unlocked) box.append(h('span', 'ac-tip__date', s.dateText));
    else if (s.progressText) box.append(h('span', 'ac-tip__progress bi-num', s.progressText));
    if (s.rewards.length > 0) {
      const r = h('div', 'ac-tip__reward');
      r.append(h('span', 'ac-tip__label', t.reward));
      const list = h('ul');
      for (const line of s.rewards) list.append(h('li', '', line));
      r.append(list);
      box.append(r);
    }
    return box;
  }

  function renderBook(s: GameState): void {
    const view = bookView(achievementList(s, content), content);
    if (slots.size === 0) buildBook(view.chapters);
    set(summary, view.summary);
    meterFill.style.width = `${(view.progress * 100).toFixed(1)}%`;
    for (const c of view.chapters) {
      const ui = chapterUis.get(c.id);
      if (!ui) continue;
      set(ui.count, c.count);
      ui.el.classList.toggle('is-done', c.done);
      for (const st of c.stickers) syncSlot(st);
    }
  }

  function syncSlot(s: StickerView): void {
    const ui = slots.get(s.id);
    if (!ui) return;
    ui.view = s;
    // the equipped sticker style draws the die-cut and the picture; redraw when either changes
    const style = skinStyle('sticker');
    const artKey = `${style}|${s.unlocked}`;
    if (ui.artKey !== artKey) {
      ui.artKey = artKey;
      ui.art.innerHTML = svg(stickerArt(style, s.id, s.chapter, s.unlocked), STICKER_VIEWBOX);
    }
    if (ui.unlocked !== s.unlocked) {
      ui.unlocked = s.unlocked;
      ui.li.classList.toggle('is-unlocked', s.unlocked);
      if (s.unlocked && !seen.has(s.id)) {
        seen.add(s.id);
        if (!reducedMotion()) {
          ui.li.classList.remove('is-slapping');
          void ui.li.offsetWidth;
          ui.li.classList.add('is-slapping');
          window.setTimeout(() => ui.li.classList.remove('is-slapping'), 900);
        }
      }
    }
    set(ui.meta, s.unlocked ? s.dateText : s.progressText || t.locked);
    ui.fill.style.width = `${(s.progress * 100).toFixed(1)}%`;
    const label = t.stickerLabel(
      s.name,
      s.unlocked ? t.unlockedLabel : t.lockedLabel(s.progressText),
    );
    if (ui.li.getAttribute('aria-label') !== label) ui.li.setAttribute('aria-label', label);
  }

  // ---- shard shop ----
  const shop = frame(t.shop);
  shop.el.classList.add('ac-shop');
  const balance = h('div', 'ac-balance');
  const shard = h('span', 'ac-shard');
  shard.setAttribute('aria-hidden', 'true');
  shard.innerHTML = shardSvg();
  const balanceValue = h('strong', 'ac-balance__value bi-num');
  const balanceText = h('span', 'ac-balance__text');
  balanceText.append(h('span', 'ac-balance__label', t.shardsLabel), balanceValue);
  balance.append(shard, balanceText, h('p', 'ac-balance__hint', t.shardsHint));
  shop.body.append(balance);

  type OfferUi = { li: HTMLElement; btn: BuyButton; stock: HTMLElement };
  const offerUis = new Map<string, OfferUi>();
  const groupLists = new Map<string, HTMLElement>();
  for (const g of SHARD_GROUPS) {
    const sec = h('section', 'ac-group');
    const heading = h('h3', 'ac-group__title', t.groups[g]);
    heading.id = `ac-group-${g}`;
    sec.setAttribute('aria-labelledby', heading.id);
    const list = h('ul', `ac-offers ac-offers--${g}`);
    sec.append(heading, list);
    shop.body.append(sec);
    groupLists.set(g, list);
  }
  panels.shop.append(shop.el);

  function offerArt(art: OfferArt, s: GameState): string {
    switch (art.kind) {
      case 'card':
        return svg(cardItemArt(content, art.cardId, s.cards.owned[art.cardId]), ITEM_VIEWBOX);
      case 'coin': {
        const gem = content.resourceById.get(art.resource)?.gem;
        return gem ? svg(gemCoin(gem, 1)) : '';
      }
      case 'resource': {
        const kind = content.resourceById.get(art.resource)?.kind ?? 'material';
        if (kind === 'prestige') return `<span class="ac-offer__icon">${starlightSvg()}</span>`;
        return icon(RESOURCE_ICON[kind] ?? 'material', 'ac-offer__icon').outerHTML;
      }
      case 'cosmetic':
        return svg(navPlaque('wardrobe'), PLAQUE_VIEWBOX);
    }
  }

  function buildShop(s: GameState): void {
    for (const v of shardOfferViews(shardShop(s, content), s, content)) {
      const li = h('li', 'ac-offer');
      li.dataset.item = v.id;
      li.dataset.art = v.art.kind;
      if (v.rarity) {
        li.dataset.rarity = v.rarity;
        const body = content.rarityById.get(v.rarity)?.tokens['body'];
        if (body) li.style.setProperty('--ac-rarity', body);
      }
      const art = h('span', 'ac-offer__art');
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = offerArt(v.art, s);
      const text = h('span', 'ac-offer__text');
      text.append(h('span', 'ac-offer__name', v.name), h('span', 'ac-offer__detail', v.detail));
      const stock = h('span', 'ac-offer__stock');
      const btn = createBuyButton(() => buy(v.id), true);
      li.append(art, text, stock, btn.el);
      groupLists.get(v.group)?.append(li);
      offerUis.set(v.id, { li, btn, stock });
    }
  }

  let busy = false;
  function buy(id: string): void {
    if (busy) return;
    const before = ctx.state();
    const result = buyShardItem(before, content, id);
    if (!result.ok) return;
    hideTip();
    ctx.apply(result.state);
    offerUis.get(id)?.btn.celebrate();
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
      portalName: t.shop,
      views: [gain.view],
      face: (itemId) =>
        content.cardById.has(itemId) ? cardFaceProps(content, after, itemId) : null,
      ...(ctx.sound ? { sound: ctx.sound } : {}),
      onClose: () => {
        busy = false;
        offerUis.get(id)?.btn.el.focus();
      },
    });
  }

  let artKey = '';
  function renderShop(s: GameState): void {
    if (offerUis.size === 0) buildShop(s);
    set(balanceValue, shardsText(s));
    // card art follows the owned card's evolution
    const key = Object.entries(s.cards.owned)
      .map(([id, c]) => `${id}:${c.tier}:${c.stars}`)
      .join(',');
    const refreshArt = key !== artKey;
    artKey = key;
    for (const v of shardOfferViews(shardShop(s, content), s, content)) {
      const ui = offerUis.get(v.id);
      if (!ui) continue;
      ui.btn.update(v.buy);
      ui.btn.el.setAttribute(
        'aria-label',
        v.soldOut ? `${v.name}: ${t.soldOut}` : t.buyLabel(v.name, v.buy.price, v.buy.preview),
      );
      ui.li.classList.toggle('is-soldout', v.soldOut);
      set(ui.stock, v.stockText);
      ui.stock.hidden = v.stockText === '';
      if (refreshArt && v.art.kind === 'card') {
        const art = ui.li.querySelector('.ac-offer__art');
        if (art) art.innerHTML = offerArt(v.art, s);
      }
    }
  }

  function render(): void {
    const s = ctx.state();
    if (tab === 'book') renderBook(s);
    else renderShop(s);
  }

  show('book');
  return { render, show };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
