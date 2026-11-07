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
      // the gem-crowned tree's top canopy turns into the gem's own colours
      const top = stage === 4 && i === blobs.length - 1;
      if (top) obj += halo(x, y, rx * 0.9, gem.colors[1]);
      obj += facetPoly(jitterPoly(x, y, rx, ry, n, 3 + i * 2), x - 2, y - 2, 0.48, top ? crystalL : Lc);
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
  }
  const scale = look.scale[stage]!;
  const amb =
    look.ambient > 0 && stage >= 3
      ? twinkle(18, 20, 5, 0.2) + (stage === 4 || look.ambient > 1 ? twinkle(84, 14, 6, 0.9) + twinkle(70, 72, 4, 1.4) : '')
      : '';
  const glow = look.ambient > 1 && stage >= 2 ? halo(50, 40, 18 + stage * 6, gem.colors[1]) : '';
  return sticker(ground(GRASS, stage, look.rim, gem) + glow + on(obj, scale)) + amb;
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

/** One faceted rock mass: a fan of faces from an apex, lit from the top-left, so it reads as one solid outcrop. */
function outcrop(o: Pt[], apex: Pt, t: Tones): string {
  const faces = o.map((pt, i) => {
    const n = o[(i + 1) % o.length]!;
    const mx = (pt[0] + n[0]) / 2 - apex[0];
    const my = (pt[1] + n[1]) / 2 - apex[1];
    const d = (-mx - my) / Math.hypot(mx, my) / Math.SQRT2;
    const tone = i === o.length - 1 ? t[3] : d > 0.35 ? t[0] : d > -0.25 ? t[1] : t[2];
    return [[pt, n, apex], tone] as const;
  });
  return facet(P(o), faces, t[2], 2.6);
}

/** A gem set into the rock: a dark socket, then the carved gem. */
function setGem(gem: GemArt, x: number, y: number, r: number, rot: number): string {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.2)}" fill="${ROCK[3]}"/><g transform="rotate(${rot} ${x} ${y})">${carvedGem(gem, x, y, r)}</g>`;
}

const SHAFT =
  `<path d="M40 92 L40 73 Q50 64 60 73 L60 92Z" fill="#120e16" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<path d="M37 93 L37 70 M63 93 L63 70 M34 69 L66 69" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
  `<path d="M37 93 L37 70 M63 93 L63 70 M34 69 L66 69" fill="none" stroke="#9a6236" stroke-width="3" stroke-linecap="round"/>`;

const PEAK: Pt[] = [[8, 92], [6, 70], [17, 50], [33, 34], [52, 26], [69, 34], [84, 50], [94, 70], [93, 92]];
const MASS: { o: Pt[]; apex: Pt }[] = [
  { o: [[30, 92], [27, 80], [36, 68], [52, 63], [67, 70], [73, 82], [72, 92]], apex: [46, 74] },
  { o: [[16, 92], [13, 76], [24, 60], [42, 51], [60, 53], [77, 63], [87, 78], [86, 92]], apex: [44, 66] },
  { o: [[10, 92], [8, 72], [19, 54], [38, 42], [60, 43], [79, 54], [92, 72], [91, 92]], apex: [44, 58] },
  { o: PEAK, apex: [46, 50] },
  { o: PEAK, apex: [46, 50] },
];
const TOP_GEMS: [number, number, number, number][] = [
  [22, 68, 9, -14],
  [78, 68, 8.5, 18],
  [44, 44, 8, 6],
  [64, 50, 6.5, -8],
  [16, 84, 6, -24],
  [86, 84, 5.5, 20],
];
const GEMS: [number, number, number, number][][] = [
  [[50, 76, 7.5, -10]],
  [
    [32, 70, 8, -14],
    [62, 66, 7.5, 16],
    [76, 80, 6, 4],
  ],
  [
    [24, 68, 8.5, -14],
    [76, 68, 8, 18],
    [46, 52, 7, 6],
    [18, 84, 5.5, -24],
  ],
  TOP_GEMS,
  TOP_GEMS,
];

/** A mine at a growth stage: surface boulder, open outcrop, shaft, glowing seams, crystal cavern. */
export function mineAt(gem: GemArt, stage: number, look: GrowthLook): string {
  const gt: Tones = [gem.colors[0], gem.colors[1], gem.colors[2], gem.colors[3]];
  const rockT: Tones = look.crystal && stage >= 3 ? ['#6a6280', '#4e4864', '#36324a', '#262236'] : ROCK;
  const { o, apex } = MASS[stage]!;
  let obj = shadow(50, 93, 24 + stage * 5);
  if (stage >= 3) obj += halo(50, 60, 30, gem.colors[1]);
  obj += outcrop(o, apex, rockT);
  if (stage >= 3) {
    // seams run along the rock's own facet edges, so the glow belongs to its cuts
    const seams = o
      .slice(1, -1)
      .filter((_, i) => i % 2 === 1)
      .map((v) => `M${f(apex[0])} ${f(apex[1])} L${f(apex[0] + (v[0] - apex[0]) * 0.85)} ${f(apex[1] + (v[1] - apex[1]) * 0.85)}`)
      .join(' ');
    obj += `<path d="${seams}" fill="none" stroke="${gem.colors[0]}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  if (stage >= 2) obj += SHAFT;
  obj += GEMS[stage]!.map(([x, y, r, rot]) => setGem(gem, x, y, r, rot)).join('');
  if (stage === 4) {
    obj +=
      crystal(46, 92, 14, 3.5, -12, gt) +
      crystal(54, 92, 18, 4, 8, gt) +
      crystal(9, 94, 26, 5.5, -16, gt) +
      crystal(18, 94, 18, 4.5, -4, gt) +
      crystal(91, 94, 28, 5.5, 14, gt) +
      crystal(82, 94, 17, 4.5, 4, gt) +
      crystal(52, 30, 18, 5, 4, gt);
  }
  const amb =
    look.ambient > 0 && stage >= 3
      ? twinkle(80, 24, 6, 0.3) + (stage === 4 || look.ambient > 1 ? twinkle(16, 30, 5, 1) + twinkle(56, 18, 4, 1.6) : '')
      : '';
  return sticker(ground(STONE_TOP, stage, look.rim, gem) + on(obj, look.scale[stage]!)) + amb;
}
