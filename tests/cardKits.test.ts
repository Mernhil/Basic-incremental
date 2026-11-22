import { cardStyle } from '../src/data';
import { describe, expect, it } from 'vitest';
import { baseKitOf, resolveCard, createInitialState } from '../src/game';
import { kitName } from '../src/renderer/src/art/frame';
import { sprite } from '../src/renderer/src/art/pixel/sprites';
import { content } from './helpers';

/** DESIGN §5 The base frame: every art batch has one shared border, worn at every tier. */
describe('card kits (DESIGN.md §5 The base frame)', () => {
  it('has a 212 x 256 kit picture for every batch', () => {
    expect(content.batches.map((b) => b.id)).toEqual(['dragon', 'leviathan', 'wildwood']);
    for (const b of content.batches) expect(sprite(b.kit), b.kit).toMatchObject({ w: 212, h: 256 });
  });

  it('gives the Dragon kit to every card without a batch and its own kit to each later batch', () => {
    const state = createInitialState(content);
    for (const c of content.cards) {
      const want = c.starterArt
        ? `kit-starter-${c.id}`
        : c.batch
          ? `kit-t6-${c.batch}`
          : 'kit-t6-dragon';
      expect(baseKitOf(content, c.id), c.id).toBe(want);
      const look = resolveCard(content, state.cosmetics.loadout, {
        id: c.id,
        rank: { tier: 'wood', stars: 1 },
        rarity: cardStyle(c),
      });
      expect(look.baseKit).toBe(want);
    }
    expect(content.cards.some((c) => c.heirloom && !c.batch)).toBe(true);
  });

  it('gives each starter weapon its own 212 x 256 kit, at every tier', () => {
    const starters = content.cards.filter((c) => c.starterArt);
    expect(starters.map((c) => c.id).sort()).toEqual([
      'dawnpiercer',
      'emberbrand',
      'geodefall',
      'tidecaller',
      'voidthorn',
    ]);
    for (const c of starters) {
      const kit = `kit-starter-${c.id}`;
      expect(baseKitOf(content, c.id)).toBe(kit);
      expect(sprite(kit), kit).toMatchObject({ w: 212, h: 256 });
      for (const tier of ['wood', 'gold', 'mythic', 'heirloom'] as const)
        expect(kitName(tier, kit, true)).toBe(kit);
    }
  });
});
