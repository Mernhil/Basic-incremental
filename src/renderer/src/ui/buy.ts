import type { BuyCount } from '../../../game';
import { COPY } from '../copy';
import type { BuyLineView } from '../pages/buyModel';
import { replay } from '../stage/motion';
import './buy.css';

/**
 * Buy controls (DESIGN.md §11): the ×1 / ×10 / ×100 / Max toggle shared by every upgrade line, and
 * the buy button with its price, preview, glow when affordable and a fill bar toward the next
 * affordable purchase. The chosen amount is remembered per player in localStorage.
 */

const COUNTS: readonly BuyCount[] = [1, 10, 100, 'max'];
const STORE_KEY = 'bi.buyCount';

function load(): BuyCount {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === 'max') return 'max';
    const n = Number(raw);
    return COUNTS.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

let current: BuyCount = load();
const listeners = new Set<(c: BuyCount) => void>();
const toggles = new Set<() => void>();

export const buyCount = (): BuyCount => current;

export function setBuyCount(count: BuyCount): void {
  current = count;
  try {
    localStorage.setItem(STORE_KEY, String(count));
  } catch {
    /* storage blocked: keep it for this session */
  }
  for (const sync of toggles) sync();
  for (const fn of listeners) fn(count);
}

/** Calls `fn` whenever the buy amount changes. */
export function onBuyCount(fn: (c: BuyCount) => void): void {
  listeners.add(fn);
}

/** The ×1 / ×10 / ×100 / Max segmented toggle (a radio group, arrow keys move). */
export function createBuyToggle(): HTMLElement {
  const group = document.createElement('div');
  group.className = 'buy-toggle';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', COPY.buy.countLabel);
  const buttons = COUNTS.map((count) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'buy-toggle__opt';
    b.setAttribute('role', 'radio');
    b.textContent = COPY.buy.counts[count as keyof typeof COPY.buy.counts];
    b.addEventListener('click', () => setBuyCount(count));
    b.addEventListener('keydown', (e) => {
      const step =
        e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? 1
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
            ? -1
            : 0;
      if (!step) return;
      e.preventDefault();
      const next = COUNTS[(COUNTS.indexOf(count) + step + COUNTS.length) % COUNTS.length]!;
      setBuyCount(next);
      buttons[COUNTS.indexOf(next)]?.focus();
    });
    return b;
  });
  const sync = (): void => {
    buttons.forEach((b, i) => {
      const on = COUNTS[i] === current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };
  sync();
  // toggles that were shown and then left the page are dropped on the next change
  let seen = false;
  const guarded = (): void => {
    if (group.isConnected) seen = true;
    else if (seen) {
      toggles.delete(guarded);
      return;
    }
    sync();
  };
  toggles.add(guarded);
  group.append(...buttons);
  return group;
}

export interface BuyButton {
  el: HTMLButtonElement;
  update(view: BuyLineView): void;
  /** The purchase celebration: a shine across the button. */
  celebrate(): void;
}

/** A buy button: "Buy ×10 · 120 Copper", the preview under it, a glow and a fill bar. */
export function createBuyButton(onBuy: () => void, compact = false): BuyButton {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `buy-btn${compact ? ' buy-btn--compact' : ''}`;
  const top = document.createElement('span');
  top.className = 'buy-btn__top';
  const label = document.createElement('span');
  label.className = 'buy-btn__label';
  const price = document.createElement('span');
  price.className = 'buy-btn__price bi-num';
  top.append(label, price);
  const preview = document.createElement('span');
  preview.className = 'buy-btn__preview bi-num';
  const fill = document.createElement('i');
  fill.className = 'buy-btn__fill';
  fill.setAttribute('aria-hidden', 'true');
  el.append(top, preview, fill);
  el.addEventListener('click', () => {
    if (el.getAttribute('aria-disabled') === 'true') return;
    onBuy();
  });
  const set = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };
  return {
    el,
    update(v) {
      set(label, v.label);
      set(price, v.price);
      set(preview, v.preview);
      const ok = v.available && v.offer.affordable;
      // aria-disabled keeps the button focusable so its preview can still be read
      el.setAttribute('aria-disabled', String(!ok));
      el.classList.toggle('is-affordable', ok);
      fill.style.transform = `scaleX(${ok ? 1 : Math.min(1, Math.max(0, v.offer.progress)).toFixed(3)})`;
    },
    celebrate() {
      replay(el, 'is-bought', 500);
    },
  };
}
