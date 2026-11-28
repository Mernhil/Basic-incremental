import type { Card, Content } from '../data';
import { isStarterCard, MAX_LOADOUT_STARTERS, starterCount } from './cards';
import { dungeonProgress, floorCount } from './floors';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, finalPrice, pay, type Price } from './production';
import { cloneState, newOwnedCard, type GameState } from './state';

/**
 * The starter weapons (DESIGN.md §2 Starter weapon): five T6 weapons, one per element. The three
 * base ones (earth, fire, water) are offered to a new game, which takes one; each dungeon cleared
 * on Nightmare opens one more. The two special ones (light, dark) open with the first and second
 * dungeon reached in the endless depths, the player choosing which comes first. A starter always
 * arrives sealed, fighting as a Wood card, and each seal broken with dungeon Cores lets it fight as
 * a stronger tier until the last one makes it an Heirloom's strength. A team holds only one
 * starter (`MAX_LOADOUT_STARTERS`). Which cards, the seals and the strength are in starters.json;
 * what a save has earned is read from the dungeon progress, so no unlock is stored.
 */

export type StarterGroup = 'base' | 'special';
export type StarterFailure = 'unknown' | 'not-due' | 'owned' | 'not-sealed' | 'unaffordable';
export type StarterResult = { ok: true; state: GameState } | { ok: false; reason: StarterFailure };

const fail = (reason: StarterFailure): { ok: false; reason: StarterFailure } => ({
  ok: false,
  reason,
});

/** Every starter card id, base first. */
export function starterIds(content: Content): string[] {
  return [...content.starters.base, ...content.starters.special];
}

/** Which group a card is a starter of, or null. */
export function starterGroup(content: Content, cardId: string): StarterGroup | null {
  if (content.starters.base.includes(cardId)) return 'base';
  if (content.starters.special.includes(cardId)) return 'special';
  return null;
}

/** The dungeons whose last-floor boss has been beaten on Nightmare. */
export function nightmareClears(state: GameState, content: Content): number {
  return content.dungeons.filter((d) => {
    const t = dungeonProgress(state, d.id).tiers.nightmare;
    const best = Math.max(t?.best ?? 0, t?.record ?? 0);
    return best >= floorCount(d, 'nightmare');
  }).length;
}

/** The dungeons in which an endless depth has been beaten. */
export function endlessReached(state: GameState, content: Content): number {
  return content.dungeons.filter(
    (d) =>
      Math.max(
        dungeonProgress(state, d.id).tiers.endless?.best ?? 0,
        dungeonProgress(state, d.id).tiers.endless?.record ?? 0,
      ) >= 1,
  ).length;
}

function ownedCount(state: GameState, ids: readonly string[]): number {
  return ids.filter((id) => state.cards.owned[id]).length;
}

/**
 * How many starters of each group the save may still take: the new game's pick and one per
 * dungeon cleared on Nightmare (base), one per dungeon reached in the endless depths (special),
 * less what it already owns. A save that turned the pick down earned only the Nightmare ones.
 */
export function starterUnlocks(state: GameState, content: Content): Record<StarterGroup, number> {
  const { base, special } = content.starters;
  const ownedBase = ownedCount(state, base);
  const pick = state.starter.done && ownedBase === 0 ? 0 : 1;
  const baseEarned = Math.min(base.length, pick + nightmareClears(state, content));
  const specialEarned = Math.min(special.length, endlessReached(state, content));
  return {
    base: Math.max(0, baseEarned - ownedBase),
    special: Math.max(0, specialEarned - ownedCount(state, special)),
  };
}

/** The cards the player may take now: the base starters first, then the special ones. */
export function starterChoices(state: GameState, content: Content): Card[] {
  const open = starterUnlocks(state, content);
  const group = open.base > 0 ? 'base' : open.special > 0 ? 'special' : null;
  if (!group) return [];
  return content.starters[group]
    .filter((id) => !state.cards.owned[id])
    .map((id) => content.cardById.get(id))
    .filter((c): c is Card => c !== undefined);
}

/** Whether the new game's pick screen is due: nothing taken or turned down yet. */
export function starterPickDue(state: GameState, content: Content): boolean {
  return !state.starter.done && starterChoices(state, content).length > 0;
}

/** Whether a later unlock waits for a choice (the pick itself having been made). */
export function starterUnlockDue(state: GameState, content: Content): boolean {
  return state.starter.done && starterChoices(state, content).length > 0;
}

/** Takes a starter that is open (an owned card is refused): owned from now on, sealed, ★1 Lv 1. */
export function claimStarter(state: GameState, content: Content, cardId: string): StarterResult {
  const card = content.cardById.get(cardId);
  if (!card || !isStarterCard(content, cardId)) return fail('unknown');
  if (state.cards.owned[cardId]) return fail('owned');
  if (!starterChoices(state, content).some((c) => c.id === cardId)) return fail('not-due');
  const next = cloneState(state);
  next.cards.owned[cardId] = { ...newOwnedCard(card.tier), seal: 0 };
  next.starter.done = true;
  // It takes an empty slot of the fighting loadout unless a starter is already there (one a team).
  const slots = next.cards.loadouts.fighting.slots;
  const free = slots.indexOf(null);
  if (free >= 0 && starterCount(content, slots) < MAX_LOADOUT_STARTERS) slots[free] = cardId;
  return { ok: true, state: next };
}

/** Turns the first pick down (only a save that began before the starter existed may). */
export function skipStarter(state: GameState): StarterResult {
  if (state.starter.done || !state.starter.skippable) return fail('not-due');
  const next = cloneState(state);
  next.starter.done = true;
  return { ok: true, state: next };
}

/** The seals broken so far on a starter, or null when the card is not a starter of this save. */
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

/**
 * Breaks the next seal of a sealed starter, paying its Cores. After the last one `seal` stays at
 * the number of seals: the card is an unsealed starter, fighting as `starters.unsealedTier`.
 */
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
  owned.seal = (owned.seal ?? 0) + 1;
  return { ok: true, state: next };
}
