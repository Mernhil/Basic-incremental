import type { Content, CostCurve, ProductionJob } from '../data';
import { damageLevel, isDamageLineUnlocked, type CombatFailure } from './combat';
import { collectModifiers, statValue, type Modifier, type StatContext } from './modifiers';
import { Decimal } from './num';
import {
  canAfford,
  ceilPrice,
  isProducerUnlocked,
  mineLevel,
  pay,
  treeLevel,
  type Price,
  type ProductionFailure,
} from './production';
import type { TierUp } from './report';
import { milestoneTierUps } from './stages';
import type { GameState } from './state';

/**
 * Bulk buying (DESIGN.md §11, "Buy x1 / x10 / x100 / Max"): prices of several levels on an
 * exponential cost curve, the most a budget affords, and the buy offers and purchases of the
 * damage lines, mine levels and plot / slot expansions.
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

/** A bulk purchase: the new state and the levels bought, or why it failed. */
export type BulkBuyResult<F extends string> =
  | {
      ok: true;
      state: GameState;
      bought: number;
      /** Milestones crossed (damage line, mine level) or tree tile stage reached (plots). */
      tierUps: TierUp[];
    }
  | { ok: false; reason: F };

/** The per-level price terms of a curve: growth and cost multiplier after modifiers. */
function curveTerms(
  curve: CostCurve,
  modifiers: readonly Modifier[],
  context: StatContext,
): (n: number) => Decimal {
  const ctx = { ...context, resource: curve.resource };
  const growth = Decimal.max(statValue('cost.growth', curve.growth, modifiers, ctx), 1);
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

const budgetOf = (state: GameState, resource: string): Decimal =>
  state.resources[resource] ?? new Decimal(0);

// ---- damage lines ----------------------------------------------------------------------------

const FIGHTING: StatContext = { job: 'fighting' };

/** The buy offer of a damage line (null for an unknown line or an invalid count). */
export function damageLineOffer(
  state: GameState,
  content: Content,
  upgradeId: string,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BuyOffer | null {
  const upgrade = content.combat.damageUpgrades.find((u) => u.id === upgradeId);
  if (!upgrade) return null;
  const owned = damageLevel(state, upgradeId);
  const budget = budgetOf(state, upgrade.cost.resource);
  const offer = curveOffer(upgrade.cost, owned, count, budget, modifiers, FIGHTING);
  if (offer && !isDamageLineUnlocked(state, content, upgrade)) offer.affordable = false;
  return offer;
}

/**
 * Buys damage line levels: xN buys exactly N or fails as unaffordable; Max buys as many as
 * affordable (at least 1). Kept through prestige.
 */
export function buyDamageLevels(
  state: GameState,
  content: Content,
  upgradeId: string,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BulkBuyResult<CombatFailure> {
  const line = content.combat.damageUpgrades.find((u) => u.id === upgradeId);
  if (!line) return { ok: false, reason: 'unknown' };
  if (!isDamageLineUnlocked(state, content, line)) return { ok: false, reason: 'locked' };
  const offer = damageLineOffer(state, content, upgradeId, count, modifiers);
  if (!offer) return { ok: false, reason: 'invalid-count' };
  if (!offer.affordable || !canAfford(state, [offer.price])) {
    return { ok: false, reason: 'unaffordable' };
  }
  const next = pay(state, [offer.price]);
  const from = damageLevel(state, upgradeId);
  next.combat.damageLevels[upgradeId] = from + offer.count;
  const milestones = content.combat.damageUpgrades.find((u) => u.id === upgradeId)!.milestones;
  const to = from + offer.count;
  const tierUps = milestoneTierUps('damage_milestone', upgradeId, milestones, from, to);
  return { ok: true, state: next, bought: offer.count, tierUps };
}

// ---- mine levels -----------------------------------------------------------------------------

/** The buy offer of a mine type's levels (null for an unknown mine or an invalid count). Not
 *  affordable while the mine is locked. */
export function mineLevelOffer(
  state: GameState,
  content: Content,
  mineId: string,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BuyOffer | null {
  const mine = content.mineById.get(mineId);
  if (!mine) return null;
  const ctx: StatContext = { job: 'mining', producer: mine.id, resource: mine.resource };
  const budget = budgetOf(state, mine.level.cost.resource);
  const offer = curveOffer(
    mine.level.cost,
    mineLevel(state, mineId),
    count,
    budget,
    modifiers,
    ctx,
  );
  if (offer && !isProducerUnlocked(state, content, 'mining', mineId)) offer.affordable = false;
  return offer;
}

/** Buys mine levels like `buyDamageLevels`. Only for unlocked mine types; reset on prestige. */
export function buyMineLevels(
  state: GameState,
  content: Content,
  mineId: string,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BulkBuyResult<ProductionFailure> {
  if (!content.mineById.has(mineId)) return { ok: false, reason: 'unknown' };
  if (!isProducerUnlocked(state, content, 'mining', mineId)) return { ok: false, reason: 'locked' };
  const offer = mineLevelOffer(state, content, mineId, count, modifiers);
  if (!offer) return { ok: false, reason: 'invalid-count' };
  if (!offer.affordable || !canAfford(state, [offer.price])) {
    return { ok: false, reason: 'unaffordable' };
  }
  const next = pay(state, [offer.price]);
  const from = mineLevel(state, mineId);
  next.production.mineLevels[mineId] = from + offer.count;
  const milestones = content.mineById.get(mineId)!.level.milestones;
  const tierUps = milestoneTierUps('mine_milestone', mineId, milestones, from, from + offer.count);
  return { ok: true, state: next, bought: offer.count, tierUps };
}

// ---- tree levels -----------------------------------------------------------------------------

/** The buy offer of a tree kind's levels (null for an unknown tree or an invalid count). Not
 *  affordable while the tree kind is locked. */
export function treeLevelOffer(
  state: GameState,
  content: Content,
  treeId: string,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BuyOffer | null {
  const tree = content.treeById.get(treeId);
  if (!tree) return null;
  const ctx: StatContext = { job: 'logging', producer: tree.id, resource: tree.resource };
  const budget = budgetOf(state, tree.level.cost.resource);
  const offer = curveOffer(
    tree.level.cost,
    treeLevel(state, treeId),
    count,
    budget,
    modifiers,
    ctx,
  );
  if (offer && !isProducerUnlocked(state, content, 'logging', treeId)) offer.affordable = false;
  return offer;
}

/** Buys tree levels like `buyMineLevels`. Only for unlocked tree kinds; reset on prestige. */
export function buyTreeLevels(
  state: GameState,
  content: Content,
  treeId: string,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BulkBuyResult<ProductionFailure> {
  if (!content.treeById.has(treeId)) return { ok: false, reason: 'unknown' };
  if (!isProducerUnlocked(state, content, 'logging', treeId)) {
    return { ok: false, reason: 'locked' };
  }
  const offer = treeLevelOffer(state, content, treeId, count, modifiers);
  if (!offer) return { ok: false, reason: 'invalid-count' };
  if (!offer.affordable || !canAfford(state, [offer.price])) {
    return { ok: false, reason: 'unaffordable' };
  }
  const next = pay(state, [offer.price]);
  const from = treeLevel(state, treeId);
  next.production.treeLevels[treeId] = from + offer.count;
  const milestones = content.treeById.get(treeId)!.level.milestones;
  const tierUps = milestoneTierUps('tree_milestone', treeId, milestones, from, from + offer.count);
  return { ok: true, state: next, bought: offer.count, tierUps };
}

// ---- plots and slots -------------------------------------------------------------------------

/** The buy offer of plots (logging) or slots (mining); null for an invalid count. */
export function expansionOffer(
  state: GameState,
  content: Content,
  job: ProductionJob,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BuyOffer | null {
  const curve = content.production[job].expansion;
  const owned = state.production[job].expansions;
  return curveOffer(curve, owned, count, budgetOf(state, curve.resource), modifiers, { job });
}

/** Buys plots / slots like `buyDamageLevels`. The new ones start empty. */
export function buyExpansions(
  state: GameState,
  content: Content,
  job: ProductionJob,
  count: BuyCount,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BulkBuyResult<ProductionFailure> {
  const offer = expansionOffer(state, content, job, count, modifiers);
  if (!offer) return { ok: false, reason: 'invalid-count' };
  if (!offer.affordable || !canAfford(state, [offer.price])) {
    return { ok: false, reason: 'unaffordable' };
  }
  const next = pay(state, [offer.price]);
  next.production[job].expansions += offer.count;
  return { ok: true, state: next, bought: offer.count, tierUps: [] };
}
