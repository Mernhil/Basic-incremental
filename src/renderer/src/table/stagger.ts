/** Motion E's stagger (UI_RULES.md §2), pure so it is unit tested. */

export interface StaggerTokens {
  step: number;
  stepMin: number;
  max: number;
}

/**
 * The start delay of the item at `index` (0-based): the first gap is `step`, each later one 10 ms
 * shorter down to `stepMin`; items past `max` start with the last dealt one. Pure, for tests.
 */
export function dealDelay(index: number, t: StaggerTokens): number {
  const i = Math.min(index, t.max - 1);
  let delay = 0;
  for (let k = 1; k <= i; k++) delay += Math.max(t.step - 10 * (k - 1), t.stepMin);
  return delay;
}
