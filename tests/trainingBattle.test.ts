import { describe, expect, it } from 'vitest';
import {
  Decimal,
  newOwnedCard,
  startTraining,
  stepTraining,
  stopTraining,
  stepDamage,
  trainingPanel,
  TRAINING_DUNGEON,
  type GameState,
  type TrainingSettings,
} from '../src/game';
import { constantRng, content, freshState } from './helpers';

/** The Training ground's battle: a real duel against a dummy that never dies and pays nothing. */
function setup(): { s: GameState; team: (string | null)[] } {
  const s = freshState();
  s.cards.owned['dawnblade_regent'] = newOwnedCard();
  const team = ['ember_squire', 'dawnblade_regent', null, null];
  return { s, team };
}
const settings = (team: (string | null)[], damage: number): TrainingSettings => ({
  team,
  damage: new Decimal(damage),
  element: null,
});
const play = (run: ReturnType<typeof startTraining>, seconds: number): void => {
  for (let i = 0; i < seconds * 10 && !run.ended; i += 1) stepTraining(run, 0.1, constantRng(0.5));
};

describe('training battle', () => {
  it('the dummy never dies, and nothing is paid', () => {
    const { s, team } = setup();
    const run = startTraining(s, content, settings(team, 0));
    let kills = 0;
    for (let i = 0; i < 1200; i += 1) {
      const step = stepTraining(run, 0.1, constantRng(0.5));
      kills += (step?.report.bossKills ?? 0) + (step?.report.enemyKills ?? 0);
    }
    expect(kills).toBe(0);
    expect(run.total.gt(0)).toBe(true);
    expect(run.ended).toBeNull();
    expect(run.state.activeDungeonId).toBe(TRAINING_DUNGEON);
    // the real state is untouched, and the throwaway one earned no drops or clears
    expect(s.activeDungeonId).not.toBe(TRAINING_DUNGEON);
    expect(s.cards.loadouts.fighting.slots).not.toEqual(team);
    expect(run.state.clearedDungeons).toEqual(s.clearedDungeons);
    expect(run.state.resources['money']?.toString()).toBe(s.resources['money']?.toString());
  });

  it('the panel adds up: total, overall damage per second and each card’s share', () => {
    const { s, team } = setup();
    const run = startTraining(s, content, settings(team, 0));
    play(run, 60);
    const p = trainingPanel(run);
    expect(p.seconds).toBeCloseTo(60);
    expect(p.overall.mul(p.seconds).div(p.total).toNumber()).toBeCloseTo(1);
    expect(p.cards.map((c) => c.cardId)).toEqual(['ember_squire', 'dawnblade_regent']);
    expect(p.cards.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1);
    expect(p.rolling.gt(0)).toBe(true);
    expect(p.taken.eq(0)).toBe(true);
  });

  it('hits back as hard as set, and the run ends when every card has fallen', () => {
    const { s, team } = setup();
    const damage = stepDamage(s, content, team, 'brutal');
    expect(damage.gt(0)).toBe(true);
    const run = startTraining(s, content, { ...settings(team, 0), damage });
    play(run, 600);
    expect(run.ended).toBe('fallen');
    const p = trainingPanel(run);
    expect(p.taken.gt(0)).toBe(true);
    expect(p.attacks).toBeGreaterThan(0);
    expect(p.fallen.length).toBe(2);
    expect(stepTraining(run, 0.1, constantRng(0.5))).toBeNull();
  });

  it('stop ends it where it stands, and none is no hits back', () => {
    const { s, team } = setup();
    expect(stepDamage(s, content, team, 'none').eq(0)).toBe(true);
    const run = startTraining(s, content, settings(team, 0));
    play(run, 5);
    stopTraining(run);
    expect(run.ended).toBe('stopped');
    expect(trainingPanel(run).total.gt(0)).toBe(true);
  });
});
