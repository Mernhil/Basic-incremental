import { COPY } from '../copy';
import { h } from '../shell/shell';
import type { TableContext, ViewApi, ViewDef, ViewHandle, ViewId } from './contract';
import { dealIn, dealOut, fadeIn, stopMotion } from './motion';
import './viewHost.css';

/**
 * The view host (UI_RULES.md §2, "A full view", "Opening and closing a view"): every full view is
 * mounted once into its own frame over the table, under the header. Opening one deals it in from
 * its opener (motion E); closing sends it back there. One view is open at a time. ← Table, Esc,
 * the mouse's back button and Alt + ← close it; focus goes to the view's title on open and back to
 * the opener on close.
 */

export interface ViewHost {
  el: HTMLElement;
  /** Mounts every view (once, at start). */
  mount(defs: readonly ViewDef[], ctx: TableContext): void;
  open(id: ViewId, from?: HTMLElement | null): void;
  close(): void;
  current(): ViewId | null;
  /** Renders the open view (the app tick). */
  render(): void;
  /** Fires after a view opens or the table shows again. */
  onChange(fn: (id: ViewId | null) => void): void;
}

interface Mounted {
  def: ViewDef;
  frame: HTMLElement;
  bar: HTMLElement;
  title: HTMLElement;
  tools: HTMLElement;
  body: HTMLElement;
  page: HTMLElement;
  handle: ViewHandle;
  toolsEl: HTMLElement | null;
}

/** A layer above the view that takes Esc first (dialogs, the reward track, a popped card). */
const ESC_FIRST = [
  '[aria-modal="true"]',
  '.shell-track:not([hidden])',
  '.shell-goals__list:not([hidden])',
  '.lf .is-lifted',
  '.wb',
  '.st-evo',
].join(', ');

export function createViewHost(): ViewHost {
  const el = h('div', 'vh-layer');
  el.hidden = true;
  const backdrop = h('div', 'vh-backdrop');
  el.append(backdrop);
  const views = new Map<ViewId, Mounted>();
  let open: Mounted | null = null;
  let opener: HTMLElement | null = null;
  let closing = 0;
  const listeners: Array<(id: ViewId | null) => void> = [];
  const changed = (): void => {
    for (const fn of listeners) fn(open?.def.id ?? null);
  };

  function mount(defs: readonly ViewDef[], ctx: TableContext): void {
    for (const def of defs) {
      const frame = h('section', 'vh-view');
      frame.dataset.view = def.id;
      frame.hidden = true;
      const bar = h('header', 'vh-bar');
      const back = h('button', 'px-btn vh-back', COPY.view.back);
      back.type = 'button';
      back.setAttribute('aria-label', COPY.view.backLabel);
      back.addEventListener('click', () => close());
      const title = h('h2', 'vh-title px-display', def.title);
      title.id = `vh-title-${def.id}`;
      title.tabIndex = -1;
      frame.setAttribute('aria-labelledby', title.id);
      const tools = h('div', 'vh-tools');
      bar.append(back, title, tools);
      const body = h('div', 'vh-body shell-main');
      const page = h('div', 'shell-page');
      page.dataset.page = def.id;
      page.append(h('h1', 'shell-page__title sr-only', def.title));
      body.append(page);
      frame.append(bar, body);
      el.append(frame);
      const m: Mounted = {
        def,
        frame,
        bar,
        title,
        tools,
        body,
        page,
        toolsEl: null,
        handle: { render: () => undefined },
      };
      const api: ViewApi = {
        setTools(node) {
          m.toolsEl = node;
          if (open === m) tools.replaceChildren(...(node ? [node] : []));
        },
        visible: () => open === m && !document.hidden,
      };
      views.set(def.id, m);
      m.handle = def.mount(page, ctx, api);
    }
  }

  /** The view's sections to deal: what it marked `data-deal`, else the page's top-level blocks. */
  function sections(m: Mounted): HTMLElement[] {
    const marked = Array.from(m.body.querySelectorAll<HTMLElement>('[data-deal]'));
    const list = marked.length > 0 ? marked : Array.from(m.page.children);
    return list.filter(
      (n): n is HTMLElement =>
        n instanceof HTMLElement &&
        !n.hidden &&
        !n.classList.contains('shell-page__title') &&
        n.offsetParent !== null,
    );
  }

  function hideNow(m: Mounted): void {
    stopMotion(m.frame);
    m.frame.hidden = true;
    m.tools.replaceChildren();
    m.handle.closed?.();
  }

  function openView(id: ViewId, from: HTMLElement | null = null): void {
    const m = views.get(id);
    if (!m) return;
    closing++;
    stopMotion(m.frame);
    stopMotion(backdrop);
    if (open === m) return;
    const wasTable = open === null;
    if (open) hideNow(open);
    else opener = from ?? (document.activeElement as HTMLElement | null);
    if (from) opener = from;
    open = m;
    el.hidden = false;
    m.frame.hidden = false;
    m.body.scrollTop = 0;
    m.tools.replaceChildren(...(m.toolsEl ? [m.toolsEl] : []));
    m.handle.opened?.(from);
    m.handle.render();
    if (wasTable) fadeIn(backdrop);
    const rect = from?.isConnected ? from.getBoundingClientRect() : null;
    dealIn([m.bar, ...sections(m)], { from: rect && rect.width > 0 ? rect : null });
    m.title.focus({ preventScroll: true });
    changed();
  }

  function close(): void {
    const m = open;
    if (!m) return;
    const token = ++closing;
    const back = opener;
    const rect = back?.isConnected ? back.getBoundingClientRect() : null;
    open = null;
    changed();
    void Promise.all([
      dealOut(m.frame, rect && rect.width > 0 ? rect : null),
      dealOut(backdrop, null),
    ]).then(() => {
      stopMotion(backdrop);
      if (token !== closing) {
        // another view opened meanwhile: this one only hides
        if (open !== m) hideNow(m);
        return;
      }
      hideNow(m);
      el.hidden = true;
      if (back?.isConnected) back.focus({ preventScroll: true });
      opener = null;
    });
  }

  // Esc closes the view once nothing above it wants the key; Alt + ← and the mouse back button too
  document.addEventListener('keydown', (e) => {
    if (!open || e.defaultPrevented) return;
    const back = e.key === 'Escape' || (e.altKey && e.key === 'ArrowLeft');
    if (!back) return;
    // only a layer that is on screen counts (the Details dialog stays in the page while closed)
    const above = Array.from(document.querySelectorAll(ESC_FIRST)).some(
      (n) => n.getClientRects().length > 0,
    );
    if (above) return;
    e.preventDefault();
    close();
  });
  window.addEventListener('mouseup', (e) => {
    if (open && e.button === 3) {
      e.preventDefault();
      close();
    }
  });

  return {
    el,
    mount,
    open: openView,
    close,
    current: () => open?.def.id ?? null,
    render() {
      open?.handle.render();
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
}
