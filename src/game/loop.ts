import type { Content } from '../data';
import type { Rng } from './rng';
import type { GameState } from './state';
import type { TickReport } from './report';
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
export class GameLoop {
  private lastMs: number;

  constructor(
    public state: GameState,
    private readonly content: Content,
    private readonly rng: Rng,
    startMs: number,
  ) {
    this.lastMs = startMs;
  }

  step(nowMs: number): TickReport {
    // A clock that went backwards (or a huge gap, e.g. after sleep) is clamped, never negative.
    const delta = Math.min(Math.max(0, nowMs - this.lastMs), MAX_STEP_MS);
    this.lastMs = Math.max(this.lastMs, nowMs);
    // Splitting a span differently gives the same totals (tick.ts), so a long gap is caught up in
    // minute steps instead of thousands of one-second ones, which froze the window for seconds.
    const chunk = delta > CATCH_UP_AFTER_MS ? CATCH_UP_CHUNK_MS : CHUNK_MS;
    const { state, report } = advanceChunked(this.state, this.content, delta, this.rng, chunk);
    this.state = state;
    return report;
  }

  /** Replace the state (e.g. after import) and restart the clock. */
  reset(state: GameState, nowMs: number): void {
    this.state = state;
    this.lastMs = nowMs;
  }
}
