import {
  claimDaily,
  collectModifiers,
  dailyAvailable,
  defaultRng,
  FOCUS_PORTAL_ID,
  focusKinds,
  heirloomGateInfo,
  localDay,
  pullHeirloomGate,
  portalInfo,
  pull,
  resolvePortal,
  setFocusKind,
  setWishlisted,
  wishlistView,
  type GameState,
  type PullCount,
} from '../../../game';
import { navPlaque, PLAQUE_VIEWBOX, svg } from '../art/gems';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { h } from '../shell/shell';
import { hide as hideTip } from '../shell/tooltip';
import { showReveal, type CutInInfo } from '../stage/reveal';
import { DOOR_ART } from '../art/summon/doors';
import { cosmeticSwatch } from '../ui/cosmeticSwatch';
import { createCard, starSpritesHtml, type CardProps } from '../ui/card';
import { fitCard, screenDpr } from '../ui/pixelFit';
import { resourceIconMarkup } from '../ui/resourceIcons';
import { cardTierArt, ITEM_VIEWBOX } from '../art/items';
import { ITEM_KINDS } from '../../../data';

/** A Wishlist tile shows the whole item box (the weapon uncropped, centred). */
const WISH_VIEWBOX = ITEM_VIEWBOX;
import { cardFaceProps, weaponArtMarkup } from './loadoutCards';
import type { PageContext } from './production';
import {
  doorAbout,
  doorKeyOf,
  doorPx,
  DOOR_ORDER,
  spriteNameOf,
  handSummary,
  heirloomBoardView,
  heirloomDeckView,
  heirloomRevealViews,
  lastHandView,
  lockedHeirloomState,
  oddsTable,
  portalView,
  tierBoxes,
  revealViews,
  wishlistPanelView,
  wishKindIndex,
  type HandCardView,
  type PortalView,
  type RevealView,
} from './summonModel';
import './summon.css';

/**
 * Summon page (DESIGN.md §2 "The reveal is redone", §7; the user's pick, 2026-11-22: layout 2, the
 * three doors; the picture is design/options/summon-look/b-page.png). The Card Portal, Focus Portal
 * and Heirloom Gate stand side by side as doors (the art controller's pictures, closed and open),
 * each with its name, what it pulls, and its own Pull 1 and Pull 10 with the price. One strip under
 * them holds the Card Portal's level bar, the first 10-pull line, the T6 pity bar, the chances now
 * and the Tier collection check boxes. "More from the portals" below keeps everything else: the
 * daily scrolls, the Wardrobe and Legacy gates, the Wishlist, the odds table, the Heirloom board
 * and "Your last hand". A pull opens the reveal (stage/reveal.ts). The selected door and the last
 * hand live in UI memory only (no save change).
 */

export interface SummonContext extends PageContext {
  sound?: (id: string) => void;
}

/** A card of the last hand: its view, and the card face or cosmetic picture it shows. */
interface HandEntry {
  view: HandCardView;
  face: CardProps | null;
  picture: HTMLElement | null;
}

type PullButton = { el: HTMLButtonElement; cost: HTMLElement };
type DeckUi = {
  root: HTMLElement;
  stack: HTMLElement;
  pityValue: HTMLElement;
  pityBar: HTMLElement;
  pityFill: HTMLElement;
  line: HTMLElement;
  /** The portal's level bar and the first 10-pull line (card portals only). */
  level: {
    box: HTMLElement;
    label: HTMLElement;
    value: HTMLElement;
    bar: HTMLElement;
    fill: HTMLElement;
  } | null;
  first: HTMLElement | null;
  /** "Hunting: ..." under the deck (card portal with a wishlist only). */
  hunt: HTMLElement | null;
  /** The Focus Portal's item type buttons and the line saying what it pulls. */
  focus: { box: HTMLElement; line: HTMLElement } | null;
  single: PullButton;
  ten: PullButton;
};

type DoorUi = {
  root: HTMLElement;
  pic: HTMLButtonElement;
  about: HTMLElement;
  /** "Hunting: ..." under the Card Portal's name (a wishlist is marked). */
  hunt: HTMLElement | null;
  /** The Focus Portal's item type buttons. */
  focus: { box: HTMLElement } | null;
  /** The Heirloom Gate's own pity bar (the Card and Focus portals share the strip's). */
  pity: {
    box: HTMLElement;
    label: HTMLElement;
    value: HTMLElement;
    bar: HTMLElement;
    fill: HTMLElement;
  } | null;
  single: PullButton;
  ten: PullButton;
};

export function createSummonPage(page: HTMLElement, ctx: SummonContext): { render(): void } {
  const { content } = ctx;
  // the panel carries the sighted headings; the page name stays for screen readers
  page.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
  const table = h('div', 'sm-table');
  // the deck backs and the hand's cards are 1x: 132 CSS px on a 100 % screen, whole device pixels
  fitCard(table, { want: 132 });
  page.append(table);
  // the three doors, then the strip, then "More from the portals" (two columns, each dealt in as one
  // section of the view, motion E): the Wardrobe and Legacy gates on the left, the open gate's
  // content with the last hand under it on the right
  const doorsRow = h('section', 'sm-doors');
  doorsRow.setAttribute('aria-label', COPY.summon.doorsLabel);
  doorsRow.dataset['deal'] = '';
  const strip = h('section', 'sm-strip px-panel');
  strip.setAttribute('aria-label', COPY.summon.stripLabel);
  strip.dataset['deal'] = '';
  const more = h('div', 'sm-more');
  const colDecks = h('div', 'sm-col sm-col--decks');
  const colMain = h('div', 'sm-col sm-col--main');
  for (const col of [colDecks, colMain]) col.dataset['deal'] = '';
  colDecks.setAttribute('aria-label', COPY.summon.gatesLabel);
  more.append(h('h2', 'sm-more__title px-display', COPY.summon.moreTitle), colDecks, colMain);
  /** The gate whose deck is open: a portal id, `focus_portal`, `heirloom_gate` or the locked gate. */
  let openGate = content.portals[0]?.id ?? FOCUS_PORTAL_ID;
  const gates = new Map<
    string,
    {
      root: HTMLElement;
      row: HTMLButtonElement;
      rowLine: HTMLElement;
      rowPity: HTMLElement;
      deck: HTMLElement;
    }
  >();

  const decks = new Map<string, DeckUi>();
  const views = new Map<string, PortalView>();
  let busy = false;
  let hand: HandEntry[] = [];
  let handViews: RevealView[] = [];
  let oddsKey = '';
  let wishKey = '';
  let wishRead = '';
  let wishActive = false;

  // ---- odds table (every portal side by side) ----
  const odds = h('section', 'sm-odds px-panel');
  odds.setAttribute('aria-label', COPY.summon.oddsTitle);
  const oddsBody = h('table', 'sm-odds__table');
  oddsBody.setAttribute('aria-label', COPY.summon.oddsTableLabel);
  const oddsNote = h('p', 'sm-odds__note');
  odds.append(h('h2', 'sm-odds__title px-display', COPY.summon.oddsTitle), oddsBody, oddsNote);

  function renderOdds(): void {
    // the open gate's odds (the Focus Portal has the Card Portal's rates and gets a note)
    const list = [views.get(openGate)].filter((v): v is PortalView => !!v);
    const t = oddsTable(list);
    const key = JSON.stringify(t);
    if (key === oddsKey) return;
    oddsKey = key;
    const head = h('tr');
    head.append(h('th', 'sm-odds__corner'));
    for (const c of t.columns) {
      const th = h('th', 'sm-odds__col', c.name);
      th.scope = 'col';
      head.append(th);
    }
    const thead = h('thead');
    thead.append(head);
    const tbody = h('tbody');
    for (const r of t.rows) {
      const tr = h('tr', 'sm-odds__row');
      tr.dataset['rarity'] = r.rarity;
      const th = h('th', 'sm-odds__rarity');
      th.scope = 'row';
      const swatch = h('i', 'sm-odds__swatch');
      swatch.setAttribute('aria-hidden', 'true');
      th.append(swatch, h('span', '', r.name));
      tr.append(th);
      for (const cell of r.cells) {
        const td = h('td', 'sm-odds__cell bi-num', cell ?? COPY.summon.oddsNone);
        if (cell === null) td.setAttribute('aria-label', COPY.summon.oddsNoneLabel);
        tr.append(td);
      }
      tbody.append(tr);
    }
    oddsBody.replaceChildren(thead, tbody);
    const notes = [...new Set(list.map((v) => v.guarantee))];
    for (const v of list) if (v.levelNote) notes.push(v.levelNote);
    if (openGate === FOCUS_PORTAL_ID) notes.push(COPY.summon.oddsFocus);
    if (wishActive && list[0]?.kind === 'cards') notes.push(COPY.summon.oddsWishlist);
    oddsNote.replaceChildren(...notes.map((n) => h('span', '', n)));
  }

  // ---- the wishlist (the Card Portal's cards, marked to hunt) ----
  const wish = h('section', 'sm-wish px-panel');
  wish.setAttribute('aria-label', COPY.summon.wishlistTitle);
  wish.hidden = true;
  /** The hovered or last-clicked card on one line (name, type, element, job). */
  const readout = h('p', 'sm-wish__read', COPY.summon.wishlistHover);
  readout.setAttribute('aria-live', 'polite');
  const wishPortal = content.portals.find((p) => p.kind === 'cards' && p.wishlistPerTier > 0);

  function renderWishlist(): void {
    if (!wishPortal) return;
    const s = ctx.state();
    const info = wishlistView(s, content, wishPortal.id);
    if (!info) return;
    const v = wishlistPanelView(info, s, content);
    wishActive = v.active;
    const hunt = (decks.get(wishPortal.id) ?? doors.get(wishPortal.id))?.hunt;
    if (hunt) set(hunt, v.hunting);
    const key = JSON.stringify(v);
    if (key === wishKey) return;
    wishKey = key;
    wish.hidden = false;
    if (wishRead) set(readout, wishRead);
    const focused = (document.activeElement as HTMLElement | null)?.dataset['wish'];
    const rows = v.rows.map((r) => {
      const row = h('div', 'sm-wish__row');
      row.dataset['rarity'] = r.rarity;
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', r.label);
      const head = h('span', 'sm-wish__rarity');
      head.append(h('i', 'sm-odds__swatch'), h('span', '', r.name));
      head.append(h('b', 'sm-wish__count bi-num', r.countText));
      const list = h('span', 'sm-wish__cards');
      // one column per weapon type, so a type keeps its place from row to row
      const columns = ITEM_KINDS.map(() => h('span', 'sm-wish__col'));
      for (const c of r.cards) {
        const b = h('button', `sm-wish__card${c.marked ? ' is-marked' : ''}`);
        b.type = 'button';
        b.dataset['wish'] = c.id;
        b.dataset['element'] = c.element;
        b.title = c.detail;
        b.setAttribute('aria-pressed', String(c.marked));
        b.setAttribute('aria-label', c.label);
        b.classList.toggle('is-blocked', c.blocked);
        b.classList.toggle('is-unowned', !c.owned);
        const card = content.cardById.get(c.id);
        const pic = h('span', 'sm-wish__pic');
        if (card) {
          pic.innerHTML = `<svg viewBox="${WISH_VIEWBOX}" aria-hidden="true" focusable="false">${cardTierArt(card)}</svg>`;
        }
        b.append(pic, h('i', 'sm-wish__elem'), h('i', 'sm-wish__tick'));
        const show = (): void => {
          wishRead = c.detail;
          set(readout, wishRead);
        };
        b.addEventListener('pointerenter', show);
        b.addEventListener('focus', show);
        b.addEventListener('click', () => {
          show();
          const result = setWishlisted(ctx.state(), content, c.id, !c.marked, wishPortal.id);
          if (result.ok) ctx.apply(result.state);
          render();
        });
        columns[wishKindIndex(c.kind)]?.append(b);
      }
      list.append(...columns);
      row.append(head, list);
      return row;
    });
    wish.replaceChildren(
      h('h2', 'sm-wish__title px-display', COPY.summon.wishlistTitle),
      h('p', 'sm-wish__about', v.about),
      readout,
      ...rows,
    );
    if (focused)
      wish.querySelector<HTMLElement>(`[data-wish="${focused}"]`)?.focus({ preventScroll: true });
  }

  // ---- the tier collection: a check box per tier ----
  const tiers = h('div', 'sm-tiers');
  tiers.setAttribute('aria-label', COPY.summon.tiersTitle);
  let tiersKey = '';

  function renderTiers(): void {
    const boxes = tierBoxes(ctx.state(), content);
    const key = JSON.stringify(boxes);
    if (key === tiersKey) return;
    tiersKey = key;
    const list = h('ul', 'sm-tiers__list');
    for (const b of boxes) {
      const li = h('li', 'sm-tiers__row');
      li.dataset['rarity'] = b.rarity;
      li.setAttribute('role', 'checkbox');
      li.setAttribute('aria-checked', String(b.checked));
      li.setAttribute('aria-label', b.label);
      li.title = `${b.count} · ${b.reward}`;
      const box = h('i', `sm-tiers__box${b.checked ? ' is-checked' : ''}`);
      const name = h('span', 'sm-tiers__name');
      name.append(h('i', 'sm-odds__swatch'), h('span', '', b.name));
      li.append(
        box,
        name,
        h('b', 'sm-tiers__count bi-num', b.count),
        h('span', 'sm-tiers__reward', b.reward),
      );
      list.append(li);
    }
    tiers.replaceChildren(
      h('h2', 'sm-tiers__title px-display', COPY.summon.tiersTitle),
      h('p', 'sm-tiers__about', COPY.summon.tiersAbout),
      list,
    );
  }

  // ---- the last hand ----
  const handBox = h('section', 'sm-hand px-panel');
  const handHead = h('header', 'sm-hand__head');
  const handSum = h('p', 'sm-hand__summary bi-num');
  handHead.append(h('h2', 'sm-hand__title px-display', COPY.summon.handTitle), handSum);
  const handList = h('ul', 'sm-hand__list');
  // an empty hand shows the open gate's card backs, so the strip is never empty
  const handEmpty = h('div', 'sm-hand__empty');
  handEmpty.setAttribute('aria-label', COPY.summon.handEmptyBacks);
  for (let i = 0; i < 5; i++) {
    const back = h('i', 'sm-hand__back');
    back.setAttribute('aria-hidden', 'true');
    handEmpty.append(back);
  }
  handEmpty.append(h('p', 'sm-hand__emptytext', COPY.summon.handEmpty));
  const handRow = h('div', 'sm-hand__row');
  handRow.append(handEmpty, handList);
  handBox.append(handHead, handRow);
  handBox.setAttribute('aria-label', COPY.summon.handTitle);

  /** Spaces the cards of the hand: a gap when they fit, an overlap (whole device pixels) when not. */
  function spaceHand(): void {
    const n = hand.length;
    const first = handList.firstElementChild as HTMLElement | null;
    if (n < 2 || !first) return;
    const d = screenDpr();
    const cardW = first.getBoundingClientRect().width;
    const free = handRow.clientWidth - n * cardW;
    // when they fit, the gap leaves the level chip's overhang (0.27 of the card's width) free
    const gap = Math.min(Math.max(16, cardW * 0.27), Math.max(-cardW * 0.62, free / (n - 1)));
    handList.style.setProperty('--sm-gap', `${Math.floor(gap * d) / d}px`);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(spaceHand).observe(handRow);

  function renderHand(): void {
    handList.replaceChildren();
    handEmpty.hidden = hand.length > 0;
    handList.hidden = hand.length === 0;
    handBox.setAttribute(
      'aria-label',
      hand.length ? COPY.summon.handLabel(hand.length) : COPY.summon.handTitle,
    );
    handSum.textContent = handSummary(handViews);
    for (const e of hand) {
      const c = e.view;
      const li = h('li', 'sm-hand__card');
      li.dataset['rarity'] = c.rarity;
      li.setAttribute('aria-label', c.note ? `${c.label}, ${c.note}` : c.label);
      const tag = h(
        'span',
        c.isNew ? 'px-tile sm-hand__tag sm-hand__tag--new' : 'px-tile sm-hand__tag',
        c.isNew ? COPY.summon.tagNew : c.note,
      );
      tag.hidden = !c.isNew && !c.note;
      const fit = h('span', 'cp-fit sm-fit');
      if (e.face) fit.append(createCard(e.face).el);
      else {
        const plain = h('span', 'sm-plain');
        if (e.picture) plain.append(e.picture);
        plain.append(h('b', 'sm-plain__name', c.name));
        fit.append(plain);
      }
      li.append(tag, fit);
      handList.append(li);
    }
    spaceHand();
  }

  /** A legacy skin's picture for the reveal and the hand (null for any other item). */
  function skinPicture(itemId: string): HTMLElement | null {
    const entry = content.legacySkinById.get(itemId);
    if (!entry) return null;
    const box = h('span', 'sm-skin');
    box.innerHTML = `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${weaponArtMarkup(entry.weapon, entry.skin.art)}</svg>`;
    return box;
  }

  function doPull(portalId: string, count: PullCount): void {
    if (busy) return;
    const result = pull(ctx.state(), content, portalId, count, defaultRng);
    if (!result.ok) return;
    busy = true;
    hideTip();
    ctx.apply(result.state);
    const portal = resolvePortal(ctx.state(), content, portalId)!.portal;
    const after = result.state;
    const reveal = revealViews(result.results, content);
    handViews = reveal;
    hand = lastHandView(reveal, content).map((view) => ({
      view,
      face: content.cardById.has(view.itemId) ? cardFaceProps(content, after, view.itemId) : null,
      picture: content.cosmeticById.has(view.itemId)
        ? cosmeticSwatch(content, view.itemId, after.cosmetics.owned[view.itemId]?.level ?? 1)
        : skinPicture(view.itemId),
    }));
    renderHand();
    showReveal({
      portalName: portal.name,
      gateId: portalId,
      kind: portal.kind,
      views: reveal,
      face: (id) => (content.cardById.has(id) ? cardFaceProps(content, after, id) : null),
      picture: (id) =>
        content.cosmeticById.has(id)
          ? cosmeticSwatch(content, id, after.cosmetics.owned[id]?.level ?? 1)
          : skinPicture(id),
      cutin: cutinOf,
      again: { can: () => canPull(portalId, count), run: () => doPull(portalId, count) },
      ...(ctx.sound ? { sound: ctx.sound } : {}),
      onClose: () => {
        busy = false;
        // the buttons are enabled again before the focus goes back to the one that was used
        render();
        (decks.get(portalId) ?? doors.get(portalId))?.single.el.focus({ preventScroll: true });
      },
    });
  }

  /** What the cut-in plays for a card: its weapon type, element, tier and picture. */
  function cutinOf(itemId: string): CutInInfo | null {
    const card = content.cardById.get(itemId);
    if (!card) return null;
    return {
      kind: card.item.kind,
      element: card.element ?? '',
      tier: card.tier,
      sprite: spriteNameOf(cardTierArt(card)),
    };
  }

  /** Whether a pull can be paid right now (the reveal's Pull again). */
  function canPull(portalId: string, count: PullCount): boolean {
    const info = portalInfo(ctx.state(), content, portalId, collectModifiers(ctx.state(), content));
    return !!info && (count === 1 ? info.single : info.ten).affordable;
  }

  // ---- decks ----
  function deckShell(kind: string, locked: boolean): HTMLElement {
    const root = h('article', 'sm-deck px-panel');
    root.dataset['kind'] = kind;
    if (locked) root.classList.add('is-locked');
    return root;
  }

  function crestIcon(kind: string): HTMLElement {
    const icon = h('span', 'sm-plate__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = svg(
      navPlaque(kind === 'cosmetics' || kind === 'skins' ? 'wardrobe' : 'summon'),
      PLAQUE_VIEWBOX,
    );
    return icon;
  }

  /** The deck: card backs seen from the front, the edge of the pile showing right and below. */
  function buildStack(kind: string): HTMLElement {
    const stack = h('div', 'sm-stack');
    stack.setAttribute('role', 'img');
    const back = h('div', 'sm-stack__back');
    const plate = h('span', 'sm-plate');
    plate.append(crestIcon(kind));
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      const gem = h('i', `sm-stack__gem sm-stack__gem--${corner}`);
      gem.setAttribute('aria-hidden', 'true');
      back.append(gem);
    }
    back.append(plate);
    stack.append(
      h('i', 'sm-stack__edge sm-stack__edge--right'),
      h('i', 'sm-stack__edge sm-stack__edge--bottom'),
      back,
    );
    return stack;
  }

  function pullButton(label: string, ten: boolean, onClick: () => void): PullButton {
    const el = h('button', ten ? 'sm-pull sm-pull--ten px-btn px-btn--quiet' : 'sm-pull px-btn');
    el.type = 'button';
    const cost = h('span', 'sm-pull__cost bi-num');
    el.append(h('span', 'sm-pull__label', label), cost);
    el.addEventListener('click', onClick);
    return { el, cost };
  }

  function portalDeck(portalId: string): HTMLElement {
    const portal = resolvePortal(ctx.state(), content, portalId)!.portal;
    const root = deckShell(portal.kind, false);
    root.dataset['portal'] = portalId;
    const stack = buildStack(portal.kind);
    const line = h('p', 'sm-deck__line');
    const pityValue = h('b', 'bi-num');
    const pityTop = h('div', 'sm-pity__top');
    pityTop.append(h('span', '', COPY.summon.pityLabel), pityValue);
    const pityFill = h('i');
    const pityBar = h('div', 'sm-pity__track px-well');
    pityBar.setAttribute('role', 'meter');
    pityBar.setAttribute('aria-valuemin', '0');
    pityBar.setAttribute('aria-label', COPY.summon.pityMeter(portal.name));
    pityBar.append(pityFill);
    const pity = h('div', 'sm-pity');
    pity.append(pityTop, pityBar);
    // a card portal has levels: its own bar, above the pity bar
    let level: DeckUi['level'] = null;
    let first: HTMLElement | null = null;
    if (portal.kind === 'cards') {
      const label = h('span', '');
      const value = h('b', 'bi-num');
      const top = h('div', 'sm-pity__top');
      top.append(label, value);
      const fill = h('i');
      const bar = h('div', 'sm-pity__track px-well');
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-label', COPY.summon.levelMeter(portal.name));
      bar.append(fill);
      const box = h('div', 'sm-pity sm-level');
      box.append(top, bar);
      level = { box, label, value, bar, fill };
      first = h('p', 'sm-deck__first');
    }
    const buttons = h('div', 'sm-deck__buttons');
    const single = pullButton(COPY.summon.pullOne, false, () => doPull(portalId, 1));
    const ten = pullButton(COPY.summon.pullTen, true, () => doPull(portalId, 10));
    buttons.append(single.el, ten.el);
    root.append(h('h2', 'sm-deck__name px-display', portal.name), line, stack);
    if (level) root.append(level.box);
    root.append(pity);
    if (first) root.append(first);
    root.append(buttons);
    const hunt =
      portalId !== FOCUS_PORTAL_ID && portal.kind === 'cards' && portal.wishlistPerTier > 0
        ? h('p', 'sm-deck__hunt')
        : null;
    if (hunt) line.after(hunt);
    let focus: DeckUi['focus'] = null;
    if (portalId === FOCUS_PORTAL_ID) {
      // plain controls: one button per item type, the chosen one marked (clear it with a second click)
      const box = h('div', 'sm-focus');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', COPY.summon.focusPickLabel);
      const chosenLine = h('p', 'sm-deck__focus');
      for (const k of focusKinds(content)) {
        const b = h('button', 'sm-focus__kind px-btn px-btn--quiet', k.name);
        b.type = 'button';
        b.dataset['focus'] = k.kind;
        b.addEventListener('click', () => {
          const now = ctx.state().summon.focusKind;
          const result = setFocusKind(ctx.state(), content, now === k.kind ? null : k.kind);
          if (result.ok) ctx.apply(result.state);
          render();
        });
        box.append(b);
      }
      line.after(chosenLine, box);
      focus = { box, line: chosenLine };
    }
    decks.set(portalId, {
      root,
      stack,
      pityValue,
      pityBar,
      pityFill,
      line,
      level,
      first,
      hunt,
      focus,
      single,
      ten,
    });
    return root;
  }

  function lockedDeck(): HTMLElement {
    const root = deckShell('cosmetics', true);
    const stack = buildStack('cosmetics');
    stack.setAttribute('aria-label', `${COPY.summon.gate}: ${COPY.summon.gateLocked}`);
    stack.style.setProperty('--layers', '1');
    root.append(
      h('h2', 'sm-deck__name px-display', COPY.summon.gate),
      h('p', 'sm-deck__line', COPY.summon.gateAbout),
      stack,
      h('p', 'sm-deck__locked', COPY.summon.gateLocked),
    );
    return root;
  }

  // ---- the three doors (Card Portal, Focus Portal, Heirloom Gate) ----
  const heirloomId = content.heirlooms.gate.id;
  const doors = new Map<string, DoorUi>();

  function pityBlock(label: string, meterLabel: string): NonNullable<DoorUi['pity']> {
    const value = h('b', 'bi-num');
    const labelEl = h('span', '', label);
    const top = h('div', 'sm-pity__top');
    top.append(labelEl, value);
    const fill = h('i');
    const bar = h('div', 'sm-pity__track px-well');
    bar.setAttribute('role', 'meter');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-label', meterLabel);
    bar.append(fill);
    const box = h('div', 'sm-pity');
    box.append(top, bar);
    return { box, label: labelEl, value, bar, fill };
  }

  function buildDoor(id: string, name: string, heirloom: boolean): HTMLElement {
    const key = doorKeyOf(id);
    const art = DOOR_ART[key]!;
    const root = h('article', 'sm-door');
    root.dataset['door'] = key;
    root.dataset['portal'] = id;
    // the picture selects the door (what the Wishlist, odds and board below show); hover or focus
    // inside the door opens it a crack
    const pic = h('button', 'sm-door__pic');
    pic.type = 'button';
    const closed = h('img', 'sm-door__img sm-door__img--closed');
    const open = h('img', 'sm-door__img sm-door__img--open');
    closed.src = art.closed;
    open.src = art.open;
    for (const img of [closed, open]) {
      img.alt = '';
      img.draggable = false;
    }
    pic.append(closed, open);
    pic.addEventListener('click', () => {
      openGate = id;
      render();
    });
    const about = h('p', 'sm-door__about');
    const buttons = h('div', 'sm-door__buttons');
    const doPullOf = (n: PullCount): void => (heirloom ? doHeirloomPull(n) : doPull(id, n));
    const single = pullButton(COPY.summon.pullOne, false, () => doPullOf(1));
    const ten = pullButton(COPY.summon.pullTen, true, () => doPullOf(10));
    buttons.append(single.el, ten.el);
    root.append(pic, h('h2', 'sm-door__name px-display', name), about);
    let hunt: HTMLElement | null = null;
    if (id === 'card_portal' && wishPortal && wishPortal.id === id) {
      hunt = h('p', 'sm-door__hunt');
      root.append(hunt);
    }
    let focus: DoorUi['focus'] = null;
    if (id === FOCUS_PORTAL_ID) {
      // plain controls: one button per item type, the chosen one marked (clear it with a second click)
      const box = h('div', 'sm-focus');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', COPY.summon.focusPickLabel);
      for (const k of focusKinds(content)) {
        const b = h('button', 'sm-focus__kind px-btn px-btn--quiet', k.name);
        b.type = 'button';
        b.dataset['focus'] = k.kind;
        b.addEventListener('click', () => {
          const now = ctx.state().summon.focusKind;
          const result = setFocusKind(ctx.state(), content, now === k.kind ? null : k.kind);
          if (result.ok) ctx.apply(result.state);
          render();
        });
        box.append(b);
      }
      focus = { box };
      root.append(box);
    }
    let pity: DoorUi['pity'] = null;
    if (heirloom) {
      pity = pityBlock(COPY.summon.pityLabel, COPY.summon.pityMeter(name));
      root.append(pity.box);
    }
    root.append(buttons);
    const crack = (on: boolean): void => {
      root.classList.toggle('is-ajar', on);
    };
    root.addEventListener('pointerenter', () => crack(true));
    root.addEventListener('pointerleave', () => crack(false));
    root.addEventListener('focusin', () => crack(true));
    root.addEventListener('focusout', () => crack(false));
    doors.set(id, { root, pic, about, hunt, focus, pity, single, ten });
    return root;
  }

  const board = h('section', 'sm-board px-panel');
  const boardTitle = h('h2', 'sm-board__title px-display');
  const boardFacts = h('p', 'sm-board__facts');
  const boardGrid = h('div', 'sm-board__grid');
  boardGrid.setAttribute('role', 'table');
  const boardPity = h('div', 'sm-board__pity');
  const boardPityValue = h('b', 'bi-num');
  const boardPityFill = h('i');
  const boardPityTrack = h('div', 'sm-pity__track px-well');
  boardPityTrack.append(boardPityFill);
  boardPity.append(
    h('span', 'sm-board__pitylabel px-display', COPY.summon.pityLabel),
    boardPityTrack,
    boardPityValue,
  );
  const boardOdds = h('p', 'sm-board__odds');
  board.append(boardTitle, boardFacts, boardGrid, boardPity, boardOdds);
  let boardKey = '';

  function renderBoard(s: GameState): void {
    const info = heirloomGateInfo(s, content);
    const v = heirloomBoardView(info, content);
    set(boardTitle, v.title);
    set(boardFacts, v.facts);
    set(boardOdds, `${v.odds}. ${v.pityNote}`);
    set(boardPityValue, COPY.summon.pityOf(info.pity.count, info.pity.threshold));
    boardPityFill.style.width = `${Math.round(info.pity.progress * 100)}%`;
    const key = JSON.stringify(v.rows);
    if (key === boardKey) return;
    boardKey = key;
    const head = h('div', 'sm-board__row sm-board__row--head');
    head.setAttribute('role', 'row');
    head.append(h('span', 'sm-board__side'));
    for (const c of v.columns) {
      const th = h('span', 'sm-board__col', c.name);
      th.setAttribute('role', 'columnheader');
      head.append(th);
    }
    const rows = v.rows.map((r) => {
      const row = h('div', 'sm-board__row');
      row.setAttribute('role', 'row');
      const side = h('span', 'sm-board__side px-display', r.name);
      side.setAttribute('role', 'rowheader');
      row.append(side);
      for (const c of r.cells) {
        const cell = h('div', 'sm-cell');
        cell.setAttribute('role', 'cell');
        if (!c) {
          row.append(cell);
          continue;
        }
        cell.dataset['side'] = c.side;
        cell.classList.toggle('is-owned', c.owned);
        cell.setAttribute('aria-label', c.label);
        const card = content.cardById.get(c.cardId)!;
        const pic = h('span', 'sm-cell__pic');
        pic.innerHTML = `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${cardTierArt(card, 'heirloom')}</svg>`;
        const stars = h('span', 'sm-cell__stars bi-starset bi-stars');
        stars.setAttribute('aria-hidden', 'true');
        stars.dataset['tier'] = 'heirloom';
        if (c.owned) stars.innerHTML = starSpritesHtml(c.stars);
        const bar = h('span', 'sm-cell__bar px-well');
        const fill = h('i');
        fill.style.width = `${Math.round(c.progress * 100)}%`;
        bar.append(fill);
        cell.append(
          pic,
          h('b', 'sm-cell__name', c.name),
          stars,
          bar,
          h('span', 'sm-cell__count bi-num', c.shardsText),
        );
        row.append(cell);
      }
      return row;
    });
    boardGrid.replaceChildren(head, ...rows);
  }

  function doHeirloomPull(count: PullCount): void {
    if (busy) return;
    const result = pullHeirloomGate(ctx.state(), content, count, defaultRng);
    if (!result.ok) return;
    busy = true;
    hideTip();
    ctx.apply(result.state);
    const after = result.state;
    const reveal = heirloomRevealViews(result.results, content);
    handViews = reveal;
    hand = lastHandView(reveal, content).map((view) => ({
      view,
      face: cardFaceProps(content, after, view.itemId) ?? heirloomFace(after, view.itemId),
      picture: null,
    }));
    renderHand();
    showReveal({
      portalName: content.heirlooms.gate.name,
      gateId: heirloomId,
      kind: 'heirloom',
      views: reveal,
      face: (id) => cardFaceProps(content, after, id) ?? heirloomFace(after, id),
      cutin: cutinOf,
      again: {
        can: () => {
          const info = heirloomGateInfo(ctx.state(), content);
          return (count === 1 ? info.single : info.ten).affordable;
        },
        run: () => doHeirloomPull(count),
      },
      ...(ctx.sound ? { sound: ctx.sound } : {}),
      onClose: () => {
        busy = false;
        render();
        doors.get(heirloomId)?.single.el.focus({ preventScroll: true });
      },
    });
  }

  /** A locked Heirloom's face in the reveal and the hand: its card as it will be when unlocked. */
  function heirloomFace(s: GameState, cardId: string) {
    return cardFaceProps(content, lockedHeirloomState(s, cardId), cardId);
  }

  // ---- the strip: the Card Portal's level, first 10-pull, T6 pity, chances and tier boxes ----
  const stripLevel = pityBlock('', '');
  stripLevel.box.classList.add('sm-level');
  const stripFirst = h('p', 'sm-deck__first');
  const stripPity = pityBlock(COPY.summon.pityStripTitle, '');
  const stripPityLine = h('p', 'sm-strip__line');
  const stripChances = h('ul', 'sm-chances');
  const stripLevelCol = h('div', 'sm-strip__col');
  stripLevelCol.append(stripLevel.box, stripFirst);
  const stripPityCol = h('div', 'sm-strip__col');
  stripPityCol.append(
    stripPity.box,
    stripPityLine,
    h('h3', 'sm-strip__head', COPY.summon.chancesTitle),
    stripChances,
  );
  const stripTierCol = h('div', 'sm-strip__col');
  stripTierCol.append(tiers);
  strip.append(stripLevelCol, stripPityCol, stripTierCol);

  function renderStrip(v: PortalView): void {
    if (v.level) {
      set(stripLevel.value, v.level.value);
      set(stripLevel.label, v.level.label);
      stripLevel.fill.style.width = `${Math.round(v.level.progress * 100)}%`;
      stripLevel.bar.setAttribute('aria-label', COPY.summon.levelMeter(v.name));
      stripLevel.bar.setAttribute('aria-valuemax', String(v.level.max));
      stripLevel.bar.setAttribute('aria-valuenow', String(v.level.now));
    }
    set(stripFirst, v.firstTen ?? '');
    stripFirst.hidden = v.firstTen === null;
    set(stripPity.value, v.pityText);
    stripPity.fill.style.width = `${Math.round(v.pityProgress * 100)}%`;
    stripPity.bar.setAttribute('aria-label', COPY.summon.pityMeter(v.name));
    stripPity.bar.setAttribute('aria-valuemax', String(v.pityThreshold));
    stripPity.bar.setAttribute('aria-valuenow', String(v.pityCount));
    set(stripPityLine, v.pity);
    const key = JSON.stringify(v.odds);
    if (stripChances.dataset['k'] !== key) {
      stripChances.dataset['k'] = key;
      stripChances.replaceChildren(
        ...v.odds.map((o) => {
          const li = h('li', 'sm-chances__item');
          li.dataset['rarity'] = o.rarity;
          li.append(h('i', 'sm-odds__swatch'), h('span', '', o.name), h('b', 'bi-num', o.chance));
          return li;
        }),
      );
    }
  }

  // ---- the gates: three doors, and the other gates in "More" ----
  /** A gate: its short row (closed) and its deck (open). */
  function gate(id: string, name: string, deck: HTMLElement): HTMLElement {
    const root = h('div', 'sm-gate');
    root.dataset['gate'] = id;
    const row = h('button', 'sm-gate__row px-panel');
    row.type = 'button';
    const rowLine = h('span', 'sm-gate__line');
    const rowPity = h('span', 'sm-gate__pity bi-num');
    const chevron = h('span', 'sm-gate__chevron', '▸');
    chevron.setAttribute('aria-hidden', 'true');
    const text = h('span', 'sm-gate__text');
    text.append(h('span', 'sm-gate__name px-display', name), rowLine);
    row.append(text, rowPity, chevron);
    row.addEventListener('click', () => {
      openGate = id;
      render();
      deck
        .querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus({ preventScroll: true });
    });
    root.append(row, deck);
    gates.set(id, { root, row, rowLine, rowPity, deck });
    return root;
  }

  // the Wardrobe Gate opens with the Wardrobe (DESIGN.md §7); until then it shows as locked
  const gateOpen = content.portals.some((p) => p.kind === 'cosmetics');
  const byKind = (kind: string) => content.portals.filter((p) => p.kind === kind);
  const doorNames: Record<string, string> = {
    card_portal: content.portals.find((p) => p.id === 'card_portal')?.name ?? 'Card Portal',
    [FOCUS_PORTAL_ID]: 'Focus Portal',
    [heirloomId]: content.heirlooms.gate.name,
  };
  for (const key of DOOR_ORDER) {
    doorsRow.append(buildDoor(key, doorNames[key] ?? key, key === heirloomId));
  }
  const order: [string, string, HTMLElement][] = [];
  for (const p of byKind('cards')) {
    // the Card Portal and the Focus Portal are doors; any other card portal keeps a gate row
    if (p.id !== 'card_portal') order.push([p.id, p.name, portalDeck(p.id)]);
  }
  for (const p of byKind('cosmetics')) order.push([p.id, p.name, portalDeck(p.id)]);
  if (!gateOpen) order.push(['wardrobe_locked', COPY.summon.gate, lockedDeck()]);
  for (const p of byKind('skins')) order.push([p.id, p.name, portalDeck(p.id)]);
  for (const [id, name, deck] of order) colDecks.append(gate(id, name, deck));

  // the open gate's content, then the last hand
  const gateBody = h('div', 'sm-gatebody');
  gateBody.append(wish, odds);
  colMain.append(gateBody, board);

  // ---- the daily scrolls ----
  const daily = h('section', 'sm-daily px-panel');
  const dailyGives = h('p', 'sm-daily__gives bi-num');
  const dailyBtn = h('button', 'px-btn');
  dailyBtn.type = 'button';
  daily.append(h('h2', 'sm-daily__title px-display', COPY.summon.dailyTitle), dailyGives, dailyBtn);
  const dailyAmounts = (): [string, string] => [
    fmt(content.scrolls.daily.summon),
    fmt(content.scrolls.daily.glamour),
  ];
  dailyBtn.addEventListener('click', () => {
    const result = claimDaily(ctx.state(), content, localDay(new Date()));
    if (result.ok) ctx.apply(result.state);
    render();
  });
  colDecks.prepend(daily);
  colMain.append(handBox);
  table.append(doorsRow, strip, more);
  renderHand();

  // the doors are shown at a whole pixel scale: 2x on a roomy page, 1x when it is narrow
  const sizeDoors = (): void => {
    const room = table.clientWidth;
    const want = room === 0 || room >= 1000 ? 320 : 160;
    doorsRow.style.setProperty('--sm-door', `${doorPx(want, screenDpr())}px`);
  };
  sizeDoors();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sizeDoors).observe(table);

  /** Sets a pull button's price (the scroll's sprite and the amount) and whether it can be paid. */
  function setPull(
    b: PullButton,
    v: { amount: string; price: string; affordable: boolean },
    resourceId: string,
    name: string,
    n: number,
  ): void {
    const resource = content.resourceById.get(resourceId);
    const icon = (resource ? resourceIconMarkup(resource) : null) ?? '';
    const html = `${icon ? `<span class="sm-pull__icon">${icon}</span>` : ''}${v.amount}`;
    if (b.cost.dataset['k'] !== html) {
      b.cost.dataset['k'] = html;
      b.cost.innerHTML = html;
    }
    b.el.disabled = !v.affordable || busy;
    b.el.classList.toggle('is-affordable', v.affordable);
    b.el.setAttribute('aria-label', COPY.summon.pullLabel(name, n, v.price));
  }

  function render(): void {
    const s: GameState = ctx.state();
    const mods = collectModifiers(s, content);
    const ids = [...[...doors.keys()].filter((id) => id !== heirloomId), ...decks.keys()];
    for (const id of ids) {
      const info = portalInfo(s, content, id, mods);
      if (!info) continue;
      const v = portalView(info, content);
      views.set(id, v);
      const door = doors.get(id);
      if (door) {
        set(
          door.about,
          doorAbout(
            doorKeyOf(id),
            focusKinds(content).find((k) => k.kind === s.summon.focusKind)?.name ?? null,
          ),
        );
        setPull(door.single, v.single, v.resourceId, v.name, 1);
        setPull(door.ten, v.ten, v.resourceId, v.name, 10);
        if (id === 'card_portal') renderStrip(v);
        continue;
      }
      const ui = decks.get(id);
      if (!ui) continue;
      ui.stack.style.setProperty('--layers', String(v.deckLayers));
      ui.stack.setAttribute(
        'aria-label',
        COPY.summon.deckLabel(v.name, v.pityCount, v.pityThreshold, v.pityRarityName),
      );
      set(ui.line, v.line);
      set(ui.pityValue, v.pityText);
      ui.pityFill.style.width = `${Math.round(v.pityProgress * 100)}%`;
      ui.pityBar.setAttribute('aria-valuemax', String(v.pityThreshold));
      ui.pityBar.setAttribute('aria-valuenow', String(v.pityCount));
      setPull(ui.single, v.single, v.resourceId, v.name, 1);
      setPull(ui.ten, v.ten, v.resourceId, v.name, 10);
    }
    renderFocus(s);
    renderDaily(s);
    renderHeirloom(s);
    renderGates();
    renderWishlist();
    renderOdds();
    renderTiers();
  }

  function renderHeirloom(s: GameState): void {
    const ui = doors.get(heirloomId);
    if (!ui?.pity) return;
    const v = heirloomDeckView(heirloomGateInfo(s, content), content);
    set(ui.about, `${doorAbout('heirloom_gate', null)} · ${v.line}`);
    set(ui.pity.value, v.pityText);
    ui.pity.fill.style.width = `${Math.round(v.pityProgress * 100)}%`;
    ui.pity.bar.setAttribute('aria-valuemax', String(v.pityThreshold));
    ui.pity.bar.setAttribute('aria-valuenow', String(v.pityCount));
    setPull(ui.single, v.single, v.resourceId, v.name, 1);
    setPull(ui.ten, v.ten, v.resourceId, v.name, 10);
    if (openGate === heirloomId) renderBoard(s);
  }

  /** Marks the selected door, opens the chosen other gate and closes the rest; shows the selected gate's content. */
  function renderGates(): void {
    if (!gates.has(openGate) && !doors.has(openGate)) openGate = 'card_portal';
    for (const [id, d] of doors) {
      const on = id === openGate;
      d.root.classList.toggle('is-on', on);
      d.pic.setAttribute('aria-pressed', String(on));
      d.pic.setAttribute(
        'aria-label',
        COPY.summon.doorSelect(d.root.querySelector('h2')?.textContent ?? id),
      );
    }
    for (const [id, g] of gates) {
      const open = id === openGate;
      g.root.classList.toggle('is-open', open);
      g.row.hidden = open;
      g.deck.hidden = !open;
      g.row.setAttribute('aria-expanded', String(open));
      const view = views.get(id);
      if (view) {
        set(g.rowLine, view.line);
        set(g.rowPity, view.pityText);
      } else if (id === 'wardrobe_locked') set(g.rowLine, COPY.summon.gateLocked);
      g.row.setAttribute(
        'aria-label',
        COPY.summon.gateRowLabel(
          g.row.querySelector('.sm-gate__name')?.textContent ?? id,
          g.rowLine.textContent ?? '',
          open,
        ),
      );
    }
    const kind = openGate === heirloomId ? 'heirloom' : (views.get(openGate)?.kind ?? 'none');
    table.dataset['gate'] = kind;
    board.hidden = kind !== 'heirloom';
    gateBody.hidden = kind === 'heirloom' || kind === 'none';
    wish.style.display = kind === 'cards' ? '' : 'none';
  }

  function renderFocus(s: GameState): void {
    const focus = doors.get(FOCUS_PORTAL_ID)?.focus;
    if (!focus) return;
    const chosen = s.summon.focusKind;
    for (const b of focus.box.querySelectorAll<HTMLButtonElement>('button')) {
      const on = b.dataset['focus'] === chosen;
      b.classList.toggle('is-chosen', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', COPY.summon.focusKind(b.textContent ?? '', on));
      b.disabled = busy;
    }
  }

  function renderDaily(s: GameState): void {
    const [summon, glamour] = dailyAmounts();
    const ready = dailyAvailable(s, localDay(new Date()));
    set(dailyGives, COPY.summon.dailyGives(summon, glamour));
    set(dailyBtn, ready ? COPY.summon.dailyClaim : COPY.summon.dailyClaimed);
    dailyBtn.disabled = !ready || busy;
    dailyBtn.setAttribute(
      'aria-label',
      ready ? COPY.summon.dailyLabel(summon, glamour) : COPY.summon.dailyClaimed,
    );
  }

  return { render };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
