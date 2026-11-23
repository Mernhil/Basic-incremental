import { describe, expect, it } from 'vitest';
import {
  currentStage,
  defaultStage,
  ENDLESS_WINDOW,
  layoutRoad,
  pathStops,
  plateProgress,
  ROAD_COLUMNS,
  sceneIsLight,
  sceneName,
  sceneScale,
  shownRange,
  STOP_CLEAR,
  studsBetween,
  type StopKind,
} from '../src/renderer/src/pages/dungeonMapModel';

const kindOf =
  (floors: number) =>
  (floor: number): StopKind =>
    floor >= floors ? 'boss' : floor % 10 === 0 ? 'miniboss' : 'wave';

describe('the stops of a path', () => {
  it('marks the stages beaten, the next one and the rest', () => {
    const stops = pathStops({ floors: 20, best: 7, kindOf: kindOf(20) });
    expect(stops).toHaveLength(20);
    expect(stops.filter((s) => s.state === 'done').map((s) => s.floor)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(stops.filter((s) => s.state === 'current').map((s) => s.floor)).toEqual([8]);
    expect(stops[9]).toEqual({ floor: 10, kind: 'miniboss', state: 'locked' });
    expect(stops[19]).toEqual({ floor: 20, kind: 'boss', state: 'locked' });
  });

  it('has no current stop once the whole path is beaten', () => {
    const stops = pathStops({ floors: 10, best: 10, kindOf: kindOf(10) });
    expect(stops.every((s) => s.state === 'done')).toBe(true);
    expect(currentStage(10, 10)).toBeNull();
    expect(currentStage(10, 9)).toBe(10);
  });

  it('shows a window of the endless depths that follows the best depth', () => {
    expect(shownRange(Infinity, 0)).toEqual({ from: 1, to: ENDLESS_WINDOW });
    expect(shownRange(Infinity, 100)).toEqual({ from: 91, to: 90 + ENDLESS_WINDOW });
    const stops = pathStops({ floors: Infinity, best: 100, kindOf: () => 'wave' });
    expect(stops).toHaveLength(ENDLESS_WINDOW);
    expect(stops.find((s) => s.state === 'current')!.floor).toBe(101);
  });

  it('opens on the next stage to beat, else the last one', () => {
    expect(defaultStage(20, 7)).toBe(8);
    expect(defaultStage(20, 20)).toBe(20);
    expect(defaultStage(Infinity, 40)).toBe(41);
  });
});

describe('a dungeon plate', () => {
  it('says Locked, the stage the player is at, or Finished only when the whole path is beaten', () => {
    expect(plateProgress({ unlocked: false, floors: 20, best: 0 })).toEqual({ kind: 'locked' });
    expect(plateProgress({ unlocked: true, floors: 20, best: 7 })).toEqual({
      kind: 'at',
      stage: 8,
      of: 20,
      fraction: 0.35,
    });
    // stage 5 of 20 is not a finished dungeon, and neither is stage 19
    expect(plateProgress({ unlocked: true, floors: 20, best: 19 }).kind).toBe('at');
    expect(plateProgress({ unlocked: true, floors: 20, best: 20 })).toEqual({ kind: 'finished' });
  });
});

describe('the road layout', () => {
  it('winds in rows of five, the first stop at the bottom left, the second row going back', () => {
    const { points } = layoutRoad(20, 700, 600);
    expect(points).toHaveLength(20);
    const [first, ...rest] = points;
    expect(rest.every((p) => p.y <= first!.y + 40)).toBe(true);
    expect(points[ROAD_COLUMNS - 1]!.x).toBeGreaterThan(points[0]!.x);
    // the sixth stop is above the fifth, at the same end of the row
    expect(points[ROAD_COLUMNS]!.x).toBe(points[ROAD_COLUMNS - 1]!.x);
    expect(points[ROAD_COLUMNS]!.y).toBeLessThan(points[ROAD_COLUMNS - 1]!.y);
    expect(points[2 * ROAD_COLUMNS]!.x).toBe(points[0]!.x);
  });

  it('keeps every stop inside the box and grows the box for a long road', () => {
    for (const [count, width, minHeight] of [
      [10, 640, 500],
      [60, 640, 500],
      [30, 1100, 900],
    ] as const) {
      const { points, height } = layoutRoad(count, width, minHeight);
      expect(height).toBeGreaterThanOrEqual(minHeight);
      for (const p of points) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(width);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(height);
      }
    }
    expect(layoutRoad(60, 640, 500).height).toBeGreaterThan(500);
  });
});

describe('the studs of the road', () => {
  it('stop short of every stop', () => {
    const a = { x: 100, y: 400 };
    const b = { x: 300, y: 400 };
    const studs = studsBetween(a, b, STOP_CLEAR.wave, STOP_CLEAR.boss);
    expect(studs.length).toBeGreaterThan(0);
    for (const s of studs) {
      expect(Math.hypot(s.x - a.x, s.y - a.y)).toBeGreaterThanOrEqual(STOP_CLEAR.wave);
      expect(Math.hypot(s.x - b.x, s.y - b.y)).toBeGreaterThanOrEqual(STOP_CLEAR.boss);
    }
  });

  it('draws none between stops that touch', () => {
    expect(studsBetween({ x: 0, y: 0 }, { x: 50, y: 0 }, 34, 34)).toEqual([]);
  });
});

describe('the scene', () => {
  it('is drawn at 2x at least and at a larger whole number to cover a bigger box', () => {
    expect(sceneScale(700, 600)).toBe(2);
    expect(sceneScale(736, 632)).toBe(2);
    expect(sceneScale(1100, 950)).toBe(4);
    expect(Number.isInteger(sceneScale(1234, 777))).toBe(true);
  });

  it('names the picture of each dungeon and puts a dark plate under the light ones', () => {
    expect(sceneName('ember_crypt')).toBe('ember_crypt');
    expect(sceneName('thunderpeak_aerie')).toBe('stormwrack_cove');
    expect(sceneIsLight('frostspire_vault')).toBe(true);
    expect(sceneIsLight('sunken_sanctum')).toBe(true);
    expect(sceneIsLight('ember_crypt')).toBe(false);
  });
});
