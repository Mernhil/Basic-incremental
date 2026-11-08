import type { Content, ProductionJob } from '../data';
import {
  damageLineOffer,
  expansionOffer,
  mineLevelOffer,
  treeLevelOffer,
  type BuyCount,
} from './bulk';
import { averageDps, damageLevel, secondsPerKill } from './combat';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import {
  jobProductionPerSecond,
  mineLevel,
  plotCapacity,
  producerLevel,
  producerRate,
  treeLevel,
  unlockedProducers,
} from './production';
import { cloneState, type GameState } from './state';

/**
 * Upgrade previews (DESIGN.md 14, "DPS 12 -> 13, time-to-kill 11h -> 2h", "Oak 4/s -> 5/s"):
 * what a purchase would change, worked out on a copy of the state without paying. Max previews
 * the levels Max would buy now (the next level when none is affordable).
 */

/** A damage line purchase: average DPS and time-to-kill against the active dungeon. */
export interface DamagePreview {
  /** Levels the purchase buys. */
  levels: number;
  dpsBefore: Decimal;
  dpsAfter: Decimal;
  /** Seconds to kill the active dungeon's boss; null for a special dungeon or nothing active. */
  ttkBefore: number | null;
  ttkAfter: number | null;
}

function ttk(state: GameState, content: Content, modifiers: readonly Modifier[]): number | null {
  const id = state.activeDungeonId;
  return id && content.dungeonById.has(id) ? secondsPerKill(state, content, id, modifiers) : null;
}

/** Previews buying `count` levels of a damage line; null for an unknown line or bad count. */
export function previewDamageLine(
  state: GameState,
  content: Content,
  upgradeId: string,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): DamagePreview | null {
  const offer = damageLineOffer(state, content, upgradeId, count, modifiers);
  if (!offer) return null;
  const after = cloneState(state);
  after.combat.damageLevels[upgradeId] = damageLevel(state, upgradeId) + offer.count;
  return {
    levels: offer.count,
    dpsBefore: averageDps(state, content, state.activeDungeonId, modifiers),
    dpsAfter: averageDps(after, content, after.activeDungeonId, modifiers),
    ttkBefore: ttk(state, content, modifiers),
    ttkAfter: ttk(after, content, modifiers),
  };
}

/** A tree or mine level purchase: the gem per second, in total and per plot / slot. */
export interface MinePreview {
  levels: number;
  /** The gem the mine produces. */
  resource: string;
  /** That gem per second from every mining slot (0 when no slot runs the mine). */
  rateBefore: Decimal;
  rateAfter: Decimal;
  /** Per second of one slot running this mine. */
  perSlotBefore: Decimal;
  perSlotAfter: Decimal;
}

/** Previews buying `count` levels of a mine type; null for an unknown mine or bad count. */
export function previewMineLevel(
  state: GameState,
  content: Content,
  mineId: string,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): MinePreview | null {
  const mine = content.mineById.get(mineId);
  const offer = mineLevelOffer(state, content, mineId, count, modifiers);
  if (!mine || !offer) return null;
  const level = mineLevel(state, mineId);
  const after = cloneState(state);
  after.production.mineLevels[mineId] = level + offer.count;
  const rate = (s: GameState): Decimal =>
    jobProductionPerSecond(s, content, 'mining', modifiers)[mine.resource] ?? new Decimal(0);
  return {
    levels: offer.count,
    resource: mine.resource,
    rateBefore: rate(state),
    rateAfter: rate(after),
    perSlotBefore: producerRate(mine, 'mining', modifiers, level),
    perSlotAfter: producerRate(mine, 'mining', modifiers, level + offer.count),
  };
}

/** A tree level purchase has the same shape as a mine's. */
export type TreePreview = MinePreview;

/** Previews buying `count` levels of a tree kind ("Oak 4/s -> 5/s"); null for an unknown tree or bad count. */
export function previewTreeLevel(
  state: GameState,
  content: Content,
  treeId: string,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): TreePreview | null {
  const tree = content.treeById.get(treeId);
  const offer = treeLevelOffer(state, content, treeId, count, modifiers);
  if (!tree || !offer) return null;
  const level = treeLevel(state, treeId);
  const after = cloneState(state);
  after.production.treeLevels[treeId] = level + offer.count;
  const rate = (s: GameState): Decimal =>
    jobProductionPerSecond(s, content, 'logging', modifiers)[tree.resource] ?? new Decimal(0);
  return {
    levels: offer.count,
    resource: tree.resource,
    rateBefore: rate(state),
    rateAfter: rate(after),
    perSlotBefore: producerRate(tree, 'logging', modifiers, level),
    perSlotAfter: producerRate(tree, 'logging', modifiers, level + offer.count),
  };
}

/** A plot / slot purchase: capacity, and output if the new ones run the best producer. */
export interface ExpansionPreview {
  /** Expansions the purchase buys. */
  plots: number;
  capacityBefore: number;
  capacityAfter: number;
  /** The best unlocked producer (the highest tier), assumed in the new plots; null if none. */
  producer: string | null;
  /** Its resource; null with no producer. */
  resource: string | null;
  /** That resource per second from the job now, and with the new plots running the producer. */
  rateBefore: Decimal;
  rateAfter: Decimal;
}

/** Previews buying `count` plots (logging) or slots (mining). A bad count previews one. */
export function previewExpansion(
  state: GameState,
  content: Content,
  job: ProductionJob,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ExpansionPreview {
  const plots = expansionOffer(state, content, job, count, modifiers)?.count ?? 1;
  const after = cloneState(state);
  after.production[job].expansions += plots;
  const capacityBefore = plotCapacity(state, content, job, modifiers);
  const capacityAfter = plotCapacity(after, content, job, modifiers);
  const best = unlockedProducers(state, content, job).at(-1) ?? null;
  if (!best) {
    const zero = new Decimal(0);
    return {
      plots,
      capacityBefore,
      capacityAfter,
      producer: null,
      resource: null,
      rateBefore: zero,
      rateAfter: zero,
    };
  }
  const level = producerLevel(state, job, best.id);
  const rateBefore =
    jobProductionPerSecond(state, content, job, modifiers)[best.resource] ?? new Decimal(0);
  const added = Math.max(0, capacityAfter - capacityBefore);
  return {
    plots,
    capacityBefore,
    capacityAfter,
    producer: best.id,
    resource: best.resource,
    rateBefore,
    rateAfter: rateBefore.add(producerRate(best, job, modifiers, level).mul(added)),
  };
}
