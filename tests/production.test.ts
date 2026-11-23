import { describe, expect, it } from 'vitest';
import type { ModifierData } from '../src/data';
import {
  advance,
  assignSlotCard,
  campLevelCost,
  campPerSecond,
  canAfford,
  clearDungeon,
  curvePrice,
  effectiveGrowth,
  Decimal,
  isProducerUnlocked,
  newOwnedCard,
  openSlots,
  resetProduction,
  placeSlot,
  slotWorkers,
  unlockedProducers,
  upgradeCamp,
  type CampResult,
  type GameState,
  type Modifier,
} from '../src/game';
import { constantRng, bareState, content, freshState, withFarmers } from './helpers';

const mod = (
  stat: ModifierData['stat'],
  kind: ModifierData['kind'],
  value: string,
  scope?: ModifierData['scope'],
): Modifier => ({
  stat,
  kind,
  value: new Decimal(value),
  ...(scope ? { scope } : {}),
  source: { kind: 'skill', id: 'test' },
});

function give(state: GameState, resource: string, amount: number | string): GameState {
  return { ...state, resources: { ...state.resources, [resource]: new Decimal(amount) } };
}

function ok2(result: CampResult): GameState {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result.state;
}

describe('materials (DESIGN.md section 2 Base camp)', () => {
  it('opens Oak and Copper at the start and the rest as dungeons are cleared', () => {
    const state = freshState();
    expect(unlockedProducers(state, content, 'logging').map((p) => p.id)).toEqual(['oak']);
    expect(unlockedProducers(state, content, 'mining').map((p) => p.id)).toEqual(['copper_quarry']);
    const cleared = clearDungeon(state, content, 'mossy_cellar');
    expect(cleared.unlockedMines).toEqual(['iron_deeps']);
    expect(isProducerUnlocked(cleared.state, content, 'logging', 'ironbark')).toBe(true);
    expect(isProducerUnlocked(cleared.state, content, 'logging', 'moonwillow')).toBe(false);
    expect(clearDungeon(cleared.state, content, 'mossy_cellar').unlockedMines).toEqual([]);
  });

  it('has three woods and three ores', () => {
    expect(content.trees).toHaveLength(3);
    expect(content.mines).toHaveLength(3);
  });
});

describe('farming slots', () => {
  it('a new game has one forest slot and one cave slot open, the starter cards on them', () => {
    const state = freshState();
    expect(openSlots(state, content, 'forest')).toBe(1);
    expect(openSlots(state, content, 'cave')).toBe(1);
    expect(slotWorkers(state, content).map((w) => [w.place, w.card, w.material.id])).toEqual([
      ['forest', 'apprentice_feller', 'oak'],
      ['cave', 'cave_digger', 'copper_quarry'],
    ]);
  });

  it('a slot brings its material times the card’s power, and the stock fills by itself', () => {
    const state = withFarmers(bareState());
    const rates = campPerSecond(state, content);
    expect(rates['oak_gem']!.toNumber()).toBeCloseTo(1);
    expect(rates['copper_gem']!.toNumber()).toBeCloseTo(0.5);
    const after = advance(state, content, 10_000, constantRng(0.5)).state;
    // a card may level up on the way (a little more), so only to the nearest unit
    expect(after.resources['oak_gem']!.toNumber()).toBeCloseTo(10, 0);
    expect(after.resources['copper_gem']!.toNumber()).toBeCloseTo(5, 0);
  });

  it('an empty slot brings nothing', () => {
    expect(campPerSecond(bareState(), content)).toEqual({});
  });

  it('a stronger card brings more: tier, stars and level count', () => {
    const state = withFarmers(bareState());
    const base = campPerSecond(state, content)['oak_gem']!;
    state.cards.owned['apprentice_feller']!.level = 11;
    expect(campPerSecond(state, content)['oak_gem']!.gt(base)).toBe(true);
  });

  it('the camp level lifts every slot a little', () => {
    const state = withFarmers(bareState());
    const level1 = campPerSecond(state, content)['oak_gem']!.toNumber();
    state.camp.level = 6;
    const lift = content.camp.yieldPercentPerLevel.toNumber() / 100;
    expect(campPerSecond(state, content)['oak_gem']!.toNumber()).toBeCloseTo(
      level1 * (1 + lift * 5),
    );
  });

  it('slots open with the camp level and grow with the Starlight item', () => {
    const state = freshState();
    state.camp.level = 3;
    expect(openSlots(state, content, 'forest')).toBe(2);
    expect(openSlots(state, content, 'cave')).toBe(1);
    state.camp.level = 28;
    expect(openSlots(state, content, 'forest')).toBe(6);
    state.prestige.shop['second_hands'] = 2;
    expect(openSlots(state, content, 'forest')).toBe(8);
    expect(openSlots(state, content, 'cave')).toBe(8);
  });

  it('puts a card on an open slot of its own place, and a card is in one slot at a time', () => {
    let state = bareState();
    state.camp.level = 3;
    state.camp.forest[1] = { material: 'oak', card: null };
    state.cards.owned['apprentice_feller'] = newOwnedCard();
    state.cards.owned['grove_keeper'] = newOwnedCard();
    state = ok2(assignSlotCard(state, content, 'forest', 0, 'apprentice_feller'));
    state = ok2(assignSlotCard(state, content, 'forest', 1, 'apprentice_feller'));
    expect(state.camp.forest[0]!.card).toBeNull();
    expect(state.camp.forest[1]!.card).toBe('apprentice_feller');
    // the card it replaces goes back to the collection
    state = ok2(assignSlotCard(state, content, 'forest', 1, 'grove_keeper'));
    expect(slotWorkers(state, content).map((w) => w.card)).toEqual(['grove_keeper']);
    state = ok2(assignSlotCard(state, content, 'forest', 1, null));
    expect(slotWorkers(state, content)).toEqual([]);
  });

  it('refuses a closed slot, the wrong job, a card not owned and a card away', () => {
    const state = bareState();
    state.cards.owned['apprentice_feller'] = newOwnedCard();
    state.cards.owned['cave_digger'] = newOwnedCard();
    expect(assignSlotCard(state, content, 'forest', 3, 'apprentice_feller')).toEqual({
      ok: false,
      reason: 'slot-locked',
    });
    expect(assignSlotCard(state, content, 'forest', 0, 'cave_digger')).toEqual({
      ok: false,
      reason: 'wrong-job',
    });
    expect(assignSlotCard(state, content, 'forest', 0, 'grove_keeper')).toEqual({
      ok: false,
      reason: 'not-owned',
    });
    expect(assignSlotCard(state, content, 'forest', 0, 'nope')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    state.expeditions.trips = [
      { cardId: 'apprentice_feller', placeId: 'mossy_outskirts', hours: 1, elapsedSeconds: 0 },
    ];
    expect(assignSlotCard(state, content, 'forest', 0, 'apprentice_feller')).toEqual({
      ok: false,
      reason: 'on-expedition',
    });
  });

  it('a fighting card cannot farm', () => {
    const state = bareState();
    state.cards.owned['ember_squire'] = newOwnedCard();
    expect(assignSlotCard(state, content, 'forest', 0, 'ember_squire')).toEqual({
      ok: false,
      reason: 'wrong-job',
    });
  });

  it("a slot placed on a node farms that node's material", () => {
    let state = withFarmers(bareState());
    state.camp.level = 3;
    state = clearDungeon(state, content, 'mossy_cellar').state;
    state.cards.owned['grove_keeper'] = newOwnedCard();
    state = ok2(placeSlot(state, content, 'forest', 'ironbark'));
    state = ok2(assignSlotCard(state, content, 'forest', 1, 'grove_keeper'));
    expect(campPerSecond(state, content)['ironbark_gem']!.toNumber()).toBeGreaterThan(0);
    expect(campPerSecond(state, content)['oak_gem']!.toNumber()).toBeGreaterThan(0);
  });

  it('a card is not also in the fighting loadout, at the forge or away: a slot card leaves the forge', () => {
    let state = bareState();
    state.cards.owned['apprentice_feller'] = newOwnedCard();
    state.production.forge.worker = 'apprentice_feller';
    state = ok2(assignSlotCard(state, content, 'forest', 0, 'apprentice_feller'));
    expect(state.production.forge.worker).toBeNull();
    expect(state.cards.loadouts.fighting.slots).not.toContain('apprentice_feller');
  });

  it('one worker only under Single Post', () => {
    const state = withFarmers(bareState());
    state.ascensionChallenges.active = 'single_post';
    expect(slotWorkers(state, content).length).toBeLessThanOrEqual(2);
  });
});

describe('the camp level', () => {
  it('costs woods and ores, grows each level and brings in the next materials as it goes', () => {
    const state = freshState();
    const first = campLevelCost(state, content);
    expect(first.map((p) => p.resource)).toEqual(['oak_gem', 'copper_gem']);
    state.camp.level = 2;
    const second = campLevelCost(state, content);
    expect(second[0]!.amount.gt(first[0]!.amount)).toBe(true);
    state.camp.level = 4;
    expect(campLevelCost(state, content).map((p) => p.resource)).toContain('ironbark_gem');
    state.camp.level = 8;
    expect(campLevelCost(state, content).map((p) => p.resource)).toContain('moonwillow_gem');
  });

  it('raises the level and pays, or refuses when short', () => {
    let state = freshState();
    expect(upgradeCamp(state, content)).toEqual({ ok: false, reason: 'unaffordable' });
    state = give(give(state, 'oak_gem', 5000), 'copper_gem', 5000);
    const prices = campLevelCost(state, content);
    const raised = ok2(upgradeCamp(state, content));
    expect(raised.camp.level).toBe(2);
    expect(raised.resources['oak_gem']!.toNumber()).toBe(5000 - prices[0]!.amount.toNumber());
    expect(state.camp.level).toBe(1); // the input is untouched
  });

  it('applies cost.multiplier to the price', () => {
    const state = freshState();
    const cheaper = campLevelCost(state, content, [mod('cost.multiplier', 'mult', '0.5')]);
    const plain = campLevelCost(state, content, []);
    expect(cheaper[0]!.amount.toNumber()).toBeCloseTo(plain[0]!.amount.toNumber() / 2, -1);
  });

  it('is reachable before the first dungeon clear from what the starter cards farm', () => {
    // a new game farms Oak and Copper with the starter cards: levels 1 to 3 need only those
    let state = freshState();
    for (let level = 1; level < 3; level += 1) {
      const prices = campLevelCost(state, content);
      expect(prices.every((p) => p.resource === 'oak_gem' || p.resource === 'copper_gem')).toBe(
        true,
      );
      state = give(give(state, 'oak_gem', 1e9), 'copper_gem', 1e9);
      state = ok2(upgradeCamp(state, content));
    }
    expect(state.camp.level).toBe(3);
  });
});

describe('canAfford', () => {
  it('checks every price', () => {
    const state = give(give(freshState(), 'oak_gem', 10), 'copper_gem', 5);
    const prices = [
      { resource: 'oak_gem', amount: new Decimal(10) },
      { resource: 'copper_gem', amount: new Decimal(6) },
    ];
    expect(canAfford(state, prices.slice(0, 1))).toBe(true);
    expect(canAfford(state, prices)).toBe(false);
  });
});

describe('prestige reset', () => {
  it('keeps the camp and the cleared dungeons', () => {
    let state = freshState();
    state.camp.level = 7;
    state = clearDungeon(state, content, 'mossy_cellar').state;
    const reset = resetProduction(state);
    expect(reset.camp).toEqual(state.camp);
    expect(reset.clearedDungeons).toEqual(['mossy_cellar']);
    expect(isProducerUnlocked(reset, content, 'mining', 'iron_deeps')).toBe(true);
  });
});

describe('curve prices', () => {
  it('rounds float noise away before rounding up (10 x 2^5 costs 320, not 321)', () => {
    const curve = { resource: 'copper_gem', base: new Decimal(10), growth: new Decimal(2) };
    expect(curvePrice(curve, 3, []).amount.toNumber()).toBe(80);
    expect(curvePrice(curve, 5, []).amount.toNumber()).toBe(320);
    const odd = { ...curve, growth: new Decimal(1.15) };
    expect(curvePrice(odd, 1, []).amount.toNumber()).toBe(12); // 11.5 still rounds up
  });

  const cut = (value: string): Modifier => ({
    stat: 'cost.growth',
    kind: 'percent',
    value: new Decimal(value),
    source: { kind: 'upgrade', id: 'test' },
  });

  it('cuts only the growth above 1: -10% turns ×1.2 into ×1.18', () => {
    const curve = { resource: 'money', base: new Decimal(1000), growth: new Decimal(1.2) };
    expect(effectiveGrowth(curve.growth, [cut('-10')]).toNumber()).toBeCloseTo(1.18, 10);
    expect(curvePrice(curve, 2, [cut('-10')]).amount.toNumber()).toBe(Math.ceil(1000 * 1.18 ** 2));
  });

  it('caps the total cut at half the growth above 1, so prices always keep growing', () => {
    const curve = { resource: 'money', base: new Decimal(1000), growth: new Decimal(1.13) };
    // Wide Skies, Fresh Start, Wide Groves and Deep Roots together: -36%, and far more.
    expect(effectiveGrowth(curve.growth, [cut('-36')]).toNumber()).toBeCloseTo(1.0832, 10);
    expect(effectiveGrowth(curve.growth, [cut('-200')]).toNumber()).toBeCloseTo(1.065, 10);
    const late = curvePrice(curve, 1000, [cut('-200')]).amount;
    expect(late.gt(new Decimal(1000).mul(new Decimal(1.06).pow(1000)))).toBe(true);
  });
});
