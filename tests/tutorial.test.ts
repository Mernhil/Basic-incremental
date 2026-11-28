import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data';
import {
  claimStarter,
  claimTutorialHandout,
  createNewGame,
  initialProgress,
  isDungeonUnlocked,
  isTutorialArea,
  pendingTutorialHandout,
  tutorialPlan,
  type GameState,
} from '../src/game';

const content = loadContent();
const farm = content.tutorialArea!;
const FIRST = farm.tutorial!.milestones[0]!;

function started(starter: string): GameState {
  const r = claimStarter(createNewGame(content), content, starter);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function reach(state: GameState, floor: number): GameState {
  const s = structuredClone(state) as GameState;
  s.combat.floors[farm.id] = initialProgress();
  s.combat.floors[farm.id]!.tiers.normal = { best: floor, floor };
  return s;
}

describe('the tutorial area', () => {
  it('is the first stop of a new game and Mossy Cellar waits behind it', () => {
    const s = createNewGame(content);
    expect(s.activeDungeonId).toBe(farm.id);
    expect(isTutorialArea(farm)).toBe(true);
    expect(isDungeonUnlocked(s, content, 'mossy_cellar')).toBe(false);
    expect(content.dungeons.map((d) => d.id)).not.toContain(farm.id);
  });

  it('a new game owns no Ember Squire and no fighter before the pick', () => {
    const s = createNewGame(content);
    expect(s.cards.owned['ember_squire']).toBeUndefined();
    expect(s.cards.loadouts.fighting.slots.every((x) => x === null)).toBe(true);
  });

  it('plans the three roles the starter does not cover (a tank gets dps, support, healer)', () => {
    expect(tutorialPlan(content, 'hammer')).toEqual(['dps', 'support', 'healer']);
    expect(tutorialPlan(content, 'sword')).toEqual(['support', 'healer', 'tank']);
    expect(tutorialPlan(content, 'staff')).toEqual(['dps', 'support', 'tank']);
  });

  it('hands out nothing before the first milestone or before the starter pick', () => {
    expect(pendingTutorialHandout(reach(createNewGame(content), 10), content)).toBeNull();
    const s = started('geodefall');
    expect(pendingTutorialHandout(reach(s, FIRST - 1), content)).toBeNull();
    expect(pendingTutorialHandout(reach(s, FIRST), content)?.role).toBe('dps');
  });

  it('gives one new Wood card per milestone into the first free slot: a team of four', () => {
    let s = started('geodefall');
    const seen: string[] = [];
    for (const floor of farm.tutorial!.milestones) {
      s = reach(s, floor);
      const r = claimTutorialHandout(s, content);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
      seen.push(r.handout.card!);
      expect(s.cards.owned[r.handout.card!]!.tier).toBe('wood');
      expect(claimTutorialHandout(s, content).ok).toBe(false);
    }
    expect(s.cards.loadouts.fighting.slots.filter(Boolean)).toHaveLength(4);
    expect(s.tutorial.given).toBe(3);
    expect(seen).toEqual(['fieldhand_archer', 'alley_cutpurse', 'hedge_acolyte']);
  });

  it('never hands out a card already owned', () => {
    let s = started('geodefall');
    s.cards.owned['fieldhand_archer'] = structuredClone(s.cards.owned['geodefall']!);
    s = reach(s, FIRST);
    const r = claimTutorialHandout(s, content);
    expect(r.ok && r.handout.card).toBe('militia_picket');
  });

  it('has no Core, rare drop or first-clear purse', () => {
    expect(farm.drops.material.chance).toBe(0);
    expect(farm.drops.rare.chance).toBe(0);
    expect(farm.drops.firstClear).toEqual([]);
  });
});
