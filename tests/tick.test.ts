import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  approxEq,
  bossMaxHp,
  Decimal,
  MAX_KILLS_PER_ADVANCE,
} from '../src/game';
import { constantRng, bareState, content, freshState } from './helpers';

const dungeon = content.dungeons[0]!;
const rng = constantRng(0.5);
const maxHp = bossMaxHp(dungeon, 0);

/** A fresh state dealing `dps` damage per second (through Copper Edge levels). */
function withDps(dps: Decimal) {
  const state = freshState();
  const perLevel = content.combat.damageUpgrades[0]!.damagePerLevel;
  const levels = dps.sub(content.combat.startingDamage).div(perLevel).toNumber();
  state.combat.damageLevels = { [content.combat.damageUpgrades[0]!.id]: levels };
  return state;
}

describe('advance (tick math)', () => {
  it('produces rate * plots * seconds', () => {
    const { state } = advance(bareState(), content, 10_000, rng);
    expect(state.resources['oak_gem']!.eq(10)).toBe(true);
    expect(state.resources['copper_gem']!.eq(5)).toBe(true); // 1 slot * 0.5/s

    const triple = bareState();
    triple.production.logging = { expansions: 2, plots: ['oak', 'oak', 'oak'] };
    const result = advance(triple, content, 10_000, rng);
    expect(result.state.resources['oak_gem']!.eq(30)).toBe(true);
  });

  it('applies damage to the boss without killing it', () => {
    const { state, report } = advance(freshState(), content, 10_000, rng);
    expect(state.bossHp!.eq(maxHp.sub(10))).toBe(true); // 1 dps, no burst yet
    expect(report.bossKills).toBe(0);
  });

  it('kills, rolls the drops and respawns the boss at full HP', () => {
    // Exactly enough damage for one kill in one second.
    const { state, report } = advance(withDps(maxHp), content, 1000, rng);
    expect(report.bossKills).toBe(1);
    expect(state.stats.bossKills).toBe(1);
    // rng 0.5 -> min + floor(0.5 * span) sigils; 0.5 >= the 10% Core chance -> no Core.
    const { min, max } = dungeon.drops.portalResource;
    expect(state.resources['moss_sigil']!.eq(min + Math.floor(0.5 * (max - min + 1)))).toBe(true);
    expect(state.resources['moss_core']!.eq(0)).toBe(true);
    expect(state.bossHp!.eq(maxHp)).toBe(true);
  });

  it('carries overflow damage into the next boss', () => {
    const { state, report } = advance(withDps(maxHp.mul(2.5)), content, 1000, rng);
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
    const { report } = advance(withDps(new Decimal('1e30')), content, 1000, rng);
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
