import type { Milestones } from '../data';
import { Decimal } from './num';

/**
 * Level milestones (DESIGN.md §4): every `every` levels a line's output is multiplied by
 * `multiplier`. Used by the damage lines and mine levels; the UI marks the next one ("Lv 25: x2")
 * and celebrates each one reached.
 */

/** How many milestones `level` has reached. */
export function milestonesReached(m: Milestones, level: number): number {
  return level > 0 ? Math.floor(level / m.every) : 0;
}

/** The output multiplier at `level`: multiplier ^ milestones reached. */
export function milestoneMultiplier(m: Milestones, level: number): Decimal {
  const n = milestonesReached(m, level);
  return n === 0 ? new Decimal(1) : m.multiplier.pow(n);
}

/** The next milestone above `level`: the level it is at and the multiplier it adds. */
export function nextMilestone(
  m: Milestones,
  level: number,
): { level: number; multiplier: Decimal } {
  return { level: (milestonesReached(m, level) + 1) * m.every, multiplier: m.multiplier };
}

/** A line's milestones as the upgrade shows them ("Lv 50: x2"), ready to display. */
export interface MilestoneInfo {
  /** Milestones reached so far. */
  reached: number;
  /** Output multiplier from the milestones reached. */
  multiplier: Decimal;
  /** Level of the next milestone. */
  nextLevel: number;
  /** Multiplier the next milestone adds on top. */
  nextMultiplier: Decimal;
  /** Levels still to buy to reach it (at least 1). */
  levelsToNext: number;
  /** How far the level is from the last milestone to the next, 0..1. */
  progress: number;
}

export function milestoneInfo(m: Milestones, level: number): MilestoneInfo {
  const lv = Math.max(0, level);
  const reached = milestonesReached(m, lv);
  const next = nextMilestone(m, lv);
  return {
    reached,
    multiplier: milestoneMultiplier(m, lv),
    nextLevel: next.level,
    nextMultiplier: next.multiplier,
    levelsToNext: next.level - lv,
    progress: (lv - reached * m.every) / m.every,
  };
}

/** Milestone levels crossed going from `from` to `to` (for the celebration and toast). */
export function milestonesCrossed(m: Milestones, from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = milestonesReached(m, from) + 1; n * m.every <= to; n++) out.push(n * m.every);
  return out;
}

/**
 * Visual growth stage 0..4 from a level: one step per milestone, capped at the top stage
 * (DESIGN.md §12).
 */
export function growthStage(m: Milestones, level: number, top = 4): number {
  return Math.min(top, milestonesReached(m, level));
}
