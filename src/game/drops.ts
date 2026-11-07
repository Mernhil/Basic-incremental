import type { Dungeon } from '../data';
import type { Rng } from './rng';

export interface BossDropResult {
  /** The rare item dropped on this kill. */
  rare: boolean;
  /** New pity counter: consecutive kills without the rare item. */
  pity: number;
  /** Portal resource units granted by this kill. */
  portal: number;
}

/** A dungeon's drop table after modifiers. `portalResource.multiplier` (default 1) scales the
 *  rolled portal units (`drops.portalMultiplier`, e.g. boss mastery). */
export type DropTable = Dungeon['drops'] & {
  portalResource: Dungeon['drops']['portalResource'] & { multiplier?: number };
};

/** Below this a fraction counts as none (float noise). */
const FRACTION_EPSILON = 1e-9;

/**
 * Rolls one boss kill.
 * - The rare item drops with `chance`, or is guaranteed once `pityThreshold - 1` kills in a row
 *   missed (so the threshold-th kill always drops). A drop resets the counter.
 * - The portal resource is granted on every kill, uniformly in [min, max], then multiplied by
 *   the multiplier; a fraction left over adds one more unit with that chance (one extra roll,
 *   only when there is a fraction), so the average is exact.
 */
export function rollBossDrop(drops: DropTable, pity: number, rng: Rng): BossDropResult {
  const { rare, portalResource } = drops;
  const guaranteed = pity + 1 >= rare.pityThreshold;
  const dropped = guaranteed || rng() < rare.chance;
  const span = portalResource.max - portalResource.min + 1;
  let portal = portalResource.min + Math.floor(rng() * span);
  const multiplier = portalResource.multiplier ?? 1;
  if (multiplier !== 1) {
    const scaled = Math.max(0, portal * multiplier);
    const whole = Math.floor(scaled + FRACTION_EPSILON);
    const fraction = scaled - whole;
    portal = fraction > FRACTION_EPSILON && rng() < fraction ? whole + 1 : whole;
  }
  return { rare: dropped, pity: dropped ? 0 : pity + 1, portal };
}

/** Rolls the material (Core) drop of one kill: `amount` units with `chance`, no pity. */
export function rollMaterialDrop(drops: Dungeon['drops'], rng: Rng): number {
  return rng() < drops.material.chance ? drops.material.amount : 0;
}
