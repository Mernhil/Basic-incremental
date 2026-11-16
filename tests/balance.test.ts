import { describe, expect, it } from 'vitest';
import { loadContent, RANK_TIERS } from '../src/data';
import { cardStatPower, newOwnedCard, tierStepAt } from '../src/game';

/** Rules of the balance run (DESIGN.md §14) checked on the shipped numbers. */
const shipped = loadContent();

describe('shipped balance (DESIGN.md §5, §6, §14)', () => {
  it('keeps each tier a full step over the one below: at least ★6 over ★1', () => {
    const { statTier, starMultiplier } = shipped.cardRules.power;
    const star6 = starMultiplier[starMultiplier.length - 1]!;
    for (let i = 1; i < RANK_TIERS.length; i++) {
      const below = RANK_TIERS[i - 1]!;
      const tier = RANK_TIERS[i]!;
      expect(statTier[tier] / statTier[below], tier).toBeGreaterThanOrEqual(star6);
    }
  });

  it("brings a card's strength in with its levels (DESIGN.md §5 Strength comes with the card's levels)", () => {
    const { statTier, tierStepLevels } = shipped.cardRules.power;
    const caps = shipped.cardRules.levelCaps;
    const at = (tier: (typeof RANK_TIERS)[number], level: number): number =>
      tierStepAt(shipped, statTier, tier, level);
    // every card starts on the Wood step, whatever its tier
    for (const tier of RANK_TIERS.slice(0, 6)) expect(at(tier, 1), tier).toBe(statTier.wood);
    // a Prismatic card gains each step as it passes the old caps 20, 40, 60 and 80
    expect(at('prismatic', caps.wood)).toBe(statTier.wood);
    expect(at('prismatic', caps.wood + tierStepLevels)).toBeCloseTo(statTier.bronze);
    expect(at('prismatic', caps.bronze + tierStepLevels)).toBeCloseTo(statTier.silver);
    expect(at('prismatic', caps.silver + tierStepLevels)).toBeCloseTo(statTier.gold);
    expect(at('prismatic', caps.gold + tierStepLevels)).toBeCloseTo(statTier.prismatic);
    expect(at('prismatic', caps.prismatic)).toBeCloseTo(statTier.prismatic);
    // it never passes its own tier, and it never goes down with a level
    expect(at('bronze', 40)).toBeCloseTo(statTier.bronze);
    expect(at('wood', 20)).toBe(statTier.wood);
    for (const tier of RANK_TIERS.slice(0, 6)) {
      for (let level = 2; level <= caps[tier]; level++) {
        expect(at(tier, level), `${tier} ${level}`).toBeGreaterThanOrEqual(at(tier, level - 1));
      }
      expect(at(tier, caps[tier]), tier).toBeCloseTo(statTier[tier]);
    }
    // a T6 card has its full step from a little past Lv 100; an Heirloom has its own
    expect(at('mythic', caps.prismatic + tierStepLevels)).toBeCloseTo(statTier.mythic);
    expect(at('heirloom', 1)).toBe(statTier.heirloom);
    // a fresh card of a higher tier still beats a fresh card of the tier below (its base stats)
    const fresh = (tier: (typeof RANK_TIERS)[number]) =>
      cardStatPower(shipped, newOwnedCard(tier)) *
      shipped.cardRules.baseDamage[tier === 'heirloom' ? 'mythic' : tier].toNumber();
    for (let i = 1; i < 6; i++)
      expect(fresh(RANK_TIERS[i]!)).toBeGreaterThan(fresh(RANK_TIERS[i - 1]!));
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
