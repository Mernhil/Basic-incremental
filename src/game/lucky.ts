import type { Content, LuckyConfig, ProductionJob } from '../data';
import { Decimal } from './num';
import { pushHarvest, type TickReport } from './report';
import type { GameState } from './state';
import type { WorkSite } from './production';
import { activeWorkers, producerJob } from './workers';

/**
 * Lucky strikes (DESIGN.md §4 Lucky strikes). Now and then a rich vein or a golden tree appears
 * on a worked tree or mine for a short time, and the card there strikes it for a large payout.
 *
 * The economy never rolls for it: a worked place's output is multiplied by the expected value,
 * 1 + payout / interval (`luckyFactor`), so online, offline and any split of time give the same
 * totals. The stage only shows it: play time is cut into slots of `everySeconds`, each holding
 * one window of `windowSeconds` at a fixed, hashed moment (`luckyWindow`), and a strike event worth
 * the payout is reported when the card's strike in a window lands inside a span
 * (`recordLuckyStrikes`). Nothing is saved. A place with no worker has no lucky strikes.
 */

/** Spans with more lucky strikes than this are reported merged, one event. */
const MAX_DETAILED = 16;

/** The rules of a job's lucky strike (`production.json` `lucky`). */
export const luckyConfig = (content: Content, job: ProductionJob): LuckyConfig =>
  content.production.lucky[job];

/** The output factor of a worked place: 1 + payout seconds / interval seconds. */
export function luckyFactor(content: Content, job: ProductionJob): Decimal {
  const { everySeconds, payoutSeconds } = luckyConfig(content, job);
  return new Decimal(1 + payoutSeconds / everySeconds);
}

/** A fixed pseudo-random number in [0, 1) for slot `k` of a place (the same on every run). */
function unit(k: number, salt: number): number {
  let x = (Math.floor(k) + Math.imul(salt, 0x9e3779b1)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function saltOf(producerId: string): number {
  let h = 17;
  for (let i = 0; i < producerId.length; i++) h = Math.imul(h ^ producerId.charCodeAt(i), 16777619);
  return h;
}

/** Start (ms of play time) of the window in slot `k` of a place. */
function windowStart(config: LuckyConfig, producerId: string, k: number): number {
  const every = config.everySeconds * 1000;
  const room = (config.everySeconds - config.windowSeconds) * 1000;
  return k * every + unit(k, saltOf(producerId)) * room;
}

/** A lucky strike on show: the golden tree or rich vein, and how long it stays. */
export interface LuckyWindow {
  name: string;
  startMs: number;
  endMs: number;
  secondsLeft: number;
  /** Seconds of the place's output the strike pays. */
  payoutSeconds: number;
}

/**
 * The lucky strike showing on a worked place at `timeMs` of play time, or null: none with no
 * worker, none when the job's payout is 0.
 */
export function luckyWindow(
  content: Content,
  state: GameState,
  producerId: string,
  timeMs: number,
): LuckyWindow | null {
  const job = producerJob(content, producerId);
  if (!job || !activeWorkers(state, content)[producerId]) return null;
  const config = luckyConfig(content, job);
  if (config.payoutSeconds <= 0) return null;
  const k = Math.floor(timeMs / (config.everySeconds * 1000));
  const startMs = windowStart(config, producerId, k);
  const endMs = startMs + config.windowSeconds * 1000;
  if (timeMs < startMs || timeMs >= endMs) return null;
  return {
    name: config.name,
    startMs,
    endMs,
    secondsLeft: (endMs - timeMs) / 1000,
    payoutSeconds: config.payoutSeconds,
  };
}

/**
 * Records the lucky strikes of one job's worked places that land in (`fromMs`, `toMs`] of play
 * time (events only; the payout is already in the economy as the expected value). A strike lands
 * in the middle of its window and pays `payoutSeconds` of the place's output.
 */
export function recordLuckyStrikes(
  content: Content,
  job: ProductionJob,
  fromMs: number,
  toMs: number,
  report: TickReport,
  sites: readonly WorkSite[],
): void {
  const config = luckyConfig(content, job);
  if (config.payoutSeconds <= 0) return;
  const every = config.everySeconds * 1000;
  const first = Math.floor(fromMs / every);
  const last = Math.floor(toMs / every);
  for (const site of sites) {
    const worker = site.workers[0];
    if (!worker) continue;
    const id = site.producer.id;
    const event = (strikes: number) => ({
      job,
      kind: site.kind,
      producer: id,
      resource: site.producer.resource,
      amount: site.rate.mul(config.payoutSeconds).mul(strikes),
      strikes,
      crits: 0,
      burst: false,
      lucky: true,
      worker,
    });
    if (last - first > MAX_DETAILED) {
      pushHarvest(report.harvests, event(last - first));
      continue;
    }
    for (let k = first; k <= last; k++) {
      const at = windowStart(config, id, k) + (config.windowSeconds * 1000) / 2;
      if (at > fromMs && at <= toMs) pushHarvest(report.harvests, event(1));
    }
  }
}
