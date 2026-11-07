import { METALS, type Content, type MasteryBonus, type Metal, type ModifierScope } from '../data';
import type { Modifier } from './modifiers';
import { Decimal } from './num';
import type { TickReport, TierUp } from './report';
import type { GameState } from './state';

/**
 * Mastery (DESIGN.md 16). Gem mastery (E2): each production gem's lifetime total harvested gives
 * a tier on the metal ladder. Boss mastery (E3): kills per dungeon give medal tiers; special
 * dungeons take theirs from their best score. Both are kept through prestige, and each tier adds
 * the bonuses in progression.json through the modifier pipeline (source kind `mastery`).
 *
 * The tiers that give bonuses are the settled ones in `state.mastery`; `settleMastery` brings
 * them up to date on the 1 s play-time grid (tick.ts).
 */

/** Highest tier: prismatic. */
export const MAX_MASTERY_TIER = METALS.length - 1;

/** The metal of a tier, capped at prismatic. */
export function metalOf(tier: number): Metal {
  return METALS[Math.max(0, Math.min(MAX_MASTERY_TIER, Math.floor(tier)))]!;
}

/** Tiers whose threshold `value` reached (0..4). */
export function tierFor(
  thresholds: readonly (Decimal | number)[],
  value: Decimal | number,
): number {
  const v = new Decimal(value);
  let tier = 0;
  for (const t of thresholds) if (v.gte(t)) tier++;
  return tier;
}

/** A mastery tier ready to show: the medal / coin metal and the bar toward the next tier. */
export interface MasteryInfo<T> {
  /** Settled tier, 0 (stone) .. 4 (prismatic). */
  tier: number;
  metal: Metal;
  /** Where the bar stands toward the next tier, 0..1 (1 at prismatic). Linear from the
   *  current tier's threshold to the next one. */
  progress: number;
  /** Threshold of the next tier, or null at prismatic. */
  nextThreshold: T | null;
}

function info<T extends Decimal | number>(
  thresholds: readonly T[],
  tier: number,
  value: Decimal | number,
): MasteryInfo<T> {
  const next = thresholds[tier] ?? null;
  if (next === null) return { tier, metal: metalOf(tier), progress: 1, nextThreshold: null };
  const prev = new Decimal(tier > 0 ? thresholds[tier - 1]! : 0);
  const span = new Decimal(next).sub(prev);
  const done = new Decimal(value).sub(prev);
  const progress = span.lte(0) ? 1 : Math.min(1, Math.max(0, done.div(span).toNumber()));
  return { tier, metal: metalOf(tier), progress, nextThreshold: next };
}

/** True for tree and mine gems (the resources that have a mastery). */
export function isProductionGem(content: Content, resourceId: string): boolean {
  const kind = content.resourceById.get(resourceId)?.kind;
  return kind === 'tree_gem' || kind === 'mine_gem';
}

export interface GemMasteryInfo extends MasteryInfo<Decimal> {
  /** Lifetime total harvested. */
  total: Decimal;
}

/** A production gem's mastery (coin metal and bar). Unknown ids read as stone with nothing. */
export function gemMastery(state: GameState, content: Content, gemId: string): GemMasteryInfo {
  const total = state.mastery.harvested[gemId] ?? new Decimal(0);
  const tier = state.mastery.gemTiers[gemId] ?? 0;
  return { ...info(content.progression.gemMastery.thresholds, tier, total), total };
}

export interface BossMasteryInfo extends MasteryInfo<number> {
  /** Kills in the dungeon, or the best score (0..1) of a special dungeon. */
  value: number;
  /** True for a special dungeon (medal from the best score). */
  trial: boolean;
}

/** A dungeon's (or special dungeon's) medal. Null for unknown ids. */
export function bossMastery(
  state: GameState,
  content: Content,
  dungeonId: string,
): BossMasteryInfo | null {
  const tier = state.mastery.bossTiers[dungeonId] ?? 0;
  if (content.dungeonById.has(dungeonId)) {
    const value = state.combat.kills[dungeonId] ?? 0;
    return {
      ...info(content.progression.bossMastery.thresholds, tier, value),
      value,
      trial: false,
    };
  }
  if (content.trialById.has(dungeonId)) {
    const value = state.combat.trialBest[dungeonId] ?? 0;
    return {
      ...info(content.progression.trialMastery.thresholds, tier, value),
      value,
      trial: true,
    };
  }
  return null;
}

// ---- modifiers -------------------------------------------------------------------------------

function bonuses(
  perTier: readonly MasteryBonus[],
  tier: number,
  scope: ModifierScope,
  id: string,
): Modifier[] {
  if (tier <= 0) return [];
  return perTier.map((b) => ({
    stat: b.stat,
    kind: b.kind,
    value: b.value.mul(tier),
    scope,
    source: { kind: 'mastery', id },
  }));
}

/** Every mastery bonus of the settled tiers: per gem (scope resource), per boss (scope dungeon). */
export function masteryModifiers(state: GameState, content: Content): Modifier[] {
  const p = content.progression;
  const out: Modifier[] = [];
  for (const [gem, tier] of Object.entries(state.mastery.gemTiers)) {
    if (!isProductionGem(content, gem)) continue;
    out.push(...bonuses(p.gemMastery.perTier, tier, { resource: gem }, gem));
  }
  for (const [id, tier] of Object.entries(state.mastery.bossTiers)) {
    const perTier = content.dungeonById.has(id)
      ? p.bossMastery.perTier
      : content.trialById.has(id)
        ? p.trialMastery.perTier
        : null;
    if (perTier) out.push(...bonuses(perTier, tier, { dungeon: id }, id));
  }
  return out;
}

// ---- counting and settling -------------------------------------------------------------------

/** Adds harvested gems to their lifetime totals (mutates `state`). Non-gems are ignored. */
export function countHarvest(
  state: GameState,
  content: Content,
  gains: Record<string, Decimal>,
): void {
  for (const [id, amount] of Object.entries(gains)) {
    if (amount.lte(0) || !isProductionGem(content, id)) continue;
    state.mastery.harvested[id] = (state.mastery.harvested[id] ?? new Decimal(0)).add(amount);
  }
}

/** Tiers the totals have reached now, keyed like the settled tiers (only tiers above 0). */
function reachedTiers(
  state: GameState,
  content: Content,
): { gems: Record<string, number>; bosses: Record<string, number> } {
  const p = content.progression;
  const gems: Record<string, number> = {};
  for (const [id, total] of Object.entries(state.mastery.harvested)) {
    const tier = isProductionGem(content, id) ? tierFor(p.gemMastery.thresholds, total) : 0;
    if (tier > 0) gems[id] = tier;
  }
  const bosses: Record<string, number> = {};
  for (const d of content.dungeons) {
    const tier = tierFor(p.bossMastery.thresholds, state.combat.kills[d.id] ?? 0);
    if (tier > 0) bosses[d.id] = tier;
  }
  for (const t of content.trials) {
    const tier = tierFor(p.trialMastery.thresholds, state.combat.trialBest[t.id] ?? 0);
    if (tier > 0) bosses[t.id] = tier;
  }
  return { gems, bosses };
}

const sameTiers = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
};

/** Whether a settled tier differs from what the totals reached (a settle would change it). */
export function masteryDue(state: GameState, content: Content): boolean {
  const reached = reachedTiers(state, content);
  return (
    !sameTiers(reached.gems, state.mastery.gemTiers) ||
    !sameTiers(reached.bosses, state.mastery.bossTiers)
  );
}

/**
 * Brings the settled tiers up to the totals (mutates `state`) and reports each tier gained as a
 * TierUp. Pass no report to settle silently (loading a save).
 */
export function settleMastery(state: GameState, content: Content, report?: TickReport): void {
  const reached = reachedTiers(state, content);
  const push = (
    kind: TierUp['kind'],
    before: Record<string, number>,
    after: Record<string, number>,
  ) => {
    for (const [id, to] of Object.entries(after)) {
      const from = before[id] ?? 0;
      if (to > from) report?.tierUps.push({ kind, id, from, to, metal: metalOf(to) });
    }
  };
  push('gem_mastery', state.mastery.gemTiers, reached.gems);
  push('boss_mastery', state.mastery.bossTiers, reached.bosses);
  state.mastery.gemTiers = reached.gems;
  state.mastery.bossTiers = reached.bosses;
}
