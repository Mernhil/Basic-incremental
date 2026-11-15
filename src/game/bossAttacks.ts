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
/** A boss ability (DESIGN.md §6 Boss abilities): every `every`-th attack is its hit on its target. */
export type BossAbility = CombatConfig['bossAbilities'][number];

/** The abilities a floor kind on a difficulty has (`combat.json` `bossAbilities`), in order. */
export function abilitiesFor(
  all: readonly BossAbility[],
  kind: string,
  difficulty: string,
): BossAbility[] {
  return all.filter(
    (a) =>
      (a.kinds as readonly string[]).includes(kind) &&
      (a.difficulties as readonly string[]).includes(difficulty),
  );
}

/** The ability that replaces attack number `k` (never a slam; the first listed wins), or null. */
export function abilityOfAttack(
  k: number,
  pattern: BossPattern,
  abilities: readonly BossAbility[],
): BossAbility | null {
  if (abilities.length === 0 || isBossSlam(k, pattern)) return null;
  for (const a of abilities) if (k % a.every === a.offset) return a;
  return null;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Attacks after which the slams and every ability repeat. */
function schedulePeriod(pattern: BossPattern, abilities: readonly BossAbility[]): number {
  return abilities.reduce((p, a) => (p * a.every) / gcd(p, a.every), pattern.attacksPerCycle);
}

/** How many of attacks `after + 1 .. upto` each ability replaces (same order as `abilities`). */
export function abilityCounts(
  after: number,
  upto: number,
  pattern: BossPattern,
  abilities: readonly BossAbility[],
): number[] {
  const counts = abilities.map(() => 0);
  if (abilities.length === 0 || upto <= after) return counts;
  const period = schedulePeriod(pattern, abilities);
  const upTo = (n: number): number[] => {
    const whole = Math.floor(n / period);
    const out = abilities.map(() => 0);
    for (let k = 1; k <= period; k++) {
      const a = abilityOfAttack(k, pattern, abilities);
      if (!a) continue;
      const i = abilities.indexOf(a);
      out[i]! += whole + (k <= n % period ? 1 : 0);
    }
    return out;
  };
  const hi = upTo(upto);
  const lo = upTo(after);
  return counts.map((_, i) => hi[i]! - lo[i]!);
}

/** What attack `k` takes from its main target, as a multiple of a normal attack: 0 when an
 *  ability sends it elsewhere. */
function mainMultiplier(
  k: number,
  pattern: BossPattern,
  abilities: readonly BossAbility[],
): number {
  return abilityOfAttack(k, pattern, abilities) ? 0 : bossAttackMultiplier(k, pattern);
}

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

/**
 * Damage of attacks `after + 1 .. upto` on their main target, given the damage of a normal attack;
 * the attacks an ability sends elsewhere (`abilities`) are left out.
 */
export function bossDamageBetween(
  after: number,
  upto: number,
  normal: Decimal,
  pattern: BossPattern,
  abilities: readonly BossAbility[] = [],
): Decimal {
  const count = upto - after;
  if (count <= 0) return new Decimal(0);
  const slams = slamsBetween(after, upto, pattern);
  const replaced = abilityCounts(after, upto, pattern, abilities).reduce((a, b) => a + b, 0);
  const multiple =
    (count - slams - replaced) * pattern.lightMultiplier + slams * pattern.slamMultiplier;
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
  abilities: readonly BossAbility[] = [],
): number {
  if (pool.lte(0)) return after + 1;
  const c = schedulePeriod(pattern, abilities);
  let perPeriod = 0;
  for (let k = 1; k <= c; k++) perPeriod += mainMultiplier(k, pattern, abilities);
  const cycle = normal.mul(perPeriod);
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
    left = left.sub(normal.mul(mainMultiplier(k, pattern, abilities)));
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
  abilities: readonly BossAbility[] = [],
): number {
  const c = schedulePeriod(pattern, abilities);
  let total = 0;
  for (let start = 0; start < c; start++) {
    total += lethalBossAttack(pool, normal, start, pattern, abilities) - start;
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
  abilities: readonly BossAbility[] = [],
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
    const replaced = abilityCounts(after, lastLight, pattern, abilities).reduce((a, b) => a + b, 0);
    const lights = count - slams - replaced;
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
    for (let k = after + 1; k <= lastLight; k++) {
      if (abilityOfAttack(k, pattern, abilities)) continue;
      pushBossAttack(report.bossAttacks, single(k, false));
    }
  }
  if (lethal) pushBossAttack(report.bossAttacks, single(upto, true));
}

/** One ability's hits in a span: how many landed and the attack number of the last one. */
export interface AbilityHits {
  ability: BossAbility;
  count: number;
  /** Attack number of the last of them (seeds which card it picked). */
  last: number;
}

/** The ability hits among attacks `after + 1 .. upto`. */
export function abilityHitsBetween(
  after: number,
  upto: number,
  pattern: BossPattern,
  abilities: readonly BossAbility[],
): AbilityHits[] {
  const counts = abilityCounts(after, upto, pattern, abilities);
  const out: AbilityHits[] = [];
  abilities.forEach((ability, i) => {
    const count = counts[i]!;
    if (count <= 0) return;
    let last = upto;
    while (abilityOfAttack(last, pattern, abilities) !== ability) last--;
    out.push({ ability, count, last });
  });
  return out;
}
