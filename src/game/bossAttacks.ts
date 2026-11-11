import type { CombatConfig } from '../data';
import { pushBossAttack, type BossAttackEvent, type TickReport } from './report';
import { Decimal } from './num';

/**
 * The boss's attack schedule (DESIGN.md §6): discrete hits at the boss's interval, light hits
 * with a slam closing every cycle. Attacks are numbered 1, 2, 3 ... on the play-time clock: attack
 * `k` lands at `k * interval` seconds of play time. Like the harvest strikes (harvest.ts), the
 * schedule depends on play time alone, so it needs no saved state and online, offline and any
 * split of time give the same hits. Pure maths, no game state.
 */

export type BossPattern = CombatConfig['bossPattern'];

/** Slack that keeps a boundary exactly on an attack from flipping with rounding. */
const EPSILON = 1e-9;

/** Whether attack number `k` is a slam (every `attacksPerCycle`-th one). */
export function isBossSlam(k: number, pattern: BossPattern): boolean {
  return k % pattern.attacksPerCycle === 0;
}

/** Damage of attack number `k` as a multiple of a normal attack: light or slam. */
export function bossAttackMultiplier(k: number, pattern: BossPattern): number {
  return isBossSlam(k, pattern) ? pattern.slamMultiplier : pattern.lightMultiplier;
}

/** Number of the last attack landed by `seconds` of play time (0 before the first). */
export function bossAttacksBy(seconds: number, intervalSeconds: number): number {
  return Math.max(0, Math.floor(seconds / intervalSeconds + EPSILON));
}

/** Number of the first slam strictly after attack `k`. */
export function nextBossSlam(k: number, pattern: BossPattern): number {
  return (Math.floor(k / pattern.attacksPerCycle) + 1) * pattern.attacksPerCycle;
}

/** Slams among attacks `after + 1 .. upto`. */
export function slamsBetween(after: number, upto: number, pattern: BossPattern): number {
  const c = pattern.attacksPerCycle;
  return Math.floor(upto / c) - Math.floor(after / c);
}

/** Damage of attacks `after + 1 .. upto`, given the damage of a normal attack. */
export function bossDamageBetween(
  after: number,
  upto: number,
  normal: Decimal,
  pattern: BossPattern,
): Decimal {
  const count = upto - after;
  if (count <= 0) return new Decimal(0);
  const slams = slamsBetween(after, upto, pattern);
  const multiple = (count - slams) * pattern.lightMultiplier + slams * pattern.slamMultiplier;
  return normal.mul(multiple);
}

/**
 * Number of the attack that empties `pool` when attacks `after + 1, after + 2 ...` land on it:
 * the first whose running total reaches the pool. An empty pool is emptied by the very next hit.
 * `normal` must be above 0.
 */
export function lethalBossAttack(
  pool: Decimal,
  normal: Decimal,
  after: number,
  pattern: BossPattern,
): number {
  if (pool.lte(0)) return after + 1;
  const c = pattern.attacksPerCycle;
  const cycle = normal.mul(c);
  const ratio = pool.div(cycle).toNumber();
  if (!Number.isFinite(ratio) || ratio > Number.MAX_SAFE_INTEGER / c) {
    return Number.MAX_SAFE_INTEGER;
  }
  // Whole cycles leave the position in the cycle unchanged: skip all but the last one needed.
  const cycles = Math.max(0, Math.ceil(ratio - EPSILON) - 1);
  let k = after + cycles * c;
  let left = pool.sub(cycle.mul(cycles));
  const slack = pool.mul(EPSILON);
  for (let i = 0; i <= 2 * c; i++) {
    k++;
    left = left.sub(normal.mul(bossAttackMultiplier(k, pattern)));
    if (left.lte(slack)) return k;
  }
  return k;
}

/**
 * Average number of attacks a full `pool` lasts, over the `attacksPerCycle` places in the cycle a
 * fight can start from. Counts attacks from the one after the start, so subtract half an attack
 * for a start at a random moment between two hits.
 */
export function meanAttacksToKnockout(
  pool: Decimal,
  normal: Decimal,
  pattern: BossPattern,
): number {
  const c = pattern.attacksPerCycle;
  let total = 0;
  for (let start = 0; start < c; start++) {
    total += lethalBossAttack(pool, normal, start, pattern) - start;
  }
  return total / c;
}

/** Spans with more attacks than this are reported merged, one event for the light hits and one for the slams. */
const MAX_DETAILED_ATTACKS = 16;

/**
 * Records the attacks `after + 1 .. upto` on `dungeonId` for the stage. `normal` is the damage of
 * a normal attack. With `lethal` the last one emptied the pool: it is always its own event, with
 * `knockout` set.
 */
export function recordBossAttacks(
  report: TickReport,
  dungeonId: string,
  after: number,
  upto: number,
  normal: Decimal,
  intervalSeconds: number,
  pattern: BossPattern,
  lethal: boolean,
  cardId = '',
): void {
  if (upto <= after) return;
  const single = (k: number, knockout: boolean): BossAttackEvent => ({
    dungeon: dungeonId,
    damage: normal.mul(bossAttackMultiplier(k, pattern)),
    slam: isBossSlam(k, pattern),
    attacks: 1,
    knockout,
    nextSlamSeconds: (nextBossSlam(k, pattern) - k) * intervalSeconds,
    cardId,
  });
  const lastLight = lethal ? upto - 1 : upto;
  const count = lastLight - after;
  if (count > MAX_DETAILED_ATTACKS) {
    // Too many to play one by one: one event for the light hits, one for the slams.
    const slams = slamsBetween(after, lastLight, pattern);
    const lights = count - slams;
    const nextSlamSeconds = (nextBossSlam(lastLight, pattern) - lastLight) * intervalSeconds;
    const merged = (n: number, slam: boolean): BossAttackEvent => ({
      dungeon: dungeonId,
      damage: normal.mul(n * (slam ? pattern.slamMultiplier : pattern.lightMultiplier)),
      slam,
      attacks: n,
      knockout: false,
      nextSlamSeconds,
      cardId,
    });
    if (lights > 0) pushBossAttack(report.bossAttacks, merged(lights, false));
    if (slams > 0) pushBossAttack(report.bossAttacks, merged(slams, true));
  } else {
    for (let k = after + 1; k <= lastLight; k++)
      pushBossAttack(report.bossAttacks, single(k, false));
  }
  if (lethal) pushBossAttack(report.bossAttacks, single(upto, true));
}
