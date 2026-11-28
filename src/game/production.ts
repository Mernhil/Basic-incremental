import type { Content, CostCurve, Mine, ProductionJob, Tree } from '../data';
import { type Modifier, type StatContext, statValue } from './modifiers';
import { Decimal } from './num';
import { cloneState, everCleared, type GameState } from './state';

/**
 * What is left of production (DESIGN.md section 2 Base camp): the six materials (woods and ores),
 * which a camp slot may farm once their dungeon is cleared, and the shared price helpers. The
 * farming itself is in `camp.ts`.
 *
 * Every function is pure: state changes return a new state.
 */

export type { ProductionJob };
export const PRODUCTION_JOBS: readonly ProductionJob[] = ['logging', 'mining'];

/** A wood (`trees.json`) or an ore (`mines.json`). */
export type Producer = Tree | Mine;

/** An amount of one resource to pay. */
export interface Price {
  resource: string;
  amount: Decimal;
}

export type ProductionFailure =
  /** No material or dungeon with that id. */
  | 'unknown'
  /** The material is not open yet. */
  | 'locked'
  /** Not enough resources. */
  | 'unaffordable'
  /** A bulk buy count that is not a whole number from 1 to MAX_BULK_LEVELS. */
  | 'invalid-count';

export type ProductionResult =
  { ok: true; state: GameState } | { ok: false; reason: ProductionFailure };

/** The woods of the forest (logging) or the ores of the cave (mining), in content order. */
export function producersOf(content: Content, job: ProductionJob): readonly Producer[] {
  return job === 'logging' ? content.trees : content.mines;
}

/** A material is open when it has no dungeon to clear or that dungeon has been cleared. */
export function isProducerUnlocked(
  state: GameState,
  content: Content,
  job: ProductionJob,
  id: string,
): boolean {
  const material = (job === 'logging' ? content.treeById : content.mineById).get(id);
  if (!material) return false;
  return material.unlockedByDungeon === null || everCleared(state, material.unlockedByDungeon);
}

/** The open materials of a job, in content order. */
export function unlockedProducers(
  state: GameState,
  content: Content,
  job: ProductionJob,
): Producer[] {
  return producersOf(content, job).filter((p) => isProducerUnlocked(state, content, job, p.id));
}

/**
 * Records a dungeon clear and returns the ores it opened (empty if already cleared).
 * Called by combat when a dungeon is cleared for the first time.
 */
export function clearDungeon(
  state: GameState,
  content: Content,
  dungeonId: string,
): { state: GameState; unlockedMines: string[] } {
  if (!content.dungeonById.has(dungeonId) || state.clearedDungeons.includes(dungeonId)) {
    return { state, unlockedMines: [] };
  }
  const next = cloneState(state);
  next.clearedDungeons.push(dungeonId);
  const unlockedMines = content.mines
    .filter((m) => m.unlockedByDungeon === dungeonId)
    .map((m) => m.id);
  return { state: next, unlockedMines };
}

// ---- prices ----------------------------------------------------------------------------------

/**
 * Rounds a price up to a whole amount, first dropping float noise from powers (10 x 2^5 comes
 * out as 320.00000000000006 and must cost 320, not 321).
 */
export function ceilPrice(amount: Decimal): Decimal {
  const near = amount.round();
  return amount.sub(near).abs().lte(near.abs().mul(1e-9)) ? near : amount.ceil();
}

/** Scales a price by `cost.multiplier` and rounds up to a whole amount. Never negative. */
export function finalPrice(
  resource: string,
  amount: Decimal,
  modifiers: readonly Modifier[],
  context: StatContext,
): Price {
  const ctx = { ...context, resource };
  const multiplier = Decimal.max(statValue('cost.multiplier', 1, modifiers, ctx), 0);
  return { resource, amount: ceilPrice(amount.mul(multiplier)) };
}

/**
 * The most of a price curve's growth above 1 that `cost.growth` cuts may take away together
 * (DESIGN §3 Every Money price): stacked cuts once pushed prices to a flat floor, so a price
 * always keeps growing.
 */
export const MAX_GROWTH_CUT = 0.5;

/**
 * A curve's growth after `cost.growth`: the modifiers act on the part above 1 (a -10% cut turns
 * ×1.2 into ×1.18), and together they never take more than `MAX_GROWTH_CUT` of it.
 */
export function effectiveGrowth(
  growth: Decimal,
  modifiers: readonly Modifier[],
  context: StatContext = {},
): Decimal {
  const excess = Decimal.max(growth.sub(1), 0);
  const share = Decimal.max(statValue('cost.growth', 1, modifiers, context), 1 - MAX_GROWTH_CUT);
  return excess.mul(share).add(1);
}

/** The `owned`-th purchase on an exponential curve: base * growth^owned, growth via `cost.growth`. */
export function curvePrice(
  curve: CostCurve,
  owned: number,
  modifiers: readonly Modifier[],
  context: StatContext = {},
): Price {
  const ctx = { ...context, resource: curve.resource };
  const growth = effectiveGrowth(curve.growth, modifiers, ctx);
  return finalPrice(curve.resource, curve.base.mul(growth.pow(owned)), modifiers, ctx);
}

export function canAfford(state: GameState, prices: readonly Price[]): boolean {
  return prices.every((p) => (state.resources[p.resource] ?? new Decimal(0)).gte(p.amount));
}

/** Clones the state and subtracts the prices. Call only after canAfford. */
export function pay(state: GameState, prices: readonly Price[]): GameState {
  const next = cloneState(state);
  for (const p of prices) {
    next.resources[p.resource] = (next.resources[p.resource] ?? new Decimal(0)).sub(p.amount);
  }
  return next;
}

/** The production part of an Ascension: the forge is kept, and so is the camp (DESIGN.md section 2). */
export function resetProduction(state: GameState): GameState {
  return cloneState(state);
}
