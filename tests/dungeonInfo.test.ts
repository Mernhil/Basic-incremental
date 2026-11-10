import { describe, expect, it } from 'vitest';
import {
  averageDamage,
  bossMaxHp,
  burstStats,
  clearUnlocks,
  Decimal,
  effectiveDamage,
  secondsPerKill,
} from '../src/game';
import { content, freshState } from './helpers';

describe('dungeon page helpers', () => {
  it('lists what a first clear opens', () => {
    expect(clearUnlocks(content, 'mossy_cellar')).toEqual({
      dungeons: ['ember_crypt'],
      mines: ['iron_deeps'],
    });
    expect(clearUnlocks(content, 'ember_crypt')).toEqual({
      dungeons: ['frostspire_vault', 'glimmer_trial'],
      mines: ['crystal_grotto'],
    });
    expect(clearUnlocks(content, 'frostspire_vault')).toEqual({
      dungeons: ['thunderpeak_aerie'],
      mines: [],
    });
    expect(clearUnlocks(content, 'void_hollow')).toEqual({ dungeons: [], mines: [] });
  });

  it('averages signature attacks into damage', () => {
    const stats = burstStats(content, 'fighting');
    // power 10, one point per hit, 20 points per burst: +50% on average
    expect(averageDamage(new Decimal(100), stats).toNumber()).toBeCloseTo(150);
    expect(averageDamage(new Decimal(100), { ...stats, fill: 0 }).toNumber()).toBe(100);
  });

  it('estimates seconds per kill from full HP', () => {
    const state = freshState();
    const mossy = content.dungeonById.get('mossy_cellar')!;
    const dps = effectiveDamage(state, content, mossy.id);
    // Crits count at their expected value: 5% chance of x2 = 1.05 (DESIGN.md §6).
    const avg = averageDamage(dps, burstStats(content, 'fighting')).mul(1.05);
    const expected = bossMaxHp(mossy, 0).div(avg);
    expect(secondsPerKill(state, content, mossy.id)).toBeCloseTo(expected.toNumber());
    expect(secondsPerKill(state, content, 'nope')).toBeNull();
    expect(
      secondsPerKill(state, content, mossy.id, [
        {
          source: { kind: 'skill', id: 'x' },
          stat: 'combat.damage',
          kind: 'set',
          value: new Decimal(0),
        },
      ]),
    ).toBeNull();
  });
});
