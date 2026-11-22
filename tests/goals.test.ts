import { describe, expect, it } from 'vitest';
import {
  allGoals,
  Decimal,
  fightStage,
  incomePerSecond,
  newOwnedCard,
  nextGoals,
  secondsPerKill,
  stageReadout,
  type GameState,
  type Goal,
} from '../src/game';
import type { Content } from '../src/data';
import {
  bareState,
  content as realContent,
  newGame,
  plainContent as plain,
  withDps,
  withFarmers,
} from './helpers';

/** The test content deals exactly 100 damage per second to anyone, cards or bare hands. */
const content = withDps(100, plain);

const find = (goals: Goal[], id: string): Goal | undefined => goals.find((g) => g.id === id);

/** A loadout-free game dealing 100 damage a second, so ETAs are exact and there is no knockout wall. */
function fighter(): GameState {
  return withFarmers(bareState());
}

describe('incomePerSecond', () => {
  it('counts the camp slots', () => {
    // Oak 1/s from a power-1 card on a forest slot.
    expect(incomePerSecond(withFarmers(bareState()), content, 'oak_gem').toNumber()).toBeCloseTo(1);
    expect(incomePerSecond(bareState(), content, 'oak_gem').toNumber()).toBe(0);
  });

  it('counts the active dungeon drops per kill and its wages per second', () => {
    const state = fighter();
    const spk = secondsPerKill(state, content, 'mossy_cellar')!;
    // Moss Cores: the boss's chance and amount, at the floor's share of the boss's HP.
    const moss = content.dungeonById.get('mossy_cellar')!.drops.material;
    const worth = fightStage(state, content, 'mossy_cellar')!.enemies.reduce(
      (sum, e) => sum + e.dropScale,
      0,
    );
    expect(incomePerSecond(state, content, 'moss_core').toNumber()).toBeCloseTo(
      (moss.chance * moss.amount * worth) / spk,
    );
    // Scrolls come in lumps, never as income (DESIGN.md §3).
    expect(incomePerSecond(state, content, 'summon_scroll').toNumber()).toBe(0);
  });

  it('is 0 for a resource nothing gives', () => {
    expect(incomePerSecond(bareState(), content, 'frost_core').toNumber()).toBe(0);
  });
});

describe('goal rules (DESIGN.md §10)', () => {
  it('counts the Frost Sigils of the Frostspire Vault in the income', () => {
    const state = bareState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    state.activeDungeonId = 'frostspire_vault';
    const strong = withDps(1e9, plain);
    const spk = secondsPerKill(state, strong, 'frostspire_vault')!;
    const frost = content.dungeonById.get('frostspire_vault')!.drops.extraMaterials[0]!;
    expect(incomePerSecond(state, strong, 'frost_sigil').toNumber()).toBeCloseTo(
      (frost.min + frost.max) / 2 / spk,
    );
  });

  it('has a clear-dungeon goal naming what the clear opens, with the time to kill', () => {
    const state = fighter();
    const goal = find(allGoals(state, content), 'clear_dungeon:mossy_cellar')!;
    expect(goal).toMatchObject({
      kind: 'clear_dungeon',
      targetId: 'mossy_cellar',
      title: 'Clear Mossy Cellar → Iron Deeps',
      page: 'dungeons',
      progress: 0,
    });
    expect(goal.etaSeconds).toBeCloseTo(stageReadout(state, content).secondsLeft!);
  });

  it('shows how far the current boss is down', () => {
    const state = fighter();
    state.bossHp = content.dungeons[0]!.boss.hp.mul(0.25);
    const goal = find(allGoals(state, content), 'clear_dungeon:mossy_cellar')!;
    expect(goal.progress).toBeCloseTo(0.75);
  });

  it('has no ETA while the boss knocks the loadout out first', () => {
    const state = fighter();
    state.cards.loadouts.fighting.slots[0] = 'ember_squire';
    state.cards.owned['ember_squire'] = newOwnedCard();
    // A tiny health pool against a boss that takes ages to kill.
    const goal = find(allGoals(state, content), 'clear_dungeon:mossy_cellar')!;
    expect(goal.etaSeconds).toBeNull();
  });

  it('has a camp level goal from the woods and ores held and their income', () => {
    const state = withFarmers(bareState());
    state.resources['oak_gem'] = new Decimal(600);
    state.resources['copper_gem'] = new Decimal(300);
    const goal = find(allGoals(state, content), 'camp_level:camp')!;
    expect(goal).toMatchObject({ title: 'Camp level 2', page: 'production', progress: 0.5 });
    expect(goal.etaSeconds).toBeCloseTo(600);
  });

  it('says 0 s when a goal is affordable now', () => {
    const state = withFarmers(bareState());
    state.resources['oak_gem'] = new Decimal(1200);
    state.resources['copper_gem'] = new Decimal(600);
    expect(find(allGoals(state, content), 'camp_level:camp')!).toMatchObject({
      progress: 1,
      etaSeconds: 0,
    });
  });

  it('has no damage line goal any more (damage comes from cards)', () => {
    const goals = allGoals(bareState(), content);
    expect(goals.some((g) => g.id.startsWith('damage_milestone'))).toBe(false);
    expect(
      realContent.progression.goals.some((r) => (r.kind as string) === 'damage_milestone'),
    ).toBe(false);
  });

  it('shows a gem mastery tier only once it is a quarter of the way', () => {
    const state = withFarmers(bareState());
    state.mastery.harvested['oak_gem'] = new Decimal(100);
    expect(find(allGoals(state, content), 'gem_mastery:oak_gem')).toBeUndefined();
    state.mastery.harvested['oak_gem'] = new Decimal(600);
    const goal = find(allGoals(state, content), 'gem_mastery:oak_gem')!;
    expect(goal).toMatchObject({ title: 'Oak Gem mastery: Bronze', page: 'production' });
    expect(goal.progress).toBeCloseTo(0.6);
    expect(goal.etaSeconds).toBeCloseTo(400);
  });

  it('has the next star of the stage being fought, with kills left times the time per kill', () => {
    const state = fighter();
    state.combat.stageKills['mossy_cellar:normal:1'] = 50;
    state.clearedDungeons = ['mossy_cellar'];
    const goal = find(allGoals(state, content), 'boss_mastery:mossy_cellar:normal:1')!;
    expect(goal).toMatchObject({ title: 'Root Warden star: Silver', page: 'dungeons' });
    expect(goal.progress).toBeCloseTo(40 / 90);
    expect(goal.etaSeconds).toBeCloseTo(50 * secondsPerKill(state, content, 'mossy_cellar')!);
  });

  it('has a star bar goal once some copies are held, with no ETA', () => {
    const state = fighter();
    // ★4 -> ★5 takes one copy; half of it is held.
    state.cards.owned['ember_squire'] = { ...newOwnedCard(), stars: 4, starFill: 0.5 };
    const goal = find(allGoals(state, content), 'star_up:ember_squire')!;
    expect(goal).toMatchObject({
      title: "Fill Wooden Sword's star bar for ★5",
      page: 'cards',
      etaSeconds: null,
    });
    expect(goal.progress).toBeCloseTo(0.5);
  });

  it('has no star bar goal with an empty or a full bar', () => {
    const state = fighter();
    expect(find(allGoals(state, content), 'star_up:ember_squire')).toBeUndefined();
    state.cards.owned['ember_squire'] = { ...newOwnedCard(), starFill: 2 }; // ready: nothing to wait for
    expect(find(allGoals(state, content), 'star_up:ember_squire')).toBeUndefined();
  });

  it('has no tier-up goal: a card stays the tier it is (DESIGN.md §5 No tier-ups)', () => {
    const state = fighter();
    state.cards.owned['storm_duelist'] = { ...newOwnedCard('gold'), level: 80, stars: 6 };
    state.cards.owned['ember_squire'] = { ...newOwnedCard(), level: 20, stars: 6 };
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e9');
    expect(allGoals(state, content).some((g) => g.id.startsWith('tier_up:'))).toBe(false);
  });

  it('has no tier-up goal below the level cap', () => {
    const state = fighter();
    state.cards.owned['storm_duelist'] = { ...newOwnedCard(), level: 19 };
    expect(find(allGoals(state, content), 'tier_up:storm_duelist')).toBeUndefined();
  });

  it('has the Glimmer Trial clear from its best score once it is open', () => {
    const state = fighter();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    state.combat.trialBest['glimmer_trial'] = 0.3;
    expect(find(allGoals(state, content), 'clear_trial:glimmer_trial')).toMatchObject({
      progress: 0.3,
      page: 'dungeons',
    });
  });

  it('only uses the rules in the data', () => {
    const state = bareState();
    state.resources['oak_gem'] = new Decimal(250);
    const noCamp: Content = {
      ...content,
      progression: {
        ...content.progression,
        goals: content.progression.goals.filter((r) => r.kind !== 'camp_level'),
      },
    };
    expect(allGoals(state, noCamp).some((g) => g.kind === 'camp_level')).toBe(false);
  });
});

describe('ascension goal', () => {
  const g = realContent.prestige.gain;
  /** Weighted points that give exactly `gain` Starlight before rounding. */
  const pointsFor = (gain: number) => g.divisor.toNumber() * Math.pow(gain, 1 / g.exponent);

  it('shows once the Starlight gain reaches 25% of the minimum, with an ETA', () => {
    const state = withFarmers(bareState());
    state.mastery.harvested['oak_gem'] = new Decimal(pointsFor(g.minimum * 0.55));
    const goal = find(allGoals(state, realContent), 'ascension:ascension');
    expect(goal).toBeDefined();
    expect(goal!.page).toBe('shop');
    expect(goal!.progress).toBeCloseTo(Math.floor(g.minimum * 0.55) / g.minimum, 9);
    // ETA = missing points / weighted rate (Oak and Copper, both tier 1: weight 1).
    const missing = pointsFor(g.minimum) - pointsFor(g.minimum * 0.55);
    const rate =
      incomePerSecond(state, realContent, 'oak_gem').toNumber() +
      incomePerSecond(state, realContent, 'copper_gem').toNumber();
    expect(goal!.etaSeconds!).toBeCloseTo(missing / rate, 0);
  });

  it('is not offered below 25% of the minimum, and is done at it', () => {
    const low = bareState();
    low.mastery.harvested['oak_gem'] = new Decimal(pointsFor(g.minimum * 0.2));
    expect(find(allGoals(low, realContent), 'ascension:ascension')).toBeUndefined();
    const ready = bareState();
    ready.mastery.harvested['oak_gem'] = new Decimal(pointsFor(g.minimum) * 1.01);
    const goal = find(allGoals(ready, realContent), 'ascension:ascension')!;
    expect(goal.progress).toBe(1);
    expect(goal.etaSeconds).toBe(0);
  });
});

describe('first summon (DESIGN.md §3)', () => {
  it('starts a new game with one pull and puts the first summon first, until a card is pulled', () => {
    const state = newGame();
    const portal = realContent.portals.find((p) => p.kind === 'cards')!;
    expect(state.resources[portal.cost.resource]!.gte(portal.cost.single)).toBe(true);
    expect(nextGoals(state, realContent)[0]).toMatchObject({
      id: 'first_summon:card_portal',
      page: 'summon',
      progress: 1,
      etaSeconds: 0,
    });
    state.portals[portal.id] = { pity: 1, pulls: 1, pityHits: 0 };
    expect(find(allGoals(state, realContent), 'first_summon:card_portal')).toBeUndefined();
  });
});

describe('nextGoals', () => {
  it('gives the n nearest goals by estimated time, unknown times last', () => {
    const state = fighter();
    state.portals['card_portal'] = { pity: 1, pulls: 1, pityHits: 0 }; // past the first summon
    state.resources['oak_gem'] = new Decimal(1200);
    state.resources['copper_gem'] = new Decimal(600);
    const goals = nextGoals(state, content);
    expect(goals).toHaveLength(3);
    expect(goals[0]!.id).toBe('camp_level:camp');
    const etas = allGoals(state, content).map((g) => g.etaSeconds ?? Infinity);
    expect(etas).toEqual([...etas].sort((a, b) => a - b));
    expect(nextGoals(state, content, 1)).toHaveLength(1);
  });
});
