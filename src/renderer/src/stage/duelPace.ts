/**
 * The pace the duel's animations play at (DESIGN.md §2 Speed button): 1 normally, the Challenge's
 * speed while a sped-up Challenge runs. The game itself runs the fight at that speed, so hits and
 * cut-ins have to keep up. CSS reads it as `--pace` on the page root; timers and tweens divide by
 * `duelPace()`.
 */

let pace = 1;

export function duelPace(): number {
  return pace;
}

/** Sets the pace (1, 2 or 4) and publishes it to the stylesheets. */
export function setDuelPace(next: number): void {
  const value = next >= 1 && Number.isFinite(next) ? next : 1;
  if (value === pace) return;
  pace = value;
  if (typeof document !== 'undefined')
    document.documentElement.style.setProperty('--pace', String(value));
}

/** A duration in ms as it plays at the current pace. */
export function paced(ms: number): number {
  return ms / pace;
}
