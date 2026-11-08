import type { Content } from '../data';
import { damageLineOffer, mineLevelOffer, treeLevelOffer, type BuyCount } from './bulk';
import { averageDps, damageLevel, secondsPerKill } from './combat';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { jobProductionPerSecond, mineLevel, treeLevel } from './production';
import { cloneState, type GameState } from './state';

/**
 * Upgrade previews (DESIGN.md §11, "DPS 12 -> 13, time-to-kill 11h -> 2h", "Oak 4/s -> 5/s"):
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

/** A tree or mine level purchase: the gem per second before and after (one of each, so one number). */
export interface MinePreview {
  levels: number;
  /** The gem the mine produces. */
  resource: string;
  /** That gem per second from the mine (0 while it is locked). */
  rateBefore: Decimal;
  rateAfter: Decimal;
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
  };
}
