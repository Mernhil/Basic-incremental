import { describe, expect, it } from 'vitest';
import { advance, advanceChunked, setActiveDungeon, type GameState } from '../src/game';
import { constantRng, content, freshState } from './helpers';

/**
 * A long span handed to advance() in one piece (offline progress, a long sleep) must cost time in
 * proportion to its length. Level-ups and other settles inside the span used to be found by a
 * look-ahead over the whole rest of the span at every second until the last one, which made the
 * cost grow with the square of the length (8 h took 14 s, a day took two minutes).
 */
const rng = constantRng(0.99);
const inCellar = (): GameState => {
  const r = setActiveDungeon(freshState(), content, 'mossy_cellar');
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const levels = (s: GameState): number[] => Object.values(s.cards.owned).map((o) => o.level);

describe('a long span in one advance() call', () => {
  it('resolves a simulated day within a generous time budget', () => {
    const start = performance.now();
    advance(inCellar(), content, 24 * 3600 * 1000, rng);
    // Linear cost is about a second here; the old quadratic cost was two minutes.
    expect(performance.now() - start).toBeLessThan(10_000);
  }, 60_000);

  it('gives the same levels, XP, kills and knockouts as the same time in one-minute chunks', () => {
    const whole = advance(inCellar(), content, 6 * 3600 * 1000, rng);
    const chunked = advanceChunked(inCellar(), content, 6 * 3600 * 1000, rng, 60_000);
    expect(levels(whole.state)).toEqual(levels(chunked.state));
    expect(whole.report.knockouts).toBe(chunked.report.knockouts);
    expect(whole.report.bossKills).toBe(chunked.report.bossKills);
    for (const [id, owned] of Object.entries(whole.state.cards.owned)) {
      const other = chunked.state.cards.owned[id]!;
      expect(owned.xp.toNumber()).toBeCloseTo(other.xp.toNumber(), 3);
    }
    expect(whole.state.stats.bossKills).toBe(chunked.state.stats.bossKills);
  }, 60_000);
});
