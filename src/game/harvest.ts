import type { Content, HarvestPattern, ProductionJob } from '../data';
import type { Modifier } from './modifiers';
import { Decimal } from './num';
import {
  harvestCrit,
  plots,
  producerLevel,
  producerRate,
  producersOf,
  type Producer,
} from './production';
import { pushHarvest, type HarvestEvent, type TickReport } from './report';
import type { GameState } from './state';

/**
 * Production cards in play (DESIGN.md §4). The main logging / mining card's `harvest` block
 * (cards.json) sets a rhythm: a cycle of `intervalSeconds` with `strikes` strikes, each landing on
 * a plot / slot chosen by `targeting`. The economy stays the expected value (production.ts); the
 * strikes are discrete events for the stage that add up to it. They depend only on play time, so
 * they need no saved state and any split of time gives the same strikes.
 */

const EPSILON = 1e-9;
/** Spans with more strikes than this are reported merged, one event per plot. */
const MAX_DETAILED_STRIKES = 16;

/** The pattern the job's main card strikes with, or the job default with no (owned) main card. */
export function mainHarvestPattern(
  state: GameState,
  content: Content,
  job: ProductionJob,
): HarvestPattern {
  const id = state.cards.loadouts[job].main;
  const card = id ? content.cardById.get(id) : undefined;
  if (id && card && card.job === job && state.cards.owned[id] && card.main.harvest) {
    return card.main.harvest;
  }
  return content.production.harvest.default[job];
}

/** Stats whose modifiers make a support card count as helping the harvest. */
const HARVEST_STATS = new Set([
  'production.rate',
  'harvest.critChance',
  'harvest.critDamage',
  'burst.fill',
  'burst.power',
  'burst.size',
]);

/** Ids of the job's support cards whose effect touches its harvest (rate, crits, gauge). */
export function harvestSupports(state: GameState, content: Content, job: ProductionJob): string[] {
  const out: string[] = [];
  for (const id of state.cards.loadouts[job].supports) {
    const card = id ? content.cardById.get(id) : undefined;
    if (!id || !card || card.job !== job || !state.cards.owned[id]) continue;
    const helps = card.support.modifiers.some(
      (m) => HARVEST_STATS.has(m.stat) && (!m.scope?.job || m.scope.job === job),
    );
    if (helps) out.push(id);
  }
  return out;
}

/** Plots / slots that run something: their index, producer and its output per second. */
export interface HarvestTarget {
  plot: number;
  producer: Producer;
  /** Output per second of this one plot, crits left out (they are added per strike). */
  rate: Decimal;
}

export function activeTargets(
  state: GameState,
  content: Content,
  job: ProductionJob,
  modifiers: readonly Modifier[],
): HarvestTarget[] {
  const byId = new Map(producersOf(content, job).map((p) => [p.id, p]));
  const out: HarvestTarget[] = [];
  plots(state, content, job, modifiers).forEach((id, plot) => {
    const producer = id === null ? undefined : byId.get(id);
    if (!producer) return;
    const level = producerLevel(state, job, producer.id);
    out.push({ plot, producer, rate: producerRate(producer, job, modifiers, level) });
  });
  return out;
}

/** Seconds between two strikes of a pattern. */
export function strikePeriodSeconds(pattern: HarvestPattern): number {
  return pattern.intervalSeconds / pattern.strikes;
}

/** A fixed pseudo-random number in [0, 1) for strike `k` (the same on every run and split). */
function unitHash(k: number, salt: number): number {
  let x = (Math.floor(k) + Math.imul(salt, 0x9e3779b1)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const JOB_SALT: Record<ProductionJob, number> = { logging: 11, mining: 23 };

/**
 * Records the strikes of one job that land in (`fromMs`, `toMs`] of play time. `state` is the
 * state at the start of the span and `modifiers` are those of the span. A strike on a plot yields
 * that plot's output for the time between its strikes, so the strikes of a span add up to the
 * span's output (with crits, to its expected value).
 */
export function recordStrikes(
  state: GameState,
  content: Content,
  job: ProductionJob,
  fromMs: number,
  toMs: number,
  modifiers: readonly Modifier[],
  report: TickReport,
): void {
  const pattern = mainHarvestPattern(state, content, job);
  const periodMs = strikePeriodSeconds(pattern) * 1000;
  const first = Math.floor(fromMs / periodMs + EPSILON);
  const last = Math.floor(toMs / periodMs + EPSILON);
  const count = last - first;
  if (count <= 0) return;
  const targets = activeTargets(state, content, job, modifiers);
  if (targets.length === 0) return;

  const crit = harvestCrit(content, job, modifiers);
  const supports = harvestSupports(state, content, job);
  const periodSeconds = periodMs / 1000;
  const all = pattern.targeting === 'all';
  // A plot struck 1 in N times (or every time, for `all`) collects the whole interval it covers.
  const reach = all ? 1 : targets.length;
  const base = (t: HarvestTarget): Decimal => t.rate.mul(periodSeconds * reach);
  const event = (t: HarvestTarget, strikes: number, crits: number): HarvestEvent => ({
    job,
    plot: t.plot,
    producer: t.producer.id,
    resource: t.producer.resource,
    amount: base(t).mul(crit.damage.sub(1).mul(crits).add(strikes)),
    strikes,
    crits,
    burst: false,
    supports: [...supports],
  });

  if (count > MAX_DETAILED_STRIKES) {
    // Too many to play one by one: one merged event per plot, strikes shared out in turn.
    targets.forEach((t, i) => {
      const strikes = all
        ? count
        : Math.floor(count / targets.length) +
          ((i - (first % targets.length) + targets.length) % targets.length < count % targets.length
            ? 1
            : 0);
      if (strikes > 0) {
        pushHarvest(report.harvests, event(t, strikes, Math.round(strikes * crit.chance)));
      }
    });
    return;
  }

  for (let k = first; k < last; k++) {
    const hit =
      pattern.targeting === 'all'
        ? targets
        : [
            pattern.targeting === 'sweep'
              ? targets[k % targets.length]!
              : targets[Math.floor(unitHash(k, JOB_SALT[job]) * targets.length)]!,
          ];
    const crits = unitHash(k, JOB_SALT[job] + 101) < crit.chance ? 1 : 0;
    for (const t of hit) pushHarvest(report.harvests, event(t, 1, crits));
  }
}

/**
 * Records the bonus harvest of a full gauge: one event per plot carrying `seconds` of its output.
 * `before` is the state at the start of the span.
 */
export function recordBurst(
  before: GameState,
  content: Content,
  job: ProductionJob,
  seconds: Decimal,
  modifiers: readonly Modifier[],
  report: TickReport,
): void {
  const crit = harvestCrit(content, job, modifiers);
  const factor = crit.damage.sub(1).mul(crit.chance).add(1);
  const supports = harvestSupports(before, content, job);
  for (const t of activeTargets(before, content, job, modifiers)) {
    pushHarvest(report.harvests, {
      job,
      plot: t.plot,
      producer: t.producer.id,
      resource: t.producer.resource,
      amount: t.rate.mul(factor).mul(seconds),
      strikes: 1,
      crits: 0,
      burst: true,
      supports: [...supports],
    });
  }
}
