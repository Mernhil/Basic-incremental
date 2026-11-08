/// <reference types="vite/client" />
/**
 * The baked pixel sprites (DESIGN.md §12) and the markup that shows them: an SVG `<image>` on its
 * native grid, scaled with nearest-neighbour (`image-rendering: pixelated`), so callers that place
 * SVG art keep working unchanged.
 */
import { MANIFEST } from './manifest';
import { animatedHtml, animatedImage, framesIn, type StripInfo } from './animate';

const URLS = import.meta.glob<string>('./sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface SpriteInfo {
  name: string;
  url: string;
  w: number;
  h: number;
  outline?: string;
}

/** A baked sprite by name, or undefined when it was never baked. */
export function sprite(name: string): SpriteInfo | undefined {
  const m = MANIFEST[name];
  const url = URLS[`./sprites/${name}.png`];
  if (!m || !url) return undefined;
  return { name, url, ...m };
}

/**
 * The palette-cycling strip of a sprite (hand strip `<name>-anim.png`, registered by the bake as
 * `animated: { frames }` on the sprite), or undefined when it has none.
 */
export function strip(name: string): StripInfo | undefined {
  const m = MANIFEST[name];
  const url = URLS[`./sprites/${name}-anim.png`];
  const sm = MANIFEST[`${name}-anim`];
  if (!m?.animated || !url || !sm || framesIn(sm.w, m.w) !== m.animated.frames) return undefined;
  return { name, url, w: m.w, h: m.h, frames: m.animated.frames };
}

/** Markup that plays a sprite's strip in an SVG box; the still sprite when it has no strip. */
export function animatedSpriteImage(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cls = '',
): string {
  const s = strip(name);
  return s ? animatedImage(s, x, y, w, h, cls) : spriteImage(name, x, y, w, h, cls);
}

/** HTML for a sprite on its own at a whole scale; the still sprite when it has no strip. */
export function animatedSpriteHtml(name: string, scale = 1, cls = ''): string {
  const s = strip(name);
  if (s) return animatedHtml(s, scale, cls);
  const i = sprite(name);
  if (!i) return '';
  const k = Math.max(1, Math.round(scale));
  return `<img class="${cls}" src="${i.url}" width="${i.w * k}" height="${i.h * k}" style="${PIXELATED}" data-sprite="${name}" alt=""/>`;
}

/** Every baked sprite name (for tests and the gallery). */
export const SPRITE_NAMES: readonly string[] = Object.keys(MANIFEST);

/** Pixel images scale with nearest neighbour, never smoothed. */
export const PIXELATED = 'image-rendering:pixelated';

/**
 * SVG markup for a sprite placed at (x, y) with size (w, h) in the caller's user units. Keep w / h
 * a whole multiple of the native size where the layout allows, so every pixel is the same size.
 */
export function spriteImage(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  cls = '',
): string {
  const s = sprite(name);
  if (!s) return '';
  return `<image${cls ? ` class="${cls}"` : ''} href="${s.url}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" style="${PIXELATED}" data-sprite="${name}"/>`;
}
