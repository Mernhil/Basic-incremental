import type { ViewId } from '../table/viewIds';

/**
 * The hub map (DESIGN.md section 2 Base camp): one painted picture, 640 x 360, shown at a whole
 * scale (2x at 1280 x 720, 3x at 1920 x 1080, nearest neighbour), centred, never scrolled. The buildings are click areas laid
 * over it by code; each is an outline (a polygon) in the picture's own pixels, traced on the picture at 6x to 10x with a pixel grid off the approved
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
      [110, 31],
      [169, 31],
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
      [286, 92],
      [286, 62],
      [287, 50],
      [290, 43],
      [295, 35],
      [302, 28],
      [310, 23],
      [320, 20],
      [331, 23],
      [338, 28],
      [345, 35],
      [350, 42],
      [353, 50],
      [355, 62],
      [355, 92],
    ],
    action: { kind: 'dungeon' },
    marks: [],
  },
  {
    id: 'mine',
    name: 'Mine',
    shape: [
      [441, 46],
      [502, 46],
      [502, 95],
      [492, 97],
      [462, 101],
      [447, 99],
      [441, 92],
    ],
    action: { kind: 'view', view: 'mining' },
    marks: ['mining'],
  },
  {
    id: 'forest',
    name: 'Forest',
    shape: [
      [538, 38],
      [545, 27],
      [554, 19],
      [564, 15],
      [578, 15],
      [588, 20],
      [597, 30],
      [600, 45],
      [601, 70],
      [599, 90],
      [592, 101],
      [582, 107],
      [560, 108],
      [546, 106],
      [539, 98],
      [534, 85],
      [532, 68],
      [534, 50],
    ],
    action: { kind: 'view', view: 'logging' },
    marks: ['logging'],
  },
  {
    id: 'arena',
    name: 'Arena',
    shape: [
      [38, 109],
      [52, 101],
      [56, 100],
      [100, 100],
      [103, 104],
      [132, 112],
      [145, 120],
      [148, 140],
      [148, 160],
      [147, 185],
      [145, 205],
      [134, 210],
      [118, 213],
      [96, 214],
      [66, 215],
      [40, 213],
      [28, 205],
      [20, 198],
      [19, 175],
      [19, 150],
      [21, 135],
      [28, 120],
    ],
    action: { kind: 'locked', why: 'The arena is not built yet' },
    marks: [],
  },
  {
    id: 'portal',
    name: 'Portal',
    shape: [
      [368, 188],
      [368, 118],
      [375, 116],
      [387, 108],
      [476, 108],
      [484, 114],
      [488, 118],
      [488, 188],
    ],
    action: { kind: 'view', view: 'summon' },
    marks: ['summon'],
  },
  {
    id: 'expedition_board',
    name: 'Expedition board',
    shape: [
      [221, 91],
      [227, 95],
      [232, 108],
      [236, 114],
      [281, 113],
      [281, 148],
      [279, 150],
      [279, 175],
      [281, 192],
      [270, 194],
      [200, 195],
      [172, 197],
      [171, 185],
      [172, 160],
      [171, 140],
      [178, 136],
      [190, 135],
      [200, 128],
      [204, 114],
      [214, 113],
      [218, 104],
    ],
    action: { kind: 'view', view: 'expeditions' },
    marks: ['expeditions'],
  },
  {
    id: 'shrine',
    name: 'Shrine',
    shape: [
      [521, 122],
      [532, 121],
      [545, 125],
      [550, 135],
      [558, 146],
      [560, 152],
      [556, 160],
      [551, 168],
      [560, 175],
      [565, 183],
      [570, 192],
      [572, 200],
      [569, 210],
      [562, 218],
      [548, 221],
      [530, 222],
      [512, 221],
      [500, 217],
      [494, 208],
      [493, 195],
      [498, 185],
      [505, 178],
      [514, 172],
      [508, 168],
      [502, 160],
      [500, 152],
      [505, 145],
      [510, 138],
      [515, 130],
    ],
    action: { kind: 'view', view: 'skills' },
    marks: ['skills'],
  },
  {
    id: 'forge',
    name: 'Forge',
    shape: [
      [592, 125],
      [611, 125],
      [611, 142],
      [616, 142],
      [616, 137],
      [622, 135],
      [627, 135],
      [632, 138],
      [636, 145],
      [638, 160],
      [640, 170],
      [639, 178],
      [637, 182],
      [636, 190],
      [628, 190],
      [612, 193],
      [594, 193],
      [584, 191],
      [582, 183],
      [580, 182],
      [570, 181],
      [570, 172],
      [573, 169],
      [573, 152],
      [569, 150],
      [569, 143],
      [592, 143],
    ],
    action: { kind: 'view', view: 'forge' },
    marks: [],
  },
  {
    id: 'training_ground',
    name: 'Training ground',
    shape: [
      [27, 233],
      [151, 233],
      [152, 311],
      [28, 312],
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
      [414, 194],
      [418, 196],
      [466, 225],
      [467, 254],
      [458, 257],
      [458, 292],
      [420, 294],
      [382, 294],
      [372, 292],
      [371, 257],
      [366, 254],
      [366, 229],
      [379, 222],
      [396, 206],
      [410, 196],
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
      [192, 213],
      [273, 213],
      [274, 240],
      [283, 243],
      [286, 255],
      [284, 262],
      [276, 262],
      [276, 285],
      [272, 288],
      [215, 289],
      [195, 288],
      [193, 263],
      [182, 262],
      [181, 245],
      [184, 240],
      [192, 238],
    ],
    action: { kind: 'view', view: 'wardrobe' },
    marks: ['wardrobe'],
  },
  {
    id: 'market',
    name: 'Market',
    shape: [
      [490, 236],
      [498, 232],
      [508, 242],
      [510, 240],
      [518, 232],
      [520, 226],
      [551, 226],
      [552, 234],
      [558, 236],
      [575, 226],
      [583, 226],
      [598, 238],
      [600, 242],
      [611, 231],
      [620, 229],
      [622, 250],
      [621, 270],
      [620, 292],
      [610, 305],
      [602, 312],
      [590, 316],
      [560, 318],
      [545, 318],
      [525, 314],
      [510, 312],
      [503, 310],
      [497, 300],
      [494, 290],
      [492, 270],
      [490, 250],
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
