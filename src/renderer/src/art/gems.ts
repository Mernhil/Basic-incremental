/**
 * Gem art (DESIGN.md 13, "Resources are carved gems"): carved shape gems, the notched coin with a
 * tier-coloured sticker outline, and the faceted tree and mine tiles for the Production page.
 */
import type { GemArt, Tree } from '../../../data';
import {
  INK,
  P,
  circ,
  f,
  facet,
  facetPoly,
  halo,
  ink,
  jitterPoly,
  part,
  rnd,
  shadow,
  twinkle,
  uid,
  type Pt,
  type Tones,
} from './kit';

// ---- gems ----

/** The outline of a gem shape, centred on (x, y). Round uses many facets so it reads as round. */
export function shapePoints(shape: GemArt['shape'], x: number, y: number, r: number): Pt[] {
  const ring = (n: number, k: (i: number) => number = () => 1): Pt[] =>
    Array.from({ length: n }, (_, i) => {
      const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
      return [x + r * k(i) * Math.cos(a), y + r * k(i) * Math.sin(a)] as const;
    });
  switch (shape) {
    case 'round':
      return ring(24);
    case 'pentagon':
      return ring(5);
    case 'star':
      return ring(10, (i) => (i % 2 ? 0.5 : 1));
    case 'square':
      return ring(4);
    case 'hexagon':
      return ring(6);
    case 'drop':
      return ring(12, (i) => (i === 0 ? 1.4 : i === 1 || i === 11 ? 1.02 : 0.95)).map(
        ([a, b]) => [a, b + r * 0.14] as const,
      );
  }
}

/** The carving inside a gem: tree grain, rings or swirls, or glowing veins for mine gems. */
function carving(kind: GemArt['pattern'], x: number, y: number, r: number, col: string): string {
  const s = (d: string, w = 1.6): string =>
    `<path d="${d}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity=".9"/>`;
  switch (kind) {
    case 'grain':
      return [-0.4, -0.15, 0.12, 0.38]
        .map((k, i) =>
          s(
            `M${f(x + k * r)} ${f(y - r * 1.2)} C${f(x + (k + 0.14) * r)} ${f(y - r * 0.5)} ${f(x + (k - 0.14) * r)} ${f(y + r * 0.2)} ${f(x + (k + 0.06) * r)} ${f(y + r * 1.2)}`,
            i % 2 ? 1.3 : 2,
          ),
        )
        .join('');
    case 'rings':
      return (
        s(circ(x, y, r * 0.38), 1.8) +
        s(circ(x, y, r * 0.17), 1.4) +
        [-0.5, 0.5]
          .map((k) =>
            s(
              `M${f(x + k * r)} ${f(y - r)} C${f(x + k * r * 0.8)} ${f(y - r * 0.3)} ${f(x + k * r * 1.1)} ${f(y + r * 0.3)} ${f(x + k * r * 0.8)} ${f(y + r)}`,
              1.4,
            ),
          )
          .join('')
      );
    case 'swirl':
      return (
        s(
          `M${f(x - r * 0.5)} ${f(y - r * 0.6)} C${f(x + r * 0.6)} ${f(y - r * 0.7)} ${f(x + r * 0.5)} ${f(y + r * 0.1)} ${f(x)} ${f(y)} C${f(x - r * 0.3)} ${f(y - r * 0.1)} ${f(x - r * 0.2)} ${f(y - r * 0.35)} ${f(x + r * 0.05)} ${f(y - r * 0.3)}`,
          1.8,
        ) +
        s(
          `M${f(x + r * 0.4)} ${f(y + r * 0.7)} C${f(x - r * 0.5)} ${f(y + r * 0.8)} ${f(x - r * 0.4)} ${f(y + r * 0.2)} ${f(x - r * 0.1)} ${f(y + r * 0.3)}`,
          1.5,
        )
      );
    case 'veins':
      return `<g class="bi-art-glow">${s(
        `M${f(x)} ${f(y - r * 1.1)} L${f(x - r * 0.15)} ${f(y - r * 0.4)} L${f(x + r * 0.2)} ${f(y + r * 0.1)} L${f(x - r * 0.1)} ${f(y + r * 1.1)} M${f(x - r * 0.15)} ${f(y - r * 0.4)} L${f(x - r * 0.45)} ${f(y - r * 0.1)} M${f(x + r * 0.2)} ${f(y + r * 0.1)} L${f(x + r * 0.45)} ${f(y + r * 0.3)}`,
        2.2,
      )}</g>`;
  }
}

/** A faceted, carved gem: a crown of faces lit from the top-left, a table with the carving. */
export function carvedGem(
  gem: GemArt,
  x: number,
  y: number,
  r: number,
  colors: Tones = gem.colors,
): string {
  const p = colors;
  const o = shapePoints(gem.shape, x, y, r);
  const k = gem.shape === 'star' ? 0.55 : 0.58;
  const inner = o.map(([a, b]) => [x + (a - x) * k, y + (b - y) * k] as const);
  const faces = o.map((pt, i) => {
    const n = (i + 1) % o.length;
    const mx = (pt[0] + o[n]![0]) / 2 - x;
    const my = (pt[1] + o[n]![1]) / 2 - y;
    const d = (-mx - my) / Math.hypot(mx, my) / Math.SQRT2;
    const tone = d > 0.45 ? p[0] : d > -0.1 ? p[1] : d > -0.6 ? p[2] : p[3];
    return `<path d="${P([pt, o[n]!, inner[n]!, inner[i]!])}" fill="${tone}" stroke="${tone}" stroke-width=".6"/>`;
  });
  const sil = P(o);
  const table = P(inner);
  const id = uid();
  const tid = uid();
  return (
    `<clipPath id="${id}"><path d="${sil}"/></clipPath><g clip-path="url(#${id})"><rect x="-20" y="-20" width="160" height="160" fill="${p[2]}"/>${faces.join('')}` +
    `<path d="${table}" fill="${p[1]}"/><clipPath id="${tid}"><path d="${table}"/></clipPath><g clip-path="url(#${tid})">` +
    `<path d="M${f(x - r)} ${f(y - r * 0.1)} L${f(x + r * 0.1)} ${f(y - r)} L${f(x + r * 0.5)} ${f(y - r)} L${f(x - r)} ${f(y + r * 0.5)}Z" fill="${p[0]}" opacity=".5"/>${carving(gem.pattern, x, y, r * 0.55, p[3])}</g>` +
    `<path d="${table}" fill="none" stroke="${p[0]}" stroke-width="1.2" opacity=".8"/></g><path d="${sil}" fill="none" ${ink(Math.max(1.6, r * 0.1))}/>` +
    twinkle(x - r * 0.3, y - r * 0.32, r * 0.34, 0.2)
  );
}

// ---- coins ----

/** Coin metals, lowest tier first (DESIGN.md 13: stone, bronze, silver, gold, prismatic). */
export const METALS = {
  stone: ['#a2a8b2', '#7c828c', '#585e68', '#ccd0d8'],
  bronze: ['#e6a464', '#bc7838', '#80491c', '#ffd6a0'],
  silver: ['#eef2f8', '#b8c0cc', '#848e9c', '#ffffff'],
  gold: ['#ffe27a', '#f4b632', '#b87e18', '#fff6c8'],
  prism: ['#ffe0f6', '#c0a8ff', '#78c8ff', '#ffffff'],
} as const satisfies Record<string, Tones>;
export type Metal = keyof typeof METALS;

/** Sticker outline colour per metal. */
export const OUTLINE: Record<Metal | 'white', string> = {
  white: '#ffffff',
  stone: '#b8bec8',
  bronze: '#e6a464',
  silver: '#eef2f8',
  gold: '#ffd84a',
  prism: '#ffc8f4',
};

/** Resource tier 1, 2, 3, ... -> coin metal. */
export function metalForTier(tier: number): Metal {
  const order: Metal[] = ['bronze', 'silver', 'gold', 'prism'];
  return order[Math.min(order.length, Math.max(1, tier)) - 1]!;
}

const GREY: Tones = ['#d4d8e0', '#a4aab6', '#747a86', '#4a4f5a'];

function bezel(x: number, y: number, r: number, m: Tones): string {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `M${f(x + r * 0.8 * Math.cos(a))} ${f(y + r * 0.8 * Math.sin(a))} L${f(x + r * Math.cos(a))} ${f(y + r * Math.sin(a))}`;
  }).join(' ');
  const well: Tones = [m[2], m[2], m[3] === '#ffffff' ? '#5a6270' : '#3a3030', m[1]];
  return (
    part(
      circ(x, y, r),
      m,
      `M${f(x - r * 0.8)} ${f(y - r * 0.45)} A${f(r * 0.95)} ${f(r * 0.95)} 0 0 1 ${f(x)} ${f(y - r * 0.95)}`,
      2.6,
    ) +
    `<path d="${ticks}" stroke="${m[2]}" stroke-width="1.6"/>` +
    part(circ(x, y, r * 0.78), well, '', 2.2)
  );
}

function padlock(x: number, y: number): string {
  const shackle = `M${x - 4} ${y - 2} L${x - 4} ${y - 6} C${x - 4} ${y - 11} ${x + 4} ${y - 11} ${x + 4} ${y - 6} L${x + 4} ${y - 2}`;
  return (
    `<path d="${shackle}" stroke="${INK}" stroke-width="4" fill="none"/><path d="${shackle}" stroke="#c8ccd4" stroke-width="2" fill="none"/>` +
    part(
      `M${x - 7} ${y - 3} L${x + 7} ${y - 3} L${x + 7} ${y + 7} L${x - 7} ${y + 7}Z`,
      METALS.gold,
      '',
      1.8,
    )
  );
}

/**
 * Wraps markup in a sticker outline (white or a metal colour) with a drop shadow. Twinkles are
 * moved outside the outline so they don't turn into blobs.
 */
export function sticker(inner: string, outline: Metal | 'white' = 'white'): string {
  const tw = inner.match(/<path class="bi-art-tw"[^>]*\/>/g) ?? [];
  const body = inner.replace(/<path class="bi-art-tw"[^>]*\/>/g, '');
  return `<g filter="url(#bi-art-stk-${outline})">${body}</g>${tw.join('')}`;
}

/** The resource icon: the carved gem in a notched coin; coin metal and outline show the tier. */
export function gemCoin(gem: GemArt, tier: number, locked = false): string {
  const metal: Metal = locked ? 'stone' : metalForTier(tier);
  const coin =
    bezel(50, 50, 42, METALS[metal]) + carvedGem(gem, 50, 50, 25, locked ? GREY : gem.colors);
  return sticker(coin, metal) + (locked ? padlock(78, 82) : '');
}

// ---- production tiles ----

const GRASS: Tones = ['#a8ec7a', '#7cd05a', '#58a842', '#3e8030'];
const STONE_TOP: Tones = ['#8e94a4', '#6e7484', '#525868', '#3e4450'];
const ROCK: Tones = ['#5e6472', '#454a57', '#30343f', '#22252e'];

/** A hexagonal ground tile cut into facets, grass or stone on top. */
function groundTile(top: Tones): string {
  const T: Pt[] = [
    [90, 80],
    [70, 90.4],
    [30, 90.4],
    [10, 80],
    [30, 69.6],
    [70, 69.6],
  ];
  const sides = facet(
    P([
      [10, 80],
      [30, 90.4],
      [70, 90.4],
      [90, 80],
      [90, 88],
      [70, 98.4],
      [30, 98.4],
      [10, 88],
    ]),
    [
      [
        [
          [10, 80],
          [30, 90.4],
          [30, 98.4],
          [10, 88],
        ],
        '#7a6a8a',
      ],
      [
        [
          [30, 90.4],
          [70, 90.4],
          [70, 98.4],
          [30, 98.4],
        ],
        '#5c4e6e',
      ],
      [
        [
          [70, 90.4],
          [90, 80],
          [90, 88],
          [70, 98.4],
        ],
        '#40364e',
      ],
    ],
    '#40364e',
    2.4,
  );
  const tones = [top[1], top[2], top[2], top[1], top[0], top[0]];
  const faces = T.map((pt, i) => [[pt, T[(i + 1) % 6]!, [50, 80]], tones[i]!] as const);
  return sides + facet(P(T), faces, top[2], 2.4);
}

/** Puts a 100-box drawing standing on the ground tile. */
const onGround = (obj: string, s = 0.78): string =>
  `<g transform="translate(${f(50 - 50 * s)} ${f(82 - 94 * s)}) scale(${s})">${obj}</g>`;

/** A gem hanging from a branch on a short stem, with a light rim so its outline reads. */
function hanging(gem: GemArt, x: number, y: number, r: number, delay: number): string {
  return (
    `<path d="M${x} ${f(y - r - 6)} L${x} ${f(y - r + 1)}" stroke="${INK}" stroke-width="1.6"/>` +
    halo(x, y, r * 1.6, gem.colors[1], delay) +
    carvedGem(gem, x, y, r) +
    `<path d="${P(shapePoints(gem.shape, x, y, r * 0.86))}" fill="none" stroke="#fff" stroke-width="1" opacity=".55"/>`
  );
}

/** A faceted tree themed to its gem, hanging its gems, on a grass tile. */
export function treeTile(tree: Pick<Tree, 'art'>, gem: GemArt): string {
  const L = tree.art.leaf;
  const B = tree.art.bark;
  const trunk = facet(
    P([
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
    ]),
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
        B[0],
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
        B[2],
      ],
    ],
    B[2],
  );
  const branch = facet(
    P([
      [48, 66],
      [30, 56],
      [28, 60],
      [47, 70],
    ]),
    [
      [
        [
          [48, 66],
          [30, 56],
          [28, 60],
          [47, 70],
        ],
        B[1],
      ],
    ],
    B[2],
    2,
  );
  const canopy =
    facetPoly(jitterPoly(24, 55, 14, 10, 7, 3), 22, 53, 0.45, L) +
    facetPoly(jitterPoly(60, 30, 32, 23, 10, 7), 56, 26, 0.5, L);
  const gems =
    hanging(gem, 40, 62, 9.5, 0) +
    hanging(gem, 70, 60, 10, 0.6) +
    hanging(gem, 87, 48, 7.5, 1.2) +
    hanging(gem, 20, 72, 6.5, 0.3);
  const scene =
    groundTile(GRASS) +
    onGround(`${shadow(50, 93, 26)}${trunk}${branch}<g class="bi-art-sway">${canopy}${gems}</g>`);
  return sticker(scene);
}

/** A bevelled rock block: top, left and right faces. */
function rock(cx: number, cy: number, w: number, h: number, seed: number): string {
  const r = rnd(seed);
  const j = (v: number): number => v + (r() - 0.5) * w * 0.12;
  const tl: Pt = [j(cx - w * 0.45), j(cy - h * 0.45)];
  const tr: Pt = [j(cx + w * 0.32), j(cy - h * 0.58)];
  const fr: Pt = [j(cx + w * 0.5), j(cy - h * 0.18)];
  const fl: Pt = [j(cx - w * 0.22), j(cy - h * 0.08)];
  const bl: Pt = [j(cx - w * 0.5), cy + h * 0.38];
  const bm: Pt = [j(cx - w * 0.08), cy + h * 0.5];
  const br: Pt = [j(cx + w * 0.46), cy + h * 0.42];
  return (
    facet(
      P([tl, tr, fr, br, bm, bl]),
      [
        [[tl, tr, fr, fl], ROCK[0]],
        [[tl, fl, bm, bl], ROCK[1]],
        [[fl, fr, br, bm], ROCK[2]],
      ],
      ROCK[2],
      2.4,
    ) +
    `<path d="M${f(tl[0] + 2)} ${f(tl[1] + 1.5)} L${f(tr[0] - 2)} ${f(tr[1] + 1.5)}" stroke="#fff" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>`
  );
}

/** A mine: dark rock blocks with its carved gems set into them, on a stone tile. */
export function mineTile(gem: GemArt): string {
  const g = (x: number, y: number, r: number, rot: number): string =>
    `<g transform="rotate(${rot} ${x} ${y})">${carvedGem(gem, x, y, r)}</g>`;
  const obj =
    shadow(50, 92, 40) +
    halo(50, 60, 30, gem.colors[1]) +
    rock(30, 66, 44, 40, 61) +
    rock(72, 70, 34, 32, 63) +
    g(30, 54, 12, -14) +
    g(72, 58, 10, 18) +
    g(52, 70, 15, 4) +
    rock(26, 86, 28, 14, 65) +
    rock(76, 86, 26, 12, 67) +
    g(18, 80, 7, -30) +
    g(84, 80, 6.5, 24) +
    twinkle(78, 28, 6, 0.3);
  return sticker(groundTile(STONE_TOP) + onGround(obj, 0.8));
}

// ---- shared defs ----

/** Wraps art markup in an <svg> sized by CSS. */
export function svg(inner: string, viewBox = '-6 -6 112 112'): string {
  return `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${inner}</svg>`;
}
