// A13 overhaul: tree and mine tiles drawn per growth stage (0..4, one per 25-level milestone),
// built with the same faceted kit as the game's tiles (src/renderer/src/art/gems.ts).
import type { Tree } from '../../src/data';
import { carvedGem, METALS, sticker, type Metal } from '../../src/renderer/src/art/gems';
import {
  INK,
  P,
  f,
  facet,
  facetPoly,
  halo,
  jitterPoly,
  rnd,
  shadow,
  twinkle,
  type Pt,
  type Tones,
} from '../../src/renderer/src/art/kit';

type GemArt = Parameters<typeof carvedGem>[0];
const LADDER: Metal[] = ['stone', 'bronze', 'silver', 'gold', 'prism'];
const GRASS: Tones = ['#a8ec7a', '#7cd05a', '#58a842', '#3e8030'];
const STONE_TOP: Tones = ['#8e94a4', '#6e7484', '#525868', '#3e4450'];
const ROCK: Tones = ['#5e6472', '#454a57', '#30343f', '#22252e'];

export type RimStyle = 'sides' | 'band' | 'plinth' | 'inlay';
export interface GrowthLook {
  rim: RimStyle;
  /** Scale of the object per stage. */
  scale: readonly number[];
  /** Turn the top stages into gem/crystal material. */
  crystal: boolean;
  /** Extra ambient (halo, twinkles) strength 0..2. */
  ambient: number;
}

/** Hexagonal faceted ground; the sides (or a band, plinth or inlay) show the stage's metal. */
function ground(top: Tones, stage: number, rim: RimStyle, gem: GemArt): string {
  const m = METALS[LADDER[stage]!];
  const T: Pt[] = [
    [90, 80],
    [70, 90.4],
    [30, 90.4],
    [10, 80],
    [30, 69.6],
    [70, 69.6],
  ];
  const depth = rim === 'plinth' ? 8 + stage * 2.5 : 8;
  const side = (a: Pt, b: Pt, c: string): readonly [Pt[], string] => [
    [a, b, [b[0], b[1] + depth], [a[0], a[1] + depth]],
    c,
  ];
  const dirt = ['#7a6a8a', '#5c4e6e', '#40364e'];
  const sc = rim === 'sides' || rim === 'plinth' ? [m[0], m[1], m[2]] : dirt;
  const sil = P([
    [10, 80],
    [30, 90.4],
    [70, 90.4],
    [90, 80],
    [90, 80 + depth],
    [70, 90.4 + depth],
    [30, 90.4 + depth],
    [10, 80 + depth],
  ]);
  let out = facet(
    sil,
    [side([10, 80], [30, 90.4], sc[0]!), side([30, 90.4], [70, 90.4], sc[1]!), side([70, 90.4], [90, 80], sc[2]!)],
    sc[2]!,
    2.4,
  );
  if (rim === 'plinth' && stage > 0)
    out += `<path d="M10 ${f(80 + depth * 0.5)} L30 ${f(90.4 + depth * 0.5)} L70 ${f(90.4 + depth * 0.5)} L90 ${f(80 + depth * 0.5)}" fill="none" stroke="${m[3]}" stroke-width="1.4" opacity=".8"/>`;
  const tones = [top[1], top[2], top[2], top[1], top[0], top[0]];
  out += facet(
    P(T),
    T.map((pt, i) => [[pt, T[(i + 1) % 6]!, [50, 80]], tones[i]!] as const),
    top[2],
    2.4,
  );
  if (rim === 'band')
    out += `<path d="${P(T)}" fill="none" stroke="${INK}" stroke-width="6"/><path d="${P(T)}" fill="none" stroke="${m[1]}" stroke-width="3.4"/><path d="M30 69.6 L70 69.6" stroke="${m[3]}" stroke-width="1.2"/>`;
  if (rim === 'inlay')
    out +=
      `<path d="M10 84 L30 94.4 L70 94.4 L90 84" fill="none" stroke="${m[1]}" stroke-width="3" stroke-linejoin="round"/>` +
      [20, 40, 60, 80]
        .slice(0, stage)
        .map((x) => carvedGem(gem, x, x < 50 ? 85 + (x - 10) * 0.45 : 94.4 - (x - 70) * 0.5, 3.2))
        .join('');
  return out;
}

const on = (obj: string, s: number): string =>
  `<g transform="translate(${f(50 - 50 * s)} ${f(82 - 94 * s)}) scale(${f(s)})">${obj}</g>`;

function hang(gem: GemArt, x: number, y: number, r: number): string {
  return `<path d="M${f(x)} ${f(y - r - 6)} L${f(x)} ${f(y - r + 1)}" stroke="${INK}" stroke-width="1.6"/>${carvedGem(gem, x, y, r)}`;
}

function trunk(B: Tones, thick: number, roots: boolean): string {
  const w = 6 * thick;
  const base: Pt[] = [
    [50 - w - (roots ? 10 : 4), 94],
    [50 - w * 0.6, 84],
    [50 - w * 0.4, 66],
    [52 - w * 0.2, 46],
    [52 + w * 0.8, 46],
    [50 + w * 0.5, 66],
    [50 + w * 0.7, 84],
    [50 + w + (roots ? 10 : 4), 94],
  ];
  const mid = 51 + w * 0.2;
  return facet(
    P(base),
    [
      [[base[0]!, base[1]!, base[2]!, base[3]!, [mid, 46], [mid, 94]], B[0]],
      [[[mid, 46], base[4]!, base[5]!, base[6]!, base[7]!, [mid, 94]], B[2]],
    ],
    B[2],
  );
}

/** A tree at a growth stage: sapling, young, full canopy, grand, gem-crowned. */
export function treeAt(tree: Pick<Tree, 'art'>, gem: GemArt, stage: number, look: GrowthLook): string {
  const L = tree.art.leaf;
  const B = tree.art.bark;
  const crystalL: Tones = [gem.colors[0], gem.colors[1], gem.colors[2], gem.colors[3]];
  const Lc = look.crystal && stage >= 3 ? crystalL : L;
  let obj = shadow(50, 93, 14 + stage * 6);
  if (stage === 0) {
    obj +=
      `<path d="M50 94 C50 82 48 74 52 64" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M50 94 C50 82 48 74 52 64" fill="none" stroke="${B[0]}" stroke-width="3" stroke-linecap="round"/>` +
      facetPoly(jitterPoly(42, 64, 10, 6, 6, 2), 40, 62, 0.4, L) +
      facetPoly(jitterPoly(60, 58, 11, 7, 6, 5), 58, 56, 0.4, L) +
      hang(gem, 54, 74, 5);
  } else {
    obj += trunk(B, [0, 0.6, 0.9, 1.25, 1.35][stage]!, stage >= 3);
    const blobs: [number, number, number, number, number][] = [
      [[0, 0, 0, 0, 0]],
      [[52, 34, 22, 18, 9]],
      [
        [30, 50, 16, 12, 7],
        [58, 30, 30, 22, 10],
      ],
      [
        [24, 52, 18, 13, 7],
        [78, 48, 18, 13, 7],
        [50, 26, 36, 24, 10],
      ],
      [
        [22, 54, 18, 13, 7],
        [80, 50, 18, 13, 7],
        [50, 28, 38, 25, 11],
      ],
    ][stage]!;
    obj += `<g class="bi-art-sway">`;
    blobs.forEach(([x, y, rx, ry, n], i) => {
      obj += facetPoly(jitterPoly(x, y, rx, ry, n, 3 + i * 2), x - 2, y - 2, 0.48, Lc);
    });
    const spots: [number, number, number][] = [
      [],
      [
        [44, 46, 7],
        [62, 44, 6.5],
      ],
      [
        [40, 58, 9],
        [70, 56, 9.5],
        [86, 44, 7],
        [22, 64, 6.5],
      ],
      [
        [36, 50, 9],
        [62, 48, 10],
        [86, 60, 8],
        [16, 62, 7.5],
        [50, 40, 7],
        [74, 34, 7],
      ],
      [
        [36, 52, 9],
        [62, 50, 10],
        [88, 62, 8],
        [14, 64, 7.5],
        [48, 42, 7],
        [74, 36, 7],
      ],
    ][stage]!;
    obj += spots.map(([x, y, r]) => hang(gem, x, y, r)).join('');
    obj += `</g>`;
    if (stage === 4) {
      obj +=
        halo(50, 4, 16, gem.colors[0]) +
        `<g transform="translate(50 6)">${carvedGem(gem, 0, 0, 11)}</g>` +
        `<path d="M38 12 L44 2 L50 10 L56 2 L62 12Z" fill="${METALS.gold[1]}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    }
  }
  const scale = look.scale[stage]!;
  const amb =
    look.ambient > 0 && stage >= 3
      ? twinkle(18, 20, 5, 0.2) + (stage === 4 || look.ambient > 1 ? twinkle(84, 14, 6, 0.9) + twinkle(70, 72, 4, 1.4) : '')
      : '';
  const glow = look.ambient > 1 && stage >= 2 ? halo(50, 40, 18 + stage * 6, gem.colors[1]) : '';
  return sticker(ground(GRASS, stage, look.rim, gem) + glow + on(obj, scale)) + amb;
}

function rock(cx: number, cy: number, w: number, h: number, seed: number, tones: Tones = ROCK): string {
  const r = rnd(seed);
  const j = (v: number): number => v + (r() - 0.5) * w * 0.12;
  const tl: Pt = [j(cx - w * 0.45), j(cy - h * 0.45)];
  const tr: Pt = [j(cx + w * 0.32), j(cy - h * 0.58)];
  const fr: Pt = [j(cx + w * 0.5), j(cy - h * 0.18)];
  const fl: Pt = [j(cx - w * 0.22), j(cy - h * 0.08)];
  const bl: Pt = [j(cx - w * 0.5), cy + h * 0.38];
  const bm: Pt = [j(cx - w * 0.08), cy + h * 0.5];
  const br: Pt = [j(cx + w * 0.46), cy + h * 0.42];
  return facet(
    P([tl, tr, fr, br, bm, bl]),
    [
      [[tl, tr, fr, fl], tones[0]],
      [[tl, fl, bm, bl], tones[1]],
      [[fl, fr, br, bm], tones[2]],
    ],
    tones[2],
    2.4,
  );
}

function crystal(x: number, y: number, h: number, w: number, tilt: number, c: Tones): string {
  const pts: Pt[] = [
    [x - w, y],
    [x - w, y - h * 0.7],
    [x, y - h],
    [x + w, y - h * 0.7],
    [x + w, y],
  ];
  return `<g transform="rotate(${tilt} ${x} ${y})">${facet(
    P(pts),
    [
      [[pts[0]!, pts[1]!, pts[2]!, [x, y]], c[0]],
      [[[x, y], pts[2]!, pts[3]!, pts[4]!], c[2]],
    ],
    c[1],
    2.2,
  )}</g>`;
}

/** A mine at a growth stage: surface rock, open quarry, deeper shaft, glowing veins, crystal cavern. */
export function mineAt(gem: GemArt, stage: number, look: GrowthLook): string {
  const g = (x: number, y: number, r: number, rot: number): string =>
    `<g transform="rotate(${rot} ${x} ${y})">${carvedGem(gem, x, y, r)}</g>`;
  const gt: Tones = [gem.colors[0], gem.colors[1], gem.colors[2], gem.colors[3]];
  const rockT = look.crystal && stage >= 3 ? (['#6a6280', '#4e4864', '#36324a', '#262236'] as Tones) : ROCK;
  let obj = shadow(50, 92, 20 + stage * 5);
  if (stage === 0) {
    obj += rock(50, 76, 40, 30, 61, rockT) + g(46, 70, 9, -10);
  } else if (stage === 1) {
    obj +=
      `<ellipse cx="50" cy="88" rx="26" ry="6" fill="#2a2430" stroke="${INK}" stroke-width="2"/>` +
      rock(30, 70, 38, 34, 61, rockT) +
      rock(72, 74, 30, 26, 63, rockT) +
      g(30, 60, 10, -14) +
      g(72, 64, 8, 18) +
      g(52, 82, 7, 4);
  } else {
    const shaft =
      `<path d="M38 90 L38 66 L62 66 L62 90Z" fill="#120e16" stroke="${INK}" stroke-width="2.4"/>` +
      `<path d="M34 92 L34 62 L66 62 L66 92 M32 62 L68 62" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M34 92 L34 62 L66 62 L66 92 M32 62 L68 62" fill="none" stroke="#9a6236" stroke-width="3" stroke-linecap="round"/>`;
    obj +=
      rock(22, 64, 40, 44, 61, rockT) +
      rock(80, 66, 36, 40, 63, rockT) +
      (stage >= 3 ? rock(50, 40, 44, 30, 69, rockT) : '') +
      shaft +
      g(20, 52, 11, -14) +
      g(80, 56, 10, 18) +
      g(26, 78, 7, -30) +
      g(76, 80, 6.5, 24) +
      (stage >= 3 ? g(50, 34, 10, 6) + g(36, 42, 6, -20) : '');
    if (stage >= 3) {
      const vein = 'M10 60 L18 66 L16 74 M86 52 L78 62 L84 70 M40 30 L48 38 L58 34 L64 40';
      obj += `<path d="${vein}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="${vein}" fill="none" stroke="${gem.colors[0]}" stroke-width="2.4" stroke-linecap="round"/>`;
      obj = halo(50, 56, 34, gem.colors[1]) + obj;
    }
    if (stage === 4) {
      obj +=
        crystal(12, 92, 30, 6, -14, gt) +
        crystal(22, 94, 22, 5, -4, gt) +
        crystal(88, 92, 32, 6, 14, gt) +
        crystal(78, 94, 20, 5, 6, gt) +
        crystal(50, 22, 22, 6, 0, gt);
    }
  }
  const amb =
    look.ambient > 0 && stage >= 3
      ? twinkle(80, 24, 6, 0.3) + (stage === 4 || look.ambient > 1 ? twinkle(16, 30, 5, 1) + twinkle(56, 18, 4, 1.6) : '')
      : '';
  return sticker(ground(STONE_TOP, stage, look.rim, gem) + on(obj, look.scale[stage]!)) + amb;
}
