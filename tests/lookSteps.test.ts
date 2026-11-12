import { describe, expect, it } from 'vitest';
import { loadContent, type RankTier } from '../src/data';
import { lookStep } from '../src/game';
import { cardTierArt, itemArt } from '../src/renderer/src/art/items';
import { sprite } from '../src/renderer/src/art/pixel/sprites';

const content = loadContent();
/** The types with Wood to Gold concept-sheet pictures (ten per type). */
const LOW = [
  'sword',
  'greatsword',
  'dagger',
  'hammer',
  'lance',
  'bow',
  'scythe',
  'logging_axe',
] as const;
/** The types with Prismatic, Mythic and Void concept-sheet pictures (17 per type). */
const TOP = [
  'sword',
  'greatsword',
  'spear',
  'lance',
  'hammer',
  'scythe',
  'pickaxe',
  'logging_axe',
] as const;
const ALL = [
  'sword',
  'greatsword',
  'spear',
  'lance',
  'dagger',
  'hammer',
  'bow',
  'staff',
  'scythe',
  'pickaxe',
  'logging_axe',
] as const;

/** The steps the stars give at each tier (DESIGN.md §5 Look steps by stars), ★1 to ★6. */
const EXPECTED: Record<string, { kinds: readonly string[]; steps: number[] }> = {
  wood: { kinds: LOW, steps: [0, 0, 0, 0, 0, 0] },
  bronze: { kinds: LOW, steps: [0, 0, 0, 1, 1, 1] },
  silver: { kinds: LOW, steps: [0, 0, 1, 1, 2, 2] },
  gold: { kinds: LOW, steps: [0, 1, 1, 2, 2, 3] },
  prismatic: { kinds: TOP, steps: [0, 1, 2, 3, 4, 4] },
  mythic: { kinds: TOP, steps: [0, 1, 2, 3, 4, 5] },
};

describe('weapon look steps (DESIGN.md §5)', () => {
  it('maps stars to a step inside each tier, from the data file', () => {
    for (const [tier, { kinds, steps }] of Object.entries(EXPECTED))
      for (const kind of kinds)
        steps.forEach((step, i) =>
          expect(
            lookStep(content, kind as (typeof ALL)[number], tier as RankTier, i + 1),
            `${kind} ${tier} ★${i + 1}`,
          ).toBe(step),
        );
  });

  it('gives a type with no pictures at a tier, and the Heirloom, the one look', () => {
    for (const tier of ['wood', 'bronze', 'silver', 'gold'] as const)
      for (const kind of ['spear', 'pickaxe', 'staff'] as const)
        expect(lookStep(content, kind, tier, 6), `${kind} ${tier}`).toBe(0);
    for (const tier of ['prismatic', 'mythic'] as const)
      for (const kind of ['dagger', 'bow', 'staff'] as const)
        expect(lookStep(content, kind, tier, 6), `${kind} ${tier}`).toBe(0);
    for (const kind of ALL) expect(lookStep(content, kind, 'heirloom', 6)).toBe(0);
  });

  it('has the ten Wood to Gold pictures of each of the eight types and keeps one per tier for the rest', () => {
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
    for (const kind of LOW)
      for (const [t, s] of looks)
        expect(sprite(`item-${kind}-${t}-${s}`), `${kind} ${t}-${s}`).toBeTruthy();
    for (const kind of LOW) expect(sprite(`item-${kind}-t1`), `${kind} old Wood`).toBeUndefined();
    for (const kind of ['spear', 'staff', 'pickaxe'] as const)
      for (const t of ['t1', 't2', 't3', 't4']) expect(sprite(`item-${kind}-${t}`)).toBeTruthy();
  });

  it('has the 17 top-tier pictures of each of eight types and one Heirloom picture per side of all 11', () => {
    for (const kind of TOP) {
      for (const [t, n] of [
        ['t5', 5],
        ['t6m', 6],
        ['t6v', 6],
      ] as const) {
        for (let s = 0; s < n; s++)
          expect(sprite(`item-${kind}-${t}-${s}`), `${kind} ${t}-${s}`).toBeTruthy();
        expect(sprite(`item-${kind}-${t}-${n}`), `${kind} ${t} has only ${n}`).toBeUndefined();
        expect(sprite(`item-${kind}-${t}`), `${kind} old ${t}`).toBeUndefined();
      }
    }
    for (const kind of ['dagger', 'bow', 'staff'] as const)
      for (const t of ['t5', 't6m', 't6v']) expect(sprite(`item-${kind}-${t}`)).toBeTruthy();
    for (const kind of ALL)
      for (const side of ['hm', 'hv']) {
        const s = sprite(`item-${kind}-${side}`);
        expect(s, `${kind} ${side}`).toBeTruthy();
        expect(s!.w, `${kind} ${side} is a straight picture`).toBeGreaterThanOrEqual(300);
      }
  });

  it('draws a different picture for each step and the same one for a type without steps', () => {
    for (const kind of LOW) {
      const gold = [0, 1, 2, 3].map((s) => itemArt(kind, 'epic', 'gold', 'epic', undefined, s));
      expect(new Set(gold).size, kind).toBe(4);
      expect(itemArt(kind, 'epic', 'wood')).toBe(
        itemArt(kind, 'epic', 'wood', 'epic', undefined, 0),
      );
    }
    for (const kind of TOP) {
      const prismatic = [0, 1, 2, 3, 4].map((s) =>
        itemArt(kind, 'epic', 'prismatic', 'epic', undefined, s),
      );
      expect(new Set(prismatic).size, `${kind} prismatic`).toBe(5);
      for (const side of ['mythic', 'void'] as const) {
        const six = [0, 1, 2, 3, 4, 5].map((s) =>
          itemArt(kind, side, 'mythic', side, undefined, s),
        );
        expect(new Set(six).size, `${kind} ${side}`).toBe(6);
      }
    }
    for (const kind of ['spear', 'staff', 'pickaxe'] as const)
      expect(itemArt(kind, 'epic', 'gold', 'epic', undefined, 3)).toBe(
        itemArt(kind, 'epic', 'gold'),
      );
    for (const kind of ['dagger', 'bow', 'staff'] as const)
      expect(itemArt(kind, 'mythic', 'mythic', 'mythic', undefined, 5)).toBe(
        itemArt(kind, 'mythic', 'mythic', 'mythic'),
      );
  });

  it('shows the BASE of a tier when no step is given (the Next tier preview)', () => {
    const card = content.cards.find((c) => c.item.kind === 'sword')!;
    expect(cardTierArt(card, 'silver')).toBe(cardTierArt(card, 'silver', 0));
    expect(cardTierArt(card, 'silver', 2)).not.toBe(cardTierArt(card, 'silver', 0));
    expect(cardTierArt(card, 'prismatic', 4)).not.toBe(cardTierArt(card, 'prismatic', 0));
  });
});
