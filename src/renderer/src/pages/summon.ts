import {
  collectModifiers,
  defaultRng,
  portalInfo,
  pull,
  type GameState,
  type PullCount,
} from '../../../game';
import { navPlaque, PLAQUE_VIEWBOX, svg } from '../art/gems';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { hide as hideTip } from '../shell/tooltip';
import { showReveal } from '../stage/reveal';
import { cosmeticSwatch } from '../ui/cosmeticSwatch';
import { createCard, type CardProps } from '../ui/card';
import { fitCard, screenDpr } from '../ui/pixelFit';
import { iconMarkup, resourceIconId } from '../ui/resourceIcons';
import { cardFaceProps } from './loadoutCards';
import type { PageContext } from './production';
import {
  handSummary,
  lastHandView,
  oddsTable,
  portalView,
  revealViews,
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
  single: PullButton;
  ten: PullButton;
};

export function createSummonPage(page: HTMLElement, ctx: SummonContext): { render(): void } {
  const { content } = ctx;
  // the panel carries the sighted headings; the page name stays for screen readers
  page.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
  const table = h('div', 'sm-table px-panel');
  // the deck backs and the hand's cards are 1x: 132 CSS px on a 100 % screen, whole device pixels
  fitCard(table, { want: 132 });
  page.append(table);
  const top = h('div', 'sm-top');

  const decks = new Map<string, DeckUi>();
  const views = new Map<string, PortalView>();
  let busy = false;
  let hand: HandEntry[] = [];
  let handViews: RevealView[] = [];
  let oddsKey = '';

  // ---- odds table (every portal side by side) ----
  const odds = h('section', 'sm-odds px-well');
  odds.setAttribute('aria-label', COPY.summon.oddsTitle);
  const oddsBody = h('table', 'sm-odds__table');
  oddsBody.setAttribute('aria-label', COPY.summon.oddsTableLabel);
  const oddsNote = h('p', 'sm-odds__note');
  odds.append(h('h2', 'sm-odds__title px-display', COPY.summon.oddsTitle), oddsBody, oddsNote);

  function renderOdds(): void {
    const list = [...decks.keys()].map((id) => views.get(id)).filter((v): v is PortalView => !!v);
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
    oddsNote.replaceChildren(...notes.map((n) => h('span', '', n)));
  }

  // ---- the last hand ----
  const handBox = h('section', 'sm-hand');
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

  function doPull(portalId: string, count: PullCount): void {
    if (busy) return;
    const result = pull(ctx.state(), content, portalId, count, defaultRng);
    if (!result.ok) return;
    busy = true;
    hideTip();
    ctx.apply(result.state);
    const portal = content.portals.find((p) => p.id === portalId)!;
    const after = result.state;
    const reveal = revealViews(result.results, content);
    handViews = reveal;
    hand = lastHandView(reveal, content).map((view) => ({
      view,
      face: content.cardById.has(view.itemId) ? cardFaceProps(content, after, view.itemId) : null,
      picture: content.cosmeticById.has(view.itemId)
        ? cosmeticSwatch(content, view.itemId, after.cosmetics.owned[view.itemId]?.level ?? 1)
        : null,
    }));
    renderHand();
    showReveal({
      portalName: portal.name,
      kind: portal.kind,
      views: reveal,
      face: (id) => (content.cardById.has(id) ? cardFaceProps(content, after, id) : null),
      picture: (id) =>
        content.cosmeticById.has(id)
          ? cosmeticSwatch(content, id, after.cosmetics.owned[id]?.level ?? 1)
          : null,
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
    const root = h('article', 'sm-deck');
    root.dataset['kind'] = kind;
    if (locked) root.classList.add('is-locked');
    return root;
  }

  function crestIcon(kind: string): HTMLElement {
    const icon = h('span', 'sm-plate__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = svg(navPlaque(kind === 'cosmetics' ? 'wardrobe' : 'summon'), PLAQUE_VIEWBOX);
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
    const portal = content.portals.find((p) => p.id === portalId)!;
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
    decks.set(portalId, { root, stack, pityValue, pityBar, pityFill, line, single, ten });
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
  const slots = [
    ...content.portals.map((p) => portalDeck(p.id)),
    ...(gateOpen ? [] : [lockedDeck()]),
  ];
  const [left, ...rest] = slots;
  if (left) left.classList.add('sm-deck--left');
  for (const r of rest) r.classList.add('sm-deck--right');
  top.append(...(left ? [left] : []), odds, ...rest);
  table.append(top, handBox);
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
    renderOdds();
  }

  return { render };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
