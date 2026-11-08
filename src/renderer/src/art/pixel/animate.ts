/**
 * Palette-cycling sprites (DESIGN.md §12): a sprite with a strip of pre-rendered frames side by
 * side (`<sprite>-anim.png`, frames the size of the sprite) plays it with CSS `steps()`. Pure
 * markup, no loop and no canvas: the browser steps a `background-position`, so it costs nothing
 * off screen, stays on the sprite's own grid (nearest-neighbour, whole pixels) and stops on
 * frame 0 under reduced motion (the rule lives in `art.css`).
 */

/** One frame lasts this long (the strips are made at 110 ms). */
export const FRAME_MS = 110;

/** What a strip needs to play: its URL and how many frames it holds. */
export interface StripInfo {
  name: string;
  /** URL of the strip PNG (`frames` frames of the sprite's size in a row). */
  url: string;
  /** Native size of ONE frame, which is the sprite's own size. */
  w: number;
  h: number;
  frames: number;
}

/** Frames in a strip, or 0 when the strip is not a whole number of frames wide. */
export function framesIn(stripW: number, frameW: number): number {
  if (!(stripW > 0) || !(frameW > 0)) return 0;
  const n = stripW / frameW;
  return Number.isInteger(n) && n >= 2 ? n : 0;
}

/** Duration of one full loop in ms. */
export const loopMs = (frames: number, frameMs = FRAME_MS): number => frames * frameMs;

/**
 * Inline style that plays a strip inside a box of the sprite's own aspect. The strip is the box's
 * background at `frames x` its width; `jump-none` steps land exactly on every frame, with the last
 * frame shown for one slot before the loop restarts.
 */
export function stripStyle(s: StripInfo, frameMs = FRAME_MS): string {
  return [
    `background-image:url(${s.url})`,
    `background-size:${s.frames * 100}% 100%`,
    'background-repeat:no-repeat',
    'background-position:0 0',
    'image-rendering:pixelated',
    `--bi-anim-steps:${s.frames}`,
    `animation-duration:${loopMs(s.frames, frameMs)}ms`,
  ].join(';');
}

/** The whole device-pixel scale an animated sprite uses on its own (never below 1x). */
export function wholeScale(want: number): number {
  return Math.max(1, Math.round(Number.isFinite(want) ? want : 1));
}

/**
 * SVG markup (a card art window, in the caller's user units) for an animated sprite at (x, y) with
 * size (w, h). Callers keep w / h a whole multiple of the native size, like `spriteImage`.
 */
export function animatedImage(
  s: StripInfo,
  x: number,
  y: number,
  w: number,
  h: number,
  cls = '',
): string {
  return `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}" style="pointer-events:none"><div xmlns="http://www.w3.org/1999/xhtml" class="bi-px-anim${cls ? ` ${cls}` : ''}" data-sprite="${s.name}" style="width:${w}px;height:${h}px;${stripStyle(s)}"></div></foreignObject>`;
}

/**
 * HTML markup for an animated sprite on its own, `scale` whole CSS pixels per art pixel. The scale
 * is rounded to a whole number (at least 1), so pixels stay square.
 */
export function animatedHtml(s: StripInfo, scale = 1, cls = ''): string {
  const k = wholeScale(scale);
  return `<div class="bi-px-anim${cls ? ` ${cls}` : ''}" data-sprite="${s.name}" style="width:${s.w * k}px;height:${s.h * k}px;${stripStyle(s)}"></div>`;
}
