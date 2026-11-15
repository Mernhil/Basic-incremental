import { Decimal } from '../../../game';

/** How long a header counter takes to glide to a new, higher value (ms). */
export const COUNTER_GLIDE_MS = 600;

/** One glide: from the value on screen when the target moved, to the new target. */
export interface CounterTween {
  from: Decimal;
  to: Decimal;
  startMs: number;
  durationMs: number;
}

/** A counter at rest on `value`. */
export function restingTween(value: Decimal, nowMs = 0): CounterTween {
  return { from: value, to: value, startMs: nowMs, durationMs: 0 };
}

/** Ease-out cubic: quick at first, settling softly. `t` is clamped to 0..1. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * The value to show at `nowMs`. Never passes the target, so it never shows more than the
 * player has.
 */
export function tweenValue(tween: CounterTween, nowMs: number): Decimal {
  if (tween.durationMs <= 0 || tween.from.eq(tween.to)) return tween.to;
  const t = (nowMs - tween.startMs) / tween.durationMs;
  if (t >= 1) return tween.to;
  const value = tween.from.add(tween.to.sub(tween.from).mul(easeOut(t)));
  return tween.to.gt(tween.from) ? Decimal.min(value, tween.to) : Decimal.max(value, tween.to);
}

/**
 * The tween after the real value became `target`. A higher value restarts the glide from
 * what is shown now; a lower one (a spend), the same value, or reduced motion shows at once,
 * so a price check never looks affordable when it is not.
 */
export function retarget(
  tween: CounterTween,
  target: Decimal,
  nowMs: number,
  opts: { reduced?: boolean; durationMs?: number } = {},
): CounterTween {
  if (tween.to.eq(target)) return tween;
  const shown = tweenValue(tween, nowMs);
  if (opts.reduced || target.lte(shown)) return restingTween(target, nowMs);
  return {
    from: shown,
    to: target,
    startMs: nowMs,
    durationMs: opts.durationMs ?? COUNTER_GLIDE_MS,
  };
}
