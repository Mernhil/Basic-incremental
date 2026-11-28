import { TUTORIAL_AREA_ID, type GameState } from './state';

/** The duel speeds the button cycles through (DESIGN.md §2 Fights, Speed button). */
export const DUEL_SPEEDS = [1, 2, 4] as const;
export type DuelSpeed = (typeof DUEL_SPEEDS)[number];

/** What opens a speed: the first dungeon clear (x2) or the first Ascension (x4). */
export type SpeedLock = 'clear' | 'ascend';

/** Whether the player has earned `speed`. x1 is always open. */
export function isSpeedUnlocked(state: GameState, speed: number): boolean {
  if (speed <= 1) return true;
  if (speed === 2) return state.clearedDungeons.some((id) => id !== TUTORIAL_AREA_ID);
  if (speed === 4) return state.prestigeCount > 0;
  return false;
}

/** The speeds still shut, with what opens each. */
export function speedLocks(state: GameState): Partial<Record<2 | 4, SpeedLock>> {
  const locks: Partial<Record<2 | 4, SpeedLock>> = {};
  if (!isSpeedUnlocked(state, 2)) locks[2] = 'clear';
  if (!isSpeedUnlocked(state, 4)) locks[4] = 'ascend';
  return locks;
}

/** The best open speed that is at most the chosen one (a remembered x4 before the Ascension is x2). */
export function usableSpeed(state: GameState, chosen: number): DuelSpeed {
  let best: DuelSpeed = 1;
  for (const speed of DUEL_SPEEDS)
    if (speed <= chosen && isSpeedUnlocked(state, speed)) best = speed;
  return best;
}

/** The card-fight clock in seconds: play time plus the time a sped-up Challenge has gained. */
export function fightClock(state: GameState): number {
  return state.stats.playTimeMs / 1000 + (state.combat.fightClockBonus ?? 0);
}
