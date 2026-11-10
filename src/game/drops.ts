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

export interface EnemyDropResult {
  /** Units of each currency, in `DropTable.currencies` order. */
  currencies: number[];
  /** Units of the material (Core). */
  material: number;
  /** Units of each extra material, in `DropTable.extraMaterials` order. */
  extraMaterials: number[];
}

/** Rounds a scaled amount to whole units: the fraction adds one more unit with that chance. */
function wholeUnits(scaled: number, rng: Rng): number {
  const whole = Math.floor(Math.max(0, scaled) + FRACTION_EPSILON);
  const fraction = scaled - whole;
  return fraction > FRACTION_EPSILON && rng() < fraction ? whole + 1 : whole;
}

/**
 * Rolls the kill of a normal enemy or mini-boss (DESIGN.md §6 Normal enemies): the dungeon's
 * boss table at `scale`, the enemy's share of the boss's HP. Every currency is paid at `scale` of
 * a boss kill's roll; the material and the extra materials drop with `scale` of the boss's
 * chance. The rare item and its pity belong to the boss alone.
 */
export function rollEnemyDrop(drops: DropTable, scale: number, rng: Rng): EnemyDropResult {
  const currencies = drops.currencies.map((currency) => {
    const span = currency.max - currency.min + 1;
    const units = currency.min + Math.floor(rng() * span);
    return wholeUnits(units * (currency.multiplier ?? 1) * scale, rng);
  });
  const material = rng() < drops.material.chance * scale ? drops.material.amount : 0;
  const extraMaterials = drops.extraMaterials.map((extra) =>
    rng() < extra.chance * scale ? extra.min + Math.floor(rng() * (extra.max - extra.min + 1)) : 0,
  );
  return { currencies, material, extraMaterials };
}

/** Above this many kills of one enemy in a step, its drops are paid at their average. */
export const ENEMY_DROP_ROLLS = 32;

/**
 * The drops of `count` kills of one normal enemy or mini-boss. A few kills are rolled one by
 * one; a long run of them (a strong loadout farming a shallow floor, or hours offline) is paid at
 * its average, each total rounded to whole units by chance so the average stays exact.
 */
export function rollEnemyDrops(
  drops: DropTable,
  scale: number,
  count: number,
  rng: Rng,
): EnemyDropResult {
  const total: EnemyDropResult = {
    currencies: drops.currencies.map(() => 0),
    material: 0,
    extraMaterials: drops.extraMaterials.map(() => 0),
  };
  if (count <= ENEMY_DROP_ROLLS) {
    for (let i = 0; i < count; i++) {
      const roll = rollEnemyDrop(drops, scale, rng);
      roll.currencies.forEach((units, j) => (total.currencies[j]! += units));
      total.material += roll.material;
      roll.extraMaterials.forEach((units, j) => (total.extraMaterials[j]! += units));
    }
    return total;
  }
  const chance = (c: number): number => Math.min(1, Math.max(0, c * scale));
  total.currencies = drops.currencies.map((currency) =>
    wholeUnits(
      ((currency.min + currency.max) / 2) * (currency.multiplier ?? 1) * scale * count,
      rng,
    ),
  );
  total.material = wholeUnits(chance(drops.material.chance) * drops.material.amount * count, rng);
  total.extraMaterials = drops.extraMaterials.map((extra) =>
    wholeUnits(chance(extra.chance) * ((extra.min + extra.max) / 2) * count, rng),
  );
  return total;
}
