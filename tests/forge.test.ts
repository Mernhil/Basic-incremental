import { describe, expect, it } from 'vitest';
import type { Content } from '../src/data';
import { productionSchema } from '../src/data/schemas';
import rawProduction from '../src/data/content/production.json';
import {
  advance,
  advanceChunked,
  assignForgeWorker,
  assignWorker,
  Decimal,
  deserializeState,
  forgeStatus,
  forgeWorker,
  newOwnedCard,
  resetProduction,
  serializeState,
  setForgeRecipe,
  workersUsed,
  type GameState,
} from '../src/game';
import { bareState, constantRng, content as pinned } from './helpers';

/**
 * The forge (DESIGN.md §4): one worker slot that turns gems into something else by recipes in
 * data; one recipe makes star dust, rarely. Progress per second follows the worker's power.
 */
const rng = constantRng(0.5);
const dust = (s: GameState): number => s.resources['star_dust']!.toNumber();

/** The pinned content with one fast recipe: 10 work, 2 of each gem for 1 star dust, speed 1. */
function fast(work = '10'): Content {
  const recipe = {
    id: 'star_dust',
    name: 'Star Dust',
    inputs: [
      { resource: 'moonwillow_gem', amount: new Decimal(2) },
      { resource: 'grotto_gem', amount: new Decimal(2) },
    ],
    output: { resource: 'star_dust', amount: new Decimal(1) },
    work: new Decimal(work),
  };
  return {
    ...pinned,
    production: { ...pinned.production, forge: { speed: new Decimal(1), recipes: [recipe] } },
  };
}

function forged(c: Content, gems = 1000): GameState {
  const state = bareState();
  state.resources['moonwillow_gem'] = new Decimal(gems);
  state.resources['grotto_gem'] = new Decimal(gems);
  state.resources['star_dust'] = new Decimal(0);
  state.cards.owned['apprentice_feller'] = newOwnedCard();
  const set = setForgeRecipe(state, c, 'star_dust');
  if (!set.ok) throw new Error(set.reason);
  const hired = assignForgeWorker(set.state, c, 'apprentice_feller');
  if (!hired.ok) throw new Error(hired.reason);
  return hired.state;
}

describe('forge data', () => {
  it('has a recipe that makes star dust, validated by the schema', () => {
    const recipes = pinned.production.forge.recipes;
    expect(recipes.some((r) => r.output.resource === 'star_dust')).toBe(true);
    expect(productionSchema.safeParse(rawProduction).success).toBe(true);
    const broken = structuredClone(rawProduction);
    broken.forge.recipes[0]!.work = '0';
    expect(productionSchema.safeParse(broken).success).toBe(false);
  });
});

describe('the worker slot', () => {
  it('uses one of the shared slots', () => {
    const c = pinned;
    let state = bareState();
    state.cards.owned['apprentice_feller'] = newOwnedCard();
    state.cards.owned['cave_digger'] = newOwnedCard();
    const hired = assignForgeWorker(state, c, 'cave_digger');
    if (!hired.ok) throw new Error(hired.reason);
    state = hired.state;
    expect(forgeWorker(state, c)).toBe('cave_digger');
    expect(workersUsed(state, c)).toBe(1);
    // one slot is left (2 in a new game): the tree worker takes it, then no third
    const placed = assignWorker(state, c, 'oak', 'apprentice_feller');
    if (!placed.ok) throw new Error(placed.reason);
    expect(workersUsed(placed.state, c)).toBe(2);
    state = placed.state;
    // the forge worker is the mining card: sent to the mine it moves, it is not a third worker
    const third = assignWorker(state, c, 'copper_quarry', 'cave_digger');
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(forgeWorker(third.state, c)).toBe(null);
      expect(workersUsed(third.state, c)).toBe(2);
    }
  });

  it('refuses a worker when every slot is used, and a fighting card', () => {
    const c = pinned;
    const state = bareState();
    state.cards.owned['apprentice_feller'] = newOwnedCard();
    state.cards.owned['cave_digger'] = newOwnedCard();
    state.production.workers = { oak: ['apprentice_feller'], copper_quarry: ['cave_digger'] };
    const extra = c.cards.find(
      (card) => card.job === 'logging' && card.id !== 'apprentice_feller',
    )!;
    state.cards.owned[extra.id] = newOwnedCard();
    expect(assignForgeWorker(state, c, extra.id)).toEqual({ ok: false, reason: 'no-slot' });
    const fighter = c.cards.find((card) => card.job === 'fighting')!;
    state.cards.owned[fighter.id] = newOwnedCard();
    expect(assignForgeWorker(state, c, fighter.id)).toEqual({ ok: false, reason: 'wrong-job' });
    expect(assignForgeWorker(state, c, 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('a worker that is gone or placed on a tree leaves the forge, never a broken one', () => {
    const state = forged(fast());
    state.cards.owned = {};
    expect(forgeWorker(state, fast())).toBe(null);
  });
});

describe('making things', () => {
  it('crafts whole star dust from gems at a rate that follows the worker’s power', () => {
    const c = fast();
    const state = advance(forged(c), c, 35_000, rng).state;
    // power ~1: 10 work a craft, 35 s of work = 3 crafts (a card level-up may add a little)
    expect(dust(state)).toBeGreaterThanOrEqual(3);
    expect(dust(state)).toBeLessThanOrEqual(4);
    expect(state.resources['moonwillow_gem']!.toNumber()).toBeCloseTo(1000 - 2 * dust(state), 3);
    const strong = forged(c);
    strong.cards.owned['apprentice_feller']!.stars = 3;
    strong.cards.owned['apprentice_feller']!.tier = 'bronze';
    const faster = advance(strong, c, 35_000, rng).state;
    expect(dust(faster)).toBeGreaterThan(dust(state));
  });

  it('does nothing with no worker or no recipe', () => {
    const c = fast();
    const noWorker = forged(c);
    noWorker.production.forge.worker = null;
    expect(dust(advance(noWorker, c, 60_000, rng).state)).toBe(0);
    const noRecipe = forged(c);
    noRecipe.production.forge.recipe = null;
    expect(dust(advance(noRecipe, c, 60_000, rng).state)).toBe(0);
  });

  it('is limited by the gems it has and waits for more', () => {
    const c = fast('1');
    const state = advance(forged(c, 5), c, 60_000, rng).state;
    expect(dust(state)).toBe(2);
    expect(forgeStatus(state, c)!.waitingForGems).toBe(true);
  });

  it('gives the same totals however time is split', () => {
    const c = fast();
    const whole = advance(forged(c), c, 600_000, rng).state;
    const chunked = advanceChunked(forged(c), c, 600_000, rng, 700).state;
    const minute = advanceChunked(forged(c), c, 600_000, rng, 60_000).state;
    expect(dust(chunked)).toBe(dust(whole));
    expect(dust(minute)).toBe(dust(whole));
  });

  it('changing the recipe starts its progress over; an unknown recipe is refused', () => {
    const c = fast();
    const state = advance(forged(c), c, 5_000, rng).state;
    expect(state.production.forge.progress.gt(0)).toBe(true);
    expect(setForgeRecipe(state, c, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    const idle = setForgeRecipe(state, c, null);
    if (!idle.ok) throw new Error(idle.reason);
    expect(idle.state.production.forge.progress.toNumber()).toBe(0);
  });

  it('is kept by an Ascension with its recipe, worker and progress', () => {
    const c = fast();
    const state = advance(forged(c), c, 5_000, rng).state;
    const after = resetProduction(state).production.forge;
    expect(after.recipe).toBe('star_dust');
    expect(after.worker).toBe('apprentice_feller');
    expect(after.progress.eq(state.production.forge.progress)).toBe(true);
  });
});

describe('the forge in a save', () => {
  it('survives a round trip and a recipe that left the game is dropped on load', () => {
    const state = advance(forged(fast()), fast(), 5_000, rng).state;
    const back = deserializeState(serializeState(state), pinned);
    expect(back.production.forge.recipe).toBe(state.production.forge.recipe);
    state.production.forge.recipe = 'gone_recipe';
    const loaded = deserializeState(serializeState(state), pinned);
    expect(loaded.production.forge.recipe).toBe(null);
    expect(loaded.production.forge.progress.toNumber()).toBe(0);
  });

  it('keeps no fighting card as the forge worker', () => {
    const state = forged(fast());
    const fighter = pinned.cards.find((card) => card.job === 'fighting')!;
    state.cards.owned[fighter.id] = newOwnedCard();
    state.production.forge.worker = fighter.id;
    expect(deserializeState(serializeState(state), pinned).production.forge.worker).toBe(null);
  });
});
