import { describe, expect, it } from 'vitest';
import {
  FRAME_METALS,
  TIER_ORDER,
  frameVector,
  mirror,
} from '../src/renderer/src/art/vector/frame';
import { sprite } from '../src/renderer/src/art/pixel/sprites';

describe('card frame ladder (DESIGN.md §5, §12)', () => {
  it('mirrors a path across the card centre line', () => {
    expect(mirror('M6 30 L-10 6')).toBe('M170 30 L186 6');
  });

  it('fills more sockets and grows the crest with every tier', () => {
    const gems = (t: (typeof TIER_ORDER)[number]) =>
      (frameVector(t).match(/fill="#ffffff"\/>/g) ?? []).length;
    // every filled socket gem carries a white glint
    expect(TIER_ORDER.map(gems)).toEqual([0, 2, 6, 8]); // Prismatic: six sockets and two crown gems
    expect(frameVector('bronze')).toContain('#5fae8a'); // patina spots
    expect(frameVector('gold')).toContain('#b0203e'); // red velvet liner
    expect(frameVector('prismatic')).toContain('#c8a8ff'); // radiant crown
  });

  it('draws each tier in its own metal', () => {
    for (const t of ['bronze', 'silver', 'gold'] as const)
      expect(frameVector(t)).toContain(FRAME_METALS[t].base);
    expect(frameVector('prismatic')).toContain('#eef4ff'); // the crystal band
  });

  it('is baked for every tier on the whole-card grid (132 x 186 card, room for the crest)', () => {
    for (const t of TIER_ORDER) expect(sprite(`frame-${t}`)).toMatchObject({ w: 183, h: 237 });
  });
});
