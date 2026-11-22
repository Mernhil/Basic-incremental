import type { ViewId } from '../table/viewIds';

/**
 * The hub map (DESIGN.md section 2 Base camp): one painted picture, 640 x 360, shown at a whole
 * scale (2x at 1280 x 720, 3x at 1920 x 1080, nearest neighbour), centred, never scrolled. Each
 * place is one small click square laid over it by code, where the user marked it on a sketch
 * of the picture (2026-11-22: "small interactable squares that when we click on them they open the
 * tab"). Display logic only: no DOM, unit tested.
 */

export const HUB_MAP_W = 640;
export const HUB_MAP_H = 360;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What selecting a place does. */
export type HubAction =
  /** Opens a full view. */
  | { kind: 'view'; view: ViewId }
  /** Goes to the dungeon screen. */
  | { kind: 'dungeon' }
  /** Opens a small menu of views (one place, several screens). */
  | { kind: 'menu'; choices: { view: ViewId; label: string }[] }
  /** Nothing yet: a lock plate says why. */
  | { kind: 'locked'; why: string };

export interface HubBuilding {
  id: string;
  name: string;
  /** The click square in the picture's own pixels (x, y, width, height). */
  spot: Rect;
  action: HubAction;
  /** Views whose pile hints say something waits: the gold "!" shows when any of them is ready. */
  marks: readonly ViewId[];
}

/** A square of `w` x `h` picture pixels centred on (cx, cy). */
const around = (cx: number, cy: number, w: number, h: number): Rect => ({
  x: Math.round(cx - w / 2),
  y: Math.round(cy - h / 2),
  w,
  h,
});

/**
 * Every place with a click square, in the order Tab visits them: the cliff left to right, then the
 * upper row, then the lower row. The fountain, the town wall, the gate and the towers are scenery.
 * Centres and sizes are read off the user's sketch (1280 x 720, the picture at 2x), halved.
 */
export const HUB_BUILDINGS: readonly HubBuilding[] = [
  {
    id: 'raid_gate',
    name: 'Raid gate',
    spot: around(137, 67, 30, 30),
    action: { kind: 'locked', why: 'Sealed until raids exist' },
    marks: [],
  },
  {
    id: 'dungeon_arch',
    name: 'Dungeon',
    spot: around(320, 69, 46, 46),
    action: { kind: 'dungeon' },
    marks: [],
  },
  {
    id: 'mine',
    name: 'Mine',
    spot: around(471, 74, 46, 24),
    action: { kind: 'view', view: 'mining' },
    marks: ['mining'],
  },
  {
    id: 'forest',
    name: 'Forest',
    spot: around(568, 70, 36, 34),
    action: { kind: 'view', view: 'logging' },
    marks: ['logging'],
  },
  {
    id: 'arena',
    name: 'Arena',
    spot: around(68, 162, 46, 46),
    action: { kind: 'locked', why: 'The arena is not built yet' },
    marks: [],
  },
  {
    id: 'expedition_board',
    name: 'Expedition board',
    spot: around(215, 161, 26, 34),
    action: { kind: 'view', view: 'expeditions' },
    marks: ['expeditions'],
  },
  {
    id: 'portal',
    name: 'Portal',
    spot: around(420, 167, 40, 30),
    action: { kind: 'view', view: 'summon' },
    marks: ['summon'],
  },
  {
    id: 'shrine',
    name: 'Shrine',
    spot: around(520, 198, 40, 24),
    action: { kind: 'view', view: 'skills' },
    marks: ['skills'],
  },
  {
    id: 'forge',
    name: 'Forge',
    spot: around(602, 188, 34, 36),
    action: { kind: 'view', view: 'forge' },
    marks: [],
  },
  {
    id: 'training_ground',
    name: 'Training ground',
    spot: around(69, 286, 32, 28),
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
    id: 'tailor',
    name: 'Tailor',
    spot: around(234, 269, 38, 28),
    action: { kind: 'view', view: 'wardrobe' },
    marks: ['wardrobe'],
  },
  {
    id: 'armoury',
    name: 'Armoury and Trophy hall',
    spot: around(416, 268, 40, 28),
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
    id: 'market',
    name: 'Market',
    spot: around(550, 276, 38, 32),
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

/** A box of the picture in screen pixels at a whole scale (so every edge lands on a pixel). */
export function scaled(rect: Rect, scale: number): Rect {
  return { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
}

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pairs of places whose squares overlap (there must be none). */
export function overlappingBuildings(list: readonly HubBuilding[] = HUB_BUILDINGS): string[][] {
  const out: string[][] = [];
  list.forEach((a, i) =>
    list.slice(i + 1).forEach((b) => {
      if (overlap(a.spot, b.spot)) out.push([a.id, b.id]);
    }),
  );
  return out;
}
