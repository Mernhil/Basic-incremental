import { describe, expect, it } from 'vitest';
import { advance, createSeededRng, Decimal, setActiveDungeon, simulateOffline } from '../src/game';
import { content, newGame } from './helpers';

describe('repro: Glimmer Dust never goes down on its own', () => {
  it('while farming the trial with uneven steps', () => {
    let state = newGame();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    state.combat.damageLevels = { copper_edge: 150 };
    state = setActiveDungeon(state, content, 'glimmer_trial').state!;
    const rng = createSeededRng(3);
    let last = new Decimal(0);
    for (let i = 0; i < 3000; i++) {
      const step = [16, 33, 250, 1000, 7, 5000][i % 6]!;
      state = advance(state, content, step, rng).state;
      const now = state.resources['glimmer_dust']!;
      expect(now.gte(last), `step ${i}: ${last.toString()} -> ${now.toString()}`).toBe(true);
      last = now;
      for (const [id, v] of Object.entries(state.resources)) {
        expect(v.gte(0), `${id} negative at step ${i}`).toBe(true);
      }
    }
    const away = simulateOffline(state, content, 0, 3_600_000, rng).state;
    expect(away.resources['glimmer_dust']!.gte(last)).toBe(true);
  });
});
