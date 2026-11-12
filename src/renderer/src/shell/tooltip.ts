/**
 * Hover and focus tooltips. One floating element is shared by the whole screen. Content is built
 * when the tooltip opens, so it always shows live values (for example a stat breakdown).
 */

export type TipContent = string | (() => string | Node);

const SHOW_DELAY_MS = 250;
const GAP_PX = 8;

let tipEl: HTMLDivElement | null = null;
let current: HTMLElement | null = null;
let timer: number | undefined;

function ensureTip(): HTMLDivElement {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'shell-tip';
  tipEl.id = 'shell-tip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.hidden = true;
  document.body.append(tipEl);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !tipEl || tipEl.hidden) return;
    // a showing tooltip takes Esc first; the open view closes on the next one (UI_RULES.md §2)
    event.preventDefault();
    hide();
  });
  window.addEventListener('blur', hide);
  return tipEl;
}

function place(target: HTMLElement, tip: HTMLElement): void {
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const side = target.dataset.tipSide;
  let left: number;
  let top: number;
  if (side === 'right') {
    left = r.right + GAP_PX;
    top = r.top + r.height / 2 - t.height / 2;
  } else {
    left = r.left + r.width / 2 - t.width / 2;
    top = r.bottom + GAP_PX;
    if (top + t.height > vh - GAP_PX) top = r.top - t.height - GAP_PX; // flip above
  }
  left = Math.min(Math.max(GAP_PX, left), vw - t.width - GAP_PX);
  top = Math.min(Math.max(GAP_PX, top), vh - t.height - GAP_PX);
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

const contents = new WeakMap<HTMLElement, TipContent>();

function show(target: HTMLElement): void {
  const content = contents.get(target);
  if (!content) return;
  const tip = ensureTip();
  const value = typeof content === 'function' ? content() : content;
  if (value === '') return;
  if (typeof value === 'string') tip.textContent = value;
  else tip.replaceChildren(value);
  tip.hidden = false;
  current = target;
  target.setAttribute('aria-describedby', tip.id);
  place(target, tip);
}

export function hide(): void {
  window.clearTimeout(timer);
  if (tipEl) tipEl.hidden = true;
  current?.removeAttribute('aria-describedby');
  current = null;
}

/** Adds a tooltip to `target`, shown on hover (after a short delay) and on keyboard focus. */
export function attachTooltip(target: HTMLElement, content: TipContent): void {
  contents.set(target, content);
  target.addEventListener('pointerenter', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => show(target), SHOW_DELAY_MS);
  });
  target.addEventListener('pointerleave', hide);
  target.addEventListener('focus', () => show(target));
  target.addEventListener('blur', hide);
}

/** A titled tooltip with label/value rows, used for stat breakdowns. */
export function tipTable(
  title: string,
  rows: Array<[string, string]>,
  total?: [string, string],
): HTMLElement {
  const box = document.createElement('div');
  const h = document.createElement('p');
  h.className = 'shell-tip__title';
  h.textContent = title;
  const dl = document.createElement('dl');
  dl.className = 'shell-tip__rows';
  const add = ([label, value]: [string, string], cls = ''): void => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    dd.className = 'bi-num';
    if (cls) {
      dt.classList.add(cls);
      dd.classList.add(cls);
    }
    dl.append(dt, dd);
  };
  rows.forEach((row) => add(row));
  if (total) add(total, 'shell-tip__total');
  box.append(h, dl);
  return box;
}
