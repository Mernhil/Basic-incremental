import { fmt } from '../settings/numberFormat';
import type { Content } from '../../../data';
import { Decimal, type AccountInfo, type TrackLevel } from '../../../game';
import { COPY } from '../copy';

/**
 * The account level in the header, the reward track (DESIGN.md 16 E7, A16 B quest scroll) and
 * the level-up "what you got" list, as plain display data. No DOM, no rules.
 */

export interface LevelBadgeView {
  level: number;
  /** XP bar, 0..1. */
  fraction: number;
  /** "120 / 300 XP" or "Max level". */
  xpText: string;
  /** "3 skill points to spend", or "" with none. */
  pointsText: string;
  points: number;
  label: string;
}

export function levelBadge(info: AccountInfo): LevelBadgeView {
  const xpText = info.xpToNext
    ? COPY.account.xp(fmt(info.xp.floor()), fmt(info.xpToNext.ceil()))
    : COPY.account.maxLevel;
  const points = info.skillPoints.available;
  const pointsText = points > 0 ? COPY.account.points(points) : '';
  return {
    level: info.level,
    fraction: info.progress,
    xpText,
    pointsText,
    points,
    label: COPY.account.badgeLabel(info.level, xpText, pointsText || COPY.account.noPoints),
  };
}

export type RewardView =
  | { kind: 'points'; text: string; short: string }
  | { kind: 'resource'; id: string; text: string; short: string }
  | { kind: 'cosmetic'; id: string; text: string }
  | { kind: 'cap'; text: string; short: string };

export interface TrackTileView {
  level: number;
  reached: boolean;
  /** The next level to reach. */
  next: boolean;
  /** Gives more than its skill point (a signpost on the path, drawn larger). */
  milestone: boolean;
  /** The headline reward first (cosmetic, then sigils, then cost cap, then the point). */
  rewards: RewardView[];
  label: string;
}

function rewardsOf(content: Content, t: Omit<TrackLevel, 'level' | 'reached'>): RewardView[] {
  const out: RewardView[] = [];
  for (const id of t.cosmetics) {
    out.push({
      kind: 'cosmetic',
      id,
      text: COPY.account.reward.cosmetic(content.cosmeticById.get(id)?.name ?? id),
    });
  }
  for (const r of t.resources) {
    const name = content.resourceById.get(r.resource)?.name ?? r.resource;
    const amount = fmt(r.amount);
    out.push({
      kind: 'resource',
      id: r.resource,
      text: COPY.account.reward.resource(amount, name),
      short: `+${amount}`,
    });
  }
  if (t.costCap > 0) {
    out.push({
      kind: 'cap',
      text: COPY.account.reward.cap(t.costCap),
      short: COPY.account.reward.capShort(t.costCap),
    });
  }
  if (t.skillPoints > 0) {
    out.push({
      kind: 'points',
      text: COPY.account.reward.points(t.skillPoints),
      short: COPY.account.reward.pointShort(t.skillPoints),
    });
  }
  return out;
}

/** Every level of the track with its rewards; the first unreached level is `next`. */
export function trackView(content: Content, track: readonly TrackLevel[]): TrackTileView[] {
  const nextLevel = track.find((t) => !t.reached)?.level ?? null;
  return track.map((t) => {
    const rewards = rewardsOf(content, t);
    return {
      level: t.level,
      reached: t.reached,
      next: t.level === nextLevel,
      milestone: rewards.some((r) => r.kind !== 'points'),
      rewards,
      label: COPY.account.tileLabel(t.level, rewards.map((r) => r.text).join(', '), t.reached),
    };
  });
}

export interface LevelUpView {
  title: string;
  /** "+2 skill points", "+10 Moss Sigil", "Holo Hex", "+1 loadout cost cap". */
  lines: string[];
  /** A cosmetic or bigger reward came with it (a stronger toast). */
  big: boolean;
}

/** What levels `from + 1 .. to` gave, summed, for the level-up toast. */
export function levelUpView(
  content: Content,
  track: readonly TrackLevel[],
  from: number,
  to: number,
): LevelUpView {
  const levels = track.filter((t) => t.level > from && t.level <= to);
  const sum: Omit<TrackLevel, 'level' | 'reached'> = {
    skillPoints: 0,
    resources: [],
    cosmetics: [],
    costCap: 0,
  };
  const amounts = new Map<string, Decimal>();
  for (const t of levels) {
    sum.skillPoints += t.skillPoints;
    sum.costCap += t.costCap;
    sum.cosmetics.push(...t.cosmetics);
    for (const r of t.resources) {
      amounts.set(r.resource, (amounts.get(r.resource) ?? new Decimal(0)).add(r.amount));
    }
  }
  sum.resources = [...amounts].map(([resource, amount]) => ({ resource, amount }));
  const rewards = rewardsOf(content, sum);
  // the toast reads best with the point first, then the rest
  const ordered = [
    ...rewards.filter((r) => r.kind === 'points'),
    ...rewards.filter((r) => r.kind !== 'points'),
  ];
  return {
    title: COPY.account.levelUp(to),
    lines: ordered.map((r) => r.text),
    big: rewards.some((r) => r.kind === 'cosmetic'),
  };
}
