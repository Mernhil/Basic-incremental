import { RANK_TIERS, type Content, type RankTier } from '../../../data';
import {
  cardNameById,
  formatDuration,
  formatShort,
  itemName,
  type Goal,
  type QuestEntry,
  type TierUp,
} from '../../../game';
import { COPY } from '../copy';

/**
 * Progression view models (DESIGN.md §4, §6, §10, §12): the words of a tier-up moment (E1), goal rows for the
 * quest scroll (E8, A16 B) and medal tips (E3). Display logic only.
 */

const metalName = (m: string): string => m.charAt(0).toUpperCase() + m.slice(1);

function nameOf(content: Content, id: string, cardTier?: RankTier): string {
  return (
    content.resourceById.get(id)?.name ??
    content.dungeonById.get(id)?.name ??
    content.trialById.get(id)?.name ??
    content.mineById.get(id)?.name ??
    content.treeById.get(id)?.name ??
    cardNameById(content, id, cardTier ? { tier: cardTier } : null) ??
    id
  );
}

/** Title and detail of the toast for one tier-up. */
export function tierUpText(u: TierUp, content: Content): { title: string; detail: string } {
  const t = COPY.progress;
  // a card's tier-up names the weapon it now has
  const name = nameOf(
    content,
    u.id,
    u.kind === 'card_tier'
      ? (RANK_TIERS[u.to] ?? 'prismatic')
      : u.kind === 'heirloom'
        ? 'mythic'
        : undefined,
  );
  const metal = metalName(u.metal);
  switch (u.kind) {
    case 'gem_mastery':
      return { title: t.gemMastery(name, metal), detail: t.gemMasteryDetail };
    case 'boss_mastery':
      return { title: t.bossMastery(name, metal), detail: t.bossMasteryDetail };
    case 'tree_milestone':
    case 'mine_milestone':
      return { title: t.mine(name, metal), detail: t.milestone(u.to) };
    case 'tile_stage':
      return { title: t.tile(name, metal), detail: t.tileDetail };
    case 'card_tier':
      return { title: t.cardTier(name, metal), detail: t.cardTierDetail };
    case 'heirloom': {
      const card = content.cardById.get(u.id);
      const heirloom = card
        ? itemName(content, card.item.kind, 'heirloom', card.rarity, card)
        : undefined;
      return { title: t.heirloom(name), detail: heirloom ? t.heirloomDetail(heirloom) : '' };
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

/** One quest row of the Goals popup and the full list (DESIGN.md §10 Quests). */
export interface QuestRow {
  id: string;
  title: string;
  group: QuestEntry['quest']['group'];
  progress: number;
  /** "3 / 10", or empty for a quest that is a single step. */
  count: string;
  done: boolean;
  claimed: boolean;
  /** "+3 Summon Scrolls". */
  reward: string;
  page: Goal['page'];
}

const PLURAL = /(Scroll|Core|Gem|Shard)$/;

/** What a quest pays, as a line: "+3 Summon Scrolls, +5 Moss Cores". */
export function rewardText(content: Content, quest: QuestEntry['quest']): string {
  return quest.reward
    .map((r) => {
      const name = content.resourceById.get(r.resource)?.name ?? r.resource;
      const plural = !r.amount.eq(1) && PLURAL.test(name) ? 's' : '';
      return `+${formatShort(r.amount)} ${name}${plural}`;
    })
    .join(', ');
}

export function questRow(content: Content, e: QuestEntry): QuestRow {
  return {
    id: e.quest.id,
    title: e.quest.name,
    group: e.quest.group,
    progress: e.progress,
    count: e.target > 1 ? `${formatShort(e.value)} / ${formatShort(e.target)}` : '',
    done: e.done,
    claimed: e.claimed,
    reward: rewardText(content, e.quest),
    page: e.quest.page,
  };
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
