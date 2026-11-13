import type {
  CardSlot,
  Content,
  Cosmetic,
  CosmeticSet,
  CosmeticSlot,
  LadderStep,
  Rank,
  RankTier,
  Rarity,
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
 * The Wardrobe (DESIGN.md §8): owning, equipping and upgrading cosmetics. Owning an item
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

/** What each level adds, level 1 first (DESIGN.md §8 ladder; length = the max level). */
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

/**
 * Where an item comes from (DESIGN.md §8 "Sources"): the first that applies. `track` = the account
 * reward track, `shop` = the shard shop.
 */
export type CosmeticSource =
  'starter' | 'dungeon' | 'prestige' | 'portal' | 'achievement' | 'track' | 'shop';

/** The source of an item, or null when none is defined (content validation forbids that). */
export function cosmeticSource(content: Content, cosmeticId: string): CosmeticSource | null {
  const cosmetic = content.cosmeticById.get(cosmeticId);
  if (!cosmetic) return null;
  if (cosmetic.starter || cosmetic.ownedAtStart) return 'starter';
  if (content.dungeons.some((d) => d.drops.rare.itemId === cosmeticId)) return 'dungeon';
  if (content.prestige.rewards.some((r) => r.cosmetics.includes(cosmeticId))) return 'prestige';
  if (content.achievements.some((a) => a.reward.cosmetics.includes(cosmeticId))) {
    return 'achievement';
  }
  if (content.account.rewardTrack.some((r) => r.cosmetics.includes(cosmeticId))) return 'track';
  if (content.allPortals.some((p) => p.pool.some((e) => e.itemId === cosmeticId))) {
    return 'portal';
  }
  if (
    content.shardShop.some((i) => i.reward.kind === 'cosmetic' && i.reward.cosmetic === cosmeticId)
  ) {
    return 'shop';
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

// ---- weapon skins ------------------------------------------------------------------------------

/** Whether a legacy skin is owned (pulled from the Legacy Gate). */
export function ownsLegacySkin(state: GameState, skinId: string): boolean {
  return state.legacySkins.includes(skinId);
}

/** Whether a skin of that weapon exists and can be worn: free skins (cost 0) always, legacy skins once owned. */
export function isWeaponSkinAvailable(
  state: GameState,
  content: Content,
  weaponKind: string,
  skinId: string,
): boolean {
  const skin = content.weaponSkinsByWeapon.get(weaponKind)?.skins.find((s) => s.id === skinId);
  if (!skin) return false;
  return skin.legacy ? ownsLegacySkin(state, skin.id) : skin.cost === 0;
}

/** The skin id chosen for a weapon kind (for example `soul_reaper`), or null = the unskinned weapon. */
export function weaponSkinFor(state: GameState, weaponKind: string): string | null {
  return state.weaponSkins[weaponKind] ?? null;
}

/**
 * The art id to draw for a weapon kind: its chosen skin's art, else the weapon's base art. Null if
 * it has no skins, or it is a generic kind (no single base art) with no skin worn.
 */
export function weaponSkinArt(
  state: GameState,
  content: Content,
  weaponKind: string,
): string | null {
  const set = content.weaponSkinsByWeapon.get(weaponKind);
  if (!set) return null;
  const chosen = weaponSkinFor(state, weaponKind);
  return set.skins.find((s) => s.id === chosen)?.art ?? set.baseArt ?? null;
}

/**
 * The art a card's generic weapon (`itemKind`, e.g. 'staff') is drawn with at `tier` when a legacy
 * skin is worn: it covers every rarity and every tier below Heirloom. Null when nothing legacy is
 * worn for that kind, or at the Heirloom tier (the Heirloom keeps its own art and skins).
 */
export function legacyWeaponArt(
  state: GameState,
  content: Content,
  itemKind: string,
  tier: RankTier,
): string | null {
  if (tier === 'heirloom') return null;
  const chosen = weaponSkinFor(state, itemKind);
  const entry = chosen ? content.legacySkinById.get(chosen) : undefined;
  if (!entry || entry.weapon !== itemKind || !ownsLegacySkin(state, entry.skin.id)) return null;
  return entry.skin.art;
}

/** One skin in the picker. */
export interface WeaponSkinChoice {
  id: string;
  name: string;
  /** Art id to draw this skin with. */
  art: string;
  cost: number;
  /** A legacy skin (shown in the "Legacy" group). */
  legacy: boolean;
  /** A legacy skin's rarity; null for other skins. */
  rarity: Rarity | null;
  /** Owned: a legacy skin pulled from the Legacy Gate, or any free skin. Locked when false. */
  owned: boolean;
  /** Can be equipped now. */
  available: boolean;
  /** The one currently worn. */
  equipped: boolean;
}

/** Every skin of a weapon kind, in order (empty if it has none). */
export function weaponSkinChoices(
  state: GameState,
  content: Content,
  weaponKind: string,
): WeaponSkinChoice[] {
  const chosen = weaponSkinFor(state, weaponKind);
  return (content.weaponSkinsByWeapon.get(weaponKind)?.skins ?? []).map((s) => {
    const available = isWeaponSkinAvailable(state, content, weaponKind, s.id);
    return {
      id: s.id,
      name: s.name,
      art: s.art,
      cost: s.cost,
      legacy: s.legacy === true,
      rarity: s.rarity ?? null,
      owned: s.legacy ? ownsLegacySkin(state, s.id) : s.cost === 0,
      available,
      equipped: s.id === chosen,
    };
  });
}

export type EquipWeaponSkinResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'unknown-weapon' | 'unknown-skin' | 'unavailable' };

/** Wears a skin on a weapon kind, or `null` to go back to the unskinned weapon. Does not touch cosmetic slots. */
export function equipWeaponSkin(
  state: GameState,
  content: Content,
  weaponKind: string,
  skinId: string | null,
): EquipWeaponSkinResult {
  const set = content.weaponSkinsByWeapon.get(weaponKind);
  if (!set) return { ok: false, reason: 'unknown-weapon' };
  const next = cloneState(state);
  if (skinId === null) {
    delete next.weaponSkins[weaponKind];
    return { ok: true, state: next };
  }
  if (!set.skins.some((s) => s.id === skinId)) return { ok: false, reason: 'unknown-skin' };
  if (!isWeaponSkinAvailable(state, content, weaponKind, skinId)) {
    return { ok: false, reason: 'unavailable' };
  }
  next.weaponSkins[weaponKind] = skinId;
  return { ok: true, state: next };
}
