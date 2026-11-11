import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  ascend,
  buyStarlightItem,
  collectModifiers,
  createInitialState,
  Decimal,
  mineLevel,
  newOwnedCard,
  setAutomation,
  starlightShop,
  treeLevel,
  workerSlots,
  workersPerPlace,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content, freshState } from './helpers';

const rng = constantRng(0.5);
const STAR = content.prestige.currency;
const places = content.trees.length + content.mines.length;

function withStarlight(state: GameState, amount = 1e6): GameState {
  state.resources[STAR] = new Decimal(amount);
  return state;
}

function buy(state: GameState, id: string): GameState {
  const r = buyStarlightItem(state, content, id);
  if (!r.ok) throw new Error(`${id}: ${r.reason}`);
  return r.state;
}

/** A run whose first slots are all open (every place has its first worker slot). */
function allFirstSlots(): GameState {
  const state = withStarlight(bareState());
  state.prestigeCount = 10;
  return state;
}

describe('second worker slots (Starlight shop)', () => {
  it('are refused until every tree and mine has its first slot', () => {
    const state = withStarlight(bareState());
    const offer = starlightShop(state, content).find(
      (o) => o.item.grants === 'second_worker_slots',
    )!;
    expect(offer.locked).toBe(true);
    expect(buyStarlightItem(state, content, offer.item.id)).toEqual({
      ok: false,
      reason: 'locked',
    });
  });

  it('each level opens a second slot on the next place, twelve workers at most', () => {
    let state = allFirstSlots();
    expect(workerSlots(state, content)).toBe(places);
    const id = content.prestige.shop.find((i) => i.grants === 'second_worker_slots')!.id;
    const order = [...content.trees.map((t) => t.id), ...content.mines.map((m) => m.id)];
    expect(workersPerPlace(state, content, order[0]!)).toBe(1);
    state = buy(state, id);
    expect(workersPerPlace(state, content, order[0]!)).toBe(2);
    expect(workersPerPlace(state, content, order[1]!)).toBe(1);
    expect(workerSlots(state, content)).toBe(places + 1);
    for (let i = 1; i < places; i++) state = buy(state, id);
    expect(workerSlots(state, content)).toBe(places * 2);
    expect(buyStarlightItem(state, content, id)).toEqual({ ok: false, reason: 'maxed' });
  });
});

describe('autobuyers', () => {
  const treeId = content.prestige.shop.find((i) => i.grants === 'autobuyer_trees')!.id;
  const mineId = content.prestige.shop.find((i) => i.grants === 'autobuyer_mines')!.id;

  function rich(): GameState {
    const state = bareState();
    state.resources['money'] = new Decimal(1e6);
    return state;
  }

  it('do nothing until bought, even when switched on', () => {
    const state = rich();
    state.automation = { treeLevels: true, mineLevels: true, reservePercent: 0 };
    const { state: after } = advance(state, content, 1000, rng);
    expect(treeLevel(after, 'oak')).toBe(0);
  });

  it('buy tree levels when owned and on, and only then', () => {
    let state = buy(withStarlight(rich()), treeId);
    expect(advance(state, content, 1000, rng).state.production.treeLevels['oak'] ?? 0).toBe(0);
    state = setAutomation(state, { treeLevels: true });
    const after = advance(state, content, 1000, rng).state;
    expect(treeLevel(after, 'oak')).toBeGreaterThan(0);
    expect(mineLevel(after, 'copper_quarry')).toBe(0);
  });

  it('the mine autobuyer buys mine levels', () => {
    let state = buy(withStarlight(rich()), mineId);
    state.resources['copper_ore'] = new Decimal(1e9);
    state = setAutomation(state, { mineLevels: true });
    const after = advance(state, content, 1000, rng).state;
    expect(mineLevel(after, 'copper_quarry')).toBeGreaterThan(0);
    expect(treeLevel(after, 'oak')).toBe(0);
  });

  it('keep the reserve: never spend below the share of what is held', () => {
    let state = buy(withStarlight(rich()), treeId);
    state = setAutomation(state, { treeLevels: true, reservePercent: 100 });
    const after = advance(state, content, 5000, rng).state;
    expect(treeLevel(after, 'oak')).toBe(0);
    state = setAutomation(state, { reservePercent: 50 });
    const half = advance(state, content, 1000, rng).state;
    expect(half.resources['money']!.gte(state.resources['money']!.mul(0.5))).toBe(true);
    expect(treeLevel(half, 'oak')).toBeGreaterThan(0);
  });

  it('give the same result however the time is split (offline equals online)', () => {
    let state = buy(buy(withStarlight(rich()), treeId), mineId);
    state.resources['copper_ore'] = new Decimal(1e6);
    state = setAutomation(state, { treeLevels: true, mineLevels: true, reservePercent: 20 });
    const whole = advance(state, content, 30_000, rng).state;
    const chunked = advanceChunked(state, content, 30_000, rng, 250).state;
    expect(chunked.production.treeLevels).toEqual(whole.production.treeLevels);
    expect(chunked.production.mineLevels).toEqual(whole.production.mineLevels);
    expect(
      chunked.resources['money']!.sub(whole.resources['money']!)
        .abs()
        .lte(1e-6 * 1e6),
    ).toBe(true);
  });

  it('never touch card management', () => {
    let state = buy(withStarlight(rich()), treeId);
    state.cards.owned['ember_squire'] = newOwnedCard();
    state.resources['money'] = new Decimal(1e12);
    state = setAutomation(state, { treeLevels: true });
    const owned = JSON.stringify(state.cards.owned);
    const after = advance(state, content, 5000, rng).state;
    expect(JSON.stringify(after.cards.owned)).toBe(owned);
  });

  it('keep their switches through an Ascension', () => {
    const state = freshState();
    state.mastery.harvested['oak_gem'] = new Decimal(1e14);
    state.automation = { treeLevels: true, mineLevels: false, reservePercent: 30 };
    const r = ascend(state, content, collectModifiers(state, content));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.automation).toEqual(state.automation);
  });

  it('clamp the reserve to 0..100', () => {
    const state = setAutomation(createInitialState(content), { reservePercent: 250 });
    expect(state.automation.reservePercent).toBe(100);
    expect(setAutomation(state, { reservePercent: -5 }).automation.reservePercent).toBe(0);
  });
});
