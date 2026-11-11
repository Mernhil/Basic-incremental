import type {
  CircleStep,
  Content,
  EnhancementOption,
  Job,
  Rank,
  RewardTrackEntry,
  SkillNode,
} from '../data';
import type { ModifierScope } from '../data';
import { RANK_TIERS, MAX_STARS } from '../data';
import { statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, finalPrice, pay, type Price } from './production';
import type { TickReport } from './report';
import { cardsAtWork } from './cards';
import { totalStageStarLevels } from './stageStars';
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
 * (scope: job when given). There is no level cap. Level-ups wait for
 * `settleAccount` (the 1 s play-time grid, like card levels).
 */
export function grantAccountXp(
  state: GameState,
  content: Content,
  amount: Decimal,
  modifiers: readonly Modifier[],
  job?: Job,
): void {
  if (!amount.gt(0)) return;
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
  return xp.gte(xpToNextAccountLevel(content, level));
}

/** Grants what reaching `level` gives on the track besides skill points (mutates `state`). */
function grantTrackRewards(state: GameState, content: Content, level: number): void {
  const reward = trackReward(content, level);
  for (const r of reward.resources) {
    state.resources[r.resource] = (state.resources[r.resource] ?? new Decimal(0)).add(r.amount);
  }
  for (const id of reward.cosmetics) grantCosmetic(state, id);
}

/**
 * What reaching `level` gives besides its skill point: the listed entry, or past the last listed
 * level the repeating reward every `rewardRepeat.every` levels (DESIGN.md §10).
 */
export function trackReward(
  content: Content,
  level: number,
): Pick<RewardTrackEntry, 'resources' | 'cosmetics' | 'costCap'> {
  const { rewardTrack, rewardRepeat } = content.account;
  const entry = rewardTrack.find((e) => e.level === level);
  if (entry) return entry;
  const last = Math.max(0, ...rewardTrack.map((e) => e.level));
  if (level > last && (level - last) % rewardRepeat.every === 0) {
    return { resources: rewardRepeat.resources, cosmetics: [], costCap: 0 };
  }
  return { resources: [], cosmetics: [], costCap: 0 };
}

/**
 * Applies pending account level-ups (mutates `state`) with their track rewards, and records
 * them in `report.accountLevel`.
 */
export function settleAccount(state: GameState, content: Content, report?: TickReport): void {
  const from = state.account.level;
  for (;;) {
    const need = xpToNextAccountLevel(content, state.account.level);
    if (state.account.xp.lt(need)) break;
    state.account.xp = state.account.xp.sub(need);
    state.account.level += 1;
    grantTrackRewards(state, content, state.account.level);
  }
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

const skillNode = (content: Content, id: string): SkillNode | undefined =>
  content.account.tree.find((n) => n.id === id);

function ranksCost(content: Content, skills: Readonly<Record<string, number>>): number {
  let spent = 0;
  for (const [id, rank] of Object.entries(skills)) {
    spent += rank * (skillNode(content, id)?.cost ?? 0);
  }
  return spent;
}

/** Skill points spent in the account tree. */
export function skillPointsSpent(state: GameState, content: Content): number {
  return ranksCost(content, state.account.skills);
}

/** Points earned: account level, stage star levels and achievements. Derived, never saved. */
function pointsEarned(state: GameState, content: Content): number {
  const { levels } = content.account;
  return (
    (state.account.level - 1) * levels.skillPointsPerLevel +
    totalStageStarLevels(state, content) * levels.pointsPerStageStar +
    Object.keys(state.achievements).length * levels.pointsPerAchievement
  );
}

export function skillPoints(state: GameState, content: Content): SkillPoints {
  const total = pointsEarned(state, content);
  const spent = skillPointsSpent(state, content);
  return { total, spent, available: Math.max(0, total - spent) };
}

export interface AccountInfo {
  level: number;
  /** XP toward the next level. */
  xp: Decimal;
  /** XP the next level needs (there is no level cap). */
  xpToNext: Decimal;
  /** Bar toward the next level, 0..1. */
  progress: number;
  skillPoints: SkillPoints;
}

/** The header's account level and XP bar, and the skill points. */
export function accountInfo(state: GameState, content: Content): AccountInfo {
  const { level, xp } = state.account;
  const need = xpToNextAccountLevel(content, level);
  return {
    level,
    xp,
    xpToNext: need,
    progress: Math.min(1, Math.max(0, xp.div(need).toNumber())),
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

/** How many levels past the player's own the reward track row shows. */
const TRACK_LOOKAHEAD = 10;

/**
 * Every level from 2 with what it gives, for the reward track row: the listed levels, and always
 * a few past the player's own (the track repeats, so it has no end).
 */
export function rewardTrack(state: GameState, content: Content): TrackLevel[] {
  const last = Math.max(...content.account.rewardTrack.map((e) => e.level));
  const to = Math.max(last, state.account.level + TRACK_LOOKAHEAD);
  const out: TrackLevel[] = [];
  for (let level = 2; level <= to; level++) {
    const reward = trackReward(content, level);
    out.push({
      level,
      skillPoints: content.account.levels.skillPointsPerLevel,
      resources: reward.resources,
      cosmetics: reward.cosmetics,
      costCap: reward.costCap,
      reached: state.account.level >= level,
    });
  }
  return out;
}

/** A node's bonus at a rank: each perRank modifier × rank, source `skill`. */
export function skillModifiers(node: SkillNode, rank: number): Modifier[] {
  if (rank <= 0) return [];
  return node.perRank.map((m) => ({
    ...m,
    value: m.value.mul(rank),
    source: { kind: 'skill', id: node.id },
  }));
}

// ---- rings and weapon circles ----

/** A ring is open when the Ascension count reaches its number; ring 0 is open from the start. */
export function ringOpen(state: GameState, ring: number): boolean {
  return state.prestigeCount >= ring;
}

export interface WeaponCircle {
  kind: string;
  noun: string;
  /** Shown in full: an owned card of this type has reached Gold. Hidden ones are a dim outline. */
  revealed: boolean;
  /** The furthest step reached, or null while hidden. */
  step: CircleStep | null;
}

/**
 * One circle per item type (items.json). Whether it is revealed and how far it has opened is read
 * from the tiers of the owned cards of that type. Cards are never lost, not even to an Ascension,
 * so a circle that has opened stays open without any saved flag.
 */
export function weaponCircles(state: GameState, content: Content): WeaponCircle[] {
  const steps = content.account.circleSteps;
  const best = new Map<string, number>();
  for (const [id, owned] of Object.entries(state.cards.owned)) {
    const kind = content.cardById.get(id)?.item.kind;
    if (!kind) continue;
    best.set(kind, Math.max(best.get(kind) ?? -1, RANK_TIERS.indexOf(owned.tier)));
  }
  return content.items.types.map((t) => {
    const tier = best.get(t.kind) ?? -1;
    let reached = -1;
    steps.forEach((s, i) => {
      if (tier >= RANK_TIERS.indexOf(s.tier)) reached = i;
    });
    return {
      kind: t.kind,
      noun: t.noun,
      revealed: reached >= 0,
      step: reached >= 0 ? steps[reached]!.step : null,
    };
  });
}

/** Whether a node can be bought into at all right now: its ring is open, its circle step reached. */
function nodeOpen(
  node: SkillNode,
  state: GameState,
  content: Content,
  circles: WeaponCircle[] = weaponCircles(state, content),
): boolean {
  if (!node.circle) return ringOpen(state, node.ring);
  const circle = circles.find((c) => c.kind === node.circle);
  if (!circle?.step || !node.step) return false;
  const order = content.account.circleSteps.map((s) => s.step);
  return order.indexOf(circle.step) >= order.indexOf(node.step);
}

export interface SkillNodeInfo {
  node: SkillNode;
  rank: number;
  maxRank: number;
  /** The node's ring has opened (or its weapon circle has reached its step). */
  open: boolean;
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
  const circles = weaponCircles(state, content);
  return content.account.tree.map((node) => {
    const rank = state.account.skills[node.id] ?? 0;
    const requiresMet = node.requires.every((r) => (state.account.skills[r] ?? 0) > 0);
    const open = nodeOpen(node, state, content, circles);
    return {
      node,
      rank,
      maxRank: node.maxRank,
      open,
      requiresMet,
      canBuy: open && requiresMet && rank < node.maxRank && available >= node.cost,
      current: skillModifiers(node, rank),
      next: rank < node.maxRank ? skillModifiers(node, rank + 1) : [],
    };
  });
}

export type SkillBuyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'unknown' | 'maxed' | 'locked' | 'closed' | 'no-points' };

/** Buys one rank of an account tree node with skill points. */
export function buySkill(state: GameState, content: Content, nodeId: string): SkillBuyResult {
  const node = skillNode(content, nodeId);
  if (!node) return { ok: false, reason: 'unknown' };
  const rank = state.account.skills[nodeId] ?? 0;
  if (rank >= node.maxRank) return { ok: false, reason: 'maxed' };
  if (!nodeOpen(node, state, content)) return { ok: false, reason: 'closed' };
  if (!node.requires.every((r) => (state.account.skills[r] ?? 0) > 0)) {
    return { ok: false, reason: 'locked' };
  }
  if (skillPoints(state, content).available < node.cost) return { ok: false, reason: 'no-points' };
  const next = cloneState(state);
  next.account.skills[nodeId] = rank + 1;
  return { ok: true, state: next };
}

/**
 * Brings a set of bought ranks (a save being loaded) in line with the tree and the points earned,
 * so that a migration or a changed tree never leaves more ranks than points (DESIGN.md §10):
 * old node ids move to their new node (`legacySkills`); unknown nodes, ranks above a node's max,
 * nodes in a closed ring or a hidden circle and nodes whose requirement is not bought are dropped;
 * then the nodes at the end of the tree lose ranks until what is spent fits the points earned.
 * Dropped ranks need no refund step: points are derived, so they simply become free again.
 */
export function fitSkillsToPoints(
  state: GameState,
  content: Content,
  saved: Readonly<Record<string, number>>,
): Record<string, number> {
  const skills: Record<string, number> = {};
  for (const [savedId, rank] of Object.entries(saved)) {
    const id = content.account.legacySkills[savedId] ?? savedId;
    const node = skillNode(content, id);
    if (!node || !(rank > 0)) continue;
    skills[id] = Math.max(skills[id] ?? 0, Math.min(Math.floor(rank), node.maxRank));
  }
  const circles = weaponCircles(state, content);
  const tree = content.account.tree;
  const dropInvalid = (): void => {
    for (let changed = true; changed;) {
      changed = false;
      for (const node of tree) {
        if (!skills[node.id]) continue;
        const ok =
          nodeOpen(node, state, content, circles) &&
          node.requires.every((r) => (skills[r] ?? 0) > 0);
        if (!ok) {
          delete skills[node.id];
          changed = true;
        }
      }
    }
  };
  dropInvalid();
  const earned = pointsEarned(state, content);
  for (let i = tree.length - 1; i >= 0 && ranksCost(content, skills) > earned; i--) {
    const node = tree[i]!;
    while ((skills[node.id] ?? 0) > 0 && ranksCost(content, skills) > earned) {
      skills[node.id]! -= 1;
    }
    if (!skills[node.id]) delete skills[node.id];
  }
  dropInvalid();
  return skills;
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

/** The card level that opens an option (0 = open from the start). */
export function optionUnlockLevel(content: Content, option: EnhancementOption): number {
  return option.milestone * content.enhancements.milestoneEvery;
}

export interface CardEnhancementInfo {
  unlocked: boolean;
  unlockRank: Rank;
  budget: number;
  spent: number;
  options: {
    option: EnhancementOption;
    chosen: boolean;
    /** The card level that opens it (0 = open from the start). */
    unlockLevel: number;
    /** The card is at that level. */
    open: boolean;
    canChoose: boolean;
  }[];
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
      const unlockLevel = optionUnlockLevel(content, option);
      const open = owned.level >= unlockLevel;
      return {
        option,
        chosen,
        unlockLevel,
        open,
        canChoose: !chosen && open && budget > 0 && spent + option.cost <= budget,
      };
    }),
  };
}

export type EnhanceResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'unknown' | 'not-owned' | 'locked' | 'level' | 'already' | 'over-budget' };

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
  if (owned.level < optionUnlockLevel(content, option)) return { ok: false, reason: 'level' };
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
 * Where each weapon type's circle acts now: everywhere (scope null) while the fighting loadout's
 * main card is of that type, and at the place of each worker whose card is of that type.
 */
function circleScopesOf(
  state: GameState,
  content: Content,
): Record<string, (ModifierScope | null)[]> {
  const out: Record<string, (ModifierScope | null)[]> = {};
  const main = state.cards.loadouts.fighting.main;
  const mainKind = main && state.cards.owned[main] ? content.cardById.get(main)?.item.kind : null;
  if (mainKind) out[mainKind] = [null];
  for (const { cardId, scope } of cardsAtWork(state, content)) {
    if (!scope) continue;
    const kind = content.cardById.get(cardId)?.item.kind;
    if (kind) (out[kind] ??= []).push(scope);
  }
  return out;
}

/**
 * Account tree ranks (source `skill`), the reward track's cost cap bumps reached (source
 * `account`, id `level_<n>`), and the enhancements of cards in a loadout (source `enhancement`,
 * id `<card>:<option>`). Read by `collectModifiers`.
 */
export function accountModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  const circleScopes = circleScopesOf(state, content);
  for (const node of content.account.tree) {
    const mods = skillModifiers(node, state.account.skills[node.id] ?? 0);
    if (!node.circle) out.push(...mods);
    // A circle skill belongs to its weapon type: it acts only where a card of that type is at work
    // (DESIGN.md §10 Hidden weapon circles).
    else
      for (const scope of circleScopes[node.circle] ?? []) {
        out.push(...mods.map((m) => (scope ? { ...m, scope: { ...m.scope, ...scope } } : m)));
      }
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
      if (!option || owned.level < optionUnlockLevel(content, option)) continue;
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
