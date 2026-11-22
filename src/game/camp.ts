import type { Content, ProductionJob } from '../data';
import { cardStatPower } from './cards';
import { challengeWorkerLimit } from './challenges';
import { workerElementModifier } from './elements';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import {
  canAfford,
  finalPrice,
  isProducerUnlocked,
  pay,
  producersOf,
  unlockedProducers,
  type Price,
  type Producer,
} from './production';
import { cloneState, isOnTrip, type CampSlot, type GameState, type OwnedCard } from './state';

/**
 * The base camp (DESIGN.md section 2 Base camp): one camp level, paid in woods and ores, opens
 * farming slots in the forest (woods, axe cards) and the cave (ores, pickaxe cards) and lifts what
 * every slot brings. A slot farms one chosen material with one card on it; the stock fills by
 * itself through the tick, offline too. A card is in one slot at a time, never also in the
 * fighting loadout (a farming card is a logging or mining card, and the loadout holds fighting
 * cards), and never also at the forge or away on an expedition.
 *
 * Every function is pure: state changes return a new state. Every number goes through the
 * modifier pipeline (`production.rate` for what a slot brings, `cost.multiplier` for the level).
 */

export const CAMP_PLACES = ['forest', 'cave'] as const;
export type CampPlace = (typeof CAMP_PLACES)[number];

/** The job of a place's cards and materials: the forest is logging, the cave mining. */
export function placeJob(place: CampPlace): ProductionJob {
  return place === 'forest' ? 'logging' : 'mining';
}

export type CampFailure =
  | 'unknown'
  /** The slot is not open (past the open count). */
  | 'slot-locked'
  /** The material is not open yet (its dungeon is not cleared). */
  | 'material-locked'
  | 'not-owned'
  /** A mining card in the forest or a logging card in the cave, or a fighting card. */
  | 'wrong-job'
  /** The card is away on an expedition. */
  | 'on-expedition'
  | 'unaffordable';

export type CampResult = { ok: true; state: GameState } | { ok: false; reason: CampFailure };
const fail = (reason: CampFailure): CampResult => ({ ok: false, reason });

export function campLevel(state: GameState): number {
  return Math.max(1, Math.floor(state.camp.level));
}

// ---- slots -----------------------------------------------------------------------------------

/** Slots the Starlight item granting `camp_slots` has added to each place. */
export function starlightSlots(state: GameState, content: Content): number {
  const item = content.prestige.shop.find((i) => i.grants === 'camp_slots');
  if (!item) return 0;
  const level = Math.min(Math.max(0, state.prestige.shop[item.id] ?? 0), item.maxLevel);
  return level * content.camp.starlightSlotsPerLevel;
}

/** Slots the camp level alone opens in a place (the last table row at or below the level). */
export function levelSlots(content: Content, place: CampPlace, level: number): number {
  let open = 0;
  for (const row of content.camp.slots) if (row.level <= level) open = row[place];
  return open;
}

/** How many slots of a place are open: the camp level's, plus the Starlight item's. */
export function openSlots(state: GameState, content: Content, place: CampPlace): number {
  return levelSlots(content, place, campLevel(state)) + starlightSlots(state, content);
}

/** The slot at `index` (an empty slot when it was never filled). */
export function slotAt(state: GameState, place: CampPlace, index: number): CampSlot {
  return state.camp[place][index] ?? { material: null, card: null };
}

/** The material a slot farms: its chosen one when open, else the first open one of the place. */
export function slotMaterial(
  state: GameState,
  content: Content,
  place: CampPlace,
  index: number,
): Producer | null {
  const job = placeJob(place);
  const chosen = slotAt(state, place, index).material;
  if (chosen && isProducerUnlocked(state, content, job, chosen)) {
    return producersOf(content, job).find((p) => p.id === chosen) ?? null;
  }
  return unlockedProducers(state, content, job)[0] ?? null;
}

/** A card working a slot that counts: owned, of the place's job, not away, once, in an open slot. */
export interface SlotWorker {
  place: CampPlace;
  index: number;
  card: string;
  material: Producer;
}

function validCard(state: GameState, content: Content, place: CampPlace, id: string): boolean {
  const card = content.cardById.get(id);
  return !!card && card.job === placeJob(place) && !!state.cards.owned[id] && !isOnTrip(state, id);
}

/**
 * The cards that farm now, forest first, in slot order. A card that is gone, away, of the wrong
 * job, repeated, in a closed slot or past an Ascension challenge's worker limit is left out, so
 * nothing broken stays assigned.
 */
export function slotWorkers(state: GameState, content: Content): SlotWorker[] {
  const out: SlotWorker[] = [];
  const seen = new Set<string>();
  const limit = challengeWorkerLimit(state, content) ?? Infinity;
  for (const place of CAMP_PLACES) {
    const open = openSlots(state, content, place);
    for (let index = 0; index < open && out.length < limit; index += 1) {
      const slot = slotAt(state, place, index);
      if (!slot.card || seen.has(slot.card) || !validCard(state, content, place, slot.card)) {
        continue;
      }
      const material = slotMaterial(state, content, place, index);
      if (!material) continue;
      seen.add(slot.card);
      out.push({ place, index, card: slot.card, material });
    }
  }
  return out;
}

/** Cards working a slot now. */
export function workersUsed(state: GameState, content: Content): number {
  return slotWorkers(state, content).length;
}

/** The slot a card works, or null. */
export function slotOfCard(
  state: GameState,
  content: Content,
  cardId: string,
): { place: CampPlace; index: number } | null {
  const worker = slotWorkers(state, content).find((w) => w.card === cardId);
  return worker ? { place: worker.place, index: worker.index } : null;
}

/** The slot a card is assigned to, working or not (for taking it off before moving it). */
function assignedSlot(
  state: GameState,
  cardId: string,
): { place: CampPlace; index: number } | null {
  for (const place of CAMP_PLACES) {
    const index = state.camp[place].findIndex((s) => s.card === cardId);
    if (index >= 0) return { place, index };
  }
  return null;
}

function setSlot(
  state: GameState,
  place: CampPlace,
  index: number,
  patch: Partial<CampSlot>,
): void {
  const slots = state.camp[place];
  while (slots.length <= index) slots.push({ material: null, card: null });
  slots[index] = { ...slots[index]!, ...patch };
}

/**
 * Puts a card on a slot, or with `cardId` null takes the slot's card off. A card is in one slot at
 * a time: it leaves any other slot or the forge; the card it replaces goes back to the
 * collection. Needs the slot open and a card of the place's job, owned and not away.
 */
export function assignSlotCard(
  state: GameState,
  content: Content,
  place: CampPlace,
  index: number,
  cardId: string | null,
): CampResult {
  if (!Number.isInteger(index) || index < 0) return fail('unknown');
  if (index >= openSlots(state, content, place)) return fail('slot-locked');
  const next = cloneState(state);
  if (cardId === null) {
    setSlot(next, place, index, { card: null });
    return { ok: true, state: next };
  }
  const card = content.cardById.get(cardId);
  if (!card) return fail('unknown');
  if (!state.cards.owned[cardId]) return fail('not-owned');
  if (card.job !== placeJob(place)) return fail('wrong-job');
  if (isOnTrip(state, cardId)) return fail('on-expedition');
  const from = assignedSlot(next, cardId);
  if (from) setSlot(next, from.place, from.index, { card: null });
  if (next.production.forge.worker === cardId) next.production.forge.worker = null;
  setSlot(next, place, index, { card: cardId });
  return { ok: true, state: next };
}

/** Chooses what a slot farms. The material must be of the place and open. */
export function setSlotMaterial(
  state: GameState,
  content: Content,
  place: CampPlace,
  index: number,
  materialId: string,
): CampResult {
  if (!Number.isInteger(index) || index < 0) return fail('unknown');
  if (index >= openSlots(state, content, place)) return fail('slot-locked');
  const job = placeJob(place);
  if (!producersOf(content, job).some((p) => p.id === materialId)) return fail('unknown');
  if (!isProducerUnlocked(state, content, job, materialId)) return fail('material-locked');
  const next = cloneState(state);
  setSlot(next, place, index, { material: materialId });
  return { ok: true, state: next };
}

// ---- the camp level ----------------------------------------------------------------------------

/**
 * What the next camp level costs: each `levelCost` line from its `fromLevel` on, base x growth to
 * the power of the levels bought, through `cost.multiplier`.
 */
export function campLevelCost(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Price[] {
  const level = campLevel(state);
  const bought = Math.max(0, level - content.camp.startLevel);
  return content.camp.levelCost
    .filter((line) => line.fromLevel <= level)
    .map((line) =>
      finalPrice(line.resource, line.base.mul(line.growth.pow(bought)), modifiers, {
        resource: line.resource,
      }),
    );
}

/** Raises the camp one level, paid in woods and ores. */
export function upgradeCamp(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CampResult {
  const prices = campLevelCost(state, content, modifiers);
  if (!canAfford(state, prices)) return fail('unaffordable');
  const next = pay(state, prices);
  next.camp.level = campLevel(state) + 1;
  return { ok: true, state: next };
}

// ---- what a slot brings ------------------------------------------------------------------------

/**
 * A card's farming power: its tier's number (`production.json` `workers.tierPower`) times its
 * level and star power. 0 for an unknown card.
 */
export function workerPower(content: Content, cardId: string, owned: OwnedCard): number {
  const card = content.cardById.get(cardId);
  if (!card) return 0;
  return (
    content.production.workers.tierPower[card.tier === 'heirloom' ? 'mythic' : card.tier] *
    cardStatPower(content, owned)
  );
}

/** The camp's lift on every slot: 1 plus `yieldPercentPerLevel` percent per level above 1. */
export function campYieldFactor(state: GameState, content: Content): Decimal {
  return content.camp.yieldPercentPerLevel
    .mul(Math.max(0, campLevel(state) - 1))
    .div(100)
    .add(1);
}

/** The scope a slot's output, its card's ability and its element bonus act in. */
export function workerScope(place: CampPlace, material: Producer): NonNullable<Modifier['scope']> {
  return { job: placeJob(place), producer: material.id };
}

/**
 * The farming cards' own abilities and element bonuses, scoped to their material (source `card` or
 * `element`). Read by `collectModifiers` through `cardModifiers`.
 */
export function workerModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const worker of slotWorkers(state, content)) {
    const card = content.cardById.get(worker.card);
    if (!card || card.job === 'fighting') continue;
    const scope = workerScope(worker.place, worker.material);
    for (const m of card.worker.modifiers) {
      out.push({
        ...m,
        scope: { ...m.scope, ...scope },
        source: { kind: 'card', id: worker.card },
      });
    }
    out.push(...workerElementModifier(content, worker.card, worker.material.id, scope));
  }
  return out;
}

/**
 * One slot's output per second: the material's base rate times the camp's lift and the card's
 * power, through `production.rate`.
 */
export function slotRate(
  state: GameState,
  content: Content,
  worker: SlotWorker,
  modifiers: readonly Modifier[],
): Decimal {
  const owned = state.cards.owned[worker.card];
  if (!owned) return new Decimal(0);
  const base = worker.material.baseRate
    .mul(campYieldFactor(state, content))
    .mul(workerPower(content, worker.card, owned));
  return Decimal.max(
    statValue('production.rate', base, modifiers, {
      ...workerScope(worker.place, worker.material),
      resource: worker.material.resource,
    }),
    0,
  );
}

/** Every farming slot's output per second, in `slotWorkers` order. */
export function slotRates(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): { worker: SlotWorker; rate: Decimal }[] {
  return slotWorkers(state, content).map((worker) => ({
    worker,
    rate: slotRate(state, content, worker, modifiers),
  }));
}

/** Resource id -> gained per second by every farming slot together. */
export function campPerSecond(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const { worker, rate } of slotRates(state, content, modifiers)) {
    const resource = worker.material.resource;
    out[resource] = (out[resource] ?? new Decimal(0)).add(rate);
  }
  return out;
}

/** The material a card farms now (its id), or null: where the card detail says it works. */
export function workplaceOf(state: GameState, content: Content, cardId: string): string | null {
  return slotWorkers(state, content).find((w) => w.card === cardId)?.material.id ?? null;
}

/**
 * What one slot of a material brings per second with a power-1 card at the current camp level,
 * through `production.rate`. Expedition gem rewards are seconds of this.
 */
export function materialRate(
  state: GameState,
  content: Content,
  material: Producer,
  modifiers: readonly Modifier[],
): Decimal {
  const place: CampPlace = content.treeById.has(material.id) ? 'forest' : 'cave';
  return Decimal.max(
    statValue(
      'production.rate',
      material.baseRate.mul(campYieldFactor(state, content)),
      modifiers,
      { ...workerScope(place, material), resource: material.resource },
    ),
    0,
  );
}
