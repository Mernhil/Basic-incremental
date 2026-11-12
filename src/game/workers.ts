import type { Content, ModifierScope, ProductionJob, WorkerCard } from '../data';
import { cardStatPower } from './cards';
import { workerElementModifier } from './elements';
import type { Modifier } from './modifiers';
import { isProducerUnlocked, producersOf, type Producer } from './production';
import { cloneState, isOnTrip, type GameState, type OwnedCard } from './state';
import { supportPower } from './upgrades';
import { challengeWorkerLimit } from './challenges';

/**
 * Workers (DESIGN.md §4 Workers, Worker slots, Worker abilities). Logging and mining cards are
 * workers: a card is placed on one tree kind or mine type and harvests it by itself. Its power
 * (rarity, level, tier and stars) multiplies that place's output, its pattern sets the strike
 * rhythm, and its one worker ability acts on that place only.
 *
 * The saved assignment is `production.workers` (place id -> card ids, in slot order). What is
 * read is always `activeWorkers`, derived from it: a worker that is unknown, not owned, of the
 * wrong job, on a locked place, a repeat, past its place's limit or past the slot count is left
 * out, so a slot count that drops or a card that is gone never leaves a broken assignment.
 * Slots are derived, never saved.
 *
 * Every function is pure: state changes return a new state.
 */

export type WorkerFailure =
  /** No tree kind or mine type, or no card, with that id. */
  | 'unknown'
  /** The tree kind or mine type is not unlocked yet. */
  | 'locked'
  /** The card is not in the collection. */
  | 'not-owned'
  /** A mining card on a tree, a logging card on a mine, or a fighting card. */
  | 'wrong-job'
  /** Every worker slot is in use. */
  | 'no-slot'
  /** The card is away on an expedition (DESIGN.md §15). */
  | 'on-expedition';

export type WorkerResult = { ok: true; state: GameState } | { ok: false; reason: WorkerFailure };

const fail = (reason: WorkerFailure): WorkerResult => ({ ok: false, reason });

/** The job of a tree kind (logging) or mine type (mining); null for an unknown id. */
export function producerJob(content: Content, producerId: string): ProductionJob | null {
  if (content.treeById.has(producerId)) return 'logging';
  if (content.mineById.has(producerId)) return 'mining';
  return null;
}

/** Every tree kind, then every mine type, in content order: the order slots are filled in. */
function allPlaces(content: Content): { job: ProductionJob; producer: Producer }[] {
  return [
    ...producersOf(content, 'logging').map((producer) => ({ job: 'logging' as const, producer })),
    ...producersOf(content, 'mining').map((producer) => ({ job: 'mining' as const, producer })),
  ];
}

/** How many trees and mines there are (one first worker slot each). */
export function allPlacesCount(content: Content): number {
  return allPlaces(content).length;
}

/** Places that have a second worker slot: the level of the Starlight shop's second-slot item (DESIGN.md §9). */
export function secondSlots(state: GameState, content: Content): number {
  const item = content.prestige.shop.find((i) => i.grants === 'second_worker_slots');
  if (!item) return 0;
  return Math.min(
    Math.max(0, state.prestige.shop[item.id] ?? 0),
    item.maxLevel,
    allPlaces(content).length,
  );
}

/**
 * Workers one tree kind or mine type takes at most: `perProducer` plus one when the Starlight shop
 * gave its place a second slot (the first places in order get them first; 0 for an unknown id).
 */
export function workersPerPlace(state: GameState, content: Content, producerId: string): number {
  if (!producerJob(content, producerId)) return 0;
  const index = allPlaces(content).findIndex((p) => p.producer.id === producerId);
  const second = index >= 0 && index < secondSlots(state, content) ? 1 : 0;
  return content.production.workers.slots.perProducer + second;
}

/**
 * Worker slots in all: the base plus one per Ascension (`production.json`), never more than one
 * per tree kind and mine type, plus the second slots bought with Starlight, which add to that.
 */
export function workerSlots(state: GameState, content: Content): number {
  const { base, perAscension } = content.production.workers.slots;
  const first = allPlaces(content).length * content.production.workers.slots.perProducer;
  const slots =
    Math.min(first, base + perAscension * Math.max(0, state.prestigeCount)) +
    secondSlots(state, content);
  // Single Post (Ascension challenge): one worker works.
  const limit = challengeWorkerLimit(state, content);
  return limit === null ? slots : Math.min(slots, limit);
}

/** The worker card of a valid assignment, or undefined: known, a worker of this job, owned. */
function workerCard(
  state: GameState,
  content: Content,
  job: ProductionJob,
  cardId: string,
): WorkerCard | undefined {
  const card = content.cardById.get(cardId);
  if (!card || card.job !== job || !state.cards.owned[cardId] || isOnTrip(state, cardId)) {
    return undefined;
  }
  return card;
}

/**
 * The workers that work: place id -> card ids, places in content order (trees, then mines).
 * Only unlocked places, valid cards, once each, within each place's limit and the slot count.
 */
export function activeWorkers(state: GameState, content: Content): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const seen = new Set<string>();
  let free = workerSlots(state, content);
  for (const { job, producer } of allPlaces(content)) {
    const saved = state.production.workers[producer.id];
    if (!saved || saved.length === 0 || free <= 0) continue;
    if (!isProducerUnlocked(state, content, job, producer.id)) continue;
    const limit = workersPerPlace(state, content, producer.id);
    const kept: string[] = [];
    for (const id of saved) {
      if (kept.length >= limit || free <= 0) break;
      if (seen.has(id) || !workerCard(state, content, job, id)) continue;
      seen.add(id);
      kept.push(id);
      free -= 1;
    }
    if (kept.length > 0) out[producer.id] = kept;
  }
  return out;
}

/** The (first) card working this tree kind or mine type, or null. */
export function workerAt(state: GameState, content: Content, producerId: string): string | null {
  return activeWorkers(state, content)[producerId]?.[0] ?? null;
}

/** The tree kind or mine type this card works, or null. */
export function workplaceOf(state: GameState, content: Content, cardId: string): string | null {
  for (const [place, ids] of Object.entries(activeWorkers(state, content))) {
    if (ids.includes(cardId)) return place;
  }
  return null;
}

/**
 * The card working the forge (DESIGN.md §4 The forge), or null: a production card that is owned,
 * works no tree or mine and fits in a free slot. The forge is filled after the places, so a slot
 * count that drops sends its worker away first.
 */
export function forgeWorker(state: GameState, content: Content): string | null {
  const id = state.production.forge.worker;
  const card = id ? content.cardById.get(id) : undefined;
  if (!id || !card || card.job === 'fighting' || !state.cards.owned[id] || isOnTrip(state, id)) {
    return null;
  }
  const placed = Object.values(activeWorkers(state, content));
  if (placed.some((ids) => ids.includes(id))) return null;
  const used = placed.reduce((n, ids) => n + ids.length, 0);
  return used < workerSlots(state, content) ? id : null;
}

/** Workers working now: the places' workers and the forge's. */
export function workersUsed(state: GameState, content: Content): number {
  const placed = Object.values(activeWorkers(state, content)).reduce((n, ids) => n + ids.length, 0);
  return placed + (forgeWorker(state, content) ? 1 : 0);
}

/**
 * Puts a production card to work in the forge, or with `cardId` null sends its worker away. A card
 * working a tree or mine moves; a new worker needs a free slot (the forge's own worker, if any, is
 * replaced and frees its slot).
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
  const workers = activeWorkers(state, content);
  const from = Object.keys(workers).find((place) => workers[place]!.includes(cardId)) ?? null;
  if (from === null && forgeWorker(state, content) !== cardId) {
    const placed = Object.values(workers).reduce((n, ids) => n + ids.length, 0);
    if (placed >= workerSlots(state, content)) return fail('no-slot');
  }
  if (from !== null) {
    const rest = workers[from]!.filter((id) => id !== cardId);
    if (rest.length > 0) workers[from] = rest;
    else delete workers[from];
    next.production.workers = Object.fromEntries(
      Object.entries(workers).map(([place, ids]) => [place, [...ids]]),
    );
  }
  next.production.forge.worker = cardId;
  return { ok: true, state: next };
}

/**
 * Puts a card to work on a tree kind or mine type, or with `cardId` null sends that place's
 * workers away. A logging card works trees, a mining card mines, and a card works one place: a
 * card already working elsewhere moves, and the card it replaces (if any) takes its old place.
 * A full place has its last worker replaced. A new worker needs a free slot. The saved
 * assignment is rewritten from `activeWorkers`, so it never keeps a broken entry.
 */
export function assignWorker(
  state: GameState,
  content: Content,
  producerId: string,
  cardId: string | null,
): WorkerResult {
  const job = producerJob(content, producerId);
  if (!job) return fail('unknown');
  if (!isProducerUnlocked(state, content, job, producerId)) return fail('locked');
  if (cardId !== null && state.production.forge.worker === cardId) {
    // the card leaves the forge for this place
    const away = cloneState(state);
    away.production.forge.worker = null;
    return assignWorker(away, content, producerId, cardId);
  }
  const workers = activeWorkers(state, content);
  const here = workers[producerId] ?? [];

  if (cardId === null) {
    delete workers[producerId];
    return done(state, workers);
  }
  const card = content.cardById.get(cardId);
  if (!card) return fail('unknown');
  if (!state.cards.owned[cardId]) return fail('not-owned');
  if (card.job !== job) return fail('wrong-job');
  if (isOnTrip(state, cardId)) return fail('on-expedition');
  if (here.includes(cardId)) return done(state, workers);

  const from = Object.keys(workers).find((place) => workers[place]!.includes(cardId)) ?? null;
  const limit = workersPerPlace(state, content, producerId);
  const next = [...here];
  let replaced: string | null = null;
  if (next.length >= limit) replaced = next.splice(limit - 1)[0] ?? null;
  next.push(cardId);
  workers[producerId] = next;

  if (from !== null) {
    // The card leaves its old place; the one it replaced there takes its slot.
    const rest = workers[from]!.filter((id) => id !== cardId);
    if (replaced !== null && workerCard(state, content, job, replaced)) {
      rest.splice(workers[from]!.indexOf(cardId), 0, replaced);
    }
    if (rest.length > 0) workers[from] = rest;
    else delete workers[from];
  } else if (replaced === null) {
    // the places come first: a full house sends the forge's worker away, never a place's
    const used = Object.values(workers).reduce((n, ids) => n + ids.length, 0);
    if (used > workerSlots(state, content)) return fail('no-slot');
  }
  return done(state, workers);
}

function done(state: GameState, workers: Record<string, string[]>): WorkerResult {
  const next = cloneState(state);
  next.production.workers = Object.fromEntries(
    Object.entries(workers).map(([place, ids]) => [place, [...ids]]),
  );
  return { ok: true, state: next };
}

/**
 * A worker's power (DESIGN.md §4 Workers): its rarity's power (`production.json`) × its level,
 * star and tier power (`cardStatPower`). It multiplies its place's output; 1 for a Wood ★1 Lv 1
 * Common. 0 for an unknown card.
 */
export function workerPower(content: Content, cardId: string, owned: OwnedCard): number {
  const card = content.cardById.get(cardId);
  if (!card) return 0;
  return content.production.workers.rarityPower[card.rarity] * cardStatPower(content, owned);
}

/** The power of the place's workers together: 1 with none (the plain level rate). */
export function placePower(state: GameState, content: Content, producerId: string): number {
  const ids = activeWorkers(state, content)[producerId];
  if (!ids || ids.length === 0) return 1;
  return ids.reduce((sum, id) => sum + workerPower(content, id, state.cards.owned[id]!), 0);
}

/** The scope a worker's ability and enhancements act in: its job and its own place. */
export function workerScope(job: ProductionJob, producerId: string): ModifierScope {
  return { job, producer: producerId };
}

/** A modifier made `power` times as strong: flat and percent values scale, a mult its part above 1. */
function boost(m: Modifier, power: Modifier['value']): Modifier {
  if (m.kind === 'flat' || m.kind === 'percent') return { ...m, value: m.value.mul(power) };
  if (m.kind === 'mult') return { ...m, value: m.value.sub(1).mul(power).add(1) };
  return m;
}

/**
 * The worker abilities at work (DESIGN.md §4 Worker abilities): each active worker's ability,
 * scoped to its own place (source `card`), made stronger by the job's `card.supportPower`
 * upgrades (Lumberjack Pact, Miner Pact). Read by `collectModifiers` through `cardModifiers`.
 */
export function workerModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  const powers: Partial<Record<ProductionJob, Modifier['value']>> = {};
  for (const [place, ids] of Object.entries(activeWorkers(state, content))) {
    const job = producerJob(content, place)!;
    const power = (powers[job] ??= supportPower(state, content, job));
    for (const id of ids) {
      const card = content.cardById.get(id) as WorkerCard;
      for (const m of card.worker.modifiers) {
        const mod: Modifier = {
          ...m,
          scope: { ...m.scope, ...workerScope(job, place) },
          source: { kind: 'card', id },
        };
        out.push(power.eq(1) ? mod : boost(mod, power));
      }
      out.push(...workerElementModifier(content, id, place, workerScope(job, place)));
    }
  }
  return out;
}
