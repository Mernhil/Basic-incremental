import { describe, expect, it } from 'vitest';
import {
  craftFinished,
  emptyTray,
  sceneUnit,
  trayAdd,
  TRAY_TILES,
} from '../src/renderer/src/views/gathering/forgeStage';

describe('forge stage model', () => {
  it('picks the scale that covers the space exactly, at least 1 (3 at the 1920 x 1080 design size)', () => {
    expect(sceneUnit(1920, 1016)).toBe(3);
    expect(sceneUnit(1920, 960)).toBe(3);
    expect(sceneUnit(2400, 1016)).toBeCloseTo(3.75, 6);
    expect(sceneUnit(300, 200)).toBe(1);
  });

  it('sees a finished craft only when the bar wraps on the same recipe', () => {
    const a = { recipe: 'r1', fraction: 0.95 };
    expect(craftFinished(a, { recipe: 'r1', fraction: 0.05 })).toBe(true);
    expect(craftFinished(a, { recipe: 'r1', fraction: 0.97 })).toBe(false);
    expect(craftFinished(a, { recipe: 'r2', fraction: 0.05 })).toBe(false);
    expect(craftFinished(a, null)).toBe(false);
    expect(craftFinished(null, a)).toBe(false);
  });

  it('keeps the newest tiles and counts everything', () => {
    let t = emptyTray();
    for (let i = 0; i < TRAY_TILES + 3; i++) t = trayAdd(t, 'iron_gem');
    expect(t.items).toHaveLength(TRAY_TILES);
    expect(t.total).toBe(TRAY_TILES + 3);
    expect(t.items[0]!.id).toBe(4);
  });
});
