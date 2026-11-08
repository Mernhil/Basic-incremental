/// <reference types="vite/client" />
/**
 * The baked pixel sprites (DESIGN.md §12) and the markup that shows them: an SVG `<image>` on its
 * native grid, scaled with nearest-neighbour (`image-rendering: pixelated`), so callers that place
 * SVG art keep working unchanged.
 */
import { MANIFEST } from './manifest';

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
