import type { Content, ProductionJob } from '../data';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import {
  isProducerUnlocked,
  mineLevel,
  mineLevelCost,
  treeLevel,
  treeLevelCost,
  type Price,
} from './production';
import { starlightLevel } from './prestige';
import type { AutomationState, GameState } from './state';

/**
 * Autobuyers (DESIGN.md §15, §9 More to buy with Starlight). Two Starlight shop purchases, one for
 * tree levels and one for mine levels, each switched on or off in `state.automation`, with a
 * reserve: a pass never spends below `reservePercent` of what was held of a resource when it
 * began. Card management (stars, tiers, pulls) is never automated.
 *
 * They run on the 1 s play-time grid, where card levels settle (`advance` in tick.ts), so online
 * play, offline progress and any split of time buy the same levels. A pass buys the cheapest
 * affordable level again and again until nothing fits.
 */

type Kind = 'treeLevels' | 'mineLevels';

const GRANT: Record<Kind, 'autobuyer_trees' | 'autobuyer_mines'> = {
  treeLevels: 'autobuyer_trees',
  mineLevels: 'autobuyer_mines',
};
const JOB: Record<Kind, ProductionJob> = { treeLevels: 'logging', mineLevels: 'mining' };

/** Safety valve: levels one pass may buy at most. */
const MAX_BUYS_PER_PASS = 500;

/** Whether the Starlight shop item of this autobuyer is owned. */
export function autobuyerOwned(state: GameState, content: Content, kind: Kind): boolean {
  const item = content.prestige.shop.find((i) => i.grants === GRANT[kind]);
  return !!item && starlightLevel(state, item.id) > 0;
}

/** Whether this autobuyer is owned and switched on. */
export function autobuyerActive(state: GameState, content: Content, kind: Kind): boolean {
  return state.automation[kind] && autobuyerOwned(state, content, kind);
}

/** The new state with some automation settings changed; the reserve is clamped to 0..100. */
export function setAutomation(state: GameState, patch: Partial<AutomationState>): GameState {
  const reserve = patch.reservePercent;
  const clamped =
    reserve === undefined || !Number.isFinite(reserve)
      ? state.automation.reservePercent
      : Math.min(100, Math.max(0, reserve));
  return {
    ...state,
    automation: { ...state.automation, ...patch, reservePercent: clamped },
  };
}

interface Candidate {
  kind: Kind;
  id: string;
  price: Price;
}

function candidates(
  state: GameState,
  content: Content,
  kinds: readonly Kind[],
  modifiers: readonly Modifier[],
): Candidate[] {
  const out: Candidate[] = [];
  for (const kind of kinds) {
    const job = JOB[kind];
    const ids = (kind === 'treeLevels' ? content.trees : content.mines).map((x) => x.id);
    for (const id of ids) {
      if (!isProducerUnlocked(state, content, job, id)) continue;
      const price = (kind === 'treeLevels' ? treeLevelCost : mineLevelCost)(
        state,
        content,
        id,
        modifiers,
      );
      if (price) out.push({ kind, id, price });
    }
  }
  return out;
}

/** Spendable of a resource under the reserve: held − (reserve share of what the pass started with). */
function spendable(state: GameState, floors: Map<string, Decimal>, resource: string): Decimal {
  return (state.resources[resource] ?? new Decimal(0)).sub(floors.get(resource) ?? 0);
}

function activeKinds(state: GameState, content: Content): Kind[] {
  return (['treeLevels', 'mineLevels'] as const).filter((k) => autobuyerActive(state, content, k));
}

/** The affordable cheapest candidate under the floors, or null. */
function nextBuy(
  state: GameState,
  content: Content,
  kinds: readonly Kind[],
  floors: Map<string, Decimal>,
  modifiers: readonly Modifier[],
): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates(state, content, kinds, modifiers)) {
    if (spendable(state, floors, c.price.resource).lt(c.price.amount)) continue;
    if (!best || c.price.amount.lt(best.price.amount)) best = c;
  }
  return best;
}

function floorsOf(
  state: GameState,
  kinds: readonly Kind[],
  content: Content,
  modifiers: readonly Modifier[],
) {
  const floors = new Map<string, Decimal>();
  const share = state.automation.reservePercent / 100;
  for (const c of candidates(state, content, kinds, modifiers)) {
    const held = state.resources[c.price.resource] ?? new Decimal(0);
    floors.set(c.price.resource, held.mul(share));
  }
  return floors;
}

/** Whether a pass would buy something now (for the tick's look-ahead). Changes nothing. */
export function autobuyDue(state: GameState, content: Content): boolean {
  const kinds = activeKinds(state, content);
  if (kinds.length === 0) return false;
  const modifiers = collectModifiers(state, content);
  return (
    nextBuy(state, content, kinds, floorsOf(state, kinds, content, modifiers), modifiers) !== null
  );
}

/**
 * One autobuyer pass, in place (called on the 1 s grid by `advance`): buys levels while the
 * cheapest affordable one fits above the reserve. Returns how many levels it bought.
 */
export function settleAutobuyers(state: GameState, content: Content): number {
  const kinds = activeKinds(state, content);
  if (kinds.length === 0) return 0;
  const modifiers = collectModifiers(state, content);
  const floors = floorsOf(state, kinds, content, modifiers);
  let bought = 0;
  while (bought < MAX_BUYS_PER_PASS) {
    const pick = nextBuy(state, content, kinds, floors, modifiers);
    if (!pick) break;
    state.resources[pick.price.resource] = (
      state.resources[pick.price.resource] ?? new Decimal(0)
    ).sub(pick.price.amount);
    if (pick.kind === 'treeLevels') {
      state.production.treeLevels[pick.id] = treeLevel(state, pick.id) + 1;
    } else {
      state.production.mineLevels[pick.id] = mineLevel(state, pick.id) + 1;
    }
    bought += 1;
  }
  return bought;
}
