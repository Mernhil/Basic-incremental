import { RARITIES, type Content, type Portal, type Rarity } from '../data';
import { Decimal } from './num';
import { grantCard } from './cards';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { canAfford, finalPrice, pay, type Price } from './production';
import type { CardGain } from './report';
import type { Rng } from './rng';
import { cloneState, type GameState, type PortalCounters } from './state';
import { grantCosmetic } from './wardrobe';
import { grantAccountXp } from './account';

/**
 * Summon portals (DESIGN.md §7, "Beta portals"): one engine for every portal (the Card Portal now,
 * the Wardrobe Gate with the Wardrobe). A single pull costs `cost.single`, a 10-pull `cost.ten`;
 * every 10-pull holds at least one item of `tenPullGuarantee` or better; hard pity gives the pity
 * rarity or better once `threshold - 1` pulls in a row missed it. Counters are per portal, saved,
 * and kept through prestige. Prices go through `cost.multiplier` (scope: portal, resource), the
 * pity threshold through `summon.pityThreshold` (scope: portal).
 */

/** Pulls per button: a single pull or a 10-pull. */
export type PullCount = 1 | 10;

/** What a cosmetic pulled turned into: a new item, or a copy that feeds its upgrade levels. */
export type CosmeticGain = { kind: 'new' } | { kind: 'copy'; copies: number };

/**
 * What a legacy skin pulled turned into: a skin not owned before, or a repeat that paid part of
 * the pull back in the portal's currency (`amount` of `resource`).
 */
export type SkinGain = { kind: 'new' } | { kind: 'payback'; resource: string; amount: Decimal };

/** One pull, in order, ready for the reveal. */
export interface PullResult {
  itemId: string;
  rarity: Rarity;
  /** The orb's colour before the card flips: the rarity, or one lower when it upgrade-flashes. */
  orb: Rarity;
  /** Given by hard pity. */
  pity: boolean;
  /** Upgraded by the 10-pull guarantee. */
  guaranteed: boolean;
  /** What it became in the collection. */
  gain: CardGain | CosmeticGain | SkinGain;
}

export type PullFailure =
  /** No portal with that id. */
  | 'unknown'
  /** Not 1 or 10. */
  | 'invalid-count'
  /** Not enough of the portal resource. */
  | 'unaffordable';

export type PullOutcome =
  { ok: true; state: GameState; results: PullResult[] } | { ok: false; reason: PullFailure };

const rarityRank = (r: Rarity): number => RARITIES.indexOf(r);
const atLeast = (r: Rarity, min: Rarity): boolean => rarityRank(r) >= rarityRank(min);

function counters(state: GameState, portalId: string): PortalCounters {
  return state.portals[portalId] ?? { pity: 0, pulls: 0, pityHits: 0 };
}

/** The price of a single pull or a 10-pull, through `cost.multiplier`. */
export function pullPrice(
  portal: Portal,
  count: PullCount,
  modifiers: readonly Modifier[] = [],
): Price {
  const amount = count === 10 ? portal.cost.ten : portal.cost.single;
  return finalPrice(portal.cost.resource, amount, modifiers, { portal: portal.id });
}

/** Pulls in a row without the pity rarity before the next one is guaranteed (at least 1). */
export function pityThreshold(portal: Portal, modifiers: readonly Modifier[] = []): number {
  const value = statValue('summon.pityThreshold', portal.pity.threshold, modifiers, {
    portal: portal.id,
  });
  return Math.max(1, Math.round(value.toNumber()));
}

type PoolEntry = Portal['pool'][number];

/**
 * Picks by weight among the entries at or above `min` (the whole pool when null). With a
 * `wishlist`, a pick that lands on a rarity with marked cards is redirected to one of them,
 * chosen with the pool's weights among the marked cards of that rarity (DESIGN.md §7 Wishlist).
 * The redirect reuses what is left of the same roll (where it fell inside the entry it hit, which
 * is uniform and independent of the rarity), so it draws nothing extra: the chance of each rarity
 * and the whole random stream are the same with and without a wishlist.
 */
function pick(
  portal: Portal,
  min: Rarity | null,
  rng: Rng,
  wishlist: ReadonlySet<string> | null = null,
): PoolEntry {
  const entries = min ? portal.pool.filter((e) => atLeast(e.rarity, min)) : portal.pool;
  const list = entries.length > 0 ? entries : portal.pool;
  const total = list.reduce((a, e) => a + e.weight, 0);
  let roll = rng() * total;
  let hit = list[list.length - 1]!;
  let inside = 0.999999;
  for (const entry of list) {
    if (roll < entry.weight) {
      hit = entry;
      inside = roll / entry.weight;
      break;
    }
    roll -= entry.weight;
  }
  if (!wishlist) return hit;
  const marked = portal.pool.filter((e) => e.rarity === hit.rarity && wishlist.has(e.itemId));
  if (marked.length === 0) return hit;
  let target = inside * marked.reduce((a, e) => a + e.weight, 0);
  for (const entry of marked) {
    if (target < entry.weight) return entry;
    target -= entry.weight;
  }
  return marked[marked.length - 1]!;
}

/** The marked cards of a portal's pool, or null when the portal has no wishlist or none is marked. */
function wishlistOf(state: GameState, portal: Portal): ReadonlySet<string> | null {
  if (portal.kind !== 'cards' || portal.wishlistPerRarity <= 0) return null;
  const marked = new Set(
    state.cards.wishlist.filter((id) => portal.pool.some((e) => e.itemId === id)),
  );
  return marked.size > 0 ? marked : null;
}

/** Adds one pulled item to the collection (mutates `state`, a fresh copy). */
function grantItem(state: GameState, content: Content, portal: Portal, itemId: string) {
  if (portal.kind === 'cards') {
    return grantCard(state.cards, content, content.cardById.get(itemId)!);
  }
  if (portal.kind === 'skins') return grantLegacySkin(state, portal, itemId);
  return grantCosmetic(state, itemId);
}

/** A new legacy skin becomes owned; one already owned pays back a fraction of a single pull. */
function grantLegacySkin(state: GameState, portal: Portal, skinId: string): SkinGain {
  if (!state.legacySkins.includes(skinId)) {
    state.legacySkins.push(skinId);
    return { kind: 'new' };
  }
  const resource = portal.cost.resource;
  const amount = new Decimal(portal.cost.single).mul(portal.duplicatePayback).round();
  state.resources[resource] = (state.resources[resource] ?? new Decimal(0)).add(amount);
  return { kind: 'payback', resource, amount };
}

/**
 * Pulls `count` (1 or 10) times from a portal: pays, rolls every pull in order (hard pity first,
 * then the 10-pull guarantee on the last pull if nothing so far reached it) and adds the items
 * to the collection. Duplicates follow the usual rules (cards: duplicates, then shards).
 */
export function pull(
  state: GameState,
  content: Content,
  portalId: string,
  count: PullCount,
  rng: Rng,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): PullOutcome {
  const portal = content.portals.find((p) => p.id === portalId);
  if (!portal) return { ok: false, reason: 'unknown' };
  if (count !== 1 && count !== 10) return { ok: false, reason: 'invalid-count' };
  const price = pullPrice(portal, count, modifiers);
  if (!canAfford(state, [price])) return { ok: false, reason: 'unaffordable' };

  const next = pay(state, [price]);
  const threshold = pityThreshold(portal, modifiers);
  const lowest = portal.pool.reduce<Rarity>(
    (low, e) => (rarityRank(e.rarity) < rarityRank(low) ? e.rarity : low),
    portal.pool[0]!.rarity,
  );
  let { pity, pulls, pityHits } = counters(state, portalId);
  const wishlist = wishlistOf(state, portal);
  let guaranteeMet = false;
  const results: PullResult[] = [];
  for (let i = 0; i < count; i++) {
    const byPity = pity + 1 >= threshold;
    const needsGuarantee = count === 10 && i === count - 1 && !guaranteeMet && !byPity;
    const entry = byPity
      ? pick(portal, portal.pity.rarity, rng, wishlist)
      : needsGuarantee
        ? pick(portal, portal.tenPullGuarantee, rng, wishlist)
        : pick(portal, null, rng, wishlist);
    const flash = rng() < portal.reveal.upgradeFlashChance && entry.rarity !== lowest;
    const orb = flash ? RARITIES[rarityRank(entry.rarity) - 1]! : entry.rarity;
    results.push({
      itemId: entry.itemId,
      rarity: entry.rarity,
      orb,
      pity: byPity,
      guaranteed: needsGuarantee,
      gain: grantItem(next, content, portal, entry.itemId),
    });
    if (atLeast(entry.rarity, portal.tenPullGuarantee)) guaranteeMet = true;
    pity = atLeast(entry.rarity, portal.pity.rarity) ? 0 : pity + 1;
    pulls += 1;
    if (byPity) pityHits += 1;
  }
  next.portals[portalId] = { pity, pulls, pityHits };
  grantAccountXp(next, content, content.account.xp.perPull.mul(count), modifiers);
  return { ok: true, state: next, results };
}

export type WishlistFailure = 'unknown' | 'full';

/**
 * Marks or unmarks a card of a card portal's pool (DESIGN.md §7 Wishlist). At most
 * `wishlistPerRarity` cards per rarity can be marked; the order marked is kept. Unmarking always
 * works; marking an already marked card changes nothing.
 */
export function setWishlisted(
  state: GameState,
  content: Content,
  cardId: string,
  marked: boolean,
  portalId = 'card_portal',
): { ok: true; state: GameState } | { ok: false; reason: WishlistFailure } {
  const portal = content.portals.find((p) => p.id === portalId);
  const entry = portal?.pool.find((e) => e.itemId === cardId);
  if (!portal || !entry || portal.kind !== 'cards') return { ok: false, reason: 'unknown' };
  const has = state.cards.wishlist.includes(cardId);
  if (marked === has) return { ok: true, state };
  if (marked) {
    const same = state.cards.wishlist.filter(
      (id) => portal.pool.find((e) => e.itemId === id)?.rarity === entry.rarity,
    ).length;
    if (same >= portal.wishlistPerRarity) return { ok: false, reason: 'full' };
  }
  const next = cloneState(state);
  next.cards.wishlist = marked
    ? [...state.cards.wishlist, cardId]
    : state.cards.wishlist.filter((id) => id !== cardId);
  return { ok: true, state: next };
}

/** A portal's wishlist for the Summon page: the pool's cards by rarity with what is marked. */
export interface WishlistInfo {
  /** At least one card of this portal is marked: pulls are redirected. */
  active: boolean;
  byRarity: {
    rarity: Rarity;
    limit: number;
    marked: number;
    cards: { itemId: string; marked: boolean }[];
  }[];
}

/** Null for an unknown portal or one with no wishlist. */
export function wishlistView(
  state: GameState,
  content: Content,
  portalId: string,
): WishlistInfo | null {
  const portal = content.portals.find((p) => p.id === portalId);
  if (!portal || portal.kind !== 'cards' || portal.wishlistPerRarity <= 0) return null;
  const set = state.cards.wishlist;
  const byRarity = RARITIES.filter((r) => portal.pool.some((e) => e.rarity === r)).map((rarity) => {
    const cards = portal.pool
      .filter((e) => e.rarity === rarity)
      .map((e) => ({ itemId: e.itemId, marked: set.includes(e.itemId) }));
    return {
      rarity,
      limit: portal.wishlistPerRarity,
      marked: cards.filter((c) => c.marked).length,
      cards,
    };
  });
  return { active: byRarity.some((r) => r.marked > 0), byRarity };
}

export interface PortalInfo {
  portal: Portal;
  /** Single pull and 10-pull: price and whether it is affordable now. */
  single: { price: Price; affordable: boolean };
  ten: { price: Price; affordable: boolean };
  /** Hard pity: the rarity it gives, pulls since the last one, the threshold and a bar 0..1. */
  pity: { rarity: Rarity; count: number; threshold: number; progress: number };
  /** Every 10-pull holds at least one of this rarity or better. */
  tenPullGuarantee: Rarity;
  /** Chance per normal pull: by rarity (lowest first, only rarities in the pool) and by item. */
  rates: {
    byRarity: { rarity: Rarity; chance: number }[];
    byItem: { itemId: string; rarity: Rarity; chance: number }[];
  };
  /** Pulls made from this portal, ever. */
  pulls: number;
}

/** Everything a portal card on the Summon shelf shows. Null for unknown ids. */
export function portalInfo(
  state: GameState,
  content: Content,
  portalId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): PortalInfo | null {
  const portal = content.portals.find((p) => p.id === portalId);
  if (!portal) return null;
  const offer = (count: PullCount) => {
    const price = pullPrice(portal, count, modifiers);
    return { price, affordable: canAfford(state, [price]) };
  };
  const c = counters(state, portalId);
  const threshold = pityThreshold(portal, modifiers);
  const total = portal.pool.reduce((a, e) => a + e.weight, 0);
  const byRarity = RARITIES.map((rarity) => ({
    rarity,
    chance:
      portal.pool.filter((e) => e.rarity === rarity).reduce((a, e) => a + e.weight, 0) / total,
  })).filter((r) => r.chance > 0);
  return {
    portal,
    single: offer(1),
    ten: offer(10),
    pity: {
      rarity: portal.pity.rarity,
      count: c.pity,
      threshold,
      progress: Math.min(1, c.pity / threshold),
    },
    tenPullGuarantee: portal.tenPullGuarantee,
    rates: {
      byRarity,
      byItem: portal.pool.map((e) => ({
        itemId: e.itemId,
        rarity: e.rarity,
        chance: e.weight / total,
      })),
    },
    pulls: c.pulls,
  };
}
