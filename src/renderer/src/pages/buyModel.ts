import type { Content } from '../../../data';
import {
  Decimal,
  isProducerUnlocked,
  milestoneInfo,
  mineLevel,
  mineLevelOffer,
  previewMineLevel,
  previewTreeLevel,
  treeLevel,
  treeLevelOffer,
  type BuyCount,
  type BuyOffer,
  type GameState,
  type MilestoneInfo,
  type Modifier,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { amountText } from '../settings/coins';
import { COPY } from '../copy';

/**
 * Buy-line view models (DESIGN.md §11, "Header, numbers and buying"): the offer for the chosen
 * ×1 / ×10 / ×100 / Max, its preview ("Oak 4/s → 5/s") and the next
 * milestone ("Lv 25: ×2"). Display logic only; prices, previews and milestones come from game.
 */

export interface BuyLineView {
  id: string;
  name: string;
  /** The resource paid with. */
  resource: string;
  level: number;
  /** False while the line cannot be bought at all (locked mine). */
  available: boolean;
  offer: BuyOffer;
  /** Button text: "Buy ×10" and the price. */
  label: string;
  price: string;
  /** What the purchase changes. */
  preview: string;
  /** Next milestone tag ("Lv 25: ×2"), empty when the line has none. */
  milestone: string;
  milestoneInfo: MilestoneInfo | null;
  /** Comparable size of the gain (for picking the best line), >= 0. */
  gain: Decimal;
}

const resName = (content: Content, id: string): string => content.resourceById.get(id)?.name ?? id;

export const buyLabel = (offer: BuyOffer, count: BuyCount): string =>
  count === 'max' ? COPY.buy.max(offer.count) : COPY.buy.times(offer.count);

const milestoneTag = (m: MilestoneInfo | null): string =>
  m ? COPY.buy.milestone(m.nextLevel, fmt(m.nextMultiplier)) : '';

/** The mine level lines of the production rail (unlocked mines only). */
export function mineLevelViews(
  state: GameState,
  content: Content,
  count: BuyCount,
  mods: readonly Modifier[],
): BuyLineView[] {
  return content.mines.flatMap((mine) => {
    if (!isProducerUnlocked(state, content, 'mining', mine.id)) return [];
    const offer = mineLevelOffer(state, content, mine.id, count, mods);
    const p = previewMineLevel(state, content, mine.id, count, mods);
    if (!offer || !p) return [];
    const level = mineLevel(state, mine.id);
    const res = resName(content, p.resource);
    const m = milestoneInfo(mine.level.milestones, level);
    return [
      {
        id: mine.id,
        name: mine.name,
        resource: mine.level.cost.resource,
        level,
        available: true,
        offer,
        label: buyLabel(offer, count),
        price: amountText(content, offer.price.resource, offer.price.amount),
        preview: COPY.buy.rate(res, fmt(p.rateBefore), fmt(p.rateAfter)),
        milestone: milestoneTag(m),
        milestoneInfo: m,
        gain: Decimal.max(p.rateAfter.sub(p.rateBefore), 0),
      },
    ];
  });
}

/** The tree level lines of the production rail (unlocked tree kinds only). */
export function treeLevelViews(
  state: GameState,
  content: Content,
  count: BuyCount,
  mods: readonly Modifier[],
): BuyLineView[] {
  return content.trees.flatMap((tree) => {
    if (!isProducerUnlocked(state, content, 'logging', tree.id)) return [];
    const offer = treeLevelOffer(state, content, tree.id, count, mods);
    const p = previewTreeLevel(state, content, tree.id, count, mods);
    if (!offer || !p) return [];
    const level = treeLevel(state, tree.id);
    const res = resName(content, p.resource);
    const m = milestoneInfo(tree.level.milestones, level);
    return [
      {
        id: tree.id,
        name: tree.name,
        resource: tree.level.cost.resource,
        level,
        available: true,
        offer,
        label: buyLabel(offer, count),
        price: amountText(content, offer.price.resource, offer.price.amount),
        preview: COPY.buy.rate(res, fmt(p.rateBefore), fmt(p.rateAfter)),
        milestone: milestoneTag(m),
        milestoneInfo: m,
        gain: Decimal.max(p.rateAfter.sub(p.rateBefore), 0),
      },
    ];
  });
}

/**
 * The line the collapsed drawer offers: of the lines that can be bought, the affordable one with
 * the biggest gain; when none is affordable, the one closest to affordable.
 */
export function bestLine<T extends Pick<BuyLineView, 'available' | 'offer' | 'gain'>>(
  lines: readonly T[],
): T | null {
  const open = lines.filter((l) => l.available);
  const affordable = open.filter((l) => l.offer.affordable);
  if (affordable.length > 0) {
    return affordable.reduce((best, l) => (l.gain.gt(best.gain) ? l : best));
  }
  if (open.length === 0) return null;
  return open.reduce((best, l) => (l.offer.progress > best.offer.progress ? l : best));
}

/** Kills per minute as the readout shows it. */
export function formatRate(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n >= 100) return Math.round(n).toLocaleString('en-US');
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}
