import type { Content } from '../data';
import { isStarterCard, MAX_LOADOUT_STARTERS, starterCount } from './cards';
import { Decimal } from './num';
import { cloneState, LOADOUT_SLOTS, type GameState } from './state';

/**
 * The Training ground's test dummy (DESIGN.md section 2 Test dummies): endless health, so it is
 * never beaten; it hits as hard as the player sets; the player picks the team. The battle itself is in
 * `trainingBattle.ts`. Nothing a dummy does pays a reward or changes the
 * fight in progress: these functions only keep the settings.
 */

export type DummyFailure =
  'unknown' | 'not-owned' | 'not-fighting' | 'invalid-damage' | 'too-many-starters';
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
    const others = next.dummy.team.filter((_, i) => i !== slot);
    if (isStarterCard(content, cardId) && starterCount(content, others) >= MAX_LOADOUT_STARTERS) {
      return { ok: false, reason: 'too-many-starters' };
    }
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
