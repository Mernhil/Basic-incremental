/**
 * The duel's showing rules for ultimates and the words on the enemy card. Pure, so tests reach it
 * without a screen (stage/arena.ts uses it).
 *
 * - Ultimates (a card's signature on a full gauge) play their cut-in one at a time, in the order they
 *   fired. The fight does not wait for them: only the showing does.
 * - A card has at most one ultimate waiting: a newer one from the same card replaces its older
 *   waiting one, in the older one's place in the line, so every card gets its turn when ultimates
 *   fire faster than cut-ins play (high speed). At most `SPECIAL_WAIT_MAX` wait in all; one more
 *   drops the oldest waiting. A replaced or dropped ultimate is never shown in another style.
 * - CRIT! and BREAK! are stamps on the enemy card, never in this queue and never waiting.
 */

/** Most ultimates waiting behind the one that plays (a team has four cards). */
export const SPECIAL_WAIT_MAX = 4;

/**
 * `job` joins the waiting line. If its card already has one waiting, `job` takes that one's place and
 * the older one is dropped; otherwise it joins the end, and the oldest beyond the cap leaves.
 */
export function queueSpecial<T extends { cardId: string }>(
  waiting: readonly T[],
  job: T,
  max: number = SPECIAL_WAIT_MAX,
): { waiting: T[]; dropped: T[] } {
  const same = waiting.findIndex((w) => w.cardId === job.cardId);
  if (same >= 0) {
    const next = [...waiting];
    next[same] = job;
    return { waiting: next, dropped: [waiting[same]!] };
  }
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
