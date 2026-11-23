/**
 * Display logic of the Forge's anvil stage (docs/PROJECT_OVERVIEW.md, Forge). Pure, no DOM, unit
 * tested in `tests/forgeStage.test.ts`: the whole-pixel unit of the scene, spotting a finished
 * craft from the progress bar, and the out tray.
 */

/** The approved forge picture (`forge-scene-640x360.png`) in its own pixels. */
export const SCENE_W = 640;
export const SCENE_H = 360;

/** A window a few pixels short of a whole scale (a frame, a scrollbar) still counts as covered (as the hub). */
export const SCENE_FILL_SLACK = 8;

/**
 * The whole scale at which the picture covers the space under the header: the smallest that does
 * (give or take `SCENE_FILL_SLACK`), at least 1. The overflow is cut evenly off the edges.
 */
export function sceneUnit(width: number, height: number): number {
  const byWidth = Math.ceil((width - SCENE_FILL_SLACK) / SCENE_W);
  const byHeight = Math.ceil((height - SCENE_FILL_SLACK) / SCENE_H);
  return Math.max(1, byWidth, byHeight);
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

/** The last items made the tray keeps as tiles; the count of all of them is in the line beside it. */
export const TRAY_TILES = 5;

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

/** Warm tones of the hit effect, lightest first (gold to orange). */
export const WARM_TONES: readonly (readonly [number, number, number])[] = [
  [0xff, 0xf1, 0xb8],
  [0xff, 0xd6, 0x6e],
  [0xff, 0xa8, 0x3a],
  [0xe0, 0x70, 0x1c],
  [0xa8, 0x43, 0x0f],
];

/** The warm tone for a brightness 0..255: bright pixels light gold, dark ones deep orange. */
export function warmTone(lum: number): readonly [number, number, number] {
  const i = Math.min(4, Math.max(0, Math.floor((1 - lum / 256) * 5)));
  return WARM_TONES[i]!;
}
