import type {
  Card,
  CardModifierData,
  Content,
  Dungeon,
  ItemKind,
  Job,
  ModifierData,
  ModifierScope,
  CardGrade,
  CardSide,
  Rank,
  RankTier,
  Trial,
} from '../data';
import { MAX_STARS, RANK_TIERS } from '../data/schemas';
import { accountLevel } from './account';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { teamBonusPower } from './upgrades';
import { activeWorkers, producerJob, workerModifiers, workerScope, workplaceOf } from './workers';
import type { CardGain, TickReport, TierUp } from './report';
import {
  cloneState,
  newOwnedCard,
  LOADOUT_SLOTS,
  type CardLoadout,
  type CardState,
  type GameState,
  type OwnedCard,
  isOnTrip,
} from './state';

/**
 * Cards (DESIGN.md §5): a collection of owned cards with tier, stars, level and
 * XP; the fighting loadout (four equal slots) under a cost cap (logging and mining cards are
 * workers instead, workers.ts); star-ups, shards and
 * card drops. A card's tier is its own for good (DESIGN.md §5 No tier-ups): `OwnedCard.tier` is
 * a copy of `card.tier`, written when the card is gained and when a save is read, never changed. Card effects reach the game only as modifiers (source kind `card`) through
 * `collectModifiers`. Every progression number is in cardRules.json.
 *
 * Every function is pure: state changes return a new state. Functions that need modifiers take
 * them as an optional last argument (pass `collectModifiers(state, content)` once when calling
 * several in a row).
 */

export type { Job };
/** What a card gives: its Ability (itself) or its Team bonus (the team); DESIGN.md §5 Loadouts. */
export type EffectRole = 'ability' | 'team';
/** The one job with a loadout (DESIGN.md §5 Loadouts). */
export type LoadoutJob = 'fighting';
/** A loadout slot: 0 to 3, left to right. */
export type LoadoutSlot = number;

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
  /** More than MAX_LOADOUT_HEIRLOOMS Heirloom cards in the loadout (DESIGN.md §5 Cost). */
  | 'too-many-heirlooms'
  /** The card is away on an expedition (DESIGN.md §15). */
  | 'on-expedition'
  /** Not a valid slot. */
  | 'invalid-slot'
  /** No star-up from this rank (already ★6, or an Heirloom card). */
  | 'unavailable'
  /** At least one requirement of the star-up is not met. */
  | 'requirements';

export type CardResult = { ok: true; state: GameState } | { ok: false; reason: CardFailure };
/** A star-up: like CardResult, plus the moments it caused (none today). */
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
  /** True for an Heirloom card (DESIGN.md §5 Heirlooms): it shows its Heirloom. */
  heirloom: boolean;
}

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

/** A tier's on-screen name: T6 is Mythic or Void by the card's side. */
export const tierLabel = (tier: RankTier, side?: CardSide): string =>
  tier === 'mythic' && side === 'void' ? 'Void' : TIER_LABELS[tier];

/** On-screen name of a card grade (its tier; the two sides of T6 are Mythic and Void). */
export const gradeLabel = (grade: CardGrade): string =>
  grade === 'void' ? 'Void' : TIER_LABELS[grade];

/** The side of a card's T6 or an Heirloom: Mythic (heroic) or Void (villainous). */
export const cardSide = (card: { side?: CardSide | undefined }): CardSide => card.side ?? 'mythic';

/** The tier whose table value a card reads: its own, an Heirloom card the T6 one. */
export const ladderTier = (card: { tier: RankTier }): Exclude<RankTier, 'heirloom'> =>
  card.tier === 'heirloom' ? 'mythic' : card.tier;

/** A card as owned the moment it is gained: at its own tier, ★1, Lv 1. Also the preview of a card not owned. */
export const freshCard = (card: { tier: RankTier }): OwnedCard => newOwnedCard(card.tier);

/**
 * The name of an item type at a tier for a card of a side (DESIGN.md §5 "Item names"): T1 to T5
 * "<material> <type>" (Wooden, Bronze, Silver, Golden, Prismatic Sword), T6 by the card's side; the Heirloom tier (an
 * Heirloom card's) is the type's Heirloom of that side.
 * Pass the card as `card` and a card with its own Heirloom (`heirloomName` in cards.json, DESIGN.md
 * §5 More weapons from the Heirloom candidates) is named by it at every tier: the card's weapon is
 * that one weapon, shown as its own picture until its lower-tier pictures are drawn (user,
 * 2026-11-13). Every card without one keeps the type's names.
 */
export function itemName(
  content: Content,
  kind: ItemKind,
  tier: RankTier,
  side: CardSide | undefined,
  card?: { heirloomName?: string | undefined },
): string {
  const type = content.itemTypeByKind.get(kind);
  if (!type) return kind;
  // a card's own weapon is named at Mythic or Void and as its Heirloom; below that the type's model
  if (card?.heirloomName && (tier === 'mythic' || tier === 'heirloom')) return card.heirloomName;
  switch (tier) {
    case 'wood':
    case 'bronze':
    case 'silver':
    case 'gold':
    case 'prismatic':
      return `${content.items.materials[tier]} ${type.noun}`;
    case 'mythic':
      return type[side ?? 'mythic'];
    case 'heirloom':
      return type.heirloom;
  }
}

/**
 * The one name a card has (DESIGN.md §5 "Item names", user 2026-11-16): its weapon's. A card never
 * changes tier, so the name is fixed. The character names in cards.json are shown nowhere. Use this
 * everywhere a card is named.
 */
export function cardDisplayName(content: Content, card: Card): string {
  return itemName(content, card.item.kind, card.tier, card.side, card);
}

/** `cardDisplayName` by card id: undefined for an unknown id (so `?? id` chains keep working). */
export function cardNameById(content: Content, cardId: string): string | undefined {
  const card = content.cardById.get(cardId);
  return card ? cardDisplayName(content, card) : undefined;
}

/** The item to draw for a card: its type's item named for the card's tier. Null for unknown ids. */
export function cardItem(content: Content, cardId: string): CardItem | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  return {
    kind: card.item.kind,
    name: itemName(content, card.item.kind, card.tier, card.side, card),
    heirloom: card.heirloom === true,
  };
}

/** Just the item kind to draw (see cardItem). Null for unknown ids. */
export function cardItemKind(content: Content, cardId: string): ItemKind | null {
  return cardItem(content, cardId)?.kind ?? null;
}

/** Whether a card is one of the 22 Heirloom cards (DESIGN.md §5 Heirlooms). */
export function isHeirloomCard(content: Content, cardId: string): boolean {
  return content.cardById.get(cardId)?.heirloom === true;
}

/** The tier of a card (its own, for good); Wood for an unknown id. */
export function cardTier(content: Content, cardId: string): RankTier {
  return content.cardById.get(cardId)?.tier ?? 'wood';
}

/** ★6: nothing left to rank up (a card never changes tier). */
export function isMaxRank(owned: { stars: number }): boolean {
  return owned.stars >= MAX_STARS;
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
 * The step of a tier table (`power.tier`, `power.statTier`) a card stands on at its level (DESIGN.md
 * §5 Strength comes with the card's levels). A card is its tier from the first pull, but its numbers
 * climb the tiers with its own levels: it starts on the Wood step and gains the step to the next
 * tier as it passes that tier's level cap (20, 40, 60, 80, 100), spread over the next
 * `power.tierStepLevels` levels, up to its own tier. So a Prismatic card at Lv 1 has the Wood step
 * and its full Prismatic step from a little past Lv 80. An Heirloom card has its own fixed step.
 */
export function tierStepAt(
  content: Content,
  table: Record<RankTier, number>,
  tier: RankTier,
  level: number,
): number {
  if (tier === 'heirloom') return table.heirloom;
  const { levelCaps, power } = content.cardRules;
  const ramp = Math.max(1, power.tierStepLevels);
  const top = RANK_TIERS.indexOf(tier);
  let value = table.wood;
  for (let k = 0; k < top; k++) {
    const from = RANK_TIERS[k]!;
    const to = RANK_TIERS[k + 1]!;
    const part = Math.min(1, (level - levelCaps[from]) / ramp);
    if (part <= 0) break;
    value = table[from] * Math.pow(table[to] / table[from], part);
  }
  return value;
}

/**
 * The card's power: (1 + perLevel × (level − 1)) × (1 + perStar × (stars − 1), plus star6Bonus
 * at ★6) × the tier step the card stands on at its level (`tierStepAt`). 1 for any ★1 Lv 1 card.
 */
export function cardPower(content: Content, owned: OwnedCard): number {
  const p = content.cardRules.power;
  const levelPart = 1 + p.perLevel * (owned.level - 1);
  const starPart =
    1 + p.perStar * (owned.stars - 1) + (owned.stars >= MAX_STARS ? p.star6Bonus : 0);
  return levelPart * starPart * tierStepAt(content, p.tier, owned.tier, owned.level);
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
  return (
    (1 + p.perLevel * (owned.level - 1)) *
    star *
    tierStepAt(content, p.statTier, owned.tier, owned.level)
  );
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
  return content.cardRules.health[ladderTier(card)]
    .mul(cardStatPower(content, owned))
    .mul(weaponFactor(content, card, 'health'));
}

/**
 * A card's base damage per second (DESIGN.md §5): its rarity's base damage × its base-stat
 * power, so it grows with level, stars and tier like its health. 0 for unknown ids. The fighting
 * value is the base of that card's damage; the modifiers (team bonuses, tree, mastery) come on top.
 */
export function cardBaseDamage(content: Content, cardId: string, owned: OwnedCard): Decimal {
  const card = content.cardById.get(cardId);
  if (!card) return new Decimal(0);
  return content.cardRules.baseDamage[ladderTier(card)]
    .mul(cardStatPower(content, owned))
    .mul(weaponFactor(content, card, 'damage'));
}

/**
 * Levels a card up while its XP allows (mutates it). XP stops at the level cap: a card at its cap
 * keeps 0 XP. Returns the levels before and after, or
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

/** Loadout cost of a card, by its tier (11.4); an Heirloom card has its own. 0 for unknown ids. */
export function cardCost(content: Content, cardId: string): number {
  const card = content.cardById.get(cardId);
  if (!card) return 0;
  return card.heirloom ? content.cardRules.heirloomCost : content.cardRules.cost[ladderTier(card)];
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

/** A loadout holds at most this many Heirloom cards (DESIGN.md §5 Cost). */
export const MAX_LOADOUT_HEIRLOOMS = 2;

/** How many Heirloom cards a list of card ids holds. */
export function heirloomCount(content: Content, ids: readonly (string | null)[]): number {
  return ids.filter((id) => id !== null && content.cardById.get(id)?.heirloom).length;
}

/** Card ids of a loadout, left to right, without empty slots. */
export function loadoutCards(loadout: CardLoadout): string[] {
  return loadout.slots.filter((id): id is string => id !== null);
}

/**
 * A team placed in the formation (DESIGN.md §5 Loadouts): the two highest-health cards in the
 * front row (the higher on the left), the others in the back row in their order. A saved team
 * that had no positions gets this once, so no low-health card is put in front.
 */
export function arrangeFormation(
  loadout: CardLoadout,
  healthOf: (cardId: string) => Decimal,
): CardLoadout {
  const ids = loadout.slots.filter((id): id is string => id !== null);
  const strongest = [...ids].sort(
    (a, b) => healthOf(b).cmp(healthOf(a)) || ids.indexOf(a) - ids.indexOf(b),
  );
  const front = strongest.slice(0, 2);
  const back = ids.filter((id) => !front.includes(id));
  return { slots: [back[0] ?? null, front[0] ?? null, front[1] ?? null, back[1] ?? null] };
}

/** Arranges the fighting loadout and every dungeon preset of a state read from an old save. */
export function arrangeSavedFormations(state: GameState, content: Content): void {
  const healthOf = (id: string): Decimal => {
    const owned = state.cards.owned[id];
    return owned ? cardHealth(content, id, owned) : new Decimal(0);
  };
  state.cards.loadouts.fighting = arrangeFormation(state.cards.loadouts.fighting, healthOf);
  for (const [id, preset] of Object.entries(state.presets.dungeons)) {
    state.presets.dungeons[id] = arrangeFormation(preset, healthOf);
  }
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
  const index = state.cards.loadouts.fighting.slots.indexOf(cardId);
  return index >= 0 ? { job: 'fighting', slot: index } : null;
}

/**
 * Why a fighting loadout cannot be saved, or null when it can: every card exists, is owned, is a
 * fighting card and appears once; the total cost fits the cap; there are four slots.
 */
export function loadoutProblem(
  state: GameState,
  content: Content,
  job: LoadoutJob,
  loadout: CardLoadout,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CardFailure | null {
  if (loadout.slots.length !== LOADOUT_SLOTS) return 'invalid-slot';
  const ids = loadoutCards(loadout);
  for (const id of ids) {
    const card = content.cardById.get(id);
    if (!card) return 'unknown';
    if (!state.cards.owned[id]) return 'not-owned';
    if (card.job !== job) return 'wrong-job';
    if (isOnTrip(state, id)) return 'on-expedition';
  }
  if (new Set(ids).size !== ids.length) return 'duplicate';
  if (heirloomCount(content, ids) > MAX_LOADOUT_HEIRLOOMS) return 'too-many-heirlooms';
  if (loadoutCost(content, loadout) > loadoutCostCap(state, content, job, modifiers)) {
    return 'over-cost-cap';
  }
  return null;
}

/** Replaces the fighting loadout (four slots) after checking it. */
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
  next.cards.loadouts[job] = { slots: [...loadout.slots] };
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
  if (!Number.isInteger(slot) || slot < 0 || slot >= LOADOUT_SLOTS) return fail('invalid-slot');
  const loadout: CardLoadout = { slots: [...state.cards.loadouts[job].slots] };
  if (cardId !== null) {
    const from = loadout.slots.indexOf(cardId);
    if (from !== -1) loadout.slots[from] = loadout.slots[slot] ?? null;
  }
  loadout.slots[slot] = cardId;
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
 * The modifiers a card gives in a role at its current rank and level: a fighting card's Ability
 * plus the ability growth, or its Team bonus; a worker's ability as written (role `ability`;
 * workers have no team bonus), not yet scoped to a place. Use it to preview a card.
 */
export function cardEffectModifiers(
  content: Content,
  cardId: string,
  role: EffectRole,
  owned: OwnedCard,
): Modifier[] {
  const card = content.cardById.get(cardId);
  if (!card) return [];
  const source = { kind: 'card' as const, id: cardId };
  if (card.job !== 'fighting') {
    return role === 'ability' ? card.worker.modifiers.map((m) => ({ ...m, source })) : [];
  }
  const power = cardPower(content, owned);
  const effect = role === 'ability' ? card.ability : card.teamBonus;
  const out: Modifier[] = effect.modifiers.map((m) => ({
    ...scaleCardModifier(m, power),
    source,
  }));
  if (role === 'ability' && power > 1) {
    for (const m of content.cardRules.abilityGrowth[card.job]) {
      out.push({ ...m, value: m.value.mul(power - 1), source });
    }
  }
  return out;
}

/** A team bonus made `power` times as strong: flat and percent values scale, a mult scales its part above 1. */
function boostTeamBonus(m: Modifier, power: Decimal): Modifier {
  if (m.kind === 'flat' || m.kind === 'percent') return { ...m, value: m.value.mul(power) };
  if (m.kind === 'mult') return { ...m, value: m.value.sub(1).mul(power).add(1) };
  return m;
}

/**
 * Every modifier from the cards at work: the fighting loadout's team bonuses (every card gives its
 * own; its Ability is not here, it is the card's own in the duel, duel.ts) and each worker's
 * ability scoped to its place (workers.ts). Read by `collectModifiers`.
 */
export function cardModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  // Upgrades make the team bonuses stronger (DESIGN.md §4).
  const power = teamBonusPower(state, content, 'fighting');
  for (const id of state.cards.loadouts.fighting.slots) {
    if (id === null) continue;
    const owned = state.cards.owned[id];
    if (!owned || content.cardById.get(id)?.job !== 'fighting') continue;
    const mods = cardEffectModifiers(content, id, 'team', owned);
    out.push(...(power.eq(1) ? mods : mods.map((m) => boostTeamBonus(m, power))));
  }
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
  for (const id of state.cards.loadouts.fighting.slots) {
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

/**
 * The star bar's fill a star-up from `stars` takes (DESIGN.md §5 One copy a star): one copy, at
 * every tier. Null at ★6 and for an Heirloom card, whose stars come from its own shards.
 */
export function starFillNeeded(card: { tier: RankTier }, stars: number): number | null {
  if (stars >= MAX_STARS || card.tier === 'heirloom') return null;
  return 1;
}

/** Fill still to collect from `stars` to ★6 (0 at ★6). */
function starFillToMax(card: { tier: RankTier }, stars: number): number {
  let total = 0;
  for (let s = stars; s < MAX_STARS; s++) total += starFillNeeded(card, s) ?? 0;
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
export function starBarView(card: Card, owned: OwnedCard): StarBarView | null {
  const need = starFillNeeded(card, owned.stars);
  if (need === null) return null;
  return {
    fill: owned.starFill,
    need,
    gauge: need <= 0 ? 1 : Math.min(1, owned.starFill / need),
    ready: owned.starFill >= need,
  };
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
  const need = starFillNeeded(card, owned.stars);
  if (need === null) return check(null, []);
  return check({ tier: owned.tier, stars: owned.stars + 1 }, [
    requirement('starFill', owned.starFill, need),
  ]);
}

/**
 * The star dust a star-up from the card's current star needs to cover what the bar lacks
 * (DESIGN.md §5 Star dust): the missing copies times the dust price of a copy at the card's
 * tier, rounded up. 0 when the bar is full; null at ★6 or for a card not owned.
 */
export function starDustCost(state: GameState, content: Content, cardId: string): number | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  const need = starFillNeeded(card, owned.stars);
  if (need === null) return null;
  const missing = Math.max(0, need - owned.starFill);
  if (missing === 0) return 0;
  return Math.ceil(missing * content.cardRules.starBar.dust[ladderTier(card)]);
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
  owned.starFill -= starFillNeeded(card, owned.stars)!;
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
  const need = starFillNeeded(card, owned.stars)!;
  owned.starFill = Math.max(0, owned.starFill - need);
  owned.stars += 1;
  if (owned.stars >= MAX_STARS) owned.starFill = 0;
  return { ok: true, state: next, tierUps: [] };
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
    // A card is gained at its own tier and stays there (DESIGN.md §5 No tier-ups).
    cards.owned[card.id] = freshCard(card);
    return { kind: 'new' };
  }
  // A copy of an owned Heirloom card is never a star (its stars come from the Heirloom Gate's
  // shards): it pays card shards like a copy past ★6.
  if (
    card.heirloom ||
    owned.stars >= MAX_STARS ||
    owned.starFill >= starFillToMax(card, owned.stars)
  ) {
    const shards = content.cardRules.shards[ladderTier(card)];
    cards.shards += shards;
    return { kind: 'shards', shards };
  }
  owned.starFill += 1;
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
  /** 1 for a Wood ★1 Lv 1 card; scales its bonuses (a card not owned: fresh at its own tier). */
  power: number;
  cost: number;
  /** Where the card sits in the fighting loadout, or null. */
  slot: { job: LoadoutJob; slot: LoadoutSlot } | null;
  /** A worker: the tree kind or mine type it works, or null. */
  workplace: string | null;
  /** At ★6. */
  maxRank: boolean;
  /** The star bar (fill, need, gauge 0..1); null when not owned or at ★6. */
  starBar: StarBarView | null;
  starUp: UpgradeCheck | null;
  /** Star dust that would cover the missing part of the next star, with what is held; null at ★6 or not owned. */
  starDust: { cost: number; have: number } | null;
  /** Its Ability / its Team bonus at the current power (fresh at its tier when not owned). */
  abilityModifiers: Modifier[];
  teamModifiers: Modifier[];
}

/** Everything the Cards page shows for one card. Null for unknown ids. */
export function cardInfo(state: GameState, content: Content, cardId: string): CardInfo | null {
  const card = content.cardById.get(cardId);
  if (!card) return null;
  const owned = state.cards.owned[cardId] ?? null;
  const preview = owned ?? freshCard(card);
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
    maxRank: owned ? isMaxRank(owned) : false,
    starBar: owned ? starBarView(card, owned) : null,
    starUp: starUpCheck(state, content, cardId),
    starDust: dustCost === null ? null : { cost: dustCost, have: heldDust },
    abilityModifiers: cardEffectModifiers(content, cardId, 'ability', preview),
    teamModifiers: cardEffectModifiers(content, cardId, 'team', preview),
  };
}

/** Every card in content order (owned or not), optionally for one job. */
export function cardCollection(state: GameState, content: Content, job?: Job): CardInfo[] {
  return content.cards
    .filter((c) => job === undefined || c.job === job)
    .map((c) => cardInfo(state, content, c.id)!);
}

export interface LoadoutInfo {
  job: LoadoutJob;
  slots: (string | null)[];
  cost: number;
  cap: number;
  /** The next rise of the cap: how much and at which account level; null at its top. */
  nextRise: { by: number; level: number } | null;
}

/** The fighting loadout's cost cap at an account level: the formula plus the reward track's bumps
 *  up to it, never past the top (DESIGN.md §10 Loadout cost cap). */
export function loadoutCapAtLevel(content: Content, level: number): number {
  const { base, perLevel } = content.cardRules.costCap;
  const bumps = content.account.rewardTrack
    .filter((r) => r.level <= level)
    .reduce((sum, r) => sum + r.costCap, 0);
  const cap = base + perLevel * (level - 1) + bumps;
  return Math.min(cap, content.account.loadoutCostCapTop);
}

/** The next account level where the cap rises, and by how much; null once it is at the top. */
export function nextCapRise(content: Content, level: number): { by: number; level: number } | null {
  const now = loadoutCapAtLevel(content, level);
  if (now >= content.account.loadoutCostCapTop) return null;
  for (let next = level + 1; next <= level + 400; next++) {
    const cap = loadoutCapAtLevel(content, next);
    if (cap > now) return { by: cap - now, level: next };
  }
  return null;
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
    slots: [...loadout.slots],
    nextRise: nextCapRise(content, accountLevel(state)),
    cost: loadoutCost(content, loadout),
    cap: loadoutCostCap(state, content, job, modifiers),
  };
}
