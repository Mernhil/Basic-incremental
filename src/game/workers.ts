import type { Content } from '../data';
import { slotWorkers, workerPower } from './camp';
import { cloneState, isOnTrip, type GameState } from './state';

/**
 * The forge's worker (DESIGN.md section 2 Base camp, the Forge). A production card (an axe or a
 * pickaxe) that works no camp slot may work the forge instead; a card is in one place at a time.
 * The farming cards themselves are in `camp.ts`.
 *
 * Every function is pure: state changes return a new state.
 */

export { workerPower };

export type WorkerFailure =
  /** No card with that id. */
  | 'unknown'
  /** The card is not in the collection. */
  | 'not-owned'
  /** A fighting card. */
  | 'wrong-job'
  /** The card is away on an expedition (DESIGN.md §15). */
  | 'on-expedition';

export type WorkerResult = { ok: true; state: GameState } | { ok: false; reason: WorkerFailure };

const fail = (reason: WorkerFailure): WorkerResult => ({ ok: false, reason });

/**
 * The card working the forge, or null: a production card that is owned, works no camp slot and is
 * not away.
 */
export function forgeWorker(state: GameState, content: Content): string | null {
  const id = state.production.forge.worker;
  const card = id ? content.cardById.get(id) : undefined;
  if (!id || !card || card.job === 'fighting' || !state.cards.owned[id] || isOnTrip(state, id)) {
    return null;
  }
  return slotWorkers(state, content).some((w) => w.card === id) ? null : id;
}

/**
 * Puts a production card to work in the forge, or with `cardId` null sends its worker away. A card
 * on a camp slot leaves it.
 */
export function assignForgeWorker(
  state: GameState,
  content: Content,
  cardId: string | null,
): WorkerResult {
  const next = cloneState(state);
  if (cardId === null) {
    next.production.forge.worker = null;
    return { ok: true, state: next };
  }
  const card = content.cardById.get(cardId);
  if (!card) return fail('unknown');
  if (!state.cards.owned[cardId]) return fail('not-owned');
  if (card.job === 'fighting') return fail('wrong-job');
  if (isOnTrip(state, cardId)) return fail('on-expedition');
  for (const place of ['forest', 'cave'] as const) {
    next.camp[place] = next.camp[place].map((slot) =>
      slot.card === cardId ? { ...slot, card: null } : slot,
    );
  }
  next.production.forge.worker = cardId;
  return { ok: true, state: next };
}
