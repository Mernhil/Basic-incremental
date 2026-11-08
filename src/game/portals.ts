import { RARITIES, type Content, type Portal, type Rarity } from '../data';
import { grantCard } from './cards';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { canAfford, finalPrice, pay, type Price } from './production';
import type { CardGain } from './report';
import type { Rng } from './rng';
import type { GameState, PortalCounters } from './state';
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
  gain: CardGain | CosmeticGain;
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

/** Picks by weight among the entries at or above `min` (the whole pool when null). */
function pick(portal: Portal, min: Rarity | null, rng: Rng): PoolEntry {
  const entries = min ? portal.pool.filter((e) => atLeast(e.rarity, min)) : portal.pool;
  const list = entries.length > 0 ? entries : portal.pool;
  const total = list.reduce((a, e) => a + e.weight, 0);
  let roll = rng() * total;
  for (const entry of list) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return list[list.length - 1]!;
}

/** Adds one pulled item to the collection (mutates `state`, a fresh copy). */
function grantItem(state: GameState, content: Content, portal: Portal, itemId: string) {
  if (portal.kind === 'cards') {
    return grantCard(state.cards, content, content.cardById.get(itemId)!);
  }
  return grantCosmetic(state, itemId);
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
  let guaranteeMet = false;
  const results: PullResult[] = [];
  for (let i = 0; i < count; i++) {
    const byPity = pity + 1 >= threshold;
    const needsGuarantee = count === 10 && i === count - 1 && !guaranteeMet && !byPity;
    const entry = byPity
      ? pick(portal, portal.pity.rarity, rng)
      : needsGuarantee
        ? pick(portal, portal.tenPullGuarantee, rng)
        : pick(portal, null, rng);
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
