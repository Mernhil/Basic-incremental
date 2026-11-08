/**
 * The signature item inside a card (DESIGN.md §12), as approved pixel art: a 100 x 120 sprite with
 * the black one-pixel ink, light extra shading, plus sparkles and a light rim (treatment 'E+'),
 * baked from the approved vector drawings in `vector/items.ts`. Rarity sets how intricate it is.
 *
 * The markup keeps the 200 x 240 item box, so `ITEM_VIEWBOX` and every caller stay the same. A
 * hidden copy of the item's outline rides along so the element effects (`fx.ts`) can still trace
 * the real shape.
 */
import type { Rarity } from '../../../data';
import { spriteImage, sprite } from './pixel/sprites';
import { ITEM_KINDS_DRAWN, ITEM_VIEWBOX, makeBlade } from './vector/items';

export { ITEM_KINDS_DRAWN, ITEM_VIEWBOX, makeBlade };

/** The item box every card item is drawn in (200 x 240 units; one pixel is 2 units). */
export const ITEM_BOX = { w: 200, h: 240 } as const;

/** The hidden outline the element effects trace (not drawn). */
export const outlinePath = (d: string | undefined): string =>
  d ? `<path class="bi-item__outline" d="${d}" fill="none" stroke="none"/>` : '';

/** Markup for a baked item-box sprite (card items and evolutions), with its traced outline. */
export function itemBoxSprite(name: string, cls = ''): string {
  const s = sprite(name);
  if (!s) return '';
  return `<g class="bi-item${cls ? ` ${cls}` : ''}">${outlinePath(s.outline)}${spriteImage(name, 0, 0, ITEM_BOX.w, ITEM_BOX.h)}</g>`;
}

/** The item's pixel sprite for a card art window, in the 200 x 240 item box. */
export function itemArt(kind: string, rarity: Rarity): string {
  return itemBoxSprite(`item-${kind}-${rarity}`);
}
