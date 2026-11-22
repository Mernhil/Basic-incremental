import type { Content } from '../data';
import { setActiveDungeon, type CombatFailure } from './combat';
import { loadoutCards, loadoutCostCap, loadoutCost, loadoutProblem } from './cards';
import { cloneState, isOnTrip, LOADOUT_SLOTS, type CardLoadout, type GameState } from './state';

/**
 * Loadout presets (DESIGN.md §15 Loadout presets).
 *
 * Dungeons: each dungeon (or Glimmer Trial) remembers the fighting loadout it was left with and
 * `pickDungeon` switches to it. Picking a dungeon with nothing remembered keeps the current
 * loadout. A remembered card that is gone or away on an expedition leaves its slot empty; a
 * loadout over the cost cap is flagged and not applied (and not deleted).
 *
 * All functions are pure and need no time, so tick size does not matter.
 */

export type DungeonPresetOutcome = 'none' | 'applied' | 'over-cost-cap';

export type PickDungeonResult =
  | { ok: true; state: GameState; preset: DungeonPresetOutcome }
  | { ok: false; reason: CombatFailure };

const copyLoadout = (l: CardLoadout): CardLoadout => ({ slots: [...l.slots] });

/** The loadout remembered for a dungeon, or null. */
export function dungeonPreset(state: GameState, dungeonId: string): CardLoadout | null {
  return state.presets.dungeons[dungeonId] ?? null;
}

/** A remembered loadout with the cards that can no longer be used taken out. */
function usable(state: GameState, content: Content, saved: CardLoadout): CardLoadout {
  const ok = (id: string | null): string | null => {
    if (id === null) return null;
    const card = content.cardById.get(id);
    return card?.job === 'fighting' && state.cards.owned[id] && !isOnTrip(state, id) ? id : null;
  };
  const seen = new Set<string>();
  const once = (id: string | null): string | null => {
    const v = ok(id);
    if (v === null || seen.has(v)) return null;
    seen.add(v);
    return v;
  };
  return { slots: Array.from({ length: LOADOUT_SLOTS }, (_, i) => once(saved.slots[i] ?? null)) };
}

/**
 * Picks what is auto-fought like `setActiveDungeon`, and swaps the fighting loadout: the one in
 * use is remembered for the dungeon being left, the new dungeon's remembered one is put on.
 */
export function pickDungeon(
  state: GameState,
  content: Content,
  id: string | null,
): PickDungeonResult {
  const left = state.activeDungeonId;
  const picked = setActiveDungeon(state, content, id);
  if (!picked.ok) return picked;
  if (id === left) return { ok: true, state: picked.state, preset: 'none' };
  const next = cloneState(picked.state);
  if (left !== null) next.presets.dungeons[left] = copyLoadout(state.cards.loadouts.fighting);
  const saved = id === null ? undefined : next.presets.dungeons[id];
  if (!saved) return { ok: true, state: next, preset: 'none' };
  const loadout = usable(next, content, saved);
  if (loadoutProblem(next, content, 'fighting', loadout) !== null) {
    return { ok: true, state: next, preset: 'over-cost-cap' };
  }
  next.cards.loadouts.fighting = loadout;
  return { ok: true, state: next, preset: 'applied' };
}

/** A remembered loadout's cost against the cap, for the "over the cap" flag. */
export function presetCost(
  state: GameState,
  content: Content,
  loadout: CardLoadout,
): { cost: number; cap: number; cards: number } {
  return {
    cost: loadoutCost(content, loadout),
    cap: loadoutCostCap(state, content, 'fighting'),
    cards: loadoutCards(loadout).length,
  };
}
