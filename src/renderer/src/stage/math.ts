import { Decimal } from '../../../game';
import { fmt } from '../settings/numberFormat';

/**
 * Pure helpers behind the stage juice (DESIGN.md 14): popup sizes, a running average of hits,
 * the rolling header counters, merging rapid tick numbers and throttling repeated effects.
 * No DOM here, so all of it is unit tested.
 */

/** Smallest and largest popup scale, relative to the tick-size token. */
export const POPUP_SCALE_MIN = 0.75;
export const POPUP_SCALE_MAX = 2.1;

/**
 * Size of a floating number relative to the current average: 1 at the average, +0.35 per
 * doubling, clamped. A zero or missing average gives 1.
 */
export function popupScale(value: Decimal, average: Decimal): number {
  if (!(average.gt(0) && value.gt(0))) return 1;
  const doublings = value.div(average).log2().toNumber();
  if (!Number.isFinite(doublings)) return doublings > 0 ? POPUP_SCALE_MAX : POPUP_SCALE_MIN;
  return Math.min(POPUP_SCALE_MAX, Math.max(POPUP_SCALE_MIN, 1 + 0.35 * doublings));
}

/** A running (exponential) average: the first value seeds it, later ones move it by `weight`. */
export function nextAverage(average: Decimal | null, value: Decimal, weight = 0.2): Decimal {
  if (average === null || average.lte(0)) return value;
  return average.mul(1 - weight).add(value.mul(weight));
}

/**
 * One frame of a rolling counter: moves `shown` toward `target` with time constant `tauMs`.
 * Snaps when the gap is below `snap` of the target, so it settles instead of crawling forever.
 */
export function rollToward(
  shown: Decimal,
  target: Decimal,
  dtMs: number,
  tauMs = 220,
  snap = 1e-4,
): Decimal {
  const gap = target.sub(shown);
  if (gap.abs().lte(Decimal.max(target.abs().mul(snap), 1e-9))) return target;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
  return shown.add(gap.mul(k));
}

/** What `Merger.push` decided: start a new popup, or add to the open one for the key. */
export interface MergeResult<T> {
  merged: boolean;
  /** The popup's value after this push (the sum when merged). */
  value: T;
}

/**
 * Merges rapid numbers per key: a value pushed within `windowMs` of the key's open popup is
 * added to it instead of starting a new popup.
 */
export function createMerger<T>(windowMs: number, add: (a: T, b: T) => T) {
  const open = new Map<string, { since: number; value: T }>();
  return {
    push(key: string, value: T, now: number): MergeResult<T> {
      const entry = open.get(key);
      if (entry && now - entry.since < windowMs) {
        entry.value = add(entry.value, value);
        return { merged: true, value: entry.value };
      }
      open.set(key, { since: now, value });
      return { merged: false, value };
    },
    /** Forgets a key (its popup is gone). */
    close(key: string): void {
      open.delete(key);
    },
  };
}

/** Allows at most `max` events per key in any `windowMs` (sounds, coins). */
export function createThrottle(max: number, windowMs: number) {
  const recent = new Map<string, number[]>();
  return {
    allow(key: string, now: number): boolean {
      const times = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
      const ok = times.length < max;
      if (ok) times.push(now);
      recent.set(key, times);
      return ok;
    },
  };
}

/** Removes the oldest items so that at most `cap` stay; returns the removed ones (oldest first). */
export function overCap<T>(items: T[], cap: number): T[] {
  return items.length > cap ? items.splice(0, items.length - cap) : [];
}

/**
 * Text of a floating number: whole numbers from 10 up ("398", not "398.82"), one decimal
 * below 10, the game's short form from 1,000 up.
 */
export function popText(value: Decimal): string {
  if (value.gte(1000)) return fmt(value);
  if (value.gte(10)) return value.round().toString();
  return fmt(new Decimal(value.toFixed(1)));
}
