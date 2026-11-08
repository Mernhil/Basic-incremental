import { Decimal, type BossAttackEvent, type StageReadout } from '../../../game';

/**
 * Pure view maths behind the boss-hit visuals (DESIGN.md §6, "Screen edge pulse"): how strong the
 * edge pulse is as a slam winds up, where each hit's chunk sits on the health bar, and when the
 * "You fall in" readout shows. The game's own clock decides when things happen
 * (`bossAttackView`, `TickReport.bossAttacks`); nothing here keeps time or touches the DOM.
 */

/** Seconds before a slam that the edges start to pulse (the whole warning). */
export const WINDUP_SECONDS = 1.5;
/** A short interval never spends more than this share of itself on the warning. */
const WINDUP_MAX_SHARE = 0.8;
/** A slam may be this many seconds late on the screen's clock before its warning is dropped. */
const LATE_SECONDS = 0.25;

/**
 * Pulse rate (per second) at the start and at the end of the warning. The end stays under the
 * 3 flashes per second safety limit, and the pulse never dips to nothing (see `PULSE_DEPTH`), so
 * it breathes faster toward the hit instead of strobing.
 */
export const PULSE_HZ_START = 0.9;
export const PULSE_HZ_END = 2.2;
/** How much of the strength the pulse swings: 0.35 means between 65% and 100% of the build-up. */
export const PULSE_DEPTH = 0.35;
/** Strength of the still glow under reduced motion, as a share of the full pulse. */
export const STILL_GLOW = 0.7;

/** Length of the warning for a boss that attacks every `intervalSeconds`. */
export function windupSeconds(intervalSeconds: number): number {
  return Math.max(0.3, Math.min(WINDUP_SECONDS, intervalSeconds * WINDUP_MAX_SHARE));
}

/**
 * How far the warning has come, 0 outside it and rising to 1 as the slam lands. `nextAttackSeconds`
 * is the time to the next attack (`BossAttackView`), `nextIsSlam` whether that attack is the slam.
 * A slam that is a moment late holds at 1; one that is long overdue (the view is stale) is dropped.
 */
export function windupProgress(
  nextIsSlam: boolean,
  nextAttackSeconds: number,
  intervalSeconds: number,
): number {
  if (!nextIsSlam) return 0;
  if (nextAttackSeconds < -LATE_SECONDS) return 0;
  const length = windupSeconds(intervalSeconds);
  if (nextAttackSeconds > length) return 0;
  return Math.min(1, Math.max(0, 1 - nextAttackSeconds / length));
}

/**
 * Strength of the edge pulse, 0..1, for a warning that is `progress` of the way through and
 * `lengthSeconds` long. It builds up with the progress and breathes faster toward the hit; the
 * breathing is a pure function of the progress, so the same moment always looks the same. Under
 * reduced motion it is a still glow that only builds up.
 */
export function edgeStrength(progress: number, lengthSeconds: number, reduced: boolean): number {
  if (progress <= 0) return 0;
  const p = Math.min(1, progress);
  const build = Math.pow(p, 0.8);
  if (reduced) return build * STILL_GLOW;
  // the phase of a pulse whose rate rises linearly from PULSE_HZ_START to PULSE_HZ_END
  const cycles =
    lengthSeconds * (PULSE_HZ_START * p + ((PULSE_HZ_END - PULSE_HZ_START) * p * p) / 2);
  const wave = 0.5 + 0.5 * Math.sin(2 * Math.PI * cycles - Math.PI / 2);
  return build * (1 - PULSE_DEPTH + PULSE_DEPTH * wave);
}

/** A hit's piece of the health bar: where it started and ended, as fractions of the full pool. */
export interface ChunkSpan {
  /** Pool left before the hit, 0..1. */
  from: number;
  /** Pool left after the hit, 0..1. */
  to: number;
}

/** One reported boss attack with its piece of the bar. */
export interface BossHitShow {
  event: BossAttackEvent;
  span: ChunkSpan;
}

/**
 * Each reported attack in order, with where it took its damage from on the bar. `poolBefore` is
 * the health left when the step began and `max` the full pool, both of the loadout that was hit.
 * Attacks after the pool is empty (a merged event) are clamped to what was left.
 */
export function bossHitShows(
  events: readonly BossAttackEvent[],
  poolBefore: Decimal,
  max: Decimal,
): BossHitShow[] {
  if (max.lte(0)) return [];
  let left = Decimal.min(Decimal.max(poolBefore, 0), max);
  return events.map((event) => {
    const from = left;
    left = Decimal.max(left.sub(event.damage), 0);
    return {
      event,
      span: { from: from.div(max).toNumber(), to: left.div(max).toNumber() },
    };
  });
}

/** What the "You fall in" banner says; null while it stays hidden. */
export interface FallBanner {
  /** Seconds the full health lasts against this boss. */
  fallSeconds: number;
  /** Seconds the loadout falls before the boss does. */
  earlySeconds: number;
  /** Seconds until the knockout from the health left now; null while knocked out. */
  nowSeconds: number | null;
}

/**
 * The banner shows only when the loadout would fall before it kills the boss (the stage readout's
 * `fallsFirst`): then the fight cannot be won with this loadout. Otherwise nothing is shown.
 */
export function fallBanner(
  r: Pick<
    StageReadout,
    'fallsFirst' | 'secondsToKnockout' | 'secondsPerKill' | 'secondsToKnockoutNow'
  >,
): FallBanner | null {
  if (!r.fallsFirst || r.secondsToKnockout === null || r.secondsPerKill === null) return null;
  return {
    fallSeconds: r.secondsToKnockout,
    earlySeconds: Math.max(0, r.secondsPerKill - r.secondsToKnockout),
    nowSeconds: r.secondsToKnockoutNow,
  };
}
