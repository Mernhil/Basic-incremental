import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  approxEq,
  bossMaxHp,
  Decimal,
  MAX_KILLS_PER_ADVANCE,
} from '../src/game';
import { constantRng, bareState, plainContent as content, freshState, withDps } from './helpers';

const dungeon = content.dungeons[0]!;
const rng = constantRng(0.5);
const maxHp = bossMaxHp(dungeon, 0);

describe('advance (tick math)', () => {
  it('produces rate * seconds for each unlocked kind, once', () => {
    const { state } = advance(bareState(), content, 10_000, rng);
    expect(state.resources['oak_gem']!.eq(10)).toBe(true);
    expect(state.resources['copper_gem']!.eq(5)).toBe(true); // 0.5/s

    const two = bareState();
    two.production.unlockedTrees = ['ironbark'];
    const result = advance(two, content, 10_000, rng);
    expect(result.state.resources['oak_gem']!.eq(10)).toBe(true);
    expect(result.state.resources['ironbark_gem']!.eq(5)).toBe(true);
  });

  it('applies damage to the boss without killing it', () => {
    const { state, report } = advance(freshState(), content, 10_000, rng);
    // 10 s of the Ember Squire's base damage, no burst yet.
    expect(state.bossHp!.eq(maxHp.sub(content.cardRules.baseDamage.common.mul(10)))).toBe(true);
    expect(report.bossKills).toBe(0);
  });

  it('kills, rolls the drops and respawns the boss at full HP', () => {
    // Exactly enough damage for one kill in one second.
    const { state, report } = advance(freshState(), withDps(maxHp), 1000, rng);
    expect(report.bossKills).toBe(1);
    expect(state.stats.bossKills).toBe(1);
    // rng 0.5 -> min + floor(0.5 * span) of every currency; a Core drops only when 0.5 is under
    // its chance. Money also holds its start amount and the wage of that second.
    for (const c of dungeon.drops.currencies) {
      const rolled = c.min + Math.floor(0.5 * (c.max - c.min + 1));
      const extra =
        c.resource === 'money'
          ? content.resourceById.get('money')!.startAmount!.toNumber() +
            dungeon.drops.wages.find((w) => w.resource === 'money')!.perSecond.toNumber()
          : 0;
      expect(state.resources[c.resource]!.toNumber()).toBeCloseTo(rolled + extra);
    }
    const { chance, amount } = dungeon.drops.material;
    expect(state.resources['moss_core']!.eq(0.5 < chance ? amount : 0)).toBe(true);
    expect(state.bossHp!.eq(maxHp)).toBe(true);
  });

  it('carries overflow damage into the next boss', () => {
    const { state, report } = advance(freshState(), withDps(maxHp.mul(2.5)), 1000, rng);
    expect(report.bossKills).toBe(2);
    expect(approxEq(state.bossHp!, maxHp.div(2))).toBe(true);
  });

  it('ignores zero, negative and non-finite deltas', () => {
    const start = freshState();
    for (const dt of [0, -5, NaN, Infinity]) {
      expect(advance(start, content, dt, rng).state).toBe(start);
    }
  });

  it('does not mutate the previous state', () => {
    const start = freshState();
    advance(start, content, 100_000, rng);
    expect(start.resources['oak_gem']!.eq(0)).toBe(true);
    expect(start.bossHp).toBeNull();
    expect(start.stats.bossKills).toBe(0);
  });

  it('scales boss HP slowly with prestige count', () => {
    expect(bossMaxHp(dungeon, 0).eq(dungeon.boss.hp)).toBe(true);
    const scaled = dungeon.boss.hp.mul(Math.pow(1 + dungeon.boss.hpScalingPerPrestige, 10));
    expect(approxEq(bossMaxHp(dungeon, 10), scaled, 1e-6)).toBe(true);
  });

  it('caps boss kills per call', () => {
    const { report } = advance(freshState(), withDps(new Decimal('1e30')), 1000, rng);
    expect(report.bossKills).toBe(MAX_KILLS_PER_ADVANCE);
  });

  it('gives the same result however the time is split (frame-rate independence)', () => {
    const total = 12_345;
    const whole = advance(freshState(), content, total, rng).state;
    const coarse = advanceChunked(freshState(), content, total, rng, 1000).state;
    const fine = advanceChunked(freshState(), content, total, rng, 16).state;
    for (const other of [coarse, fine]) {
      expect(approxEq(other.resources['oak_gem']!, whole.resources['oak_gem']!)).toBe(true);
      expect(approxEq(other.bossHp!, whole.bossHp!)).toBe(true);
      expect(other.stats.playTimeMs).toBe(total);
    }
  });
});
