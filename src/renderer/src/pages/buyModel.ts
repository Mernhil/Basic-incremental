import { type Decimal, type BuyCount, type BuyOffer, type MilestoneInfo } from '../../../game';
import { fmt } from '../settings/numberFormat';
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
  /** The price in words ("5.12 Silver") for the tooltip; the button itself shows sprite and number. */
  priceLabel?: string;
  /** What the purchase changes. */
  preview: string;
  /** Next milestone tag ("Lv 25: ×2"), empty when the line has none. */
  milestone: string;
  milestoneInfo: MilestoneInfo | null;
  /** Comparable size of the gain (for picking the best line), >= 0. */
  gain: Decimal;
  /** The price's resource art (markup), shown before the price (DESIGN.md §4 The upgrade row). */
  art?: string;
  /** "need 239 more": shown in place of the price while short. */
  short?: string | null;
}

export const buyLabel = (offer: BuyOffer, count: BuyCount): string =>
  count === 'max' ? COPY.buy.max(offer.count) : COPY.buy.times(offer.count);

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
  if (n >= 100) return fmt(Math.round(n));
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}
