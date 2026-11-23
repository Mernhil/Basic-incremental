/**
 * Enemy, mini-boss and boss pictures: each is a 160 x 172 canvas (the boss canvas, feet on one
 * ground line) with a still `foe-<id>`, drawn by us (ASSET_RULES.md section 5). Every picture is a
 * still, shown as one frame; an idle strip `foe-<id>-anim` would be played with CSS `steps()`
 * (`art/pixel/animate.ts`) if one is ever added. An enemy with no picture shows the placeholder.
 */
import { stripStyle } from './pixel/animate';
import { spriteImage, sprite, strip } from './pixel/sprites';
import { FONT } from './pixelFont';
import FIT from './foeFit.json';

export const FOE_W = 160;
export const FOE_H = 172;
/** Whether a foe picture (its still) exists for this sprite id. */
export const hasFoeSprite = (id: string | undefined): boolean => !!id && !!sprite(`foe-${id}`);

/**
 * The whole-art-pixel nudge [dx, dy] that centres a still picture and stands it on the ground line
 * (feet at row 166; a floating ice wisp hangs a little higher). Measured from each picture's own
 * opaque box, so the file stays exactly as approved. Pictures not listed are already placed.
 */
export const foeFit = (id: string): readonly [number, number] =>
  ((FIT as Record<string, number[]>)[id] as [number, number] | undefined) ?? [0, 0];

/** The figure the placeholder fills in: an existing humanoid pack picture (its still, no new art). */
const PLACEHOLDER_BODY = 'foe-hooded_rogue_assassin';
const PLACEHOLDER_FILL = [0x3a, 0x40, 0x5e] as const;
const PLACEHOLDER_MARK = '#d2d8f4';
/** Where the question mark sits on the 160 x 172 canvas: left column, top row, art pixels per cell. */
const MARK = { x: 65, y: 62, cell: 6 };

/**
 * The picture shown for an enemy that has none ("picture to come"): the silhouette of an existing
 * pack figure filled with one dark colour, a question mark from the pixel font on it, on the same
 * 160 x 172 canvas and ground line as the real pictures. An enemy gets its own picture back by
 * dropping `hand/foe-<id>.png` and `foe-<id>-anim.png` in `art/pixel/` and baking
 * (`scripts/art/bake-pixels.mjs`): `foeHtml` uses the strip as soon as it exists.
 */
export function placeholderHtml(scale: number): string {
  const body = sprite(PLACEHOLDER_BODY);
  if (!body) return '';
  const [r, g, b] = PLACEHOLDER_FILL.map((v) => (v / 255).toFixed(3));
  const rows = FONT['?']!;
  let marks = '';
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#')
        marks += `<rect x="${MARK.x + x * MARK.cell}" y="${MARK.y + y * MARK.cell}" width="${MARK.cell}" height="${MARK.cell}"/>`;
    }),
  );
  return `<svg class="bi-foe bi-foe--placeholder" width="${FOE_W * scale}" height="${FOE_H * scale}" viewBox="0 0 ${FOE_W} ${FOE_H}" overflow="visible" aria-hidden="true" focusable="false"><filter id="bi-foe-ph" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/></filter><g filter="url(#bi-foe-ph)">${spriteImage(PLACEHOLDER_BODY, 0, 0, FOE_W, FOE_H)}</g><g fill="${PLACEHOLDER_MARK}" shape-rendering="crispEdges">${marks}</g></svg>`;
}

/**
 * The foe's picture as HTML at `scale` CSS px per art pixel (a whole number of device pixels, the
 * caller picks it: `stage/arena.ts`). The placeholder when the enemy has no picture.
 */
export function foeHtml(id: string, scale: number): string {
  const s = strip(`foe-${id}`);
  const still = sprite(`foe-${id}`);
  if (!s && !still) return placeholderHtml(scale);
  const w = FOE_W * scale;
  const h = FOE_H * scale;
  if (!s) {
    // a still picture: one frame, drawn like the strip but with no animation
    const [dx, dy] = foeFit(id);
    const zoom = dx || dy ? `transform:translate(${dx * scale}px,${dy * scale}px);` : '';
    return `<div class="bi-foe" data-sprite="foe-${id}" aria-hidden="true" style="width:${w}px;height:${h}px;${zoom}background-image:url(${still!.url});background-size:100% 100%;background-repeat:no-repeat;image-rendering:pixelated"></div>`;
  }
  return `<div class="bi-px-anim bi-foe" data-sprite="foe-${id}" aria-hidden="true" style="width:${w}px;height:${h}px;${stripStyle(s)}"></div>`;
}
