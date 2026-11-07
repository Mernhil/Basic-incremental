import type { Content, CostCurve, Mine, ProductionJob, Tree } from '../data';
import { milestoneInfo, milestoneMultiplier, type MilestoneInfo } from './milestones';
import { collectModifiers, statValue, type Modifier, type StatContext } from './modifiers';
import { Decimal } from './num';
import { cloneState, initialProduction, type GameState } from './state';

/**
 * Production (DESIGN.md 2): logging plots and mining slots. Capacity is limited and bought
 * with the job's tier-1 resource; the player freely chooses what runs in each plot/slot.
 * Tree kinds are unlocked with wood, mine types by clearing dungeons, and each mine type has
 * levels bought with its own ore. Every number goes through the modifier pipeline.
 *
 * Every function is pure: state changes return a new state. Functions that need modifiers take
 * them as an optional last argument (pass `collectModifiers(state, content)` once when calling
 * several in a row).
 */

export type { ProductionJob };
export const PRODUCTION_JOBS: readonly ProductionJob[] = ['logging', 'mining'];

export type Producer = Tree | Mine;

/** An amount of one resource to pay. */
export interface Price {
  resource: string;
  amount: Decimal;
}

export type ProductionFailure =
  /** No tree/mine/dungeon with that id for this job. */
  | 'unknown'
  /** The tree kind or mine type is not unlocked yet. */
  | 'locked'
  /** The tree kind is already unlocked. */
  | 'already-unlocked'
  /** Not enough resources. */
  | 'unaffordable'
  /** The plot/slot index is not within the current capacity. */
  | 'invalid-plot'
  /** A bulk buy count that is not a whole number from 1 to MAX_BULK_LEVELS. */
  | 'invalid-count';

export type ProductionResult =
  { ok: true; state: GameState } | { ok: false; reason: ProductionFailure };

const fail = (reason: ProductionFailure): ProductionResult => ({ ok: false, reason });

export function producersOf(content: Content, job: ProductionJob): readonly Producer[] {
  return job === 'logging' ? content.trees : content.mines;
}

function findProducer(content: Content, job: ProductionJob, id: string): Producer | undefined {
  return job === 'logging' ? content.treeById.get(id) : content.mineById.get(id);
}

function producerContext(producer: Producer, job: ProductionJob): StatContext {
  return { job, producer: producer.id, resource: producer.resource };
}

// ---- unlocks -------------------------------------------------------------------------------

/** Trees: start kinds or bought with wood. Mines: start types or their dungeon was cleared. */
export function isProducerUnlocked(
  state: GameState,
  content: Content,
  job: ProductionJob,
  id: string,
): boolean {
  if (job === 'logging') {
    const tree = content.treeById.get(id);
    if (!tree) return false;
    return tree.unlockCost.length === 0 || state.production.unlockedTrees.includes(id);
  }
  const mine = content.mineById.get(id);
  if (!mine) return false;
  return mine.unlockedByDungeon === null || state.clearedDungeons.includes(mine.unlockedByDungeon);
}

/** The unlocked trees/mines of a job, in content order. */
export function unlockedProducers(
  state: GameState,
  content: Content,
  job: ProductionJob,
): Producer[] {
  return producersOf(content, job).filter((p) => isProducerUnlocked(state, content, job, p.id));
}

/**
 * Records a dungeon clear and returns the mine types it unlocked (empty if already cleared).
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

// ---- capacity and plots --------------------------------------------------------------------

/** Plots/slots available: start + bought expansions, through `production.capacity`. */
export function plotCapacity(
  state: GameState,
  content: Content,
  job: ProductionJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number {
  const base = content.production[job].startPlots + state.production[job].expansions;
  const value = statValue('production.capacity', base, modifiers, { job });
  return Math.max(0, Math.floor(value.toNumber()));
}

/**
 * What runs in each plot/slot within the capacity (length = capacity), null = empty.
 * Locked or removed producers show as empty.
 */
export function plots(
  state: GameState,
  content: Content,
  job: ProductionJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): (string | null)[] {
  const capacity = plotCapacity(state, content, job, modifiers);
  const saved = state.production[job].plots;
  return Array.from({ length: capacity }, (_, i) => {
    const id = saved[i] ?? null;
    return id !== null && isProducerUnlocked(state, content, job, id) ? id : null;
  });
}

/** Producer id -> number of plots/slots running it (only producers with at least one). */
export function producerCounts(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const job of PRODUCTION_JOBS) {
    for (const id of plots(state, content, job, modifiers)) {
      if (id !== null) counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Puts a tree/mine in a plot/slot, or empties it with `producerId` null. Free (DESIGN.md 2).
 * The producer must belong to the job and be unlocked; the index must be within the capacity.
 */
export function assignPlot(
  state: GameState,
  content: Content,
  job: ProductionJob,
  index: number,
  producerId: string | null,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ProductionResult {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= plotCapacity(state, content, job, modifiers)
  ) {
    return fail('invalid-plot');
  }
  if (producerId !== null) {
    if (!findProducer(content, job, producerId)) return fail('unknown');
    if (!isProducerUnlocked(state, content, job, producerId)) return fail('locked');
  }
  const next = cloneState(state);
  const list = next.production[job].plots;
  while (list.length <= index) list.push(null);
  list[index] = producerId;
  return { ok: true, state: next };
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

/** The `owned`-th purchase on an exponential curve: base * growth^owned, growth via `cost.growth`. */
export function curvePrice(
  curve: CostCurve,
  owned: number,
  modifiers: readonly Modifier[],
  context: StatContext = {},
): Price {
  const ctx = { ...context, resource: curve.resource };
  const growth = Decimal.max(statValue('cost.growth', curve.growth, modifiers, ctx), 1);
  return finalPrice(curve.resource, curve.base.mul(growth.pow(owned)), modifiers, ctx);
}

/** Price of the next plot (logging) or slot (mining). */
export function expansionCost(
  state: GameState,
  content: Content,
  job: ProductionJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Price {
  return curvePrice(
    content.production[job].expansion,
    state.production[job].expansions,
    modifiers,
    {
      job,
    },
  );
}

/** One-time wood price to unlock a tree kind. Empty for start kinds. */
export function treeUnlockCost(
  content: Content,
  treeId: string,
  modifiers: readonly Modifier[] = [],
): Price[] {
  const tree = content.treeById.get(treeId);
  if (!tree) return [];
  const ctx = producerContext(tree, 'logging');
  return tree.unlockCost.map((c) => finalPrice(c.resource, c.amount, modifiers, ctx));
}

export function mineLevel(state: GameState, mineId: string): number {
  return state.production.mineLevels[mineId] ?? 0;
}

/** A mine type's level milestones ("Lv 25: x2"), or null for an unknown mine. */
export function mineLevelMilestone(
  state: GameState,
  content: Content,
  mineId: string,
): MilestoneInfo | null {
  const mine = content.mineById.get(mineId);
  return mine ? milestoneInfo(mine.level.milestones, mineLevel(state, mineId)) : null;
}

/** Price of the next level of a mine type, in its own ore. */
export function mineLevelCost(
  state: GameState,
  content: Content,
  mineId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Price | null {
  const mine = content.mineById.get(mineId);
  if (!mine) return null;
  return curvePrice(
    mine.level.cost,
    mineLevel(state, mineId),
    modifiers,
    producerContext(mine, 'mining'),
  );
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

// ---- purchases -------------------------------------------------------------------------------

/** Buys one more plot/slot. The new one starts empty. */
export function buyExpansion(
  state: GameState,
  content: Content,
  job: ProductionJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ProductionResult {
  const price = expansionCost(state, content, job, modifiers);
  if (!canAfford(state, [price])) return fail('unaffordable');
  const next = pay(state, [price]);
  next.production[job].expansions += 1;
  return { ok: true, state: next };
}

/** Unlocks a tree kind for wood. Kept through prestige. */
export function unlockTree(
  state: GameState,
  content: Content,
  treeId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ProductionResult {
  if (!content.treeById.has(treeId)) return fail('unknown');
  if (isProducerUnlocked(state, content, 'logging', treeId)) return fail('already-unlocked');
  const prices = treeUnlockCost(content, treeId, modifiers);
  if (!canAfford(state, prices)) return fail('unaffordable');
  const next = pay(state, prices);
  next.production.unlockedTrees.push(treeId);
  return { ok: true, state: next };
}

/** Buys the next level of an unlocked mine type with its ore. */
export function buyMineLevel(
  state: GameState,
  content: Content,
  mineId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ProductionResult {
  const price = mineLevelCost(state, content, mineId, modifiers);
  if (!price) return fail('unknown');
  if (!isProducerUnlocked(state, content, 'mining', mineId)) return fail('locked');
  if (!canAfford(state, [price])) return fail('unaffordable');
  const next = pay(state, [price]);
  next.production.mineLevels[mineId] = mineLevel(state, mineId) + 1;
  return { ok: true, state: next };
}

// ---- output ----------------------------------------------------------------------------------

/**
 * Output per second of one plot/slot running this producer, after modifiers. For mines,
 * `level` adds `production.levelBonus` percent per level (from the mine's `ratePercent`)
 * and every level milestone multiplies it (DESIGN.md 11.12), before the `production.rate`
 * modifiers apply.
 */
export function producerRate(
  producer: Producer,
  job: ProductionJob,
  modifiers: readonly Modifier[],
  level = 0,
): Decimal {
  const ctx = producerContext(producer, job);
  let base = producer.baseRate;
  if (level > 0 && 'level' in producer) {
    const percent = statValue('production.levelBonus', producer.level.ratePercent, modifiers, ctx);
    base = base
      .mul(Decimal.max(percent.mul(level).div(100).add(1), 0))
      .mul(milestoneMultiplier(producer.level.milestones, level));
  }
  return Decimal.max(statValue('production.rate', base, modifiers, ctx), 0);
}

/** Resource id -> gained per second from one job's active plots/slots. */
export function jobProductionPerSecond(
  state: GameState,
  content: Content,
  job: ProductionJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
  counts: Record<string, number> = producerCounts(state, content, modifiers),
): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const producer of producersOf(content, job)) {
    const count = counts[producer.id] ?? 0;
    if (count === 0) continue;
    const level = job === 'mining' ? mineLevel(state, producer.id) : 0;
    const gained = producerRate(producer, job, modifiers, level).mul(count);
    out[producer.resource] = (out[producer.resource] ?? new Decimal(0)).add(gained);
  }
  return out;
}

/** Resource id -> total gained per second from every active plot/slot. */
export function productionPerSecond(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  const counts = producerCounts(state, content, modifiers);
  for (const job of PRODUCTION_JOBS) {
    for (const [resource, gained] of Object.entries(
      jobProductionPerSecond(state, content, job, modifiers, counts),
    )) {
      out[resource] = (out[resource] ?? new Decimal(0)).add(gained);
    }
  }
  return out;
}

// ---- prestige --------------------------------------------------------------------------------

/**
 * The production part of a prestige (DESIGN.md 3): plots, slots and mine levels go back to the
 * start; unlocked tree kinds and cleared dungeons (so unlocked mines) are kept. Resources are
 * not touched here; the prestige system resets them.
 */
export function resetProduction(state: GameState, content: Content): GameState {
  const next = cloneState(state);
  next.production = {
    ...initialProduction(content),
    unlockedTrees: [...state.production.unlockedTrees],
  };
  return next;
}
