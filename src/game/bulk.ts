import type { CostCurve } from '../data';
import { statValue, type Modifier, type StatContext } from './modifiers';
import { Decimal } from './num';
import { ceilPrice, effectiveGrowth, type Price } from './production';

/**
 * Bulk buying (DESIGN.md §11, "Buy x1 / x10 / x100 / Max"): prices of several levels on an
 * exponential cost curve and the most a budget affords. Used by the Training lines.
 *
 * Every level is priced exactly like a single buy (`curvePrice`, rounded up per level), so a
 * bulk buy costs the same as buying the levels one at a time.
 */

/** How many levels a buy button buys: a fixed count (x1, x10, x100) or as many as affordable. */
export type BuyCount = number | 'max';

/** Safety cap: never price or buy more levels than this in one go. */
export const MAX_BULK_LEVELS = 10_000;

/** What one buy button offers right now, ready to show. */
export interface BuyOffer {
  /** Levels the click buys. Max: as many as affordable, or 1 (the next level) when none is. */
  count: number;
  /** Total price of those levels. */
  price: Price;
  /** Whether the click would succeed (the button glows). */
  affordable: boolean;
  /**
   * Fill bar, 0..1. xN: budget / price, capped at 1. Max: progress toward one more level than
   * it can buy now (leftover budget / price of that level).
   */
  progress: number;
}

/** The per-level price terms of a curve: growth and cost multiplier after modifiers. */
function curveTerms(
  curve: CostCurve,
  modifiers: readonly Modifier[],
  context: StatContext,
): (n: number) => Decimal {
  const ctx = { ...context, resource: curve.resource };
  const growth = effectiveGrowth(curve.growth, modifiers, ctx);
  const multiplier = Decimal.max(statValue('cost.multiplier', 1, modifiers, ctx), 0);
  return (n) => ceilPrice(curve.base.mul(growth.pow(n)).mul(multiplier));
}

/** Price of `count` levels bought from `owned` on a curve (0 levels cost 0). */
export function curveBulkPrice(
  curve: CostCurve,
  owned: number,
  count: number,
  modifiers: readonly Modifier[] = [],
  context: StatContext = {},
): Price {
  const price = curveTerms(curve, modifiers, context);
  let total = new Decimal(0);
  const n = Math.min(Math.max(0, Math.floor(count)), MAX_BULK_LEVELS);
  for (let i = 0; i < n; i++) total = total.add(price(owned + i));
  return { resource: curve.resource, amount: total };
}

/** The most levels `budget` buys from `owned` (0 when not even one), and their total price. */
export function curveMaxAffordable(
  curve: CostCurve,
  owned: number,
  budget: Decimal,
  modifiers: readonly Modifier[] = [],
  context: StatContext = {},
): { count: number; price: Price } {
  const price = curveTerms(curve, modifiers, context);
  let total = new Decimal(0);
  let count = 0;
  while (count < MAX_BULK_LEVELS) {
    const next = total.add(price(owned + count));
    if (next.gt(budget)) break;
    total = next;
    count++;
  }
  return { count, price: { resource: curve.resource, amount: total } };
}

const fraction = (have: Decimal, need: Decimal): number =>
  need.lte(0) ? 1 : Math.min(1, Math.max(0, have.div(need).toNumber()));

/**
 * The offer of a buy button on a curve with `budget` of its resource, or null when `count` is
 * not a whole number from 1 to MAX_BULK_LEVELS.
 */
export function curveOffer(
  curve: CostCurve,
  owned: number,
  count: BuyCount,
  budget: Decimal,
  modifiers: readonly Modifier[] = [],
  context: StatContext = {},
): BuyOffer | null {
  if (count === 'max') {
    const max = curveMaxAffordable(curve, owned, budget, modifiers, context);
    const nextLevel = curveBulkPrice(curve, owned + max.count, 1, modifiers, context).amount;
    if (max.count === 0) {
      const price = { resource: curve.resource, amount: nextLevel };
      return { count: 1, price, affordable: false, progress: fraction(budget, nextLevel) };
    }
    const leftover = budget.sub(max.price.amount);
    return {
      count: max.count,
      price: max.price,
      affordable: true,
      progress: fraction(leftover, nextLevel),
    };
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_BULK_LEVELS) return null;
  const price = curveBulkPrice(curve, owned, count, modifiers, context);
  const affordable = budget.gte(price.amount);
  return { count, price, affordable, progress: affordable ? 1 : fraction(budget, price.amount) };
}
