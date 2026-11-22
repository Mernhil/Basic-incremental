import type { Content } from '../data';
import { grantWorkerXp, hasPendingLevel, productionXpPerUnit, settleCardLevels } from './cards';
import { advanceCombat } from './combat';
import { accountLevelDue, grantAccountXp, harvestXp, settleAccount } from './account';
import { achievementsDue, settleAchievements } from './achievements';
import { settleQuests } from './quests';
import { settleTierRewards } from './tierRewards';
import { bondsDue, settleBonds } from './bonds';
import { advanceTrips } from './expeditions';
import { settleChallenges } from './challenges';
import { advanceForge } from './forge';
import { countHarvest, masteryDue, settleMastery } from './mastery';
import { collectModifiers } from './modifiers';
import { Decimal } from './num';
import { countMoneyEarned } from './upgrades';
import { slotRates } from './camp';
import { PRODUCTION_JOBS } from './production';
import { emptyReport, mergeReports, type TickReport } from './report';
import type { Rng } from './rng';
import { cloneState, type GameState } from './state';
import { payFieldCache } from './summon';

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
  fightSpeed = 1,
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
      current = advanceSpan(current, content, remaining, rng, report, fightSpeed);
      break;
    }
    const until = toBoundary + (first - 1) * CARD_LEVEL_STEP_MS;
    current = advanceSpan(current, content, until, rng, report, fightSpeed);
    settleCardLevels(current, content, report);
    settleMastery(current, content, report);
    settleAccount(current, content, report);
    settleBonds(current, content);
    settleAchievements(current, content, report);
    settleQuests(current, content);
    settleTierRewards(current, content);
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
    bondsDue(ahead, content) ||
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
  fightSpeed = 1,
): GameState {
  const next = cloneState(state);
  const seconds = dtMs / 1000;
  const modifiers = collectModifiers(state, content);
  const fromMs = state.stats.playTimeMs;
  next.stats.playTimeMs += dtMs;
  // Expedition trips are plain timers (DESIGN.md §15).
  advanceTrips(next, seconds);
  // The field cache: a scroll lump on every whole period of play time spent fighting (DESIGN.md §3).
  payFieldCache(next, content, fromMs, fromMs + dtMs, modifiers);

  // The camp (DESIGN.md section 2): every farming slot yields its rate per second, once.
  const slots = slotRates(state, content, modifiers);
  for (const { worker, rate } of slots) {
    const resource = worker.material.resource;
    next.resources[resource] = (next.resources[resource] ?? new Decimal(0)).add(rate.mul(seconds));
  }

  // The forge turns the gems of the step into what its recipe makes.
  advanceForge(next, content, seconds);

  // Card XP: each farming card gains XP per unit its slot made; every gem harvested counts toward
  // its mastery and the account.
  for (const job of PRODUCTION_JOBS) {
    const gains: Record<string, Decimal> = {};
    for (const { worker, rate } of slots) {
      if (
        worker.material.resource === undefined ||
        (worker.place === 'forest') !== (job === 'logging')
      )
        continue;
      const units = rate.mul(seconds);
      const resource = worker.material.resource;
      gains[resource] = (gains[resource] ?? new Decimal(0)).add(units);
      const perUnit = productionXpPerUnit(content, job, modifiers, worker.material.id);
      grantWorkerXp(next, content, worker.card, units.mul(perUnit));
    }
    countHarvest(next, content, gains);
    grantAccountXp(next, content, harvestXp(content, job, gains), modifiers, job);
  }

  // Combat: the dungeon's floors are auto-fought in parallel.
  const moneyBefore = next.resources[content.perks.currency];
  advanceCombat(next, content, seconds, rng, report, modifiers, fightSpeed);
  delete next.combat.paySlow;
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
  fightSpeed = 1,
): { state: GameState; report: TickReport } {
  const report = emptyReport();
  let current = state;
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(chunkMs, remaining);
    const result = advance(current, content, step, rng, fightSpeed);
    current = result.state;
    mergeReports(report, result.report);
    remaining -= step;
  }
  return { state: current, report };
}
