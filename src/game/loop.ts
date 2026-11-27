import type { Content } from '../data';
import type { Rng } from './rng';
import type { GameState } from './state';
import type { TickReport } from './report';
import { usableSpeed } from './speed';
import { advanceChunked } from './tick';

/** Real elapsed time larger than this in one step is clamped (matches the offline cap). */
export const MAX_STEP_MS = 8 * 60 * 60 * 1000;
const CHUNK_MS = 1000;
/** A gap longer than this (the PC slept, the window was frozen) is caught up in big steps. */
const CATCH_UP_AFTER_MS = 5000;
/** Step size while catching up: the same as offline progress uses. */
const CATCH_UP_CHUNK_MS = 60_000;

/**
 * Drives the game from real elapsed time. The host (renderer) calls `step(Date.now())` on a
 * timer or animation frame; how often it does so does not change the outcome, because each
 * step advances by the actual time since the previous one.
 */
/** The game speeds the dev panel offers (1 = normal pace; DESIGN.md §2 Dev tools). */
export const GAME_SPEEDS = [1, 2, 5, 10] as const;

export class GameLoop {
  private lastMs: number;
  private speedFactor = 1;
  private chosenDuelSpeed = 1;

  constructor(
    public state: GameState,
    private readonly content: Content,
    private readonly rng: Rng,
    startMs: number,
  ) {
    this.lastMs = startMs;
  }

  /** The multiplier on the game's elapsed time; 1 unless a dev build changed it. Never saved. */
  get speed(): number {
    return this.speedFactor;
  }

  /**
   * Runs the game `speed` times faster than the clock (production, fights, timers and cooldowns
   * together, because it scales the elapsed time every rule reads). Anything but a finite number
   * above 0 means 1x. The host steps the loop first so the time before the change runs at the
   * old speed. Real timestamps (saves, offline progress) are never scaled.
   */
  setSpeed(speed: number): void {
    this.speedFactor = Number.isFinite(speed) && speed > 0 ? Math.min(speed, 100) : 1;
  }

  /** The duel speed the player chose (1, 2 or 4); what runs is capped by what is open. */
  get duelSpeed(): number {
    return this.chosenDuelSpeed;
  }

  /** Sets the chosen duel speed (DESIGN.md §2 Speed button). The host steps the loop first. */
  setDuelSpeed(speed: number): void {
    this.chosenDuelSpeed = Number.isFinite(speed) && speed >= 1 ? speed : 1;
  }

  /** The speed a Challenge would run at right now: the chosen one, held to what is open. */
  get effectiveDuelSpeed(): number {
    return usableSpeed(this.state, this.chosenDuelSpeed);
  }

  step(nowMs: number): TickReport {
    // A clock that went backwards (or a huge gap, e.g. after sleep) is clamped, never negative;
    // the speed multiplies the clamped real gap, so a sleep never pays out more than 8 hours.
    const delta = Math.min(Math.max(0, nowMs - this.lastMs), MAX_STEP_MS) * this.speedFactor;
    // A small step back (a clock correction) waits for the clock to catch up, so no time counts
    // twice. A step back past the step cap (a clock that was set far ahead) restarts from now,
    // so the game never waits more than that.
    this.lastMs = this.lastMs - nowMs > MAX_STEP_MS ? nowMs : Math.max(this.lastMs, nowMs);
    // Splitting a span differently gives the same totals (tick.ts), so a long gap is caught up in
    // minute steps instead of thousands of one-second ones, which froze the window for seconds.
    const chunk = delta > CATCH_UP_AFTER_MS ? CATCH_UP_CHUNK_MS : CHUNK_MS;
    const { state, report } = advanceChunked(
      this.state,
      this.content,
      delta,
      this.rng,
      chunk,
      // a long gap is caught up at the real pace, like offline progress
      delta > CATCH_UP_AFTER_MS ? 1 : this.effectiveDuelSpeed,
    );
    this.state = state;
    return report;
  }

  /** Replace the state (e.g. after import) and restart the clock. */
  reset(state: GameState, nowMs: number): void {
    this.state = state;
    this.lastMs = nowMs;
  }
}
