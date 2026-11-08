import { describe, expect, it } from 'vitest';
import { MIN_OFFLINE_MS, OFFLINE_CAP_MS, simulateOffline } from '../src/game';
import { constantRng, bareState, plainContent as content, freshState, withDps } from './helpers';

const HOUR = 3_600_000;
const rng = constantRng(0.5);

describe('simulateOffline', () => {
  it('simulates the elapsed time and reports gains', () => {
    const { state, summary } = simulateOffline(bareState(), content, 0, HOUR, rng);
    expect(summary).not.toBeNull();
    expect(summary!.capped).toBe(false);
    expect(summary!.simulatedMs).toBe(HOUR);
    // 3600 s of Oak at 1/s, plus 120 harvest bursts (one per 30 ticks) of 10 s each.
    expect(state.resources['oak_gem']!.eq(4800)).toBe(true);
    expect(summary!.gains['oak_gem']!.eq(4800)).toBe(true);
    // 3600 damage plus 180 signature attacks (one per 20 hits) of 10 hits each = 5400 dealt.
    expect(state.bossHp!.eq(content.dungeons[0]!.boss.hp.sub(5400))).toBe(true);
    expect(summary!.bossKills).toBe(0);
  });

  it('caps offline progress at 8 hours', () => {
    const { state, summary } = simulateOffline(bareState(), content, 0, 20 * HOUR, rng);
    expect(OFFLINE_CAP_MS).toBe(8 * HOUR);
    expect(summary!.capped).toBe(true);
    expect(summary!.elapsedMs).toBe(20 * HOUR);
    expect(summary!.simulatedMs).toBe(8 * HOUR);
    expect(state.resources['oak_gem']!.eq(8 * 3600 + 960 * 10)).toBe(true); // + harvest bursts
  });

  it('is not capped at exactly 8 hours', () => {
    const { summary } = simulateOffline(freshState(), content, 0, 8 * HOUR, rng);
    expect(summary!.capped).toBe(false);
  });

  it('reports knockouts, materials and card XP for the welcome-back summary', () => {
    const start = freshState();
    // 5000 dps farms the Mossy Cellar; a constant 0.05 roll lands every 10% Moss Core drop.
    const { summary } = simulateOffline(start, withDps(5000), 0, HOUR, constantRng(0.05));
    expect(summary!.bossKills).toBeGreaterThan(0);
    expect(summary!.materials['moss_core']).toBe(summary!.bossKills);
    const main = start.cards.loadouts.fighting.main!;
    expect(summary!.cardXp[main]!.gt(0)).toBe(true);
    // Cards outside every loadout gain nothing and are left out.
    expect(Object.keys(summary!.cardXp).every((id) => id !== 'shield_warden')).toBe(true);
  });

  it('counts knockouts while away', () => {
    const start = freshState();
    start.activeDungeonId = 'frostspire_vault';
    start.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    const { summary } = simulateOffline(start, content, 0, HOUR, rng);
    expect(summary!.knockouts).toBeGreaterThan(0);
    expect(summary!.materials).toEqual({});
  });

  it('does nothing for very short gaps', () => {
    const start = freshState();
    const result = simulateOffline(start, content, 1000, 1000 + MIN_OFFLINE_MS - 1, rng);
    expect(result.summary).toBeNull();
    expect(result.state).toBe(start);
  });

  it('does nothing when the clock went backwards', () => {
    const start = freshState();
    const result = simulateOffline(start, content, 10 * HOUR, HOUR, rng);
    expect(result.summary).toBeNull();
    expect(result.state).toBe(start);
  });
});
