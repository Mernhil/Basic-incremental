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
import { cardFaceProps } from './loadoutCards';
import type { PageContext } from './production';
import {
  lastHandView,
  portalView,
  revealViews,
  type HandCardView,
  type PortalView,
} from './summonModel';
import './summon.css';

/**
 * Summon page (DESIGN.md §7 Beta portals): "Deck and Table". Each portal is a deck whose edge
 * thickens toward its hard pity, a crest shows the pity count, and Draw ×1 / Deal ×10 pull.
 * The odds panel in the middle follows the deck you hover or focus; the last hand waits below.
 * The reveal still opens in a modal. The last hand lives in UI memory only (no save change).
 */

export interface SummonContext extends PageContext {
  sound?: (id: string) => void;
}

export function createSummonPage(page: HTMLElement, ctx: SummonContext): { render(): void } {
  const { content } = ctx;
  const table = h('div', 'sm-table');
  page.append(table);

  type DeckUi = {
    root: HTMLElement;
    stack: HTMLElement;
    count: HTMLElement;
    of: HTMLElement;
    caption: HTMLElement;
    single: HTMLButtonElement;
    ten: HTMLButtonElement;
  };
  const decks = new Map<string, DeckUi>();
  const views = new Map<string, PortalView>();
  let busy = false;
  let oddsPortal: string | null = null;
  let hand: HandCardView[] = [];

  const odds = h('section', 'sm-odds');
  odds.setAttribute('aria-live', 'polite');
  const oddsName = h('p', 'sm-odds__for');
  const oddsList = h('ul', 'sm-odds__list');
  const oddsNote = h('p', 'sm-odds__note');
  odds.append(h('h2', 'sm-odds__title', COPY.summon.oddsTitle), oddsName, oddsList, oddsNote);

  const handBox = h('section', 'sm-hand');
  const handList = h('ul', 'sm-hand__list');
  handBox.setAttribute('aria-label', COPY.summon.handTitle);
  const handTitle = h('h2', 'sm-hand__title', COPY.summon.handTitle);
  const handEmpty = h('p', 'sm-hand__empty', COPY.summon.handEmpty);
  handBox.append(handTitle, handEmpty, handList);

  function renderHand(): void {
    handList.replaceChildren();
    handEmpty.hidden = hand.length > 0;
    handList.hidden = hand.length === 0;
    handBox.setAttribute(
      'aria-label',
      hand.length ? COPY.summon.handLabel(hand.length) : COPY.summon.handTitle,
    );
    for (const c of hand) {
      const li = h('li', 'sm-hand__card');
      li.dataset.rarity = c.rarity;
      li.style.setProperty('--tilt', `${c.tilt}deg`);
      li.setAttribute('aria-label', c.label);
      li.append(h('span', 'sm-hand__rarity', c.rarityName), h('strong', 'sm-hand__name', c.name));
      if (c.isNew) li.append(h('span', 'sm-hand__new', COPY.summon.isNew));
      handList.append(li);
    }
  }

  function renderOdds(): void {
    const v = oddsPortal ? views.get(oddsPortal) : undefined;
    if (!v) return;
    oddsName.textContent = COPY.summon.oddsFor(v.name);
    oddsList.replaceChildren();
    for (const r of v.odds) {
      const li = h('li', 'sm-odds__row');
      li.dataset.rarity = r.rarity;
      li.append(h('span', '', r.name), h('b', 'bi-num', r.chance));
      oddsList.append(li);
    }
    oddsNote.textContent = v.guarantee;
    for (const [id, d] of decks) d.root.classList.toggle('is-odds', id === oddsPortal);
  }

  function showOdds(id: string): void {
    if (oddsPortal === id) return;
    oddsPortal = id;
    renderOdds();
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
    hand = lastHandView(reveal);
    renderHand();
    showReveal({
      portalName: portal.name,
      views: reveal,
      face: (id) => (content.cardById.has(id) ? cardFaceProps(content, after, id) : null),
      picture: (id) =>
        content.cosmeticById.has(id)
          ? cosmeticSwatch(content, id, after.cosmetics.owned[id]?.level ?? 1)
          : null,
      ...(ctx.sound ? { sound: ctx.sound } : {}),
      onClose: () => {
        busy = false;
        decks.get(portalId)?.single.focus();
      },
    });
  }

  function deckShell(kind: 'cards' | 'cosmetics', locked: boolean): HTMLElement {
    const root = h('article', 'sm-deck');
    root.dataset.kind = kind;
    if (locked) root.classList.add('is-locked');
    return root;
  }

  function crestIcon(kind: 'cards' | 'cosmetics'): HTMLElement {
    const icon = h('span', 'sm-crest__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = svg(navPlaque(kind === 'cosmetics' ? 'wardrobe' : 'summon'), PLAQUE_VIEWBOX);
    return icon;
  }

  function buildStack(kind: 'cards' | 'cosmetics'): {
    stack: HTMLElement;
    count: HTMLElement;
    of: HTMLElement;
  } {
    const stack = h('div', 'sm-stack');
    const back = h('div', 'sm-stack__back');
    const edge = h('div', 'sm-stack__edge');
    const crest = h('div', 'sm-crest');
    const count = h('strong', 'sm-crest__count bi-num');
    const of = h('small', 'sm-crest__of bi-num');
    crest.append(crestIcon(kind), count, of);
    back.append(crest);
    stack.append(back, edge);
    stack.setAttribute('role', 'img');
    return { stack, count, of };
  }

  function portalDeck(portalId: string): HTMLElement {
    const portal = content.portals.find((p) => p.id === portalId)!;
    const kind = portal.kind === 'cosmetics' ? 'cosmetics' : 'cards';
    const root = deckShell(kind, false);
    root.dataset.portal = portalId;
    const { stack, count, of } = buildStack(kind);
    const caption = h('p', 'sm-deck__pity');
    const buttons = h('div', 'sm-deck__buttons');
    const button = (n: PullCount): HTMLButtonElement => {
      const b = h('button', n === 1 ? 'sm-pull' : 'sm-pull sm-pull--ten');
      b.type = 'button';
      b.addEventListener('click', () => doPull(portalId, n));
      buttons.append(b);
      return b;
    };
    const single = button(1);
    const ten = button(10);
    root.append(h('h2', 'sm-deck__name', portal.name), stack, caption, buttons);
    root.addEventListener('pointerenter', () => showOdds(portalId));
    root.addEventListener('focusin', () => showOdds(portalId));
    decks.set(portalId, { root, stack, count, of, caption, single, ten });
    return root;
  }

  function lockedDeck(): HTMLElement {
    const root = deckShell('cosmetics', true);
    const { stack, count, of } = buildStack('cosmetics');
    count.textContent = '?';
    of.hidden = true;
    stack.setAttribute('aria-label', `${COPY.summon.gate}: ${COPY.summon.gateLocked}`);
    stack.style.setProperty('--layers', '1');
    root.append(
      h('h2', 'sm-deck__name', COPY.summon.gate),
      stack,
      h('p', 'sm-deck__pity', COPY.summon.gateLocked),
      h('p', 'sm-deck__about', COPY.summon.gateAbout),
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
  const first = content.portals[0];
  if (first) oddsPortal = first.id;
  table.append(...(left ? [left] : []), odds, ...rest, handBox);
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
      set(ui.count, String(v.pityCount));
      set(ui.of, COPY.summon.crestOf(v.pityThreshold));
      set(ui.caption, v.pity);
      for (const [b, o, n, text] of [
        [ui.single, v.single, 1, COPY.summon.draw],
        [ui.ten, v.ten, 10, COPY.summon.deal],
      ] as const) {
        set(b, `${text} · ${o.price}`);
        b.disabled = !o.affordable || busy;
        b.classList.toggle('is-affordable', o.affordable);
        b.setAttribute('aria-label', COPY.summon.pullLabel(v.name, n, o.price));
      }
    }
    renderOdds();
  }

  return { render };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
