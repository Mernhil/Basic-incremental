import type {
  Card,
  CardModifierData,
  Content,
  Dungeon,
  ItemKind,
  Job,
  ModifierData,
  Rank,
  UniqueItemKind,
} from '../data';
import { JOBS, MAX_STARS, RANK_TIERS } from '../data/schemas';
import { accountLevel } from './account';
import { metalOf } from './mastery';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { finalPrice, pay, type Price } from './production';
import type { CardGain, TickReport, TierUp } from './report';
import {
  cloneState,
  newOwnedCard,
  SUPPORT_SLOTS,
  type CardLoadout,
  type CardState,
  type GameState,
  type OwnedCard,
} from './state';

/**
 * Cards (DESIGN.md 5, 11.2, 11.4, 11.9): a collection of owned cards with tier, stars, level and
 * XP; one loadout per job (1 main + 3 supports) under a cost cap; star-ups, tier-ups, shards and
 * card drops. Card effects reach the game only as modifiers (source kind `card`) through
 * `collectModifiers`. Every progression number is in cardRules.json.
 *
 * Every function is pure: state changes return a new state. Functions that need modifiers take
 * them as an optional last argument (pass `collectModifiers(state, content)` once when calling
 * several in a row).
 */

export type { Job };
export type CardRole = 'main' | 'support';
/** A loadout slot: the main card or support slot 0, 1 or 2. */
export type LoadoutSlot = 'main' | number;

export type CardFailure =
  /** No card with that id. */
  | 'unknown'
  /** The card is not in the collection. */
  | 'not-owned'
  /** The card belongs to another job's loadout. */
  | 'wrong-job'
  /** The loadout would hold the same card twice. */
  | 'duplicate'
  /** The loadout would cost more than the job's cost cap. */
  | 'over-cost-cap'
  /** Not a valid slot. */
  | 'invalid-slot'
  /** No star-up (already ★6) or no tier-up (below ★6 or already Prismatic) from this rank. */
  | 'unavailable'
  /** At least one requirement of the star-up / tier-up is not met. */
  | 'requirements';

export type CardResult = { ok: true; state: GameState } | { ok: false; reason: CardFailure };
/** A star-up or tier-up: like CardResult, plus the tier-up moments it caused (a new card tier,
 *  the unique evolution). */
export type CardUpgradeResult =
  { ok: true; state: GameState; tierUps: TierUp[] } | { ok: false; reason: CardFailure };

const fail = (reason: CardFailure): { ok: false; reason: CardFailure } => ({ ok: false, reason });

// ---- ranks, levels and power -----------------------------------------------------------------

export function cardRank(owned: OwnedCard): Rank {
  return { tier: owned.tier, stars: owned.stars };
}

/** Whether `rank` is at least `min` (tier first, then stars). */
export function rankAtLeast(rank: Rank, min: Rank): boolean {
  const t = RANK_TIERS.indexOf(rank.tier) - RANK_TIERS.indexOf(min.tier);
  return t > 0 || (t === 0 && rank.stars >= min.stars);
}

/** The item drawn inside a card (DESIGN.md 13, 16 E6). */
export interface CardItem {
  kind: ItemKind | UniqueItemKind;
  name: string;
  /** True for a unique evolution. */
  unique: boolean;
}

/** The item to draw for a card at its rank: its unique evolution from the evolution rank (Gold
 *  ★6) on, else its generic item. Not owned = the generic item. Null for unknown ids. */
export function cardItem(
  content: Content,
  cardId: string,
  owned: OwnedCard | null | undefined,
): CardItem | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  const evo = content.progression.evolutions;
  const unique = card.evolution ? evo.items.find((i) => i.kind === card.evolution) : undefined;
  if (unique && owned && rankAtLeast(cardRank(owned), evo.from)) {
    return { kind: unique.kind, name: unique.name, unique: true };
  }
  return { kind: card.item.kind, name: card.item.name, unique: false };
}

/** Just the item kind to draw (see cardItem). Null for unknown ids. */
export function cardItemKind(
  content: Content,
  cardId: string,
  owned: OwnedCard | null | undefined,
): ItemKind | UniqueItemKind | null {
  return cardItem(content, cardId, owned)?.kind ?? null;
}

/** A card tier as a metal index on the ladder (bronze 1 .. prismatic 4). */
function tierMetalIndex(tier: OwnedCard['tier']): number {
  return RANK_TIERS.indexOf(tier) + 1;
}

/** The evolution moment if the card's item became unique between two ranks. */
function evolutionTierUps(
  content: Content,
  cardId: string,
  before: OwnedCard,
  after: OwnedCard,
): TierUp[] {
  const was = cardItem(content, cardId, before)?.unique ?? false;
  const now = cardItem(content, cardId, after)?.unique ?? false;
  return !was && now
    ? [
        {
          kind: 'evolution',
          id: cardId,
          from: 0,
          to: 1,
          metal: metalOf(tierMetalIndex(after.tier)),
        },
      ]
    : [];
}

/** Prismatic ★6, the top rank for now. */
export function isMaxRank(owned: OwnedCard): boolean {
  return owned.tier === RANK_TIERS[RANK_TIERS.length - 1] && owned.stars >= MAX_STARS;
}

/** Level cap of a rank (cardRules.levelCaps). */
export function levelCap(content: Content, rank: Rank): number {
  const caps = content.cardRules.levelCaps[rank.tier];
  return caps[Math.min(Math.max(rank.stars, 1), MAX_STARS) - 1]!;
}

/** XP needed to go from `level` to `level + 1`: base × growth^(level − 1). */
export function xpToNextLevel(content: Content, level: number): Decimal {
  const { base, growth } = content.cardRules.xpCurve;
  return base.mul(growth.pow(Math.max(0, level - 1)));
}

/**
 * The card's power: (1 + perLevel × (level − 1)) × (1 + perStar × (stars − 1), plus star6Bonus
 * at ★6) × the tier's multiplier. 1 for a Bronze ★1 Lv 1 card.
 */
export function cardPower(content: Content, owned: OwnedCard): number {
  const p = content.cardRules.power;
  const levelPart = 1 + p.perLevel * (owned.level - 1);
  const starPart =
    1 + p.perStar * (owned.stars - 1) + (owned.stars >= MAX_STARS ? p.star6Bonus : 0);
  return levelPart * starPart * p.tier[owned.tier];
}

/**
 * A card's health (DESIGN.md 11.10): its rarity's base health × its power, so it grows with
 * level, stars and tier like its bonuses. 0 for unknown ids. The fight side sums the loadout.
 */
export function cardHealth(content: Content, cardId: string, owned: OwnedCard): Decimal {
  const card = content.cardById.get(cardId);
  if (!card) return new Decimal(0);
  return content.cardRules.health[card.rarity].mul(cardPower(content, owned));
}

/**
 * Levels a card up while its XP allows (mutates it). XP stops at the level cap: a card at its cap
 * keeps 0 XP until a star-up or tier-up raises the cap. Returns the levels before and after, or
 * null when the level did not change.
 */
function levelUp(content: Content, owned: OwnedCard): { from: number; to: number } | null {
  const cap = levelCap(content, cardRank(owned));
  const from = owned.level;
  let xp = owned.xp;
  while (owned.level < cap) {
    const need = xpToNextLevel(content, owned.level);
    if (xp.lt(need)) break;
    xp = xp.sub(need);
    owned.level += 1;
  }
  owned.xp = owned.level >= cap ? new Decimal(0) : xp;
  return owned.level === from ? null : { from, to: owned.level };
}

/** True when the card has enough XP for its next level (it levels up at the next settle). */
export function hasPendingLevel(content: Content, owned: OwnedCard): boolean {
  return (
    owned.level < levelCap(content, cardRank(owned)) &&
    owned.xp.gte(xpToNextLevel(content, owned.level))
  );
}

/**
 * Applies pending level-ups of every owned card (mutates `state`, a fresh clone owned by the
 * caller) and records them. The game loop calls this only on whole seconds of play time
 * (CARD_LEVEL_STEP_MS), so card levels, and the modifiers they give, change at the same moments
 * however time is split into steps.
 */
export function settleCardLevels(state: GameState, content: Content, report: TickReport): void {
  for (const [id, owned] of Object.entries(state.cards.owned)) {
    const change = levelUp(content, owned);
    if (!change) continue;
    const prev = report.cardLevels[id];
    report.cardLevels[id] = { from: prev?.from ?? change.from, to: change.to };
  }
}

// ---- cost and loadouts -----------------------------------------------------------------------

/** Loadout cost of a card, by rarity (11.4). 0 for unknown ids. */
export function cardCost(content: Content, cardId: string): number {
  const card = content.cardById.get(cardId);
  return card ? content.cardRules.cost[card.rarity] : 0;
}

/** Each job's cost cap: base + perLevel × (account level − 1), through `loadout.costCap`. */
export function loadoutCostCap(
  state: GameState,
  content: Content,
  job: Job,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number {
  const { base, perLevel } = content.cardRules.costCap;
  const value = base + perLevel * (accountLevel(state) - 1);
  return Math.max(
    0,
    Math.floor(statValue('loadout.costCap', value, modifiers, { job }).toNumber()),
  );
}

/** Card ids of a loadout, main first, without empty slots. */
export function loadoutCards(loadout: CardLoadout): string[] {
  return [loadout.main, ...loadout.supports].filter((id): id is string => id !== null);
}

/** Total cost of the cards in a loadout. */
export function loadoutCost(content: Content, loadout: CardLoadout): number {
  return loadoutCards(loadout).reduce((sum, id) => sum + cardCost(content, id), 0);
}

/** Where a card sits in the loadouts, or null. */
export function loadoutSlotOf(
  state: GameState,
  cardId: string,
): { job: Job; slot: LoadoutSlot } | null {
  for (const job of JOBS) {
    const loadout = state.cards.loadouts[job];
    if (loadout.main === cardId) return { job, slot: 'main' };
    const index = loadout.supports.indexOf(cardId);
    if (index >= 0) return { job, slot: index };
  }
  return null;
}

/**
 * Why a loadout cannot be saved for this job, or null when it can: every card exists, is owned,
 * belongs to the job and appears once; the total cost fits the cap; there are 3 support slots.
 */
export function loadoutProblem(
  state: GameState,
  content: Content,
  job: Job,
  loadout: CardLoadout,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardFailure | null {
  if (loadout.supports.length !== SUPPORT_SLOTS) return 'invalid-slot';
  const ids = loadoutCards(loadout);
  for (const id of ids) {
    const card = content.cardById.get(id);
    if (!card) return 'unknown';
    if (!state.cards.owned[id]) return 'not-owned';
    if (card.job !== job) return 'wrong-job';
  }
  if (new Set(ids).size !== ids.length) return 'duplicate';
  if (loadoutCost(content, loadout) > loadoutCostCap(state, content, job, modifiers)) {
    return 'over-cost-cap';
  }
  return null;
}

/** Replaces a job's whole loadout (main + 3 supports) after checking it. */
export function setLoadout(
  state: GameState,
  content: Content,
  job: Job,
  loadout: CardLoadout,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardResult {
  const problem = loadoutProblem(state, content, job, loadout, modifiers);
  if (problem) return fail(problem);
  const next = cloneState(state);
  next.cards.loadouts[job] = { main: loadout.main, supports: [...loadout.supports] };
  return { ok: true, state: next };
}

/**
 * Puts a card in one slot of its job's loadout, or empties the slot with `cardId` null. A card
 * already in another slot of the same loadout moves, swapping with what was in the target slot.
 */
export function setLoadoutSlot(
  state: GameState,
  content: Content,
  job: Job,
  slot: LoadoutSlot,
  cardId: string | null,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardResult {
  if (slot !== 'main' && !(Number.isInteger(slot) && slot >= 0 && slot < SUPPORT_SLOTS)) {
    return fail('invalid-slot');
  }
  const current = state.cards.loadouts[job];
  const loadout: CardLoadout = { main: current.main, supports: [...current.supports] };
  const read = (s: LoadoutSlot): string | null =>
    s === 'main' ? loadout.main : (loadout.supports[s] ?? null);
  const write = (s: LoadoutSlot, id: string | null): void => {
    if (s === 'main') loadout.main = id;
    else loadout.supports[s] = id;
  };
  if (cardId !== null) {
    const from: LoadoutSlot | null =
      loadout.main === cardId ? 'main' : loadout.supports.indexOf(cardId);
    if (from !== null && from !== -1) write(from, read(slot));
  }
  write(slot, cardId);
  return setLoadout(state, content, job, loadout, modifiers);
}

// ---- effects ---------------------------------------------------------------------------------

/** A card modifier at this power: `full` bonuses grow with it, `none` stay as written. */
export function scaleCardModifier(m: CardModifierData, power: number): ModifierData {
  const { scale, ...data } = m;
  if (scale === 'none') return data;
  if (m.kind === 'flat' || m.kind === 'percent') return { ...data, value: m.value.mul(power) };
  if (m.kind === 'mult') return { ...data, value: m.value.sub(1).mul(power).add(1) };
  return data;
}

/**
 * The modifiers a card gives in a role at its current rank and level: its main ability plus the
 * job's main growth, or its support effect. Use it to preview a card in a slot.
 */
export function cardEffectModifiers(
  content: Content,
  cardId: string,
  role: CardRole,
  owned: OwnedCard,
): Modifier[] {
  const card = content.cardById.get(cardId);
  if (!card) return [];
  const power = cardPower(content, owned);
  const source = { kind: 'card' as const, id: cardId };
  const effect = role === 'main' ? card.main : card.support;
  const out: Modifier[] = effect.modifiers.map((m) => ({
    ...scaleCardModifier(m, power),
    source,
  }));
  if (role === 'main' && power > 1) {
    for (const m of content.cardRules.mainGrowth[card.job]) {
      out.push({ ...m, value: m.value.mul(power - 1), source });
    }
  }
  return out;
}

/** Every modifier from the cards in the three loadouts. Read by `collectModifiers`. */
export function cardModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const job of JOBS) {
    const loadout = state.cards.loadouts[job];
    const add = (id: string | null, role: CardRole): void => {
      if (id === null) return;
      const owned = state.cards.owned[id];
      if (!owned || content.cardById.get(id)?.job !== job) return;
      out.push(...cardEffectModifiers(content, id, role, owned));
    };
    add(loadout.main, 'main');
    for (const id of loadout.supports) add(id, 'support');
  }
  return out;
}

// ---- star-up and tier-up ---------------------------------------------------------------------

/** One line of a star-up / tier-up checklist. */
export interface Requirement {
  /** `level`: at the level cap; `duplicates`: copies held; `resource`: a material or resource. */
  kind: 'level' | 'duplicates' | 'resource';
  /** Resource id, for `resource`. */
  resource?: string;
  have: Decimal;
  need: Decimal;
  met: boolean;
}

export interface UpgradeCheck {
  /** False when there is no such step from the current rank (then `requirements` is empty). */
  available: boolean;
  /** The rank after the step, or null when unavailable. */
  to: Rank | null;
  requirements: Requirement[];
  /** Available and every requirement met. */
  met: boolean;
}

function requirement(
  kind: Requirement['kind'],
  have: Decimal | number,
  need: Decimal | number,
  resource?: string,
): Requirement {
  const h = new Decimal(have);
  const n = new Decimal(need);
  return { kind, ...(resource ? { resource } : {}), have: h, need: n, met: h.gte(n) };
}

function check(to: Rank | null, requirements: Requirement[]): UpgradeCheck {
  if (!to) return { available: false, to: null, requirements: [], met: false };
  return { available: true, to, requirements, met: requirements.every((r) => r.met) };
}

function levelRequirement(content: Content, owned: OwnedCard): Requirement {
  return requirement('level', owned.level, levelCap(content, cardRank(owned)));
}

function resourceRequirements(state: GameState, prices: Price[]): Requirement[] {
  return prices.map((p) =>
    requirement('resource', state.resources[p.resource] ?? 0, p.amount, p.resource),
  );
}

/**
 * Star-up materials of the next star (DESIGN.md 11.9): the tier's Core, tree gems and mine gems,
 * each line scaled by the card's job share (rounded up, at least 1; a share of 0 leaves it out),
 * then through `cost.multiplier` (scope: job, resource).
 */
export function starUpCost(
  content: Content,
  card: Card,
  owned: OwnedCard,
  modifiers: readonly Modifier[] = [],
): Price[] {
  if (owned.stars >= MAX_STARS) return [];
  const prices: Price[] = [];
  for (const line of content.cardRules.starUp.tiers[owned.tier]) {
    const share = line.jobShare?.[card.job] ?? 1;
    if (share <= 0) continue;
    const base = line.amounts[owned.stars - 1]!;
    const amount = share === 1 ? base : Decimal.max(base.mul(share).ceil(), 1);
    prices.push(finalPrice(line.resource, amount, modifiers, { job: card.job }));
  }
  return prices;
}

/** Tier-up costs from the current tier (through `cost.multiplier`, scope: job, resource). */
export function tierUpCost(
  content: Content,
  card: Card,
  owned: OwnedCard,
  modifiers: readonly Modifier[] = [],
): Price[] {
  if (owned.tier === 'prismatic') return [];
  return content.cardRules.tierUp[owned.tier][card.job].map((c) =>
    finalPrice(c.resource, c.amount, modifiers, { job: card.job }),
  );
}

/** Star-up checklist (★n → ★n+1): duplicates, level cap, the tier's Core. Null if not owned. */
export function starUpCheck(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): UpgradeCheck | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  if (owned.stars >= MAX_STARS) return check(null, []);
  return check({ tier: owned.tier, stars: owned.stars + 1 }, [
    requirement('duplicates', owned.duplicates, content.cardRules.starUp.duplicates),
    levelRequirement(content, owned),
    ...resourceRequirements(state, starUpCost(content, card, owned, modifiers)),
  ]);
}

/** Tier-up checklist (★6 → next tier ★1): level cap, Cores, tree and mine gems and Frost Sigils. Null if not
 *  owned. Unavailable below ★6 and at Prismatic. */
export function tierUpCheck(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): UpgradeCheck | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  const nextTier = RANK_TIERS[RANK_TIERS.indexOf(owned.tier) + 1];
  if (owned.stars < MAX_STARS || !nextTier) return check(null, []);
  return check({ tier: nextTier, stars: 1 }, [
    levelRequirement(content, owned),
    ...resourceRequirements(state, tierUpCost(content, card, owned, modifiers)),
  ]);
}

/** Spends a duplicate and the Core and adds a star. Level and XP stay; the cap rises. */
export function starUp(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardUpgradeResult {
  const result = starUpCheck(state, content, cardId, modifiers);
  if (!result) return fail(content.cardById.has(cardId) ? 'not-owned' : 'unknown');
  if (!result.available) return fail('unavailable');
  if (!result.met) return fail('requirements');
  const card = content.cardById.get(cardId)!;
  const before = state.cards.owned[cardId]!;
  const next = pay(state, starUpCost(content, card, before, modifiers));
  const owned = next.cards.owned[cardId]!;
  owned.duplicates -= content.cardRules.starUp.duplicates;
  owned.stars += 1;
  return { ok: true, state: next, tierUps: evolutionTierUps(content, cardId, before, owned) };
}

/** Pays the tier-up costs and moves the card to the next tier at ★1. Level and XP carry over. */
export function tierUp(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardUpgradeResult {
  const result = tierUpCheck(state, content, cardId, modifiers);
  if (!result) return fail(content.cardById.has(cardId) ? 'not-owned' : 'unknown');
  if (!result.available) return fail('unavailable');
  if (!result.met) return fail('requirements');
  const card = content.cardById.get(cardId)!;
  const before = state.cards.owned[cardId]!;
  const next = pay(state, tierUpCost(content, card, before, modifiers));
  const owned = next.cards.owned[cardId]!;
  owned.tier = result.to!.tier;
  owned.stars = 1;
  const from = tierMetalIndex(before.tier);
  const to = tierMetalIndex(owned.tier);
  const tierUps: TierUp[] = [{ kind: 'card_tier', id: cardId, from, to, metal: metalOf(to) }];
  return {
    ok: true,
    state: next,
    tierUps: [...tierUps, ...evolutionTierUps(content, cardId, before, owned)],
  };
}

// ---- gaining cards ---------------------------------------------------------------------------

/** Adds one copy to a card collection (mutates it): new card, duplicate, or shards at max rank.
 *  Used by `addCard` and the summon portals. */
export function grantCard(cards: CardState, content: Content, card: Card): CardGain {
  const owned = cards.owned[card.id];
  if (!owned) {
    cards.owned[card.id] = newOwnedCard();
    return { kind: 'new' };
  }
  if (isMaxRank(owned)) {
    const shards = content.cardRules.shards[card.rarity];
    cards.shards += shards;
    return { kind: 'shards', shards };
  }
  owned.duplicates += 1;
  return { kind: 'duplicate', duplicates: owned.duplicates };
}

/** Adds one copy of a card (from a drop or a summon). Null for unknown ids. */
export function addCard(
  state: GameState,
  content: Content,
  cardId: string,
): { state: GameState; gain: CardGain } | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  const next = cloneState(state);
  return { state: next, gain: grantCard(next.cards, content, card) };
}

// ---- XP from doing the job (called while advancing) ------------------------------------------

/** XP each fighting card in the loadout gets per boss kill in this dungeon (`xp.card`). */
export function fightingXpPerKill(
  content: Content,
  dungeon: Dungeon,
  modifiers: readonly Modifier[] = [],
): Decimal {
  const { perKill, tierGrowth } = content.cardRules.xp;
  const base = perKill.mul(tierGrowth.pow(dungeon.tier - 1));
  const ctx = { job: 'fighting' as const, dungeon: dungeon.id };
  return Decimal.max(statValue('xp.card', base, modifiers, ctx), 0);
}

/** XP each logging / mining card in the loadout gets per unit harvested (`xp.card`). */
export function productionXpPerUnit(
  content: Content,
  job: 'logging' | 'mining',
  modifiers: readonly Modifier[] = [],
): Decimal {
  const base = content.cardRules.xp.perUnit[job];
  return Decimal.max(statValue('xp.card', base, modifiers, { job }), 0);
}

/**
 * Gives `amount` XP to every card in the job's loadout (mutates `state`, a fresh clone owned by
 * the caller). Cards at their level cap gain nothing. Level-ups wait for `settleCardLevels`.
 */
export function grantLoadoutXp(
  state: GameState,
  content: Content,
  job: Job,
  amount: Decimal,
): void {
  if (amount.lte(0)) return;
  for (const id of new Set(loadoutCards(state.cards.loadouts[job]))) {
    const owned = state.cards.owned[id];
    if (!owned || content.cardById.get(id)?.job !== job) continue;
    if (owned.level >= levelCap(content, cardRank(owned))) owned.xp = new Decimal(0);
    else owned.xp = owned.xp.add(amount);
  }
}

// ---- views for the UI ------------------------------------------------------------------------

export interface CardInfo {
  card: Card;
  /** Null when the card is not in the collection. */
  owned: OwnedCard | null;
  rank: Rank | null;
  levelCap: number | null;
  /** XP needed for the next level; null when not owned or at the level cap. */
  xpToNext: Decimal | null;
  /** 1 for a Bronze ★1 Lv 1 card; scales its bonuses. */
  power: number;
  cost: number;
  /** Where the card sits, or null. */
  slot: { job: Job; slot: LoadoutSlot } | null;
  maxRank: boolean;
  starUp: UpgradeCheck | null;
  tierUp: UpgradeCheck | null;
  /** Its effect as main / as support at the current power (Bronze ★1 Lv 1 when not owned). */
  mainModifiers: Modifier[];
  supportModifiers: Modifier[];
}

/** Everything the Cards page shows for one card. Null for unknown ids. */
export function cardInfo(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardInfo | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  const owned = state.cards.owned[cardId] ?? null;
  const preview = owned ?? newOwnedCard();
  const rank = owned ? cardRank(owned) : null;
  const cap = rank ? levelCap(content, rank) : null;
  return {
    card,
    owned,
    rank,
    levelCap: cap,
    xpToNext:
      owned && cap !== null && owned.level < cap ? xpToNextLevel(content, owned.level) : null,
    power: cardPower(content, preview),
    cost: cardCost(content, cardId),
    slot: loadoutSlotOf(state, cardId),
    maxRank: owned ? isMaxRank(owned) : false,
    starUp: starUpCheck(state, content, cardId, modifiers),
    tierUp: tierUpCheck(state, content, cardId, modifiers),
    mainModifiers: cardEffectModifiers(content, cardId, 'main', preview),
    supportModifiers: cardEffectModifiers(content, cardId, 'support', preview),
  };
}

/** Every card in content order (owned or not), optionally for one job. */
export function cardCollection(
  state: GameState,
  content: Content,
  job?: Job,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardInfo[] {
  return content.cards
    .filter((c) => job === undefined || c.job === job)
    .map((c) => cardInfo(state, content, c.id, modifiers)!);
}

export interface LoadoutInfo {
  job: Job;
  main: string | null;
  supports: (string | null)[];
  cost: number;
  cap: number;
}

/** A job's loadout with its cost and cap. */
export function loadoutInfo(
  state: GameState,
  content: Content,
  job: Job,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): LoadoutInfo {
  const loadout = state.cards.loadouts[job];
  return {
    job,
    main: loadout.main,
    supports: [...loadout.supports],
    cost: loadoutCost(content, loadout),
    cap: loadoutCostCap(state, content, job, modifiers),
  };
}
