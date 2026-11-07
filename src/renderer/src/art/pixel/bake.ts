/**
 * Build-time baking of every approved pixel sprite (run in headless Chromium by
 * `scripts/art/bake-pixels.mjs`; never shipped in the game bundle). Each approved vector drawing is
 * rasterised with hard edges on its native grid and passed through the pixel treatment in
 * `raster.ts`. The result is written to `sprites/*.png` plus `manifest.ts`.
 */
import { RARITIES } from '../../../../data';
import {
  EVOLUTIONS,
  EVOLUTION_WINDOW,
  ITEM_KINDS_DRAWN,
  RARITY_WINDOW,
  ROOTBLOOM_CRYSTALS,
  evolutionVector,
  itemVector,
  rootbloomCrystal,
} from '../vector/items';
import { FRAME_SCALE, FRAME_VB, TIER_ORDER, frameVector } from '../vector/frame';
import {
  bevel,
  cleanOrphans,
  mix,
  outline,
  partLines,
  sweepOrphans,
  paletteOf,
  prepSvg,
  quantize,
  ring,
  sparkles,
  toRGBA,
  type Grid,
} from './raster';

export interface Baked {
  name: string;
  w: number;
  h: number;
  /** PNG data URL. */
  png: string;
  /** Outline path (item box units) the element effects trace, for card items. */
  outline?: string;
}

type VB = readonly [number, number, number, number];

async function rasterSvg(
  markup: string,
  vb: VB,
  scale: number,
): Promise<{ grid: Grid; sparks: [number, number][] }> {
  const W = Math.round(vb[2] * scale);
  const H = Math.round(vb[3] * scale);
  const { svg, sparks } = prepSvg(markup, scale);
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vb.join(' ')}" shape-rendering="crispEdges">${svg}</svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const grid = quantize(d, W, H, paletteOf(doc));
  const pts = sparks.map(
    ([x, y]) =>
      [Math.floor((x - vb[0]) * scale), Math.floor((y - vb[1]) * scale)] as [number, number],
  );
  return { grid, sparks: pts };
}

function png(g: Grid): string {
  const c = document.createElement('canvas');
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(new ImageData(toRGBA(g) as Uint8ClampedArray<ArrayBuffer>, g.w, g.h), 0, 0);
  return c.toDataURL('image/png');
}

/** The approved card-item treatment ('E+'): bevel, ink, plus sparkles, light rim. */
async function cardItem(
  markup: string,
  windowBg: string,
  vb: VB = [0, 0, 200, 240],
  scale = 0.5,
): Promise<Grid> {
  const { grid, sparks } = await rasterSvg(markup, vb, scale);
  let g = sweepOrphans(partLines(outline(bevel(cleanOrphans(grid)))));
  g = sparkles(g, sparks, g.w >= 90 ? 3 : g.w >= 50 ? 2 : 1);
  return ring(g, mix(windowBg, '#ffffff', 0.3), 1, true);
}

/** The largest untransformed path of a drawing: what the element effects run along. */
function largestPath(markup: string): string | undefined {
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('viewBox', '0 0 200 240');
  host.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:240px';
  host.innerHTML = markup;
  document.body.append(host);
  let best: SVGPathElement | undefined;
  let area = 0;
  for (const p of host.querySelectorAll('path')) {
    const b = p.getBBox();
    if (b.width * b.height > area && p.getTotalLength() > 0) {
      area = b.width * b.height;
      best = p;
    }
  }
  if (!best) {
    host.remove();
    return undefined;
  }
  // sample it into item-box units, through any transforms on the way
  const root = host.getScreenCTM()!.inverse();
  const m = root.multiply(best.getScreenCTM()!);
  const len = best.getTotalLength();
  const pts: string[] = [];
  for (let i = 0; i < 96; i++) {
    const q = best.getPointAtLength((len * i) / 96);
    const x = m.a * q.x + m.c * q.y + m.e;
    const y = m.b * q.x + m.d * q.y + m.f;
    pts.push(`${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`);
  }
  host.remove();
  return `M${pts.join(' L')}Z`;
}

const out = (name: string, g: Grid, extra: Partial<Baked> = {}): Baked => ({
  name,
  w: g.w,
  h: g.h,
  png: png(g),
  ...extra,
});

export async function bakeItems(): Promise<Baked[]> {
  const res: Baked[] = [];
  for (const kind of ITEM_KINDS_DRAWN)
    for (const r of RARITIES) {
      const markup = itemVector(kind, r);
      res.push(
        out(`item-${kind}-${r}`, await cardItem(markup, RARITY_WINDOW[r]), {
          outline: largestPath(markup),
        }),
      );
    }
  for (const id of EVOLUTIONS) {
    const markup = evolutionVector(id);
    const bg = RARITY_WINDOW[EVOLUTION_WINDOW[id]];
    res.push(out(`evo-${id}`, await cardItem(markup, bg), { outline: largestPath(markup) }));
  }
  for (const [k, [, , s, rot]] of ROOTBLOOM_CRYSTALS.entries()) {
    const g = await cardItem(rootbloomCrystal(s, rot), RARITY_WINDOW.epic, [0, 0, 32, 32]);
    res.push(out(`evo-rootbloom_staff-crystal${k}`, g));
  }
  return res;
}

export async function bakeFrames(): Promise<Baked[]> {
  const res: Baked[] = [];
  for (const t of TIER_ORDER) {
    const { grid } = await rasterSvg(frameVector(t), FRAME_VB, FRAME_SCALE);
    res.push(out(`frame-${t}`, sweepOrphans(partLines(outline(bevel(cleanOrphans(grid)))))));
  }
  return res;
}

export async function bakeAll(): Promise<Baked[]> {
  return [...(await bakeItems()), ...(await bakeFrames())];
}
