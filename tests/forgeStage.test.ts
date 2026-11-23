import { describe, expect, it } from 'vitest';
import {
  craftFinished,
  emptyTray,
  sceneUnit,
  trayAdd,
  TRAY_TILES,
  warmTone,
} from '../src/renderer/src/views/gathering/forgeStage';

describe('forge stage model', () => {
  it('picks the smallest whole scale that covers the space, at least 1', () => {
    expect(sceneUnit(1280, 600)).toBe(2);
    expect(sceneUnit(1274, 700)).toBe(2);
    expect(sceneUnit(1274, 760)).toBe(3);
    expect(sceneUnit(1920, 960)).toBe(3);
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

  it('tints the hit effect warm, light to deep', () => {
    expect(warmTone(255)).toEqual([0xff, 0xf1, 0xb8]);
    expect(warmTone(0)).toEqual([0xa8, 0x43, 0x0f]);
  });
});
