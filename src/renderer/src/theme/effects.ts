import type { Rng } from '../../../game';
import { pixelTick, preloadNumerals } from '../art/cosmetics';
import { pixelUnit } from '../ui/pixelFit';
import './effects.css';

/**
 * Floating damage and gain numbers (`showTick`), drawn inside a stage's effect layer. The hit
 * effects (slashes, impacts) and the attack cosmetics that styled them are gone (DESIGN.md §8). The
 * tick and number cosmetic slots are empty categories until the new batch of damage-number styles
 * is made; a number follows `--bi-tick-*` and `--bi-num-*` when an item sets them.
 */

const MAX_LIVE_TICKS = 10;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function layer(stage: HTMLElement): HTMLElement {
  let fx = stage.querySelector<HTMLElement>(':scope > .bi-fx-layer');
  if (!fx) {
    fx = document.createElement('div');
    fx.className = 'bi-fx-layer';
    stage.append(fx);
  }
  return fx;
}

const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

let numeralsReady: Promise<void> | undefined;

/** Shows one floating damage or gain number. */
export function showTick(
  stage: HTMLElement,
  text: string,
  opts: { rng: Rng; crit?: boolean },
): void {
  const fx = layer(stage);
  const live = fx.querySelectorAll('.bi-tick');
  if (live.length >= MAX_LIVE_TICKS) live[0]?.remove();
  const tick = document.createElement('span');
  tick.className = `bi-tick${opts.crit ? ' bi-tick--crit' : ''}`;
  tick.style.setProperty('--x', `${between(opts.rng, 12, 64).toFixed(1)}%`);
  // a pixel tick style (beta-batch tick cosmetics) names itself in --bi-tick-px
  numeralsReady ??= preloadNumerals().catch(() => undefined);
  const px = getComputedStyle(stage).getPropertyValue('--bi-tick-px').trim();
  const cv = px ? pixelTick(px, text) : undefined;
  if (cv) {
    tick.classList.add('bi-tick--px');
    // whole device pixels per numeral pixel (DESIGN.md §12), 2 CSS px (3 for a crit) wanted
    const unit = pixelUnit(stage, opts.crit ? 3 : 2);
    cv.style.cssText = `display:block;width:${cv.width * unit}px;height:${cv.height * unit}px;image-rendering:pixelated`;
    tick.append(cv);
  } else tick.textContent = text;
  tick.setAttribute('aria-hidden', 'true');
  fx.append(tick);
  window.setTimeout(() => tick.remove(), 1150);
}
