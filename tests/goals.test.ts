import { describe, expect, it } from 'vitest';
import {
  allGoals,
  curveBulkPrice,
  Decimal,
  incomePerSecond,
  newOwnedCard,
  nextGoals,
  secondsPerKill,
  stageReadout,
  type GameState,
  type Goal,
} from '../src/game';
import type { Content } from '../src/data';
import { bareState, content as realContent, plainContent as plain, withDps } from './helpers';

/** The test content deals exactly 100 damage per second to anyone, cards or bare hands. */
const content = withDps(100, plain);

const find = (goals: Goal[], id: string): Goal | undefined => goals.find((g) => g.id === id);

/** A loadout-free game dealing 100 damage a second, so ETAs are exact and there is no knockout wall. */
function fighter(): GameState {
  return bareState();
}

describe('incomePerSecond', () => {
  it('counts production with the average harvest burst', () => {
    // Oak 1/s plus a 10 s harvest every 30 ticks: 1 + 10/30.
    expect(incomePerSecond(bareState(), content, 'oak_gem').toNumber()).toBeCloseTo(4 / 3);
  });

  it('counts the active dungeon drops per kill', () => {
    const state = fighter();
    const spk = secondsPerKill(state, content, 'mossy_cellar')!;
    // Moss Cores: 10% of 1 per kill.
    expect(incomePerSecond(state, content, 'moss_core').toNumber()).toBeCloseTo(0.1 / spk);
    // Summon Crystals: the average of the kill's range.
    const crystals = content.dungeonById
      .get('mossy_cellar')!
      .drops.currencies.find((c) => c.resource === 'summon_crystal')!;
    const average = (crystals.min + crystals.max) / 2;
    expect(incomePerSecond(state, content, 'summon_crystal').toNumber()).toBeCloseTo(average / spk);
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
    state.cards.loadouts.fighting.main = 'ember_squire';
    state.cards.owned['ember_squire'] = newOwnedCard();
    // A tiny health pool against a boss that takes ages to kill.
    const goal = find(allGoals(state, content), 'clear_dungeon:mossy_cellar')!;
    expect(goal.etaSeconds).toBeNull();
  });

  it('has a tree unlock goal from the gems owned and their income', () => {
    const state = bareState();
    state.resources['oak_gem'] = new Decimal(250);
    const goal = find(allGoals(state, content), 'unlock_tree:ironbark')!;
    expect(goal).toMatchObject({ title: 'Unlock Ironbark', page: 'production', progress: 0.5 });
    expect(goal.etaSeconds).toBeCloseTo(250 / (4 / 3));
  });

  it('says 0 s when a goal is affordable now', () => {
    const state = bareState();
    state.resources['oak_gem'] = new Decimal(600);
    expect(find(allGoals(state, content), 'unlock_tree:ironbark')!).toMatchObject({
      progress: 1,
      etaSeconds: 0,
    });
  });

  it('has the next mine milestone with the price of the levels left', () => {
    const state = bareState();
    state.production.mineLevels['copper_quarry'] = 20;
    const goal = find(allGoals(state, realContent), 'mine_milestone:copper_quarry')!;
    expect(goal).toMatchObject({ title: 'Copper Quarry Lv 25 (×2)', page: 'production' });
    expect(goal.progress).toBeCloseTo(0.8);
    const mine = content.mineById.get('copper_quarry')!;
    const price = curveBulkPrice(mine.level.cost, 20, 5).amount.toNumber();
    state.resources['money'] = new Decimal(0);
    const income = incomePerSecond(state, realContent, 'money').toNumber();
    expect(
      allGoals(state, realContent).find((g) => g.id === 'mine_milestone:copper_quarry')!.etaSeconds,
    ).toBeCloseTo(price / income, 3);
  });

  it('has no damage line goal any more (damage comes from cards)', () => {
    const goals = allGoals(bareState(), content);
    expect(goals.some((g) => g.id.startsWith('damage_milestone'))).toBe(false);
    expect(
      realContent.progression.goals.some((r) => (r.kind as string) === 'damage_milestone'),
    ).toBe(false);
  });

  it('shows a gem mastery tier only once it is a quarter of the way', () => {
    const state = bareState();
    state.mastery.harvested['oak_gem'] = new Decimal(100);
    expect(find(allGoals(state, content), 'gem_mastery:oak_gem')).toBeUndefined();
    state.mastery.harvested['oak_gem'] = new Decimal(600);
    const goal = find(allGoals(state, content), 'gem_mastery:oak_gem')!;
    expect(goal).toMatchObject({ title: 'Oak Gem mastery: Bronze', page: 'production' });
    expect(goal.progress).toBeCloseTo(0.6);
    expect(goal.etaSeconds).toBeCloseTo(400 / (4 / 3));
  });

  it('has the next boss medal with kills left times the time per kill', () => {
    const state = fighter();
    state.combat.kills['mossy_cellar'] = 50;
    state.mastery.bossTiers['mossy_cellar'] = 1;
    state.clearedDungeons = ['mossy_cellar'];
    const goal = find(allGoals(state, content), 'boss_mastery:mossy_cellar')!;
    expect(goal).toMatchObject({ title: 'Root Warden medal: Silver', page: 'dungeons' });
    expect(goal.progress).toBeCloseTo(40 / 90);
    expect(goal.etaSeconds).toBeCloseTo(50 * secondsPerKill(state, content, 'mossy_cellar')!);
  });

  it('has a star bar goal once some copies are held, with no ETA', () => {
    const state = fighter();
    // ★4 -> ★5 takes 2 copies of a Common; one is held.
    expect(content.cardRules.starBar.needs.common[3]).toBe(2);
    state.cards.owned['ember_squire'] = { ...newOwnedCard(), stars: 4, starFill: 1 };
    const goal = find(allGoals(state, content), 'star_up:ember_squire')!;
    expect(goal).toMatchObject({
      title: "Fill Ember Squire's star bar for ★5",
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

  it('has a tier-up goal for a card at its level cap, from what Money and materials are missing', () => {
    const state = fighter();
    state.cards.owned['storm_duelist'] = { ...newOwnedCard(), level: 20, stars: 6 };
    const costs = content.cardRules.tierUp.wood.fighting;
    for (const c of costs) state.resources[c.resource] = c.amount.div(2);
    const goal = find(allGoals(state, content), 'tier_up:storm_duelist')!;
    expect(goal).toMatchObject({ title: 'Tier up Storm Duelist to Bronze', page: 'cards' });
    expect(goal.progress).toBeCloseTo(0.5);
  });

  it('has no tier-up goal for a card at its rarity cap (a Common card stops at Wood)', () => {
    const state = fighter();
    state.cards.owned['ember_squire'] = { ...newOwnedCard(), level: 20, stars: 6 };
    expect(find(allGoals(state, content), 'tier_up:ember_squire')).toBeUndefined();
  });

  it('names the Mythic tier for a card that moves up from Prismatic', () => {
    const state = fighter();
    state.cards.owned['moonwood_dryad'] = {
      ...newOwnedCard(),
      tier: 'prismatic',
      level: 100,
      stars: 4,
    };
    expect(find(allGoals(state, content), 'tier_up:moonwood_dryad')).toMatchObject({
      title: 'Tier up Moonwood Dryad to Mythic: needs ★6',
    });
  });

  it('shows the missing stars when the card is at its level cap but short of ★6', () => {
    const state = fighter();
    state.cards.owned['storm_duelist'] = { ...newOwnedCard(), level: 20, stars: 4 };
    const goal = find(allGoals(state, content), 'tier_up:storm_duelist')!;
    expect(goal).toMatchObject({
      title: 'Tier up Storm Duelist to Bronze: needs ★6',
      page: 'cards',
    });
    expect(goal.progress).toBeCloseTo(4 / 6);
    expect(goal.etaSeconds).toBeNull();
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
    const noTrees: Content = {
      ...content,
      progression: {
        ...content.progression,
        goals: content.progression.goals.filter((r) => r.kind !== 'unlock_tree'),
      },
    };
    expect(allGoals(state, noTrees).some((g) => g.kind === 'unlock_tree')).toBe(false);
  });
});

describe('ascension goal', () => {
  const g = realContent.prestige.gain;
  /** Weighted points that give exactly `gain` Starlight before rounding. */
  const pointsFor = (gain: number) => g.divisor.toNumber() * Math.pow(gain, 1 / g.exponent);

  it('shows once the Starlight gain reaches 25% of the minimum, with an ETA', () => {
    const state = bareState();
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

describe('nextGoals', () => {
  it('gives the n nearest goals by estimated time, unknown times last', () => {
    const state = fighter();
    state.resources['oak_gem'] = new Decimal(600);
    const goals = nextGoals(state, content);
    expect(goals).toHaveLength(3);
    expect(goals[0]!.id).toBe('unlock_tree:ironbark');
    const etas = allGoals(state, content).map((g) => g.etaSeconds ?? Infinity);
    expect(etas).toEqual([...etas].sort((a, b) => a - b));
    expect(nextGoals(state, content, 1)).toHaveLength(1);
  });
});
