import { navPlaque, PLAQUE_VIEWBOX, svg } from '../art/gems';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import type { PileHint, TableContext, TablePieceDef, ViewDef, ViewId } from './contract';
import { dealIn } from './motion';
import { DOCK } from './registry';
import { createViewHost, type ViewHost } from './viewHost';
import './table.css';

/**
 * The table (UI_RULES.md §2, "The table"; mockup 4a): the one screen of the game. The dungeon
 * window in the centre, the Logging wing on the left and the Mining wing on the right, the dock of
 * piles along the bottom, and the view host over all of it. A click on a piece or a pile opens its
 * full view (`viewHost.ts`).
 */

export interface Table {
  el: HTMLElement;
  host: ViewHost;
  /** Builds the pieces and piles and mounts every view. Call once. */
  build(views: readonly ViewDef[], pieces: readonly TablePieceDef[], ctx: TableContext): void;
  /** The app tick: the open view, or the pieces while the table shows; hints once a second. */
  render(now: number): void;
  /** Opens a view; `from` is what the player clicked (the deal starts there). */
  open(id: ViewId, from?: HTMLElement | null): void;
  /** The launch entrance: window, wings, then the piles (motion E). */
  enter(): void;
  /** The element that opens `id` on the table (pile, wing or window), for deals and focus. */
  opener(id: ViewId): HTMLElement | null;
}

/** Elements inside a piece that keep their own click (they never open the view). */
const OWN_CLICK =
  'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])';

export function createTable(): Table {
  const el = h('div', 'tbl');
  const slots = {
    left: h('section', 'tbl-piece tbl-wing tbl-wing--left'),
    centre: h('section', 'tbl-piece tbl-window'),
    right: h('section', 'tbl-piece tbl-wing tbl-wing--right'),
  };
  const dock = h('nav', 'tbl-dock');
  dock.setAttribute('aria-label', COPY.table.dock);
  const dockList = h('ul', 'tbl-dock__list');
  dock.append(dockList);
  const host = createViewHost();
  el.append(slots.left, slots.centre, slots.right, dock, host.el);

  const openers = new Map<ViewId, HTMLElement>();
  const rendered: Array<{ render(): void }> = [];
  const hints: Array<{ def: ViewDef; el: HTMLElement; pile: HTMLElement }> = [];
  let ctxRef: TableContext | null = null;
  let hintsAt = -Infinity;

  function open(id: ViewId, from: HTMLElement | null = null): void {
    host.open(id, from ?? openers.get(id) ?? null);
  }

  function buildPiece(def: TablePieceDef, ctx: TableContext): void {
    const slot = slots[def.slot];
    slot.dataset.view = def.view;
    // focus comes back here when its view closes (UI_RULES.md §2, View keys and focus)
    slot.tabIndex = -1;
    slot.setAttribute('aria-label', def.label);
    const body = h('div', 'tbl-piece__body');
    const openBtn = h('button', 'px-btn tbl-open');
    openBtn.type = 'button';
    openBtn.dataset.open = def.view;
    openBtn.setAttribute('aria-label', def.label);
    openBtn.title = def.label;
    // a pixel 'fan out' glyph: two corner brackets
    openBtn.innerHTML =
      '<svg viewBox="0 0 7 7" aria-hidden="true"><path d="M0 0h3v1H1v2H0zM7 7H4V6h2V4h1z"/></svg>';
    openBtn.addEventListener('click', () => open(def.view, slot));
    slot.append(body, openBtn);
    // a click anywhere on the piece that is not one of its own controls opens its view
    slot.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      if (!t || t.closest(OWN_CLICK)) return;
      if (window.getSelection()?.toString()) return;
      open(def.view, slot);
    });
    openers.set(def.view, slot);
    rendered.push(def.mount(body, ctx));
  }

  function buildPile(def: ViewDef): void {
    const li = h('li', 'tbl-dock__item');
    const btn = h('button', 'tbl-pile');
    btn.type = 'button';
    btn.dataset.view = def.id;
    btn.dataset.open = def.id;
    const stack = h('span', 'tbl-pile__stack');
    stack.setAttribute('aria-hidden', 'true');
    const card = h('span', 'tbl-pile__card');
    if (def.pile) card.innerHTML = svg(navPlaque(def.pile.glyph), PLAQUE_VIEWBOX);
    stack.append(card);
    const name = h('b', 'tbl-pile__name px-display', def.title);
    const hint = h('span', 'tbl-pile__hint');
    btn.append(stack, name, hint);
    btn.addEventListener('click', () => open(def.id, btn));
    li.append(btn);
    dockList.append(li);
    openers.set(def.id, btn);
    hints.push({ def, el: hint, pile: btn });
  }

  function setHint(entry: (typeof hints)[number], value: PileHint | null): void {
    const text = value?.text ?? '';
    if (entry.el.textContent !== text) entry.el.textContent = text;
    entry.el.classList.toggle('is-ready', Boolean(value?.ready));
    const label = text ? `${entry.def.title}: ${text}` : entry.def.title;
    if (entry.pile.getAttribute('aria-label') !== label)
      entry.pile.setAttribute('aria-label', label);
  }

  return {
    el,
    host,
    build(views, pieces, ctx) {
      ctxRef = ctx;
      for (const p of pieces) buildPiece(p, ctx);
      const byId = new Map(views.map((v) => [v.id, v]));
      for (const id of DOCK) {
        const def = byId.get(id);
        if (def?.pile) buildPile(def);
      }
      host.mount(views, ctx);
      // the table under an open view is inert: Tab stays in the view
      host.onChange((id) => {
        for (const node of [slots.left, slots.centre, slots.right, dock]) node.inert = id !== null;
        el.dataset.view = id ?? '';
      });
    },
    render(now) {
      if (host.current()) host.render();
      else for (const r of rendered) r.render();
      if (now - hintsAt >= 1000 && ctxRef) {
        hintsAt = now;
        for (const entry of hints) setHint(entry, entry.def.pile?.hint?.(ctxRef) ?? null);
      }
    },
    open,
    enter() {
      dealIn([slots.centre], { offset: { x: 0, y: 24 } });
      dealIn([slots.left], { offset: { x: -40, y: 0 }, delay: 90 });
      dealIn([slots.right], { offset: { x: 40, y: 0 }, delay: 90 });
      const r = dock.getBoundingClientRect();
      const from = new DOMRect(r.left, r.top, 1, r.height);
      dealIn(Array.from(dockList.querySelectorAll<HTMLElement>('.tbl-pile')), {
        from,
        delay: 180,
      });
    },
    opener: (id) => openers.get(id) ?? null,
  };
}
