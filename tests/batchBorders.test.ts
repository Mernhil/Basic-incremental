import { describe, expect, it } from 'vitest';
import { baseBorderOf, resolveCard, createInitialState } from '../src/game';
import {
  cardFrame,
  BORDER_H,
  BORDER_LEFT,
  BORDER_TOP,
  BORDER_W,
} from '../src/renderer/src/art/frame';
import { sprite } from '../src/renderer/src/art/pixel/sprites';
import { content } from './helpers';

/** DESIGN §5 The base frame: every art batch has one shared border, worn at every tier. */
describe('batch base borders (DESIGN.md §5 The base frame)', () => {
  it('has a 212 x 256 border picture for every batch', () => {
    expect(content.batches.map((b) => b.id)).toEqual(['dragon', 'leviathan']);
    for (const b of content.batches)
      expect(sprite(b.border), b.border).toMatchObject({ w: 212, h: 256 });
    expect([BORDER_W, BORDER_H]).toEqual([212, 256]);
    // the card's own 132 x 186 rectangle sits at 40, 35: a 70/30 band, nothing cut
    expect([
      BORDER_LEFT,
      BORDER_TOP,
      BORDER_W - BORDER_LEFT - 132,
      BORDER_H - BORDER_TOP - 186,
    ]).toEqual([40, 35, 40, 35]);
  });

  it('gives the Dragon border to every card without a batch and the Leviathan one to its batch', () => {
    const state = createInitialState(content);
    for (const c of content.cards) {
      const want = c.batch === 'leviathan' ? 'border-leviathan' : 'border-dragon';
      expect(baseBorderOf(content, c.id), c.id).toBe(want);
      const look = resolveCard(content, state.cosmetics.loadout, {
        id: c.id,
        rank: { tier: 'wood', stars: 1 },
        rarity: c.rarity,
      });
      expect(look.baseBorder).toBe(want);
    }
    expect(content.cards.some((c) => c.heirloom && !c.batch)).toBe(true);
  });

  it('draws the picture over the card, 40 x 35 art pixels out on the card grid', () => {
    const svg = cardFrame('border-dragon');
    expect(svg).toContain('data-sprite="border-dragon"');
    expect(svg).toMatch(/x="-53\.33/);
    expect(cardFrame('border-nope')).toBe('');
  });
});
