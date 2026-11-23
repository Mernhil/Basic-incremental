import { loadMapPixels, glowImage, maskHit, type Mask } from '../../hub/hubMasks';
import { HUB_MAP_H, HUB_MAP_W } from '../../hub/hubModel';
import forestUrl from './scenes/forest-scene-640x360.png';
import mineUrl from './scenes/mine-scene-640x360.png';

/**
 * The painted forest and mine (DESIGN.md section 2 Base camp): the scene picture and one mask per
 * material node, 640 x 360 each, white on the tree or vein. Same pixel rules as the hub: every
 * picture pixel is one map pixel, scaled up by a whole number.
 */

export const SCENE_URL = { forest: forestUrl, cave: mineUrl } as const;

const MASKS = import.meta.glob<string>('./scenes/masks/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function nodeMaskUrl(key: string): string | null {
  return MASKS[`./scenes/masks/${key}.png`] ?? null;
}

/** Reads a node mask: the node is where the picture is white (the files are greyscale, no alpha). */
export async function loadNodeMask(url: string): Promise<Mask | null> {
  const img = new Image();
  img.src = url;
  const ok = await img.decode().then(
    () => true,
    () => false,
  );
  if (!ok || img.naturalWidth !== HUB_MAP_W || img.naturalHeight !== HUB_MAP_H) return null;
  const c = document.createElement('canvas');
  c.width = HUB_MAP_W;
  c.height = HUB_MAP_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, HUB_MAP_W, HUB_MAP_H).data;
  const alpha = new Uint8Array(HUB_MAP_W * HUB_MAP_H);
  let x0 = HUB_MAP_W;
  let y0 = HUB_MAP_H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < HUB_MAP_H; y += 1) {
    for (let x = 0; x < HUB_MAP_W; x += 1) {
      const i = (y * HUB_MAP_W + x) * 4;
      if (data[i]! < 128 || data[i + 3]! < 128) continue;
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

/**
 * A locked node's picture: the node's pixels in grey and dimmed, nothing outside the mask. Drawn
 * over the scene, it hides the node's colour until the node opens.
 */
export function dimImage(mask: Mask, scene: ImageData): ImageData {
  const out = new ImageData(HUB_MAP_W, HUB_MAP_H);
  for (let y = mask.bounds.y; y < mask.bounds.y + mask.bounds.h; y += 1) {
    for (let x = mask.bounds.x; x < mask.bounds.x + mask.bounds.w; x += 1) {
      if (!maskHit(mask, x, y)) continue;
      const i = (y * HUB_MAP_W + x) * 4;
      const grey = Math.round(
        (scene.data[i]! * 0.3 + scene.data[i + 1]! * 0.59 + scene.data[i + 2]! * 0.11) * 0.42,
      );
      out.data[i] = grey;
      out.data[i + 1] = grey;
      out.data[i + 2] = grey;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

export { glowImage, loadMapPixels, maskHit };
export type { Mask };
