import {
  claimDaily,
  collectModifiers,
  dailyAvailable,
  defaultRng,
  FOCUS_PORTAL_ID,
  focusKinds,
  localDay,
  portalInfo,
  pull,
  resolvePortal,
  revealPlan,
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
import { showReveal } from '../stage/reveal';
import { cosmeticSwatch } from '../ui/cosmeticSwatch';
import { createCard, type CardProps } from '../ui/card';
import { fitCard, screenDpr } from '../ui/pixelFit';
import { iconMarkup, resourceIconId } from '../ui/resourceIcons';
import { ITEM_VIEWBOX } from '../art/items';
import { cardFaceProps, weaponArtMarkup } from './loadoutCards';
import type { PageContext } from './production';
import {
  handSummary,
  lastHandView,
  oddsTable,
  portalView,
  revealViews,
  wishlistPanelView,
  type HandCardView,
  type PortalView,
  type RevealView,
} from './summonModel';
import './summon.css';

/**
 * Summon page (DESIGN.md §7 Beta portals): "Deck and Table" as one pixel panel. Each portal is a
 * deck of card backs at 1x whose edge thickens toward its hard pity, with its pity bar and its
 * Pull 1 / Pull 10 buttons. The odds table in the middle lists every portal side by side; the
 * last hand waits below as real cards. The reveal still opens in a modal. The last hand lives in
 * UI memory only (no save change).
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
  /** "Hunting: ..." under the deck (card portal with a wishlist only). */
  hunt: HTMLElement | null;
  /** The Focus Portal's item type buttons and the line saying what it pulls. */
  focus: { box: HTMLElement; line: HTMLElement } | null;
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
  // the three columns, each dealt in as one section of the view (motion E), the hand across the bottom
  const colDecks = h('div', 'sm-col sm-col--decks');
  const colWish = h('div', 'sm-col sm-col--wish');
  const colOdds = h('div', 'sm-col sm-col--odds');
  for (const col of [colDecks, colWish, colOdds]) col.dataset['deal'] = '';

  const decks = new Map<string, DeckUi>();
  const views = new Map<string, PortalView>();
  let busy = false;
  let hand: HandEntry[] = [];
  let handViews: RevealView[] = [];
  let oddsKey = '';
  let wishKey = '';
  let wishActive = false;

  // ---- odds table (every portal side by side) ----
  const odds = h('section', 'sm-odds px-panel');
  odds.setAttribute('aria-label', COPY.summon.oddsTitle);
  const oddsBody = h('table', 'sm-odds__table');
  oddsBody.setAttribute('aria-label', COPY.summon.oddsTableLabel);
  const oddsNote = h('p', 'sm-odds__note');
  odds.append(h('h2', 'sm-odds__title px-display', COPY.summon.oddsTitle), oddsBody, oddsNote);

  function renderOdds(): void {
    // the Focus Portal has the Card Portal's rates: it gets a note, not a column
    const list = [...decks.keys()]
      .filter((id) => id !== FOCUS_PORTAL_ID)
      .map((id) => views.get(id))
      .filter((v): v is PortalView => !!v);
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
    if (decks.has(FOCUS_PORTAL_ID)) notes.push(COPY.summon.oddsFocus);
    if (wishActive) notes.push(COPY.summon.oddsWishlist);
    oddsNote.replaceChildren(...notes.map((n) => h('span', '', n)));
  }

  // ---- the wishlist (the Card Portal's cards, marked to hunt) ----
  const wish = h('section', 'sm-wish px-panel');
  wish.setAttribute('aria-label', COPY.summon.wishlistTitle);
  wish.hidden = true;
  const wishPortal = content.portals.find((p) => p.kind === 'cards' && p.wishlistPerRarity > 0);

  function renderWishlist(): void {
    if (!wishPortal) return;
    const s = ctx.state();
    const info = wishlistView(s, content, wishPortal.id);
    if (!info) return;
    const v = wishlistPanelView(info, s, content);
    wishActive = v.active;
    const hunt = decks.get(wishPortal.id)?.hunt;
    if (hunt) set(hunt, v.hunting);
    const key = JSON.stringify(v);
    if (key === wishKey) return;
    wishKey = key;
    wish.hidden = false;
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
      for (const c of r.cards) {
        const b = h(
          'button',
          `sm-wish__card px-btn px-btn--quiet${c.marked ? ' is-marked' : ''}`,
          c.name,
        );
        b.type = 'button';
        b.dataset['wish'] = c.id;
        b.setAttribute('aria-pressed', String(c.marked));
        b.setAttribute('aria-label', c.label);
        b.classList.toggle('is-blocked', c.blocked);
        b.addEventListener('click', () => {
          const result = setWishlisted(ctx.state(), content, c.id, !c.marked, wishPortal.id);
          if (result.ok) ctx.apply(result.state);
          render();
        });
        list.append(b);
      }
      row.append(head, list);
      return row;
    });
    wish.replaceChildren(
      h('h2', 'sm-wish__title px-display', COPY.summon.wishlistTitle),
      h('p', 'sm-wish__about', v.about),
      ...rows,
    );
    if (focused) wish.querySelector<HTMLElement>(`[data-wish="${focused}"]`)?.focus();
  }

  // ---- the last hand ----
  const handBox = h('section', 'sm-hand px-panel');
  handBox.dataset['deal'] = '';
  const handHead = h('header', 'sm-hand__head');
  const handSum = h('p', 'sm-hand__summary bi-num');
  handHead.append(h('h2', 'sm-hand__title px-display', COPY.summon.handTitle), handSum);
  const handList = h('ul', 'sm-hand__list');
  const handEmpty = h('p', 'sm-hand__empty', COPY.summon.handEmpty);
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
    const gap = Math.min(16, Math.max(-cardW * 0.62, free / (n - 1)));
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
      kind: portal.kind,
      views: reveal,
      plan: revealPlan(
        reveal.map((v) => v.rarity),
        content.scrolls.reveal,
      ),
      face: (id) => (content.cardById.has(id) ? cardFaceProps(content, after, id) : null),
      picture: (id) =>
        content.cosmeticById.has(id)
          ? cosmeticSwatch(content, id, after.cosmetics.owned[id]?.level ?? 1)
          : skinPicture(id),
      ...(ctx.sound ? { sound: ctx.sound } : {}),
      onClose: () => {
        busy = false;
        // the buttons are enabled again before the focus goes back to the one that was used
        render();
        decks.get(portalId)?.single.el.focus();
      },
    });
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
    const buttons = h('div', 'sm-deck__buttons');
    const single = pullButton(COPY.summon.pullOne, false, () => doPull(portalId, 1));
    const ten = pullButton(COPY.summon.pullTen, true, () => doPull(portalId, 10));
    buttons.append(single.el, ten.el);
    root.append(h('h2', 'sm-deck__name px-display', portal.name), line, stack, pity, buttons);
    const hunt =
      portalId !== FOCUS_PORTAL_ID && portal.kind === 'cards' && portal.wishlistPerRarity > 0
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

  // the Wardrobe Gate opens with the Wardrobe (DESIGN.md §7); until then it shows as locked
  const gateOpen = content.portals.some((p) => p.kind === 'cosmetics');
  // the Focus Portal stands beside the Card Portal (DESIGN.md §7)
  const hasFocus = content.portals.some((p) => p.id === 'card_portal');
  const slots = [
    ...content.portals.map((p) => portalDeck(p.id)),
    ...(gateOpen ? [] : [lockedDeck()]),
  ];
  const focusDeck = hasFocus ? portalDeck(FOCUS_PORTAL_ID) : null;
  const [left, ...rest] = slots;
  if (left) left.classList.add('sm-deck--left');
  focusDeck?.classList.add('sm-deck--focus');
  for (const r of rest) r.classList.add('sm-deck--right');
  colDecks.append(...(left ? [left] : []), ...(focusDeck ? [focusDeck] : []), ...rest);
  colWish.append(wish);
  colOdds.append(odds);

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
  table.append(colDecks, colWish, colOdds, handBox);
  renderHand();

  function render(): void {
    const s: GameState = ctx.state();
    const mods = collectModifiers(s, content);
    for (const [id, ui] of decks) {
      const info = portalInfo(s, content, id, mods);
      if (!info) continue;
      const v = portalView(info, content);
      views.set(id, v);
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
      const resource = content.resourceById.get(v.resourceId);
      const icon = (resource ? iconMarkup(resourceIconId(resource)) : null) ?? '';
      for (const [b, o, n] of [
        [ui.single, v.single, 1],
        [ui.ten, v.ten, 10],
      ] as const) {
        const html = `${icon ? `<span class="sm-pull__icon">${icon}</span>` : ''}${o.amount}`;
        if (b.cost.dataset['k'] !== html) {
          b.cost.dataset['k'] = html;
          b.cost.innerHTML = html;
        }
        b.el.disabled = !o.affordable || busy;
        b.el.classList.toggle('is-affordable', o.affordable);
        b.el.setAttribute('aria-label', COPY.summon.pullLabel(v.name, n, o.price));
      }
    }
    renderFocus(s);
    renderDaily(s);
    renderWishlist();
    renderOdds();
  }

  function renderFocus(s: GameState): void {
    const focus = decks.get(FOCUS_PORTAL_ID)?.focus;
    if (!focus) return;
    const chosen = s.summon.focusKind;
    const kinds = focusKinds(content);
    set(
      focus.line,
      chosen
        ? COPY.summon.focusHunting(kinds.find((k) => k.kind === chosen)?.name ?? chosen)
        : COPY.summon.focusNone,
    );
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
