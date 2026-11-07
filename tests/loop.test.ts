import { describe, expect, it } from 'vitest';
import { approxEq, GameLoop, MAX_STEP_MS } from '../src/game';
import { constantRng, bareState, content, freshState } from './helpers';

function run(frameMs: number, totalMs: number, start = bareState): GameLoop {
  const loop = new GameLoop(start(), content, constantRng(0.5), 0);
  for (let t = frameMs; t <= totalMs; t += frameMs) loop.step(t);
  loop.step(totalMs);
  return loop;
}

describe('GameLoop', () => {
  it('is independent of frame rate', () => {
    const slow = run(250, 30_000);
    const fast = run(16, 30_000);
    const single = run(30_000, 30_000);
    for (const loop of [slow, fast]) {
      expect(approxEq(loop.state.resources['oak_gem']!, 40)).toBe(true); // 30 s + one 10 s burst
      expect(approxEq(loop.state.bossHp!, single.state.bossHp!)).toBe(true);
      expect(loop.state.stats.playTimeMs).toBe(30_000);
    }
  });

  it('is independent of frame rate while cards level up', () => {
    const single = run(60_000, 60_000, freshState);
    const feller = single.state.cards.owned['apprentice_feller']!;
    expect(feller.level).toBeGreaterThan(3); // the main growth changed the rate along the way
    for (const frameMs of [16, 250, 1000, 7000]) {
      const loop = run(frameMs, 60_000, freshState);
      for (const id of ['oak_gem', 'copper_gem']) {
        expect(approxEq(loop.state.resources[id]!, single.state.resources[id]!)).toBe(true);
      }
      expect(approxEq(loop.state.bossHp!, single.state.bossHp!)).toBe(true);
      for (const [id, card] of Object.entries(single.state.cards.owned)) {
        const other = loop.state.cards.owned[id]!;
        expect(other.level).toBe(card.level);
        expect(approxEq(other.xp, card.xp)).toBe(true);
      }
    }
  });

  it('never runs backwards when the clock jumps back', () => {
    const loop = new GameLoop(bareState(), content, constantRng(0.5), 10_000);
    loop.step(20_000);
    const before = loop.state;
    loop.step(5_000);
    expect(loop.state.resources['oak_gem']!.eq(before.resources['oak_gem']!)).toBe(true);
    // Time resumes from the latest seen clock value, not the earlier one.
    loop.step(21_000);
    expect(loop.state.resources['oak_gem']!.eq(11)).toBe(true);
  });

  it('clamps a huge gap to the maximum step', () => {
    const loop = new GameLoop(freshState(), content, constantRng(0.5), 0);
    loop.step(MAX_STEP_MS * 5);
    expect(loop.state.stats.playTimeMs).toBe(MAX_STEP_MS);
  });
});
