import { describe, expect, it } from 'vitest';
import {
  activeRestrictions,
  advance,
  autoAscendUnlocked,
  ascend,
  challengeExcludedCards,
  challengeProgress,
  challengeViews,
  collectModifiers,
  createSeededRng,
  Decimal,
  initialProgress,
  leaveChallenge,
  newOwnedCard,
  settleAchievements,
  settleChallenges,
  startChallenge,
  statValue,
  workerSlots,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

/** Ascension challenges (DESIGN.md §15, src/game/challenges.ts). */

/** A state that can ascend and has already ascended once. */
function ready(): GameState {
  const s = freshState();
  s.prestigeCount = 1;
  s.mastery.harvested['oak_gem'] = new Decimal(1e14);
  return s;
}

/** The fresh loadout with a main and one support, both owned. */
function withTeam(s: GameState): { main: string; support: string } {
  const l = s.cards.loadouts.fighting;
  const main = l.main!;
  const support = content.cards.find((c) => c.job === 'fighting' && c.id !== main)!.id;
  s.cards.owned[support] ??= newOwnedCard();
  l.supports = [support, null, null];
  return { main, support };
}

/** The tier of a dungeon, created when the state has none yet. */
function tierOf(s: GameState, dungeon: string, difficulty: string) {
  s.combat.floors[dungeon] ??= initialProgress();
  const tiers = s.combat.floors[dungeon]!.tiers;
  return (tiers[difficulty as 'normal'] ??= { floor: 1, best: 0 });
}

const rule = (s: GameState, id: string): GameState => {
  s.ascensionChallenges.active = id;
  return s;
};

describe('the content', () => {
  it('has the six challenges, three targets and rewards each', () => {
    expect(content.challenges.map((c) => c.id)).toEqual([
      'lone_wolf',
      'common_folk',
      'untrained',
      'drought',
      'glass_cannon',
      'single_post',
    ]);
    for (const c of content.challenges) {
      expect(c.targets).toHaveLength(3);
      expect(c.rewards).toHaveLength(3);
    }
  });
});

describe('starting and leaving', () => {
  it('is closed before the first Ascension', () => {
    const s = freshState();
    s.mastery.harvested['oak_gem'] = new Decimal(1e14);
    expect(startChallenge(s, content, 'drought')).toEqual({ ok: false, reason: 'locked' });
  });

  it('is an Ascension: it needs the Starlight and grants it', () => {
    const poor = ready();
    poor.mastery.harvested = {};
    expect(startChallenge(poor, content, 'drought')).toEqual({ ok: false, reason: 'too-early' });
    const r = startChallenge(ready(), content, 'drought');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.prestigeCount).toBe(2);
    expect(r.gained.gt(0)).toBe(true);
    expect(r.state.ascensionChallenges.active).toBe('drought');
  });

  it('starts the target tier on floor 1 and rejects unknown ids and closed dungeons', () => {
    const s = ready();
    tierOf(s, 'mossy_cellar', 'normal').best = 10;
    const r = startChallenge(s, content, 'lone_wolf');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.combat.floors['mossy_cellar']!.tiers['normal']!.floor).toBe(1);
    expect(startChallenge(ready(), content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    const late = ready();
    late.ascensionChallenges.completions['lone_wolf'] = 1; // next target: Ember Crypt
    expect(startChallenge(late, content, 'lone_wolf')).toEqual({
      ok: false,
      reason: 'dungeon-locked',
    });
  });

  it('refuses a challenge done three times', () => {
    const s = ready();
    s.ascensionChallenges.completions['drought'] = 3;
    expect(startChallenge(s, content, 'drought')).toEqual({ ok: false, reason: 'maxed' });
  });

  it('leaving ends the rule and earns nothing; a plain Ascension ends it too', () => {
    const s = rule(ready(), 'drought');
    const left = leaveChallenge(s);
    expect(left.ascensionChallenges.active).toBeNull();
    expect(left.ascensionChallenges.completions).toEqual({});
    expect(s.ascensionChallenges.active).toBe('drought');
    const r = ascend(s, content);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.ascensionChallenges.active).toBeNull();
  });

  it('an Ascension keeps the completions', () => {
    const s = ready();
    s.ascensionChallenges.completions['drought'] = 2;
    const r = ascend(s, content);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.ascensionChallenges.completions).toEqual({ drought: 2 });
  });
});

describe('completing', () => {
  it('counts when the run reaches the target floor, ends the rule and pays the reward', () => {
    const s = rule(ready(), 'drought');
    const target = content.challenges.find((c) => c.id === 'drought')!.targets[0]!;
    expect(settleChallenges(s, content)).toBeNull();
    tierOf(s, target.dungeon, target.difficulty).floor = target.floor;
    expect(challengeProgress(s, content)?.floor).toBe(target.floor);
    expect(settleChallenges(s, content)).toBe('drought');
    expect(s.ascensionChallenges).toEqual({ active: null, completions: { drought: 1 } });
    expect(settleChallenges(s, content)).toBeNull();
    const base = statValue('production.rate', 1, collectModifiers(freshState(), content));
    const now = statValue('production.rate', 1, collectModifiers(s, content));
    expect(now.div(base).toNumber()).toBeCloseTo(1.1);
  });

  it('is found by advance, the same however time is split', () => {
    const make = (): GameState => {
      const s = rule(ready(), 'drought');
      const t = content.challenges[3]!.targets[0]!;
      tierOf(s, t.dungeon, t.difficulty).floor = t.floor;
      return s;
    };
    const once = advance(make(), content, 10_000, createSeededRng(1)).state;
    let split = make();
    for (let i = 0; i < 10; i++) split = advance(split, content, 1000, createSeededRng(1)).state;
    expect(once.ascensionChallenges).toEqual(split.ascensionChallenges);
    expect(once.ascensionChallenges.completions['drought']).toBe(1);
  });

  it('unlocks Challenger and Auto-Ascend', () => {
    const s = freshState();
    delete s.achievements['challenger'];
    expect(settleAchievements(s, content)).not.toContain('challenger');
    s.ascensionChallenges.completions['drought'] = 1;
    expect(settleAchievements(s, content)).toContain('challenger');
    expect(autoAscendUnlocked(s, content)).toBe(false);
    for (const c of content.challenges) s.ascensionChallenges.completions[c.id] = 1;
    expect(autoAscendUnlocked(s, content)).toBe(true);
  });
});

describe('the rules, through modifiers', () => {
  it('Drought halves production and Glass Cannon quarters health', () => {
    const plain = statValue('production.rate', 1, collectModifiers(freshState(), content));
    const dry = statValue(
      'production.rate',
      1,
      collectModifiers(rule(freshState(), 'drought'), content),
    );
    expect(dry.div(plain).toNumber()).toBeCloseTo(0.5);
    const hp = statValue(
      'combat.health',
      100,
      collectModifiers(rule(freshState(), 'glass_cannon'), content),
    );
    expect(hp.toNumber()).toBeCloseTo(25);
  });

  it('Lone Wolf drops the supports, their effect and their health', () => {
    const s = freshState();
    const { support } = withTeam(s);
    const before = collectModifiers(s, content);
    expect(before.some((m) => m.source.kind === 'card' && m.source.id === support)).toBe(true);
    rule(s, 'lone_wolf');
    expect(challengeExcludedCards(s, content)).toEqual([support]);
    const after = collectModifiers(s, content);
    expect(after.some((m) => m.source.kind === 'card' && m.source.id === support)).toBe(false);
    expect(after.some((m) => m.stat === 'combat.health' && m.source.kind === 'challenge')).toBe(
      true,
    );
    expect(s.cards.loadouts.fighting.supports[0]).toBe(support); // the loadout itself is untouched
  });

  it('Common Folk keeps only Commons', () => {
    const s = freshState();
    const { main, support } = withTeam(s);
    rule(s, 'common_folk');
    const commons = (id: string): boolean => content.cardById.get(id)!.rarity === 'common';
    const expected = [main, support].filter((id) => !commons(id));
    expect(challengeExcludedCards(s, content).sort()).toEqual(expected.sort());
    if (!commons(main)) {
      const dmg = collectModifiers(s, content).filter(
        (m) => m.stat === 'combat.damage' && m.source.kind === 'challenge',
      );
      expect(statValue('combat.damage', 100, dmg).toNumber()).toBe(0);
    }
  });

  it('Untrained turns Training off', () => {
    const s = freshState();
    s.combat.training = { sharpen: 10 };
    const dmg = (st: GameState): number =>
      statValue('combat.damage', 100, collectModifiers(st, content), {
        dungeon: 'mossy_cellar',
      }).toNumber();
    const trained = dmg(s);
    expect(trained).toBeGreaterThan(dmg(rule(s, 'untrained')));
  });

  it('Single Post lets one worker work', () => {
    const s = ready();
    s.prestigeCount = 6;
    expect(workerSlots(s, content)).toBeGreaterThan(1);
    expect(workerSlots(rule(s, 'single_post'), content)).toBe(1);
    expect([...activeRestrictions(s, content)]).toEqual(['one_worker']);
  });

  it('a normal run has no restriction', () => {
    expect(activeRestrictions(freshState(), content).size).toBe(0);
  });
});

describe('the views', () => {
  it('say what can be started', () => {
    const views = challengeViews(ready(), content);
    expect(views).toHaveLength(6);
    expect(views.find((v) => v.id === 'drought')).toMatchObject({
      status: 'available',
      completions: 0,
    });
    const act = challengeViews(rule(ready(), 'drought'), content).find((v) => v.id === 'drought')!;
    expect(act.status).toBe('active');
    expect(act.floor).toBe(1);
  });
});
