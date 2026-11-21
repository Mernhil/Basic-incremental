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
import { settleTierRewards, tierComplete } from './tierRewards';

/** The Focus Portal (DESIGN.md §7): the Card Portal aimed at one item type. */
export const FOCUS_PORTAL_ID = 'focus_portal';
/** The portal whose price, rates and pity the Focus Portal shares. */
export const FOCUS_BASE_PORTAL_ID = 'card_portal';

/**
 * Summon portals (DESIGN.md §7, "Beta portals"): one engine for every portal (the Card Portal now,
 * the Wardrobe Gate with the Wardrobe). A single pull costs `cost.single`, a 10-pull `cost.ten`;
 * every 10-pull holds at least one item of `tenPullGuarantee` or better; hard pity gives the pity
 * rarity or better once `threshold - 1` pulls in a row missed it. A card portal goes by tier
 * (DESIGN.md §7): its entries, pity and guarantee carry the tier as its ladder step (`rarity`
 * here is `gradeStyle` of the card's grade, see `portalSchema`), and a pulled card is gained at
 * its own tier. Counters are per portal, saved,
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
  | 'unaffordable'
  /** The Focus Portal has no item type chosen. */
  | 'no-focus';

export type PullOutcome =
  { ok: true; state: GameState; results: PullResult[] } | { ok: false; reason: PullFailure };

const rarityRank = (r: Rarity): number => RARITIES.indexOf(r);
const atLeast = (r: Rarity, min: Rarity): boolean => rarityRank(r) >= rarityRank(min);

/** A portal as pulls see it: the pool to draw from, and the portal that holds its price, pity and counters. */
export interface ResolvedPortal {
  /** The portal to draw from (the Focus Portal's pool is cut to its item type). */
  portal: Portal;
  /** Where the price, the pity threshold, the rates' scope and the counters live. */
  base: Portal;
}

/**
 * Finds a portal by id. The Focus Portal is not in `portals.json`: it is the Card Portal with
 * its pool cut to the cards of the chosen item type, each rarity keeping the whole chance it has
 * in the Card Portal (so the rarity rates are the same), and it shares that portal's counters
 * (DESIGN.md §7 Focus Portal details). With no type chosen its pool is empty.
 */
export function resolvePortal(
  state: GameState,
  content: Content,
  portalId: string,
): ResolvedPortal | null {
  if (portalId !== FOCUS_PORTAL_ID) {
    const portal = content.portals.find((p) => p.id === portalId);
    return portal ? { portal, base: portal } : null;
  }
  const base = content.portals.find((p) => p.id === FOCUS_BASE_PORTAL_ID);
  if (!base) return null;
  const kind = state.summon.focusKind;
  const matches = (itemId: string): boolean =>
    kind !== null && content.cardById.get(itemId)?.item.kind === kind;
  const pool: Portal['pool'] = [];
  for (const rarity of RARITIES) {
    const ofRarity = base.pool.filter((e) => e.rarity === rarity);
    const hits = ofRarity.filter((e) => matches(e.itemId));
    if (hits.length === 0) continue;
    const total = ofRarity.reduce((a, e) => a + e.weight, 0);
    for (const e of hits) pool.push({ ...e, weight: total / hits.length });
  }
  return { portal: { ...base, id: FOCUS_PORTAL_ID, name: 'Focus Portal', pool }, base };
}

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
 * The chance of each tier on one pull (lowest first, only tiers in the pool; they sum to 1)
 * (DESIGN.md §2 Summoning, Portal level, T6 pity). A portal with no levels uses its pool's own
 * weights. A card portal with levels reads the row of its level (from the pulls made, `pulls`):
 * a tier whose cards are not all at six stars keeps at least `minShare`, a tier whose cards all
 * are leaves the pool (its chance is 0, the rest grow to fill the gap). Once the pulls since the
 * last pity step reach `pity.softFrom`, the pity step's chance rises in a straight line to 1 at
 * the threshold: `pityPull` is the number of this pull in that run (1 = the first since a hit),
 * `threshold` the portal's threshold with modifiers.
 */
export function tierChances(
  state: GameState,
  content: Content,
  resolved: ResolvedPortal,
  pulls: number,
  pityPull = 0,
  threshold = resolved.base.pity.threshold,
): { rarity: Rarity; chance: number }[] {
  const { portal, base } = resolved;
  const weight = new Map<Rarity, number>();
  for (const e of portal.pool) weight.set(e.rarity, (weight.get(e.rarity) ?? 0) + e.weight);
  const present = RARITIES.filter((r) => weight.has(r));
  const row = base.levels.length > 0 ? base.levels[portalLevel(base, pulls) - 1]!.chances : null;
  let chance = new Map<Rarity, number>();
  if (!row) {
    const total = [...weight.values()].reduce((a, b) => a + b, 0) || 1;
    for (const r of present) chance.set(r, weight.get(r)! / total);
  } else {
    // a complete tier leaves the pool; an unfinished one keeps at least `minShare` (never more
    // than it had at level 1, so a rare tier is not lifted by the floor)
    const first = base.levels[0]!.chances;
    const kept = (r: Rarity): number =>
      tierComplete(state, content, r) ? 0 : Math.max(row[r], Math.min(base.minShare, first[r]));
    let share = kept;
    let total = present.reduce((a, r) => a + share(r), 0);
    if (total <= 0) {
      // every tier of the pool is complete: the level's own row, the pulls only pay shards
      share = (r: Rarity): number => row[r];
      total = present.reduce((a, r) => a + share(r), 0) || 1;
    }
    for (const r of present) chance.set(r, share(r) / total);
  }
  const soft = base.pity.softFrom;
  if (soft !== null && pityPull > soft) {
    const top = present.filter((r) => atLeast(r, base.pity.rarity));
    const p = top.reduce((a, r) => a + chance.get(r)!, 0);
    if (top.length > 0 && p > 0 && p < 1) {
      const from = Math.min(soft, threshold - 1);
      const t = Math.min(1, (pityPull - from) / Math.max(1, threshold - from));
      const raised = p + (1 - p) * t;
      const next = new Map<Rarity, number>();
      for (const r of present) {
        const scale = atLeast(r, base.pity.rarity) ? raised / p : (1 - raised) / (1 - p);
        next.set(r, chance.get(r)! * scale);
      }
      chance = next;
    }
  }
  return present.map((rarity) => ({ rarity, chance: chance.get(rarity)! }));
}

/** The level a portal is at after `pulls` pulls: 1 .. its number of levels (1 with no levels). */
export function portalLevel(portal: Portal, pulls: number): number {
  let level = 1;
  portal.levels.forEach((l, i) => {
    if (pulls >= l.pulls) level = i + 1;
  });
  return level;
}

/**
 * Picks a tier by `chances` among the tiers at or above `min` (all when null; their chances
 * renormalised, the pool's own weights when they are all 0), then a card of it by the pool's
 * weights. With a `wishlist`, a pick that lands on a tier with marked cards is redirected to one
 * of them, chosen with the pool's weights among the marked cards of that tier (DESIGN.md §7
 * Wishlist). One roll does both: where it fell inside the tier is uniform and independent of the
 * tier, so the card is chosen from it, and a wishlist redirect reuses it again; nothing extra is
 * drawn, so the chance of each tier and the random stream are the same with and without a wishlist.
 */
function pick(
  portal: Portal,
  chances: readonly { rarity: Rarity; chance: number }[],
  min: Rarity | null,
  rng: Rng,
  wishlist: ReadonlySet<string> | null = null,
): PoolEntry {
  let tiers = chances.filter((t) => (min ? atLeast(t.rarity, min) : true));
  if (tiers.length === 0) tiers = [...chances];
  let total = tiers.reduce((a, t) => a + t.chance, 0);
  if (total <= 0) {
    tiers = tiers.map((t) => ({
      rarity: t.rarity,
      chance: portal.pool.filter((e) => e.rarity === t.rarity).reduce((a, e) => a + e.weight, 0),
    }));
    total = tiers.reduce((a, t) => a + t.chance, 0) || 1;
  }
  let roll = rng() * total;
  let tier = tiers[tiers.length - 1]!;
  let inside = 0.999999;
  for (const t of tiers) {
    if (roll < t.chance) {
      tier = t;
      inside = roll / t.chance;
      break;
    }
    roll -= t.chance;
  }
  const ofTier = portal.pool.filter((e) => e.rarity === tier.rarity);
  const marked = wishlist ? ofTier.filter((e) => wishlist.has(e.itemId)) : [];
  const list = marked.length > 0 ? marked : ofTier;
  let target = inside * list.reduce((a, e) => a + e.weight, 0);
  for (const entry of list) {
    if (target < entry.weight) return entry;
    target -= entry.weight;
  }
  return list[list.length - 1]!;
}

/** The marked cards of a portal's pool, or null when the portal has no wishlist or none is marked. */
function wishlistOf(state: GameState, portal: Portal): ReadonlySet<string> | null {
  if (portal.kind !== 'cards' || portal.wishlistPerTier <= 0) return null;
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
  const amount = new Decimal(portal.cost.single).mul(portal.duplicatePayback);
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
  const resolved = resolvePortal(state, content, portalId);
  if (!resolved) return { ok: false, reason: 'unknown' };
  const { portal, base } = resolved;
  if (count !== 1 && count !== 10) return { ok: false, reason: 'invalid-count' };
  if (portal.pool.length === 0) return { ok: false, reason: 'no-focus' };
  const price = pullPrice(base, count, modifiers);
  if (!canAfford(state, [price])) return { ok: false, reason: 'unaffordable' };

  const next = pay(state, [price]);
  const threshold = pityThreshold(base, modifiers);
  const lowest = portal.pool.reduce<Rarity>(
    (low, e) => (rarityRank(e.rarity) < rarityRank(low) ? e.rarity : low),
    portal.pool[0]!.rarity,
  );
  let { pity, pulls, pityHits } = counters(state, base.id);
  const wishlist = wishlistOf(state, portal);
  // the first 10-pull of the Card Portal or the Focus Portal holds a Gold (DESIGN.md §2 Summoning)
  const first =
    count === 10 && base.firstTenPullGuarantee !== null && !state.summon.firstTenPullDone;
  const required = first ? base.firstTenPullGuarantee! : base.tenPullGuarantee;
  let guaranteeMet = false;
  const results: PullResult[] = [];
  for (let i = 0; i < count; i++) {
    const byPity = pity + 1 >= threshold && pityOpen(next, content, base);
    const needsGuarantee = count === 10 && i === count - 1 && !guaranteeMet && !byPity;
    const chances = tierChances(next, content, resolved, pulls, pity + 1, threshold);
    const entry = byPity
      ? pick(portal, chances, portal.pity.rarity, rng, wishlist)
      : needsGuarantee
        ? pick(portal, chances, required, rng, wishlist)
        : pick(portal, chances, null, rng, wishlist);
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
    if (atLeast(entry.rarity, required)) guaranteeMet = true;
    pity = atLeast(entry.rarity, portal.pity.rarity) ? 0 : pity + 1;
    pulls += 1;
    if (byPity) pityHits += 1;
  }
  next.portals[base.id] = { pity, pulls, pityHits };
  if (first) next.summon.firstTenPullDone = true;
  if (base.kind === 'cards') settleTierRewards(next, content);
  grantAccountXp(next, content, content.account.xp.perPull.mul(count), modifiers);
  return { ok: true, state: next, results };
}

/**
 * Hard pity can give something: a card portal with levels has at least one tier of the pity step
 * or better with a card still below six stars (else its pity pull would only pay shards). Every
 * other portal always can.
 */
function pityOpen(state: GameState, content: Content, base: Portal): boolean {
  if (base.levels.length === 0) return true;
  return base.pool.some(
    (e) => atLeast(e.rarity, base.pity.rarity) && !tierComplete(state, content, e.rarity),
  );
}

export type WishlistFailure = 'unknown' | 'full';

/**
 * Marks or unmarks a card of a card portal's pool (DESIGN.md §7 Wishlist). At most
 * `wishlistPerTier` cards per rarity can be marked; the order marked is kept. Unmarking always
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
    if (same >= portal.wishlistPerTier) return { ok: false, reason: 'full' };
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
  if (!portal || portal.kind !== 'cards' || portal.wishlistPerTier <= 0) return null;
  const set = state.cards.wishlist;
  const byRarity = RARITIES.filter((r) => portal.pool.some((e) => e.rarity === r)).map((rarity) => {
    const cards = portal.pool
      .filter((e) => e.rarity === rarity)
      .map((e) => ({ itemId: e.itemId, marked: set.includes(e.itemId) }));
    return {
      rarity,
      limit: portal.wishlistPerTier,
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
  /** Hard pity: the rarity it gives, pulls since the last one, the threshold and a bar 0..1.
   *  `softFrom` is where its chance starts to rise (null = it does not); `open` is false when
   *  every tier of it is complete, so it gives nothing more. */
  pity: {
    rarity: Rarity;
    count: number;
    threshold: number;
    progress: number;
    softFrom: number | null;
    open: boolean;
  };
  /** Every 10-pull holds at least one of this rarity or better. */
  tenPullGuarantee: Rarity;
  /** The first 10-pull of a new game holds this rarity or better; null once made (or never). */
  firstTenPull: Rarity | null;
  /** The portal's level (DESIGN.md §2 Summoning, Portal level); null for a portal with none. */
  level: PortalLevelInfo | null;
  /** Chance per next pull, with the level and the rise of the pity counted: by rarity (lowest
   *  first, only rarities in the pool) and by item. */
  rates: {
    byRarity: { rarity: Rarity; chance: number }[];
    byItem: { itemId: string; rarity: Rarity; chance: number }[];
  };
  /** Pulls made from this portal, ever. */
  pulls: number;
}

/** A portal's level: where it stands and how far the next one is. */
export interface PortalLevelInfo {
  /** 1-based, and the number of levels. */
  level: number;
  levels: number;
  pulls: number;
  /** Pulls at which this level started, and the next level starts (null at the top). */
  from: number;
  next: number | null;
  /** Progress inside the level, 0..1 (1 at the top). */
  progress: number;
}

/** Everything a portal card on the Summon shelf shows. Null for unknown ids. */
export function portalInfo(
  state: GameState,
  content: Content,
  portalId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): PortalInfo | null {
  const resolved = resolvePortal(state, content, portalId);
  if (!resolved) return null;
  const { portal, base } = resolved;
  const offer = (count: PullCount) => {
    const price = pullPrice(base, count, modifiers);
    // a Focus Portal with no item type chosen has nothing to pull
    return { price, affordable: portal.pool.length > 0 && canAfford(state, [price]) };
  };
  const c = counters(state, base.id);
  const threshold = pityThreshold(base, modifiers);
  const byRarity = tierChances(state, content, resolved, c.pulls, c.pity + 1, threshold).filter(
    (r) => r.chance > 0,
  );
  const tierWeight = (r: Rarity): number =>
    portal.pool.filter((e) => e.rarity === r).reduce((a, e) => a + e.weight, 0) || 1;
  const chanceOf = new Map(byRarity.map((r) => [r.rarity, r.chance]));
  let level: PortalLevelInfo | null = null;
  if (base.levels.length > 0) {
    const n = portalLevel(base, c.pulls);
    const from = base.levels[n - 1]!.pulls;
    const next = base.levels[n]?.pulls ?? null;
    level = {
      level: n,
      levels: base.levels.length,
      pulls: c.pulls,
      from,
      next,
      progress: next === null ? 1 : (c.pulls - from) / (next - from),
    };
  }
  return {
    portal,
    single: offer(1),
    ten: offer(10),
    pity: {
      rarity: portal.pity.rarity,
      count: c.pity,
      threshold,
      progress: Math.min(1, c.pity / threshold),
      softFrom: portal.pity.softFrom,
      open: pityOpen(state, content, base),
    },
    tenPullGuarantee: portal.tenPullGuarantee,
    firstTenPull: state.summon.firstTenPullDone ? null : base.firstTenPullGuarantee,
    level,
    rates: {
      byRarity,
      byItem: portal.pool.map((e) => ({
        itemId: e.itemId,
        rarity: e.rarity,
        chance: (chanceOf.get(e.rarity) ?? 0) * (e.weight / tierWeight(e.rarity)),
      })),
    },
    pulls: c.pulls,
  };
}
