import { describe, expect, it } from 'vitest';
import { productionSchema } from '../src/data/schemas';
import rawProduction from '../src/data/content/production.json';
import {
  advance,
  buyTool,
  collectModifiers,
  Decimal,
  harvestCrit,
  newOwnedCard,
  productionPerSecond,
  resetProduction,
  toolEffect,
  toolLevel,
  toolLines,
  workSites,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content } from './helpers';

/**
 * Tool lines (DESIGN.md §4): per production job, four repeatable lines bought with Money like
 * Training: yield, strike speed, crit chance and crit damage. They are the first source of
 * harvest crits and an Ascension resets them.
 */
const rich = (): GameState => {
  const state = bareState();
  state.resources['money'] = new Decimal('1e40');
  return state;
};
const buy = (state: GameState, id: string, count: number | 'max' = 1): GameState => {
  const result = buyTool(state, content, id, count);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
};
const line = (id: string) => content.production.tools.find((t) => t.id === id)!;

describe('tool line data', () => {
  it('has four lines for each job, validated by the schema', () => {
    for (const job of ['logging', 'mining'] as const) {
      expect(
        content.production.tools.filter((t) => t.job === job).map((t) => t.stat),
        job,
      ).toEqual(['production.rate', 'harvest.speed', 'harvest.critChance', 'harvest.critDamage']);
    }
    expect(productionSchema.safeParse(rawProduction).success).toBe(true);
    const broken = structuredClone(rawProduction);
    broken.tools[0]!.ratePercent = '0';
    expect(productionSchema.safeParse(broken).success).toBe(false);
  });
});

describe('buying tool lines', () => {
  it('pays Money and raises the level; unknown and unaffordable buys fail', () => {
    const state = rich();
    state.resources['money'] = new Decimal(1e6);
    const bought = buy(state, 'logging_yield', 3);
    expect(toolLevel(bought, 'logging_yield')).toBe(3);
    expect(bought.resources['money']!.lt(state.resources['money']!)).toBe(true);
    expect(buyTool(state, content, 'nope', 1)).toEqual({ ok: false, reason: 'unknown' });
    const poor = bareState();
    poor.resources['money'] = new Decimal(0);
    expect(buyTool(poor, content, 'logging_yield', 1)).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
  });

  it('buys ×10 and Max like Training', () => {
    expect(toolLevel(buy(rich(), 'mining_speed', 10), 'mining_speed')).toBe(10);
    const state = bareState();
    state.resources['money'] = new Decimal(1e6);
    const maxed = buy(state, 'mining_yield', 'max');
    expect(toolLevel(maxed, 'mining_yield')).toBeGreaterThan(1);
    expect(buyTool(maxed, content, 'mining_yield', 1).ok).toBe(false);
  });

  it('lists the lines of a job with their offers', () => {
    const lines = toolLines(rich(), content, 'logging', 10);
    expect(lines.map((l) => l.line.id)).toEqual([
      'logging_yield',
      'logging_speed',
      'logging_crit_chance',
      'logging_crit_damage',
    ]);
    expect(lines[0]!.offer.count).toBe(10);
    expect(lines[0]!.after.gt(lines[0]!.now)).toBe(true);
  });
});

describe('what the lines do', () => {
  const withWorker = (state: GameState, id = 'apprentice_feller'): GameState => {
    state.cards.owned[id] = newOwnedCard();
    state.production.workers = { oak: [id] };
    return state;
  };

  it('yield multiplies the job’s output, as the effect says', () => {
    const state = withWorker(rich());
    const before = productionPerSecond(state, content)['oak_gem']!;
    const bought = buy(state, 'logging_yield', 4);
    const after = productionPerSecond(bought, content)['oak_gem']!;
    expect(after.div(before).toNumber()).toBeCloseTo(
      toolEffect(line('logging_yield'), 4).toNumber(),
    );
    // The mining job is not touched.
    expect(productionPerSecond(bought, content)['copper_gem']!.toNumber()).toBe(
      productionPerSecond(state, content)['copper_gem']!.toNumber(),
    );
  });

  it('crit chance and crit damage are the first source of harvest crits', () => {
    const state = withWorker(rich());
    const oak = content.treeById.get('oak')!;
    const crit = (s: GameState) =>
      harvestCrit(content, 'logging', collectModifiers(s, content), oak);
    expect(crit(state).chance).toBe(0);
    const chance = buy(state, 'logging_crit_chance', 10);
    expect(crit(chance).chance).toBeCloseTo(toolEffect(line('logging_crit_chance'), 10).toNumber());
    const damage = buy(state, 'logging_crit_damage', 10);
    expect(crit(damage).damage.toNumber()).toBeCloseTo(
      2 + toolEffect(line('logging_crit_damage'), 10).toNumber(),
    );
    // The crit raises the expected output of a worked tree, never one with no worker.
    const both = buy(chance, 'logging_crit_damage', 10);
    const worked = workSites(both, content, 'logging')[0]!;
    expect(worked.crit.chance).toBeGreaterThan(0);
    both.production.workers = {};
    expect(workSites(both, content, 'logging')[0]!.crit.chance).toBe(0);
  });

  it('strike speed makes the strikes come faster', () => {
    const state = withWorker(rich());
    const count = (s: GameState) =>
      advance(s, content, 10_000, constantRng(0.5)).report.harvests.reduce(
        (n, h) => n + (h.job === 'logging' && !h.burst ? h.strikes : 0),
        0,
      );
    const slow = count(state);
    const fast = count(buy(state, 'logging_speed', 20));
    expect(fast).toBeGreaterThan(slow);
  });

  it('are reset by an Ascension', () => {
    const state = buy(rich(), 'logging_yield', 5);
    expect(toolLevel(state, 'logging_yield')).toBe(5);
    expect(toolLevel(resetProduction(state), 'logging_yield')).toBe(0);
  });
});
