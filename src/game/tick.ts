import type { Content } from '../data';
import { grantWorkerXp, hasPendingLevel, productionXpPerUnit, settleCardLevels } from './cards';
import { advanceCombat } from './combat';
import { accountLevelDue, grantAccountXp, harvestXp, settleAccount } from './account';
import { achievementsDue, settleAchievements } from './achievements';
import { settleChallenges } from './challenges';
import { autobuyDue, settleAutobuyers } from './autobuyers';
import { recordLuckyStrikes } from './lucky';
import { advanceForge } from './forge';
import { addDigging, depthDue, settleDepth } from './depth';
import { advanceHarvestGauges, recordStrikes } from './harvest';
import { countHarvest, masteryDue, settleMastery } from './mastery';
import { collectModifiers } from './modifiers';
import { Decimal } from './num';
import { countMoneyEarned } from './upgrades';
import { PRODUCTION_JOBS, siteOutput, workSites, type WorkSite } from './production';
import { emptyReport, mergeReports, type TickReport } from './report';
import type { Rng } from './rng';
import { cloneState, type GameState } from './state';

/**
 * Card level-ups happen only when play time reaches a whole multiple of this (DESIGN.md §5).
 * XP itself accrues continuously; settling levels on a fixed grid keeps the modifiers they give
 * changing at the same moments however the time is split into steps (frame-rate independence,
 * and offline progress matching live play).
 */
export const CARD_LEVEL_STEP_MS = 1000;

/** Used to look ahead for level-ups: XP never depends on random drops, so any value works. */
const lookaheadRng: Rng = () => 0.5;

/**
 * Advances the game by `dtMs` of real time. Pure: returns a new state.
 * Everything is rate * seconds, so splitting a span into many small steps or doing it
 * in one gives the same result (frame-rate independence).
 */
export function advance(
  state: GameState,
  content: Content,
  dtMs: number,
  rng: Rng,
): { state: GameState; report: TickReport } {
  const report = emptyReport();
  if (!Number.isFinite(dtMs) || dtMs <= 0) return { state, report };

  let current = state;
  let remaining = dtMs;
  while (remaining > 0) {
    const toBoundary = CARD_LEVEL_STEP_MS - (current.stats.playTimeMs % CARD_LEVEL_STEP_MS);
    // Whole level-up boundaries inside the rest of the span (the first one is `toBoundary` away).
    const boundaries =
      remaining < toBoundary
        ? 0
        : 1 + Math.floor((remaining - toBoundary) / CARD_LEVEL_STEP_MS + EPSILON);
    // XP only grows, so a level-up pending on a boundary stays pending on every later one. The
    // span therefore runs in one go up to the first boundary where something is due.
    // A frame covers one boundary at most, so looking ahead would just run the same span twice:
    // go to the boundary and settle (a no-op when nothing is due) instead.
    const first =
      boundaries === 0
        ? 0
        : boundaries <= STEP_THROUGH_BOUNDARIES
          ? 1
          : firstDueBoundary(current, content, toBoundary, boundaries);
    if (first === 0) {
      current = advanceSpan(current, content, remaining, rng, report);
      break;
    }
    const until = toBoundary + (first - 1) * CARD_LEVEL_STEP_MS;
    current = advanceSpan(current, content, until, rng, report);
    settleCardLevels(current, content, report);
    settleMastery(current, content, report);
    settleDepth(current, content);
    settleAutobuyers(current, content);
    settleAccount(current, content, report);
    settleAchievements(current, content, report);
    remaining -= until;
  }
  return { state: current, report };
}

/** Absorbs floating-point drift when counting the boundaries inside a span. */
const EPSILON = 1e-9;
/** Spans with this many boundaries or fewer are stepped through without a look-ahead. */
const STEP_THROUGH_BOUNDARIES = 2;

/**
 * The first level-up boundary (1 = the one `toBoundary` ms ahead, then one every
 * CARD_LEVEL_STEP_MS) at which something would be pending, or 0 when nothing is by the last of
 * `boundaries`. Gallops outwards from the first boundary, then bisects, so the work follows the
 * distance to that boundary rather than the length of the rest of the span: a span with many
 * level-ups in it costs time in proportion to its length, not its square.
 */
function firstDueBoundary(
  state: GameState,
  content: Content,
  toBoundary: number,
  boundaries: number,
): number {
  const due = (k: number): boolean =>
    levelUpDue(state, content, toBoundary + (k - 1) * CARD_LEVEL_STEP_MS);
  let lo = 0; // known not due (0 = before the first boundary)
  let hi = 1;
  while (!due(hi)) {
    if (hi >= boundaries) return 0;
    lo = hi;
    hi = Math.min(hi * 4, boundaries);
  }
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (due(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Whether a card level-up or a mastery tier would be pending after `dtMs`. Runs a throwaway
 * copy. Kills and harvests never depend on random drops, so the fixed lookahead rng is exact.
 */
function levelUpDue(state: GameState, content: Content, dtMs: number): boolean {
  const ahead = advanceSpan(state, content, dtMs, lookaheadRng, emptyReport());
  return (
    Object.values(ahead.cards.owned).some((owned) => hasPendingLevel(content, owned)) ||
    masteryDue(ahead, content) ||
    depthDue(ahead, content) ||
    autobuyDue(ahead, content) ||
    accountLevelDue(ahead, content) ||
    achievementsDue(ahead, content)
  );
}

/** One span with fixed modifiers: production, harvest gauges, card XP and combat. */
function advanceSpan(
  state: GameState,
  content: Content,
  dtMs: number,
  rng: Rng,
  report: TickReport,
): GameState {
  const next = cloneState(state);
  const seconds = dtMs / 1000;
  const modifiers = collectModifiers(state, content);
  const fromMs = state.stats.playTimeMs;
  next.stats.playTimeMs += dtMs;

  // Production (DESIGN.md §4 Workers): every unlocked tree kind and mine type yields its level
  // rate × its worker's power per second, once; each worker strikes its own place (events only)
  // and fills its own harvest gauge.
  const sites = Object.fromEntries(
    PRODUCTION_JOBS.map((job) => [job, workSites(state, content, job, modifiers)]),
  ) as Record<(typeof PRODUCTION_JOBS)[number], WorkSite[]>;
  for (const job of PRODUCTION_JOBS) {
    recordStrikes(state, content, job, fromMs, fromMs + dtMs, modifiers, report, sites[job]);
    recordLuckyStrikes(content, job, fromMs, fromMs + dtMs, report, sites[job]);
    for (const site of sites[job]) {
      const resource = site.producer.resource;
      const current = next.resources[resource] ?? new Decimal(0);
      next.resources[resource] = current.add(siteOutput(site).mul(seconds));
      addDigging(next, content, site.producer.id, site.dig, seconds);
    }
  }
  const burstSeconds = advanceHarvestGauges(
    next,
    content,
    seconds,
    report,
    modifiers,
    PRODUCTION_JOBS.flatMap((job) => sites[job]),
  );

  // The forge turns the gems of the step into what its recipe makes.
  advanceForge(next, content, seconds);

  // Card XP: each worker gains XP per unit its own place harvested (normal output and bursts);
  // every gem harvested counts toward its mastery and the account.
  for (const job of PRODUCTION_JOBS) {
    const gains: Record<string, Decimal> = {};
    for (const site of sites[job]) {
      const harvestSeconds = (burstSeconds[site.producer.id] ?? new Decimal(0)).add(seconds);
      const units = siteOutput(site).mul(harvestSeconds);
      const resource = site.producer.resource;
      gains[resource] = (gains[resource] ?? new Decimal(0)).add(units);
      for (const id of site.workers) {
        const perUnit = productionXpPerUnit(content, job, modifiers, site.producer.id);
        grantWorkerXp(next, content, id, units.mul(perUnit));
      }
    }
    countHarvest(next, content, gains);
    grantAccountXp(next, content, harvestXp(content, job, gains), modifiers, job);
  }

  // Combat: the dungeon's floors are auto-fought in parallel.
  const moneyBefore = next.resources[content.upgrades.currency];
  advanceCombat(next, content, seconds, rng, report, modifiers);
  countMoneyEarned(next, content, moneyBefore);
  // An Ascension challenge is done once the run stands on its target floor.
  settleChallenges(next, content);

  return next;
}

/** Same as advance() but split into steps of at most `chunkMs`. */
export function advanceChunked(
  state: GameState,
  content: Content,
  totalMs: number,
  rng: Rng,
  chunkMs: number,
): { state: GameState; report: TickReport } {
  const report = emptyReport();
  let current = state;
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(chunkMs, remaining);
    const result = advance(current, content, step, rng);
    current = result.state;
    mergeReports(report, result.report);
    remaining -= step;
  }
  return { state: current, report };
}
