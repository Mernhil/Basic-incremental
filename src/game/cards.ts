import type {
  Card,
  CardModifierData,
  Content,
  Dungeon,
  ItemKind,
  Job,
  ModifierData,
  ModifierScope,
  Rank,
  RankTier,
  Rarity,
  Trial,
} from '../data';
import { MAX_STARS, RANK_TIERS, RARITIES } from '../data/schemas';
import { accountLevel } from './account';
import { metalOf } from './mastery';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { finalPrice, pay, type Price } from './production';
import { supportPower } from './upgrades';
import { activeWorkers, producerJob, workerModifiers, workerScope, workplaceOf } from './workers';
import type { CardGain, TickReport, TierUp } from './report';
import {
  cloneState,
  newOwnedCard,
  SUPPORT_SLOTS,
  type CardLoadout,
  type CardState,
  type GameState,
  type OwnedCard,
  isOnTrip,
} from './state';

/**
 * Cards (DESIGN.md §5): a collection of owned cards with tier, stars, level and
 * XP; the fighting loadout (1 main + 3 supports) under a cost cap (logging and mining cards are
 * workers instead, workers.ts); star-ups, tier-ups, shards and
 * card drops. Card effects reach the game only as modifiers (source kind `card`) through
 * `collectModifiers`. Every progression number is in cardRules.json.
 *
 * Every function is pure: state changes return a new state. Functions that need modifiers take
 * them as an optional last argument (pass `collectModifiers(state, content)` once when calling
 * several in a row).
 */

export type { Job };
export type CardRole = 'main' | 'support';
/** The one job with a loadout (DESIGN.md §5 Loadouts). */
export type LoadoutJob = 'fighting';
/** A loadout slot: the main card or support slot 0, 1 or 2. */
export type LoadoutSlot = 'main' | number;

export type CardFailure =
  /** No card with that id. */
  | 'unknown'
  /** The card is not in the collection. */
  | 'not-owned'
  /** The card is not a fighting card. */
  | 'wrong-job'
  /** The loadout would hold the same card twice. */
  | 'duplicate'
  /** The loadout would cost more than the job's cost cap. */
  | 'over-cost-cap'
  /** The card is away on an expedition (DESIGN.md §15). */
  | 'on-expedition'
  /** Not a valid slot. */
  | 'invalid-slot'
  /** No star-up (already ★6) or no tier-up (already at the card's top tier) from this rank. */
  | 'unavailable'
  /** At least one requirement of the star-up / tier-up is not met. */
  | 'requirements';

export type CardResult = { ok: true; state: GameState } | { ok: false; reason: CardFailure };
/** A star-up or tier-up: like CardResult, plus the tier-up moments it caused (a new card tier,
 *  the Heirloom). */
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

/** The item drawn inside a card (DESIGN.md §12, §5). */
export interface CardItem {
  kind: ItemKind;
  /** The item's name at the card's tier (items.json): "Wooden Sword", "Void Shadow Sword", "Nightfall". */
  name: string;
  /** True at the Heirloom tier. */
  heirloom: boolean;
  /** The item rarity to draw: the card's rarity moved up the ladder by its tier (weaponLookRarity). */
  rarity: Rarity;
}

/** The highest tier each rarity reaches before an Heirloom (DESIGN.md §5 "Rarity caps the tier"). */
export const RARITY_TIER_CAP: Record<Rarity, RankTier> = {
  common: 'wood',
  uncommon: 'bronze',
  rare: 'silver',
  epic: 'gold',
  legendary: 'prismatic',
  mythic: 'mythic',
  void: 'mythic',
};

/** On-screen name of each tier; the T6 tier reads "Void" for a Void card (see tierLabel). */
export const TIER_LABELS: Record<RankTier, string> = {
  wood: 'Wood',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
  mythic: 'Mythic',
  heirloom: 'Heirloom',
};

/** A tier's on-screen name for a card of a rarity: T6 is Mythic or Void by the card's side. */
export const tierLabel = (tier: RankTier, rarity?: Rarity): string =>
  tier === 'mythic' && rarity === 'void' ? 'Void' : TIER_LABELS[tier];

/** The side of a card's T6 and Heirloom: Mythic (heroic) or Void (villainous). */
export const cardSide = (rarity: Rarity): 'mythic' | 'void' =>
  rarity === 'void' ? 'void' : 'mythic';

/**
 * The name of an item type at a tier for a card of a rarity (DESIGN.md §5 "Item names"): T1 to T4
 * "<material> <type>", T5 "Prismatic <name> <type>", T6 by the card's side, then the Heirloom.
 * Pass the card as `card` and a card with its own Heirloom (`heirloomName` in cards.json, DESIGN.md
 * §5 More weapons from the Heirloom candidates) names it at the Heirloom tier; every other tier,
 * and every card without one, keeps the type's names.
 */
export function itemName(
  content: Content,
  kind: ItemKind,
  tier: RankTier,
  rarity: Rarity,
  card?: { heirloomName?: string },
): string {
  const type = content.itemTypeByKind.get(kind);
  if (!type) return kind;
  switch (tier) {
    case 'wood':
    case 'bronze':
    case 'silver':
    case 'gold':
      return `${content.items.materials[tier]} ${type.noun}`;
    case 'prismatic':
      return type.prismatic;
    case 'mythic':
      return type[cardSide(rarity)];
    case 'heirloom':
      return card?.heirloomName ?? type.heirloom[cardSide(rarity)];
  }
}

/**
 * The tier whose weapon art and name a card shows (user, 2026-11-11): its own. Every card starts
 * with its wooden weapon and each tier-up changes the picture and the name. The rarity no longer
 * lifts the look; it stays a parameter so callers keep one signature.
 */
export function lookTier(_rarity: Rarity, tier: RankTier): RankTier {
  return tier;
}

/**
 * Which of an item's looks inside its tier a card shows (DESIGN.md §5 Look steps by stars): 0 is
 * BASE, then +1, +2 and so on (Gold's last is FINAL). The thresholds are `lookSteps.json`; an item type
 * or a tier with no steps has the one look, and a tier-up restarts the stars, so it shows the new tier's BASE.
 */
export function lookStep(content: Content, kind: ItemKind, tier: RankTier, stars: number): number {
  const at = (
    content.lookSteps.steps as Partial<Record<RankTier, { stars: number[]; kinds: ItemKind[] }>>
  )[tier];
  if (!at?.kinds.includes(kind)) return 0;
  let step = 0;
  at.stars.forEach((min, i) => {
    if (stars >= min) step = i;
  });
  return step;
}

/**
 * The item rarity to draw for a card's rarity and tier (DESIGN.md §5 "Weapon looks, for now"):
 * one step up the rarity ladder per tier (Wood = the card's rarity, Bronze +1, ... Heirloom +6),
 * capped at Void. The art for an item type that has no new pictures yet is interim.
 */
export function weaponLookRarity(rarity: Rarity, tier: RankTier): Rarity {
  const at = RARITIES.indexOf(rarity) + RANK_TIERS.indexOf(tier);
  return RARITIES[Math.min(at, RARITIES.length - 1)]!;
}

/** The item to draw for a card at its rank: its type's item named for the tier, at the rarity
 *  its tier gives. Not owned = Wood. Null for unknown ids. */
export function cardItem(
  content: Content,
  cardId: string,
  owned: OwnedCard | null | undefined,
): CardItem | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  const tier = lookTier(card.rarity, owned?.tier ?? 'wood');
  const rarity = weaponLookRarity(card.rarity, tier);
  return {
    kind: card.item.kind,
    name: itemName(content, card.item.kind, tier, card.rarity, card),
    heirloom: tier === 'heirloom',
    rarity,
  };
}

/** Just the item kind to draw (see cardItem). Null for unknown ids. */
export function cardItemKind(
  content: Content,
  cardId: string,
  owned: OwnedCard | null | undefined,
): ItemKind | null {
  return cardItem(content, cardId, owned)?.kind ?? null;
}

/** A card tier as a metal index on the ladder (wood 0 = stone, bronze 1 .. prismatic 4; mythic and heirloom cap at prismatic). */
function tierMetalIndex(tier: OwnedCard['tier']): number {
  return RANK_TIERS.indexOf(tier);
}

/** The Heirloom moment if the card's item became its Heirloom between two ranks. */
function heirloomTierUps(
  content: Content,
  cardId: string,
  before: OwnedCard,
  after: OwnedCard,
): TierUp[] {
  const was = cardItem(content, cardId, before)?.heirloom ?? false;
  const now = cardItem(content, cardId, after)?.heirloom ?? false;
  return !was && now
    ? [
        {
          kind: 'heirloom',
          id: cardId,
          from: 0,
          to: 1,
          metal: metalOf(tierMetalIndex(after.tier)),
        },
      ]
    : [];
}

/** The highest tier a card can reach: its rarity's cap, plus the Heirloom for a Mythic or Void
 *  card whose item type has its Heirloom open (items.json). */
export function cardTopTier(content: Content, cardId: string): RankTier {
  const card = content.cardById.get(cardId);
  if (!card) return 'wood';
  const cap = RARITY_TIER_CAP[card.rarity];
  return cap === 'mythic' && content.itemTypeByKind.get(card.item.kind)?.heirloomOpen
    ? 'heirloom'
    : cap;
}

/** The tier after `tier` for this card, or null at its top tier. */
function nextTierOf(content: Content, cardId: string, tier: RankTier): RankTier | null {
  const next = RANK_TIERS[RANK_TIERS.indexOf(tier) + 1];
  if (!next || RANK_TIERS.indexOf(next) > RANK_TIERS.indexOf(cardTopTier(content, cardId))) {
    return null;
  }
  return next;
}

/** The card's top tier at ★6: nothing left to rank up. */
export function isMaxRank(content: Content, cardId: string, owned: OwnedCard): boolean {
  return owned.tier === cardTopTier(content, cardId) && owned.stars >= MAX_STARS;
}

/** Level cap of a rank (cardRules.levelCaps): by tier only, stars do not raise it (DESIGN.md §5). */
export function levelCap(content: Content, rank: Rank): number {
  return content.cardRules.levelCaps[rank.tier];
}

/** XP needed to go from `level` to `level + 1`: base × growth^(level − 1). */
export function xpToNextLevel(content: Content, level: number): Decimal {
  const { base, growth } = content.cardRules.xpCurve;
  return base.mul(growth.pow(Math.max(0, level - 1)));
}

/**
 * The card's power: (1 + perLevel × (level − 1)) × (1 + perStar × (stars − 1), plus star6Bonus
 * at ★6) × the tier's multiplier. 1 for a Wood ★1 Lv 1 card.
 */
export function cardPower(content: Content, owned: OwnedCard): number {
  const p = content.cardRules.power;
  const levelPart = 1 + p.perLevel * (owned.level - 1);
  const starPart =
    1 + p.perStar * (owned.stars - 1) + (owned.stars >= MAX_STARS ? p.star6Bonus : 0);
  return levelPart * starPart * p.tier[owned.tier];
}

/**
 * The power of a card's base stats (damage and health): (1 + perLevel × (level − 1)) × the star
 * multiplier (×1 at ★1, then ×1.25 … ×3.5 at ★2 … ★6) × the tier's stat step (`statTier`, at
 * least ★6 over ★1, so a tier-up never weakens the card). Card effects use `cardPower` instead,
 * with the smaller `tier` step.
 */
export function cardStatPower(content: Content, owned: OwnedCard): number {
  const p = content.cardRules.power;
  const star = owned.stars <= 1 ? 1 : p.starMultiplier[owned.stars - 2]!;
  return (1 + p.perLevel * (owned.level - 1)) * star * p.statTier[owned.tier];
}

/** The weapon identity's factor on base damage or health (DESIGN.md §5); 1 off the fighting types. */
function weaponFactor(content: Content, card: Card, stat: 'damage' | 'health'): number {
  if (card.job !== 'fighting') return 1;
  return (
    content.cardRules.weapons[card.item.kind as keyof typeof content.cardRules.weapons]?.[stat] ?? 1
  );
}

/**
 * A card's health (DESIGN.md §6): its rarity's base health × its base-stat power, so it grows
 * with level, stars and tier. 0 for unknown ids. The fight side sums the loadout.
 */
export function cardHealth(content: Content, cardId: string, owned: OwnedCard): Decimal {
  const card = content.cardById.get(cardId);
  if (!card) return new Decimal(0);
  return content.cardRules.health[card.rarity]
    .mul(cardStatPower(content, owned))
    .mul(weaponFactor(content, card, 'health'));
}

/**
 * A card's base damage per second (DESIGN.md §5): its rarity's base damage × its base-stat
 * power, so it grows with level, stars and tier like its health. 0 for unknown ids. The fighting
 * main's value is the base of all fighting damage; the modifiers (supports, tree, mastery) come
 * on top.
 */
export function cardBaseDamage(content: Content, cardId: string, owned: OwnedCard): Decimal {
  const card = content.cardById.get(cardId);
  if (!card) return new Decimal(0);
  return content.cardRules.baseDamage[card.rarity]
    .mul(cardStatPower(content, owned))
    .mul(weaponFactor(content, card, 'damage'));
}

/**
 * Levels a card up while its XP allows (mutates it). XP stops at the level cap: a card at its cap
 * keeps 0 XP until a tier-up raises the cap. Returns the levels before and after, or
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

/** The fighting loadout's cost cap: base + perLevel × (account level − 1), through
 *  `loadout.costCap`. */
export function loadoutCostCap(
  state: GameState,
  content: Content,
  job: LoadoutJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number {
  const { base, perLevel } = content.cardRules.costCap;
  const value = base + perLevel * (accountLevel(state) - 1);
  const cap = Math.max(
    0,
    Math.floor(statValue('loadout.costCap', value, modifiers, { job }).toNumber()),
  );
  // With no account level cap the fighting loadout's cap stops at a top value (DESIGN.md §10).
  return job === 'fighting' ? Math.min(cap, content.account.loadoutCostCapTop) : cap;
}

/** Card ids of a loadout, main first, without empty slots. */
export function loadoutCards(loadout: CardLoadout): string[] {
  return [loadout.main, ...loadout.supports].filter((id): id is string => id !== null);
}

/** Total cost of the cards in a loadout. */
export function loadoutCost(content: Content, loadout: CardLoadout): number {
  return loadoutCards(loadout).reduce((sum, id) => sum + cardCost(content, id), 0);
}

/** Where a card sits in the fighting loadout, or null. */
export function loadoutSlotOf(
  state: GameState,
  cardId: string,
): { job: LoadoutJob; slot: LoadoutSlot } | null {
  const loadout = state.cards.loadouts.fighting;
  if (loadout.main === cardId) return { job: 'fighting', slot: 'main' };
  const index = loadout.supports.indexOf(cardId);
  if (index >= 0) return { job: 'fighting', slot: index };
  return null;
}

/**
 * Why a fighting loadout cannot be saved, or null when it can: every card exists, is owned, is a
 * fighting card and appears once; the total cost fits the cap; there are 3 support slots.
 */
export function loadoutProblem(
  state: GameState,
  content: Content,
  job: LoadoutJob,
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
    if (isOnTrip(state, id)) return 'on-expedition';
  }
  if (new Set(ids).size !== ids.length) return 'duplicate';
  if (loadoutCost(content, loadout) > loadoutCostCap(state, content, job, modifiers)) {
    return 'over-cost-cap';
  }
  return null;
}

/** Replaces the fighting loadout (main + 3 supports) after checking it. */
export function setLoadout(
  state: GameState,
  content: Content,
  job: LoadoutJob,
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
 * Puts a card in one slot of the fighting loadout, or empties the slot with `cardId` null. A
 * card already in another slot moves, swapping with what was in the target slot.
 */
export function setLoadoutSlot(
  state: GameState,
  content: Content,
  job: LoadoutJob,
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
 * The modifiers a card gives in a role at its current rank and level: a fighting card's main
 * ability plus the main growth, or its support effect; a worker's ability as written (role
 * `main`; workers have no support effect), not yet scoped to a place. Use it to preview a card.
 */
export function cardEffectModifiers(
  content: Content,
  cardId: string,
  role: CardRole,
  owned: OwnedCard,
): Modifier[] {
  const card = content.cardById.get(cardId);
  if (!card) return [];
  const source = { kind: 'card' as const, id: cardId };
  if (card.job !== 'fighting') {
    return role === 'main' ? card.worker.modifiers.map((m) => ({ ...m, source })) : [];
  }
  const power = cardPower(content, owned);
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

/** A support modifier made `power` times as strong: flat and percent values scale, a mult scales its part above 1. */
function boostSupport(m: Modifier, power: Decimal): Modifier {
  if (m.kind === 'flat' || m.kind === 'percent') return { ...m, value: m.value.mul(power) };
  if (m.kind === 'mult') return { ...m, value: m.value.sub(1).mul(power).add(1) };
  return m;
}

/**
 * Every modifier from the cards at work: the fighting loadout's main ability and support effects,
 * and each worker's ability scoped to its place (workers.ts). Read by `collectModifiers`.
 */
export function cardModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  const loadout = state.cards.loadouts.fighting;
  // Upgrades make the support effects stronger (DESIGN.md §4).
  const power = supportPower(state, content, 'fighting');
  const add = (id: string | null, role: CardRole): void => {
    if (id === null) return;
    const owned = state.cards.owned[id];
    if (!owned || content.cardById.get(id)?.job !== 'fighting') return;
    const mods = cardEffectModifiers(content, id, role, owned);
    out.push(
      ...(role === 'support' && !power.eq(1) ? mods.map((m) => boostSupport(m, power)) : mods),
    );
  };
  add(loadout.main, 'main');
  for (const id of loadout.supports) add(id, 'support');
  out.push(...workerModifiers(state, content));
  return out;
}

/**
 * The cards at work and the scope their enhancements act in (DESIGN.md §5 Enhancements): the
 * fighting loadout everywhere (scope null), each worker at its own place only.
 */
export function cardsAtWork(
  state: GameState,
  content: Content,
): { cardId: string; scope: ModifierScope | null }[] {
  const out: { cardId: string; scope: ModifierScope | null }[] = [];
  const seen = new Set<string>();
  const l = state.cards.loadouts.fighting;
  for (const id of [l.main, ...l.supports]) {
    if (!id || seen.has(id) || content.cardById.get(id)?.job !== 'fighting') continue;
    seen.add(id);
    out.push({ cardId: id, scope: null });
  }
  for (const [place, ids] of Object.entries(activeWorkers(state, content))) {
    const job = producerJob(content, place)!;
    for (const id of ids) out.push({ cardId: id, scope: workerScope(job, place) });
  }
  return out;
}

// ---- star-up and tier-up ---------------------------------------------------------------------

/** One line of a star-up / tier-up checklist. */
export interface Requirement {
  /** `level`: at the level cap; `stars`: at ★6 (the tier-up needs them all); `starFill`: the star
   *  bar's fill; `resource`: Money, a material or gems. */
  kind: 'level' | 'stars' | 'starFill' | 'resource';
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
 * The star bar's fill a star-up from `stars` takes at a tier (DESIGN.md §5), by rarity: copies per
 * star (a fraction at low tiers, 1 at the top tier) times the fill each duplicate gives. Null at ★6.
 */
export function starFillNeeded(
  content: Content,
  rarity: Rarity,
  stars: number,
  tier: RankTier,
): number | null {
  if (stars >= MAX_STARS) return null;
  const { needs, fillPerDuplicate } = content.cardRules.starBar;
  return needs[rarity][tier] * fillPerDuplicate[rarity];
}

/** Fill still to collect from `stars` to ★6 at a tier (0 at ★6). */
function starFillToMax(content: Content, rarity: Rarity, stars: number, tier: RankTier): number {
  let total = 0;
  for (let s = stars; s < MAX_STARS; s++) total += starFillNeeded(content, rarity, s, tier)!;
  return total;
}

/** The star bar as the Cards page shows it. */
export interface StarBarView {
  /** Fill held. */
  fill: number;
  /** Fill the next star takes. */
  need: number;
  /** fill / need, 0..1 (1 when the next star is free). */
  gauge: number;
  /** The next star can be taken now. */
  ready: boolean;
}

/** The star bar of an owned card below ★6; null otherwise. */
export function starBarView(content: Content, card: Card, owned: OwnedCard): StarBarView | null {
  const need = starFillNeeded(content, card.rarity, owned.stars, owned.tier);
  if (need === null) return null;
  return {
    fill: owned.starFill,
    need,
    gauge: need <= 0 ? 1 : Math.min(1, owned.starFill / need),
    ready: owned.starFill >= need,
  };
}

/**
 * Tier-up costs from the current tier, per the card's job: Money plus the tier's Core and tree
 * and mine gems (Frost Sigils from Gold up), through `cost.multiplier` (scope: job,
 * resource). Empty at the card's top tier.
 */
export function tierUpCost(
  content: Content,
  card: Card,
  owned: OwnedCard,
  modifiers: readonly Modifier[] = [],
): Price[] {
  if (owned.tier === 'heirloom' || nextTierOf(content, card.id, owned.tier) === null) return [];
  return content.cardRules.tierUp[owned.tier][card.job].map((c) =>
    finalPrice(c.resource, c.amount, modifiers, { job: card.job }),
  );
}

/** Star-up checklist (★n → ★n+1): the star bar's fill and nothing else. Null if not owned. */
export function starUpCheck(
  state: GameState,
  content: Content,
  cardId: string,
): UpgradeCheck | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  const need = starFillNeeded(content, card.rarity, owned.stars, owned.tier);
  if (need === null) return check(null, []);
  return check({ tier: owned.tier, stars: owned.stars + 1 }, [
    requirement('starFill', owned.starFill, need),
  ]);
}

/** Tier-up checklist (to the next tier at ★1, the stars restart): level cap, ★6, Money, Cores, tree
 *  and mine gems and Frost Sigils. Null if not owned. Unavailable at the card's top tier. */
export function tierUpCheck(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): UpgradeCheck | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  const nextTier = nextTierOf(content, cardId, owned.tier);
  if (!nextTier) return check(null, []);
  return check({ tier: nextTier, stars: 1 }, [
    levelRequirement(content, owned),
    requirement('stars', owned.stars, MAX_STARS),
    ...resourceRequirements(state, tierUpCost(content, card, owned, modifiers)),
  ]);
}

/**
 * The star dust a star-up from the card's current star needs to cover what the bar lacks
 * (DESIGN.md §5 Star dust): the missing copies times the dust price of a copy at the card's
 * rarity and tier, rounded up. 0 when the bar is full; null at ★6 or for a card not owned.
 */
export function starDustCost(state: GameState, content: Content, cardId: string): number | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  const need = starFillNeeded(content, card.rarity, owned.stars, owned.tier);
  if (need === null) return null;
  const missing = Math.max(0, need - owned.starFill);
  if (missing === 0) return 0;
  const perCopy = content.cardRules.starBar.fillPerDuplicate[card.rarity];
  return Math.ceil((missing / perCopy) * content.cardRules.starBar.dust[card.rarity][owned.tier]);
}

/** Spends the star bar's fill and adds a star. Level and XP stay. Left-over fill carries over. */
export function starUp(state: GameState, content: Content, cardId: string): CardUpgradeResult {
  const result = starUpCheck(state, content, cardId);
  if (!result) return fail(content.cardById.has(cardId) ? 'not-owned' : 'unknown');
  if (!result.available) return fail('unavailable');
  if (!result.met) return fail('requirements');
  const card = content.cardById.get(cardId)!;
  const next = cloneState(state);
  const owned = next.cards.owned[cardId]!;
  owned.starFill -= starFillNeeded(content, card.rarity, owned.stars, owned.tier)!;
  owned.stars += 1;
  if (owned.stars >= MAX_STARS) owned.starFill = 0;
  return { ok: true, state: next, tierUps: [] };
}

/**
 * Buys a star with star dust for the part of the bar that is missing (DESIGN.md §5 Star dust): the
 * dust is paid, the bar's fill is used up and the star is added. Refused when the dust is short.
 */
export function starUpWithDust(
  state: GameState,
  content: Content,
  cardId: string,
): CardUpgradeResult {
  const cost = starDustCost(state, content, cardId);
  if (cost === null) {
    if (!content.cardById.has(cardId)) return fail('unknown');
    return fail(state.cards.owned[cardId] ? 'unavailable' : 'not-owned');
  }
  const held = state.resources['star_dust'] ?? new Decimal(0);
  if (held.lt(cost)) return fail('requirements');
  const card = content.cardById.get(cardId)!;
  const next = cloneState(state);
  const owned = next.cards.owned[cardId]!;
  next.resources['star_dust'] = held.sub(cost);
  const need = starFillNeeded(content, card.rarity, owned.stars, owned.tier)!;
  owned.starFill = Math.max(0, owned.starFill - need);
  owned.stars += 1;
  if (owned.stars >= MAX_STARS) owned.starFill = 0;
  return { ok: true, state: next, tierUps: [] };
}

/** Pays the tier-up costs and moves the card to the next tier. The stars restart at ★1 with an
 *  empty star bar; level and XP carry over. */
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
  owned.starFill = 0;
  const from = tierMetalIndex(before.tier);
  const to = tierMetalIndex(owned.tier);
  const tierUps: TierUp[] = [{ kind: 'card_tier', id: cardId, from, to, metal: metalOf(to) }];
  return {
    ok: true,
    state: next,
    tierUps: [...tierUps, ...heirloomTierUps(content, cardId, before, owned)],
  };
}

// ---- gaining cards ---------------------------------------------------------------------------

/**
 * Adds one copy to a card collection (mutates it): a new card, a duplicate that fills the star
 * bar, or shards when the copy is past ★6 (the card is ★6, or its bar already holds every star
 * left). Used by `addCard`, the summon portals and the shard shop.
 */
export function grantCard(cards: CardState, content: Content, card: Card): CardGain {
  const owned = cards.owned[card.id];
  if (!owned) {
    const fresh = newOwnedCard();
    cards.owned[card.id] = fresh;
    return { kind: 'new' };
  }
  if (
    owned.stars >= MAX_STARS ||
    owned.starFill >= starFillToMax(content, card.rarity, owned.stars, owned.tier)
  ) {
    const shards = content.cardRules.shards[card.rarity];
    cards.shards += shards;
    return { kind: 'shards', shards };
  }
  owned.starFill += content.cardRules.starBar.fillPerDuplicate[card.rarity];
  return { kind: 'duplicate', duplicates: owned.starFill };
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

/**
 * XP each fighting card in the loadout gets per second fought (`xp.card`), at the dungeon's tier
 * like the kill XP. The special dungeon pays the tier 1 rate. Never paid while knocked out: the
 * fight code calls this only for time spent fighting.
 */
export function fightingXpPerSecond(
  content: Content,
  place: Dungeon | Trial,
  modifiers: readonly Modifier[] = [],
): Decimal {
  const { perSecond, tierGrowth } = content.cardRules.xp;
  const tier = 'tier' in place ? place.tier : 1;
  const base = perSecond.mul(tierGrowth.pow(tier - 1));
  const ctx = { job: 'fighting' as const, dungeon: place.id };
  return Decimal.max(statValue('xp.card', base, modifiers, ctx), 0);
}

/** XP a worker gets per unit its place harvests (`xp.card`, read at that place). */
export function productionXpPerUnit(
  content: Content,
  job: 'logging' | 'mining',
  modifiers: readonly Modifier[] = [],
  producerId?: string,
): Decimal {
  const base = content.cardRules.xp.perUnit[job];
  const ctx = producerId ? { job, producer: producerId } : { job };
  return Decimal.max(statValue('xp.card', base, modifiers, ctx), 0);
}

/**
 * Gives `amount` XP to one card (mutates `state`, a fresh clone owned by the caller), as a
 * worker earns it from its own place. A card at its level cap gains nothing. Level-ups wait for
 * `settleCardLevels`.
 */
export function grantWorkerXp(
  state: GameState,
  content: Content,
  cardId: string,
  amount: Decimal,
): void {
  const owned = state.cards.owned[cardId];
  if (!owned || amount.lte(0)) return;
  if (owned.level >= levelCap(content, cardRank(owned))) owned.xp = new Decimal(0);
  else owned.xp = owned.xp.add(amount);
}

/**
 * Gives `amount` XP to every card in the fighting loadout (mutates `state`, a fresh clone owned
 * by the caller). Cards at their level cap gain nothing. Level-ups wait for `settleCardLevels`.
 */
export function grantLoadoutXp(
  state: GameState,
  content: Content,
  job: LoadoutJob,
  amount: Decimal,
): void {
  if (amount.lte(0)) return;
  for (const id of new Set(loadoutCards(state.cards.loadouts[job]))) {
    if (content.cardById.get(id)?.job !== job) continue;
    grantWorkerXp(state, content, id, amount);
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
  /** 1 for a Wood ★1 Lv 1 card; scales its bonuses. */
  power: number;
  cost: number;
  /** Where the card sits in the fighting loadout, or null. */
  slot: { job: LoadoutJob; slot: LoadoutSlot } | null;
  /** A worker: the tree kind or mine type it works, or null. */
  workplace: string | null;
  /** At its top tier and ★6 (its rarity's cap, or the Heirloom when open). */
  maxRank: boolean;
  /** The star bar (fill, need, gauge 0..1); null when not owned or at ★6. */
  starBar: StarBarView | null;
  starUp: UpgradeCheck | null;
  /** Star dust that would cover the missing part of the next star, with what is held; null at ★6 or not owned. */
  starDust: { cost: number; have: number } | null;
  tierUp: UpgradeCheck | null;
  /** Its effect as main / as support at the current power (Wood ★1 Lv 1 when not owned). */
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
  const dustCost = starDustCost(state, content, cardId);
  const heldDust = (state.resources['star_dust'] ?? new Decimal(0)).toNumber();
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
    workplace: card.job === 'fighting' ? null : workplaceOf(state, content, cardId),
    maxRank: owned ? isMaxRank(content, cardId, owned) : false,
    starBar: owned ? starBarView(content, card, owned) : null,
    starUp: starUpCheck(state, content, cardId),
    starDust: dustCost === null ? null : { cost: dustCost, have: heldDust },
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
  job: LoadoutJob;
  main: string | null;
  supports: (string | null)[];
  cost: number;
  cap: number;
}

/** The fighting loadout with its cost and cap. */
export function loadoutInfo(
  state: GameState,
  content: Content,
  job: LoadoutJob,
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
