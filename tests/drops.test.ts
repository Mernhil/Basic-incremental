import { describe, expect, it } from 'vitest';
import { createSeededRng, rollBossDrop } from '../src/game';
import { constantRng, content } from './helpers';

const drops = content.dungeons[0]!.drops; // chance 0.005, pity threshold 200, Money and both crystals

describe('rollBossDrop', () => {
  it('does not drop when the roll misses and pity is not reached', () => {
    const result = rollBossDrop(drops, 0, constantRng(0.999));
    expect(result.rare).toBe(false);
    expect(result.pity).toBe(1);
  });

  it('drops when the roll is under the chance, and resets pity', () => {
    const result = rollBossDrop(drops, 57, constantRng(0.001));
    expect(result.rare).toBe(true);
    expect(result.pity).toBe(0);
  });

  it('guarantees the drop on the pity-threshold-th kill', () => {
    const rng = constantRng(0.999); // never wins on its own
    let pity = 0;
    let kills = 0;
    let dropped = false;
    while (!dropped) {
      const roll = rollBossDrop(drops, pity, rng);
      pity = roll.pity;
      dropped = roll.rare;
      kills++;
      expect(kills).toBeLessThanOrEqual(drops.rare.pityThreshold);
    }
    expect(kills).toBe(drops.rare.pityThreshold);
    expect(pity).toBe(0);
  });

  it('matches the configured rate when pity is out of the way', () => {
    const noPity = { ...drops, rare: { ...drops.rare, pityThreshold: 1_000_000_000 } };
    const rng = createSeededRng(12345);
    const rolls = 400_000;
    let hits = 0;
    let pity = 0;
    for (let i = 0; i < rolls; i++) {
      const roll = rollBossDrop(noPity, pity, rng);
      pity = roll.pity;
      if (roll.rare) hits++;
    }
    const expected = rolls * 0.005; // 2000, standard deviation about 44.6
    expect(Math.abs(hits - expected)).toBeLessThan(5 * 44.6);
  });

  it('with pity, averages (1 - (1-p)^T) / p kills per drop and never exceeds T', () => {
    const rng = createSeededRng(777);
    const { chance, pityThreshold } = drops.rare;
    const expectedKillsPerDrop = (1 - Math.pow(1 - chance, pityThreshold)) / chance; // about 126.6
    let pity = 0;
    let sinceDrop = 0;
    let longest = 0;
    let dropCount = 0;
    const rolls = 300_000;
    for (let i = 0; i < rolls; i++) {
      const roll = rollBossDrop(drops, pity, rng);
      pity = roll.pity;
      sinceDrop++;
      if (roll.rare) {
        dropCount++;
        longest = Math.max(longest, sinceDrop);
        sinceDrop = 0;
      }
    }
    expect(longest).toBeLessThanOrEqual(pityThreshold);
    const observed = rolls / dropCount;
    expect(Math.abs(observed - expectedKillsPerDrop) / expectedKillsPerDrop).toBeLessThan(0.05);
  });

  it('grants every currency uniformly within its own [min, max]', () => {
    const rng = createSeededRng(99);
    const seen = drops.currencies.map(() => new Set<number>());
    for (let i = 0; i < 4000; i++) {
      const { currencies } = rollBossDrop(drops, 0, rng);
      expect(currencies).toHaveLength(drops.currencies.length);
      currencies.forEach((amount, j) => {
        const { min, max } = drops.currencies[j]!;
        expect(amount).toBeGreaterThanOrEqual(min);
        expect(amount).toBeLessThanOrEqual(max);
        seen[j]!.add(amount);
      });
    }
    drops.currencies.forEach(({ min, max }, j) => {
      const values = [...seen[j]!].sort((x, y) => x - y);
      if (max - min < 20) {
        expect(values).toEqual(Array.from({ length: max - min + 1 }, (_, k) => min + k));
      } else {
        // A wide range (Money): spread over the range, reaching near both ends.
        expect(values.length).toBeGreaterThan(500);
        expect(values[0]!).toBeLessThan(min + (max - min) * 0.05);
        expect(values[values.length - 1]!).toBeGreaterThan(max - (max - min) * 0.05);
      }
    });
  });

  it('scales a currency by its multiplier, rounding a fraction up with that chance', () => {
    const doubled = {
      ...drops,
      currencies: drops.currencies.map((c) => ({ ...c, multiplier: 2 })),
    };
    const rng = createSeededRng(5);
    for (let i = 0; i < 200; i++) {
      const { currencies } = rollBossDrop(doubled, 0, rng);
      currencies.forEach((amount, j) => {
        expect(amount).toBeGreaterThanOrEqual(doubled.currencies[j]!.min * 2);
        expect(amount).toBeLessThanOrEqual(doubled.currencies[j]!.max * 2);
      });
    }
  });
});
