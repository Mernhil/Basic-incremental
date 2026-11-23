/**
 * Display logic of the winding map in the Dungeons panel (DESIGN.md §2 Dungeons): which stages are
 * shown, their state, where each stop sits on the road and where the studs of the road go. Pure:
 * the view turns game state into these inputs; no game rules here.
 */

/** A stop on the road: a wave floor, a mini-boss or the boss. */
export type StopKind = 'wave' | 'miniboss' | 'boss';
/** Beaten, the next one to beat, or not reached yet. */
export type StopState = 'done' | 'current' | 'locked';

export interface MapStop {
  floor: number;
  kind: StopKind;
  state: StopState;
}

/** The stages an endless depth shows at once around the player's best. */
export const ENDLESS_WINDOW = 30;

/**
 * The first and last floor shown on the road. A dungeon with a last floor shows them all; the
 * endless depths show a window that follows the best depth (a few beaten ones, the rest ahead).
 */
export function shownRange(floors: number, best: number): { from: number; to: number } {
  if (Number.isFinite(floors)) return { from: 1, to: Math.max(1, Math.floor(floors)) };
  const from = Math.max(1, Math.floor(best) - 9);
  return { from, to: from + ENDLESS_WINDOW - 1 };
}

/** The next stage to beat on the road, or null when the whole path is beaten. */
export function currentStage(floors: number, best: number): number | null {
  const next = Math.max(0, Math.floor(best)) + 1;
  return next <= floors ? next : null;
}

/** Every shown stop with its state. `kindOf` is the game's floor kind. */
export function pathStops(input: {
  floors: number;
  best: number;
  kindOf: (floor: number) => StopKind;
}): MapStop[] {
  const { from, to } = shownRange(input.floors, input.best);
  const current = currentStage(input.floors, input.best);
  const stops: MapStop[] = [];
  for (let floor = from; floor <= to; floor++) {
    const state: StopState =
      floor <= input.best ? 'done' : floor === current ? 'current' : 'locked';
    stops.push({ floor, kind: input.kindOf(floor), state });
  }
  return stops;
}

/** A dungeon plate's progress: a whole path is finished only when its last stage is beaten. */
export type PlateProgress =
  | { kind: 'locked' }
  | { kind: 'finished' }
  | { kind: 'at'; stage: number; of: number; fraction: number };

export function plateProgress(input: {
  unlocked: boolean;
  floors: number;
  best: number;
}): PlateProgress {
  if (!input.unlocked) return { kind: 'locked' };
  if (input.best >= input.floors) return { kind: 'finished' };
  const stage = Math.max(0, input.best) + 1;
  return {
    kind: 'at',
    stage,
    of: input.floors,
    fraction: Math.min(1, Math.max(0, input.best) / input.floors),
  };
}

export interface Point {
  x: number;
  y: number;
}

/** Stops per row of the winding road. */
export const ROAD_COLUMNS = 5;

export interface RoadLayout {
  /** The point of each stop, in the order given (the first at the bottom left). */
  points: Point[];
  /** The height the road needs (the scroll height). */
  height: number;
}

/**
 * Where the stops of a road sit inside a box `width` wide and at least `minHeight` tall: rows of
 * ROAD_COLUMNS going right, then left, the first row at the bottom, each stop nudged up or down
 * alternately so the road winds. A short road is centred in the box; a long one grows it.
 */
export function layoutRoad(
  count: number,
  width: number,
  minHeight: number,
  /** 1 for markers at 2x, 0.5 for markers at 1x (a small pane): the road's spacing follows. */
  unit = 1,
): RoadLayout {
  const rows = Math.max(1, Math.ceil(count / ROAD_COLUMNS));
  const padX = Math.min(90, width * 0.1);
  const padTop = 64 * unit;
  const padBottom = 52 * unit;
  const span = Math.min(260, (width - padX * 2) / (ROAD_COLUMNS - 1));
  const left = (width - span * (ROAD_COLUMNS - 1)) / 2;
  const pitch =
    rows > 1
      ? Math.min(
          Math.max(150 * unit, minHeight * 0.22 * unit),
          Math.max(100 * unit, (minHeight - padTop - padBottom) / (rows - 1)),
        )
      : 0;
  const roadHeight = (rows - 1) * pitch;
  const height = Math.max(minHeight, roadHeight + padTop + padBottom);
  // a short road sits low, under the title; a tall pane leaves the air above it
  const bottom = height - padBottom - Math.max(0, (height - padTop - padBottom - roadHeight) / 2);
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / ROAD_COLUMNS);
    const step = i % ROAD_COLUMNS;
    const col = row % 2 === 0 ? step : ROAD_COLUMNS - 1 - step;
    points.push({
      x: Math.round(left + col * span),
      y: Math.round(bottom - row * pitch + (step % 2 === 1 ? -22 : 14) * unit),
    });
  }
  return { points, height: Math.round(height) };
}

/** The radius (at unit 1) that keeps studs clear of a stop (its picture and a little air). */
export const STOP_CLEAR: Record<StopKind, number> = { wave: 34, miniboss: 52, boss: 66 };

/** Spacing of the studs along the road. */
export const STUD_GAP = 26;

/**
 * The studs between two neighbouring stops: spaced evenly along the line, none inside either
 * stop's clear radius, so the road stops short of every stop.
 */
export function studsBetween(
  a: Point,
  b: Point,
  clearA: number,
  clearB: number,
  gap: number = STUD_GAP,
): Point[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const start = clearA;
  const end = length - clearB;
  if (end <= start || length === 0) return [];
  const count = Math.max(1, Math.round((end - start) / gap));
  const studs: Point[] = [];
  for (let k = 0; k <= count; k++) {
    const d = start + ((end - start) * k) / count;
    // keep the end studs off the stops too: only the inner points of the run are drawn
    if (count > 1 && (k === 0 || k === count)) continue;
    const t = d / length;
    studs.push({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) });
  }
  return studs.length > 0
    ? studs
    : [{ x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }];
}

/**
 * The whole number the scene is drawn at so it covers its box: at least 2 (the approved size), and
 * larger when the box is bigger than the scene at 2x.
 */
export function sceneScale(width: number, height: number, scene = { w: 368, h: 316 }): number {
  return Math.max(2, Math.ceil(Math.max(width / scene.w, height / scene.h)));
}

/** The scenes whose light colours need a dark plate under the title. */
const LIGHT_SCENES = new Set(['frostspire_vault', 'sunken_sanctum']);
export const sceneIsLight = (dungeonId: string): boolean => LIGHT_SCENES.has(dungeonId);

/** The scene picture of a dungeon (`art/dungeon-map/map-<name>.png`); Stormwrack Cove is `thunderpeak_aerie`. */
export const sceneName = (dungeonId: string): string =>
  dungeonId === 'thunderpeak_aerie' ? 'stormwrack_cove' : dungeonId;

/** The stage a plate or the panel opens on: the next one to beat, else the last one. */
export function defaultStage(floors: number, best: number): number {
  return (
    currentStage(floors, best) ?? Math.max(1, Math.floor(Number.isFinite(floors) ? floors : best))
  );
}
