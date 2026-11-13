/**
 * Display and save preferences of the Settings page (DESIGN.md §11): reduced motion and the
 * autosave interval (numbers have one format and no setting). Stored per player in localStorage next to the sound settings.
 */

/** `system` follows the Windows animation setting; `reduced` and `full` override it. */
export type MotionPref = 'system' | 'reduced' | 'full';

export interface UiPrefs {
  motion: MotionPref;
  /** Seconds between autosaves; one of AUTOSAVE_CHOICES. */
  autosaveSeconds: number;
}

export const MOTION_PREFS: readonly MotionPref[] = ['system', 'reduced', 'full'];
export const AUTOSAVE_CHOICES: readonly number[] = [10, 30, 60, 120, 300];

export const DEFAULT_PREFS: UiPrefs = {
  motion: 'system',
  autosaveSeconds: 30,
};

export const PREFS_STORE_KEY = 'bi.ui';

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads stored preferences; anything missing or broken falls back to the defaults. */
export function parsePrefs(raw: string | null): UiPrefs {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
  } catch {
    /* defaults */
  }
  return {
    motion: pick(data['motion'], MOTION_PREFS, DEFAULT_PREFS.motion),
    autosaveSeconds: pick(data['autosaveSeconds'], AUTOSAVE_CHOICES, DEFAULT_PREFS.autosaveSeconds),
  };
}

// ---- live store ----

const listeners = new Set<(p: UiPrefs) => void>();
let current: UiPrefs = load();

function load(): UiPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORE_KEY);
    const parsed = parsePrefs(raw);
    // The old number-format choice is gone: drop it from what is stored.
    if (raw !== null && raw.includes('"numbers"'))
      localStorage.setItem(PREFS_STORE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return parsePrefs(null);
  }
}

export function prefs(): UiPrefs {
  return current;
}

/** Changes some preferences, stores them and tells every listener. */
export function setPrefs(patch: Partial<UiPrefs>): void {
  current = parsePrefs(JSON.stringify({ ...current, ...patch }));
  try {
    localStorage.setItem(PREFS_STORE_KEY, JSON.stringify(current));
  } catch {
    /* storage full or blocked: keep the change for this session */
  }
  for (const fn of listeners) fn(current);
}

/** Calls `fn` on every change. Returns an unsubscribe function. */
export function onPrefs(fn: (p: UiPrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
