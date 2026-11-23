/**
 * Display logic of the Forge's anvil stage (docs/PROJECT_OVERVIEW.md, Forge). Pure, no DOM, unit
 * tested in `tests/forgeStage.test.ts`: the whole-pixel unit of the scene, spotting a finished
 * craft from the progress bar, and the out tray.
 */

/** The approved forge picture (`forge-scene-640x360.png`) in its own pixels. */
export const SCENE_W = 640;
export const SCENE_H = 360;

/**
 * The scale at which the picture covers the space under the header exactly (3 at the 1920 x 1080
 * design size), at least 1. The overflow is cut evenly off the edges.
 */
export function sceneUnit(width: number, height: number): number {
  return Math.max(1, width / SCENE_W, height / SCENE_H);
}

/**
 * True when the craft bar went round since the last look: same recipe, progress fell back a long
 * way (it was near full and is now near empty). A recipe change or a stop is not a craft.
 */
export function craftFinished(
  prev: { recipe: string; fraction: number } | null,
  next: { recipe: string; fraction: number } | null,
): boolean {
  if (!prev || !next || prev.recipe !== next.recipe) return false;
  return next.fraction < prev.fraction - 0.5;
}

/** Most finished items the tray draws as tiles; more are counted in the line under it. */
export const TRAY_TILES = 14;

export interface TrayItem {
  id: number;
  resource: string;
}

export interface Tray {
  /** The newest items, oldest first, at most `TRAY_TILES`. */
  items: TrayItem[];
  /** Everything made since the view opened. */
  total: number;
  next: number;
}

export const emptyTray = (): Tray => ({ items: [], total: 0, next: 1 });

/** The tray with one more finished item; the oldest tile drops off a full tray. */
export function trayAdd(tray: Tray, resource: string): Tray {
  const items = [...tray.items, { id: tray.next, resource }].slice(-TRAY_TILES);
  return { items, total: tray.total + 1, next: tray.next + 1 };
}
