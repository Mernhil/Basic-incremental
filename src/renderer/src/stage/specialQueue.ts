/**
 * The duel's showing rules for ultimates and the words on the enemy card. Pure, so tests reach it
 * without a screen (stage/arena.ts uses it).
 *
 * - Ultimates (a card's signature on a full gauge) play their cut-in one at a time, in the order they
 *   fired. The fight does not wait for them: only the showing does.
 * - At most `SPECIAL_WAIT_MAX` wait behind the one playing. When one more arrives (high speed, many
 *   signatures), the oldest waiting is dropped. A dropped ultimate is never shown in another style.
 * - CRIT! and BREAK! are stamps on the enemy card, never in this queue and never waiting.
 */

/** Most ultimates waiting behind the one that plays. */
export const SPECIAL_WAIT_MAX = 2;

/** `job` joins the end of the waiting line; the oldest ones beyond the cap leave it. */
export function queueSpecial<T>(
  waiting: readonly T[],
  job: T,
  max: number = SPECIAL_WAIT_MAX,
): { waiting: T[]; dropped: T[] } {
  const all = [...waiting, job];
  const over = Math.max(0, all.length - max);
  return { waiting: all.slice(over), dropped: all.slice(0, over) };
}

/** A place on the enemy card, as fractions of its width and height. */
export interface Spot {
  x: number;
  y: number;
}

/**
 * The band each stamp lands in, around the card's middle column: BREAK! takes the upper slot, CRIT!
 * the lower, so the two words never cross.
 */
const STAMP_BAND = {
  crit: { x: [0.35, 0.65], y: [0.66, 0.76] },
  break: { x: [0.35, 0.65], y: [0.14, 0.24] },
} as const;

/** Nearest two stamps may sit to each other (fraction of the card's width, y counts half). */
export const STAMP_GAP = 0.16;

const gap = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, (a.y - b.y) * 2);

/**
 * Where a stamp lands: a random place in its band that keeps `STAMP_GAP` from the stamps still
 * showing; when none fits, the farthest tried. `rnd` is Math.random in the game.
 */
export function stampSpot(
  kind: 'crit' | 'break',
  showing: readonly Spot[],
  rnd: () => number = Math.random,
): Spot {
  const band = STAMP_BAND[kind];
  // eight random tries, then the four corners of the band: a corner is always far from one stamp
  const tries: Spot[] = [];
  for (let i = 0; i < 8; i += 1)
    tries.push({
      x: band.x[0] + rnd() * (band.x[1] - band.x[0]),
      y: band.y[0] + rnd() * (band.y[1] - band.y[0]),
    });
  for (const x of band.x) for (const y of band.y) tries.push({ x, y });
  let best = tries[0]!;
  let bestGap = -1;
  for (const spot of tries) {
    const near = showing.reduce((m, s) => Math.min(m, gap(spot, s)), Infinity);
    if (near >= STAMP_GAP) return spot;
    if (near > bestGap) {
      best = spot;
      bestGap = near;
    }
  }
  return best;
}
