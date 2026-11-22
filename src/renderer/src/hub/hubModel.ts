import type { Content } from '../../../data';
import { raidsOpen, type GameState } from '../../../game';
import type { ViewId } from '../table/viewIds';

/**
 * The hub map (DESIGN.md section 2 Base camp): one painted picture, 640 x 360, shown at a whole
 * scale that covers the area under the header (2x at 1280 x 720, 3x at 1920 x 1080, nearest
 * neighbour), centred with the overflow cut evenly off the edges, never scrolled. Each
 * place is its mask (`masks/<id>.png`, see `hubMasks.ts`): the exact pixels that click, and the shape the
 * hover glow follows. Display logic only: no DOM, unit tested.
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
  action: HubAction;
  /** The place opens only after the first Ascension (raids): sealed with a plate until then. */
  needsAscension?: true;
  /** Views whose pile hints say something waits: the gold "!" shows when any of them is ready. */
  marks: readonly ViewId[];
}

/**
 * Every place with a mask, in the order Tab visits them: the cliff left to right, then the upper row,
 * then the lower row. The fountain, the town wall, the gate and the towers are scenery.
 */
export const HUB_BUILDINGS: readonly HubBuilding[] = [
  {
    id: 'raid_gate',
    name: 'Raid gate',
    action: { kind: 'view', view: 'raids' },
    needsAscension: true,
    marks: [],
  },
  {
    id: 'dungeon_arch',
    name: 'Dungeon',
    action: { kind: 'dungeon' },
    marks: [],
  },
  {
    id: 'mine',
    name: 'Mine',
    action: { kind: 'view', view: 'mining' },
    marks: ['mining'],
  },
  {
    id: 'forest',
    name: 'Forest',
    action: { kind: 'view', view: 'logging' },
    marks: ['logging'],
  },
  {
    id: 'arena',
    name: 'Arena',
    action: { kind: 'locked', why: 'The arena is not built yet' },
    marks: [],
  },
  {
    id: 'expedition_board',
    name: 'Expedition board',
    action: { kind: 'view', view: 'expeditions' },
    marks: ['expeditions'],
  },
  {
    id: 'portal',
    name: 'Portal',
    action: { kind: 'view', view: 'summon' },
    marks: ['summon'],
  },
  {
    id: 'shrine',
    name: 'Shrine',
    action: { kind: 'view', view: 'skills' },
    marks: ['skills'],
  },
  {
    id: 'forge',
    name: 'Forge',
    action: { kind: 'view', view: 'forge' },
    marks: [],
  },
  {
    id: 'training_ground',
    name: 'Training ground',
    action: {
      kind: 'menu',
      choices: [
        { view: 'training', label: 'Training ground' },
        { view: 'upgrades', label: 'Training upgrades' },
      ],
    },
    marks: ['upgrades'],
  },
  {
    id: 'tailor',
    name: 'Tailor',
    action: { kind: 'view', view: 'wardrobe' },
    marks: ['wardrobe'],
  },
  {
    id: 'armoury',
    name: 'Armoury and Trophy hall',
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
    action: { kind: 'view', view: 'shop' },
    marks: ['shop'],
  },
];

/** Why a place is sealed now, or null when it opens: a place that is not built yet, or the Raid gate
 *  before the first Ascension. */
export function sealWhy(def: HubBuilding, state: GameState, content: Content): string | null {
  if (def.action.kind === 'locked') return def.action.why;
  if (def.needsAscension && !raidsOpen(state, content)) return 'Opens after your first Ascension';
  return null;
}

/** A window a few pixels short of a whole scale (a frame, a scrollbar) still counts as covered. */
export const HUB_FILL_SLACK = 8;

/**
 * The whole scale the map is shown at: the smallest that covers the area under the header (give or
 * take `HUB_FILL_SLACK` pixels), so the map always fills it; the overflow is cut evenly off the
 * edges (see `hubOffset`). 2x at 1280 x 720, 3x at 1920 x 1080; at least 1.
 */
export function hubScale(width: number, height: number): number {
  const byWidth = Math.ceil((width - HUB_FILL_SLACK) / HUB_MAP_W);
  const byHeight = Math.ceil((height - HUB_FILL_SLACK) / HUB_MAP_H);
  return Math.max(1, byWidth, byHeight);
}

/** Where the scaled map's top left corner sits in the area: centred, so the overflow is cut evenly
 *  (negative values); a few pixels of slack show as an even edge of background. */
export function hubOffset(width: number, height: number, scale: number): { x: number; y: number } {
  return {
    x: Math.floor((width - HUB_MAP_W * scale) / 2),
    y: Math.floor((height - HUB_MAP_H * scale) / 2),
  };
}

/** A box of the picture in screen pixels at a whole scale (so every edge lands on a pixel). */
export function scaled(rect: Rect, scale: number): Rect {
  return { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
}

/** The gold of the hover outline. */
export const GLOW_GOLD: readonly [number, number, number] = [0xff, 0xd6, 0x6e];

/** One colour channel brightened for a hovered place: x1.15 + 8, capped at 255. */
export const brighten = (v: number): number => Math.min(255, Math.round(v * 1.15 + 8));
