import type { Content } from '../data';
import { setActiveDungeon, type CombatFailure } from './combat';
import { loadoutCards, loadoutCostCap, loadoutCost, loadoutProblem } from './cards';
import {
  cloneState,
  isOnTrip,
  PRESETS_PER_JOB,
  SUPPORT_SLOTS,
  type CardLoadout,
  type GameState,
  type PresetJob,
  type ProductionPreset,
} from './state';
import { activeWorkers, producerJob } from './workers';

/**
 * Loadout presets (DESIGN.md §15 Loadout presets).
 *
 * Dungeons: each dungeon (or Glimmer Trial) remembers the fighting loadout it was left with and
 * `pickDungeon` switches to it. Picking a dungeon with nothing remembered keeps the current
 * loadout. A remembered card that is gone or away on an expedition leaves its slot empty; a
 * loadout over the cost cap is flagged and not applied (and not deleted).
 *
 * Jobs: logging and mining each have `PRESETS_PER_JOB` named presets of "which cards work which
 * tree or mine". Applying one replaces that job's workers; whatever does not fit (a place still
 * locked, fewer slots than workers) is flagged in `missing`, and the preset is kept as saved.
 *
 * All functions are pure and need no time, so tick size does not matter.
 */

export type DungeonPresetOutcome = 'none' | 'applied' | 'over-cost-cap';

export type PickDungeonResult =
  | { ok: true; state: GameState; preset: DungeonPresetOutcome }
  | { ok: false; reason: CombatFailure };

const copyLoadout = (l: CardLoadout): CardLoadout => ({ main: l.main, supports: [...l.supports] });

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
  const main = once(saved.main);
  const supports = Array.from({ length: SUPPORT_SLOTS }, (_, i) => once(saved.supports[i] ?? null));
  return { main, supports };
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

// ---- production presets ----------------------------------------------------------------------

export type PresetFailure = 'bad-slot' | 'empty';

export type PresetResult = { ok: true; state: GameState } | { ok: false; reason: PresetFailure };

export type ApplyPresetResult =
  | {
      ok: true;
      state: GameState;
      /** Workers in the preset that are not at work now (card gone or away, place locked, no slot). */
      missing: number;
    }
  | { ok: false; reason: PresetFailure };

const validSlot = (index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < PRESETS_PER_JOB;

/** The places of one job's workers in the current assignment. */
function jobWorkers(state: GameState, content: Content, job: PresetJob): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [place, ids] of Object.entries(activeWorkers(state, content))) {
    if (producerJob(content, place) === job) out[place] = [...ids];
  }
  return out;
}

/** Saves the workers of a job now into preset slot `index` (named `name`, or "Preset n"). */
export function saveProductionPreset(
  state: GameState,
  content: Content,
  job: PresetJob,
  index: number,
  name?: string,
): PresetResult {
  if (!validSlot(index)) return { ok: false, reason: 'bad-slot' };
  const workers = jobWorkers(state, content, job);
  if (Object.keys(workers).length === 0) return { ok: false, reason: 'empty' };
  const next = cloneState(state);
  const previous = state.presets.production[job][index];
  next.presets.production[job][index] = {
    name: name?.trim() || previous?.name || `Preset ${index + 1}`,
    workers,
  };
  return { ok: true, state: next };
}

export function renameProductionPreset(
  state: GameState,
  job: PresetJob,
  index: number,
  name: string,
): PresetResult {
  const preset = validSlot(index) ? state.presets.production[job][index] : null;
  const trimmed = name.trim();
  if (!preset || trimmed === '')
    return { ok: false, reason: validSlot(index) ? 'empty' : 'bad-slot' };
  const next = cloneState(state);
  next.presets.production[job][index] = { ...preset, name: trimmed.slice(0, 24) };
  return { ok: true, state: next };
}

export function clearProductionPreset(
  state: GameState,
  job: PresetJob,
  index: number,
): PresetResult {
  if (!validSlot(index)) return { ok: false, reason: 'bad-slot' };
  const next = cloneState(state);
  next.presets.production[job][index] = null;
  return { ok: true, state: next };
}

/** Puts a saved preset to work: it replaces the job's workers; the other job is untouched. */
export function applyProductionPreset(
  state: GameState,
  content: Content,
  job: PresetJob,
  index: number,
): ApplyPresetResult {
  if (!validSlot(index)) return { ok: false, reason: 'bad-slot' };
  const preset: ProductionPreset | null = state.presets.production[job][index] ?? null;
  if (!preset) return { ok: false, reason: 'empty' };
  const next = cloneState(state);
  const workers: Record<string, string[]> = {};
  for (const [place, ids] of Object.entries(next.production.workers)) {
    if (producerJob(content, place) !== job) workers[place] = [...ids];
  }
  let wanted = 0;
  const wantedIds = new Set<string>();
  for (const [place, ids] of Object.entries(preset.workers)) {
    if (producerJob(content, place) !== job) continue;
    wanted += ids.length;
    const kept = ids.filter(
      (id) =>
        !wantedIds.has(id) &&
        content.cardById.get(id)?.job === job &&
        next.cards.owned[id] &&
        !isOnTrip(next, id),
    );
    kept.forEach((id) => wantedIds.add(id));
    if (kept.length > 0) workers[place] = kept;
  }
  next.production.workers = workers;
  if (next.production.forge.worker && wantedIds.has(next.production.forge.worker)) {
    next.production.forge.worker = null;
  }
  const working = Object.values(jobWorkers(next, content, job)).reduce(
    (n, ids) => n + ids.length,
    0,
  );
  return { ok: true, state: next, missing: Math.max(0, wanted - working) };
}

export interface PresetSlotView {
  index: number;
  name: string | null;
  /** Card ids by place, as saved. */
  workers: Record<string, string[]> | null;
  /** Cards in it. */
  count: number;
}

/** The preset slots of a job for the buttons. */
export function productionPresetSlots(state: GameState, job: PresetJob): PresetSlotView[] {
  return state.presets.production[job].map((p, index) => ({
    index,
    name: p?.name ?? null,
    workers: p?.workers ?? null,
    count: p ? Object.values(p.workers).reduce((n, ids) => n + ids.length, 0) : 0,
  }));
}
