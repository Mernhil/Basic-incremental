/**
 * Sound settings (DESIGN.md §13): master and SFX volume, mute, and mute while the window is not
 * focused (on by default). On by default at a moderate volume. Stored per player in localStorage.
 */

export interface SoundSettings {
  /** 0..1 */
  master: number;
  /** 0..1 */
  sfx: number;
  muted: boolean;
  muteUnfocused: boolean;
}

export const DEFAULT_SOUND: SoundSettings = {
  master: 0.6,
  sfx: 0.8,
  muted: false,
  muteUnfocused: true,
};

export const SOUND_STORE_KEY = 'bi.sound';

const unit = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Reads stored settings; anything missing or broken falls back to the defaults. */
export function parseSoundSettings(raw: string | null): SoundSettings {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
  } catch {
    /* defaults */
  }
  return {
    master: unit(data['master'], DEFAULT_SOUND.master),
    sfx: unit(data['sfx'], DEFAULT_SOUND.sfx),
    muted: flag(data['muted'], DEFAULT_SOUND.muted),
    muteUnfocused: flag(data['muteUnfocused'], DEFAULT_SOUND.muteUnfocused),
  };
}

/** The gain a sound plays at, 0 when muted or unfocused-muted. */
export function effectiveVolume(s: SoundSettings, focused: boolean): number {
  if (s.muted || (s.muteUnfocused && !focused)) return 0;
  return s.master * s.sfx;
}
