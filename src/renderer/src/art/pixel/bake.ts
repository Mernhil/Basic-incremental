/**
 * Build-time baking of every approved pixel sprite (run in headless Chromium by
 * `scripts/art/bake-pixels.mjs`; never shipped in the game bundle). Each approved vector drawing is
 * rasterised with hard edges on its native grid and passed through the pixel treatment in
 * `raster.ts`. The result is written to `sprites/*.png` plus `manifest.ts`.
 *
 * Hand-made sprites are not baked here: they live in `hand/*.png` and the bake script copies them
 * into `sprites/` as they are, passing their names in so no drawing here is baked over them. They
 * are converted with PixelLab from the user's approved concept sheets: the production tiles
 * (`design/pixel/concept-tiles/`) and, from sheet 1, the gem coins, the mastery medals, the maul and
 * bow ladders and the Flameblade and Soul Reaper (`design/pixel/concept-sheet-1/`).
 */
import { loadContent, type GemArt } from '../../../../data';
import {
  COIN_METALS,
  COIN_RING,
  EDGE_VB,
  NAV_GLYPHS,
  coinVector,
  edgeVector,
  medalVector,
  plaqueVector,
  type NavGlyph,
} from '../vector/gems';
import { BOSS_VB, bossVector, shardVector } from '../vector/bosses';
import {
  EVOLUTIONS,
  EVOLUTION_WINDOW,
  ART_RARITIES,
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
  WHITE,
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

/** Names that have a hand-made sprite (`hand/*.png`): skipped here, copied in by the script. */
let HAND = new Set<string>();
const drawn = (name: string): boolean => !HAND.has(name);

export async function bakeItems(): Promise<Baked[]> {
  const res: Baked[] = [];
  for (const kind of ITEM_KINDS_DRAWN)
    for (const r of ART_RARITIES) {
      if (!drawn(`item-${kind}-${r}`)) continue;
      const markup = itemVector(kind, r);
      res.push(
        out(`item-${kind}-${r}`, await cardItem(markup, RARITY_WINDOW[r]), {
          outline: largestPath(markup),
        }),
      );
    }
  for (const id of EVOLUTIONS) {
    if (!drawn(`evo-${id}`)) continue;
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

/** Small stickers (coins, medals): flat ramps, ink outline, a ring in the tier colour. */
async function sticker(markup: string, vb: VB, ringColour: string | null): Promise<Grid> {
  const { grid } = await rasterSvg(markup, vb, 1);
  const g = sweepOrphans(outline(cleanOrphans(grid)));
  return ringColour ? ring(g, ringColour) : g;
}

export async function bakeSmall(): Promise<Baked[]> {
  const content = loadContent();
  const res: Baked[] = [];
  const gems = new Map<string, GemArt>();
  for (const r of content.resources) if (r.gem) gems.set(r.gem.shape, r.gem);
  for (const [shape, gem] of gems) {
    for (const m of COIN_METALS) {
      if (!drawn(`coin-${shape}-${m}`)) continue;
      res.push(
        out(
          `coin-${shape}-${m}`,
          await sticker(coinVector(gem, m, false), [0, 0, 48, 48], COIN_RING[m]),
        ),
      );
    }
    if (drawn(`coin-${shape}-locked`))
      res.push(
        out(
          `coin-${shape}-locked`,
          await sticker(coinVector(gem, 'stone', true), [0, 0, 48, 48], COIN_RING.stone),
        ),
      );
  }
  for (let t = 0; t < 5; t++)
    if (drawn(`medal-${t}`))
      res.push(out(`medal-${t}`, await sticker(medalVector(t), [0, 0, 48, 48], WHITE)));
  for (const glyph of Object.keys(NAV_GLYPHS) as NavGlyph[])
    res.push(out(`plaque-${glyph}`, await sticker(plaqueVector(glyph), [0, 0, 64, 64], null)));
  // forged edges: every mine gem's line, five steps
  for (const mine of content.mines) {
    const gem = content.resourceById.get(mine.resource)?.gem;
    if (!gem) continue;
    for (let s = 0; s < 5; s++) {
      const { grid, sparks } = await rasterSvg(edgeVector(gem, s), EDGE_VB, 0.3);
      const g = sparkles(sweepOrphans(partLines(outline(bevel(cleanOrphans(grid))))), sparks, 1);
      res.push(out(`edge-${gem.shape}-${s}`, ring(g, mix('#1a2030', '#ffffff', 0.3), 1, true)));
    }
  }
  // production tiles are hand-made sprites (hand/*.png), copied in by the bake script
  return res;
}

/** Bosses (160 x 172, Brave Frontier technique, soft aura instead of a sticker ring) and shards. */
export async function bakeBosses(): Promise<Baked[]> {
  const res: Baked[] = [];
  for (const art of [
    'root_warden',
    'cinder_lich',
    'glacier_colossus',
    'crystal_sentinel',
  ] as const) {
    const { grid } = await rasterSvg(bossVector(art), BOSS_VB, 1);
    res.push(out(`boss-${art}`, sweepOrphans(outline(cleanOrphans(grid)))));
  }
  for (const lit of [true, false]) {
    const { grid } = await rasterSvg(shardVector(lit), [-1, -1, 18, 28], 1);
    res.push(out(`boss-shard-${lit ? 'lit' : 'dim'}`, sweepOrphans(outline(cleanOrphans(grid)))));
  }
  return res;
}

/** Bakes every drawn sprite, skipping the names in `hand` (the hand-made sprites). */
export async function bakeAll(hand: readonly string[] = []): Promise<Baked[]> {
  HAND = new Set(hand);
  return [
    ...(await bakeItems()),
    ...(await bakeFrames()),
    ...(await bakeSmall()),
    ...(await bakeBosses()),
  ];
}
