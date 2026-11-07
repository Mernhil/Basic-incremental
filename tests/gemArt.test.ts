import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  gemCoin,
  metalForTier,
  mineTile,
  shapePoints,
  sticker,
  treeTile,
} from '../src/renderer/src/art/gems';

const content = loadContent();
const gemOf = (id: string) => content.resourceById.get(id)!.gem!;

describe('gem art (DESIGN.md 13)', () => {
  it('draws each shape with its own outline; round uses many facets so it reads as round', () => {
    expect(shapePoints('round', 50, 50, 10)).toHaveLength(24);
    expect(shapePoints('pentagon', 50, 50, 10)).toHaveLength(5);
    expect(shapePoints('star', 50, 50, 10)).toHaveLength(10);
    expect(shapePoints('square', 50, 50, 10)).toHaveLength(4);
    expect(shapePoints('hexagon', 50, 50, 10)).toHaveLength(6);
    expect(shapePoints('drop', 50, 50, 10)).toHaveLength(12);
  });

  it('maps resource tiers to coin metals', () => {
    expect([1, 2, 3, 4, 9].map(metalForTier)).toEqual([
      'bronze',
      'silver',
      'gold',
      'prism',
      'prism',
    ]);
  });

  it('outlines the coin in its tier metal, and a locked coin in stone with a padlock', () => {
    const oak = gemCoin(gemOf('oak_gem'), 1);
    expect(oak).toContain('url(#bi-art-stk-bronze)');
    expect(oak).toContain('#f4c88e');
    const locked = gemCoin(gemOf('grotto_gem'), 3, true);
    expect(locked).toContain('url(#bi-art-stk-stone)');
    expect(locked).not.toContain('#9adcf2');
  });

  it('keeps twinkles outside the sticker outline so they stay crisp', () => {
    const out = sticker('<path d="M0 0"/><path class="bi-art-tw" d="M1 1"/>', 'gold');
    expect(out).toBe(
      '<g filter="url(#bi-art-stk-gold)"><path d="M0 0"/></g><path class="bi-art-tw" d="M1 1"/>',
    );
  });

  it('themes the tree tile with its colours and hangs its gems; mines show their gems', () => {
    const oak = content.treeById.get('oak')!;
    const tree = treeTile(oak, gemOf('oak_gem'));
    expect(tree).toContain(oak.art.leaf[0]);
    expect(tree).toContain('url(#bi-art-stk-white)');
    expect(mineTile(gemOf('copper_gem'))).toContain('#f08a3c');
  });

  it('never repeats a clip id, so many tiles can share one page', () => {
    const markup =
      treeTile(content.treeById.get('oak')!, gemOf('oak_gem')) + mineTile(gemOf('iron_gem'));
    const ids = [...markup.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
