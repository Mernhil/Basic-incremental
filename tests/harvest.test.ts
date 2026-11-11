import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  Decimal,
  emptyReport,
  jobAttackEffect,
  mergeReports,
  newOwnedCard,
  productionPerSecond,
  productionStageView,
  workerPattern,
  type GameState,
  type TickReport,
} from '../src/game';
import type { Content } from '../src/data';
import { bareState, constantRng, content } from './helpers';

const rng = constantRng(0.5);

/** The logging strikes of a report. */
const logs = (r: TickReport) => r.harvests.filter((h) => h.job === 'logging');

/** The tree kinds in content order, as the harvest sees them. */
const TREES = ['oak', 'ironbark', 'moonwillow'];

/** A bare game with `worker` (if any) on Oak and `kinds` tree kinds unlocked. */
function logging(worker: string | null, kinds = 1): GameState {
  const state = bareState();
  if (worker) {
    state.cards.owned[worker] = newOwnedCard();
    state.production.workers = { oak: [worker] };
  }
  state.production.unlockedTrees = TREES.slice(1, kinds);
  return state;
}

/** The bundled content with a harvest crit rule, to check crits through the whole pipeline. */
function withCrit(chance: number, damage: number): Content {
  const base = content;
  return {
    ...base,
    production: {
      ...base.production,
      harvest: { ...base.production.harvest, crit: { chance, damage: new Decimal(damage) } },
    },
  };
}

describe('harvest patterns come from data', () => {
  it('every logging and mining card has a worker pattern, fighting cards have none', () => {
    for (const card of content.cards) {
      expect(workerPattern(content, card.id) !== null, card.id).toBe(card.job !== 'fighting');
    }
  });

  it('the worker decides the pattern', () => {
    expect(workerPattern(content, 'elder_treant')!.style).toBe('chop');
    expect(workerPattern(content, 'grove_keeper')!.intervalSeconds).toBe(0.5);
  });
});

describe('harvest strikes', () => {
  it('a steady worker strikes its place once per second, for exactly its output', () => {
    const state = logging('apprentice_feller');
    const { report } = advance(state, content, 3000, rng);
    expect(logs(report)).toHaveLength(3);
    expect(logs(report)[0]).toMatchObject({
      job: 'logging',
      kind: 0,
      producer: 'oak',
      resource: 'oak_gem',
      strikes: 1,
      crits: 0,
      burst: false,
      worker: 'apprentice_feller',
    });
    expect(logs(report)[0]!.amount.eq(1)).toBe(true);
  });

  it('only the worked place is struck', () => {
    const state = logging('grove_keeper', 3);
    const { report } = advance(state, content, 2000, rng);
    expect(logs(report).map((h) => h.producer)).toEqual(['oak', 'oak', 'oak', 'oak']);
  });

  it('a volley lands its strikes per cycle', () => {
    const state = logging('moonwood_dryad', 3);
    const { report } = advance(state, content, 1500, rng);
    const pattern = workerPattern(content, 'moonwood_dryad')!;
    expect(logs(report).length).toBe(pattern.strikes);
  });

  it('splitting time into steps gives the same strikes', () => {
    const state = logging('elder_treant', 3);
    const whole = advance(state, content, 20_000, rng).report;
    const split = advanceChunked(state, content, 20_000, rng, 37).report;
    const key = (r: typeof whole) => logs(r).map((h) => `${h.kind}:${h.strikes}:${h.burst}`);
    expect(key(split)).toEqual(key(whole));
  });

  it('a long span merges into one event and keeps the strike count', () => {
    const state = logging('grove_keeper', 3);
    const { report } = advance(state, content, 3_600_000, rng);
    expect(logs(report).length).toBeLessThanOrEqual(80);
    const strikes = logs(report)
      .filter((h) => !h.burst)
      .reduce((a, h) => a + h.strikes, 0);
    expect(strikes).toBe(7200);
    const total = logs(report)
      .filter((h) => !h.burst)
      .reduce((a, h) => a.add(h.amount), new Decimal(0));
    const rate = productionPerSecond(state, content)['oak_gem']!;
    // rates only grow as cards level, so the hour yields at least the starting rate's output
    expect(total.gte(rate.mul(3600).mul(0.999))).toBe(true);
  });

  it('merging reports keeps the event list bounded', () => {
    const state = logging('grove_keeper', 2);
    const total = emptyReport();
    for (let i = 0; i < 500; i++) {
      mergeReports(total, advance(state, content, 1000, rng).report);
    }
    expect(logs(total).length).toBeLessThanOrEqual(80);
    const strikes = logs(total)
      .filter((h) => !h.burst)
      .reduce((a, h) => a + h.strikes, 0);
    expect(strikes).toBe(1000);
  });
});

describe('harvest bursts', () => {
  it('a full gauge fires one event on its own place carrying the bonus harvest', () => {
    const state = logging('apprentice_feller', 2);
    state.production.harvestGauges.oak = {
      gauge: content.combat.bursts.logging.gaugeSize - 1,
      timer: 0,
    };
    const { report } = advance(state, content, 1000, rng);
    const bursts = logs(report).filter((h) => h.burst);
    expect(bursts.map((h) => h.producer)).toEqual(['oak']);
    const rates = productionPerSecond(state, content);
    const seconds = content.combat.bursts.logging.power;
    expect(bursts[0]!.amount.eq(rates['oak_gem']!.mul(seconds))).toBe(true);
  });
});

describe('harvest crits', () => {
  it('are off by default, so the output is unchanged', () => {
    expect(content.production.harvest.crit.chance).toBe(0);
  });

  it('multiply a worker’s output by the expected value, in events and in the economy', () => {
    const crit = withCrit(1, 3);
    const state = logging('apprentice_feller');
    // at its level cap, so the extra output does not level it faster
    state.cards.owned['apprentice_feller']!.level = content.cardRules.levelCaps.wood;
    const plain = advance(state, content, 4000, rng);
    const lucky = advance(state, crit, 4000, rng);
    const gained = (s: GameState) => s.resources['oak_gem']!.sub(state.resources['oak_gem']!);
    expect(gained(lucky.state).div(gained(plain.state)).eq(3)).toBe(true);
    expect(logs(lucky.report).every((h) => h.crits === h.strikes)).toBe(true);
    expect(logs(lucky.report)[0]!.amount.eq(logs(plain.report)[0]!.amount.mul(3))).toBe(true);
  });

  it('a place with no worker has no crits', () => {
    const crit = withCrit(1, 3);
    const state = logging(null);
    const plain = advance(state, content, 4000, rng).state.resources['oak_gem']!;
    expect(advance(state, crit, 4000, rng).state.resources['oak_gem']!.eq(plain)).toBe(true);
  });

  it('half chance gives the same total whether the time is split or not', () => {
    const crit = withCrit(0.5, 3);
    const state = logging('apprentice_feller', 2);
    const a = advance(state, crit, 60_000, rng).state.resources['oak_gem']!;
    const b = advanceChunked(state, crit, 60_000, rng, 123).state.resources['oak_gem']!;
    expect(a.sub(b).abs().div(a).lt(1e-9)).toBe(true);
  });
});

describe('productionStageView', () => {
  it('shows each place’s worker, gauge, next strike and rate', () => {
    const state = logging('grove_keeper', 2);
    state.stats.playTimeMs = 250;
    state.production.harvestGauges.oak = { gauge: 15, timer: 0 };
    const view = productionStageView(state, content, 'logging');
    const oak = view.targets[0]!;
    expect(oak.worker?.cardId).toBe('grove_keeper');
    expect(oak.worker?.abilityText).toBe('+1 harvest gauge fill per tick here, +10% output');
    expect(oak.pattern?.intervalSeconds).toBe(0.5);
    expect(oak.gauge).toBeCloseTo(0.5);
    expect(oak.nextStrike.progress).toBeCloseTo(0.5);
    expect(oak.nextStrike.inSeconds).toBeCloseTo(0.25);
    expect(view.targets).toHaveLength(2);
    expect(oak).toMatchObject({ kind: 0, producer: 'oak', resource: 'oak_gem' });
    expect(view.targets[1]).toMatchObject({ kind: 1, producer: 'ironbark', worker: null });
    const shares = view.targets.map((t) => t.share);
    expect(shares[0]! + shares[1]!).toBeCloseTo(1);
    // 0.5 s between strikes: each strike carries half a second of output
    expect(oak.perStrike.eq(oak.ratePerSecond.mul(0.5))).toBe(true);
  });

  it('has one target per unlocked kind and none for locked ones', () => {
    const view = productionStageView(logging('grove_keeper'), content, 'logging');
    expect(view.targets.map((t) => t.producer)).toEqual(['oak']);
    expect(view.targets[0]!.share).toBeCloseTo(1);
  });

  it('works with no workers', () => {
    const view = productionStageView(logging(null, 3), content, 'logging');
    expect(view.targets.map((t) => t.producer)).toEqual(TREES);
    expect(view.targets.every((t) => t.worker === null && t.pattern === null)).toBe(true);
  });
});

describe('job attack effects', () => {
  it('the attack cosmetic resolves to the logging and mining variant', () => {
    const state = bareState();
    expect(jobAttackEffect(content, state.cosmetics.loadout, 'logging')).toBe(
      content.starterBySlot.attack.levels[0]!.effects!.logging,
    );
    expect(jobAttackEffect(content, state.cosmetics.loadout, 'mining')).toBe(
      content.starterBySlot.attack.levels[0]!.effects!.mining,
    );
  });
});
