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
  it('is the approved 384 x 688 picture, shown at 2x or 3x only', () => {
    const png = readFileSync(resolve(__dirname, '../src/renderer/src/hub/hub-map-384x688.png'));
    expect(png.readUInt32BE(16)).toBe(HUB_MAP_W);
    expect(png.readUInt32BE(20)).toBe(HUB_MAP_H);
    for (const width of [800, 1000, 1280, 1400, 1600, 1920, 2560]) {
      expect([2, 3]).toContain(hubScale(width));
    }
    expect(hubScale(1280)).toBe(2);
    expect(hubScale(1920)).toBe(3);
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
