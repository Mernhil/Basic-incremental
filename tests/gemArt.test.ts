import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  COIN_RING,
  METAL_LADDER,
  NAV_GLYPHS,
  coinVector,
  edgeVector,
  medalVector,
  metalForTier,
  ramp,
  shapePoints,
} from '../src/renderer/src/art/vector/gems';
import { TILE_STAGES, mineVector, treeVector } from '../src/renderer/src/art/vector/tiles';
import { sprite } from '../src/renderer/src/art/pixel/sprites';

const content = loadContent();
const gemOf = (id: string) => content.resourceById.get(id)!.gem!;
const gems = content.resources.filter((r) => r.gem).map((r) => r.gem!);

describe('gem art (DESIGN.md §12)', () => {
  it('draws each shape with its own outline; round uses many facets so it reads as round', () => {
    expect(shapePoints('round', 50, 50, 10)).toHaveLength(24);
    expect(shapePoints('pentagon', 50, 50, 10)).toHaveLength(5);
    expect(shapePoints('star', 50, 50, 10)).toHaveLength(10);
    expect(shapePoints('square', 50, 50, 10)).toHaveLength(4);
    expect(shapePoints('hexagon', 50, 50, 10)).toHaveLength(6);
    expect(shapePoints('drop', 50, 50, 10)).toHaveLength(12);
  });

  it('maps mastery tiers onto the one metal ladder', () => {
    expect([0, 1, 2, 3, 4, 9].map(metalForTier)).toEqual([
      'stone',
      'bronze',
      'silver',
      'gold',
      'prism',
      'prism',
    ]);
  });

  it('builds Brave Frontier ramps: five tones, light to dark', () => {
    const r = ramp(44, 0.9, 0.55);
    expect(r).toHaveLength(5);
    const lum = (c: string) => [1, 3, 5].reduce((s, i) => s + parseInt(c.slice(i, i + 2), 16), 0);
    for (let i = 1; i < 5; i++) expect(lum(r[i]!)).toBeLessThan(lum(r[i - 1]!));
  });

  it('shows the gem in the coin, and a locked coin in grey with a padlock', () => {
    const oak = coinVector(gemOf('oak_gem'), 'bronze', false);
    expect(oak).toContain(gemOf('oak_gem').colors[0]);
    const locked = coinVector(gemOf('grotto_gem'), 'stone', true);
    expect(locked).not.toContain(gemOf('grotto_gem').colors[1]);
    expect(locked).toContain('#c8ccd4'); // the shackle
  });

  it('bakes a 48 px coin for every gem at every mastery metal, plus the locked coin', () => {
    for (const g of gems) {
      for (const m of METAL_LADDER)
        expect(sprite(`coin-${g.shape}-${m}`)).toMatchObject({ w: 48, h: 48 });
      expect(sprite(`coin-${g.shape}-locked`)).toBeDefined();
    }
    expect(Object.keys(COIN_RING)).toEqual([...METAL_LADDER]);
  });

  it('bakes 48 px medals with a stud, and a white diamond stud on Prismatic', () => {
    for (let t = 0; t < 5; t++) expect(sprite(`medal-${t}`)).toMatchObject({ w: 48, h: 48 });
    expect(medalVector(4)).toContain('fill="#ffffff" stroke');
    expect(medalVector(1)).toContain('<circle');
  });

  it('bakes a 64 px plaque for every navigation glyph', () => {
    for (const g of Object.keys(NAV_GLYPHS))
      expect(sprite(`plaque-${g}`)).toMatchObject({ w: 64, h: 64 });
  });

  it('forges the edge from the line gem, prismatic at the last step', () => {
    const copper = gemOf('copper_gem');
    expect(edgeVector(copper, 0)).toContain('#ffc78e');
    expect(edgeVector(copper, 4)).toContain('#ffd0f4');
    for (const m of content.mines) {
      const g = content.resourceById.get(m.resource)!.gem!;
      for (let s = 0; s < 5; s++) expect(sprite(`edge-${g.shape}-${s}`)).toBeDefined();
    }
  });

  it('grows the tiles over five stages on a 58 x 64 grid, trees with gem leaves', () => {
    const oak = content.treeById.get('oak')!;
    expect(treeVector(oak.art.bark, gemOf('oak_gem'), 0)).toContain(oak.art.bark[0]);
    expect(mineVector(gemOf('copper_gem'), 4).length).toBeGreaterThan(
      mineVector(gemOf('copper_gem'), 0).length,
    );
    for (const t of content.trees) {
      const g = content.resourceById.get(t.resource)!.gem!;
      for (let s = 0; s < TILE_STAGES; s++)
        expect(sprite(`tile-tree-${g.shape}-${s}`)).toMatchObject({ w: 58, h: 64 });
    }
    for (const m of content.mines) {
      const g = content.resourceById.get(m.resource)!.gem!;
      for (let s = 0; s < TILE_STAGES; s++)
        expect(sprite(`tile-mine-${g.shape}-${s}`)).toBeDefined();
    }
  });

  it('never repeats a clip or gradient id, so many tiles can share one page', () => {
    const markup =
      treeVector(content.treeById.get('oak')!.art.bark, gemOf('oak_gem'), 3) +
      mineVector(gemOf('iron_gem'), 3) +
      coinVector(gemOf('iron_gem'), 'gold', false) +
      coinVector(gemOf('iron_gem'), 'gold', false);
    const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
