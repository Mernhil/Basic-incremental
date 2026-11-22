import type { Content } from '../data';
import { averageDps } from './combat';
import { buildTeam } from './duel';
import { collectModifiers } from './modifiers';
import { Decimal } from './num';
import { cloneState, LOADOUT_SLOTS, type GameState } from './state';

/**
 * The Training ground's test dummy (DESIGN.md section 2 Test dummies): endless health, so it is
 * never beaten; it deals the damage per second the player sets; the player picks a team and reads
 * its damage per second and how long it stands. Nothing a dummy does pays a reward or changes the
 * fight in progress: every function here reads the state and returns numbers.
 */

export type DummyFailure = 'unknown' | 'not-owned' | 'not-fighting' | 'invalid-damage';
export type DummyResult = { ok: true; state: GameState } | { ok: false; reason: DummyFailure };

/** Sets the damage per second the dummy deals, clamped to 0..`dummy.maxDamage`. */
export function setDummyDamage(state: GameState, content: Content, damage: Decimal): DummyResult {
  if (!damage.isFinite() || damage.isNan()) return { ok: false, reason: 'invalid-damage' };
  const next = cloneState(state);
  next.dummy.damage = Decimal.min(Decimal.max(damage, 0), content.dummy.maxDamage);
  return { ok: true, state: next };
}

/** Puts a fighting card on trial in a slot (or empties it with null). A card is on trial once. */
export function setDummyCard(
  state: GameState,
  content: Content,
  slot: number,
  cardId: string | null,
): DummyResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= LOADOUT_SLOTS) {
    return { ok: false, reason: 'unknown' };
  }
  const next = cloneState(state);
  if (cardId !== null) {
    const card = content.cardById.get(cardId);
    if (!card) return { ok: false, reason: 'unknown' };
    if (!state.cards.owned[cardId]) return { ok: false, reason: 'not-owned' };
    if (card.job !== 'fighting') return { ok: false, reason: 'not-fighting' };
    next.dummy.team = next.dummy.team.map((id) => (id === cardId ? null : id));
  }
  next.dummy.team[slot] = cardId;
  return { ok: true, state: next };
}

/** Fills the trial team with the fighting loadout's cards. */
export function copyLoadoutToDummy(state: GameState): GameState {
  const next = cloneState(state);
  next.dummy.team = [...state.cards.loadouts.fighting.slots];
  return next;
}

/** What the team on trial does against the dummy. */
export interface DummyReadout {
  /** Cards on trial. */
  cards: number;
  /** The team's average damage per second (hits, crits and signature attacks at their expected value). */
  dps: Decimal;
  /** The dummy's damage per second, as set. */
  incoming: Decimal;
  /** The team's health together. */
  health: Decimal;
  /** Seconds until the dummy's damage has used up the team's health; null when it never does (no damage set). */
  secondsStanding: number | null;
}

/**
 * The trial team's numbers. The team is the chosen cards in the loadout's slots; the player's real
 * loadout and fight are not touched. With no card, bare hands.
 */
export function dummyReadout(state: GameState, content: Content): DummyReadout {
  const trial = cloneState(state);
  trial.cards.loadouts.fighting.slots = [...state.dummy.team];
  const modifiers = collectModifiers(trial, content);
  const team = buildTeam(trial, content, modifiers, null);
  const dps = averageDps(trial, content, null, modifiers);
  const health = team.reduce((sum, card) => sum.add(card.maxHealth), new Decimal(0));
  const incoming = state.dummy.damage;
  const cards = state.dummy.team.filter((id) => id !== null).length;
  const secondsStanding = incoming.gt(0) && health.gt(0) ? health.div(incoming).toNumber() : null;
  return { cards, dps, incoming, health, secondsStanding };
}
