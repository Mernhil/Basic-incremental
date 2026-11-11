import {
  RARITIES,
  type Card,
  type Content,
  type ExpeditionPlace,
  type ProductionJob,
} from '../data';
import { grantWorkerXp, loadoutCards, xpToNextLevel } from './cards';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { producerLevel, producerRate, producersOf } from './production';
import { cloneState, isOnTrip, type ExpeditionTrip, type GameState } from './state';
import { activeWorkers, forgeWorker } from './workers';

/**
 * Expeditions (DESIGN.md §15 Expeditions). A card that is in no loadout and at no work goes on a
 * timed trip to a place opened by clearing its dungeon, and brings back that area's materials,
 * some gems and card XP, double when the card's element matches the place's. A trip is a plain
 * timer: it runs with play time and through all of the time away, outside the offline cap
 * (`advanceTrips`, called by the tick and by offline progress). Recalling a trip early returns
 * nothing. The rewards depend only on the place, the length and the card, never on how time was
 * split into steps.
 *
 * Every function is pure except `advanceTrips`, which mutates the fresh copy the tick owns.
 */

const HOUR_SECONDS = 3600;
/** Float noise from adding many small steps; a trip this close to its length is done. */
const EPSILON = 1e-6;

export type ExpeditionFailure =
  | 'unknown-card'
  | 'not-owned'
  | 'unknown-place'
  /** The place's dungeon has not been cleared. */
  | 'locked'
  /** Not one of `durationsHours`. */
  | 'bad-length'
  /** The card is already away. */
  | 'on-trip'
  /** The card is in the fighting loadout. */
  | 'in-loadout'
  /** The card works a tree, a mine or the forge. */
  | 'at-work'
  /** Every expedition slot is in use. */
  | 'no-slot'
  /** No such trip. */
  | 'no-trip'
  /** The trip has not finished. */
  | 'not-done';

/** What a trip brings back. */
export interface TripRewards {
  /** Material resource id -> whole units. */
  materials: Record<string, number>;
  /** Gem resource id -> amount. */
  gems: Record<string, Decimal>;
  /** XP the card gains. */
  cardXp: Decimal;
  /** The card's element matches the place's: everything above is doubled. */
  doubled: boolean;
}

export type TripResult = { ok: true; state: GameState } | { ok: false; reason: ExpeditionFailure };
export type CollectResult =
  | { ok: true; state: GameState; rewards: TripRewards; trip: ExpeditionTrip }
  | { ok: false; reason: ExpeditionFailure };

const fail = (reason: ExpeditionFailure): { ok: false; reason: ExpeditionFailure } => ({
  ok: false,
  reason,
});

/** Expedition slots: one, plus the account tree's and the Starlight shop's (`expedition.slots`). */
export function expeditionSlots(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number {
  const shop = content.prestige.shop.find((i) => i.grants === 'expedition_slot');
  const bought = shop ? Math.min(Math.max(0, state.prestige.shop[shop.id] ?? 0), shop.maxLevel) : 0;
  return Math.max(0, Math.floor(statValue('expedition.slots', 1 + bought, modifiers).toNumber()));
}

/** A place is open once its dungeon is cleared. */
export function isPlaceOpen(state: GameState, place: ExpeditionPlace): boolean {
  return state.clearedDungeons.includes(place.dungeon);
}

/** The places that are open, in content order. */
export function openPlaces(state: GameState, content: Content): ExpeditionPlace[] {
  return content.expeditions.places.filter((p) => isPlaceOpen(state, p));
}

export const tripSeconds = (trip: Pick<ExpeditionTrip, 'hours'>): number =>
  trip.hours * HOUR_SECONDS;

export const isTripDone = (trip: ExpeditionTrip): boolean =>
  trip.elapsedSeconds >= tripSeconds(trip) - EPSILON;

export const tripSecondsLeft = (trip: ExpeditionTrip): number =>
  isTripDone(trip) ? 0 : tripSeconds(trip) - trip.elapsedSeconds;

/** Whether a card is at work: in the fighting loadout, on a tree or mine, or at the forge. */
function busyWith(
  state: GameState,
  content: Content,
  cardId: string,
): 'in-loadout' | 'at-work' | null {
  if (loadoutCards(state.cards.loadouts.fighting).includes(cardId)) return 'in-loadout';
  if (Object.values(activeWorkers(state, content)).some((ids) => ids.includes(cardId))) {
    return 'at-work';
  }
  return forgeWorker(state, content) === cardId ? 'at-work' : null;
}

/** Why a card cannot go on this trip, or null when it can. */
export function tripProblem(
  state: GameState,
  content: Content,
  cardId: string,
  placeId: string,
  hours: number,
  modifiers?: readonly Modifier[],
): ExpeditionFailure | null {
  if (!content.cardById.has(cardId)) return 'unknown-card';
  if (!state.cards.owned[cardId]) return 'not-owned';
  const place = content.expeditions.places.find((p) => p.id === placeId);
  if (!place) return 'unknown-place';
  if (!isPlaceOpen(state, place)) return 'locked';
  if (!content.expeditions.durationsHours.includes(hours)) return 'bad-length';
  if (isOnTrip(state, cardId)) return 'on-trip';
  const busy = busyWith(state, content, cardId);
  if (busy) return busy;
  if (state.expeditions.trips.length >= expeditionSlots(state, content, modifiers)) {
    return 'no-slot';
  }
  return null;
}

/** Sends a card on a trip. */
export function startTrip(
  state: GameState,
  content: Content,
  cardId: string,
  placeId: string,
  hours: number,
): TripResult {
  const problem = tripProblem(state, content, cardId, placeId, hours);
  if (problem) return fail(problem);
  const next = cloneState(state);
  next.expeditions.trips.push({ cardId, placeId, hours, elapsedSeconds: 0 });
  return { ok: true, state: next };
}

/** Calls a card home early: the trip ends and brings back nothing. */
export function recallTrip(state: GameState, cardId: string): TripResult {
  if (!isOnTrip(state, cardId)) return fail('no-trip');
  const next = cloneState(state);
  next.expeditions.trips = next.expeditions.trips.filter((t) => t.cardId !== cardId);
  return { ok: true, state: next };
}

function gemProducer(
  content: Content,
  resource: string,
): { job: ProductionJob; producer: ReturnType<typeof producersOf>[number] } | null {
  for (const job of ['logging', 'mining'] as const) {
    const producer = producersOf(content, job).find((p) => p.resource === resource);
    if (producer) return { job, producer };
  }
  return null;
}

/** What a trip brings back (see the file header). Zero rewards for an unknown card or place. */
export function tripRewards(
  state: GameState,
  content: Content,
  trip: ExpeditionTrip,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): TripRewards {
  const place = content.expeditions.places.find((p) => p.id === trip.placeId);
  const card = content.cardById.get(trip.cardId);
  const owned = state.cards.owned[trip.cardId];
  const out: TripRewards = { materials: {}, gems: {}, cardXp: new Decimal(0), doubled: false };
  if (!place || !card || !owned) return out;
  out.doubled = card.element === place.element;
  const factor = out.doubled ? 2 : 1;
  for (const m of place.rewards.materials) {
    const units = Math.floor(m.perHour * trip.hours * factor + EPSILON);
    if (units > 0) out.materials[m.resource] = (out.materials[m.resource] ?? 0) + units;
  }
  for (const g of place.rewards.gems) {
    const found = gemProducer(content, g.resource);
    if (!found) continue;
    const rate = producerRate(
      found.producer,
      found.job,
      modifiers,
      producerLevel(state, found.job, found.producer.id),
    );
    const amount = rate.mul(g.secondsPerHour * trip.hours * factor).floor();
    if (amount.gt(0)) out.gems[g.resource] = (out.gems[g.resource] ?? new Decimal(0)).add(amount);
  }
  out.cardXp = xpToNextLevel(content, owned.level).mul(
    place.rewards.cardXpLevels * trip.hours * factor,
  );
  return out;
}

/** Brings a finished trip's card home and pays its rewards. */
export function collectTrip(state: GameState, content: Content, cardId: string): CollectResult {
  const trip = state.expeditions.trips.find((t) => t.cardId === cardId);
  if (!trip) return fail('no-trip');
  if (!isTripDone(trip)) return fail('not-done');
  const rewards = tripRewards(state, content, trip);
  const next = cloneState(state);
  next.expeditions.trips = next.expeditions.trips.filter((t) => t.cardId !== cardId);
  next.expeditions.completed += 1;
  const add = (id: string, amount: Decimal): void => {
    next.resources[id] = (next.resources[id] ?? new Decimal(0)).add(amount);
  };
  for (const [id, units] of Object.entries(rewards.materials)) add(id, new Decimal(units));
  for (const [id, amount] of Object.entries(rewards.gems)) add(id, amount);
  grantWorkerXp(next, content, cardId, rewards.cardXp);
  return { ok: true, state: next, rewards, trip };
}

/**
 * Advances every trip by `seconds` (mutates `state`, a fresh copy owned by the caller). A trip
 * stops at its length, so the result is the same for any split of time. Called by the tick for
 * play time and by offline progress for the part of the time away the offline cap leaves out.
 */
export function advanceTrips(state: GameState, seconds: number): void {
  if (!(seconds > 0)) return;
  for (const trip of state.expeditions.trips) {
    trip.elapsedSeconds = Math.min(tripSeconds(trip), trip.elapsedSeconds + seconds);
  }
}

// ---- view for the panel -------------------------------------------------------------------

export interface TripView {
  trip: ExpeditionTrip;
  cardName: string;
  placeName: string;
  done: boolean;
  secondsLeft: number;
  /** 0..1 */
  progress: number;
  rewards: TripRewards;
}

export interface PlaceView {
  place: ExpeditionPlace;
  open: boolean;
  /** The dungeon that opens it, for the locked line. */
  dungeonName: string;
}

export interface ExpeditionView {
  slots: number;
  used: number;
  durationsHours: readonly number[];
  places: PlaceView[];
  trips: TripView[];
  /** Cards that could go now (owned, in no loadout, at no work, not away), best first. */
  available: Card[];
}

export function expeditionView(state: GameState, content: Content): ExpeditionView {
  const modifiers = collectModifiers(state, content);
  const trips: TripView[] = state.expeditions.trips.map((trip) => ({
    trip,
    cardName: content.cardById.get(trip.cardId)?.name ?? trip.cardId,
    placeName: content.expeditions.places.find((p) => p.id === trip.placeId)?.name ?? trip.placeId,
    done: isTripDone(trip),
    secondsLeft: tripSecondsLeft(trip),
    progress: Math.min(1, trip.elapsedSeconds / tripSeconds(trip)),
    rewards: tripRewards(state, content, trip, modifiers),
  }));
  const available = content.cards
    .filter(
      (c) =>
        state.cards.owned[c.id] &&
        !isOnTrip(state, c.id) &&
        busyWith(state, content, c.id) === null,
    )
    .sort(
      (a, b) =>
        RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || a.name.localeCompare(b.name),
    );
  return {
    slots: expeditionSlots(state, content, modifiers),
    used: trips.length,
    durationsHours: content.expeditions.durationsHours,
    places: content.expeditions.places.map((place) => ({
      place,
      open: isPlaceOpen(state, place),
      dungeonName: content.dungeonById.get(place.dungeon)?.name ?? place.dungeon,
    })),
    trips,
    available,
  };
}
