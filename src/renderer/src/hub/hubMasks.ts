import { brighten, GLOW_GOLD, HUB_MAP_H, HUB_MAP_W, type Rect } from './hubModel';

/**
 * Exact building masks (DESIGN.md section 2 Base camp): one 640 x 360 picture per place in
 * `hub/masks/<id>.png`, the place's pixels in solid white and everything else transparent. A mask is
 * the place's click area (a pixel test at the map's own scale) and the shape the hover glow follows.
 */

/** Mask files found at build time, by place id. */
const FILES = import.meta.glob<string>('./masks/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function maskFileFor(id: string): string | null {
  return FILES[`./masks/${id}.png`] ?? null;
}

export interface Mask {
  /** One byte per picture pixel: 1 where the place is. */
  alpha: Uint8Array;
  /** The box around the place, in picture pixels. */
  bounds: Rect;
}

function decodeUrl(url: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => img,
    () => null,
  );
}

function pixels(img: HTMLImageElement): ImageData | null {
  const c = document.createElement('canvas');
  c.width = HUB_MAP_W;
  c.height = HUB_MAP_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, HUB_MAP_W, HUB_MAP_H);
}

/** Reads one mask file. Resolves null when it cannot be read, is not 640 x 360 or is empty. */
export async function loadMask(url: string): Promise<Mask | null> {
  const img = await decodeUrl(url);
  if (!img || img.naturalWidth !== HUB_MAP_W || img.naturalHeight !== HUB_MAP_H) return null;
  const data = pixels(img)?.data;
  if (!data) return null;
  const alpha = new Uint8Array(HUB_MAP_W * HUB_MAP_H);
  let x0 = HUB_MAP_W;
  let y0 = HUB_MAP_H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < HUB_MAP_H; y += 1) {
    for (let x = 0; x < HUB_MAP_W; x += 1) {
      if (data[(y * HUB_MAP_W + x) * 4 + 3]! < 128) continue;
      alpha[y * HUB_MAP_W + x] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { alpha, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/** The painted map's own pixels (for the brightened copy of a hovered place). */
export async function loadMapPixels(url: string): Promise<ImageData | null> {
  const img = await decodeUrl(url);
  return img ? pixels(img) : null;
}

/** Whether the picture pixel (x, y) is part of the place. */
export function maskHit(mask: Mask, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= HUB_MAP_W || y >= HUB_MAP_H) return false;
  return mask.alpha[y * HUB_MAP_W + x] === 1;
}

/**
 * The hover picture of one place, 640 x 360 with nothing outside the place and its ring: the place
 * itself with every colour brightened, and a 1-picture-pixel gold outline just outside it (the mask
 * grown one pixel up, down, left and right, minus the mask). No blur: every pixel is one picture pixel.
 */
export function glowImage(mask: Mask, map: ImageData): ImageData {
  const out = new ImageData(HUB_MAP_W, HUB_MAP_H);
  const { x, y, w, h } = mask.bounds;
  for (let py = Math.max(0, y - 1); py <= Math.min(HUB_MAP_H - 1, y + h); py += 1) {
    for (let px = Math.max(0, x - 1); px <= Math.min(HUB_MAP_W - 1, x + w); px += 1) {
      const i = (py * HUB_MAP_W + px) * 4;
      if (maskHit(mask, px, py)) {
        out.data[i] = brighten(map.data[i]!);
        out.data[i + 1] = brighten(map.data[i + 1]!);
        out.data[i + 2] = brighten(map.data[i + 2]!);
        out.data[i + 3] = 255;
      } else if (
        maskHit(mask, px - 1, py) ||
        maskHit(mask, px + 1, py) ||
        maskHit(mask, px, py - 1) ||
        maskHit(mask, px, py + 1)
      ) {
        out.data[i] = GLOW_GOLD[0];
        out.data[i + 1] = GLOW_GOLD[1];
        out.data[i + 2] = GLOW_GOLD[2];
        out.data[i + 3] = 255;
      }
    }
  }
  return out;
}
