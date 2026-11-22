import type { Card, Content } from '../data';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, finalPrice, pay, type Price } from './production';
import { cloneState, newOwnedCard, type GameState } from './state';

/**
 * The starter weapon (DESIGN.md §2 Starter weapon): a new game offers four T6 weapons and the
 * player takes one. It arrives sealed, fighting as a Wood card, and each seal broken with dungeon
 * Cores lets it fight as a stronger tier, until the last one makes it the whole T6 card. It is the
 * one card whose strength is held below its own tier. The cards and the seals are in starters.json.
 * A copy of the same card later is an ordinary copy: a star on the same card (`grantCard`).
 */

export type StarterFailure = 'unknown' | 'already-picked' | 'owned' | 'not-sealed' | 'unaffordable';
export type StarterResult = { ok: true; state: GameState } | { ok: false; reason: StarterFailure };

const fail = (reason: StarterFailure): { ok: false; reason: StarterFailure } => ({
  ok: false,
  reason,
});

/** The cards the pick offers that the player does not already own. */
export function starterChoices(state: GameState, content: Content): Card[] {
  return content.starters.cards
    .filter((id) => !state.cards.owned[id])
    .map((id) => content.cardById.get(id))
    .filter((c): c is Card => c !== undefined);
}

/** Whether the pick screen is due: not made yet and something is left to pick. */
export function starterPickDue(state: GameState, content: Content): boolean {
  return !state.starter.done && starterChoices(state, content).length > 0;
}

/** Takes the starter (an owned card is refused): owned from now on, sealed, ★1 Lv 1. */
export function pickStarter(state: GameState, content: Content, cardId: string): StarterResult {
  if (state.starter.done) return fail('already-picked');
  if (!content.starters.cards.includes(cardId) || !content.cardById.has(cardId)) {
    return fail('unknown');
  }
  if (state.cards.owned[cardId]) return fail('owned');
  const next = cloneState(state);
  const card = content.cardById.get(cardId)!;
  next.cards.owned[cardId] = { ...newOwnedCard(card.tier), seal: 0 };
  next.starter.done = true;
  // It takes an empty loadout slot when one is free: the player owns it from the first minute.
  const slots = next.cards.loadouts.fighting.slots;
  const free = slots.indexOf(null);
  if (free >= 0) slots[free] = cardId;
  return { ok: true, state: next };
}

/** Turns the pick down (only a save that began before the starter existed may). */
export function skipStarter(state: GameState): StarterResult {
  if (state.starter.done || !state.starter.skippable) return fail('already-picked');
  const next = cloneState(state);
  next.starter.done = true;
  return { ok: true, state: next };
}

/** The seals broken so far on a sealed starter, or null when the card is not sealed. */
export function sealsBroken(state: GameState, cardId: string): number | null {
  return state.cards.owned[cardId]?.seal ?? null;
}

/** What the next seal of a sealed starter costs (through `cost.multiplier`), or null when none. */
export function nextSealCost(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Price[] | null {
  const broken = sealsBroken(state, cardId);
  const step = broken === null ? undefined : content.starters.seals[broken];
  if (!step) return null;
  return step.cost.map((c) => finalPrice(c.resource, new Decimal(c.amount), modifiers, {}));
}

/** Breaks the next seal of a sealed starter, paying its Cores. */
export function breakSeal(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): StarterResult {
  const cost = nextSealCost(state, content, cardId, modifiers);
  if (!cost) return fail('not-sealed');
  if (!canAfford(state, cost)) return fail('unaffordable');
  const next = pay(state, cost);
  const owned = next.cards.owned[cardId]!;
  const broken = (owned.seal ?? 0) + 1;
  if (broken >= content.starters.seals.length) delete owned.seal;
  else owned.seal = broken;
  return { ok: true, state: next };
}
