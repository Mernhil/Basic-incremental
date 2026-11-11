import type { Content, EnhancementOption, Job, Rank, RewardTrackEntry, SkillNode } from '../data';
import { RANK_TIERS, MAX_STARS } from '../data';
import { statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, finalPrice, pay, type Price } from './production';
import type { TickReport } from './report';
import { cardsAtWork } from './cards';
import { cloneState, type GameState, type OwnedCard } from './state';
import { grantCosmetic } from './wardrobe';

/**
 * The account (DESIGN.md §10): account XP from harvests, kills, trial attempts, pulls and
 * ascensions; levels that give skill points and the reward track (crystals, cosmetics, cost cap
 * bumps); the account tree (six branches, respec); and card enhancements. Every effect reaches
 * the game through `collectModifiers` (sources `skill`, `account`, `enhancement`). All numbers
 * are in account.json and enhancements.json.
 */

// ---- XP and levels -----------------------------------------------------------------------------

export function accountLevel(state: GameState): number {
  return state.account.level;
}

/** XP from level L to L + 1: xpBase × xpGrowth^(L − 1). */
export function xpToNextAccountLevel(content: Content, level: number): Decimal {
  const { xpBase, xpGrowth } = content.account.levels;
  return xpBase.mul(xpGrowth.pow(Math.max(0, level - 1)));
}

/**
 * Adds account XP (mutates `state`, a fresh copy owned by the caller), through `xp.account`
 * (scope: job when given). Nothing is gained at the max level. Level-ups wait for
 * `settleAccount` (the 1 s play-time grid, like card levels).
 */
export function grantAccountXp(
  state: GameState,
  content: Content,
  amount: Decimal,
  modifiers: readonly Modifier[],
  job?: Job,
): void {
  if (!amount.gt(0) || state.account.level >= content.account.levels.maxLevel) return;
  const gained = statValue('xp.account', amount, modifiers, job ? { job } : {});
  if (gained.gt(0)) state.account.xp = state.account.xp.add(gained);
}

/** Account XP for gems harvested by a job: units × the gem tier's weight × perUnit[job]. */
export function harvestXp(
  content: Content,
  job: 'logging' | 'mining',
  gains: Record<string, Decimal>,
): Decimal {
  const { tierWeights, perUnit } = content.account.xp;
  let total = new Decimal(0);
  for (const [id, amount] of Object.entries(gains)) {
    const tier = content.resourceById.get(id)?.tier ?? 1;
    const weight = tierWeights[Math.min(tier, tierWeights.length) - 1]!;
    total = total.add(amount.mul(weight));
  }
  return total.mul(perUnit[job]);
}

/** Account XP per boss kill in a dungeon of this tier. */
export function killXp(content: Content, dungeonTier: number): Decimal {
  const { perKill, killTierGrowth } = content.account.xp;
  return perKill.mul(killTierGrowth.pow(dungeonTier - 1));
}

/** Whether enough XP is banked for a level-up (a settle would level up). */
export function accountLevelDue(state: GameState, content: Content): boolean {
  const { level, xp } = state.account;
  return level < content.account.levels.maxLevel && xp.gte(xpToNextAccountLevel(content, level));
}

/** Grants what reaching `level` gives on the track besides skill points (mutates `state`). */
function grantTrackRewards(state: GameState, content: Content, level: number): void {
  const entry = content.account.rewardTrack.find((e) => e.level === level);
  if (!entry) return;
  for (const r of entry.resources) {
    state.resources[r.resource] = (state.resources[r.resource] ?? new Decimal(0)).add(r.amount);
  }
  for (const id of entry.cosmetics) grantCosmetic(state, id);
}

/**
 * Applies pending account level-ups (mutates `state`) with their track rewards, and records
 * them in `report.accountLevel`. XP stops at the max level.
 */
export function settleAccount(state: GameState, content: Content, report?: TickReport): void {
  const from = state.account.level;
  const max = content.account.levels.maxLevel;
  while (state.account.level < max) {
    const need = xpToNextAccountLevel(content, state.account.level);
    if (state.account.xp.lt(need)) break;
    state.account.xp = state.account.xp.sub(need);
    state.account.level += 1;
    grantTrackRewards(state, content, state.account.level);
  }
  if (state.account.level >= max) state.account.xp = new Decimal(0);
  if (report && state.account.level !== from) {
    report.accountLevel = { from: report.accountLevel?.from ?? from, to: state.account.level };
  }
}

// ---- skill points and the account tree ---------------------------------------------------------

export interface SkillPoints {
  total: number;
  spent: number;
  available: number;
}

/** Skill points spent in the account tree. */
export function skillPointsSpent(state: GameState, content: Content): number {
  let spent = 0;
  for (const [id, rank] of Object.entries(state.account.skills)) {
    spent += rank * (content.account.tree.find((n) => n.id === id)?.cost ?? 0);
  }
  return spent;
}

export function skillPoints(state: GameState, content: Content): SkillPoints {
  const total = (state.account.level - 1) * content.account.levels.skillPointsPerLevel;
  const spent = skillPointsSpent(state, content);
  return { total, spent, available: Math.max(0, total - spent) };
}

export interface AccountInfo {
  level: number;
  maxLevel: number;
  /** XP toward the next level. */
  xp: Decimal;
  /** XP the next level needs, or null at the max. */
  xpToNext: Decimal | null;
  /** Bar toward the next level, 0..1 (1 at the max). */
  progress: number;
  skillPoints: SkillPoints;
}

/** The header's account level and XP bar, and the skill points. */
export function accountInfo(state: GameState, content: Content): AccountInfo {
  const { level, xp } = state.account;
  const maxLevel = content.account.levels.maxLevel;
  const need = level < maxLevel ? xpToNextAccountLevel(content, level) : null;
  return {
    level,
    maxLevel,
    xp,
    xpToNext: need,
    progress: need ? Math.min(1, Math.max(0, xp.div(need).toNumber())) : 1,
    skillPoints: skillPoints(state, content),
  };
}

export interface TrackLevel {
  level: number;
  skillPoints: number;
  resources: RewardTrackEntry['resources'];
  cosmetics: string[];
  costCap: number;
  reached: boolean;
}

/** Every level from 2 to the max with what it gives, for the reward track row. */
export function rewardTrack(state: GameState, content: Content): TrackLevel[] {
  const out: TrackLevel[] = [];
  for (let level = 2; level <= content.account.levels.maxLevel; level++) {
    const entry = content.account.rewardTrack.find((e) => e.level === level);
    out.push({
      level,
      skillPoints: content.account.levels.skillPointsPerLevel,
      resources: entry?.resources ?? [],
      cosmetics: entry?.cosmetics ?? [],
      costCap: entry?.costCap ?? 0,
      reached: state.account.level >= level,
    });
  }
  return out;
}

const skillNode = (content: Content, id: string): SkillNode | undefined =>
  content.account.tree.find((n) => n.id === id);

/** A node's bonus at a rank: each perRank modifier × rank, source `skill`. */
export function skillModifiers(node: SkillNode, rank: number): Modifier[] {
  if (rank <= 0) return [];
  return node.perRank.map((m) => ({
    ...m,
    value: m.value.mul(rank),
    source: { kind: 'skill', id: node.id },
  }));
}

export interface SkillNodeInfo {
  node: SkillNode;
  rank: number;
  maxRank: number;
  /** Every required node has at least one rank. */
  requiresMet: boolean;
  /** Can buy the next rank now. */
  canBuy: boolean;
  current: Modifier[];
  next: Modifier[];
}

/** The account tree, in data order (group by `node.branch` for the six branches). */
export function skillTree(state: GameState, content: Content): SkillNodeInfo[] {
  const available = skillPoints(state, content).available;
  return content.account.tree.map((node) => {
    const rank = state.account.skills[node.id] ?? 0;
    const requiresMet = node.requires.every((r) => (state.account.skills[r] ?? 0) > 0);
    return {
      node,
      rank,
      maxRank: node.maxRank,
      requiresMet,
      canBuy: requiresMet && rank < node.maxRank && available >= node.cost,
      current: skillModifiers(node, rank),
      next: rank < node.maxRank ? skillModifiers(node, rank + 1) : [],
    };
  });
}

export type SkillBuyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'unknown' | 'maxed' | 'locked' | 'no-points' };

/** Buys one rank of an account tree node with skill points. */
export function buySkill(state: GameState, content: Content, nodeId: string): SkillBuyResult {
  const node = skillNode(content, nodeId);
  if (!node) return { ok: false, reason: 'unknown' };
  const rank = state.account.skills[nodeId] ?? 0;
  if (rank >= node.maxRank) return { ok: false, reason: 'maxed' };
  if (!node.requires.every((r) => (state.account.skills[r] ?? 0) > 0)) {
    return { ok: false, reason: 'locked' };
  }
  if (skillPoints(state, content).available < node.cost) return { ok: false, reason: 'no-points' };
  const next = cloneState(state);
  next.account.skills[nodeId] = rank + 1;
  return { ok: true, state: next };
}

export interface RespecInfo {
  /** This run still has a free respec. */
  free: boolean;
  /** Starlight price when not free (through `cost.multiplier`), else null. */
  price: Price | null;
  /** Skill points it gives back. */
  refund: number;
}

export function respecInfo(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = [],
): RespecInfo {
  const free = state.account.freeRespecsUsed < content.account.respec.freePerAscension;
  return {
    free,
    price: free
      ? null
      : finalPrice(content.prestige.currency, content.account.respec.cost, modifiers, {}),
    refund: skillPointsSpent(state, content),
  };
}

export type RespecResult =
  { ok: true; state: GameState } | { ok: false; reason: 'nothing' | 'unaffordable' };

/** Refunds every skill point (free once per ascension, then for Starlight). */
export function respecSkills(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = [],
): RespecResult {
  if (Object.keys(state.account.skills).length === 0) return { ok: false, reason: 'nothing' };
  const info = respecInfo(state, content, modifiers);
  if (info.price && !canAfford(state, [info.price])) return { ok: false, reason: 'unaffordable' };
  const next = info.price ? pay(state, [info.price]) : cloneState(state);
  next.account.skills = {};
  if (info.free) next.account.freeRespecsUsed += 1;
  return { ok: true, state: next };
}

// ---- card enhancements -------------------------------------------------------------------------

const rankValue = (r: Rank): number => RANK_TIERS.indexOf(r.tier) * MAX_STARS + r.stars;

/** A card's enhancement point budget at its rank (0 below the unlock rank). */
export function enhancementBudget(content: Content, owned: OwnedCard): number {
  const e = content.enhancements;
  if (rankValue({ tier: owned.tier, stars: owned.stars }) < rankValue(e.unlockRank)) return 0;
  return e.budget[owned.tier];
}

function optionsOf(content: Content, cardId: string): EnhancementOption[] {
  return content.enhancements.cards[cardId] ?? [];
}

function spentOn(content: Content, cardId: string, owned: OwnedCard): number {
  const options = optionsOf(content, cardId);
  return owned.enhancements.reduce((a, id) => a + (options.find((o) => o.id === id)?.cost ?? 0), 0);
}

export interface CardEnhancementInfo {
  unlocked: boolean;
  unlockRank: Rank;
  budget: number;
  spent: number;
  options: { option: EnhancementOption; chosen: boolean; canChoose: boolean }[];
}

/** A card's enhancement star chart: budget, spent and each option. Null when not owned. */
export function cardEnhancements(
  state: GameState,
  content: Content,
  cardId: string,
): CardEnhancementInfo | null {
  const owned = state.cards.owned[cardId];
  if (!owned) return null;
  const budget = enhancementBudget(content, owned);
  const spent = spentOn(content, cardId, owned);
  return {
    unlocked: budget > 0,
    unlockRank: content.enhancements.unlockRank,
    budget,
    spent,
    options: optionsOf(content, cardId).map((option) => {
      const chosen = owned.enhancements.includes(option.id);
      return { option, chosen, canChoose: !chosen && spent + option.cost <= budget };
    }),
  };
}

export type EnhanceResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'unknown' | 'not-owned' | 'locked' | 'already' | 'over-budget' };

/** Picks one enhancement option for a card, within its budget. */
export function chooseEnhancement(
  state: GameState,
  content: Content,
  cardId: string,
  optionId: string,
): EnhanceResult {
  const owned = state.cards.owned[cardId];
  if (!owned) return { ok: false, reason: content.cardById.has(cardId) ? 'not-owned' : 'unknown' };
  const option = optionsOf(content, cardId).find((o) => o.id === optionId);
  if (!option) return { ok: false, reason: 'unknown' };
  const budget = enhancementBudget(content, owned);
  if (budget <= 0) return { ok: false, reason: 'locked' };
  if (owned.enhancements.includes(optionId)) return { ok: false, reason: 'already' };
  if (spentOn(content, cardId, owned) + option.cost > budget) {
    return { ok: false, reason: 'over-budget' };
  }
  const next = cloneState(state);
  next.cards.owned[cardId]!.enhancements.push(optionId);
  return { ok: true, state: next };
}

/** Clears a card's enhancements (free respec). */
export function resetEnhancements(state: GameState, content: Content, cardId: string): GameState {
  if (!content.cardById.has(cardId) || !state.cards.owned[cardId]) return state;
  const next = cloneState(state);
  next.cards.owned[cardId]!.enhancements = [];
  return next;
}

// ---- modifiers ---------------------------------------------------------------------------------

/**
 * Account tree ranks (source `skill`), the reward track's cost cap bumps reached (source
 * `account`, id `level_<n>`), and the enhancements of cards in a loadout (source `enhancement`,
 * id `<card>:<option>`). Read by `collectModifiers`.
 */
export function accountModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const node of content.account.tree) {
    out.push(...skillModifiers(node, state.account.skills[node.id] ?? 0));
  }
  for (const entry of content.account.rewardTrack) {
    if (entry.costCap > 0 && state.account.level >= entry.level) {
      out.push({
        stat: 'loadout.costCap',
        kind: 'flat',
        value: new Decimal(entry.costCap),
        source: { kind: 'account', id: `level_${entry.level}` },
      });
    }
  }
  // A worker's enhancements act at its own place only (DESIGN.md §4 Worker abilities).
  for (const { cardId, scope } of cardsAtWork(state, content)) {
    const owned = state.cards.owned[cardId];
    if (!owned || enhancementBudget(content, owned) <= 0) continue;
    for (const optionId of owned.enhancements) {
      const option = optionsOf(content, cardId).find((o) => o.id === optionId);
      if (!option) continue;
      for (const m of option.modifiers) {
        out.push({
          ...m,
          ...(scope ? { scope: { ...m.scope, ...scope } } : {}),
          source: { kind: 'enhancement', id: `${cardId}:${optionId}` },
        });
      }
    }
  }
  return out;
}
