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
      expect(approxEq(loop.state.resources['oak_gem']!, 30)).toBe(true); // 30 s, no worker: no burst
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

  // Simulates a full 8 hours in 1 s steps (card levels settle on whole seconds), so it is heavy:
  // ~2 s locally, several times that on CI runners. Give it room instead of the 5 s default.
  it('clamps a huge gap to the maximum step', { timeout: 20_000 }, () => {
    const loop = new GameLoop(freshState(), content, constantRng(0.5), 0);
    loop.step(MAX_STEP_MS * 5);
    expect(loop.state.stats.playTimeMs).toBe(MAX_STEP_MS);
  });
  it('catches up a long gap (the PC slept) to the same result as second-by-second steps', () => {
    const gapMs = 20 * 60 * 1000;
    const slept = new GameLoop(freshState(), content, constantRng(0.5), 0);
    slept.step(gapMs); // one call: caught up in minute steps
    const awake = run(1000, gapMs, freshState);
    expect(slept.state.stats.playTimeMs).toBe(gapMs);
    expect(slept.state.stats.bossKills).toBe(awake.state.stats.bossKills);
    for (const id of ['oak_gem', 'copper_gem', 'money']) {
      expect(approxEq(slept.state.resources[id]!, awake.state.resources[id]!)).toBe(true);
    }
    for (const [id, card] of Object.entries(awake.state.cards.owned)) {
      expect(slept.state.cards.owned[id]!.level).toBe(card.level);
    }
  });
});

describe('GameLoop game speed (dev builds)', () => {
  it('runs at 1x by default and rejects bad speeds', () => {
    const loop = new GameLoop(bareState(), content, constantRng(0.5), 0);
    expect(loop.speed).toBe(1);
    for (const bad of [0, -3, NaN, Infinity]) {
      loop.setSpeed(bad);
      expect(loop.speed).toBe(1);
    }
  });

  it('5x gives five times the play time and production for the same clock time', () => {
    const slow = new GameLoop(bareState(), content, constantRng(0.5), 0);
    const fast = new GameLoop(bareState(), content, constantRng(0.5), 0);
    fast.setSpeed(5);
    slow.step(10_000);
    fast.step(10_000);
    expect(slow.state.stats.playTimeMs).toBe(10_000);
    expect(fast.state.stats.playTimeMs).toBe(50_000);
    expect(approxEq(fast.state.resources['oak_gem']!, 50)).toBe(true);
  });

  it('a change applies from the next step on; a long sleep is clamped before the speed', () => {
    const loop = new GameLoop(bareState(), content, constantRng(0.5), 0);
    loop.step(10_000);
    loop.setSpeed(2);
    loop.step(20_000);
    expect(loop.state.stats.playTimeMs).toBe(10_000 + 20_000);
    loop.step(20_000 + 100 * MAX_STEP_MS);
    expect(loop.state.stats.playTimeMs).toBe(30_000 + 2 * MAX_STEP_MS);
  });
});
