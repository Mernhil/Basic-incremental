/**
 * Production tiles (DESIGN.md 13 and 16 E4), the approved drawings the pixel tiles are baked from:
 * the in-game tree grown over five stages (leaves in the gem's colour) and the crystal-cluster
 * mine, both on a hexagonal ground that sits on a rising metal plinth (stone, bronze, silver, gold,
 * prismatic). Drawn in a 100 x 100 box, baked on the -8 -14 116 128 box at 0.5 px per unit (58 x 64).
 */
import type { GemArt } from '../../../../data';
import { INK, f, jitterPoly, rnd, type Pt } from '../kit';
import { shapePoints } from './gems';

type Tone4 = readonly [string, string, string, string];
type Tone5 = readonly [string, string, string, string, string];
interface Line {
  a: Pt;
  b: Pt;
  c: string;
  w: number;
  o?: number;
}
interface Dot {
  x: number;
  y: number;
  r: number;
  c: string;
  o?: number;
}
/** One inked part: silhouette, flat faces, glint lines and specks. */
interface Group {
  sil: Pt[];
  faces: [Pt[], string][];
  base: string;
  lines: Line[];
  dots: Dot[];
  w: number;
}

export const TILE_VB = [-8, -14, 116, 128] as const;
export const TILE_SCALE = 0.5;
export const TILE_STAGES = 5;

const METALS: readonly Tone4[] = [
  ['#a2a8b2', '#7c828c', '#585e68', '#ccd0d8'],
  ['#e6a464', '#bc7838', '#80491c', '#ffd6a0'],
  ['#eef2f8', '#b8c0cc', '#848e9c', '#ffffff'],
  ['#ffe27a', '#f4b632', '#b87e18', '#fff6c8'],
  ['#ffe0f6', '#c0a8ff', '#78c8ff', '#ffffff'],
];
const GRASS: Tone4 = ['#a8ec7a', '#7cd05a', '#58a842', '#3e8030'];
const STONE_TOP: Tone4 = ['#8e94a4', '#6e7484', '#525868', '#3e4450'];

function hsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hex2(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const k = (n: number): string => {
    const q = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return '#' + k(0) + k(8) + k(4);
}
const tones5 = (h: number, s: number): Tone5 => [
  hex2(h, s * 0.7, 0.93),
  hex2(h, s, 0.76),
  hex2(h, s, 0.6),
  hex2(h, s * 0.95, 0.44),
  hex2(h, s * 0.9, 0.26),
];
const rotP = (pts: readonly Pt[], cx: number, cy: number, deg: number): Pt[] => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

const G = (sil: Pt[], faces: [Pt[], string][], o: Partial<Group> = {}): Group => ({
  sil,
  faces,
  base: o.base ?? faces[0]![1],
  lines: o.lines ?? [],
  dots: o.dots ?? [],
  w: o.w ?? 2.6,
});

/** A crown of faces lit from the top-left around a table (like a cut gem). */
function cutFaces(
  o: readonly Pt[],
  cx: number,
  cy: number,
  k: number,
  p: readonly string[],
): [Pt[], string][] {
  const inner = o.map(([a, b]) => [cx + (a - cx) * k, cy + (b - cy) * k] as Pt);
  const faces = o.map((pt, i): [Pt[], string] => {
    const n = (i + 1) % o.length;
    const mx = (pt[0] + o[n]![0]) / 2 - cx;
    const my = (pt[1] + o[n]![1]) / 2 - cy;
    const d = (-mx - my) / Math.hypot(mx, my) / Math.SQRT2;
    const tone = d > 0.45 ? p[0]! : d > -0.1 ? p[1]! : d > -0.6 ? p[2]! : p[3]!;
    return [[pt, o[n]!, inner[n]!, inner[i]!], tone];
  });
  return [...faces, [inner, p[1]!]];
}

function gemGroup(gem: GemArt, x: number, y: number, r: number, rot = 0): Group {
  let o = shapePoints(gem.shape, x, y, r);
  if (rot) o = rotP(o, x, y, rot);
  return G(o, cutFaces(o, x, y, gem.shape === 'star' ? 0.55 : 0.58, gem.colors), {
    base: gem.colors[2],
    w: Math.max(1.8, r * 0.12),
    lines: [
      {
        a: [x - r * 0.45, y - r * 0.1],
        b: [x - r * 0.1, y - r * 0.45],
        c: '#ffffff',
        w: Math.max(1.2, r * 0.14),
        o: 0.9,
      },
    ],
  });
}

/** A crystal: hexagonal prism with a cap; light, mid and dark faces, a glint, specks. */
function xtalGroup(x: number, y: number, h: number, w: number, tilt: number, T: Tone5): Group {
  const sh = y - h + w * 1.25;
  const cl = x - w * 0.36;
  const cr = x + w * 0.36;
  const cs = sh + w * 0.42;
  const tip: Pt = [x, y - h];
  const L0: Pt = [x - w, y];
  const L1: Pt = [x - w, sh];
  const R1: Pt = [x + w, sh];
  const R0: Pt = [x + w, y];
  const R = (pts: readonly Pt[]): Pt[] => rotP(pts, x, y, tilt);
  const d = w * 0.3;
  const gy = cs + Math.min(h * 0.14, w * 1.1);
  const faces = (
    [
      [[L0, L1, [cl, cs], [cl, y]], T[1]],
      [
        [
          [cl, y],
          [cl, cs],
          [cr, cs],
          [cr, y],
        ],
        T[2],
      ],
      [[[cr, y], [cr, cs], R1, R0], T[3]],
      [[L1, tip, [cl, cs]], T[0]],
      [[[cl, cs], tip, [cr, cs]], T[1]],
      [[[cr, cs], tip, R1], T[2]],
      [[[x - w, y - h * 0.18], [cl, y - h * 0.18], [cl, y], L0], T[2]],
      [
        [
          [cl, y - h * 0.18],
          [cr, y - h * 0.22],
          [cr, y],
          [cl, y],
        ],
        T[3],
      ],
      [[[cr, y - h * 0.22], [x + w, y - h * 0.24], R0, [cr, y]], T[4]],
      [
        [
          [x, gy - d * 1.7],
          [x + d, gy],
          [x, gy + d * 1.7],
          [x - d, gy],
        ],
        T[0],
      ],
    ] as [Pt[], string][]
  ).map(([p, c]): [Pt[], string] => [R(p), c]);
  const rr = rnd(Math.round(x * 7 + h * 3));
  const dots: Dot[] = [];
  for (let i = 0; i < Math.round(h / 10); i++) {
    const p = R([
      [x - w * 0.75 + rr() * w * 1.3, gy + 5 + rr() * Math.max(2, y - gy - h * 0.3)],
    ])[0]!;
    dots.push({ x: p[0], y: p[1], r: 0.5 + rr() * 0.6, c: '#ffffff', o: 0.8 });
  }
  const gl = R([
    [x - w * 0.7, y - h * 0.3],
    [x - w * 0.7, sh + 1.5],
  ]);
  return G(R([L0, L1, tip, R1, R0]), faces, {
    base: T[2],
    lines: [{ a: gl[0]!, b: gl[1]!, c: '#ffffff', w: Math.max(1.3, w * 0.16), o: 0.95 }],
    dots,
    w: 2.8,
  });
}

function lumpGroup(
  x: number,
  y: number,
  rx: number,
  ry: number,
  seed: number,
  T: readonly string[],
): Group {
  const o = jitterPoly(x, y, rx, ry, 7, seed, 0.16);
  return G(o, cutFaces(o, x - 2, y - 2, 0.45, T), { base: T[2], w: 2.4 });
}

/** The hexagonal ground on its rising metal plinth: taller and a richer metal every stage. */
function groundGroups(top: Tone4, stage: number): Group[] {
  const m = METALS[stage]!;
  const dp = 8 + stage * 2.5;
  const T: Pt[] = [
    [90, 80],
    [70, 90.4],
    [30, 90.4],
    [10, 80],
    [30, 69.6],
    [70, 69.6],
  ];
  const side = (a: Pt, b: Pt, c: string): [Pt[], string] => [
    [a, b, [b[0], b[1] + dp], [a[0], a[1] + dp]],
    c,
  ];
  const sides = G(
    [
      [10, 80],
      [30, 90.4],
      [70, 90.4],
      [90, 80],
      [90, 80 + dp],
      [70, 90.4 + dp],
      [30, 90.4 + dp],
      [10, 80 + dp],
    ],
    [
      side([10, 80], [30, 90.4], m[0]),
      side([30, 90.4], [70, 90.4], m[1]),
      side([70, 90.4], [90, 80], m[2]),
    ],
    {
      base: m[2],
      w: 2.4,
      lines: stage
        ? [
            { a: [12, 80 + dp * 0.5], b: [30, 90.4 + dp * 0.5], c: m[3], w: 1.4, o: 0.8 },
            { a: [30, 90.4 + dp * 0.5], b: [70, 90.4 + dp * 0.5], c: m[3], w: 1.4, o: 0.8 },
            { a: [70, 90.4 + dp * 0.5], b: [88, 80 + dp * 0.5], c: m[3], w: 1.4, o: 0.8 },
          ]
        : [],
    },
  );
  const tn = [top[1], top[2], top[2], top[1], top[0], top[0]];
  const topG = G(
    T,
    T.map((pt, i): [Pt[], string] => [[pt, T[(i + 1) % 6]!, [50, 80]], tn[i]!]),
    { base: top[2], w: 2.4 },
  );
  return [sides, topG];
}

/** Places an object (drawn in a 100 box standing at y = 94) on the hex centre at scale s. */
function place(groups: Group[], s: number): Group[] {
  const tx = (p: Pt): Pt => [50 - 50 * s + p[0] * s, 82 - 94 * s + p[1] * s];
  return groups.map((g) => ({
    ...g,
    sil: g.sil.map(tx),
    faces: g.faces.map(([p, c]): [Pt[], string] => [p.map(tx), c]),
    lines: g.lines.map((l) => ({ ...l, a: tx(l.a), b: tx(l.b), w: l.w * s })),
    dots: g.dots.map((d) => {
      const [x, y] = tx([d.x, d.y]);
      return { ...d, x, y, r: d.r * s };
    }),
    w: g.w * Math.max(0.8, s),
  }));
}

const twinkle = (x: number, y: number, r: number): string =>
  `<path class="bi-art-tw" d="M${f(x)} ${f(y - r)} L${f(x + r * 0.28)} ${f(y - r * 0.28)} L${f(x + r)} ${f(y)} L${f(x + r * 0.28)} ${f(y + r * 0.28)} L${f(x)} ${f(y + r)} L${f(x - r * 0.28)} ${f(y + r * 0.28)} L${f(x - r)} ${f(y)} L${f(x - r * 0.28)} ${f(y - r * 0.28)}Z" fill="#fff"/>`;

// ---- the crystal mine ----

/** Crystal palettes per mine gem shape (approved); other gems derive one from the gem's hue. */
const MPAL: Record<string, { a: Tone5; b: Tone5; c: Tone5 }> = {
  square: { a: tones5(26, 0.9), b: tones5(352, 0.72), c: tones5(44, 0.9) },
  hexagon: { a: tones5(214, 0.3), b: tones5(232, 0.42), c: tones5(190, 0.38) },
  drop: { a: tones5(192, 0.72), b: tones5(262, 0.6), c: tones5(160, 0.62) },
};
const mpalFor = (gem: GemArt): { a: Tone5; b: Tone5; c: Tone5 } => {
  const known = MPAL[gem.shape];
  if (known) return known;
  const [h, s] = hsl(gem.colors[1]);
  return { a: tones5(h, s), b: tones5(h - 20, s * 0.8), c: tones5(h + 20, s) };
};
/** x, baseY, height, half-width, tilt, palette. The centre crystal is chunky so the others lean in. */
const XS: readonly (readonly [number, number, number, number, number, 'a' | 'b' | 'c'])[][] = [
  [
    [60, 91, 20, 6.5, 22, 'b'],
    [47, 91, 32, 10, -4, 'a'],
  ],
  [
    [33, 91, 24, 7, -26, 'b'],
    [67, 91, 26, 7, 24, 'b'],
    [50, 90, 44, 13, 0, 'a'],
  ],
  [
    [30, 91, 32, 8, -26, 'b'],
    [70, 91, 34, 8, 24, 'b'],
    [50, 90, 54, 15, 0, 'a'],
    [50, 95, 20, 7, 0, 'c'],
  ],
  [
    [20, 92, 24, 7, -48, 'b'],
    [80, 92, 24, 7, 46, 'b'],
    [32, 91, 40, 9, -22, 'b'],
    [68, 91, 42, 9, 20, 'b'],
    [50, 90, 62, 16, 0, 'a'],
    [50, 95, 24, 8, 0, 'c'],
  ],
  [
    [18, 92, 28, 7.5, -50, 'b'],
    [82, 92, 28, 7.5, 48, 'b'],
    [32, 91, 48, 10, -22, 'b'],
    [68, 91, 50, 10, 20, 'b'],
    [50, 90, 74, 18, 0, 'a'],
    [40, 95, 22, 7, -14, 'c'],
    [60, 95, 24, 7.5, 12, 'c'],
  ],
];
const LUMPS: readonly (readonly number[])[][] = [
  [
    [42, 92, 9, 5.5],
    [58, 93, 8, 5],
  ],
  [
    [34, 92, 10, 6],
    [52, 93, 11, 6.5],
    [67, 92, 9, 5.5],
  ],
  [
    [28, 92, 11, 6.5],
    [45, 94, 12, 7],
    [62, 93, 11, 6.5, 1],
    [75, 92, 8, 5],
  ],
  [
    [22, 92, 11, 6.5],
    [37, 94, 12, 7.5],
    [53, 94, 13, 7.5],
    [68, 93, 11, 7, 1],
    [81, 92, 8, 5],
  ],
  [
    [18, 92, 11, 6.5],
    [33, 94, 13, 8],
    [50, 95, 13, 7.5],
    [66, 94, 13, 8, 1],
    [82, 92, 10, 6],
  ],
];

interface Model {
  groups: Group[];
  post: string;
}

function mineModel(gem: GemArt, s: number): Model {
  const pal = mpalFor(gem);
  const R = [pal.b[2], pal.b[3], pal.b[4], hex2(hsl(pal.b[4])[0], 0.4, 0.14)];
  const Q = [pal.b[0], pal.b[0], pal.b[1], pal.b[2]];
  const obj = [
    ...XS[s]!.map(([x, y, h, w, t, k]) => xtalGroup(x, y, h, w, t, pal[k])),
    ...LUMPS[s]!.map(([x, y, rx, ry, q], i) =>
      lumpGroup(x!, y!, rx!, ry!, 17 + i * 5 + s, q ? Q : R),
    ),
  ];
  const sc = [0.9, 0.95, 1, 1, 1][s]!;
  return {
    groups: [...groundGroups(STONE_TOP, s), ...place(obj, sc)],
    post:
      s === 4
        ? twinkle(86, 10, 6) + twinkle(12, 26, 5) + twinkle(70, 0, 4)
        : s === 3
          ? twinkle(84, 18, 5)
          : '',
  };
}

// ---- the tree (the in-game tree grown per stage) ----

/** Leaves from the gem: the gem's hue, a little richer so it reads as foliage. */
function gemLeaf(gem: GemArt): Tone4 {
  const [h, s] = hsl(gem.colors[1]);
  const S = Math.min(0.62, Math.max(0.35, s * 1.15));
  return [hex2(h, S, 0.64), hex2(h, S, 0.51), hex2(h, S * 0.95, 0.4), hex2(h, S * 0.9, 0.29)];
}

function treeModel(bark: readonly string[], gem: GemArt, s: number): Model {
  const B = bark;
  const L = gemLeaf(gem);
  const canopy = (o: Pt[], cx: number, cy: number, k: number): Group =>
    G(o, cutFaces(o, cx, cy, k, L), { base: L[2], w: 2.4 });
  const groups: Group[] = [];
  if (s === 0) {
    groups.push(
      G(
        [
          [48, 94],
          [47, 80],
          [49, 66],
          [53, 66],
          [52, 80],
          [53, 94],
        ],
        [
          [
            [
              [48, 94],
              [47, 80],
              [49, 66],
              [51, 66],
              [51, 94],
            ],
            B[0]!,
          ],
          [
            [
              [51, 94],
              [51, 66],
              [53, 66],
              [52, 80],
              [53, 94],
            ],
            B[2]!,
          ],
        ],
        { base: B[1]!, w: 2.2 },
      ),
    );
    groups.push(
      canopy(jitterPoly(40, 64, 11, 7, 6, 2), 38, 62, 0.4),
      canopy(jitterPoly(62, 58, 12, 8, 6, 5), 60, 56, 0.4),
    );
    groups.push(gemGroup(gem, 51, 63, 6));
  } else {
    const trunk: Pt[] = [
      [34, 94],
      [44, 84],
      [48, 70],
      [50, 58],
      [56, 44],
      [66, 46],
      [60, 58],
      [58, 70],
      [60, 84],
      [70, 94],
    ];
    groups.push(
      G(
        trunk,
        [
          [
            [
              [34, 94],
              [44, 84],
              [48, 70],
              [50, 58],
              [56, 44],
              [61, 45],
              [55, 60],
              [53, 72],
              [52, 94],
            ],
            B[0]!,
          ],
          [
            [
              [52, 94],
              [53, 72],
              [55, 60],
              [61, 45],
              [66, 46],
              [60, 58],
              [58, 70],
              [60, 84],
              [70, 94],
            ],
            B[2]!,
          ],
        ],
        { base: B[2]! },
      ),
    );
    const branch = (p: Pt[]): Group => G(p, [[p, B[1]!]], { base: B[2]!, w: 2 });
    if (s >= 2)
      groups.push(
        branch([
          [48, 66],
          [30, 56],
          [28, 60],
          [47, 70],
        ]),
      );
    if (s >= 3)
      groups.push(
        branch([
          [58, 62],
          [76, 54],
          [78, 58],
          [59, 66],
        ]),
      );
    if (s >= 2) groups.push(canopy(jitterPoly(24, 55, 14, 10, 7, 3), 22, 53, 0.45));
    if (s >= 3) groups.push(canopy(jitterPoly(80, 52, 14, 10, 7, 9), 78, 50, 0.45));
    const big = s === 1 ? jitterPoly(56, 32, 26, 20, 9, 7) : jitterPoly(60, 30, 32, 23, 10, 7);
    groups.push(canopy(big, s === 1 ? 52 : 56, s === 1 ? 28 : 26, 0.5));
    const spots = (
      [
        [],
        [
          [46, 46, 7.5],
          [64, 42, 7.5],
        ],
        [
          [40, 62, 9.5],
          [70, 60, 10],
          [87, 48, 7.5],
          [20, 72, 6.5],
        ],
        [
          [40, 62, 9.5],
          [66, 58, 10],
          [84, 66, 7.5],
          [20, 70, 7],
          [52, 40, 7.5],
        ],
        [
          [40, 62, 10],
          [66, 58, 10.5],
          [84, 66, 8],
          [20, 70, 7.5],
          [36, 34, 7.5],
          [74, 30, 8],
        ],
      ] as (readonly [number, number, number])[][]
    )[s]!;
    spots.forEach(([x, y, r]) => groups.push(gemGroup(gem, x, y, r)));
  }
  const sc = [0.7, 0.74, 0.78, 0.84, 0.88][s]!;
  return {
    groups: [...groundGroups(GRASS, s), ...place(groups, sc)],
    post:
      s === 4
        ? twinkle(56, 6, 5) + twinkle(86, 8, 6) + twinkle(14, 18, 5) + twinkle(80, 50, 4)
        : s === 3
          ? twinkle(84, 14, 5)
          : '',
  };
}

let clipN = 0;
function svgGroup(g: Group): string {
  const id = `bi-tile-${clipN++}`;
  const P = (pts: readonly Pt[]): string =>
    'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + 'Z';
  const faces = g.faces
    .map(
      ([p, c]) =>
        `<path d="${P(p)}" fill="${c}" stroke="${c}" stroke-width=".7" stroke-linejoin="round"/>`,
    )
    .join('');
  const lines = g.lines
    .map(
      (l) =>
        `<path d="M${f(l.a[0])} ${f(l.a[1])} L${f(l.b[0])} ${f(l.b[1])}" stroke="${l.c}" stroke-width="${f(l.w)}" stroke-linecap="round" opacity="${l.o ?? 0.9}"/>`,
    )
    .join('');
  const dots = g.dots
    .map(
      (d) =>
        `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(d.r)}" fill="${d.c}" opacity="${d.o ?? 0.8}"/>`,
    )
    .join('');
  return `<clipPath id="${id}"><path d="${P(g.sil)}"/></clipPath><g clip-path="url(#${id})"><rect x="-20" y="-20" width="160" height="160" fill="${g.base}"/>${faces}${lines}${dots}</g><path d="${P(g.sil)}" fill="none" stroke="${INK}" stroke-width="${f(g.w)}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
const render = (m: Model): string => m.groups.map(svgGroup).join('') + m.post;

/** The tree tile at a growth stage 0..4 (the pixel source). */
export const treeVector = (bark: readonly string[], gem: GemArt, stage: number): string =>
  render(treeModel(bark, gem, stage));
/** The crystal mine tile at a growth stage 0..4 (the pixel source). */
export const mineVector = (gem: GemArt, stage: number): string => render(mineModel(gem, stage));
