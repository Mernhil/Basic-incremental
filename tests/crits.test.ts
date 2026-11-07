import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  critFactor,
  critStats,
  Decimal,
  rollCritForShow,
  rollHitForShow,
  type Modifier,
} from '../src/game';
import { bareState, constantRng, content } from './helpers';

const mod = (stat: Modifier['stat'], kind: Modifier['kind'], value: string): Modifier => ({
  stat,
  kind,
  value: new Decimal(value),
  source: { kind: 'skill', id: 'x' },
});
const rng = constantRng(0.5);

describe('crits (DESIGN.md 11.11)', () => {
  it('starts at 5% chance and x2 damage, from data', () => {
    const crit = critStats(content);
    expect(crit.chance).toBeCloseTo(0.05);
    expect(crit.damage.toNumber()).toBe(2);
  });

  it('reads chance and damage through the modifier pipeline, clamped', () => {
    const up = critStats(content, [
      mod('combat.critChance', 'flat', '0.1'),
      mod('combat.critDamage', 'flat', '1'),
    ]);
    expect(up.chance).toBeCloseTo(0.15);
    expect(up.damage.toNumber()).toBe(3);
    const wild = critStats(content, [
      mod('combat.critChance', 'flat', '5'),
      mod('combat.critDamage', 'set', '0.2'),
    ]);
    expect(wild.chance).toBe(1);
    expect(wild.damage.toNumber()).toBe(1);
    expect(critStats(content, [mod('combat.critChance', 'set', '-1')]).chance).toBe(0);
  });

  it('averages crits into a damage factor: 1 + chance x (damage - 1)', () => {
    expect(critFactor({ chance: 0.05, damage: new Decimal(2) }).toNumber()).toBeCloseTo(1.05);
    expect(critFactor({ chance: 0.5, damage: new Decimal(3) }).toNumber()).toBeCloseTo(2);
    expect(critFactor({ chance: 0, damage: new Decimal(10) }).toNumber()).toBe(1);
  });

  it('deals the expected crit damage in the simulation', () => {
    // 1 damage per second, 10 hits, no signature attack yet: 10 x 1.05.
    const { state } = advance(bareState(), content, 10_000, rng);
    const hp = content.dungeons[0]!.boss.hp;
    expect(state.bossHp!.toNumber()).toBeCloseTo(hp.sub(10.5).toNumber(), 6);
  });

  it('gives the same totals however time is split (online, offline, chunks)', () => {
    const once = advance(bareState(), content, 120_000, rng).state;
    const split = advanceChunked(bareState(), content, 120_000, rng, 1000).state;
    expect(split.bossHp!.toNumber()).toBeCloseTo(once.bossHp!.toNumber(), 6);
  });

  it('rolls a crit for show only, with the injected rng', () => {
    const crit = { chance: 0.05, damage: new Decimal(2) };
    expect(rollCritForShow(crit, constantRng(0.01))).toBe(true);
    expect(rollCritForShow(crit, constantRng(0.05))).toBe(false);
    expect(rollCritForShow(crit, constantRng(0.9))).toBe(false);
    expect(rollCritForShow({ chance: 1, damage: crit.damage }, constantRng(0.999))).toBe(true);
  });

  it('gives the number to show for one hit, crit or not', () => {
    const crit = { chance: 0.05, damage: new Decimal(2) };
    const hit = new Decimal(40);
    const big = rollHitForShow(hit, crit, constantRng(0.01));
    expect(big.crit).toBe(true);
    expect(big.damage.toNumber()).toBe(80);
    const plain = rollHitForShow(hit, crit, constantRng(0.5));
    expect(plain.crit).toBe(false);
    expect(plain.damage.toNumber()).toBe(40);
  });
});
