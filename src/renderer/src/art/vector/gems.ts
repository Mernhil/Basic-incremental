/**
 * The approved small pixel assets as vector sources (DESIGN.md §12, Pixel Art Round 2): gem coins
 * (48 x 48), mastery medals (48 x 48), navigation plaques (64 x 64) and the forged-edge ladder.
 * Drawn with Brave Frontier ramps: five tones per material, shadows leaning purple and highlights
 * leaning yellow-white, gold trim with a bright top edge, small gems with a white glint.
 */
import type { GemArt, Rarity } from '../../../../data';
import { INK, f, type Pt } from '../kit';
import { ITEM_VIEWBOX, itemVector } from './items';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export function hsl2hex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp01(s);
  l = clamp01(l);
  const a = s * Math.min(l, 1 - l);
  const k = (n: number): string => {
    const q = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1))) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return '#' + k(0) + k(8) + k(4);
}
const toward = (h: number, t: number, a: number): number => h + (((t - h + 540) % 360) - 180) * a;
export type Ramp = readonly [string, string, string, string, string];
/** Five tones, light to dark: highlights lean yellow, shadows lean purple (the Brave Frontier ramp). */
export function ramp(h: number, s: number, l: number): Ramp {
  return [
    hsl2hex(toward(h, 55, 0.35), s * 0.7, Math.min(0.95, l + 0.3)),
    hsl2hex(toward(h, 55, 0.15), s * 0.9, l + 0.15),
    hsl2hex(h, s, l),
    hsl2hex(toward(h, 265, 0.18), s * 1.05, l - 0.14),
    hsl2hex(toward(h, 265, 0.32), s * 1.1, Math.max(0.06, l - 0.27)),
  ];
}
export const GOLD = ramp(44, 0.9, 0.55);

/** Collects the gradient defs one drawing needs; ids are unique per document. */
export class Defs {
  private list: string[] = [];
  private static n = 0;
  /** A radial ramp lit from (cx, cy): snaps to the ramp's five tones once baked. */
  shade(R: Ramp, cx = 0.34, cy = 0.28, r = 1.15): string {
    const id = `bi-rg-${Defs.n++}`;
    this.list.push(
      `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${R[0]}"/><stop offset=".2" stop-color="${R[1]}"/><stop offset=".48" stop-color="${R[2]}"/><stop offset=".76" stop-color="${R[3]}"/><stop offset="1" stop-color="${R[4]}"/></radialGradient>`,
    );
    return `url(#${id})`;
  }
  wrap(body: string): string {
    return `<defs>${this.list.join('')}</defs>${body}`;
  }
}
export const line = (d: string, c: string, w = 1): string =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
export const glint = (x: number, y: number, s = 1): string =>
  `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#ffffff"/>`;

/** Gem outlines (the shape says which gem): round, pentagon, star, square, hexagon, drop. */
export function shapePoints(shape: GemArt['shape'], x: number, y: number, r: number): Pt[] {
  const ringPts = (n: number, k: (i: number) => number = () => 1): Pt[] =>
    Array.from({ length: n }, (_, i) => {
      const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
      return [x + r * k(i) * Math.cos(a), y + r * k(i) * Math.sin(a)] as Pt;
    });
  switch (shape) {
    case 'round':
      return ringPts(24);
    case 'pentagon':
      return ringPts(5);
    case 'star':
      return ringPts(10, (i) => (i % 2 ? 0.5 : 1));
    case 'square':
      return ringPts(4);
    case 'hexagon':
      return ringPts(6);
    case 'drop':
      return ringPts(12, (i) => (i === 0 ? 1.4 : i === 1 || i === 11 ? 1.02 : 0.95)).map(
        ([a, b]) => [a, b + r * 0.14] as Pt,
      );
  }
}

// ---- the metal ladder (DESIGN.md §12) ----

/** Coin, medal, plinth metals, lowest first. */
export const METAL_LADDER = ['stone', 'bronze', 'silver', 'gold', 'prism'] as const;
export type Metal = (typeof METAL_LADDER)[number];
/** Mastery tier 0..4 -> metal (0 stone, 1 bronze, 2 silver, 3 gold, 4+ prismatic). */
export function metalForTier(tier: number): Metal {
  return METAL_LADDER[Math.min(4, Math.max(0, Math.floor(tier)))]!;
}
/** Sticker outline colour per metal (also used by the remaining SVG sticker filters). */
export const OUTLINE: Record<Metal | 'white', string> = {
  white: '#ffffff',
  stone: '#b8bec8',
  bronze: '#e6a464',
  silver: '#eef2f8',
  gold: '#ffd84a',
  prism: '#ffc8f4',
};

// ---- gem coins (48 x 48) ----

export const COIN_METALS = METAL_LADDER;
export type CoinMetal = Metal;
const COIN_METAL: Record<CoinMetal, Ramp> = {
  stone: ramp(220, 0.08, 0.6),
  bronze: ramp(28, 0.62, 0.55),
  silver: ramp(214, 0.18, 0.78),
  gold: ramp(44, 0.9, 0.58),
  prism: ramp(290, 0.6, 0.74),
};
/** The outer sticker ring: the mastery tier's colour. */
export const COIN_RING: Record<CoinMetal, string> = {
  stone: '#b8bec8',
  bronze: '#e6a464',
  silver: '#eef2f8',
  gold: '#ffd84a',
  prism: '#ffc8f4',
};
const PT = (pts: readonly Pt[]): string => pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L');

/** A plain rim with eight notches, a dark well and one big faceted gem with a glint. */
export function coinVector(gem: GemArt, metal: CoinMetal, locked: boolean): string {
  const D = new Defs();
  const M = COIN_METAL[metal];
  const cx = 24;
  const cy = 24;
  let s = `<circle cx="${cx}" cy="${cy}" r="21" fill="${D.shade(M, 0.32, 0.26, 0.95)}" stroke="${M[4]}" stroke-width="1"/>`;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    s += `<rect x="${f(cx + Math.cos(a) * 19 - 1)}" y="${f(cy + Math.sin(a) * 19 - 1)}" width="2" height="2" fill="${M[3]}"/>`;
  }
  s += `<circle cx="${cx}" cy="${cy}" r="15.5" fill="${D.shade(ramp(225, 0.3, 0.16), 0.5, 0.6, 0.9)}" stroke="${M[4]}" stroke-width="1"/>`;
  s += `<path d="M10 17 A15 15 0 0 1 19 9" fill="none" stroke="${M[0]}" stroke-width="1"/>`;
  const cols = locked ? ['#d4d8e0', '#a4aab6', '#747a86', '#4a4f5a'] : gem.colors;
  const big = gem.shape === 'star' ? 13.5 : 12;
  // coins use a 16-sided round so the small gem reads round at 48 px
  const o =
    gem.shape === 'round'
      ? Array.from({ length: 16 }, (_, i) => {
          const a = ((-90 + (i * 360) / 16) * Math.PI) / 180;
          return [cx + big * Math.cos(a), cy + big * Math.sin(a)] as Pt;
        })
      : shapePoints(gem.shape, cx, cy + (gem.shape === 'drop' ? -1 : 0), big);
  const k = gem.shape === 'star' ? 0.5 : 0.55;
  const inner = o.map(([a, b]) => [cx + (a - cx) * k, cy + (b - cy) * k] as Pt);
  o.forEach((pt, i) => {
    const n = o[(i + 1) % o.length]!;
    const mx = (pt[0] + n[0]) / 2 - cx;
    const my = (pt[1] + n[1]) / 2 - cy;
    const dd = (-mx - my) / Math.hypot(mx, my) / Math.SQRT2;
    const tone = dd > 0.45 ? cols[0] : dd > -0.1 ? cols[1] : dd > -0.6 ? cols[2] : cols[3];
    s += `<path d="M${PT([pt, n, inner[(i + 1) % o.length]!, inner[i]!])}Z" fill="${tone}"/>`;
  });
  s += `<path d="M${PT(inner)}Z" fill="${cols[1]}"/><path d="M${PT(inner)}Z" fill="none" stroke="${cols[0]}" stroke-width="1"/>`;
  s +=
    `<path d="M${PT(o)}Z" fill="none" stroke="${INK}" stroke-width="1"/>` +
    glint(cx - 5, cy - 6, 2) +
    glint(cx - 3, cy - 7);
  if (locked)
    s += `<path d="M30 33 L30 30 C30 26 37 26 37 30 L37 33" fill="none" stroke="${INK}" stroke-width="3"/><path d="M30 33 L30 30 C30 26 37 26 37 30 L37 33" fill="none" stroke="#c8ccd4" stroke-width="1"/><rect x="28" y="33" width="11" height="9" fill="${D.shade(GOLD)}" stroke="${GOLD[4]}" stroke-width="1"/>`;
  return D.wrap(s);
}

// ---- mastery medals (48 x 48) ----

const RAIN = ['#ff7ad9', '#ffd36a', '#6effe0', '#8a7bff', '#ff9a5a'];
const MEDAL_METAL: readonly (Ramp | null)[] = [
  ramp(220, 0.08, 0.62),
  ramp(28, 0.62, 0.56),
  ramp(214, 0.2, 0.8),
  ramp(44, 0.9, 0.6),
  null,
];
function mixHex(a: string, b: string, t: number): string {
  const p = (c: string, i: number): number => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map((i) =>
        Math.round(p(a, i) + (p(b, i) - p(a, i)) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
/** The faceted star with a bright ridge on each point and a centre stud (tier 0..4). */
export function medalVector(tier: number): string {
  const cx = 24;
  const cy = 25;
  const M = MEDAL_METAL[tier] ?? null;
  const pts = Array.from({ length: 10 }, (_, k): Pt => {
    const a = ((-90 + k * 36) * Math.PI) / 180;
    const r = k % 2 ? 9 : 21;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  let s = '';
  pts.forEach((p, k) => {
    const q = pts[(k + 1) % 10]!;
    const mx = (p[0] + q[0]) / 2 - cx;
    const my = (p[1] + q[1]) / 2 - cy;
    const lit = (-mx - my) / Math.hypot(mx, my);
    const rc = RAIN[Math.floor(k / 2)]!;
    const col = M
      ? lit > 0.4
        ? M[0]
        : lit > 0
          ? M[1]
          : lit > -0.45
            ? M[2]
            : M[3]
      : lit > 0
        ? rc
        : mixHex(rc, '#4a2a80', 0.3);
    s += `<path d="M${cx} ${cy} L${f(p[0])} ${f(p[1])} L${f(q[0])} ${f(q[1])}Z" fill="${col}" stroke="${col}" stroke-width=".5"/>`;
  });
  for (let k = 0; k < 10; k += 2)
    s += line(`M${cx} ${cy} L${f(pts[k]![0])} ${f(pts[k]![1])}`, M ? M[0] : '#ffffff');
  s += `<path d="M${PT(pts)}Z" fill="none" stroke="${INK}" stroke-width="1"/>`;
  s +=
    tier === 4 || !M
      ? `<path d="M${cx} ${cy - 5} L${cx + 4} ${cy} L${cx} ${cy + 5} L${cx - 4} ${cy}Z" fill="#ffffff" stroke="${INK}" stroke-width="1"/>`
      : `<circle cx="${cx}" cy="${cy}" r="3" fill="${M[3]}" stroke="${M[4]}" stroke-width="1"/>`;
  return s;
}

// ---- navigation plaques (64 x 64) ----

/** Glyphs for the plaques, on a 24-unit grid (the shell's line icons). */
export const NAV_GLYPHS = {
  home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  cards: '<rect x="7" y="4" width="11" height="15" rx="2"/><path d="M5 7v11a2 2 0 0 0 2 2h8"/>',
  production: '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
  dungeons: '<path d="M5 21V10a7 7 0 0 1 14 0v11"/><path d="M9 21v-7a3 3 0 0 1 6 0v7M3 21h18"/>',
  summon:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  skills:
    '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="13" r="2"/><circle cx="18" cy="13" r="2"/><circle cx="12" cy="20" r="2"/><path d="M11 7l-4 4M13 7l4 4M7 15l4 3.5M17 15l-4 3.5"/>',
  wardrobe:
    '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v2l9 7a1 1 0 0 1-.6 1.8H3.6A1 1 0 0 1 3 16l9-7"/>',
  achievements: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>',
  shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
} as const;
export type NavGlyph = keyof typeof NAV_GLYPHS;

/** The bronze hexagonal plaque with gold studs and a dark face; the glyph with shadow and highlight. */
export function plaqueVector(glyph: NavGlyph): string {
  const D = new Defs();
  const BR = ramp(28, 0.62, 0.52);
  const FACE = ramp(228, 0.3, 0.17);
  const g = NAV_GLYPHS[glyph];
  let s = `<path d="M32 2 L60 18 L60 46 L32 62 L4 46 L4 18Z" fill="${D.shade(BR, 0.3, 0.2, 0.95)}" stroke="${BR[4]}" stroke-width="1"/>`;
  s += line('M6 19 L31 4', BR[0]) + line('M58 46 L33 60', BR[4]);
  s += `<path d="M32 8 L54 21 L54 43 L32 56 L10 43 L10 21Z" fill="${D.shade(FACE, 0.5, 0.3, 0.9)}" stroke="${GOLD[3]}" stroke-width="1"/>`;
  for (const [x, y] of [
    [32, 4],
    [57, 19],
    [57, 45],
    [32, 60],
    [7, 45],
    [7, 19],
  ] as const)
    s += `<rect x="${x - 1}" y="${y - 1}" width="2" height="2" fill="${GOLD[0]}"/>`;
  s += `<g transform="translate(17 17) scale(1.25)" fill="none" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(.8 .8)" stroke="#2a1606" stroke-width="2.2">${g}</g><g stroke="#ffd9a0" stroke-width="2.2">${g}</g><g stroke="#fff4dc" stroke-width="1" transform="translate(-.4 -.4)">${g}</g></g>`;
  return D.wrap(s);
}

// ---- forged edges: the in-game sword at five steps, in the line's gem ----

/** Bare, inlaid, gem-set, glowing runes, prismatic: the sword rarity drawn at each step. */
export const EDGE_STEPS: readonly Rarity[] = ['common', 'rare', 'epic', 'mythic', 'mythic'];
/** Blade steel per edge gem (approved); other gems take theirs from the gem's own colours. */
const EDGE_STEEL: Record<string, readonly [string, string]> = {
  square: ['#ffc78e', '#e0823c'],
  hexagon: ['#e3e9f0', '#98a4b4'],
  drop: ['#c8f2ff', '#58acd2'],
};
export const EDGE_VB = ITEM_VIEWBOX.split(' ').map(Number) as [number, number, number, number];
export function edgeVector(gem: GemArt, step: number): string {
  const steel = EDGE_STEEL[gem.shape] ?? [gem.colors[0], gem.colors[2]];
  const prism = step >= 4;
  return itemVector('sword', EDGE_STEPS[Math.min(4, Math.max(0, step))]!)
    .split('#e3e9f0')
    .join(prism ? '#ffd0f4' : steel[0])
    .split('#98a4b4')
    .join(prism ? '#a890ff' : steel[1]);
}
