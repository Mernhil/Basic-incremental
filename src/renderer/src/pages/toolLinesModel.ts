import type { Content } from '../../../data';
import {
  Decimal,
  toolLines,
  type BuyCount,
  type GameState,
  type Modifier,
  type ProductionJob,
} from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { amountText } from '../settings/coins';
import { buyLabel } from './buyModel';
import type { TrainingRow } from './trainingModel';

/**
 * Display logic of a job's tool lines on the Production page (DESIGN.md §4 Tool lines): one row
 * per line, in the shape of a Training row. Pure: no game rules here.
 */

/** A multiplier as text: two decimals while small ("1.60"), the number format above that. */
const times = (d: Decimal): string => (d.lt(100) ? d.toNumber().toFixed(2) : fmt(d));
/** A 0..1 amount as a percent ("12.5%"). */
const percent = (d: Decimal): string => `${+d.mul(100).toNumber().toFixed(2)}%`;

export function toolRows(
  state: GameState,
  content: Content,
  job: ProductionJob,
  count: BuyCount,
  mods: readonly Modifier[],
): TrainingRow[] {
  return toolLines(state, content, job, count, mods).map((t) => {
    const multiplies = t.line.milestones !== undefined;
    const fmtEffect = (d: Decimal): string => (multiplies ? `×${times(d)}` : `+${percent(d)}`);
    const m = t.milestone;
    const every = t.line.milestones?.every ?? 0;
    const mult = t.line.milestones?.multiplier ?? new Decimal(1);
    return {
      id: t.line.id,
      name: t.line.name,
      levelText: COPY.training.level(t.level),
      effectText: `${fmtEffect(t.now)} ${t.line.effect}`,
      segments: m ? { filled: every - m.levelsToNext, total: every } : { filled: 0, total: 0 },
      toGo: m ? COPY.training.toGo(fmt(mult), m.levelsToNext) : '',
      button: {
        id: t.line.id,
        name: t.line.name,
        resource: t.line.cost.resource,
        level: t.level,
        available: true,
        offer: t.offer,
        label: buyLabel(t.offer, count),
        price: amountText(content, t.offer.price.resource, t.offer.price.amount),
        preview: `${fmtEffect(t.now)} → ${fmtEffect(t.after)}`,
        milestone: m ? COPY.buy.milestone(m.nextLevel, fmt(mult)) : '',
        milestoneInfo: m,
        gain: Decimal.max(t.after.sub(t.now), 0),
      },
    };
  });
}
