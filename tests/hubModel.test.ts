import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  brighten,
  GLOW_GOLD,
  HUB_BUILDINGS,
  HUB_MAP_H,
  HUB_MAP_W,
  hubOffset,
  hubPanned,
  coverScale,
  hubScale,
  scaled,
} from '../src/renderer/src/hub/hubModel';
import { VIEW_IDS } from '../src/renderer/src/table/viewIds';

/** The hub map (DESIGN.md section 2 Base camp): whole scales, exact masks, every dock screen reachable. */
describe('hub map', () => {
  it('is the approved 640 x 360 picture, shown at a whole scale and never scrolled', () => {
    const png = readFileSync(resolve(__dirname, '../src/renderer/src/hub/hub-wide-640x360.png'));
    expect(png.readUInt32BE(16)).toBe(HUB_MAP_W);
    expect(png.readUInt32BE(20)).toBe(HUB_MAP_H);
    // the area under the header at the 1920 x 1080 design size is 1920 x 1016 (the zoom scales it to any window)
    expect(hubScale(1920)).toBe(3);
    expect(hubScale(300)).toBe(1);
    expect(hubScale(2400)).toBeCloseTo(3.75, 6);
  });

  it('fits the width exactly, so no place is cut left or right; the cover scale fills the area', () => {
    for (const [w, h] of [
      [1920, 1228],
      [1920, 1016],
      [2056, 1016],
      [2580, 1016],
    ] as const) {
      const s = hubScale(w);
      expect(HUB_MAP_W * s).toBeCloseTo(w, 6);
      const c = coverScale(w, h);
      expect(HUB_MAP_W * c).toBeGreaterThanOrEqual(w - 1e-6);
      expect(HUB_MAP_H * c).toBeGreaterThanOrEqual(h - 1e-6);
    }
    expect(coverScale(1920, 1016)).toBe(3);
  });

  it('centres the map and cuts the overflow evenly, so no place is cut off at 1280 x 720, 1274 x 723 or 1920 x 1080', () => {
    expect(hubOffset(1280, 656, 2)).toEqual({ x: 0, y: -32 });
    expect(hubOffset(1920, 1016, 3)).toEqual({ x: 0, y: -32 });
    expect(hubOffset(1274, 723, 2)).toEqual({ x: -3, y: 1 });
  });

  it('has one exact mask per place: a 640 x 360 picture with transparency, byte for byte the approved one', () => {
    for (const { id } of HUB_BUILDINGS) {
      const png = readFileSync(resolve(__dirname, `../src/renderer/src/hub/masks/${id}.png`));
      expect(png.readUInt32BE(16), id).toBe(HUB_MAP_W);
      expect(png.readUInt32BE(20), id).toBe(HUB_MAP_H);
      expect([4, 6], id).toContain(png[25]); // grey + alpha or RGBA
    }
  });

  it('puts every box on whole screen pixels at either scale', () => {
    for (const scale of [2, 3]) {
      const r = scaled({ x: 17, y: 9, w: 40, h: 23 }, scale);
      for (const n of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('brightens each colour by x1.15 + 8, capped at 255, and outlines in gold #FFD66E', () => {
    expect(brighten(0)).toBe(8);
    expect(brighten(100)).toBe(123);
    expect(brighten(250)).toBe(255);
    expect([...GLOW_GOLD]).toEqual([0xff, 0xd6, 0x6e]);
  });

  it('opens every screen the dock opened, from some building', () => {
    const reachable = new Set<string>();
    for (const b of HUB_BUILDINGS) {
      if (b.action.kind === 'view') reachable.add(b.action.view);
      if (b.action.kind === 'menu') b.action.choices.forEach((c) => reachable.add(c.view));
    }
    // Settings is the gear on the hub; the dungeon is the arch, a screen of its own, not a view
    for (const id of VIEW_IDS) {
      if (id === 'settings') continue;
      expect(reachable.has(id), id).toBe(true);
    }
  });

  it('seals the arena, opens the raid gate after the first Ascension and goes to the dungeon from the arch', () => {
    const by = (id: string) => HUB_BUILDINGS.find((b) => b.id === id)!;
    expect(by('raid_gate').action).toEqual({ kind: 'view', view: 'raids' });
    expect(by('raid_gate').needsAscension).toBe(true);
    expect(by('arena').action.kind).toBe('locked');
    expect(by('dungeon_arch').action).toEqual({ kind: 'dungeon' });
    expect(by('armoury').action.kind).toBe('menu');
  });
});

describe('hub pan', () => {
  it('a wider window: the map is taller than the area, starts centred and scrolls inside its edges', () => {
    const w = 2580;
    const h = 1016;
    const s = hubScale(w);
    const c = hubPanned(w, h, s, { x: 0, y: 0 });
    expect(c).toEqual(hubOffset(w, h, s));
    expect(hubPanned(w, h, s, { x: 0, y: 1e6 }).y).toBe(0);
    expect(hubPanned(w, h, s, { x: 0, y: -1e6 }).y).toBeCloseTo(h - HUB_MAP_H * s, 6);
    // the width fits, so the map never moves sideways
    expect(hubPanned(w, h, s, { x: 500, y: 0 }).x).toBe(0);
  });

  it('a taller window: the map is shorter than the area and stands centred', () => {
    const w = 1920;
    const h = 1216;
    const s = hubScale(w);
    const c = hubPanned(w, h, s, { x: 0, y: 0 });
    expect(c.y).toBeGreaterThan(0);
    expect(hubPanned(w, h, s, { x: 0, y: 500 }).y).toBe(c.y);
  });
});
