import { describe, expect, it } from 'vitest';
import rawTraining from '../src/data/content/training.json';
import { trainingSchema } from '../src/data/schemas';
import {
  ascend,
  burstStats,
  buyTraining,
  collectModifiers,
  Decimal,
  effectiveDamage,
  effectiveDrops,
  loadoutMaxHealth,
  trainingLevel,
  trainingLines,
  trainingModifiers,
  trainingMultiplier,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

/**
 * Training (DESIGN.md §6): the repeatable fighting upgrades of the Dungeons drawer, bought with
 * gems (each line its own kind) like tree and mine levels, with a milestone every 25 levels, reset on Ascension.
 */
const rich = (amount: number | string = '1e30'): GameState => {
  const state = freshState();
  state.resources['money'] = new Decimal(amount);
  for (const line of content.training) state.resources[line.cost.resource] = new Decimal(amount);
  return state;
};
const buy = (state: GameState, id: string, count: number | 'max' = 1): GameState => {
  const result = buyTraining(state, content, id, count);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
};
const sharpen = content.trainingById.get('sharpen')!;

describe('training lines', () => {
  it('are four lines of data: damage, health, Money per kill and the signature gauge', () => {
    expect(content.training.map((t) => [t.id, t.stat])).toEqual([
      ['sharpen', 'combat.damage'],
      ['toughen', 'combat.health'],
      ['plunder', 'drops.moneyMultiplier'],
      ['tempo', 'burst.fill'],
    ]);
    for (const raw of rawTraining) expect(trainingSchema.safeParse(raw).success).toBe(true);
    expect(trainingSchema.safeParse({ ...rawTraining[0], ratePercent: '0' }).success).toBe(false);
  });

  it('adds its percent every level and multiplies the line at every milestone', () => {
    const rate = sharpen.ratePercent.toNumber() / 100;
    const every = sharpen.milestones.every;
    const times = sharpen.milestones.multiplier.toNumber();
    expect(trainingMultiplier(sharpen, 0).toNumber()).toBe(1);
    expect(trainingMultiplier(sharpen, 1).toNumber()).toBeCloseTo(1 + rate);
    expect(trainingMultiplier(sharpen, every - 1).toNumber()).toBeCloseTo(1 + rate * (every - 1));
    expect(trainingMultiplier(sharpen, every).toNumber()).toBeCloseTo((1 + rate * every) * times);
    expect(trainingMultiplier(sharpen, 2 * every).toNumber()).toBeCloseTo(
      (1 + rate * 2 * every) * times * times,
    );
  });

  it('is paid in gems, one kind per line, and no line costs Money', () => {
    expect(content.training.map((t) => [t.id, t.cost.resource])).toEqual([
      ['sharpen', 'copper_gem'],
      ['toughen', 'ironbark_gem'],
      ['plunder', 'iron_gem'],
      ['tempo', 'oak_gem'],
    ]);
    const start = rich(1e9);
    const bought = buy(start, 'sharpen', 3);
    expect(bought.resources['money']!.eq(start.resources['money']!)).toBe(true);
    expect(bought.resources['copper_gem']!.lt(start.resources['copper_gem']!)).toBe(true);
    expect(bought.resources['oak_gem']!.eq(start.resources['oak_gem']!)).toBe(true);
  });

  it('costs on a growing price, the same one level at a time or in bulk', () => {
    const start = rich(1e9);
    const one = buy(buy(buy(start, 'sharpen'), 'sharpen'), 'sharpen');
    const three = buy(start, 'sharpen', 3);
    expect(trainingLevel(one, 'sharpen')).toBe(3);
    expect(three.resources['copper_gem']!.eq(one.resources['copper_gem']!)).toBe(true);
    const spent = start.resources['copper_gem']!.sub(three.resources['copper_gem']!).toNumber();
    const { base, growth } = sharpen.cost;
    const expected = [0, 1, 2].reduce(
      (sum, n) => sum + Math.ceil(base.mul(growth.pow(n)).toNumber()),
      0,
    );
    expect(spent).toBe(expected);
  });

  it('refuses what the gems do not afford, and an unknown line', () => {
    const poor = freshState();
    poor.resources['money'] = new Decimal('1e30');
    poor.resources['copper_gem'] = new Decimal(1);
    expect(buyTraining(poor, content, 'sharpen')).toEqual({ ok: false, reason: 'unaffordable' });
    expect(buyTraining(rich(), content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    // Max buys as many as the Money affords.
    const some = rich(sharpen.cost.base.mul(10).toString());
    const bought = buy(some, 'sharpen', 'max');
    expect(trainingLevel(bought, 'sharpen')).toBeGreaterThan(1);
    expect(bought.resources['copper_gem']!.gte(0)).toBe(true);
  });

  it('raises what it says: damage, health, Money per kill and the gauge fill', () => {
    const start = rich();
    const mods = (s: GameState) => collectModifiers(s, content);
    const levels = 10;
    const by = (id: string) => trainingMultiplier(content.trainingById.get(id)!, levels).toNumber();

    const damage = (s: GameState) => effectiveDamage(s, content, 'mossy_cellar').toNumber();
    expect(damage(buy(start, 'sharpen', levels)) / damage(start)).toBeCloseTo(by('sharpen'), 6);

    const health = (s: GameState) =>
      loadoutMaxHealth(s, content, mods(s), 'mossy_cellar').toNumber();
    expect(health(buy(start, 'toughen', levels)) / health(start)).toBeCloseTo(by('toughen'), 6);

    const cellar = content.dungeonById.get('mossy_cellar')!;
    const purse = (s: GameState) =>
      effectiveDrops(cellar, mods(s), content).currencies[0]!.multiplier ?? 1;
    expect(purse(buy(start, 'plunder', levels)) / purse(start)).toBeCloseTo(by('plunder'), 6);

    const fill = (s: GameState) => burstStats(content, 'fighting', mods(s)).fill;
    expect(fill(buy(start, 'tempo', levels)) / fill(start)).toBeCloseTo(by('tempo'), 6);
    // Only the fighting job: the harvest gauges are untouched.
    expect(burstStats(content, 'logging', mods(buy(start, 'tempo', levels))).fill).toBe(
      burstStats(content, 'logging', mods(start)).fill,
    );
  });

  it('shows each line with its level, effect now and after, the next milestone and the offer', () => {
    const state = buy(rich(), 'sharpen', 3);
    const line = trainingLines(state, content, 10).find((l) => l.line.id === 'sharpen')!;
    expect(line.level).toBe(3);
    expect(line.offer.count).toBe(10);
    expect(line.offer.affordable).toBe(true);
    expect(line.now.eq(trainingMultiplier(sharpen, 3))).toBe(true);
    expect(line.after.eq(trainingMultiplier(sharpen, 13))).toBe(true);
    expect(line.milestone.nextLevel).toBe(sharpen.milestones.every);
    expect(trainingModifiers(state, content)).toHaveLength(1);
    expect(trainingModifiers(freshState(), content)).toEqual([]);
  });

  it('is reset by an Ascension', () => {
    const state = buy(rich(), 'sharpen', 30);
    state.mastery.harvested['oak_gem'] = new Decimal('1e30');
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.combat.training).toEqual({});
    expect(trainingLevel(result.state, 'sharpen')).toBe(0);
  });
});
