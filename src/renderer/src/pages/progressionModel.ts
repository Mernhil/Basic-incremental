import type { Content } from '../../../data';
import { formatDuration, type Goal, type TierUp } from '../../../game';
import { COPY } from '../copy';

/**
 * Progression view models (DESIGN.md 16): the words of a tier-up moment (E1), goal rows for the
 * quest scroll (E8, A16 B) and medal tips (E3). Display logic only.
 */

const metalName = (m: string): string => m.charAt(0).toUpperCase() + m.slice(1);

function nameOf(content: Content, id: string): string {
  return (
    content.resourceById.get(id)?.name ??
    content.dungeonById.get(id)?.name ??
    content.trialById.get(id)?.name ??
    content.mineById.get(id)?.name ??
    content.treeById.get(id)?.name ??
    content.cardById.get(id)?.name ??
    content.combat.damageUpgrades.find((u) => u.id === id)?.name ??
    id
  );
}

/** Title and detail of the toast for one tier-up. */
export function tierUpText(u: TierUp, content: Content): { title: string; detail: string } {
  const t = COPY.progress;
  const name = nameOf(content, u.id);
  const metal = metalName(u.metal);
  switch (u.kind) {
    case 'gem_mastery':
      return { title: t.gemMastery(name, metal), detail: t.gemMasteryDetail };
    case 'boss_mastery':
      return { title: t.bossMastery(name, metal), detail: t.bossMasteryDetail };
    case 'damage_milestone':
      return { title: t.edge(name, metal), detail: t.milestone(u.to) };
    case 'tree_milestone':
    case 'mine_milestone':
      return { title: t.mine(name, metal), detail: t.milestone(u.to) };
    case 'tile_stage':
      return { title: t.tile(name, metal), detail: t.tileDetail };
    case 'card_tier':
      return { title: t.cardTier(name, metal), detail: t.cardTierDetail };
    case 'evolution': {
      const card = content.cardById.get(u.id);
      const unique = card?.evolution
        ? content.progression.evolutions.items.find((i) => i.kind === card.evolution)?.name
        : undefined;
      return { title: t.evolution(name), detail: unique ? t.evolutionDetail(unique) : '' };
    }
    default:
      return { title: name, detail: metal };
  }
}

/** One quest-scroll row. */
export interface GoalRow {
  id: string;
  title: string;
  progress: number;
  done: boolean;
  /** "~12m", "ready", or empty when it cannot be estimated. */
  eta: string;
  page: Goal['page'];
}

export function goalRows(goals: readonly Goal[]): GoalRow[] {
  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    progress: Math.min(1, Math.max(0, g.progress)),
    done: g.progress >= 1 || g.etaSeconds === 0,
    eta:
      g.etaSeconds === null
        ? ''
        : g.etaSeconds <= 0
          ? COPY.progress.ready
          : COPY.progress.eta(formatDuration(g.etaSeconds * 1000)),
    page: g.page,
  }));
}

/** The medal's tooltip: tier and progress to the next one. */
export function medalTip(info: {
  tier: number;
  metal: string;
  nextThreshold: number | null;
  trial: boolean;
  value: number;
}): string {
  const t = COPY.progress;
  const now = info.tier > 0 ? t.medal(metalName(info.metal)) : t.noMedal;
  if (info.nextThreshold === null) return now;
  const next = info.trial
    ? t.nextScore(Math.round(info.value * 100), Math.round(info.nextThreshold * 100))
    : t.nextKills(info.value, info.nextThreshold);
  return `${now}. ${next}`;
}
