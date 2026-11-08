import type { Content } from '../../../data';
import {
  isDamageLineUnlocked,
  Decimal,
  damageLevel,
  damageLineMilestone,
  damageLineOffer,
  formatDuration,
  isProducerUnlocked,
  milestoneInfo,
  mineLevel,
  mineLevelOffer,
  previewDamageLine,
  previewMineLevel,
  previewTreeLevel,
  treeLevel,
  treeLevelOffer,
  expansionOffer,
  previewExpansion,
  type BuyCount,
  type BuyOffer,
  type GameState,
  type MilestoneInfo,
  type Modifier,
  type ProductionJob,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';

/**
 * Buy-line view models (DESIGN.md §11, "Header, numbers and buying"): the offer for the chosen
 * ×1 / ×10 / ×100 / Max, its preview ("DPS 12 → 13, time-to-kill 11h → 2h") and the next
 * milestone ("Lv 25: ×2"). Display logic only; prices, previews and milestones come from game.
 */

export interface BuyLineView {
  id: string;
  name: string;
  /** The resource paid with. */
  resource: string;
  level: number;
  /** False while the line cannot be bought at all (locked mine, no ore seen yet). */
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

const fmtTtk = (s: number | null): string =>
  s === null || !Number.isFinite(s) ? '—' : formatDuration(s * 1000);

export const buyLabel = (offer: BuyOffer, count: BuyCount): string =>
  count === 'max' ? COPY.buy.max(offer.count) : COPY.buy.times(offer.count);

const milestoneTag = (m: MilestoneInfo | null): string =>
  m ? COPY.buy.milestone(m.nextLevel, fmt(m.nextMultiplier)) : '';

/** The damage lines of the arena drawer for a buy count. */
export function damageLineViews(
  state: GameState,
  content: Content,
  count: BuyCount,
  mods: readonly Modifier[],
): BuyLineView[] {
  return content.combat.damageUpgrades.flatMap((u) => {
    const offer = damageLineOffer(state, content, u.id, count, mods);
    const p = previewDamageLine(state, content, u.id, count, mods);
    if (!offer || !p) return [];
    const level = damageLevel(state, u.id);
    const have = state.resources[u.cost.resource] ?? new Decimal(0);
    const m = damageLineMilestone(state, content, u.id);
    const ttk = p.ttkBefore === null ? '' : COPY.buy.ttk(fmtTtk(p.ttkBefore), fmtTtk(p.ttkAfter));
    return [
      {
        id: u.id,
        name: u.name,
        resource: u.cost.resource,
        level,
        available: isDamageLineUnlocked(state, content, u) && (level > 0 || have.gt(0)),
        offer,
        label: buyLabel(offer, count),
        price: `${fmt(offer.price.amount)} ${resName(content, u.cost.resource)}`,
        preview: COPY.buy.dps(fmt(p.dpsBefore), fmt(p.dpsAfter)) + ttk,
        milestone: milestoneTag(m),
        milestoneInfo: m,
        gain: Decimal.max(p.dpsAfter.sub(p.dpsBefore), 0),
      },
    ];
  });
}

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
    const running = p.rateBefore.gt(0);
    return [
      {
        id: mine.id,
        name: mine.name,
        resource: mine.level.cost.resource,
        level,
        available: true,
        offer,
        label: buyLabel(offer, count),
        price: `${fmt(offer.price.amount)} ${resName(content, offer.price.resource)}`,
        preview: running
          ? COPY.buy.rate(res, fmt(p.rateBefore), fmt(p.rateAfter))
          : COPY.buy.perSlot(fmt(p.perSlotBefore), fmt(p.perSlotAfter)),
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
    const running = p.rateBefore.gt(0);
    return [
      {
        id: tree.id,
        name: tree.name,
        resource: tree.level.cost.resource,
        level,
        available: true,
        offer,
        label: buyLabel(offer, count),
        price: `${fmt(offer.price.amount)} ${resName(content, offer.price.resource)}`,
        preview: running
          ? COPY.buy.rate(res, fmt(p.rateBefore), fmt(p.rateAfter))
          : COPY.buy.perPlot(fmt(p.perSlotBefore), fmt(p.perSlotAfter)),
        milestone: milestoneTag(m),
        milestoneInfo: m,
        gain: Decimal.max(p.rateAfter.sub(p.rateBefore), 0),
      },
    ];
  });
}

/** The plot (logging) or slot (mining) expansion line. */
export function expansionView(
  state: GameState,
  content: Content,
  job: ProductionJob,
  count: BuyCount,
  mods: readonly Modifier[],
): BuyLineView | null {
  const offer = expansionOffer(state, content, job, count, mods);
  if (!offer) return null;
  const p = previewExpansion(state, content, job, count, mods);
  const t = COPY.production[job];
  const rate =
    p.resource && p.rateAfter.gt(p.rateBefore)
      ? COPY.buy.rateTail(resName(content, p.resource), fmt(p.rateBefore), fmt(p.rateAfter))
      : '';
  return {
    id: `${job}-expansion`,
    name: t.expansion,
    resource: offer.price.resource,
    level: p.capacityBefore,
    available: true,
    offer,
    label: buyLabel(offer, count),
    price: `${fmt(offer.price.amount)} ${resName(content, offer.price.resource)}`,
    preview: t.capacityPreview(p.capacityBefore, p.capacityAfter) + rate,
    milestone: '',
    milestoneInfo: null,
    gain: Decimal.max(p.rateAfter.sub(p.rateBefore), 0),
  };
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
