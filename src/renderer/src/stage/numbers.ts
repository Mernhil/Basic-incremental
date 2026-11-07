import type { Decimal } from '../../../game';
import { createMerger, overCap, popText } from './math';
import { jitter, reducedMotion, stageHidden } from './motion';
import './numbers.css';

/**
 * Floating numbers (DESIGN.md 14, A4 B sticker numerals). Every colour, size and font comes from
 * the equipped number and tick cosmetic tokens (--bi-num-*, --bi-tick-*); the motion comes from
 * the equipped tick effect (see NUMBER_MOTION). At most MAX_POPUPS live at once, oldest first
 * out; rapid gains on the same spot merge into one number.
 */

export type PopKind = 'hit' | 'crit' | 'signature' | 'hurt' | 'gain' | 'total';

/** Popups alive at once across every stage. */
export const MAX_POPUPS = 30;
/** Gains on the same key within this window merge into one number. */
export const MERGE_WINDOW_MS = 450;

/**
 * Tick effect id (cosmetic data) -> how numbers move. The starter tick ("rise") is drawn as the
 * decided sticker numerals, which bounce in place (DESIGN.md 14).
 */
const NUMBER_MOTION: Record<string, string> = { rise: 'bounce' };
let motion = 'bounce';

/** Called when the theme changes: picks the motion of the equipped tick effect. */
export function setNumberMotion(tickEffect: string | undefined): void {
  motion = (tickEffect && NUMBER_MOTION[tickEffect]) ?? 'bounce';
}

const live: HTMLElement[] = [];
const TTL: Record<PopKind, number> = {
  hit: 900,
  crit: 1100,
  signature: 1500,
  hurt: 950,
  gain: 1000,
  total: 1600,
};

/** The popup layer of a stage element (created on first use). */
export function numberLayer(stage: HTMLElement): HTMLElement {
  let layer = stage.querySelector<HTMLElement>(':scope > .st-num-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'st-num-layer';
    layer.setAttribute('aria-hidden', 'true');
    stage.append(layer);
  }
  return layer;
}

function remove(el: HTMLElement): void {
  const i = live.indexOf(el);
  if (i >= 0) live.splice(i, 1);
  el.remove();
}

export interface PopOptions {
  kind: PopKind;
  text: string;
  /** Position in the stage, 0..1 of its width and height. */
  x: number;
  y: number;
  /** Size relative to the tick-size token (see popupScale). */
  scale?: number;
}

/** Shows one floating number on a stage. Returns its element (null when the stage is hidden). */
export function popNumber(stage: HTMLElement, opts: PopOptions): HTMLElement | null {
  if (stageHidden()) return null;
  const el = document.createElement('span');
  el.className = `st-num st-num--${opts.kind}`;
  el.dataset['motion'] = reducedMotion() ? 'fade' : motion;
  el.style.setProperty('--x', `${(opts.x * 100).toFixed(1)}%`);
  el.style.setProperty('--y', `${(opts.y * 100).toFixed(1)}%`);
  el.style.setProperty('--s', (opts.scale ?? 1).toFixed(2));
  el.style.setProperty('--tilt', `${jitter(-9, 9).toFixed(1)}deg`);
  const text = document.createElement('b');
  text.textContent = opts.text;
  el.append(text);
  numberLayer(stage).append(el);
  live.push(el);
  for (const old of overCap(live, MAX_POPUPS)) old.remove();
  window.setTimeout(() => remove(el), TTL[opts.kind]);
  return el;
}

const gainMerger = createMerger<Decimal>(MERGE_WINDOW_MS, (a, b) => a.add(b));
const gainEls = new Map<string, HTMLElement>();

/**
 * A "+n" gain over a plot or slot. Rapid gains with the same key add up on the open number
 * instead of stacking new ones.
 */
export function popGain(
  stage: HTMLElement,
  key: string,
  amount: Decimal,
  x: number,
  y: number,
  scale = 1,
): void {
  if (stageHidden()) return;
  const now = performance.now();
  const result = gainMerger.push(key, amount, now);
  const open = gainEls.get(key);
  if (result.merged && open?.isConnected) {
    open.querySelector('b')!.textContent = `+${popText(result.value)}`;
    open.classList.remove('is-bumped');
    void open.offsetWidth;
    open.classList.add('is-bumped');
    return;
  }
  if (result.merged) {
    // the open number is gone (popup cap): start a fresh one with just this amount
    gainMerger.close(key);
    gainMerger.push(key, amount, now);
  }
  const el = popNumber(stage, { kind: 'gain', text: `+${popText(amount)}`, x, y, scale });
  if (!el) {
    gainMerger.close(key);
    return;
  }
  gainEls.set(key, el);
  window.setTimeout(() => {
    if (gainEls.get(key) === el) {
      gainEls.delete(key);
      gainMerger.close(key);
    }
  }, MERGE_WINDOW_MS);
}

/** Number of popups alive (for tests in the page and debugging). */
export const livePopups = (): number => live.length;
