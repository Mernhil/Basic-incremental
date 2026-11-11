import type { Content, ProductionJob, ToolLine } from '../data';
import { curveOffer, type BuyCount, type BuyOffer } from './bulk';
import { milestoneInfo, milestoneMultiplier, type MilestoneInfo } from './milestones';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { pay } from './production';
import { cloneState, type GameState } from './state';

/**
 * Tool lines (DESIGN.md §4 Tool lines): the repeatable upgrade lines of a production job, bought
 * with Money on a growing price like the Training lines (`training.ts`). Yield and strike speed
 * multiply their stat; crit chance and crit damage add to the harvest crit, whose only other source
 * is a worker's ability. Their effect is an ordinary modifier scoped to the job (source
 * `upgrade`), the levels are `production.tools`, and an Ascension resets them.
 *
 * `toolLines.ts` is imported by `modifiers.ts`, so it reads modifiers only through arguments.
 */

/** Levels of a tool line bought this run. */
export function toolLevel(state: GameState, id: string): number {
  return Math.max(0, Math.floor(state.production.tools[id] ?? 0));
}

/** Whether a line multiplies its stat (yield, speed) rather than adding to it (the crit lines). */
const multiplies = (line: ToolLine): boolean => line.milestones !== undefined;

/**
 * What `level` levels give: a multiplier (1 + rate% x level) x milestones for yield and speed; the
 * amount added to the stat for the crit lines (chance as 0..1, damage as extra multiplier).
 */
export function toolEffect(line: ToolLine, level: number): Decimal {
  const gain = line.ratePercent.div(100).mul(level);
  return line.milestones ? gain.add(1).mul(milestoneMultiplier(line.milestones, level)) : gain;
}

/** The modifiers of the tool lines bought: one per line, scoped to its job. */
export function toolModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const line of content.production.tools) {
    const level = toolLevel(state, line.id);
    if (level <= 0) continue;
    out.push({
      stat: line.stat,
      kind: multiplies(line) ? 'mult' : 'flat',
      value: toolEffect(line, level),
      scope: { job: line.job },
      source: { kind: 'upgrade', id: `tool:${line.id}` },
    });
  }
  return out;
}

/** One tool line, ready to show. */
export interface ToolLineView {
  line: ToolLine;
  level: number;
  /** The line's effect now and after the offer (see `toolEffect`). */
  now: Decimal;
  after: Decimal;
  /** The next milestone of a multiplying line; null for the crit lines. */
  milestone: MilestoneInfo | null;
  offer: BuyOffer;
}

const budgetOf = (state: GameState, resource: string): Decimal =>
  state.resources[resource] ?? new Decimal(0);

/** The tool lines of one job with their level, effect and buy offer. */
export function toolLines(
  state: GameState,
  content: Content,
  job: ProductionJob,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ToolLineView[] {
  return content.production.tools.flatMap((line) => {
    if (line.job !== job) return [];
    const level = toolLevel(state, line.id);
    const offer = curveOffer(
      line.cost,
      level,
      count,
      budgetOf(state, line.cost.resource),
      modifiers,
      {
        job,
      },
    );
    if (!offer) return [];
    return [
      {
        line,
        level,
        now: toolEffect(line, level),
        after: toolEffect(line, level + offer.count),
        milestone: line.milestones ? milestoneInfo(line.milestones, level) : null,
        offer,
      },
    ];
  });
}

export type ToolBuyResult =
  | { ok: true; state: GameState; bought: number }
  | { ok: false; reason: 'unknown' | 'unaffordable' };

/** Buys levels of a tool line: a fixed count, or as many as the Money affords. */
export function buyTool(
  state: GameState,
  content: Content,
  id: string,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ToolBuyResult {
  const line = content.production.tools.find((t) => t.id === id);
  if (!line) return { ok: false, reason: 'unknown' };
  const level = toolLevel(state, id);
  const offer = curveOffer(
    line.cost,
    level,
    count,
    budgetOf(state, line.cost.resource),
    modifiers,
    {
      job: line.job,
    },
  );
  if (!offer || !offer.affordable) return { ok: false, reason: 'unaffordable' };
  const next = cloneState(pay(state, [offer.price]));
  next.production.tools[id] = level + offer.count;
  return { ok: true, state: next, bought: offer.count };
}
