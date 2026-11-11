import { describe, expect, it } from 'vitest';
import type { Content } from '../src/data';
import { productionSchema } from '../src/data/schemas';
import rawProduction from '../src/data/content/production.json';
import {
  advance,
  advanceChunked,
  luckyFactor,
  luckyWindow,
  newOwnedCard,
  productionPerSecond,
  productionStageView,
  workSites,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content as pinned } from './helpers';

/**
 * Lucky strikes (DESIGN.md §4): now and then a rich vein or a golden tree appears on a worked
 * place for a short time and its card strikes it for a large payout. The economy uses the
 * expected value, so offline and any split of time give the same totals; the stage only shows it.
 */
const rng = constantRng(0.5);

/** A lucky strike every 100 s lasting 10 s and paying 50 s of the place's output (×1.5). */
function withLucky(everySeconds = 100, windowSeconds = 10, payoutSeconds = 50): Content {
  const config = { name: 'Golden tree', everySeconds, windowSeconds, payoutSeconds };
  return {
    ...pinned,
    production: {
      ...pinned.production,
      lucky: { logging: config, mining: { ...config, name: 'Rich vein' } },
    },
  };
}

const worked = (): GameState => {
  const state = bareState();
  state.cards.owned['apprentice_feller'] = newOwnedCard();
  state.production.workers = { oak: ['apprentice_feller'] };
  return state;
};
const oakGems = (s: GameState): number => s.resources['oak_gem']!.toNumber();

describe('lucky strike data', () => {
  it('has a golden tree and a rich vein, validated by the schema', () => {
    const lucky = pinned.production.lucky;
    expect(lucky.logging.name).toBeTruthy();
    expect(lucky.mining.name).toBeTruthy();
    expect(productionSchema.safeParse(rawProduction).success).toBe(true);
    const broken = structuredClone(rawProduction);
    broken.lucky.logging.windowSeconds = broken.lucky.logging.everySeconds;
    expect(productionSchema.safeParse(broken).success).toBe(false);
  });
});

describe('the expected value', () => {
  it('multiplies a worked place’s output by 1 + payout / interval, and only that place', () => {
    const c = withLucky();
    expect(luckyFactor(c, 'logging').toNumber()).toBeCloseTo(1.5);
    const none = productionPerSecond(worked(), pinned)['oak_gem']!.toNumber();
    const lucky = productionPerSecond(worked(), c)['oak_gem']!.toNumber();
    expect(lucky / none).toBeCloseTo(1.5);
    const idle = bareState();
    expect(productionPerSecond(idle, c)['oak_gem']!.toNumber()).toBeCloseTo(
      productionPerSecond(idle, pinned)['oak_gem']!.toNumber(),
    );
  });

  it('gives the same totals however time is split (offline is the average)', () => {
    const c = withLucky();
    const whole = advance(worked(), c, 300_000, rng).state;
    const chunked = advanceChunked(worked(), c, 300_000, rng, 700).state;
    const offline = advanceChunked(worked(), c, 300_000, rng, 60_000).state;
    expect(oakGems(chunked)).toBeCloseTo(oakGems(whole), 3);
    expect(oakGems(offline)).toBeCloseTo(oakGems(whole), 3);
    const plain = advance(worked(), pinned, 300_000, rng).state;
    expect(oakGems(whole) / oakGems(plain)).toBeGreaterThan(1.45);
  });
});

describe('the show', () => {
  it('a worked place has one window per interval at a fixed time, none with no worker', () => {
    const c = withLucky();
    const state = worked();
    const seen = new Map<number, number>();
    for (let s = 0; s < 1000; s++) {
      const w = luckyWindow(c, state, 'oak', s * 1000);
      if (w) seen.set(Math.floor(s / 100), (seen.get(Math.floor(s / 100)) ?? 0) + 1);
    }
    expect([...seen.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const n of seen.values()) expect(n).toBe(10);
    expect(luckyWindow(c, state, 'oak', 5000)).toEqual(luckyWindow(c, state, 'oak', 5000));
    expect(luckyWindow(c, bareState(), 'oak', 5000)).toBeNull();
    expect(luckyWindow(pinned, state, 'oak', 5000)).toBeNull();
  });

  it('reports a lucky strike event per interval worth the payout, not paid twice', () => {
    const c = withLucky();
    const { report } = advanceChunked(worked(), c, 1_000_000, rng, 5_000);
    const lucky = report.harvests.filter((h) => h.lucky);
    expect(lucky.reduce((n, h) => n + h.strikes, 0)).toBe(10);
    const site = workSites(worked(), c, 'logging')[0]!;
    // each pays 50 s of the place's output (it grows as the card levels up while the run goes on)
    const each = lucky[0]!.amount.div(lucky[0]!.strikes).toNumber();
    expect(each).toBeGreaterThanOrEqual(site.rate.mul(50).toNumber() * 0.99);
    expect(each).toBeLessThan(site.rate.mul(50).toNumber() * 3);
  });

  it('the row view says a lucky strike is on, with the time left', () => {
    const c = withLucky();
    const state = worked();
    // find a moment inside a window
    let t = 0;
    while (!luckyWindow(c, state, 'oak', t)) t += 1000;
    state.stats.playTimeMs = t;
    const target = productionStageView(state, c, 'logging').targets[0]!;
    expect(target.lucky!.name).toBe('Golden tree');
    expect(target.lucky!.secondsLeft).toBeGreaterThan(0);
    expect(target.lucky!.secondsLeft).toBeLessThanOrEqual(10);
  });
});
