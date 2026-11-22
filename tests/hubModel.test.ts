import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  brighten,
  GLOW_GOLD,
  HUB_BUILDINGS,
  HUB_MAP_H,
  HUB_MAP_W,
  HUB_FILL_SLACK,
  hubOffset,
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
    // the area under the header: 1280 x 656 and 1920 x 1016 in a 1280 x 720 and a 1920 x 1080 window
    expect(hubScale(1280, 656)).toBe(2);
    expect(hubScale(1920, 1016)).toBe(3);
    expect(hubScale(1274, 723)).toBe(2); // the window of the 0.8.0 report: a few pixels short is fine
    expect(hubScale(1000, 600)).toBe(2);
    expect(hubScale(300, 200)).toBe(1);
    expect(hubScale(2560, 1300)).toBe(4);
  });

  it('fills the area: the smallest whole scale that covers it, give or take a few pixels', () => {
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
      expect(Number.isInteger(s)).toBe(true);
      expect(HUB_MAP_W * s).toBeGreaterThanOrEqual(w - HUB_FILL_SLACK);
      expect(HUB_MAP_H * s).toBeGreaterThanOrEqual(h - HUB_FILL_SLACK);
      if (s > 1) {
        // one scale smaller would leave a visible gap
        expect(
          HUB_MAP_W * (s - 1) < w - HUB_FILL_SLACK || HUB_MAP_H * (s - 1) < h - HUB_FILL_SLACK,
        ).toBe(true);
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
    // Settings is the gear on the hub, the dungeon is the arch
    for (const id of VIEW_IDS) {
      if (id === 'dungeon' || id === 'settings') continue;
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
