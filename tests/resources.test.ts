import { describe, expect, it } from 'vitest';
import { advance, createSeededRng, Decimal, setActiveDungeon, simulateOffline } from '../src/game';
import { content, newGame } from './helpers';

/**
 * Regression check for a report from the Wardrobe UI (#59): "Glimmer Dust slowly went down
 * without any upgrade". Only spending (pay) and an ascension may lower a resource; the game tick
 * and offline progress never do, whatever the step sizes.
 */
describe('resources never go down on their own', () => {
  it('while farming the Glimmer Trial with uneven steps, then offline', () => {
    const start = newGame();
    start.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    start.combat.damageLevels = { copper_edge: 150 };
    const active = setActiveDungeon(start, content, 'glimmer_trial');
    if (!active.ok) throw new Error(active.reason);
    let state = active.state;
    const rng = createSeededRng(3);
    let last = { ...state.resources };
    for (let i = 0; i < 3000; i++) {
      const step = [16, 33, 250, 1000, 7, 5000][i % 6]!;
      state = advance(state, content, step, rng).state;
      for (const [id, now] of Object.entries(state.resources)) {
        const before = last[id] ?? new Decimal(0);
        expect(now.gte(before), `${id} at step ${i}: ${before} -> ${now}`).toBe(true);
      }
      last = { ...state.resources };
    }
    expect(state.resources['glimmer_dust']!.gt(0)).toBe(true);
    const away = simulateOffline(state, content, 0, 3_600_000, rng).state;
    for (const [id, now] of Object.entries(away.resources)) {
      expect(now.gte(last[id] ?? 0), id).toBe(true);
    }
  });
});
