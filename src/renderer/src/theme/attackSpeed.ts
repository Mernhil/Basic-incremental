/**
 * How long an attack animation plays (DESIGN.md §6, "Attack animation follows hit speed"): a share
 * of the main card's hit interval, clamped to a readable range, so a dagger (0.5 s) swings fast and
 * a hammer (3 s) swings slowly without turning into a blur or a crawl. Display only.
 */

/** The share of the hit interval the animation takes. */
export const ATTACK_SHARE = 0.4;
/** Shortest animation, so a fast hit stays readable. */
export const ATTACK_MIN_MS = 200;
/** Longest animation, so a slow hit does not crawl. */
export const ATTACK_MAX_MS = 900;

/** Length of the attack animation for a hit interval in seconds. */
export function attackAnimationMs(intervalSeconds: number): number {
  const wanted = intervalSeconds * 1000 * ATTACK_SHARE;
  return Math.min(ATTACK_MAX_MS, Math.max(ATTACK_MIN_MS, wanted));
}

/**
 * How many times faster than its drawn length an animation of `baseMs` plays for the interval
 * (1 without an interval: the animation keeps the speed it was drawn at).
 */
export function attackSpeed(baseMs: number, intervalSeconds?: number): number {
  if (intervalSeconds === undefined || !(intervalSeconds > 0)) return 1;
  return baseMs / attackAnimationMs(intervalSeconds);
}
