import type { Dungeon } from '../data';
import type { Rng } from './rng';

export interface BossDropResult {
  /** The rare item dropped on this kill. */
  rare: boolean;
  /** New pity counter: consecutive kills without the rare item. */
  pity: number;
  /** Units of each currency (Money, Summon and Glamour Crystal), in `DropTable.currencies` order. */
  currencies: number[];
}

/** A dungeon's drop table after modifiers. Each currency's `multiplier` (default 1) scales its
 *  rolled units (`drops.moneyMultiplier` / `drops.crystalMultiplier`, e.g. boss mastery). */
export type DropTable = Omit<Dungeon['drops'], 'currencies'> & {
  currencies: (Dungeon['drops']['currencies'][number] & { multiplier?: number })[];
};

/** Below this a fraction counts as none (float noise). */
const FRACTION_EPSILON = 1e-9;

/**
 * Rolls one boss kill.
 * - The rare item drops with `chance`, or is guaranteed once `pityThreshold - 1` kills in a row
 *   missed (so the threshold-th kill always drops). A drop resets the counter.
 * - Every currency is granted on every kill, uniformly in its [min, max], then multiplied by its
 *   multiplier; a fraction left over adds one more unit with that chance (one extra roll, only
 *   when there is a fraction), so the average is exact.
 */
export function rollBossDrop(drops: DropTable, pity: number, rng: Rng): BossDropResult {
  const { rare } = drops;
  const guaranteed = pity + 1 >= rare.pityThreshold;
  const dropped = guaranteed || rng() < rare.chance;
  const currencies = drops.currencies.map((currency) => {
    const span = currency.max - currency.min + 1;
    let units = currency.min + Math.floor(rng() * span);
    const multiplier = currency.multiplier ?? 1;
    if (multiplier !== 1) {
      const scaled = Math.max(0, units * multiplier);
      const whole = Math.floor(scaled + FRACTION_EPSILON);
      const fraction = scaled - whole;
      units = fraction > FRACTION_EPSILON && rng() < fraction ? whole + 1 : whole;
    }
    return units;
  });
  return { rare: dropped, pity: dropped ? 0 : pity + 1, currencies };
}

/** Rolls the material (Core) drop of one kill: `amount` units with `chance`, no pity. */
export function rollMaterialDrop(drops: Dungeon['drops'], rng: Rng): number {
  return rng() < drops.material.chance ? drops.material.amount : 0;
}
