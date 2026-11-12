import { describe, expect, it } from 'vitest';
import { loadContent, type RankTier } from '../src/data';
import { lookStep } from '../src/game';
import { cardTierArt, itemArt } from '../src/renderer/src/art/items';
import { sprite } from '../src/renderer/src/art/pixel/sprites';

const content = loadContent();
const STEPPED = [
  'sword',
  'greatsword',
  'dagger',
  'hammer',
  'lance',
  'bow',
  'scythe',
  'logging_axe',
] as const;
const OTHER = ['spear', 'staff', 'pickaxe'] as const;

/** The steps the stars give at each tier (DESIGN.md §5 Look steps by stars), ★1 to ★6. */
const EXPECTED: Record<string, number[]> = {
  wood: [0, 0, 0, 0, 0, 0],
  bronze: [0, 0, 0, 1, 1, 1],
  silver: [0, 0, 1, 1, 2, 2],
  gold: [0, 1, 1, 2, 2, 3],
};

describe('weapon look steps (DESIGN.md §5)', () => {
  it('maps stars to a step inside each tier, from the data file', () => {
    for (const [tier, steps] of Object.entries(EXPECTED))
      for (const kind of STEPPED)
        steps.forEach((step, i) =>
          expect(
            lookStep(content, kind, tier as RankTier, i + 1),
            `${kind} ${tier} ★${i + 1}`,
          ).toBe(step),
        );
  });

  it('gives the other types and the upper tiers the one look', () => {
    for (const kind of OTHER)
      for (const tier of ['wood', 'bronze', 'silver', 'gold'] as const)
        expect(lookStep(content, kind, tier, 6)).toBe(0);
    for (const tier of ['prismatic', 'mythic', 'heirloom'] as const)
      expect(lookStep(content, 'sword', tier, 6)).toBe(0);
  });

  it('has the ten pictures of each of the eight types and keeps one per tier for the rest', () => {
    const looks = [
      ['t1', 0],
      ['t2', 0],
      ['t2', 1],
      ['t3', 0],
      ['t3', 1],
      ['t3', 2],
      ['t4', 0],
      ['t4', 1],
      ['t4', 2],
      ['t4', 3],
    ] as const;
    for (const kind of STEPPED)
      for (const [t, s] of looks)
        expect(sprite(`item-${kind}-${t}-${s}`), `${kind} ${t}-${s}`).toBeTruthy();
    for (const kind of STEPPED)
      expect(sprite(`item-${kind}-t1`), `${kind} old Wood`).toBeUndefined();
    for (const kind of OTHER)
      for (const t of ['t1', 't2', 't3', 't4']) expect(sprite(`item-${kind}-${t}`)).toBeTruthy();
  });

  it('draws a different picture for each step and the same one for a type without steps', () => {
    for (const kind of STEPPED) {
      const gold = [0, 1, 2, 3].map((s) => itemArt(kind, 'epic', 'gold', 'epic', undefined, s));
      expect(new Set(gold).size, kind).toBe(4);
      expect(itemArt(kind, 'epic', 'wood')).toBe(
        itemArt(kind, 'epic', 'wood', 'epic', undefined, 0),
      );
    }
    for (const kind of OTHER)
      expect(itemArt(kind, 'epic', 'gold', 'epic', undefined, 3)).toBe(
        itemArt(kind, 'epic', 'gold'),
      );
  });

  it('shows the BASE of a tier when no step is given (the Next tier preview)', () => {
    const card = content.cards.find((c) => c.item.kind === 'sword')!;
    expect(cardTierArt(card, 'silver')).toBe(cardTierArt(card, 'silver', 0));
    expect(cardTierArt(card, 'silver', 2)).not.toBe(cardTierArt(card, 'silver', 0));
  });
});
