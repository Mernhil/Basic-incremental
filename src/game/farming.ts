import type { Content, Dungeon, FarmingConfig } from '../data';
import { addHeirloomShards, heirloomCards } from './heirlooms';
import {
  heirloomCount,
  loadoutCards,
  loadoutCost,
  loadoutCostCap,
  MAX_LOADOUT_HEIRLOOMS,
  MAX_LOADOUT_STARTERS,
  starterCount,
  type CardFailure,
} from './cards';
import { floorPosition } from './floors';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import type { Rng } from './rng';
import {
  clonePost,
  cloneState,
  initialPost,
  isOnTrip,
  LOADOUT_SLOTS,
  type Difficulty,
  type FarmPost,
  type GameState,
} from './state';

/**
 * Farming posts (DESIGN.md §2 A team farms a finished dungeon). A dungeon whose every floor is
 * beaten on a difficulty opens a post: up to four fighting cards sit there and earn a share of
 * what fighting the dungeon brings, alongside the main fight and through time away, with no fight
 * shown. The share grows with the highest difficulty finished. The post grows, not the cards: it
 * has a level (hours farmed by a full team), picks a trait every few levels, and an upgrade bought
 * with herb bundles. Every number is in `farming.json` and every bonus is a `farm.*` modifier.
 *
 * Earnings are rates per hour times the time, so splitting a span into steps gives the same
 * result; whole-unit drops carry their remainder in the post. Every function is pure except
 * `advanceFarming`, which mutates the fresh copy the tick owns.
 */

/** The difficulties a post pays for, lowest first. */
export const FARM_DIFFICULTIES = ['normal', 'hard', 'nightmare'] as const;
export type FarmDifficulty = (typeof FARM_DIFFICULTIES)[number];

export type FarmFailure =
  | CardFailure
  /** The dungeon's whole path is not finished yet (or it does not exist). */
  | 'locked'
  /** The card sits in the fighting loadout. */
  | 'in-loadout'
  /** The card sits in another dungeon's post. */
  | 'in-other-team'
  /** That trait is not on offer now. */
  | 'not-offered'
  /** Not enough herb bundles. */
  | 'no-herbs'
  /** Already at the top. */
  | 'max';

export type FarmResult = { ok: true; state: GameState } | { ok: false; reason: FarmFailure };

const HOUR_SECONDS = 3600;
const EPSILON = 1e-9;

const fail = (reason: FarmFailure): { ok: false; reason: FarmFailure } => ({ ok: false, reason });

/** The highest difficulty whose every floor is beaten, or null while none is (the post is shut). */
export function finishedDifficulty(
  state: GameState,
  content: Content,
  dungeonId: string,
): FarmDifficulty | null {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return null;
  let top: FarmDifficulty | null = null;
  for (const difficulty of FARM_DIFFICULTIES) {
    if (floorPosition(state, dungeon, difficulty).best < dungeon.floors) break;
    top = difficulty;
  }
  return top;
}

/** The post of a dungeon (a new one when it was never used). Not a copy to change. */
export function postOf(state: GameState, dungeonId: string): FarmPost {
  return state.farming.posts[dungeonId] ?? initialPost();
}

/** Where a card sits in a post, other than `except`: the dungeon id, or null. */
export function farmTeamOf(state: GameState, cardId: string, except?: string): string | null {
  for (const [id, post] of Object.entries(state.farming.posts)) {
    if (id !== except && post.team.includes(cardId)) return id;
  }
  return null;
}

// ---- the team ----------------------------------------------------------------------------------

/** Why this team cannot sit at the dungeon's post, or null when it can. */
export function farmTeamProblem(
  state: GameState,
  content: Content,
  dungeonId: string,
  slots: readonly (string | null)[],
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): FarmFailure | null {
  if (finishedDifficulty(state, content, dungeonId) === null) return 'locked';
  if (slots.length !== LOADOUT_SLOTS) return 'invalid-slot';
  const ids = loadoutCards({ slots: [...slots] });
  for (const id of ids) {
    const card = content.cardById.get(id);
    if (!card) return 'unknown';
    if (!state.cards.owned[id]) return 'not-owned';
    if (card.job !== 'fighting') return 'wrong-job';
    if (isOnTrip(state, id)) return 'on-expedition';
    if (state.cards.loadouts.fighting.slots.includes(id)) return 'in-loadout';
    if (farmTeamOf(state, id, dungeonId) !== null) return 'in-other-team';
  }
  if (new Set(ids).size !== ids.length) return 'duplicate';
  if (heirloomCount(content, ids) > MAX_LOADOUT_HEIRLOOMS) return 'too-many-heirlooms';
  if (starterCount(content, ids) > MAX_LOADOUT_STARTERS) return 'too-many-starters';
  const cost = loadoutCost(content, { slots: [...slots] }, state.cards.owned);
  if (cost > loadoutCostCap(state, content, 'fighting', modifiers)) return 'over-cost-cap';
  return null;
}

/** Puts a whole team (four slots, empty ones null) at the dungeon's post. */
export function setFarmTeam(
  state: GameState,
  content: Content,
  dungeonId: string,
  slots: readonly (string | null)[],
  modifiers?: readonly Modifier[],
): FarmResult {
  const problem = farmTeamProblem(state, content, dungeonId, slots, modifiers);
  if (problem) return fail(problem);
  const next = cloneState(state);
  const post = clonePost(postOf(next, dungeonId));
  post.team = [...slots];
  next.farming.posts[dungeonId] = post;
  return { ok: true, state: next };
}

/** Puts a card in one slot of the post's team, or empties the slot with `cardId` null. A card
 *  already in the team moves, swapping with what was in the target slot. */
export function setFarmSlot(
  state: GameState,
  content: Content,
  dungeonId: string,
  slot: number,
  cardId: string | null,
  modifiers?: readonly Modifier[],
): FarmResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= LOADOUT_SLOTS) return fail('invalid-slot');
  const slots = [...postOf(state, dungeonId).team];
  if (cardId !== null) {
    const from = slots.indexOf(cardId);
    if (from >= 0) slots[from] = slots[slot] ?? null;
  }
  slots[slot] = cardId;
  return setFarmTeam(state, content, dungeonId, slots, modifiers);
}

// ---- what a post earns -------------------------------------------------------------------------

/** What a post earns per hour (all zero while its team is empty or its path is not finished). */
export interface PostRates {
  difficulty: FarmDifficulty | null;
  /** Cards in the team. */
  cards: number;
  /** Money in coins an hour. */
  money: Decimal;
  /** The dungeon's own materials an hour, by resource id. */
  materials: Record<string, Decimal>;
  /** Farming-only drops an hour: Heirloom shards, scroll fragments and herb bundles. */
  shards: number;
  fragments: number;
  herbs: number;
  /** Post XP, in farming hours earned per hour. */
  xp: number;
}

const emptyRates = (difficulty: FarmDifficulty | null, cards: number): PostRates => ({
  difficulty,
  cards,
  money: new Decimal(0),
  materials: {},
  shards: 0,
  fragments: 0,
  herbs: 0,
  xp: 0,
});

/** Hours of farming a post level needs from a full team. */
export function postXpNeed(config: FarmingConfig, level: number): number {
  return config.level.baseHours * Math.pow(config.level.growth, level - 1);
}

/** The modifiers the post's traits give, scoped to its dungeon (`collectModifiers` adds them). */
export function farmingModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const [dungeonId, post] of Object.entries(state.farming.posts)) {
    for (const traitId of post.traits) {
      const trait = content.farming.traits.find((t) => t.id === traitId);
      if (!trait) continue;
      for (const m of trait.modifiers) {
        out.push({ ...m, scope: { dungeon: dungeonId }, source: { kind: 'farm', id: trait.id } });
      }
    }
  }
  return out;
}

/** The part of a dungeon's drop table that a roll pays on average, per boss-table roll. */
function tableAverage(dungeon: Dungeon): {
  money: number;
  materials: Array<{ resource: string; amount: number }>;
} {
  const drops = dungeon.drops;
  const money = drops.currencies
    .filter((c) => c.resource === 'money')
    .reduce((sum, c) => sum + (c.min + c.max) / 2, 0);
  const materials: Array<{ resource: string; amount: number }> = [];
  if (drops.material) {
    materials.push({
      resource: drops.material.resource,
      amount: drops.material.chance * drops.material.amount,
    });
  }
  for (const extra of drops.extraMaterials) {
    materials.push({
      resource: extra.resource,
      amount: extra.chance * ((extra.min + extra.max) / 2),
    });
  }
  return { money, materials };
}

/**
 * What the dungeon's post earns an hour now: the table's average roll, `rollsPerHour` times, times
 * the share of the highest difficulty finished, the team's fullness, the post level and upgrade,
 * and the `farm.*` stats (traits). `post` can be given when the caller is stepping it.
 */
export function farmPostRates(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
  post: FarmPost = postOf(state, dungeonId),
): PostRates {
  const dungeon = content.dungeonById.get(dungeonId);
  const difficulty = finishedDifficulty(state, content, dungeonId);
  const cards = loadoutCards({ slots: post.team }).length;
  if (!dungeon || difficulty === null || cards === 0) return emptyRates(difficulty, cards);
  const config = content.farming;
  const context = { dungeon: dungeonId };
  const growth: Modifier = {
    stat: 'farm.yield',
    kind: 'percent',
    value: new Decimal(
      (post.level - 1) * config.level.yieldPercent + post.upgrade * config.upgrade.yieldPercent,
    ),
    scope: context,
    source: { kind: 'farm', id: 'post' },
  };
  const all = [...modifiers, growth];
  const stat = (name: Parameters<typeof statValue>[0]): number =>
    statValue(name, 1, all, context).toNumber();
  const common =
    config.difficultyShare[difficulty] *
    (cards / LOADOUT_SLOTS) *
    stat('farm.speed') *
    stat('farm.yield');
  const average = tableAverage(dungeon);
  const rolls = config.rollsPerHour * common;
  const materials: Record<string, Decimal> = {};
  for (const m of average.materials) {
    if (m.amount <= 0) continue;
    const amount = new Decimal(m.amount * rolls * stat('farm.materials'));
    materials[m.resource] = (materials[m.resource] ?? new Decimal(0)).add(amount);
  }
  const perTier = (perHour: number, name: Parameters<typeof statValue>[0]): number =>
    perHour * dungeon.tier * common * stat(name);
  return {
    difficulty,
    cards,
    money: new Decimal(average.money * rolls * stat('farm.money')),
    materials,
    shards: perTier(config.perHourPerTier.heirloomShards, 'farm.shards'),
    fragments: perTier(config.perHourPerTier.scrollFragments, 'farm.fragments'),
    herbs: perTier(config.perHourPerTier.herbBundles, 'farm.herbs'),
    xp: (cards / LOADOUT_SLOTS) * stat('farm.speed') * stat('farm.xp'),
  };
}

/** Adds `hours` of a post's earnings to the state being stepped (mutates `next`). */
function payPost(
  next: GameState,
  content: Content,
  rng: Rng,
  dungeonId: string,
  post: FarmPost,
  rates: PostRates,
  hours: number,
): void {
  const config = content.farming;
  const add = (resource: string, amount: Decimal): void => {
    next.resources[resource] = (next.resources[resource] ?? new Decimal(0)).add(amount);
  };
  add('money', rates.money.mul(hours));
  const whole = (key: string, amount: number): number => {
    const total = (post.carry[key] ?? 0) + amount;
    const units = Math.floor(total + EPSILON);
    post.carry[key] = Math.max(0, total - units);
    return units;
  };
  for (const [resource, perHour] of Object.entries(rates.materials)) {
    const units = whole(`material:${resource}`, perHour.mul(hours).toNumber());
    if (units > 0) add(resource, new Decimal(units));
  }
  const herbs = whole('herbs', rates.herbs * hours);
  if (herbs > 0) add('herb_bundle', new Decimal(herbs));
  const fragments = whole('fragments', rates.fragments * hours);
  if (fragments > 0) {
    const held = (next.resources['scroll_fragment'] ?? new Decimal(0)).add(fragments);
    const scrolls = held.div(config.fragmentsPerScroll).floor();
    next.resources['scroll_fragment'] = held.sub(scrolls.mul(config.fragmentsPerScroll));
    if (scrolls.gt(0)) add('summon_scroll', scrolls);
  }
  const shards = whole('shards', rates.shards * hours);
  if (shards > 0) {
    const heirlooms = heirloomCards(content);
    for (let i = 0; i < shards && heirlooms.length > 0; i++) {
      const card = heirlooms[Math.min(heirlooms.length - 1, Math.floor(rng() * heirlooms.length))]!;
      addHeirloomShards(next, content, card.id, 1);
    }
  }
  void dungeonId;
}

/**
 * Runs every post for `seconds` (mutates `next`, the fresh copy the tick owns). A post level-up
 * inside the span splits it, so the result never depends on how time was cut into steps.
 */
export function advanceFarming(
  next: GameState,
  content: Content,
  seconds: number,
  rng: Rng,
  modifiers: readonly Modifier[],
): void {
  if (!(seconds > 0)) return;
  const config = content.farming;
  for (const dungeonId of Object.keys(next.farming.posts)) {
    if (finishedDifficulty(next, content, dungeonId) === null) continue;
    const post = next.farming.posts[dungeonId]!;
    let left = seconds;
    // A level boundary at most per level; the guard keeps a bad number from looping.
    for (let guard = 0; left > EPSILON && guard < config.level.max + 2; guard++) {
      const rates = farmPostRates(next, content, dungeonId, modifiers, post);
      if (rates.cards === 0) break;
      let step = left;
      const need = postXpNeed(config, post.level) - post.xp;
      const atTop = post.level >= config.level.max;
      const toLevel = atTop || rates.xp <= 0 ? Infinity : (need / rates.xp) * HOUR_SECONDS;
      const levels = toLevel <= step + EPSILON;
      if (levels) step = Math.max(0, toLevel);
      const hours = step / HOUR_SECONDS;
      payPost(next, content, rng, dungeonId, post, rates, hours);
      if (levels) {
        post.level += 1;
        post.xp = 0;
      } else if (!atTop) {
        post.xp += rates.xp * hours;
      }
      left -= step;
    }
  }
}

// ---- traits and upgrades -----------------------------------------------------------------------

/** A stable hash of a text (FNV-1a), for the offer: no random numbers, so it is not saved. */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Trait picks the post's level has opened and the player has not made yet. */
export function pendingTraitPicks(content: Content, post: FarmPost): number {
  return Math.floor(post.level / content.farming.level.traitEvery) - post.traits.length;
}

function offerFor(content: Content, dungeonId: string, post: FarmPost, rerolls: number): string[] {
  const pool = content.farming.traits.map((t) => t.id).filter((id) => !post.traits.includes(id));
  if (pool.length <= 2) return pool;
  const h = hashText(`${dungeonId}:${post.traits.length}:${rerolls}`);
  const a = h % pool.length;
  const b = (a + 1 + (Math.floor(h / pool.length) % (pool.length - 1))) % pool.length;
  return [pool[a]!, pool[b]!];
}

/** The two traits on offer at the dungeon's post, or null when no pick is waiting. */
export function postTraitOffer(
  state: GameState,
  content: Content,
  dungeonId: string,
): string[] | null {
  const post = postOf(state, dungeonId);
  if (pendingTraitPicks(content, post) <= 0) return null;
  const offer = offerFor(content, dungeonId, post, post.rerolls);
  return offer.length > 0 ? offer : null;
}

/** Picks one of the two offered traits. */
export function pickPostTrait(
  state: GameState,
  content: Content,
  dungeonId: string,
  traitId: string,
): FarmResult {
  const offer = postTraitOffer(state, content, dungeonId);
  if (!offer || !offer.includes(traitId)) return fail('not-offered');
  const next = cloneState(state);
  const post = clonePost(postOf(next, dungeonId));
  post.traits.push(traitId);
  post.rerolls = 0;
  next.farming.posts[dungeonId] = post;
  return { ok: true, state: next };
}

const sameOffer = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

/** Draws another pair for the waiting pick; costs herb bundles. */
export function rerollPostTraits(
  state: GameState,
  content: Content,
  dungeonId: string,
): FarmResult {
  const current = postTraitOffer(state, content, dungeonId);
  if (!current) return fail('not-offered');
  const cost = content.farming.rerollCost;
  const held = state.resources['herb_bundle'] ?? new Decimal(0);
  if (held.lt(cost)) return fail('no-herbs');
  const next = cloneState(state);
  const post = clonePost(postOf(next, dungeonId));
  let rerolls = post.rerolls;
  let offer = current;
  for (let tries = 0; tries < 16 && sameOffer(offer, current); tries++) {
    rerolls += 1;
    offer = offerFor(content, dungeonId, post, rerolls);
  }
  if (sameOffer(offer, current)) return fail('not-offered');
  post.rerolls = rerolls;
  next.farming.posts[dungeonId] = post;
  next.resources['herb_bundle'] = held.sub(cost);
  return { ok: true, state: next };
}

/** Herb bundles the next post upgrade costs, or null at the top. */
export function postUpgradeCost(content: Content, post: FarmPost): number | null {
  const u = content.farming.upgrade;
  if (post.upgrade >= u.maxLevel) return null;
  return Math.ceil(u.baseCost * Math.pow(u.growth, post.upgrade));
}

/** Buys one post upgrade level with herb bundles. */
export function buyPostUpgrade(state: GameState, content: Content, dungeonId: string): FarmResult {
  if (finishedDifficulty(state, content, dungeonId) === null) return fail('locked');
  const post = postOf(state, dungeonId);
  const cost = postUpgradeCost(content, post);
  if (cost === null) return fail('max');
  const held = state.resources['herb_bundle'] ?? new Decimal(0);
  if (held.lt(cost)) return fail('no-herbs');
  const next = cloneState(state);
  const bought = clonePost(postOf(next, dungeonId));
  bought.upgrade += 1;
  next.farming.posts[dungeonId] = bought;
  next.resources['herb_bundle'] = held.sub(cost);
  return { ok: true, state: next };
}

// ---- what the screen shows ---------------------------------------------------------------------

export interface FarmPostView {
  dungeonId: string;
  name: string;
  /** The dungeon's whole path is finished on some difficulty. */
  open: boolean;
  difficulty: FarmDifficulty | null;
  team: (string | null)[];
  level: number;
  maxLevel: number;
  /** Farming hours into the level, and what it needs. */
  xp: number;
  xpNeed: number;
  /** 0 to 1. */
  progress: number;
  traits: string[];
  /** A trait pick is waiting. */
  traitReady: boolean;
  /** The level the next pick opens at, or null when every trait is taken. */
  nextTraitLevel: number | null;
  rates: PostRates;
  upgrade: number;
  maxUpgrade: number;
  /** Herb bundles the next upgrade costs, or null at the top. */
  upgradeCost: number | null;
  rerollCost: number;
}

export function farmPostView(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): FarmPostView {
  const dungeon = content.dungeonById.get(dungeonId);
  const post = postOf(state, dungeonId);
  const config = content.farming;
  const difficulty = finishedDifficulty(state, content, dungeonId);
  const need = postXpNeed(config, post.level);
  const picks = Math.floor(config.level.max / config.level.traitEvery);
  const next = (post.traits.length + 1) * config.level.traitEvery;
  const atTop = post.level >= config.level.max;
  return {
    dungeonId,
    name: dungeon?.name ?? dungeonId,
    open: difficulty !== null,
    difficulty,
    team: [...post.team],
    level: post.level,
    maxLevel: config.level.max,
    xp: post.xp,
    xpNeed: need,
    progress: atTop ? 1 : Math.min(1, post.xp / need),
    traits: [...post.traits],
    traitReady: postTraitOffer(state, content, dungeonId) !== null,
    nextTraitLevel:
      post.traits.length >= Math.min(picks, config.traits.length) ? null : Math.max(next, 0),
    rates: farmPostRates(state, content, dungeonId, modifiers, post),
    upgrade: post.upgrade,
    maxUpgrade: config.upgrade.maxLevel,
    upgradeCost: postUpgradeCost(content, post),
    rerollCost: config.rerollCost,
  };
}

/** The sum of every open post's earnings an hour, for the top of the Farming tab. */
export interface FarmTotals {
  posts: number;
  money: Decimal;
  shards: number;
  fragments: number;
  herbs: number;
}

export function farmTotals(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): FarmTotals {
  const totals: FarmTotals = { posts: 0, money: new Decimal(0), shards: 0, fragments: 0, herbs: 0 };
  for (const dungeon of content.dungeons) {
    if (finishedDifficulty(state, content, dungeon.id) === null) continue;
    totals.posts += 1;
    const r = farmPostRates(state, content, dungeon.id, modifiers);
    totals.money = totals.money.add(r.money);
    totals.shards += r.shards;
    totals.fragments += r.fragments;
    totals.herbs += r.herbs;
  }
  return totals;
}

/** A Difficulty that is one a post can be finished on. */
export const isFarmDifficulty = (d: Difficulty): d is FarmDifficulty =>
  (FARM_DIFFICULTIES as readonly string[]).includes(d);
