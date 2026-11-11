import type { Content, Training } from '../data';
import { curveOffer, type BuyCount, type BuyOffer } from './bulk';
import { milestoneInfo, milestoneMultiplier, type MilestoneInfo } from './milestones';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { pay } from './production';
import { cloneState, type GameState } from './state';

/**
 * Training (DESIGN.md §6): the repeatable fighting upgrades of the Dungeons drawer. Each line
 * (damage, health, Money per kill, signature gauge) is bought again and again with Money on a
 * growing price, like a tree or mine level: every level adds its percent and every 25th level
 * multiplies the whole line. The lines are data (`training.json`), their effect is an ordinary
 * modifier (source `upgrade`), and an Ascension resets them.
 *
 * `training.ts` is imported by `modifiers.ts`, so it reads modifiers only through arguments.
 */

/** Levels of a training line bought this run. */
export function trainingLevel(state: GameState, id: string): number {
  return Math.max(0, Math.floor(state.combat.training[id] ?? 0));
}

/** What `level` levels of a line multiply its stat by: (1 + rate% x level) x milestones. */
export function trainingMultiplier(line: Training, level: number): Decimal {
  return line.ratePercent
    .div(100)
    .mul(level)
    .add(1)
    .mul(milestoneMultiplier(line.milestones, level));
}

/** The modifiers of the training bought: one multiplier per line, for the fighting job. */
export function trainingModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const line of content.training) {
    const level = trainingLevel(state, line.id);
    if (level <= 0) continue;
    out.push({
      stat: line.stat,
      kind: 'mult',
      value: trainingMultiplier(line, level),
      // The gauge stats are shared with the harvest gauges: only the fighting one is trained.
      // The combat and drop stats belong to fighting alone and are read without a job.
      ...(line.stat.startsWith('burst.') ? { scope: { job: 'fighting' } } : {}),
      source: { kind: 'upgrade', id: `training:${line.id}` },
    } as Modifier);
  }
  return out;
}

/** One training line, ready to show. */
export interface TrainingLine {
  line: Training;
  level: number;
  /** What the line multiplies its stat by now, and after the levels of the offer. */
  now: Decimal;
  after: Decimal;
  /** The next x2 (or the line's own) milestone and the way to it. */
  milestone: MilestoneInfo;
  offer: BuyOffer;
}

/** Every training line with its level, effect and the offer of the buy button. */
export function trainingLines(
  state: GameState,
  content: Content,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): TrainingLine[] {
  return content.training.flatMap((line) => {
    const level = trainingLevel(state, line.id);
    const budget = state.resources[line.cost.resource] ?? new Decimal(0);
    const offer = curveOffer(line.cost, level, count, budget, modifiers, { job: 'fighting' });
    if (!offer) return [];
    return [
      {
        line,
        level,
        now: trainingMultiplier(line, level),
        after: trainingMultiplier(line, level + offer.count),
        milestone: milestoneInfo(line.milestones, level),
        offer,
      },
    ];
  });
}

export type TrainingBuyResult =
  | { ok: true; state: GameState; bought: number }
  | { ok: false; reason: 'unknown' | 'unaffordable' };

/** Buys levels of a training line: a fixed count, or as many as the Money affords. */
export function buyTraining(
  state: GameState,
  content: Content,
  id: string,
  count: BuyCount = 1,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): TrainingBuyResult {
  const line = content.trainingById.get(id);
  if (!line) return { ok: false, reason: 'unknown' };
  const level = trainingLevel(state, id);
  const budget = state.resources[line.cost.resource] ?? new Decimal(0);
  const offer = curveOffer(line.cost, level, count, budget, modifiers, { job: 'fighting' });
  if (!offer || !offer.affordable) return { ok: false, reason: 'unaffordable' };
  const next = cloneState(pay(state, [offer.price]));
  next.combat.training[id] = level + offer.count;
  return { ok: true, state: next, bought: offer.count };
}
