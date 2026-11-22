import type { ViewId } from '../table/viewIds';

/**
 * The hub map (DESIGN.md section 2 Base camp): one painted picture, 640 x 360, shown at a whole
 * scale (2x at 1280 x 720, 3x at 1920 x 1080, nearest neighbour), centred, never scrolled. The buildings are click areas laid
 * over it by code; each is an outline (a polygon) in the picture's own pixels, traced by eye off the approved
 * picture `hub-wide-640x360.png`. Display logic only: no DOM, unit tested.
 */

export const HUB_MAP_W = 640;
export const HUB_MAP_H = 360;

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
      [110, 32],
      [169, 32],
      [169, 91],
      [110, 91],
    ],
    action: { kind: 'locked', why: 'Sealed until raids exist' },
    marks: [],
  },
  {
    id: 'dungeon_arch',
    name: 'Dungeon',
    shape: [
      [286, 95],
      [286, 47],
      [297, 27],
      [320, 20],
      [345, 27],
      [354, 47],
      [354, 95],
    ],
    action: { kind: 'dungeon' },
    marks: [],
  },
  {
    id: 'mine',
    name: 'Mine',
    shape: [
      [442, 47],
      [502, 46],
      [502, 95],
      [480, 102],
      [452, 102],
      [442, 75],
    ],
    action: { kind: 'view', view: 'mining' },
    marks: ['mining'],
  },
  {
    id: 'forest',
    name: 'Forest',
    shape: [
      [532, 75],
      [537, 35],
      [555, 17],
      [580, 17],
      [597, 35],
      [600, 75],
      [590, 107],
      [542, 107],
    ],
    action: { kind: 'view', view: 'logging' },
    marks: ['logging'],
  },
  {
    id: 'arena',
    name: 'Arena',
    shape: [
      [20, 160],
      [22, 120],
      [45, 102],
      [105, 102],
      [135, 117],
      [150, 150],
      [150, 205],
      [135, 215],
      [30, 215],
      [20, 200],
    ],
    action: { kind: 'locked', why: 'The arena is not built yet' },
    marks: [],
  },
  {
    id: 'portal',
    name: 'Portal',
    shape: [
      [368, 131],
      [400, 109],
      [487, 112],
      [489, 189],
      [370, 189],
    ],
    action: { kind: 'view', view: 'summon' },
    marks: ['summon'],
  },
  {
    id: 'expedition_board',
    name: 'Expedition board',
    shape: [
      [175, 142],
      [210, 120],
      [224, 91],
      [234, 117],
      [277, 115],
      [277, 192],
      [175, 196],
    ],
    action: { kind: 'view', view: 'expeditions' },
    marks: ['expeditions'],
  },
  {
    id: 'shrine',
    name: 'Shrine',
    shape: [
      [505, 150],
      [520, 120],
      [542, 122],
      [550, 150],
      [569, 190],
      [569, 212],
      [545, 222],
      [505, 217],
      [495, 202],
      [496, 185],
    ],
    action: { kind: 'view', view: 'skills' },
    marks: ['skills'],
  },
  {
    id: 'forge',
    name: 'Forge',
    shape: [
      [567, 150],
      [595, 142],
      [597, 127],
      [617, 125],
      [632, 135],
      [632, 190],
      [600, 197],
      [570, 192],
    ],
    action: { kind: 'view', view: 'forge' },
    marks: [],
  },
  {
    id: 'training_ground',
    name: 'Training ground',
    shape: [
      [29, 235],
      [152, 235],
      [154, 315],
      [29, 316],
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
      [366, 230],
      [414, 196],
      [467, 222],
      [467, 295],
      [367, 296],
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
      [182, 235],
      [192, 215],
      [274, 214],
      [285, 245],
      [285, 290],
      [192, 292],
      [182, 272],
    ],
    action: { kind: 'view', view: 'wardrobe' },
    marks: ['wardrobe'],
  },
  {
    id: 'market',
    name: 'Market',
    shape: [
      [489, 245],
      [520, 227],
      [622, 230],
      [622, 315],
      [492, 317],
    ],
    action: { kind: 'view', view: 'shop' },
    marks: ['shop'],
  },
];

/**
 * The whole scale the map is shown at: the largest that fits the width of the area under the
 * header and, in height, loses at most 12 % to the window (a little of the top and bottom edge,
 * which are rock and grass, then falls off the picture; the header takes 64 px at 1280 x 720).
 * 2x at 1280 x 720, 3x at 1920 x 1080; at least 1.
 */
export function hubScale(width: number, height: number): number {
  const byWidth = Math.floor(width / HUB_MAP_W);
  const byHeight = Math.floor((height * 1.12) / HUB_MAP_H);
  return Math.max(1, Math.min(byWidth, byHeight));
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
