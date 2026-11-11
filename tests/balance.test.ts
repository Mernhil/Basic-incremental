import { describe, expect, it } from 'vitest';
import { loadContent, RANK_TIERS } from '../src/data';
import { cardStatPower, newOwnedCard } from '../src/game';

/** Rules of the balance run (DESIGN.md §14) checked on the shipped numbers. */
const shipped = loadContent();

describe('shipped balance (DESIGN.md §5, §6, §14)', () => {
  it('never weakens a card on a tier-up: the stat step is at least ★6 over ★1', () => {
    const { statTier, starMultiplier } = shipped.cardRules.power;
    const star6 = starMultiplier[starMultiplier.length - 1]!;
    for (let i = 1; i < RANK_TIERS.length; i++) {
      const below = RANK_TIERS[i - 1]!;
      const tier = RANK_TIERS[i]!;
      expect(statTier[tier] / statTier[below], tier).toBeGreaterThanOrEqual(star6);
      const before = { ...newOwnedCard(), tier: below, stars: 6, level: 20 };
      const after = { ...before, tier, stars: 1 };
      expect(cardStatPower(shipped, after)).toBeGreaterThanOrEqual(
        cardStatPower(shipped, before) * (1 - 1e-9),
      );
    }
  });

  it('pays more of everything on a harder tier: Money per HP, wage, card XP and materials', () => {
    const { hard, nightmare } = shipped.combat.difficulties;
    // Purses follow HP and a harder tier pays half as much again (DESIGN.md §6 Deeper pays more).
    expect(hard.purse / hard.hp).toBeCloseTo(1.5, 9);
    expect(nightmare.purse / nightmare.hp).toBeCloseTo(1.5 * 1.5, 9);
    for (const key of ['wage', 'xp', 'material'] as const) {
      expect(hard[key], key).toBeGreaterThan(1);
      expect(nightmare[key], key).toBeGreaterThan(hard[key]);
    }
    expect(nightmare.hp).toBeGreaterThan(hard.hp);
  });

  it('puts every dungeon boss above the one before it', () => {
    const hp = shipped.dungeons.map((d) => d.boss.hp.toNumber());
    for (let i = 1; i < hp.length; i++) expect(hp[i]!).toBeGreaterThan(hp[i - 1]!);
  });
});
