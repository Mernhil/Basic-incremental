/**
 * The card's base frame (DESIGN.md §5 The base frame, ASSET_RULES §5): the card's art batch's one
 * shared border picture (batches.json, `border-<batch>`), worn at every tier on both sides. The
 * picture is 212 x 256 pixels on the card's own pixel grid (0.75 pixels per card unit, a 132 x 186
 * card): the card's rectangle sits at x 40 to 171 and y 35 to 220 inside it, so the band is centred
 * on the card's edge (70% outside, 30% inside), the decoration grows outward and nothing is cut.
 */
import { sprite, spriteImage } from './pixel/sprites';

/** Card units per picture pixel (the card is a 132 x 186 pixel grid in a 176 x 248 box). */
const UNIT = 176 / 132;
/** The border picture's size and where the card's rectangle starts in it, in pixels. */
export const BORDER_W = 212;
export const BORDER_H = 256;
export const BORDER_LEFT = 40;
export const BORDER_TOP = 35;
/** The border picture placed over the 176 x 248 card, in card units (it hangs 53.3 left and right, 46.7 above and below). */
const BX = -BORDER_LEFT * UNIT;
const BY = -BORDER_TOP * UNIT;
const BW = BORDER_W * UNIT;
const BH = BORDER_H * UNIT;

/** A plus twinkle in four steps: dot, small plus, big plus, small plus (then off). */
export function twinklePx(
  set: (x: number, y: number) => void,
  x: number,
  y: number,
  phase: number,
): void {
  const arm = [0, 1, 2, 1][phase] ?? -1;
  if (arm < 0) return;
  set(x, y);
  for (let a = 1; a <= arm; a++) {
    set(x + a, y);
    set(x - a, y);
    set(x, y + a);
    set(x, y - a);
  }
}

/** The border markup for a border picture name, over a 176 x 248 card (its svg viewBox); empty when it was never baked. */
export function cardFrame(border: string): string {
  if (!sprite(border)) return '';
  return spriteImage(border, BX, BY, BW, BH, 'bi-frame__px');
}
