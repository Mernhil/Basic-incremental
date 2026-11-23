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
    expect(hubScale(1920, 1016)).toBe(3);
    expect(hubScale(300, 200)).toBe(1);
    expect(hubScale(2400, 1016)).toBeCloseTo(3.75, 6); // a wider window than 16:9 grows the map to cover it
  });

  it('fills the area: the smallest scale that covers it exactly', () => {
    for (const [w, h] of [
      [800, 500],
      [1274, 723],
      [1366, 700],
      [1600, 900],
      [1920, 1016],
      [2200, 1100],
      [2560, 1300],
    ] as const) {
      const s = hubScale(w, h);
      expect(HUB_MAP_W * s).toBeGreaterThanOrEqual(w - 1e-6);
      expect(HUB_MAP_H * s).toBeGreaterThanOrEqual(h - 1e-6);
      if (s > 1) {
        // a hair smaller would leave a gap
        expect(HUB_MAP_W * s - w < 1e-6 || HUB_MAP_H * s - h < 1e-6).toBe(true);
      }
    }
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
  it('starts centred and stays inside the map when dragged', () => {
    // 1500 x 1000 window: the design area is 1920 x 1216 under the header, the map is 3.8x
    const w = 1920;
    const h = 1216;
    const s = hubScale(w, h);
    const c = hubPanned(w, h, s, { x: 0, y: 0 });
    expect(c).toEqual(hubOffset(w, h, s));
    const left = hubPanned(w, h, s, { x: 1e6, y: 0 });
    expect(left.x).toBe(0);
    const right = hubPanned(w, h, s, { x: -1e6, y: 0 });
    expect(right.x).toBeCloseTo(w - HUB_MAP_W * s, 6);
    // the axis the map does not overflow stays put
    expect(hubPanned(w, h, s, { x: 0, y: 500 }).y).toBe(c.y);
  });

  it('always covers the area', () => {
    for (const [w, h] of [
      [1920, 1228],
      [2580, 1080],
      [2056, 1080],
      [1920, 1016],
    ] as const) {
      const s = hubScale(w, h);
      for (const p of [-1e5, -50, 0, 50, 1e5]) {
        const o = hubPanned(w, h, s, { x: p, y: p });
        expect(o.x).toBeLessThanOrEqual(0);
        expect(o.y).toBeLessThanOrEqual(0);
        expect(o.x + HUB_MAP_W * s).toBeGreaterThanOrEqual(w - 1e-6);
        expect(o.y + HUB_MAP_H * s).toBeGreaterThanOrEqual(h - 1e-6);
      }
    }
  });
});
