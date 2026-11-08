/**
 * Clean pixels (DESIGN.md §12): pixel art is always shown at a whole number of device pixels per
 * art pixel, never shrunk. This file is the pure maths for that (no DOM), unit-tested; the DOM
 * side is `pixelFit.ts` and the CSS side is `pixelScale.css` (the same rounding with `round()`).
 *
 * Vocabulary: a "scale" `n` is whole device pixels per art pixel. CSS pixels come out as
 * `native * n / dpr`. `dpr` is `window.devicePixelRatio` (it can be 1.25, 1.5, 1.75, ...).
 */

/** The card grid: every card is one pixel grid of 132 x 186 art pixels (DESIGN.md §12 Sizes). */
export const CARD_ART_W = 132;
export const CARD_ART_H = 186;
/** The card's layout box (its CSS units, the viewBox of the frame): 4/3 unit per art pixel. */
export const CARD_BOX_W = 176;
export const CARD_BOX_H = 248;

const EPS = 0.02;

/** A usable device pixel ratio (the browser can report 0 or NaN in odd environments). */
export function cleanDpr(dpr: number): number {
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

/** True when `x` is a whole number, within drawing noise. */
export function isWhole(x: number, eps = EPS): boolean {
  return Math.abs(x - Math.round(x)) <= eps;
}

/** Device pixels per art pixel of an element `cssSize` CSS px wide showing `native` art pixels. */
export function deviceScaleOf(cssSize: number, native: number, dpr: number): number {
  return (cssSize * cleanDpr(dpr)) / native;
}

/** True when an art element of `cssSize` CSS px, `native` art pixels wide, is drawn cleanly. */
export function isCleanScale(cssSize: number, native: number, dpr: number): boolean {
  const k = deviceScaleOf(cssSize, native, dpr);
  return k >= 1 - EPS && isWhole(k);
}

/**
 * The whole scale for art that should be about `wantCssSize` CSS px wide: the nearest whole
 * number of device pixels per art pixel, never below 1 (art is never shrunk) and, when
 * `maxCssSize` is given, never so large it overflows it (unless 1x already does).
 */
export function pickSpriteScale(
  wantCssSize: number,
  native: number,
  dpr: number,
  maxCssSize = Infinity,
): number {
  const d = cleanDpr(dpr);
  let n = Math.max(1, Math.round((wantCssSize * d) / native));
  while (n > 1 && (native * n) / d > maxCssSize + 1e-6) n--;
  return n;
}

/** CSS size of `native` art pixels drawn at scale `n`. */
export function spriteCssSize(native: number, n: number, dpr: number): number {
  return (native * n) / cleanDpr(dpr);
}

/** The whole scale for a card about `wantCssWidth` CSS px wide (see `pickSpriteScale`). */
export function pickCardScale(wantCssWidth: number, dpr: number, maxCssWidth = Infinity): number {
  return pickSpriteScale(wantCssWidth, CARD_ART_W, dpr, maxCssWidth);
}

/** CSS width and height of a card at scale `n`. */
export function cardCssSize(n: number, dpr: number): { w: number; h: number } {
  return { w: spriteCssSize(CARD_ART_W, n, dpr), h: spriteCssSize(CARD_ART_H, n, dpr) };
}

/**
 * The factor that takes the 176 x 248 card box to its drawn size at scale `n`: what the card's
 * `transform: scale()` is. One box unit is 3/4 of an art pixel, so a card at scale 1 on a screen
 * with dpr 1 is 0.75, and at dpr 1.5 with scale 2 it is exactly 1.
 */
export function cardBoxScale(n: number, dpr: number): number {
  return (n * CARD_ART_W) / (cleanDpr(dpr) * CARD_BOX_W);
}

/** How many cards of scale `n` fit in `availableCssWidth` with `gap` CSS px between them. */
export function cardsPerRow(
  availableCssWidth: number,
  n: number,
  dpr: number,
  gap: number,
): number {
  const w = cardCssSize(n, dpr).w;
  return Math.max(1, Math.floor((availableCssWidth + gap) / (w + gap)));
}

/**
 * The scale for a row of `count` cards that should be about `wantCssWidth` each but must fit in
 * `availableCssWidth`: the nearest whole scale, shrunk to the largest that fits, never below 1.
 */
export function pickRowScale(
  count: number,
  wantCssWidth: number,
  availableCssWidth: number,
  gap: number,
  dpr: number,
): number {
  const per = (availableCssWidth - gap * (count - 1)) / count;
  return pickCardScale(wantCssWidth, dpr, per);
}
