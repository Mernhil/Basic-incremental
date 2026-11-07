import type { Content } from '../data';
import { grantLoadoutXp, hasPendingLevel, productionXpPerUnit, settleCardLevels } from './cards';
import { advanceCombat, advanceHarvestBursts } from './combat';
import { accountLevelDue, grantAccountXp, harvestXp, settleAccount } from './account';
import { achievementsDue, settleAchievements } from './achievements';
import { countHarvest, masteryDue, settleMastery } from './mastery';
import { collectModifiers } from './modifiers';
import { Decimal } from './num';
import { jobProductionPerSecond, PRODUCTION_JOBS, producerCounts } from './production';
import { emptyReport, mergeReports, type TickReport } from './report';
import type { Rng } from './rng';
import { cloneState, type GameState } from './state';

/**
 * Card level-ups happen only when play time reaches a whole multiple of this (DESIGN.md 11.2).
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
    // Without a level-up due on a boundary inside the span, it runs in one go. XP only grows,
    // so nothing pending at the end means nothing was pending on any boundary before it.
    if (remaining < toBoundary || !levelUpDue(current, content, remaining)) {
      current = advanceSpan(current, content, remaining, rng, report);
      break;
    }
    current = advanceSpan(current, content, toBoundary, rng, report);
    settleCardLevels(current, content, report);
    settleMastery(current, content, report);
    settleAccount(current, content, report);
    settleAchievements(current, content, report);
    remaining -= toBoundary;
  }
  return { state: current, report };
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
    accountLevelDue(ahead, content) ||
    achievementsDue(ahead, content)
  );
}

/** One span with fixed modifiers: production, harvest bursts, card XP and combat. */
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
  next.stats.playTimeMs += dtMs;

  // Production: every active plot/slot yields its producer's rate per second.
  const counts = producerCounts(state, content, modifiers);
  const perJob = Object.fromEntries(
    PRODUCTION_JOBS.map((job) => [
      job,
      jobProductionPerSecond(state, content, job, modifiers, counts),
    ]),
  ) as Record<(typeof PRODUCTION_JOBS)[number], Record<string, Decimal>>;
  for (const job of PRODUCTION_JOBS) {
    for (const [resource, perSecond] of Object.entries(perJob[job])) {
      const current = next.resources[resource] ?? new Decimal(0);
      next.resources[resource] = current.add(perSecond.mul(seconds));
    }
  }
  // Harvest bursts: production ticks fill each job's gauge; full = a bonus harvest.
  const burstSeconds = advanceHarvestBursts(next, state, content, seconds, report, modifiers);

  // Card XP: each job's loadout gains XP per unit harvested (normal output and bursts), and
  // every gem harvested counts toward its mastery.
  for (const job of PRODUCTION_JOBS) {
    const harvestSeconds = burstSeconds[job].add(seconds);
    const gains = Object.fromEntries(
      Object.entries(perJob[job]).map(([id, perSecond]) => [id, perSecond.mul(harvestSeconds)]),
    );
    countHarvest(next, content, gains);
    grantAccountXp(next, content, harvestXp(content, job, gains), modifiers, job);
    const perSecond = Object.values(perJob[job]).reduce((a, b) => a.add(b), new Decimal(0));
    const units = perSecond.mul(harvestSeconds);
    grantLoadoutXp(next, content, job, units.mul(productionXpPerUnit(content, job, modifiers)));
  }

  // Combat: the boss is auto-fought in parallel and respawns for farming.
  advanceCombat(next, content, seconds, rng, report, modifiers);

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
