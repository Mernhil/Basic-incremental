/**
 * Gem art in pixels (DESIGN.md §12): the gem coin whose metal shows the gem's mastery tier,
 * the mastery medal, the navigation plaques, the forged-edge ladder and the growing production
 * tiles. All are baked sprites (`pixel/bake.ts`) on their approved grids:
 *
 * - coins 48 x 48: plain rim with eight notches, dark well, one big faceted gem with a glint; rim
 *   metal and outer ring show the mastery tier (0 stone .. 4 prismatic); not found yet: a grey coin
 *   with a padlock.
 * - medals 48 x 48: faceted star, bright ridges, centre stud. Gold: moving shine and a twinkle;
 *   Prismatic: holo (facets cycling the rainbow) with the shine and twinkle. Still under reduced
 *   motion.
 * - navigation plaques 64 x 64: bronze hexagon, gold studs, dark face, glyph with shadow and light.
 * - forged edges: the in-game sword at five steps (bare, inlaid, gem-set, glowing runes,
 *   prismatic), recoloured to the line's gem.
 * - tiles 58 x 64: the tree grown over five stages and the crystal mine, on the rising plinth.
 */
import type { GemArt, Tree } from '../../../data';
import { INK } from './kit';
import { defineLive, liveCanvas, liveMarkup, loadPixels, type LiveLayer } from './pixel/live';
import { rgbOf } from './pixel/raster';
import { sprite, spriteImage } from './pixel/sprites';
import {
  EDGE_VB,
  METAL_LADDER,
  NAV_GLYPHS,
  OUTLINE,
  metalForTier,
  shapePoints,
  type Metal,
  type NavGlyph,
} from './vector/gems';
import { TILE_VB } from './vector/tiles';
import { twinklePx } from './frame';

export { METAL_LADDER, NAV_GLYPHS, OUTLINE, metalForTier, shapePoints, type Metal, type NavGlyph };

/** The viewBox the small icons sit in by default (unchanged for callers). */
export const ICON_VIEWBOX = '-6 -6 112 112';
export const MEDAL_VIEWBOX = '0 0 48 48';
export const PLAQUE_VIEWBOX = '0 0 64 64';
/** Forged edges are drawn in the card item's landscape box. */
export const EDGE_VIEWBOX = EDGE_VB.join(' ');
/** The production tile's own box (room for the plinth and the top sparkles). */
export const TILE_VIEWBOX = TILE_VB.join(' ');

/** Fits a sprite drawn on its own box into the caller's icon box (nested svg, aspect kept). */
const fit = (name: string, vb: readonly number[], cls = ''): string => {
  const s = sprite(name);
  if (!s) return '';
  return `<svg x="-6" y="-6" width="112" height="112" viewBox="${vb.join(' ')}" overflow="visible">${spriteImage(name, vb[0]!, vb[1]!, vb[2]!, vb[3]!, cls)}</svg>`;
};

/**
 * The resource icon: the faceted gem in a notched coin. `tier` is the gem's mastery tier
 * (0 stone .. 4 prismatic); `locked` shows the grey coin with a padlock. Sits in ICON_VIEWBOX.
 */
export function gemCoin(gem: GemArt, tier: number, locked = false): string {
  const name = locked ? `coin-${gem.shape}-locked` : `coin-${gem.shape}-${metalForTier(tier)}`;
  return fit(name, [0, 0, 48, 48], 'bi-coin');
}

/** The tree tile at a growth stage 0..4 (stone .. prismatic plinth). Sits in ICON_VIEWBOX. */
export function treeTile(_tree: Pick<Tree, 'art'>, gem: GemArt, stage = 0): string {
  return fit(`tile-tree-${gem.shape}-${clampStage(stage)}`, TILE_VB, 'bi-tile');
}
/** The crystal mine tile at a growth stage 0..4. Sits in ICON_VIEWBOX. */
export function mineTile(gem: GemArt, stage = 0): string {
  return fit(`tile-mine-${gem.shape}-${clampStage(stage)}`, TILE_VB, 'bi-tile');
}
const clampStage = (s: number): number => Math.min(4, Math.max(0, Math.floor(s)));

/** A forged edge at step 0..4 (bare .. prismatic) in the line's gem. Sits in EDGE_VIEWBOX. */
export function forgedEdge(gem: GemArt, step: number): string {
  const [x, y, w, h] = EDGE_VB;
  return spriteImage(`edge-${gem.shape}-${clampStage(step)}`, x, y, w, h, 'bi-edge');
}

/** A navigation plaque (64 x 64) with its glyph. Sits in PLAQUE_VIEWBOX. */
export function navPlaque(glyph: NavGlyph): string {
  return spriteImage(`plaque-${glyph}`, 0, 0, 64, 64, 'bi-plaque');
}

// ---- mastery medals ----

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const k = (n: number): number => {
    const q = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1))) * 255);
  };
  return [k(0), k(8), k(4)];
}

function medalLayer(tier: 3 | 4) {
  return async (host: HTMLElement): Promise<LiveLayer> => {
    const s = sprite(`medal-${tier}`)!;
    const base = await loadPixels(s.url);
    const ctx = host.querySelector('canvas')!.getContext('2d')!;
    const { width: W, height: H } = base;
    const ink = rgbOf(INK);
    const metal = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const [r, g, b, a] = [0, 1, 2, 3].map((k) => base.data[i * 4 + k]!);
      const isInk = r === ink[0] && g === ink[1] && b === ink[2];
      const isWhite = r === 255 && g === 255 && b === 255;
      if (a! >= 128 && !isInk && !isWhite) metal[i] = 1;
    }
    let t = 0;
    return {
      step(_dt, clock) {
        t = clock;
      },
      draw() {
        const img = new ImageData(new Uint8ClampedArray(base.data), W, H);
        const d = img.data;
        const sweep = Math.round(((t * 40) % (W + H + 60)) - 30);
        for (let i = 0; i < W * H; i++) {
          if (!metal[i]) continue;
          const x = i % W;
          const y = (i / W) | 0;
          if (tier === 4) {
            // holo: the facets step through the rainbow in 45-degree hue steps
            const L = (d[i * 4]! * 0.3 + d[i * 4 + 1]! * 0.59 + d[i * 4 + 2]! * 0.11) / 255;
            const h = Math.floor((((x + y) * 6 + t * 120) % 360) / 45) * 45;
            const c = hsl(h, 0.8, Math.min(0.85, Math.max(0.45, L)));
            d[i * 4] = c[0];
            d[i * 4 + 1] = c[1];
            d[i * 4 + 2] = c[2];
          }
          if (Math.abs(x + y - sweep) < 2.5)
            for (let k = 0; k < 3; k++) d[i * 4 + k] = d[i * 4 + k]! + (255 - d[i * 4 + k]!) * 0.7;
        }
        // a twinkle at the top-right point: dot, small plus, big plus, small plus, rest
        const ph = Math.floor(t * 8) % 16;
        const set = (x: number, y: number): void => {
          if (x < 0 || y < 0 || x >= W || y >= H) return;
          const o = (y * W + x) * 4;
          d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255;
        };
        twinklePx(set, tier === 4 ? 38 : 9, tier === 4 ? 8 : 10, ph < 4 ? ph : -1);
        ctx.putImageData(img, 0, 0);
      },
    };
  };
}
defineLive('medal-3', medalLayer(3));
defineLive('medal-4', medalLayer(4));

/** The mastery medal for tier 0..4 (stone .. prismatic). Sits in MEDAL_VIEWBOX. */
export function masteryMedal(tier: number): string {
  const t = clampStage(tier);
  const still = spriteImage(`medal-${t}`, 0, 0, 48, 48, 'bi-medal');
  if (t < 3) return still;
  return still + liveMarkup(`medal-${t}`, 0, 0, 48, 48, liveCanvas('bi-medal__live', 48, 48));
}

/** Wraps icon markup in an svg element (default: the coin and tile box). */
export function svg(inner: string, viewBox = ICON_VIEWBOX): string {
  return `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${inner}</svg>`;
}
