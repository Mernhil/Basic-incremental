import type { Content, Milestones, PerkLine, PerkMilestone } from '../data';
import { averageDps, burstStats, loadoutMaxHealth } from './combat';
import { milestoneInfo, type MilestoneInfo } from './milestones';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { harvestCrit, harvestSpeed, jobProductionPerSecond } from './production';
import { cloneState, type GameState } from './state';
import { lineLevel, lineMilestones, pickedOption } from './upgrades';

/**
 * The upgrade row (DESIGN.md §4 The upgrade row): what buying levels of a repeatable line changes,
 * in real numbers for the player's state ("Team damage 412/s -> 417/s", "Oak 41/s -> 41.9/s"), and
 * the line's next milestone, worked out on a copy of the state without paying.
 */

/** What a line's numbers mean. */
export type LineEffectKind =
  | 'placeOutput'
  | 'jobOutput'
  | 'burstEvery'
  | 'critChance'
  | 'critDamage'
  | 'teamDps'
  | 'teamHealth'
  | 'moneyPerKill'
  | 'hitsPerSignature';

export interface LineEffect {
  kind: LineEffectKind;
  now: Decimal;
  after: Decimal;
  /** The gem of a place's output. */
  resource?: string;
}

/** A copy of the state with the line `levels` higher. */
export function withLineLevel(state: GameState, line: PerkLine, levels: number): GameState {
  const next = cloneState(state);
  const level = lineLevel(state, line) + levels;
  switch (line.kind) {
    case 'tree':
      next.production.treeLevels[line.id] = level;
      break;
    case 'mine':
      next.production.mineLevels[line.id] = level;
      break;
    case 'tool':
      next.production.tools[line.id] = level;
      break;
    case 'training':
      next.combat.training[line.id] = level;
      break;
  }
  return next;
}

const sum = (rates: Record<string, Decimal>): Decimal =>
  Object.values(rates).reduce((a, b) => a.add(b), new Decimal(0));

function measure(
  state: GameState,
  content: Content,
  line: PerkLine,
  modifiers: readonly Modifier[],
): Decimal {
  const dungeon = state.activeDungeonId;
  switch (line.kind) {
    case 'tree':
    case 'mine': {
      const producer =
        line.kind === 'tree' ? content.treeById.get(line.id) : content.mineById.get(line.id);
      const job = line.kind === 'tree' ? 'logging' : 'mining';
      if (!producer) return new Decimal(0);
      return (
        jobProductionPerSecond(state, content, job, modifiers)[producer.resource] ?? new Decimal(0)
      );
    }
    case 'tool': {
      const tool = content.production.tools.find((t) => t.id === line.id);
      if (!tool) return new Decimal(0);
      switch (tool.stat) {
        case 'harvest.speed': {
          const stats = burstStats(content, tool.job, modifiers);
          const perSecond = stats.fill * harvestSpeed(tool.job, modifiers);
          return perSecond > 0 ? new Decimal(stats.size / perSecond) : new Decimal(0);
        }
        case 'harvest.critChance':
          return new Decimal(harvestCrit(content, tool.job, modifiers).chance);
        case 'harvest.critDamage':
          return harvestCrit(content, tool.job, modifiers).damage;
        default:
          return sum(jobProductionPerSecond(state, content, tool.job, modifiers));
      }
    }
    case 'training': {
      const t = content.trainingById.get(line.id);
      if (!t) return new Decimal(0);
      switch (t.stat) {
        case 'combat.damage':
          return dungeon ? averageDps(state, content, dungeon, modifiers) : new Decimal(0);
        case 'combat.health':
          return dungeon ? loadoutMaxHealth(state, content, modifiers, dungeon) : new Decimal(0);
        case 'burst.fill': {
          const stats = burstStats(content, 'fighting', modifiers);
          return stats.fill > 0 ? new Decimal(stats.size / stats.fill) : new Decimal(0);
        }
        default:
          return statValue(t.stat, 1, modifiers, {
            job: 'fighting',
            ...(dungeon ? { dungeon } : {}),
            resource: 'money',
          });
      }
    }
  }
}

function effectKind(content: Content, line: PerkLine): LineEffectKind {
  if (line.kind === 'tree' || line.kind === 'mine') return 'placeOutput';
  if (line.kind === 'tool') {
    const stat = content.production.tools.find((t) => t.id === line.id)?.stat;
    if (stat === 'harvest.speed') return 'burstEvery';
    if (stat === 'harvest.critChance') return 'critChance';
    if (stat === 'harvest.critDamage') return 'critDamage';
    return 'jobOutput';
  }
  const stat = content.trainingById.get(line.id)?.stat;
  if (stat === 'combat.damage') return 'teamDps';
  if (stat === 'combat.health') return 'teamHealth';
  if (stat === 'burst.fill') return 'hitsPerSignature';
  return 'moneyPerKill';
}

/** What buying `levels` levels of a line changes, now and after (0 levels: after = now). */
export function lineEffect(
  state: GameState,
  content: Content,
  line: PerkLine,
  levels: number,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): LineEffect {
  const now = measure(state, content, line, modifiers);
  let after = now;
  if (levels > 0) {
    const next = withLineLevel(state, line, levels);
    after = measure(next, content, line, collectModifiers(next, content));
  }
  const producer =
    line.kind === 'tree'
      ? content.treeById.get(line.id)
      : line.kind === 'mine'
        ? content.mineById.get(line.id)
        : undefined;
  return {
    kind: effectKind(content, line),
    now,
    after,
    ...(producer ? { resource: producer.resource } : {}),
  };
}

/** The line's own repeating milestone (a tree's ×1.15 every 15 levels, Training's every 25). */
export function lineRings(content: Content, line: PerkLine): Milestones | null {
  switch (line.kind) {
    case 'tree':
      return content.treeById.get(line.id)?.level.milestones ?? null;
    case 'mine':
      return content.mineById.get(line.id)?.level.milestones ?? null;
    case 'tool':
      return content.production.tools.find((t) => t.id === line.id)?.milestones ?? null;
    case 'training':
      return content.trainingById.get(line.id)?.milestones ?? null;
  }
}

/** The next step of a line: its next ring, its next pick, or both when they share a level. */
export interface LineStep {
  /** The level of the nearer one. */
  level: number;
  levelsToGo: number;
  /** The ring at that level, with what it multiplies the line by. */
  ring: MilestoneInfo | null;
  /** The pick at that level. */
  pick: PerkMilestone | null;
  /** The level of the milestone before (ring or pick, 0 at the start), for the bar. */
  fromLevel: number;
}

export function nextLineStep(state: GameState, content: Content, line: PerkLine): LineStep | null {
  const level = lineLevel(state, line);
  const rings = lineRings(content, line);
  const ring = rings ? milestoneInfo(rings, level) : null;
  const picks = lineMilestones(content, line);
  const pick = picks.find((m) => m.level > level) ?? null;
  const levels = [ring?.nextLevel, pick?.level].filter((n): n is number => n !== undefined);
  if (levels.length === 0) return null;
  const at = Math.min(...levels);
  const before = [
    ring ? ring.reached * (rings?.every ?? 0) : 0,
    ...picks.filter((m) => m.level <= level).map((m) => m.level),
  ];
  return {
    level: at,
    levelsToGo: at - level,
    ring: ring && ring.nextLevel === at ? ring : null,
    pick: pick && pick.level === at ? pick : null,
    fromLevel: Math.max(0, ...before),
  };
}

/** The perks picked on a line that apply now (its badges). */
export function lineBadges(state: GameState, content: Content, line: PerkLine) {
  const level = lineLevel(state, line);
  return lineMilestones(content, line).flatMap((m) => {
    const option = pickedOption(state, m);
    return option && m.level <= level ? [{ milestone: m, option }] : [];
  });
}
