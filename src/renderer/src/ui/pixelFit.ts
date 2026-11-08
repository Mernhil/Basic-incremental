/**
 * Clean pixels, the DOM side (DESIGN.md §12): keeps `--dpr` on the page and gives every card
 * host its whole scale. The maths is in `pixelScale.ts` (pure, tested); the CSS rounding for
 * other art is in `pixelScale.css`.
 */
import './pixelScale.css';
import { cardBoxScale, cleanDpr, pickCardScale, pickRowScale } from './pixelScale';

/** The screen's pixel ratio right now (browser zoom counts, so does a 125 % Windows scale). */
export const screenDpr = (): number => cleanDpr(window.devicePixelRatio);

interface Fit {
  /** CSS px wide the card should be (a function when it depends on the window). */
  want: number | (() => number);
  /** Most CSS px the card may take; the scale drops to the largest whole one that fits. */
  max?: () => number;
  /** Cards sharing one row (their gaps count toward `max`). */
  row?: { count: number; gap: number };
}

const fits = new Map<HTMLElement, Fit>();

function apply(host: HTMLElement, f: Fit): void {
  const d = screenDpr();
  const want = typeof f.want === 'function' ? f.want() : f.want;
  const max = f.max?.() ?? Infinity;
  const n = f.row
    ? pickRowScale(f.row.count, want, Number.isFinite(max) ? max : 1e6, f.row.gap, d)
    : pickCardScale(want, d, max);
  host.style.setProperty('--card-n', String(n));
  host.style.setProperty('--card-k', cardBoxScale(n, d).toFixed(6));
}

/**
 * Sets `--card-n` and `--card-k` on `host` (the element that holds cards, or wraps one) and keeps
 * them right when the screen scale changes. Call again to change the spec. Returns the scale.
 */
export function fitCard(host: HTMLElement, fit: Fit): number {
  // pages rebuild their hosts often: drop the ones that left the page before the map grows
  if (fits.size > 64) refitCards();
  fits.set(host, fit);
  apply(host, fit);
  return Number(host.style.getPropertyValue('--card-n'));
}

/** Re-picks every card scale (the window moved to another screen, or zoom changed). */
export function refitCards(): void {
  for (const [host, f] of fits) {
    if (!host.isConnected) fits.delete(host);
    else apply(host, f);
  }
}

let installed = false;

/** Once, early: publishes `--dpr` and follows changes of it. */
export function installPixelScale(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const sync = (): void => {
    document.documentElement.style.setProperty('--dpr', String(screenDpr()));
    refitCards();
  };
  sync();
  // zoom and display changes both end up as a resize or a resolution change
  window.addEventListener('resize', sync);
  const watch = (): void => {
    const mq = window.matchMedia(`(resolution: ${screenDpr()}dppx)`);
    mq.addEventListener(
      'change',
      () => {
        sync();
        watch();
      },
      { once: true },
    );
  };
  watch();
}

/**
 * Stage units (the element's own CSS px, before any transform) that make one art pixel exactly a
 * whole number of device pixels, about `wantCssPx` rendered CSS px wide and never below one device
 * pixel. A stage inside a scaled card (`transform: scale`) is measured through its transform, so
 * effects drawn in a card come out whole at every card scale (DESIGN.md §12).
 */
export function pixelUnit(stage: HTMLElement, wantCssPx: number): number {
  const d = screenDpr();
  const w = stage.clientWidth;
  const rendered = w > 0 ? stage.getBoundingClientRect().width / w : 1;
  const unitsToDevice = (rendered > 0 ? rendered : 1) * d;
  const device = Math.max(1, Math.round(wantCssPx * d));
  return device / unitsToDevice;
}
