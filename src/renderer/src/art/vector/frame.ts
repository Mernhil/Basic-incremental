/**
 * The approved card frame ladder (DESIGN.md §5, §12, approved in pixel art 2026-11-07), as the
 * vector drawing the pixel frame is baked from. Drawn over a 176 x 248 card; every tier changes the
 * material, fills more of the six gem sockets and grows the crest, and stays a border.
 *
 * | Tier      | Material                       | Sockets                        | Crest               |
 * | Bronze    | hammered bronze, patina spots  | empty                          | plain stud          |
 * | Silver    | polished, engraved inner line  | two top sapphires              | small wings         |
 * | Gold      | scrollwork, red velvet liner   | sapphires, emeralds, top ruby  | small crown         |
 * | Prismatic | crystal band of pastel facets  | six rainbow gems               | small radiant crown |
 */
import type { RankTier } from '../../../../data';
import { INK, f } from '../kit';

export const CARD_W = 176;
export const CARD_H = 248;
/** The tiers that have their own frame: Unique keeps the Prismatic frame (DESIGN.md §5). */
export type FrameTier = Exclude<RankTier, 'unique'>;
export const TIER_ORDER: readonly FrameTier[] = ['bronze', 'silver', 'gold', 'prismatic'];

export interface FrameMetal {
  base: string;
  shade: string;
  hi: string;
  dark: string;
}
export const FRAME_METALS: Record<FrameTier, FrameMetal> = {
  bronze: { base: '#c97c3c', shade: '#8a4a1e', hi: '#ffc987', dark: '#5e3214' },
  silver: { base: '#c9d3de', shade: '#7c8898', hi: '#ffffff', dark: '#4e5868' },
  gold: { base: '#f4c23b', shade: '#b0700e', hi: '#fff5b8', dark: '#7a4a08' },
  prismatic: { base: '#f08bd8', shade: '#8a4bd0', hi: '#ffffff', dark: '#4a2a80' },
};

const inkA = (w = 3): string =>
  `stroke="${INK}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;

/** Mirrors every x of an absolute path across the card's vertical centre line. */
export const mirror = (d: string): string =>
  d.replace(
    /(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${CARD_W - Number(x)} ${y}`,
  );
const both = (d: string): string => `${d} ${mirror(d)}`;
const roundRect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const band = (t: number, r: number, fill: string): string =>
  `<path d="${roundRect(1, 1, CARD_W - 2, CARD_H - 2, r)} ${roundRect(1 + t, 1 + t, CARD_W - 2 - 2 * t, CARD_H - 2 - 2 * t, Math.max(3, r - t))}" fill-rule="evenodd" fill="${fill}" ${inkA(3)}/>`;
/** The bright top edge of the metal: Brave Frontier gold trim, a light line on the upper edge. */
const hiLine = (m: FrameMetal): string =>
  `<path d="M5 40 L5 18 C5 10 10 5 18 5 L100 5" stroke="${m.hi}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
/** A small socket gem: ring, body and a white glint. */
const sGem = (x: number, y: number, r: number, c: string): string =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" ${inkA(1.6)}/><circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(Math.max(0.9, r * 0.28))}" fill="#ffffff"/>`;
const GEMC = {
  ruby: '#ff3d6e',
  sapph: '#4fc3ff',
  emer: '#3ee08a',
  prism: '#6effe0',
};

/** Socket centres in card units (four corners, top, bottom), used by the twinkles too. */
export const SOCKETS: readonly (readonly [number, number, number])[] = [
  [8, 8, 4.2],
  [CARD_W - 8, 8, 4.2],
  [8, CARD_H - 8, 4.2],
  [CARD_W - 8, CARD_H - 8, 4.2],
  [88, 4, 5.2],
  [88, CARD_H - 4, 5.2],
];
function socketSet(fill: string, gems: readonly string[]): string {
  return SOCKETS.map(
    ([x, y, r], k) =>
      `<circle cx="${x}" cy="${y}" r="${f(r + 2.4)}" fill="${fill}" ${inkA(3)}/>` +
      (gems[k]
        ? sGem(x, y, r, gems[k])
        : `<circle cx="${x}" cy="${y}" r="${r}" fill="#1a1424" ${inkA(1.6)}/>`),
  ).join('');
}

let clipN = 0;

/** The vector frame for a tier (the pixel source; the game shows the baked pixel version). */
export function frameVector(tier: FrameTier): string {
  const lv = TIER_ORDER.indexOf(tier);
  const m = FRAME_METALS[tier];
  let s = '';
  let back = '';
  if (lv === 0) {
    s =
      band(6, 12, m.base) +
      (
        [
          [30, 3],
          [62, 4],
          [120, 3],
          [150, 4],
          [3, 70],
          [4, 130],
          [3, 190],
          [CARD_W - 3, 90],
          [CARD_W - 4, 160],
          [40, CARD_H - 3],
          [110, CARD_H - 4],
        ] as const
      )
        .map(
          ([x, y], k) =>
            `<circle cx="${x}" cy="${y}" r="${k % 3 ? 1.8 : 2.4}" fill="${k % 3 ? m.shade : '#5fae8a'}"/>`,
        )
        .join('');
    s += socketSet(m.base, []);
  }
  if (lv === 1) {
    s =
      band(7, 14, m.base) +
      `<path d="${roundRect(4.5, 4.5, CARD_W - 9, CARD_H - 9, 11)}" fill="none" stroke="${m.shade}" stroke-width="1.2"/>` +
      hiLine(m);
    back = `<path d="${both('M82 4 C74 -6 64 -6 58 -1 C64 0 67 3 69 6 C74 5 78 5 82 6Z')}" fill="${m.base}" ${inkA(3)}/>`;
    s += socketSet(m.base, [GEMC.sapph, GEMC.sapph]);
  }
  if (lv === 2) {
    const curl = (x: number, y: number): string =>
      `<path d="M${x} ${y} c4 -4 8 0 6 3 c-2 3 -5 1 -4 -1" stroke="${m.dark}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    s =
      band(8, 14, m.base) +
      `<path d="${roundRect(9, 9, CARD_W - 18, CARD_H - 18, 8)} ${roundRect(11, 11, CARD_W - 22, CARD_H - 22, 7)}" fill-rule="evenodd" fill="#b0203e" ${inkA(1.4)}/>` +
      hiLine(m);
    for (let x = 26; x <= 146; x += 20)
      if (Math.abs(x - 88) > 12) s += curl(x, 4) + curl(x, CARD_H - 5);
    for (let y = 34; y <= 214; y += 20) s += curl(2, y) + curl(CARD_W - 8, y);
    back =
      `<path d="M74 4 L72 -9 L80 -3 L88 -13 L96 -3 L104 -9 L102 4Z" fill="${m.base}" ${inkA(3)}/>` +
      sGem(88, -13, 2.4, GEMC.ruby);
    s += socketSet(m.base, [GEMC.sapph, GEMC.sapph, GEMC.emer, GEMC.emer, GEMC.ruby]);
  }
  if (lv === 3) {
    const id = `bi-frame-cm-${clipN++}`;
    const pas = ['#ff9ae4', '#9adcff', '#ffe08a', '#8affd8', '#c8a8ff'];
    let tris = '';
    const per = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      n: number,
      inX: number,
      inY: number,
    ): void => {
      for (let k = 0; k < n; k++) {
        const ax = x0 + ((x1 - x0) * k) / n;
        const ay = y0 + ((y1 - y0) * k) / n;
        const bx = x0 + ((x1 - x0) * (k + 1)) / n;
        const by = y0 + ((y1 - y0) * (k + 1)) / n;
        tris += `<path d="M${f(ax)} ${f(ay)} L${f(bx)} ${f(by)} L${f((ax + bx) / 2 + inX)} ${f((ay + by) / 2 + inY)}Z" fill="${pas[k % 5]}"/><path d="M${f(bx)} ${f(by)} L${f((ax + bx) / 2 + inX)} ${f((ay + by) / 2 + inY)} L${f(bx + inX)} ${f(by + inY)}Z" fill="${pas[(k + 2) % 5]}"/>`;
      }
    };
    per(0, 0, CARD_W, 0, 14, 0, 9);
    per(0, CARD_H, CARD_W, CARD_H, 14, 0, -9);
    per(0, 0, 0, CARD_H, 20, 9, 0);
    per(CARD_W, 0, CARD_W, CARD_H, 20, -9, 0);
    const ringD = `${roundRect(1, 1, CARD_W - 2, CARD_H - 2, 14)} ${roundRect(9, 9, CARD_W - 18, CARD_H - 18, 6)}`;
    s = `<clipPath id="${id}"><path d="${ringD}" clip-rule="evenodd"/></clipPath><path d="${ringD}" fill-rule="evenodd" fill="#eef4ff"/><g clip-path="url(#${id})">${tris}</g><path d="${ringD}" fill-rule="evenodd" fill="none" ${inkA(3)}/>`;
    back =
      Array.from({ length: 5 }, (_, k) => {
        const a = ((-150 + k * 30) * Math.PI) / 180;
        return `<path d="M88 -6 L${f(88 + Math.cos(a) * 26)} ${f(-6 + Math.sin(a) * 14)}" stroke="${k % 2 ? '#ffd36a' : '#ffffff'}" stroke-width="1.6" stroke-linecap="round"/>`;
      }).join('') +
      `<path d="M70 4 L67 -12 L77 -4 L83 -16 L88 -6 L93 -16 L99 -4 L109 -12 L106 4Z" fill="#c8a8ff" ${inkA(3)}/>` +
      sGem(83, -16, 2.2, '#ff7ad9') +
      sGem(93, -16, 2.2, '#6effe0');
    s += socketSet('#eef4ff', ['#ff7ad9', '#ffd36a', '#6effe0', '#8a7bff', GEMC.prism, '#ffffff']);
  }
  return `${back}${s}`;
}

/** The pixel grid the frame is baked on: card units, 0.75 pixels per unit (card 132 x 186). */
export const FRAME_VB = [-34, -50, 244, 316] as const;
export const FRAME_SCALE = 0.75;
