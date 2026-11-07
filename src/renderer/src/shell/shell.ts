import { COPY } from '../copy';
import { icon, type IconName } from './icons';
import { attachTooltip, type TipContent } from './tooltip';
import './shell.css';

/** Sidebar order is fixed by DESIGN.md section 9. */
export const PAGES = [
  { id: 'home', icon: 'home' },
  { id: 'cards', icon: 'cards' },
  { id: 'production', icon: 'production' },
  { id: 'dungeons', icon: 'dungeons' },
  { id: 'summon', icon: 'summon' },
  { id: 'skills', icon: 'skills' },
  { id: 'wardrobe', icon: 'wardrobe' },
  { id: 'achievements', icon: 'achievements' },
  { id: 'shop', icon: 'shop' },
  { id: 'settings', icon: 'settings' },
] as const satisfies ReadonlyArray<{ id: string; icon: IconName }>;

export type PageId = (typeof PAGES)[number]['id'];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A framed panel: dark gilded body with a name-plate title, like the cards. */
export function frame(title: string, note?: string): { el: HTMLElement; body: HTMLElement } {
  const el = h('section', 'frame');
  const head = h('header', 'frame__title');
  const heading = h('h2', 'frame__heading', title);
  heading.id = `frame-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  el.setAttribute('aria-labelledby', heading.id);
  head.append(heading);
  if (note) head.append(h('span', 'frame__note', note));
  const body = h('div', 'frame__body');
  el.append(head, body);
  return { el, body };
}

export interface Currency {
  id: string;
  name: string;
  icon: IconName;
  /** Full-colour SVG markup (a gem coin). Replaces the line icon when set. */
  art?: string;
  tip: TipContent;
}

export interface Shell {
  el: HTMLElement;
  /** Notice area above the page (warnings, "while you were away"). */
  notices: HTMLElement;
  page(id: PageId): HTMLElement;
  show(id: PageId): void;
  current(): PageId;
  setLevel(level: number, xpFraction: number, xpText: string): void;
  /** Updates a resource chip. Chips stay hidden until the amount is above zero once. */
  setCurrency(id: string, text: string, positive: boolean): void;
  scrollToTop(): void;
}

export function createShell(opts: {
  version: string;
  currencies: Currency[];
  levelTip: TipContent;
  onShow?: (id: PageId) => void;
}): Shell {
  const el = h('div', 'shell');

  // ---- header ----
  const header = h('header', 'shell-header');
  const brand = h('div', 'shell-brand');
  brand.append(
    h('span', 'shell-brand__name', COPY.shell.title),
    h('span', 'shell-brand__ver', opts.version),
  );

  const level = h('div', 'shell-level');
  level.tabIndex = 0;
  const badge = h('span', 'shell-level__badge bi-num', '1');
  const meta = h('span', 'shell-level__meta');
  const levelLabel = h('span', 'shell-level__label', COPY.shell.level(1));
  const bar = h('span', 'shell-level__bar');
  const fill = h('span', 'shell-level__fill');
  bar.append(fill);
  const xp = h('span', 'shell-level__xp bi-num');
  meta.append(levelLabel, bar, xp);
  level.append(badge, meta);
  attachTooltip(level, opts.levelTip);

  const currencyList = h('ul', 'shell-currencies');
  currencyList.setAttribute('aria-label', COPY.shell.currencies);
  const currencyValues = new Map<string, HTMLElement>();
  const currencyItems = new Map<string, HTMLElement>();
  for (const c of opts.currencies) {
    const item = h('li', 'shell-currency');
    item.tabIndex = 0;
    const value = h('span', 'shell-currency__value bi-num', '0');
    let glyph: Element = icon(c.icon, 'shell-icon shell-currency__icon');
    if (c.art) {
      glyph = h('span', 'shell-currency__art');
      glyph.innerHTML = c.art;
    }
    item.append(glyph, value, h('span', 'shell-currency__name', c.name));
    attachTooltip(item, c.tip);
    item.hidden = true; // shown once the player has some
    currencyValues.set(c.id, value);
    currencyItems.set(c.id, item);
    currencyList.append(item);
  }
  header.append(brand, level, currencyList);

  // ---- sidebar ----
  const nav = h('nav', 'shell-rail');
  nav.setAttribute('aria-label', COPY.shell.navigation);
  const list = h('ul', 'shell-rail__list');
  const links = new Map<PageId, HTMLButtonElement>();
  for (const p of PAGES) {
    const li = h('li');
    const btn = h('button', 'shell-rail__item');
    btn.type = 'button';
    btn.dataset.page = p.id;
    btn.dataset.tipSide = 'right';
    btn.append(icon(p.icon), h('span', 'shell-rail__label', COPY.pages[p.id].label));
    // In the narrow (icons only) layout the label is hidden, so the tooltip names the page.
    attachTooltip(btn, () =>
      el.classList.contains('shell--narrow') ? COPY.pages[p.id].label : '',
    );
    btn.addEventListener('click', () => show(p.id));
    links.set(p.id, btn);
    li.append(btn);
    list.append(li);
  }
  nav.append(list);

  // ---- pages ----
  const main = h('main', 'shell-main');
  main.tabIndex = -1;
  const notices = h('div', 'shell-notices');
  main.append(notices);
  const pages = new Map<PageId, HTMLElement>();
  for (const p of PAGES) {
    const page = h('div', 'shell-page');
    page.dataset.page = p.id;
    const title = h('h1', 'shell-page__title', COPY.pages[p.id].label);
    page.append(title);
    page.hidden = true;
    pages.set(p.id, page);
    main.append(page);
  }

  el.append(header, nav, main);

  let active: PageId = 'home';
  function show(id: PageId): void {
    active = id;
    for (const [pid, page] of pages) page.hidden = pid !== id;
    for (const [pid, link] of links) {
      if (pid === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    main.scrollTop = 0;
    opts.onShow?.(id);
  }
  show('home');
  // Start every launch at the top of the page.
  requestAnimationFrame(() => (main.scrollTop = 0));

  // Below this width the sidebar shows icons only (the window can shrink to 1024px).
  const narrow = window.matchMedia('(max-width: 1120px)');
  const applyNarrow = (): void => {
    el.classList.toggle('shell--narrow', narrow.matches);
  };
  narrow.addEventListener('change', applyNarrow);
  applyNarrow();

  return {
    el,
    notices,
    page: (id) => pages.get(id)!,
    show,
    current: () => active,
    setLevel(lv, fraction, text) {
      badge.textContent = String(lv);
      levelLabel.textContent = COPY.shell.level(lv);
      fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
      xp.textContent = text;
    },
    scrollToTop() {
      main.scrollTop = 0;
    },
    setCurrency(id, text, positive) {
      const v = currencyValues.get(id);
      if (v && v.textContent !== text) v.textContent = text;
      const item = currencyItems.get(id);
      if (item && positive && item.hidden) item.hidden = false;
    },
  };
}

/** Fills a not-yet-built page with a framed empty state. */
export function placeholderPage(page: HTMLElement, id: Exclude<PageId, 'home'>): void {
  const { el, body } = frame(COPY.pages[id].frame);
  body.append(
    h('p', 'frame__lead', COPY.pages[id].empty),
    h('p', 'frame__muted', COPY.shell.coming),
  );
  page.append(el);
}
