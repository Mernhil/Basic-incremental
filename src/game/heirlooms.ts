import type { Card, Content, HeirloomNode, HeirloomTree, Skill } from '../data';
import { MAX_STARS } from '../data/schemas';
import { grantAccountXp } from './account';
import { cardsAtWork, cardSide, levelCap } from './cards';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, finalPrice, pay, type Price } from './production';
import type { Rng } from './rng';
import { cloneState, newOwnedCard, type GameState, type OwnedCard } from './state';

/**
 * Heirlooms (DESIGN.md §5 Heirlooms, §7 Heirloom Gate, §10 Heirloom trees, §3 Heirloom Scrolls):
 * the 22 Heirloom cards come only from the Heirloom Gate. A pull is a whole Heirloom at a low
 * chance (sure on the pity pull), else a few shards of one random Heirloom. An Heirloom's shards
 * unlock it, then fill its stars; past ★6 they become card shards. Each Heirloom has its own tree,
 * bought with points from its stars and levels, acting while the Heirloom is at work. Every number
 * is in heirlooms.json. The gate's counters, the shards and the trees are kept through Ascension.
 */

import type { PullCount } from './portals';

/** The Heirloom cards in the shared type order (items.json), Mythic then Void within a type. */
export function heirloomCards(content: Content): Card[] {
  const out: Card[] = [];
  for (const t of content.items.types) {
    for (const side of ['mythic', 'void'] as const) {
      const card = content.cards.find(
        (c) => c.heirloom && c.item.kind === t.kind && c.rarity === side,
      );
      if (card) out.push(card);
    }
  }
  return out;
}

/** Shards the next step of an Heirloom takes: its unlock, then ★2 … ★6; null at ★6. */
export function heirloomShardsNeeded(
  content: Content,
  owned: OwnedCard | undefined,
): number | null {
  const gate = content.heirlooms.gate;
  if (!owned) return gate.unlockShards;
  if (owned.stars >= MAX_STARS) return null;
  return gate.starShards[owned.stars - 1]!;
}

/** What shards did to one Heirloom: unlocked it, added stars, or overflowed into card shards. */
export interface ShardOutcome {
  unlocked: boolean;
  starsGained: number;
  /** Card shards (the shard shop's) from shards past ★6. */
  cardShards: number;
}

/**
 * Adds shards of an Heirloom (mutates `state`, a fresh clone) and spends them at once on its
 * unlock and its stars while they suffice; at ★6 every further shard becomes card shards.
 */
export function addHeirloomShards(
  state: GameState,
  content: Content,
  cardId: string,
  amount: number,
): ShardOutcome {
  const out: ShardOutcome = { unlocked: false, starsGained: 0, cardShards: 0 };
  const held = (state.heirlooms.shards[cardId] ?? 0) + amount;
  let left = held;
  for (;;) {
    const owned = state.cards.owned[cardId];
    const need = heirloomShardsNeeded(content, owned);
    if (need === null) {
      out.cardShards = left * content.heirlooms.gate.cardShardsPerOverflow;
      state.cards.shards += out.cardShards;
      left = 0;
      break;
    }
    if (left < need) break;
    left -= need;
    if (!owned) {
      unlockHeirloom(state, cardId);
      out.unlocked = true;
    } else {
      owned.stars += 1;
      out.starsGained += 1;
    }
  }
  if (left > 0) state.heirlooms.shards[cardId] = left;
  else delete state.heirlooms.shards[cardId];
  return out;
}

/** The Heirloom becomes owned at its tier, ★1 Lv 1 (mutates `state`). */
function unlockHeirloom(state: GameState, cardId: string): void {
  const fresh = newOwnedCard();
  fresh.tier = 'heirloom';
  state.cards.owned[cardId] = fresh;
}

// ---- the gate ----------------------------------------------------------------------------------

/** One pull of the Heirloom Gate, in order, for the reveal. */
export interface HeirloomPull {
  cardId: string;
  /** A whole Heirloom (by chance or by pity); else shards. */
  whole: boolean;
  /** Given by the pity counter. */
  pity: boolean;
  /** Shards the pull gave (a whole repeat counts as its shards). */
  shards: number;
  outcome: ShardOutcome;
  /** The Heirloom's stars after the pull (0 = still locked). */
  stars: number;
}

export type HeirloomPullFailure = 'invalid-count' | 'unaffordable';
export type HeirloomPullOutcome =
  | { ok: true; state: GameState; results: HeirloomPull[] }
  | { ok: false; reason: HeirloomPullFailure };

/** The price of a single pull or a 10-pull, through `cost.multiplier` (scope: portal). */
export function heirloomPullPrice(
  content: Content,
  count: PullCount,
  modifiers: readonly Modifier[] = [],
): Price {
  const { cost, id } = content.heirlooms.gate;
  return finalPrice(cost.resource, count === 10 ? cost.ten : cost.single, modifiers, {
    portal: id,
  });
}

/**
 * Pulls the Heirloom Gate `count` times: pays, then each pull is a whole Heirloom on the pity pull
 * or at `wholeChance`, else `shards.min`..`shards.max` shards; the Heirloom is one of the 22 at
 * equal chance. A whole Heirloom not owned unlocks it (its shards held stay and go to its stars);
 * one owned counts as `wholeRepeatShards` shards. The pity resets on every whole Heirloom.
 */
export function pullHeirloomGate(
  state: GameState,
  content: Content,
  count: PullCount,
  rng: Rng,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): HeirloomPullOutcome {
  if (count !== 1 && count !== 10) return { ok: false, reason: 'invalid-count' };
  const price = heirloomPullPrice(content, count, modifiers);
  if (!canAfford(state, [price])) return { ok: false, reason: 'unaffordable' };
  const next = pay(state, [price]);
  const gate = content.heirlooms.gate;
  const cards = heirloomCards(content);
  const results: HeirloomPull[] = [];
  for (let i = 0; i < count; i++) {
    const byPity = next.heirlooms.pity + 1 >= gate.pity;
    const whole = byPity || rng() < gate.wholeChance;
    const card = cards[Math.min(cards.length - 1, Math.floor(rng() * cards.length))]!;
    let shards: number;
    let outcome: ShardOutcome;
    if (whole && !next.cards.owned[card.id]) {
      unlockHeirloom(next, card.id);
      shards = 0;
      // Shards held from before go to its stars at once.
      outcome = { ...addHeirloomShards(next, content, card.id, 0), unlocked: true };
    } else {
      shards = whole
        ? gate.wholeRepeatShards
        : gate.shards.min + Math.floor(rng() * (gate.shards.max - gate.shards.min + 1));
      outcome = addHeirloomShards(next, content, card.id, shards);
    }
    next.heirlooms.pity = whole ? 0 : next.heirlooms.pity + 1;
    next.heirlooms.pulls += 1;
    results.push({
      cardId: card.id,
      whole,
      pity: byPity,
      shards,
      outcome,
      stars: next.cards.owned[card.id]?.stars ?? 0,
    });
  }
  grantAccountXp(next, content, content.account.xp.perPull.mul(count), modifiers);
  return { ok: true, state: next, results };
}

/** One Heirloom as the gate's board and the Heirlooms tab show it. */
export interface HeirloomEntry {
  card: Card;
  side: 'mythic' | 'void';
  owned: OwnedCard | null;
  /** 0 while locked. */
  stars: number;
  /** Shards held toward the next step. */
  shards: number;
  /** Shards the next step takes (unlock, then the next star); null at ★6. */
  need: number | null;
  /** shards / need, 0..1 (1 at ★6). */
  progress: number;
}

export function heirloomEntry(state: GameState, content: Content, card: Card): HeirloomEntry {
  const owned = state.cards.owned[card.id] ?? null;
  const shards = state.heirlooms.shards[card.id] ?? 0;
  const need = heirloomShardsNeeded(content, owned ?? undefined);
  return {
    card,
    side: cardSide(card.rarity),
    owned,
    stars: owned?.stars ?? 0,
    shards,
    need,
    progress: need === null ? 1 : Math.min(1, shards / need),
  };
}

/** Everything the Heirloom Gate shows. */
export interface HeirloomGateInfo {
  id: string;
  name: string;
  single: { price: Price; affordable: boolean };
  ten: { price: Price; affordable: boolean };
  pity: { count: number; threshold: number; progress: number };
  /** Chance of a whole Heirloom on a normal pull, and the shards of a shard pull. */
  wholeChance: number;
  shards: { min: number; max: number };
  /** Heirlooms in the gate. */
  total: number;
  unlocked: number;
  pulls: number;
  entries: HeirloomEntry[];
}

export function heirloomGateInfo(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): HeirloomGateInfo {
  const gate = content.heirlooms.gate;
  const offer = (count: PullCount) => {
    const price = heirloomPullPrice(content, count, modifiers);
    return { price, affordable: canAfford(state, [price]) };
  };
  const entries = heirloomCards(content).map((c) => heirloomEntry(state, content, c));
  return {
    id: gate.id,
    name: gate.name,
    single: offer(1),
    ten: offer(10),
    pity: {
      count: state.heirlooms.pity,
      threshold: gate.pity,
      progress: Math.min(1, state.heirlooms.pity / gate.pity),
    },
    wholeChance: gate.wholeChance,
    shards: { ...gate.shards },
    total: entries.length,
    unlocked: entries.filter((e) => e.owned).length,
    pulls: state.heirlooms.pulls,
    entries,
  };
}

// ---- Heirloom Scrolls --------------------------------------------------------------------------

const HEIRLOOM_SCROLL = 'heirloom_scroll';

function addScrolls(state: GameState, amount: Decimal): void {
  if (amount.lte(0)) return;
  state.resources[HEIRLOOM_SCROLL] = (state.resources[HEIRLOOM_SCROLL] ?? new Decimal(0)).add(
    amount,
  );
}

/**
 * Heirloom Scrolls a floor clear pays (DESIGN.md §3 Where Heirloom Scrolls come from): the first
 * win of a Nightmare last-floor boss, each later kill of one (`clears` kills), and every
 * `endlessDepthEvery`-th endless depth reached for the first time.
 */
export function heirloomScrollsForClear(
  content: Content,
  difficulty: string,
  kind: string,
  floor: number,
  first: boolean,
  clears: number,
): Decimal {
  const s = content.heirlooms.scrolls;
  if (difficulty === 'nightmare' && kind === 'boss') {
    return first
      ? s.nightmareBossFirstWin.add(s.nightmareBossKill.mul(Math.max(0, clears - 1)))
      : s.nightmareBossKill.mul(clears);
  }
  if (difficulty === 'endless' && first && floor % s.endlessDepthEvery === 0) {
    return s.endlessDepth;
  }
  return new Decimal(0);
}

/** Pays a floor clear's Heirloom Scrolls into `state` (mutates it); returns the amount. */
export function payHeirloomScrollsForClear(
  state: GameState,
  content: Content,
  difficulty: string,
  kind: string,
  floor: number,
  first: boolean,
  clears: number,
): Decimal {
  const amount = heirloomScrollsForClear(content, difficulty, kind, floor, first, clears);
  addScrolls(state, amount);
  return amount;
}

/** Heirloom Scrolls an Ascension pays: `ascension` from the `ascensionFrom`-th on. */
export function heirloomScrollsForAscension(content: Content, ascension: number): Decimal {
  const s = content.heirlooms.scrolls;
  return ascension >= s.ascensionFrom ? s.ascension : new Decimal(0);
}

// ---- trees -------------------------------------------------------------------------------------

/** Points an Heirloom has earned: `perStar` a star and one at each level of `points.levels`. */
export function heirloomPoints(content: Content, owned: OwnedCard | undefined): number {
  if (!owned) return 0;
  const { perStar, levels } = content.heirlooms.points;
  return owned.stars * perStar + levels.filter((l) => owned.level >= l).length;
}

function boughtNodes(state: GameState, cardId: string): string[] {
  return state.heirlooms.trees[cardId] ?? [];
}

/** Points spent in an Heirloom's tree. */
export function heirloomPointsSpent(state: GameState, content: Content, cardId: string): number {
  const tree = content.heirloomTreeByCard.get(cardId);
  if (!tree) return 0;
  return boughtNodes(state, cardId).reduce(
    (a, id) => a + (tree.nodes.find((n) => n.id === id)?.cost ?? 0),
    0,
  );
}

export type HeirloomNodeState = 'bought' | 'open' | 'locked';

/** A node as the tree shows it. */
export interface HeirloomNodeInfo {
  node: HeirloomNode;
  state: HeirloomNodeState;
  /** Open and the points are there. */
  affordable: boolean;
}

export interface HeirloomTreeInfo {
  tree: HeirloomTree;
  earned: number;
  spent: number;
  free: number;
  nodes: HeirloomNodeInfo[];
  /** The duel skill the capstone gives, while it is bought. */
  skill: Skill | null;
  /** Levels where the next points come (the ones not reached yet). */
  nextLevels: number[];
}

export function heirloomTreeInfo(
  state: GameState,
  content: Content,
  cardId: string,
): HeirloomTreeInfo | null {
  const tree = content.heirloomTreeByCard.get(cardId);
  if (!tree) return null;
  const owned = state.cards.owned[cardId];
  const bought = new Set(boughtNodes(state, cardId));
  const earned = heirloomPoints(content, owned);
  const spent = heirloomPointsSpent(state, content, cardId);
  const free = Math.max(0, earned - spent);
  const nodes = tree.nodes.map((node): HeirloomNodeInfo => {
    if (bought.has(node.id)) return { node, state: 'bought', affordable: false };
    const open =
      owned !== undefined &&
      (node.requires.length === 0 || node.requires.some((r) => bought.has(r)));
    return { node, state: open ? 'open' : 'locked', affordable: open && node.cost <= free };
  });
  return {
    tree,
    earned,
    spent,
    free,
    nodes,
    skill: heirloomSkill(state, content, cardId),
    nextLevels: owned
      ? content.heirlooms.points.levels.filter(
          (l) => owned.level < l && l <= levelCap(content, owned),
        )
      : content.heirlooms.points.levels,
  };
}

export type HeirloomTreeFailure = 'unknown' | 'not-owned' | 'bought' | 'locked' | 'points';

/** Buys a node of an Heirloom's tree: owned, not bought, a required node bought, points free. */
export function buyHeirloomNode(
  state: GameState,
  content: Content,
  cardId: string,
  nodeId: string,
): { ok: true; state: GameState } | { ok: false; reason: HeirloomTreeFailure } {
  const info = heirloomTreeInfo(state, content, cardId);
  const node = info?.nodes.find((n) => n.node.id === nodeId);
  if (!info || !node) return { ok: false, reason: 'unknown' };
  if (!state.cards.owned[cardId]) return { ok: false, reason: 'not-owned' };
  if (node.state === 'bought') return { ok: false, reason: 'bought' };
  if (node.state === 'locked') return { ok: false, reason: 'locked' };
  if (!node.affordable) return { ok: false, reason: 'points' };
  const next = cloneState(state);
  next.heirlooms.trees[cardId] = [...boughtNodes(state, cardId), nodeId];
  return { ok: true, state: next };
}

/** Clears an Heirloom's tree (free respec, DESIGN.md §10 Heirloom trees in detail). */
export function respecHeirloomTree(state: GameState, cardId: string): GameState {
  if (boughtNodes(state, cardId).length === 0) return state;
  const next = cloneState(state);
  delete next.heirlooms.trees[cardId];
  return next;
}

/** The skill an Heirloom fights with while a bought node gives one (its capstone); else null. */
export function heirloomSkill(state: GameState, content: Content, cardId: string): Skill | null {
  const tree = content.heirloomTreeByCard.get(cardId);
  if (!tree) return null;
  const bought = new Set(boughtNodes(state, cardId));
  for (const node of tree.nodes) {
    if (node.skill && bought.has(node.id)) return content.skillById.get(node.skill) ?? null;
  }
  return null;
}

/**
 * The modifiers of the bought tree nodes of every Heirloom at work (source `heirloom`, id
 * `<card>:<node>`): a fighting Heirloom's act everywhere while it is in the fighting loadout, a
 * worker's at its place only. Signature power (`burst.power` flat) acts only while the Heirloom
 * leads the loadout, and on top of its own main ability's signature: the main ability sets the
 * signature (a `set`, applied after flat), so the tree's points are added to that set value.
 * Read by `collectModifiers`.
 */
export function heirloomTreeModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  const main = state.cards.loadouts.fighting.main;
  for (const { cardId, scope } of cardsAtWork(state, content)) {
    const tree = content.heirloomTreeByCard.get(cardId);
    const card = content.cardById.get(cardId);
    if (!tree || !card || !state.cards.owned[cardId]) continue;
    const bought = new Set(boughtNodes(state, cardId));
    let signature = new Decimal(0);
    for (const node of tree.nodes) {
      if (!bought.has(node.id)) continue;
      const source = { kind: 'heirloom' as const, id: `${cardId}:${node.id}` };
      for (const m of node.modifiers) {
        if (m.stat === 'burst.power' && m.kind === 'flat' && card.job === 'fighting') {
          signature = signature.add(m.value);
          continue;
        }
        out.push({ ...m, ...(scope ? { scope: { ...m.scope, ...scope } } : {}), source });
      }
    }
    if (signature.gt(0) && card.job === 'fighting' && main === cardId) {
      const own = card.main.modifiers.find((m) => m.stat === 'burst.power' && m.kind === 'set');
      const source = { kind: 'heirloom' as const, id: `${cardId}:signature` };
      out.push(
        own
          ? {
              stat: 'burst.power',
              kind: 'set',
              value: own.value.add(signature),
              scope: own.scope,
              source,
            }
          : {
              stat: 'burst.power',
              kind: 'flat',
              value: signature,
              scope: { job: 'fighting' },
              source,
            },
      );
    }
  }
  return out;
}
