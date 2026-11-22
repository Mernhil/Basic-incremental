import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bounds,
  HUB_BUILDINGS,
  HUB_MAP_H,
  HUB_MAP_W,
  hubScale,
  overlappingBuildings,
  scaled,
} from '../src/renderer/src/hub/hubModel';
import { VIEW_IDS } from '../src/renderer/src/table/viewIds';

/** The hub map (DESIGN.md section 2 Base camp): whole scales, click areas on the picture, every dock screen reachable. */
describe('hub map', () => {
  it('is the approved 640 x 360 picture, shown at a whole scale and never scrolled', () => {
    const png = readFileSync(resolve(__dirname, '../src/renderer/src/hub/hub-wide-640x360.png'));
    expect(png.readUInt32BE(16)).toBe(HUB_MAP_W);
    expect(png.readUInt32BE(20)).toBe(HUB_MAP_H);
    // the area under the header: 1280 x 656 and 1920 x 1016 in a 1280 x 720 and a 1920 x 1080 window
    expect(hubScale(1280, 656)).toBe(2);
    expect(hubScale(1920, 1016)).toBe(3);
    expect(hubScale(1000, 600)).toBe(1);
    expect(hubScale(300, 200)).toBe(1);
    expect(hubScale(2560, 1300)).toBe(4);
    for (const [w, h] of [
      [800, 500],
      [1366, 700],
      [1600, 900],
      [2200, 1100],
    ] as const) {
      const s = hubScale(w, h);
      expect(Number.isInteger(s)).toBe(true);
      expect(HUB_MAP_W * s).toBeLessThanOrEqual(Math.max(w, HUB_MAP_W));
    }
  });

  it('puts every click area on whole screen pixels at either scale', () => {
    for (const scale of [2, 3]) {
      for (const b of HUB_BUILDINGS) {
        const r = scaled(bounds(b.shape), scale);
        for (const n of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(n)).toBe(true);
      }
    }
  });

  it('keeps every click area inside the picture and off every other', () => {
    for (const { id, shape } of HUB_BUILDINGS) {
      const rect = bounds(shape);
      expect(shape.length, id).toBeGreaterThanOrEqual(3);
      expect(rect.x, id).toBeGreaterThanOrEqual(0);
      expect(rect.y, id).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w, id).toBeLessThanOrEqual(HUB_MAP_W);
      expect(rect.y + rect.h, id).toBeLessThanOrEqual(HUB_MAP_H);
    }
    expect(overlappingBuildings()).toEqual([]);
  });

  it('opens every screen the dock opened, from some building', () => {
    const reachable = new Set<string>();
    for (const b of HUB_BUILDINGS) {
      if (b.action.kind === 'view') reachable.add(b.action.view);
      if (b.action.kind === 'menu') b.action.choices.forEach((c) => reachable.add(c.view));
    }
    // Settings is the gear on the hub, the dungeon is the arch
    for (const id of VIEW_IDS) {
      if (id === 'dungeon' || id === 'settings') continue;
      expect(reachable.has(id), id).toBe(true);
    }
  });

  it('seals the raid gate and the arena and goes to the dungeon from the arch', () => {
    const by = (id: string) => HUB_BUILDINGS.find((b) => b.id === id)!;
    expect(by('raid_gate').action.kind).toBe('locked');
    expect(by('arena').action.kind).toBe('locked');
    expect(by('dungeon_arch').action).toEqual({ kind: 'dungeon' });
    expect(by('armoury').action.kind).toBe('menu');
  });
});
