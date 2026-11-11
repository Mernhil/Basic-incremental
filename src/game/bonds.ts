import type { Bond, Content, Job } from '../data';
import { loadoutCards } from './cards';
import type { Modifier } from './modifiers';
import { cloneState, type GameState } from './state';
import { activeWorkers } from './workers';

/**
 * Bonds (DESIGN.md §15 Bonds): two specific cards at work together give a small named bonus. A
 * fighting pair works together while both are in the fighting loadout; a logging or mining pair
 * while both are workers at work (on any tree or mine of their job). The bonus enters the game as
 * modifiers (source kind `bond`), so no rule outside the modifier pipeline knows about bonds.
 *
 * A bond is discovered the first time it is active; `settleBonds` records that on the whole-second
 * grid of the tick (like achievements), so how time is split into steps changes nothing. The Codex
 * shows an undiscovered bond as a silhouette: no name, no cards, no bonus.
 */

/** The job a bond works in: the job of its cards (both cards share it, checked by the data check). */
export function bondJob(content: Content, bond: Bond): Job | null {
  const jobs = bond.cards.map((id) => content.cardById.get(id)?.job);
  return jobs[0] && jobs[0] === jobs[1] ? jobs[0] : null;
}

/** Whether both cards of a bond are at work together now. */
export function bondActive(state: GameState, content: Content, bond: Bond): boolean {
  const job = bondJob(content, bond);
  if (job === null) return false;
  const [a, b] = bond.cards;
  if (!state.cards.owned[a] || !state.cards.owned[b]) return false;
  if (job === 'fighting') {
    const team = loadoutCards(state.cards.loadouts.fighting);
    return team.includes(a) && team.includes(b);
  }
  const working = Object.values(activeWorkers(state, content)).flat();
  return working.includes(a) && working.includes(b);
}

/** The bonds active now, in content order. */
export function activeBonds(state: GameState, content: Content): Bond[] {
  return content.bonds.filter((bond) => bondActive(state, content, bond));
}

/** The bonuses of the active bonds, scoped as written in `bonds.json`. Read by `collectModifiers`. */
export function bondModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const bond of activeBonds(state, content)) {
    for (const m of bond.modifiers) out.push({ ...m, source: { kind: 'bond', id: bond.id } });
  }
  return out;
}

/** Whether an active bond is not yet in `discoveredBonds` (a settle would record it). */
export function bondsDue(state: GameState, content: Content): boolean {
  return activeBonds(state, content).some((b) => !state.discoveredBonds.includes(b.id));
}

/** Records the bonds active now as discovered (mutates `state`, a fresh copy). Returns the new ids. */
export function settleBonds(state: GameState, content: Content): string[] {
  const found = activeBonds(state, content)
    .map((b) => b.id)
    .filter((id) => !state.discoveredBonds.includes(id));
  state.discoveredBonds.push(...found);
  return found;
}

/** Records the bonds an action just formed (equipping a pair). Same state back when none is new. */
export function checkBonds(state: GameState, content: Content): GameState {
  if (!bondsDue(state, content)) return state;
  const next = cloneState(state);
  settleBonds(next, content);
  return next;
}

/** One line of the Codex. An undiscovered bond has no name, cards or bonus: a silhouette. */
export interface CodexEntry {
  id: string;
  discovered: boolean;
  /** Both cards are at work together now (only a discovered bond can show it). */
  active: boolean;
  name: string | null;
  cards: [string, string] | null;
  /** The job the pair works in. Known to the player from the silhouette's shape, so always set. */
  job: Job | null;
  bonus: Bond['modifiers'] | null;
}

/** Every bond in content order, discovered ones in full and the rest as silhouettes. */
export function bondCodex(state: GameState, content: Content): CodexEntry[] {
  return content.bonds.map((bond) => {
    const discovered = state.discoveredBonds.includes(bond.id);
    return {
      id: bond.id,
      discovered,
      active: discovered && bondActive(state, content, bond),
      name: discovered ? bond.name : null,
      cards: discovered ? [bond.cards[0], bond.cards[1]] : null,
      job: bondJob(content, bond),
      bonus: discovered ? bond.modifiers : null,
    };
  });
}
