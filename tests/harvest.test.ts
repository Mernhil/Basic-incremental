import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  Decimal,
  emptyReport,
  jobAttackEffect,
  mainHarvestPattern,
  mergeReports,
  newOwnedCard,
  productionPerSecond,
  productionStageView,
  type GameState,
  type TickReport,
} from '../src/game';
import { loadContent, type Content } from '../src/data';
import { bareState, constantRng, content } from './helpers';

const rng = constantRng(0.5);

/** The logging strikes of a report (the bare mining slot strikes too). */
const logs = (r: TickReport) => r.harvests.filter((h) => h.job === 'logging');

/** A bare game with a logging main card, optional supports and extra oak plots. */
function logging(main: string | null, supports: string[] = [], plots = 1): GameState {
  const state = bareState();
  for (const id of [...(main ? [main] : []), ...supports]) {
    state.cards.owned[id] = newOwnedCard();
  }
  state.cards.loadouts.logging.main = main;
  supports.forEach((id, i) => (state.cards.loadouts.logging.supports[i] = id));
  state.production.logging.expansions = plots - 1;
  state.production.logging.plots = Array.from({ length: plots }, () => 'oak');
  return state;
}

/** The bundled content with a harvest crit rule, to check crits through the whole pipeline. */
function withCrit(chance: number, damage: number): Content {
  const base = loadContent();
  return {
    ...base,
    production: {
      ...base.production,
      harvest: { ...base.production.harvest, crit: { chance, damage: new Decimal(damage) } },
    },
  };
}

describe('harvest patterns come from data', () => {
  it('every logging and mining main card has a pattern, fighting cards have none', () => {
    for (const card of content.cards) {
      expect(card.main.harvest !== undefined, card.id).toBe(card.job !== 'fighting');
    }
  });

  it('the main card decides the pattern; no main uses the job default', () => {
    expect(mainHarvestPattern(logging('elder_treant'), content, 'logging').style).toBe('chop');
    expect(mainHarvestPattern(logging('grove_keeper'), content, 'logging').intervalSeconds).toBe(
      0.5,
    );
    expect(mainHarvestPattern(logging(null), content, 'logging')).toEqual(
      content.production.harvest.default.logging,
    );
  });
});

describe('harvest strikes', () => {
  it('a steady main card strikes once per second at the plot, for exactly its output', () => {
    const state = logging('apprentice_feller');
    const { report } = advance(state, content, 3000, rng);
    expect(logs(report)).toHaveLength(3);
    const first = logs(report)[0]!;
    expect(first).toMatchObject({
      job: 'logging',
      plot: 0,
      producer: 'oak',
      resource: 'oak_gem',
      strikes: 1,
      crits: 0,
      burst: false,
    });
    expect(first.amount.eq(1)).toBe(true);
  });

  it('a fast sweep alternates plots and its strikes add up to the plots output', () => {
    const state = logging('grove_keeper', [], 2);
    const { report } = advance(state, content, 2000, rng);
    // grove_keeper strikes every 0.5 s, one plot at a time: 0, 1, 0, 1
    expect(logs(report).map((h) => h.plot)).toEqual([0, 1, 0, 1]);
    const total = logs(report).reduce((a, h) => a.add(h.amount), new Decimal(0));
    const rate = productionPerSecond(state, content)['oak_gem']!;
    expect(total.eq(rate.mul(2))).toBe(true);
  });

  it('a volley hits every plot on every strike', () => {
    const state = logging('moonwood_dryad', [], 3);
    const { report } = advance(state, content, 1500, rng);
    const pattern = content.cardById.get('moonwood_dryad')!.main.harvest!;
    expect(pattern.targeting).toBe('all');
    expect(logs(report).length).toBe(3 * pattern.strikes);
    expect(new Set(logs(report).map((h) => h.plot))).toEqual(new Set([0, 1, 2]));
  });

  it('splitting time into steps gives the same strikes and targets', () => {
    const state = logging('elder_treant', [], 3);
    const whole = advance(state, content, 20_000, rng).report;
    const split = advanceChunked(state, content, 20_000, rng, 37).report;
    const key = (r: typeof whole) => logs(r).map((h) => `${h.plot}:${h.strikes}`);
    expect(key(split)).toEqual(key(whole));
  });

  it('supports that touch the job are listed on each strike', () => {
    const state = logging('apprentice_feller', ['grove_keeper', 'elder_treant']);
    const { report } = advance(state, content, 1000, rng);
    expect(logs(report)[0]!.supports).toEqual(['grove_keeper', 'elder_treant']);
    const alone = advance(logging('apprentice_feller'), content, 1000, rng).report;
    expect(logs(alone)[0]!.supports).toEqual([]);
  });

  it('a long span merges into one event per plot and keeps the strike count', () => {
    const state = logging('grove_keeper', [], 4);
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
    const state = logging('grove_keeper', [], 2);
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
  it('a burst fires one event per plot carrying the bonus harvest', () => {
    const state = logging('apprentice_feller', [], 2);
    state.bursts.logging.gauge = content.combat.bursts.logging.gaugeSize - 1;
    const { report } = advance(state, content, 1000, rng);
    const bursts = logs(report).filter((h) => h.burst);
    expect(bursts.map((h) => h.plot)).toEqual([0, 1]);
    const rate = productionPerSecond(state, content)['oak_gem']!;
    const seconds = content.combat.bursts.logging.power;
    const sum = bursts.reduce((a, h) => a.add(h.amount), new Decimal(0));
    expect(sum.eq(rate.mul(seconds))).toBe(true);
  });
});

describe('harvest crits', () => {
  it('are off by default, so the output is unchanged', () => {
    expect(content.production.harvest.crit.chance).toBe(0);
  });

  it('multiply the output by the expected value, in events and in the economy', () => {
    const crit = withCrit(1, 3);
    const state = logging('apprentice_feller');
    const plain = advance(state, content, 4000, rng);
    const lucky = advance(state, crit, 4000, rng);
    const gained = (s: GameState) => s.resources['oak_gem']!.sub(state.resources['oak_gem']!);
    expect(gained(lucky.state).div(gained(plain.state)).eq(3)).toBe(true);
    expect(logs(lucky.report).every((h) => h.crits === h.strikes)).toBe(true);
    expect(logs(lucky.report)[0]!.amount.eq(3)).toBe(true);
  });

  it('half chance gives the same total whether the time is split or not', () => {
    const crit = withCrit(0.5, 3);
    const state = logging('apprentice_feller', [], 2);
    const a = advance(state, crit, 60_000, rng).state.resources['oak_gem']!;
    const b = advanceChunked(state, crit, 60_000, rng, 123).state.resources['oak_gem']!;
    expect(a.sub(b).abs().div(a).lt(1e-9)).toBe(true);
  });
});

describe('productionStageView', () => {
  it('shows the main card, supports, gauge, next strike and per-plot rates', () => {
    const state = logging('grove_keeper', ['apprentice_feller'], 2);
    state.stats.playTimeMs = 250;
    state.bursts.logging.gauge = 15;
    const view = productionStageView(state, content, 'logging');
    expect(view.main?.cardId).toBe('grove_keeper');
    expect(view.main?.abilityText).toBe('+10% logging');
    expect(view.supports.map((s) => s?.cardId)).toEqual([
      'apprentice_feller',
      undefined,
      undefined,
    ]);
    expect(view.supports[0]!.abilityText).toBe('+5% logging');
    expect(view.pattern.intervalSeconds).toBe(0.5);
    expect(view.gauge).toBeCloseTo(0.5);
    expect(view.nextStrike.progress).toBeCloseTo(0.5);
    expect(view.nextStrike.inSeconds).toBeCloseTo(0.25);
    expect(view.targets).toHaveLength(2);
    expect(view.targets[0]).toMatchObject({ plot: 0, producer: 'oak', resource: 'oak_gem' });
    expect(view.targets[0]!.ratePerSecond.gt(0)).toBe(true);
    expect(view.targets[0]!.share).toBeCloseTo(0.5);
    // sweep over 2 plots at 0.5 s: each strike carries rate * 0.5 * 2
    expect(view.targets[0]!.perStrike.eq(view.targets[0]!.ratePerSecond)).toBe(true);
  });

  it('works with no main card and empty plots', () => {
    const state = logging(null, [], 2);
    state.production.logging.plots = [null, 'oak'];
    const view = productionStageView(state, content, 'logging');
    expect(view.main).toBeNull();
    expect(view.targets.map((t) => t.producer)).toEqual([null, 'oak']);
    expect(view.targets[0]!.share).toBe(0);
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
