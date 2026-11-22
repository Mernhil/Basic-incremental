import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  Decimal,
  DUEL_SPEEDS,
  GameLoop,
  isSpeedUnlocked,
  setActiveDungeon,
  speedLocks,
  startFloorChallenge,
  usableSpeed,
  type GameState,
} from '../src/game';
import type { Content } from '../src/data';
import { devSetFloor } from '../src/game/dev';
import {
  constantRng,
  floorsContent,
  freshState,
  neutralStars,
  withBossAttack,
  withDps,
} from './helpers';

/** The duel speed button (DESIGN.md §2 Fights, Speed button). */
const plain: Content = {
  ...neutralStars(floorsContent),
  combat: { ...neutralStars(floorsContent).combat, crit: { chance: 0, damage: new Decimal(1) } },
};
const harmless = (base: Content): Content => withBossAttack(base, 'mossy_cellar', 1e-9, 10);

const farming = (content: Content, floor: number): GameState => {
  const active = setActiveDungeon(freshState(), content, 'mossy_cellar');
  if (!active.ok) throw new Error(active.reason);
  const placed = devSetFloor(active.state, content, 'mossy_cellar', floor);
  if (!placed.ok) throw new Error(placed.reason);
  return placed.state;
};
const challenging = (content: Content, floor = 1): GameState => {
  const started = startFloorChallenge(farming(content, floor), content);
  if (!started.ok) throw new Error(started.reason);
  return started.state;
};
const rng = () => constantRng(0.5);

describe('which speeds are open', () => {
  it('has x1, x2 and x4 and nothing else', () => {
    expect([...DUEL_SPEEDS]).toEqual([1, 2, 4]);
  });

  it('opens x2 on the first dungeon clear and x4 on the first Ascension', () => {
    const fresh = freshState();
    expect(isSpeedUnlocked(fresh, 1)).toBe(true);
    expect(isSpeedUnlocked(fresh, 2)).toBe(false);
    expect(isSpeedUnlocked(fresh, 4)).toBe(false);
    const cleared = { ...fresh, clearedDungeons: ['mossy_cellar'] };
    expect(isSpeedUnlocked(cleared, 2)).toBe(true);
    expect(isSpeedUnlocked(cleared, 4)).toBe(false);
    const ascended = { ...cleared, prestigeCount: 1 };
    expect(isSpeedUnlocked(ascended, 4)).toBe(true);
    expect(speedLocks(fresh)).toEqual({ 2: 'clear', 4: 'ascend' });
    expect(speedLocks(ascended)).toEqual({});
  });

  it('runs the best open speed at or under the chosen one', () => {
    const fresh = freshState();
    expect(usableSpeed(fresh, 4)).toBe(1);
    expect(usableSpeed({ ...fresh, clearedDungeons: ['a'] }, 4)).toBe(2);
    expect(usableSpeed({ ...fresh, clearedDungeons: ['a'], prestigeCount: 1 }, 4)).toBe(4);
    expect(usableSpeed({ ...fresh, clearedDungeons: ['a'], prestigeCount: 1 }, 2)).toBe(2);
    expect(usableSpeed(fresh, Number.NaN)).toBe(1);
  });
});

describe('a Challenge at speed', () => {
  const content = harmless(withDps(1, plain));

  it('runs its timer, hits and fight four times as fast', () => {
    const start = challenging(content);
    const slow = advance(start, content, 5000, rng(), 1);
    const fast = advance(start, content, 5000, rng(), 4);
    expect(slow.state.combat.challenge!.elapsedSeconds).toBeCloseTo(5, 6);
    expect(fast.state.combat.challenge!.elapsedSeconds).toBeCloseTo(20, 6);
    const hits = (r: typeof slow.report) => r.playerHits.reduce((n, h) => n + h.hits, 0);
    expect(hits(fast.report)).toBeGreaterThanOrEqual(hits(slow.report) * 4 - 2);
    // The play-time clock (saves, production) is still real time.
    expect(fast.state.stats.playTimeMs).toBe(5000);
  });

  it('loses on the timer after about a quarter of the real time', () => {
    const start = challenging(content);
    const lostAt = (speed: number): number => {
      let state = start;
      for (let t = 1; t <= 200; t++) {
        const step = advance(state, content, 1000, rng(), speed);
        state = step.state;
        if (step.report.challenges.length > 0) return t;
      }
      return Infinity;
    };
    expect(lostAt(1)).toBe(31);
    expect(lostAt(4)).toBe(8);
  });

  it('gives the same fight however the time is split', () => {
    const start = challenging(content);
    const one = advance(start, content, 6000, rng(), 4).state;
    const many = advanceChunked(start, content, 6000, rng(), 100, 4).state;
    expect(many.combat.challenge!.elapsedSeconds).toBeCloseTo(
      one.combat.challenge!.elapsedSeconds,
      6,
    );
    expect(many.bossHp?.toNumber()).toBeCloseTo(one.bossHp?.toNumber() ?? 0, 3);
  });

  it('does not speed up the paid fighting XP and wage per real second', () => {
    const start = challenging(content);
    const xp = (state: GameState): number =>
      Object.values(state.cards.owned).reduce((n, c) => n + c.xp.toNumber(), 0);
    const slow = advance(start, content, 10_000, rng(), 1).state;
    const fast = advance(start, content, 10_000, rng(), 4).state;
    expect(xp(fast)).toBeCloseTo(xp(slow), 6);
  });
});

describe('kill drops in a sped-up Challenge', () => {
  it('pay the same per real second as at x1', () => {
    const content = harmless(withDps(1000, plain));
    const start = challenging(content, 3);
    const money = (state: GameState): number => state.resources['silver']?.toNumber() ?? 0;
    const slow = advance(start, content, 2000, rng(), 1);
    const fast = advance(start, content, 2000, rng(), 4);
    expect(slow.report.enemyKills).toBeGreaterThan(0);
    expect(fast.report.enemyKills).toBeGreaterThanOrEqual(slow.report.enemyKills);
    expect(money(fast.state)).toBeLessThanOrEqual(money(slow.state) + 1e-6);
  });
});

describe('farming ignores the speed', () => {
  const content = harmless(withDps(100, plain));

  it('pays exactly the same at x4 as at x1 while no Challenge runs', () => {
    const start = farming(content, 3);
    const one = advance(start, content, 120_000, rng(), 1);
    const four = advance(start, content, 120_000, rng(), 4);
    expect(four.report.floorsCleared).toBe(one.report.floorsCleared);
    expect(four.state.resources).toEqual(one.state.resources);
    expect(four.state.stats.playTimeMs).toBe(one.state.stats.playTimeMs);
  });

  it('goes back to the real pace when the Challenge ends inside a step', () => {
    const start = challenging(content, 3);
    // a won Challenge, then plain farming: over a long span x4 must not out-earn x1 by much
    const one = advance(start, content, 60_000, rng(), 1);
    const four = advance(start, content, 60_000, rng(), 4);
    expect(four.report.challenges[0]?.won).toBe(true);
    expect(four.report.floorsCleared).toBeLessThanOrEqual(one.report.floorsCleared + 1);
  });
});

describe('the game loop', () => {
  const content = harmless(withDps(1, plain));

  it('runs the Challenge faster at the chosen speed, never above what is open', () => {
    const open = { ...challenging(content), clearedDungeons: ['x'], prestigeCount: 1 };
    const loop = new GameLoop(open, content, constantRng(0.5), 0);
    loop.setDuelSpeed(4);
    loop.step(2000);
    expect(loop.state.combat.challenge!.elapsedSeconds).toBeCloseTo(8, 6);
    const shut = new GameLoop(challenging(content), content, constantRng(0.5), 0);
    shut.setDuelSpeed(4);
    shut.step(2000);
    expect(shut.state.combat.challenge!.elapsedSeconds).toBeCloseTo(2, 6);
  });

  it('never speeds up a long gap (offline-like catch-up)', () => {
    const open = { ...challenging(content), clearedDungeons: ['x'], prestigeCount: 1 };
    const loop = new GameLoop(open, content, constantRng(0.5), 0);
    loop.setDuelSpeed(4);
    loop.step(6000); // over the 5 s frame gap: caught up at the real pace
    expect(loop.state.combat.challenge!.elapsedSeconds).toBeCloseTo(6, 6);
  });
});

describe('the remembered setting', () => {
  it('is kept in the display preferences, and only x1, x2 and x4 are read back', async () => {
    const { DEFAULT_PREFS, parsePrefs } = await import('../src/renderer/src/settings/prefs');
    expect(DEFAULT_PREFS.duelSpeed).toBe(1);
    expect(parsePrefs('{"duelSpeed":4}').duelSpeed).toBe(4);
    expect(parsePrefs('{"duelSpeed":2}').duelSpeed).toBe(2);
    expect(parsePrefs('{"duelSpeed":3}').duelSpeed).toBe(1);
    expect(parsePrefs('{"duelSpeed":"fast"}').duelSpeed).toBe(1);
    expect(parsePrefs(parsePrefsText(4)).duelSpeed).toBe(4);
  });
});

function parsePrefsText(speed: number): string {
  return JSON.stringify({ motion: 'system', autosaveSeconds: 30, duelSpeed: speed });
}
