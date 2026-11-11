import type { Content, ForgeRecipe } from '../data';
import { Decimal } from './num';
import { cloneState, type GameState } from './state';
import { forgeWorker, workerPower } from './workers';

/**
 * The forge (DESIGN.md §4 The forge): a place with one worker slot that turns gems into something
 * else by recipes in data (`production.json` `forge`); one recipe makes star dust, rarely. The
 * worker's power sets the progress per second; a recipe is made, whole, each time the progress
 * reaches its `work`, and spends its inputs then. A forge with no worker, no recipe or not enough
 * gems makes nothing, and work done while it waits for gems is not banked past one craft.
 *
 * Progress is rate × time and crafts are whole numbers of the total, so any split of time gives the
 * same totals (the gems of a step are counted at its end, like every other settled number).
 * The forge, its recipe, worker and progress are kept through an Ascension.
 */

export const recipeOf = (content: Content, id: string | null): ForgeRecipe | undefined =>
  id === null ? undefined : content.production.forge.recipes.find((r) => r.id === id);

/** The forge's recipe being made, or null (idle, or the saved one left the game). */
export function forgeRecipe(state: GameState, content: Content): ForgeRecipe | null {
  return recipeOf(content, state.production.forge.recipe) ?? null;
}

/** Progress per second: the forge's speed × the worker's power; 0 with no worker. */
export function forgeSpeed(state: GameState, content: Content): Decimal {
  const worker = forgeWorker(state, content);
  const owned = worker ? state.cards.owned[worker] : undefined;
  if (!worker || !owned) return new Decimal(0);
  return content.production.forge.speed.mul(workerPower(content, worker, owned));
}

/** Whole crafts the gems in stock pay for. */
function craftsInStock(state: GameState, recipe: ForgeRecipe): Decimal {
  let most: Decimal | null = null;
  for (const input of recipe.inputs) {
    const have = (state.resources[input.resource] ?? new Decimal(0)).div(input.amount).floor();
    most = most === null ? have : Decimal.min(most, have);
  }
  return Decimal.max(most ?? new Decimal(0), 0);
}

/** The forge as its screen shows it. */
export interface ForgeStatus {
  recipe: ForgeRecipe | null;
  worker: string | null;
  /** Progress per second and the part of a craft done, 0..1. */
  speed: Decimal;
  fraction: number;
  /** Seconds to the next craft at the current speed; null when it is not making anything. */
  secondsToCraft: number | null;
  /** The work is done but the gems are not there. */
  waitingForGems: boolean;
  /** Whole crafts the gems in stock pay for. */
  affordableCrafts: Decimal;
}

export function forgeStatus(state: GameState, content: Content): ForgeStatus | null {
  const recipe = forgeRecipe(state, content);
  const worker = forgeWorker(state, content);
  const speed = forgeSpeed(state, content);
  const progress = state.production.forge.progress;
  const crafts = recipe ? craftsInStock(state, recipe) : new Decimal(0);
  return {
    recipe,
    worker,
    speed,
    fraction: recipe ? Math.min(1, Math.max(0, progress.div(recipe.work).toNumber())) : 0,
    secondsToCraft:
      recipe && speed.gt(0) ? Math.max(0, recipe.work.sub(progress).div(speed).toNumber()) : null,
    waitingForGems: !!recipe && crafts.lt(1) && progress.gte(recipe.work),
    affordableCrafts: crafts,
  };
}

export type ForgeResult = { ok: true; state: GameState } | { ok: false; reason: 'unknown' };

/** Chooses the recipe the forge makes (null = idle). A different recipe starts its progress over. */
export function setForgeRecipe(
  state: GameState,
  content: Content,
  recipeId: string | null,
): ForgeResult {
  if (recipeId !== null && !recipeOf(content, recipeId)) return { ok: false, reason: 'unknown' };
  const next = cloneState(state);
  if (next.production.forge.recipe !== recipeId) next.production.forge.progress = new Decimal(0);
  next.production.forge.recipe = recipeId;
  return { ok: true, state: next };
}

/**
 * Runs the forge for `seconds` (mutates `next`, a fresh clone whose resources already hold what
 * the step produced): adds progress, then makes as many crafts as the progress and the gems allow.
 */
export function advanceForge(next: GameState, content: Content, seconds: number): void {
  const recipe = forgeRecipe(next, content);
  const speed = forgeSpeed(next, content);
  if (!recipe || speed.lte(0) || seconds <= 0) return;
  const forge = next.production.forge;
  let progress = forge.progress.add(speed.mul(seconds));
  // (a hair above the whole number: split steps add seconds in floats)
  const done = progress.div(recipe.work).add(1e-9).floor();
  const crafts = Decimal.min(done, craftsInStock(next, recipe));
  if (crafts.gt(0)) {
    for (const input of recipe.inputs) {
      next.resources[input.resource] = (next.resources[input.resource] ?? new Decimal(0)).sub(
        input.amount.mul(crafts),
      );
    }
    const out = recipe.output.resource;
    next.resources[out] = (next.resources[out] ?? new Decimal(0)).add(
      recipe.output.amount.mul(crafts),
    );
    progress = progress.sub(recipe.work.mul(crafts));
  }
  // Waiting for gems: one craft's work stays ready, the rest is not banked.
  forge.progress = Decimal.max(Decimal.min(progress, recipe.work), 0);
}
