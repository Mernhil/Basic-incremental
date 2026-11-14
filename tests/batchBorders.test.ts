import { describe, expect, it } from 'vitest';
import { baseBorderOf, resolveCard, createInitialState } from '../src/game';
import { sprite } from '../src/renderer/src/art/pixel/sprites';
import { content } from './helpers';

/** DESIGN §5 The base frame: every art batch has one shared border, worn at every tier. */
describe('batch base borders (DESIGN.md §5 The base frame)', () => {
  it('has a 212 x 256 border picture for every batch', () => {
    expect(content.batches.map((b) => b.id)).toEqual(['dragon', 'leviathan']);
    for (const b of content.batches)
      expect(sprite(b.border), b.border).toMatchObject({ w: 212, h: 256 });
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
});
