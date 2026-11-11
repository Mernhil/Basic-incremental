/**
 * The card frame (DESIGN.md §5, §12): the approved pixel frame ladder. The tier is the frame:
 * material, gem sockets and crest all step up together, and it stays a border. The whole card is
 * one pixel grid (0.75 pixels per card unit, 132 x 186); the frame sprite is baked on that grid
 * with room above for the crest.
 *
 * Motion only on the last two tiers: Gold gets a shine sweeping across the metal and twinkling
 * corner gems; Prismatic cycles its crystal band through the rainbow, with the shine, twinkles and
 * sparks orbiting just outside. Under reduced motion both are still.
 */
import type { RankTier, Rarity } from '../../../data';
import { INK } from './kit';
import { defineLive, liveCanvas, liveMarkup, loadPixels, type LiveLayer } from './pixel/live';
import { rgbOf } from './pixel/raster';
import { sprite, spriteImage } from './pixel/sprites';
import {
  CARD_H,
  CARD_W,
  FRAME_METALS,
  FRAME_SCALE,
  FRAME_VB,
  SOCKETS,
  mirror,
} from './vector/frame';

export { FRAME_METALS, mirror };
export const FRAME_INK = INK;

const [VX, VY, VW, VH] = FRAME_VB;
const toPx = (x: number, y: number): [number, number] => [
  Math.floor((x - VX) * FRAME_SCALE),
  Math.floor((y - VY) * FRAME_SCALE),
];

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const k = (n: number): number => {
    const q = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1))) * 255);
  };
  return [k(0), k(8), k(4)];
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

function frameLayer(
  name: string,
  tier: 'gold' | 'prismatic',
): (host: HTMLElement) => Promise<LiveLayer> {
  return async (host) => {
    const s = sprite(name)!;
    const base = await loadPixels(s.url);
    const cv = host.querySelector('canvas')!;
    const ctx = cv.getContext('2d')!;
    const { width: W, height: H } = base;
    const src = base.data;
    const ink = rgbOf(INK);
    // the metal: every coloured pixel that is not ink, white or a dark socket
    const metal = new Uint8Array(W * H);
    const solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = src[i * 4]!;
      const g = src[i * 4 + 1]!;
      const b = src[i * 4 + 2]!;
      if (src[i * 4 + 3]! < 128) continue;
      const isInk = r === ink[0] && g === ink[1] && b === ink[2];
      if (!isInk) solid[i] = 1;
      if (!isInk && Math.max(r, g, b) - Math.min(r, g, b) > 40) metal[i] = 1;
    }
    const corners = SOCKETS.slice(0, 4).map(([x, y]) => toPx(x, y));
    let t = 0;
    return {
      step(_dt, clock) {
        t = clock;
      },
      draw() {
        const img = new ImageData(new Uint8ClampedArray(src), W, H);
        const d = img.data;
        const set = (x: number, y: number, c: readonly number[]): void => {
          if (x < 0 || y < 0 || x >= W || y >= H) return;
          const i = (y * W + x) * 4;
          d[i] = c[0]!;
          d[i + 1] = c[1]!;
          d[i + 2] = c[2]!;
          d[i + 3] = 255;
        };
        if (tier === 'prismatic')
          for (let i = 0; i < W * H; i++) {
            if (!metal[i]) continue;
            const x = i % W;
            const y = (i / W) | 0;
            const h = Math.floor((((x + y) * 3 + t * 90) % 360) / 60) * 60;
            const L = (d[i * 4]! * 0.3 + d[i * 4 + 1]! * 0.59 + d[i * 4 + 2]! * 0.11) / 255;
            const c = hsl(h, 0.7, Math.min(0.85, Math.max(0.45, L)));
            d[i * 4] = c[0];
            d[i * 4 + 1] = c[1];
            d[i * 4 + 2] = c[2];
          }
        // the shine: a 5-pixel diagonal band stepping across, then a long pause
        const span = W + H + 40;
        const pos = Math.round(((t * 60) % (span * 1.6)) - 20);
        for (let i = 0; i < W * H; i++) {
          if (!solid[i]) continue;
          const sx = (i % W) + ((i / W) | 0);
          if (Math.abs(sx - pos) < 3)
            for (let k = 0; k < 3; k++) d[i * 4 + k] = d[i * 4 + k]! + (255 - d[i * 4 + k]!) * 0.6;
        }
        // corner gems twinkle in diagonal pairs, staggered
        const white = [255, 255, 255];
        corners.forEach(([x, y], k) => {
          const ph = Math.floor(t * 8 + k * 5) % 14;
          twinklePx((a, b) => set(a, b, white), x, y, ph < 4 ? ph : -1);
        });
        if (tier === 'prismatic') {
          // sparks orbit just outside the band, behind nothing (the frame is a border)
          const per = 2 * (CARD_W + CARD_H);
          for (let k = 0; k < 4; k++) {
            let u = (t * 40 + (k * per) / 4) % per;
            let cx: number;
            let cy: number;
            if (u < CARD_W) [cx, cy] = [u, -3];
            else if ((u -= CARD_W) < CARD_H) [cx, cy] = [CARD_W + 3, u];
            else if ((u -= CARD_H) < CARD_W) [cx, cy] = [CARD_W - u, CARD_H + 3];
            else [cx, cy] = [-3, CARD_H - (u - CARD_W)];
            const [x, y] = toPx(cx, cy);
            const c = hsl((k * 90 + Math.floor(t * 4) * 30) % 360, 0.9, 0.7);
            set(x, y, c);
            set(x + 1, y, c);
            set(x, y + 1, c);
            set(x + 1, y + 1, c);
          }
        }
        ctx.putImageData(img, 0, 0);
      },
    };
  };
}
defineLive('frame-gold', frameLayer('frame-gold', 'gold'));
defineLive('frame-prismatic', frameLayer('frame-prismatic', 'prismatic'));
// the top frames keep the Gold motion (shine sweep, twinkling corners) on their own pictures
for (const n of ['mythic', 'void', 'heirloom-mythic', 'heirloom-void'])
  defineLive(`frame-${n}`, frameLayer(`frame-${n}`, 'gold'));

/** The frame picture for a tier. Mythic and the Heirloom have a Mythic and a Void version, picked
 *  by the card's side (its rarity), like the item art. */
export function frameName(tier: RankTier, side?: Rarity): string {
  if (tier === 'mythic') return side === 'void' ? 'frame-void' : 'frame-mythic';
  if (tier === 'heirloom') return side === 'void' ? 'frame-heirloom-void' : 'frame-heirloom-mythic';
  return `frame-${tier}`;
}

/** The frame markup for a tier, over a 176 x 248 card (its svg viewBox). */
export function cardFrame(tier: RankTier, side?: Rarity): string {
  const name = frameName(tier, side);
  const s = sprite(name);
  if (!s) return '';
  const still = spriteImage(name, VX, VY, VW, VH, 'bi-frame__px');
  if (tier === 'wood' || tier === 'bronze' || tier === 'silver') return still;
  // the still sprite stays underneath, so the frame shows before the first tick and when paused
  return still + liveMarkup(name, VX, VY, VW, VH, liveCanvas('bi-frame__live', s.w, s.h));
}
