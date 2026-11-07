import type {
  CardSlot,
  Content,
  Cosmetic,
  CosmeticSet,
  CosmeticSlot,
  LadderStep,
  Rank,
} from '../data';
import { CARD_SLOTS } from '../data';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import type { CosmeticGain } from './portals';
import { finalPrice, pay, type Price } from './production';
import { cloneState, type GameState } from './state';
import {
  cosmeticMaxLevel,
  detectSets,
  equip,
  equipProblem,
  resolveCard,
  unequipCard,
  wearRequirement,
  type CosmeticLoadout,
  type ResolvedCard,
} from './theme';

/**
 * The Wardrobe (DESIGN.md 7, 11.1): owning, equipping and upgrading cosmetics. Owning an item
 * gives its buff and fully equipped sets give their bonus (both through `collectModifiers`).
 * Items go in their slot globally, or on one card for card slots (card-exclusives only there);
 * a card wears a card-slot item only from its wear rank (theme.ts). Upgrade levels follow the
 * ladder in cosmeticRules.json and cost duplicates plus Glimmer Dust (shape, accent) or Facet
 * Shards (gems, glow, ambient).
 */

/**
 * Adds one copy of a cosmetic (mutates `state`, a fresh copy owned by the caller): a new item
 * at level 1, or a copy that feeds its upgrade levels. Used by the portals, dungeon drops,
 * prestige rewards and achievements.
 */
export function grantCosmetic(state: GameState, cosmeticId: string): CosmeticGain {
  const owned = state.cosmetics.owned[cosmeticId];
  if (!owned) {
    state.cosmetics.owned[cosmeticId] = { level: 1, copies: 0 };
    return { kind: 'new' };
  }
  const copies = owned.copies + 1;
  state.cosmetics.owned[cosmeticId] = { ...owned, copies };
  return { kind: 'copy', copies };
}

// ---- levels ------------------------------------------------------------------------------------

/** What each level adds, level 1 first (DESIGN.md 7 ladder; length = the max level). */
export function cosmeticLadder(content: Content, cosmetic: Cosmetic): LadderStep[] {
  const max = cosmeticMaxLevel(content, cosmetic);
  return [...(content.cosmeticRules.ladders[String(max)] ?? [])];
}

/** One line of an upgrade checklist. */
export interface CosmeticRequirement {
  kind: 'copies' | 'resource';
  resource?: string;
  have: Decimal;
  need: Decimal;
  met: boolean;
}

export interface CosmeticUpgradeCheck {
  /** False at the max level (then `requirements` is empty). */
  available: boolean;
  /** The level after the upgrade, or null at the max. */
  toLevel: number | null;
  /** What that level adds, or null at the max. */
  step: LadderStep | null;
  requirements: CosmeticRequirement[];
  met: boolean;
}

/** The material price of reaching `level` (through `cost.multiplier`, scope: resource). */
export function cosmeticUpgradeCost(
  content: Content,
  cosmetic: Cosmetic,
  level: number,
  modifiers: readonly Modifier[] = [],
): Price | null {
  const step = cosmeticLadder(content, cosmetic)[level - 1];
  if (!step || level < 2) return null;
  const material = content.cosmeticRules.materials[step];
  const amount = material.amount.mul(content.cosmeticRules.rarityCost[cosmetic.rarity]);
  return finalPrice(material.resource, amount, modifiers, {});
}

const req = (
  kind: CosmeticRequirement['kind'],
  have: Decimal | number,
  need: Decimal | number,
  resource?: string,
): CosmeticRequirement => {
  const h = new Decimal(have);
  const n = new Decimal(need);
  return { kind, ...(resource ? { resource } : {}), have: h, need: n, met: h.gte(n) };
};

/** The next level's checklist: duplicates and material. Null when not owned or unknown. */
export function cosmeticUpgradeCheck(
  state: GameState,
  content: Content,
  cosmeticId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CosmeticUpgradeCheck | null {
  const cosmetic = content.cosmeticById.get(cosmeticId);
  const owned = state.cosmetics.owned[cosmeticId];
  if (!cosmetic || !owned) return null;
  const toLevel = owned.level + 1;
  const price = cosmeticUpgradeCost(content, cosmetic, toLevel, modifiers);
  if (toLevel > cosmeticMaxLevel(content, cosmetic) || !price) {
    return { available: false, toLevel: null, step: null, requirements: [], met: false };
  }
  const requirements = [
    req('copies', owned.copies, content.cosmeticRules.copiesPerLevel),
    req('resource', state.resources[price.resource] ?? 0, price.amount, price.resource),
  ];
  return {
    available: true,
    toLevel,
    step: cosmeticLadder(content, cosmetic)[toLevel - 1] ?? null,
    requirements,
    met: requirements.every((r) => r.met),
  };
}

export type CosmeticUpgradeResult =
  | {
      ok: true;
      state: GameState;
      /** The new level and what it added. */
      level: number;
      step: LadderStep;
      /** True when the item reached its max level (the ambient animation). */
      maxed: boolean;
    }
  | { ok: false; reason: 'unknown' | 'not-owned' | 'maxed' | 'requirements' };

/** Spends the duplicates and material and raises the level. Worn copies follow the new level. */
export function upgradeCosmetic(
  state: GameState,
  content: Content,
  cosmeticId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CosmeticUpgradeResult {
  const cosmetic = content.cosmeticById.get(cosmeticId);
  if (!cosmetic) return { ok: false, reason: 'unknown' };
  const check = cosmeticUpgradeCheck(state, content, cosmeticId, modifiers);
  if (!check) return { ok: false, reason: 'not-owned' };
  if (!check.available) return { ok: false, reason: 'maxed' };
  if (!check.met) return { ok: false, reason: 'requirements' };
  const price = cosmeticUpgradeCost(content, cosmetic, check.toLevel!, modifiers)!;
  const next = pay(state, [price]);
  const owned = next.cosmetics.owned[cosmeticId]!;
  const level = check.toLevel!;
  next.cosmetics.owned[cosmeticId] = {
    level,
    copies: owned.copies - content.cosmeticRules.copiesPerLevel,
  };
  next.cosmetics.loadout = withLevel(next.cosmetics.loadout, cosmeticId, level);
  return {
    ok: true,
    state: next,
    level,
    step: check.step!,
    maxed: level >= cosmeticMaxLevel(content, cosmetic),
  };
}

/** The loadout with every equipped copy of an item at `level`. */
function withLevel(loadout: CosmeticLoadout, id: string, level: number): CosmeticLoadout {
  const slots = Object.fromEntries(
    Object.entries(loadout.slots).map(([slot, eq]) => [
      slot,
      eq && eq.id === id ? { ...eq, level } : eq,
    ]),
  ) as CosmeticLoadout['slots'];
  const cards = Object.fromEntries(
    Object.entries(loadout.cards).map(([card, perCard]) => [
      card,
      Object.fromEntries(
        Object.entries(perCard).map(([slot, eq]) => [
          slot,
          eq && eq.id === id ? { ...eq, level } : eq,
        ]),
      ),
    ]),
  ) as CosmeticLoadout['cards'];
  return { slots, cards };
}

// ---- equipping ---------------------------------------------------------------------------------

export type EquipResult =
  | { ok: true; state: GameState }
  | {
      ok: false;
      /** `invalid`: wrong slot, a card-exclusive used globally or on another card, ... */
      reason: 'unknown' | 'not-owned' | 'invalid';
      message?: string;
    };

/**
 * Equips an owned item in its slot at its level: globally, or on one card (card slots only;
 * card-exclusives only on their card). Below the card's wear rank it is equipped but the card
 * shows the starter until it ranks up (see `resolveCardFor`).
 */
export function equipCosmetic(
  state: GameState,
  content: Content,
  cosmeticId: string,
  cardId?: string,
): EquipResult {
  const cosmetic = content.cosmeticById.get(cosmeticId);
  if (!cosmetic) return { ok: false, reason: 'unknown' };
  const owned = state.cosmetics.owned[cosmeticId];
  if (!owned) return { ok: false, reason: 'not-owned' };
  const equipped = { id: cosmeticId, level: owned.level };
  const problem = equipProblem(content, cosmetic.slot, equipped, cardId);
  if (problem) return { ok: false, reason: 'invalid', message: problem };
  const next = cloneState(state);
  next.cosmetics.loadout = equip(content, state.cosmetics.loadout, cosmetic.slot, equipped, cardId);
  return { ok: true, state: next };
}

/** Clears a slot: globally back to the starter, or on a card back to the global choice. */
export function unequipCosmetic(
  state: GameState,
  content: Content,
  slot: CosmeticSlot,
  cardId?: string,
): GameState {
  const next = cloneState(state);
  if (cardId !== undefined) {
    if ((CARD_SLOTS as readonly string[]).includes(slot)) {
      next.cosmetics.loadout = unequipCard(state.cosmetics.loadout, cardId, slot as CardSlot);
    }
    return next;
  }
  const slots = { ...state.cosmetics.loadout.slots };
  delete slots[slot];
  next.cosmetics.loadout = { ...state.cosmetics.loadout, slots };
  return next;
}

/** What an owned card shows (its card slots after its rank's wear rules). Null if not owned. */
export function resolveCardFor(
  state: GameState,
  content: Content,
  cardId: string,
): ResolvedCard | null {
  const card = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!card || !owned) return null;
  return resolveCard(content, state.cosmetics.loadout, {
    id: cardId,
    rank: { tier: owned.tier, stars: owned.stars },
    rarity: card.rarity,
  });
}

// ---- views for the Wardrobe screen -------------------------------------------------------------

/** Where an item comes from (DESIGN.md 7 "Sources"). */
export type CosmeticSource = 'starter' | 'dungeon' | 'prestige' | 'portal' | 'achievement';

/** The source of an item, or null when none is defined (content validation forbids that). */
export function cosmeticSource(content: Content, cosmeticId: string): CosmeticSource | null {
  const cosmetic = content.cosmeticById.get(cosmeticId);
  if (!cosmetic) return null;
  if (cosmetic.starter) return 'starter';
  if (content.dungeons.some((d) => d.drops.rare.itemId === cosmeticId)) return 'dungeon';
  if (content.prestige.rewards.some((r) => r.cosmetics.includes(cosmeticId))) return 'prestige';
  if (content.allPortals.some((p) => p.pool.some((e) => e.itemId === cosmeticId))) {
    return 'portal';
  }
  return null;
}

export interface WardrobeItem {
  cosmetic: Cosmetic;
  owned: boolean;
  /** Owned level (0 when not owned). */
  level: number;
  maxLevel: number;
  copies: number;
  /** What the next level adds, or null at the max (or when not owned). */
  nextStep: LadderStep | null;
  upgrade: CosmeticUpgradeCheck | null;
  /** True at the max level: the ambient animation shows. */
  maxed: boolean;
  source: CosmeticSource | null;
  /** Worn in its global slot. */
  equippedGlobally: boolean;
  /** Cards it is equipped on. */
  equippedOnCards: string[];
  /** Card rank needed to wear it on a card; null when always worn (global slots, starters). */
  wearRank: Rank | null;
  /** The buff for owning it. */
  ownedModifiers: Cosmetic['ownedModifiers'];
}

/** Every cosmetic in content order, ready for the item grid. */
export function wardrobeItems(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): WardrobeItem[] {
  const loadout = state.cosmetics.loadout;
  return content.cosmetics.map((cosmetic) => {
    const owned = state.cosmetics.owned[cosmetic.id];
    const maxLevel = cosmeticMaxLevel(content, cosmetic);
    const upgrade = owned ? cosmeticUpgradeCheck(state, content, cosmetic.id, modifiers) : null;
    const global = loadout.slots[cosmetic.slot];
    return {
      cosmetic,
      owned: !!owned,
      level: owned?.level ?? 0,
      maxLevel,
      copies: owned?.copies ?? 0,
      nextStep: upgrade?.step ?? null,
      upgrade,
      maxed: !!owned && owned.level >= maxLevel,
      source: cosmeticSource(content, cosmetic.id),
      equippedGlobally: cosmetic.starter ? !global : global?.id === cosmetic.id,
      equippedOnCards: Object.entries(loadout.cards)
        .filter(([, slots]) => Object.values(slots).some((eq) => eq?.id === cosmetic.id))
        .map(([card]) => card),
      wearRank: wearRequirement(content, cosmetic),
      ownedModifiers: cosmetic.ownedModifiers,
    };
  });
}

export interface SetBonusInfo {
  set: CosmeticSet;
  equipped: number;
  total: number;
  complete: boolean;
}

/** Each set's progress and bonus (the bonus applies when complete). */
export function setBonuses(state: GameState, content: Content): SetBonusInfo[] {
  return detectSets(content, state.cosmetics.loadout).flatMap((s) => {
    const set = content.setById.get(s.set);
    return set ? [{ set, equipped: s.equipped, total: s.total, complete: s.complete }] : [];
  });
}
