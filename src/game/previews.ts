import type { Content } from '../data';
import { mineLevelOffer, treeLevelOffer, type BuyCount } from './bulk';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { jobProductionPerSecond, mineLevel, treeLevel } from './production';
import { cloneState, type GameState } from './state';

/**
 * Upgrade previews (DESIGN.md §11, "Oak 4/s -> 5/s"):
 * what a purchase would change, worked out on a copy of the state without paying. Max previews
 * the levels Max would buy now (the next level when none is affordable).
 */

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

/** What a preview multiplies the producer's output by (1.03 for "x1.03 output"); null while it makes nothing. */
export function outputGainMultiplier(preview: MinePreview): number | null {
  if (preview.rateBefore.lte(0)) return null;
  const gain = preview.rateAfter.div(preview.rateBefore).toNumber();
  return Number.isFinite(gain) ? gain : null;
}
