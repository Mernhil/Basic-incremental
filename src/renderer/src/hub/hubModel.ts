import type { ViewId } from '../table/viewIds';

/**
 * The hub map (DESIGN.md section 2 Base camp): one painted picture, 384 x 688, shown at a whole
 * scale (2x or 3x, nearest neighbour) and scrolled up and down. The buildings are click areas laid
 * over it by code; each is an outline (a polygon) in the picture's own pixels, traced by eye off the approved
 * picture `hub-map-384x688.png`. Display logic only: no DOM, unit tested.
 */

export const HUB_MAP_W = 384;
export const HUB_MAP_H = 688;

export type Point = readonly [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What selecting a building does. */
export type HubAction =
  /** Opens a full view. */
  | { kind: 'view'; view: ViewId }
  /** Goes to the dungeon screen. */
  | { kind: 'dungeon' }
  /** Opens a small menu of views (one building, several screens). */
  | { kind: 'menu'; choices: { view: ViewId; label: string }[] }
  /** Nothing yet: dimmed with a lock plate. */
  | { kind: 'locked'; why: string };

export interface HubBuilding {
  id: string;
  name: string;
  /** The building's outline in the picture's pixels, a closed polygon (traced by eye off the picture). */
  shape: readonly Point[];
  action: HubAction;
  /** Views whose pile hint says something waits: the gold "!" shows when any of them is ready. */
  marks: readonly ViewId[];
}

/**
 * Every place with a click area, top to bottom. The fountain, the second log house, the trees and
 * the town wall are scenery and have none.
 */
export const HUB_BUILDINGS: readonly HubBuilding[] = [
  {
    id: 'raid_gate',
    name: 'Raid gate',
    shape: [
      [36, 142],
      [83, 142],
      [84, 189],
      [35, 189],
    ],
    action: { kind: 'locked', why: 'Sealed until raids exist' },
    marks: [],
  },
  {
    id: 'dungeon_arch',
    name: 'Dungeon',
    shape: [
      [169, 165],
      [178, 143],
      [192, 136],
      [206, 143],
      [212, 165],
      [210, 203],
      [171, 203],
    ],
    action: { kind: 'dungeon' },
    marks: [],
  },
  {
    id: 'mine',
    name: 'Mine',
    shape: [
      [248, 155],
      [270, 148],
      [295, 155],
      [296, 190],
      [248, 188],
    ],
    action: { kind: 'view', view: 'mining' },
    marks: ['mining'],
  },
  {
    id: 'forest',
    name: 'Forest',
    shape: [
      [316, 150],
      [332, 128],
      [360, 122],
      [372, 145],
      [374, 180],
      [360, 199],
      [325, 199],
      [315, 180],
    ],
    action: { kind: 'view', view: 'logging' },
    marks: ['logging'],
  },
  {
    id: 'arena',
    name: 'Arena',
    shape: [
      [30, 250],
      [40, 231],
      [75, 220],
      [115, 222],
      [142, 240],
      [145, 300],
      [130, 320],
      [50, 324],
      [31, 305],
    ],
    action: { kind: 'locked', why: 'The arena is not built yet' },
    marks: [],
  },
  {
    id: 'portal',
    name: 'Portal',
    shape: [
      [244, 238],
      [300, 213],
      [356, 238],
      [356, 312],
      [244, 312],
    ],
    action: { kind: 'view', view: 'summon' },
    marks: ['summon'],
  },
  {
    id: 'expedition_board',
    name: 'Expedition board',
    shape: [
      [20, 350],
      [62, 328],
      [105, 330],
      [142, 357],
      [142, 395],
      [20, 395],
    ],
    action: { kind: 'view', view: 'expeditions' },
    marks: ['expeditions'],
  },
  {
    id: 'shrine',
    name: 'Shrine',
    shape: [
      [235, 350],
      [250, 316],
      [265, 325],
      [277, 350],
      [277, 372],
      [262, 384],
      [240, 382],
      [234, 367],
    ],
    action: { kind: 'view', view: 'skills' },
    marks: ['skills'],
  },
  {
    id: 'forge',
    name: 'Forge',
    shape: [
      [304, 335],
      [345, 332],
      [357, 322],
      [367, 322],
      [367, 372],
      [305, 372],
    ],
    action: { kind: 'view', view: 'forge' },
    marks: [],
  },
  {
    id: 'training_ground',
    name: 'Training ground',
    shape: [
      [22, 409],
      [100, 409],
      [100, 464],
      [22, 464],
    ],
    action: {
      kind: 'menu',
      choices: [
        { view: 'training', label: 'Test dummy' },
        { view: 'upgrades', label: 'Training upgrades' },
      ],
    },
    marks: ['upgrades'],
  },
  {
    id: 'armoury',
    name: 'Armoury and Trophy hall',
    shape: [
      [260, 410],
      [314, 376],
      [370, 402],
      [370, 462],
      [260, 462],
    ],
    action: {
      kind: 'menu',
      choices: [
        { view: 'cards', label: 'Armoury: cards and loadouts' },
        { view: 'achievements', label: 'Trophy hall: achievements' },
      ],
    },
    marks: ['cards', 'achievements'],
  },
  {
    id: 'tailor',
    name: 'Tailor',
    shape: [
      [82, 480],
      [95, 468],
      [135, 442],
      [142, 440],
      [167, 475],
      [167, 520],
      [82, 520],
    ],
    action: { kind: 'view', view: 'wardrobe' },
    marks: ['wardrobe'],
  },
  {
    id: 'market',
    name: 'Market',
    shape: [
      [222, 467],
      [365, 467],
      [365, 542],
      [222, 542],
    ],
    action: { kind: 'view', view: 'shop' },
    marks: ['shop'],
  },
];

/** The whole scale the map is shown at: 3x when the screen is wide enough for it with room to spare, else 2x. */
export function hubScale(availableWidth: number): 2 | 3 {
  return availableWidth >= HUB_MAP_W * 3 + 160 ? 3 : 2;
}

/** The box around an outline. */
export function bounds(shape: readonly Point[]): Rect {
  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** A box of the picture in screen pixels at a whole scale (so every edge lands on a pixel). */
export function scaled(rect: Rect, scale: number): Rect {
  return { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
}

const cross = (o: Point, a: Point, b: Point): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function inside(p: Point, poly: readonly Point[]): boolean {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      in_ = !in_;
    }
  }
  return in_;
}

function shapesOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsCross(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  return a.some((p) => inside(p, b)) || b.some((p) => inside(p, a));
}

/** Pairs of buildings whose outlines overlap (there must be none). */
export function overlappingBuildings(list: readonly HubBuilding[] = HUB_BUILDINGS): string[][] {
  const out: string[][] = [];
  list.forEach((a, k) =>
    list.slice(k + 1).forEach((b) => {
      if (shapesOverlap(a.shape, b.shape)) out.push([a.id, b.id]);
    }),
  );
  return out;
}
