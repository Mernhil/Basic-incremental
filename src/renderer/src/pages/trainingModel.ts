import type { Content } from '../../../data';
import {
  Decimal,
  trainingLines,
  type BuyCount,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { buyLabel, type BuyLineView } from './buyModel';

/**
 * Display logic of the Training panel in the Dungeons drawer (DESIGN.md §6 Training): one row per
 * training line with its level, what it gives now, the way to its next milestone and the buy
 * button's text. Pure: no game rules here.
 */

export interface TrainingRow {
  id: string;
  name: string;
  /** "Lv 12". */
  levelText: string;
  /** "×1.60 damage". */
  effectText: string;
  /** Pips of the bar to the next milestone: filled out of total. */
  segments: { filled: number; total: number };
  /** "×2 in 13". */
  toGo: string;
  /** What the buy button shows. */
  button: BuyLineView;
}

/** A multiplier as text: two decimals while small ("1.60"), the number format above that. */
const times = (d: Decimal): string => (d.lt(100) ? d.toNumber().toFixed(2) : fmt(d));

const resName = (content: Content, id: string): string => content.resourceById.get(id)?.name ?? id;

/** The rows of the Training panel for the chosen buy amount. */
export function trainingRows(
  state: GameState,
  content: Content,
  count: BuyCount,
  mods: readonly Modifier[],
): TrainingRow[] {
  return trainingLines(state, content, count, mods).map((t) => {
    const every = t.line.milestones.every;
    const left = t.milestone.levelsToNext;
    return {
      id: t.line.id,
      name: t.line.name,
      levelText: COPY.training.level(t.level),
      effectText: COPY.training.effect(times(t.now), t.line.effect),
      segments: { filled: every - left, total: every },
      toGo: COPY.training.toGo(fmt(t.line.milestones.multiplier), left),
      button: {
        id: t.line.id,
        name: t.line.name,
        resource: t.line.cost.resource,
        level: t.level,
        available: true,
        offer: t.offer,
        label: buyLabel(t.offer, count),
        price: `${fmt(t.offer.price.amount)} ${resName(content, t.offer.price.resource)}`,
        preview: COPY.training.preview(times(t.now), times(t.after)),
        milestone: COPY.buy.milestone(t.milestone.nextLevel, fmt(t.milestone.nextMultiplier)),
        milestoneInfo: t.milestone,
        gain: Decimal.max(t.after.sub(t.now), 0),
      },
    };
  });
}
