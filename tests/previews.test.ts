import { describe, expect, it } from 'vitest';
import {
  averageDamage,
  averageDps,
  burstStats,
  buyMineLevels,
  critFactor,
  critStats,
  Decimal,
  effectiveDamage,
  jobProductionPerSecond,
  killsPerMinute,
  previewMineLevel,
  secondsPerKill,
  stageReadout,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

function rich(state: GameState = freshState()): GameState {
  for (const id of Object.keys(state.resources)) state.resources[id] = new Decimal(1e9);
  return state;
}

describe('live stage readouts (DESIGN.md §11)', () => {
  it('averages signature attacks and crits into the DPS', () => {
    const state = freshState();
    const dps = effectiveDamage(state, content);
    const expected = averageDamage(dps, burstStats(content, 'fighting')).mul(
      critFactor(critStats(content, [], state.activeDungeonId)),
    );
    expect(averageDps(state, content).toNumber()).toBeCloseTo(expected.toNumber(), 9);
  });

  it('gives kills per minute as 60 / seconds per kill', () => {
    const state = freshState();
    const spk = secondsPerKill(state, content, state.activeDungeonId!)!;
    expect(killsPerMinute(state, content)).toBeCloseTo(60 / spk, 9);
  });

  it('bundles DPS, kills per minute and time-to-kill for the active dungeon', () => {
    const state = freshState();
    state.bossHp = content.dungeons[0]!.boss.hp.div(2);
    const r = stageReadout(state, content);
    expect(r.dps.eq(effectiveDamage(state, content))).toBe(true);
    expect(r.averageDps.eq(averageDps(state, content))).toBe(true);
    expect(r.secondsPerKill).toBeCloseTo(secondsPerKill(state, content, 'mossy_cellar')!, 9);
    expect(r.killsPerMinute).toBeCloseTo(60 / r.secondsPerKill!, 9);
    // A kill takes whole hits (overflow is off, DESIGN.md §6); the HP left drains at the average.
    expect(r.secondsPerKill).toBe(
      Math.ceil(content.dungeons[0]!.boss.hp.div(r.averageDps).toNumber()),
    );
    expect(r.secondsLeft).toBeCloseTo(state.bossHp.div(r.averageDps).toNumber(), 6);
  });

  it('has no kill readouts while a special dungeon or nothing is fought', () => {
    const trial = freshState();
    trial.activeDungeonId = 'glimmer_trial';
    const r = stageReadout(trial, content);
    expect(r.averageDps.gt(0)).toBe(true);
    expect(r.killsPerMinute).toBeNull();
    expect(r.secondsPerKill).toBeNull();
    expect(r.secondsLeft).toBeNull();
    const idle = freshState();
    idle.activeDungeonId = null;
    expect(stageReadout(idle, content).killsPerMinute).toBeNull();
  });
});

describe('upgrade previews (DESIGN.md §11)', () => {
  it('previews a mine level purchase as its gem per second', () => {
    const state = rich();
    const p = previewMineLevel(state, content, 'copper_quarry', 5)!;
    const bought = buyMineLevels(state, content, 'copper_quarry', 5);
    if (!bought.ok) throw new Error(bought.reason);
    expect(p.resource).toBe('copper_gem');
    expect(p.rateBefore.eq(jobProductionPerSecond(state, content, 'mining')['copper_gem']!)).toBe(
      true,
    );
    expect(
      p.rateAfter.eq(jobProductionPerSecond(bought.state, content, 'mining')['copper_gem']!),
    ).toBe(true);
    const quarry = content.mineById.get('copper_quarry')!;
    expect(p.rateAfter.gt(p.rateBefore)).toBe(true);
    expect(previewMineLevel(state, content, 'nope', 1)).toBeNull();
    expect(p.rateBefore.gt(0)).toBe(true);
    expect(quarry.resource).toBe(p.resource);
  });
});
