import type { Content, HarvestPattern, ProductionJob, WorkerCard } from '../data';
import { advanceGauge, type BurstStats } from './combat';
import { statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { harvestCritFactor, workSites, type WorkSite } from './production';
import { pushHarvest, type HarvestEvent, type TickReport } from './report';
import type { BurstGauge, GameState } from './state';

/**
 * Workers in play (DESIGN.md §4 Workers play the field, Harvest burst). Each worker strikes its
 * own tree kind or mine type in its card's pattern (`worker.harvest` in cards.json): a cycle of
 * `intervalSeconds` with `strikes` strikes. The economy stays the expected value (production.ts);
 * the strikes are events for the stage that add up to it. They depend only on play time, so they
 * need no saved state and any split of time gives the same strikes.
 *
 * Each worker also fills its own harvest gauge (`production.harvestGauges`, keyed by its place):
 * one tick a second; full, it harvests that place's output for a few seconds at once.
 */

const EPSILON = 1e-9;
/** Spans with more strikes than this on one place are reported merged, one event. */
const MAX_DETAILED_STRIKES = 16;

/** The pattern a worker card strikes with; null for a card that is not a worker. */
export function workerPattern(content: Content, cardId: string): HarvestPattern | null {
  const card = content.cardById.get(cardId);
  return card && card.job !== 'fighting' ? (card as WorkerCard).worker.harvest : null;
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
 * Records the strikes of every worker of one job that land in (`fromMs`, `toMs`] of play time.
 * `state` is the state at the start of the span and `modifiers` are those of the span. A strike
 * yields its place's output for the time between two strikes, so a span's strikes add up to the
 * place's output (with crits, to its expected value).
 */
export function recordStrikes(
  state: GameState,
  content: Content,
  job: ProductionJob,
  fromMs: number,
  toMs: number,
  modifiers: readonly Modifier[],
  report: TickReport,
  sites: readonly WorkSite[] = workSites(state, content, job, modifiers),
): void {
  for (const site of sites) {
    const worker = site.workers[0];
    const pattern = worker ? workerPattern(content, worker) : null;
    if (!worker || !pattern) continue;
    const periodMs = strikePeriodSeconds(pattern) * 1000;
    const first = Math.floor(fromMs / periodMs + EPSILON);
    const last = Math.floor(toMs / periodMs + EPSILON);
    const count = last - first;
    if (count <= 0) continue;
    const perStrike = site.rate.mul(periodMs / 1000);
    const event = (strikes: number, crits: number): HarvestEvent => ({
      job,
      kind: site.kind,
      producer: site.producer.id,
      resource: site.producer.resource,
      amount: perStrike.mul(site.crit.damage.sub(1).mul(crits).add(strikes)),
      strikes,
      crits,
      burst: false,
      worker,
    });
    if (count > MAX_DETAILED_STRIKES) {
      pushHarvest(report.harvests, event(count, Math.round(count * site.crit.chance)));
      continue;
    }
    const salt = JOB_SALT[job] + 101 + site.kind * 7;
    for (let k = first; k < last; k++) {
      pushHarvest(report.harvests, event(1, unitHash(k, salt) < site.crit.chance ? 1 : 0));
    }
  }
}

/**
 * A place's harvest burst numbers after modifiers (DESIGN.md §4 Harvest burst): the job's gauge
 * (`combat.json` `bursts`) read at that place, so a worker's ability changes its own gauge only.
 * `power` is seconds of the place's output.
 */
export function harvestBurstStats(
  content: Content,
  site: Pick<WorkSite, 'job' | 'producer'>,
  modifiers: readonly Modifier[] = [],
): BurstStats {
  const config = content.combat.bursts[site.job];
  const ctx = { job: site.job, producer: site.producer.id, resource: site.producer.resource };
  const num = (stat: Parameters<typeof statValue>[0], base: number): number =>
    statValue(stat, base, modifiers, ctx).toNumber();
  return {
    interval: Math.max(0.05, num('burst.interval', config.intervalSeconds)),
    size: Math.max(1, num('burst.size', config.gaugeSize)),
    fill: Math.max(0, num('burst.fill', config.fill)),
    power: Decimal.max(statValue('burst.power', config.power, modifiers, ctx), 0),
  };
}

/** A place's harvest gauge as saved (missing = empty). */
export function harvestGauge(state: GameState, producerId: string): BurstGauge {
  return state.production.harvestGauges[producerId] ?? { gauge: 0, timer: 0 };
}

/**
 * Runs every worker's harvest gauge for `seconds` (mutates `next`, a fresh clone): each full gauge
 * adds `power` seconds of its place's output to the resources and records a burst event per
 * place. `before` is the state at the start of the span, `sites` its work sites. Returns place id
 * -> seconds of output its bursts harvested (only places whose gauge fired). A place with no
 * worker keeps its gauge as it is.
 */
export function advanceHarvestGauges(
  next: GameState,
  content: Content,
  seconds: number,
  report: TickReport,
  modifiers: readonly Modifier[],
  sites: readonly WorkSite[],
): Record<string, Decimal> {
  const harvested: Record<string, Decimal> = {};
  for (const site of sites) {
    const worker = site.workers[0];
    if (!worker) continue;
    const id = site.producer.id;
    const stats = harvestBurstStats(content, site, modifiers);
    const run = advanceGauge(harvestGauge(next, id), seconds, stats);
    next.production.harvestGauges[id] = run.gauge;
    if (run.bursts === 0) continue;
    report.bursts[site.job] += run.bursts;
    const burstSeconds = stats.power.mul(run.bursts);
    harvested[id] = burstSeconds;
    const amount = site.rate.mul(harvestCritFactor(site.crit)).mul(burstSeconds);
    const resource = site.producer.resource;
    next.resources[resource] = (next.resources[resource] ?? new Decimal(0)).add(amount);
    pushHarvest(report.harvests, {
      job: site.job,
      kind: site.kind,
      producer: id,
      resource,
      amount,
      strikes: 1,
      crits: 0,
      burst: true,
      worker,
    });
  }
  return harvested;
}
