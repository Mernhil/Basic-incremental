/**
 * The card kit (DESIGN.md §5 The base frame, ASSET_RULES §5 Card kits): ONE 212 x 256 picture that
 * holds the frame, the crest socket, the name plate, a painted window for the weapon and the bottom
 * banner. Wood to Prismatic wear the kit of their tier (`kit-<tier>`, shared by every batch); T6 and
 * the Heirlooms wear their batch's (`batches.json`, `kit-t6-<batch>`). The card's own 132 x 186
 * rectangle sits at x 40, y 35 in the picture, so the kit is drawn centred on the card at the card's
 * scale and nothing moves. The game writes the name, stars and text onto the plates (theme/base.css
 * `bi-card--kit`); the rectangles are in KIT below.
 */
import type { RankTier } from '../../../data';
import { sprite, spriteImage } from './pixel/sprites';

/** The kit picture's size and where the card's rectangle starts in it (art pixels). */
export const KIT = {
  w: 212,
  h: 256,
  left: 40,
  top: 35,
  /** Layout guide, art pixels in the picture: name plate, art window, banner, crest. */
  namePlate: { x: 46, y: 40, w: 120, h: 18 },
  window: { x: 44, y: 58, w: 124, h: 122 },
  banner: { x: 28, y: 182, w: 156, h: 40 },
  crest: { x: 84, y: 10, w: 44, h: 32 },
} as const;

/** Card units (176 x 248 box) per art pixel. */
const UNIT = 176 / 132;

/** The kit a card wears: its tier's to Prismatic, its batch's `kit` at T6 and as an Heirloom. */
export function kitName(tier: RankTier, batchKit: string): string {
  return tier === 'mythic' || tier === 'heirloom' ? batchKit : `kit-${tier}`;
}

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

/** The kit markup over a 176 x 248 card (its svg viewBox); empty when it was never baked. */
export function cardFrame(tier: RankTier, batchKit: string): string {
  const name = kitName(tier, batchKit);
  if (!sprite(name)) return '';
  return spriteImage(
    name,
    -KIT.left * UNIT,
    -KIT.top * UNIT,
    KIT.w * UNIT,
    KIT.h * UNIT,
    'bi-frame__px',
  );
}
