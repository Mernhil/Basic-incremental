import type { MotionPref } from './prefs';

/** Pure rules of the reduced-motion override (settings/motion.ts installs them). */

const REDUCE = /^\(prefers-reduced-motion:\s*reduce\)$/i;
const NO_PREF = /^\(prefers-reduced-motion:\s*no-preference\)$/i;

/** What a media query on reduced motion should become under `pref` (null = leave as written). */
export function overrideMediaText(mediaText: string, pref: MotionPref): string | null {
  const text = mediaText.trim();
  const reduce = REDUCE.test(text);
  const noPref = NO_PREF.test(text);
  if (!reduce && !noPref) return null;
  if (pref === 'system') return text;
  const on = pref === 'reduced' ? reduce : noPref;
  return on ? 'all' : 'not all';
}

/** What a script query on reduced motion should answer under `pref` (null = ask the system). */
export function overrideMatches(query: string, pref: MotionPref): boolean | null {
  if (pref === 'system' || !/prefers-reduced-motion/i.test(query)) return null;
  if (/prefers-reduced-motion\s*:\s*reduce/i.test(query)) return pref === 'reduced';
  if (/prefers-reduced-motion\s*:\s*no-preference/i.test(query)) return pref === 'full';
  return pref === 'reduced'; // bare `(prefers-reduced-motion)`: true when motion is reduced
}
