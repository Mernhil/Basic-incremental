/**
 * Arena backgrounds (DESIGN.md §6, "Arena backgrounds"): each dungeon names a background id in
 * `dungeons.json`; this table says which painted picture the fight is drawn on. The pictures are
 * 640 x 360 and shown at the smallest whole scale that covers the duel (2x at 1280 x 720, 3x at
 * 1920 x 1080, nearest neighbour), centred, the overflow cut evenly off the edges (the hub's rule,
 * `hub/hubModel.ts`). Display logic only: no DOM, unit tested.
 *
 * New art drops in as data plus one entry here: name the id in the dungeon's `background`, add the
 * picture under `stage/bg/` and `my_id: { url, bright }` below. The arena layout never changes.
 */
import cellar from './bg/stage-mossy_cellar-640x360.png';
import crypt from './bg/stage-ember_crypt-640x360.png';
import vault from './bg/stage-frostspire_vault-640x360.png';
import cove from './bg/stage-stormwrack_cove-640x360.png';
import sanctum from './bg/stage-sunken_sanctum-640x360.png';
import hollow from './bg/stage-void_hollow-640x360.png';

export const STAGE_W = 640;
export const STAGE_H = 360;

export interface ArenaBackground {
  /** The painted picture. */
  url: string;
  /** A light picture: the left-side info gets a dark plate behind it so it stays readable. */
  bright: boolean;
}

/** The picture used for a dungeon with no background of its own, and for the Challenge trial. */
export const DEFAULT_BACKGROUND: ArenaBackground = { url: cellar, bright: false };

/** The Challenge (trial) fights in the Hollow of the Void: its crystal target matches the violet crystals. */
export const TRIAL_BACKGROUND_ID = 'void_hollow';

/**
 * Background id (the dungeon's `background`) -> its picture. The Thunderpeak Aerie dungeon
 * (id `thunderpeak_aerie`) draws the Stormwrack Cove picture.
 */
export const ARENA_BACKGROUNDS: Readonly<Record<string, ArenaBackground>> = {
  mossy_cellar: { url: cellar, bright: false },
  ember_crypt: { url: crypt, bright: false },
  frostspire_vault: { url: vault, bright: true },
  thunderpeak_aerie: { url: cove, bright: false },
  sunken_sanctum: { url: sanctum, bright: true },
  void_hollow: { url: hollow, bright: false },
};

/** The background to draw for a dungeon's `background` id (undefined, unknown or empty: the default). */
export function backgroundFor(
  id: string | null | undefined,
  table: Readonly<Record<string, ArenaBackground>> = ARENA_BACKGROUNDS,
): ArenaBackground {
  if (!id) return DEFAULT_BACKGROUND;
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id]! : DEFAULT_BACKGROUND;
}

/** A duel a few pixels short of a whole scale (a frame, a scrollbar) still counts as covered. */
export const STAGE_FILL_SLACK = 8;

/** The whole scale that covers the duel: the smallest one, give or take the slack; at least 1. */
export function stageScale(width: number, height: number): number {
  const byWidth = Math.ceil((width - STAGE_FILL_SLACK) / STAGE_W);
  const byHeight = Math.ceil((height - STAGE_FILL_SLACK) / STAGE_H);
  return Math.max(1, byWidth, byHeight);
}

/** The picture's box in the duel: centred, so the overflow is cut evenly (negative offsets). */
export function stageBox(
  width: number,
  height: number,
  scale: number = stageScale(width, height),
): { x: number; y: number; w: number; h: number; scale: number } {
  const w = STAGE_W * scale;
  const h = STAGE_H * scale;
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), w, h, scale };
}
