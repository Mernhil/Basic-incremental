import type { Achievement, AchievementCondition, Content, Rarity } from '../../../data';
import {
  Decimal,
  formatDuration,
  type AchievementEntry,
  type CardGain,
  type CosmeticGain,
  type GameState,
  type ShardOffer,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { rewardView } from './ascensionModel';
import type { BuyLineView } from './buyModel';
import type { RevealView } from './summonModel';

/**
 * Achievements view models (DESIGN.md 11.6, 12.20, 17 "sticker book", A10 C): the chapters of the
 * sticker book, each sticker's progress, reward preview and art, the unlock toasts, and the shard
 * shop offers. Display logic only; conditions, rewards and prices come from game.
 */

// ---- sticker book ------------------------------------------------------------------------------

export type ChapterId = 'gathering' | 'battle' | 'cards' | 'wardrobe' | 'journey';
export const CHAPTERS: readonly ChapterId[] = [
  'gathering',
  'battle',
  'cards',
  'wardrobe',
  'journey',
];

/**
 * What a sticker is drawn with until the final sticker art arrives (pixel-art request): the page
 * turns it into existing pixel art (a gem coin, a mastery medal or a navigation plaque).
 */
export type StickerArt =
  | { kind: 'coin'; resource: string; tier: number }
  | { kind: 'medal'; tier: number }
  | { kind: 'plaque'; glyph: 'cards' | 'summon' | 'wardrobe' | 'skills' | 'shop' | 'home' };

export interface StickerView {
  id: string;
  name: string;
  description: string;
  chapter: ChapterId;
  unlocked: boolean;
  /** 0..1 (1 once unlocked). */
  progress: number;
  /** "5,000 / 10,000"; empty for yes / no goals and once unlocked. */
  progressText: string;
  /** "After 2h 14m of play"; empty while locked. */
  dateText: string;
  /** "3 Moss Core", "Gilded Plate, Rare border". */
  rewards: string[];
  /** A small tilt in degrees, fixed per sticker, so the page looks hand-stuck. */
  tilt: number;
  art: StickerArt;
}

export interface ChapterView {
  id: ChapterId;
  title: string;
  /** "3 of 9". */
  count: string;
  done: boolean;
  stickers: StickerView[];
}

export interface BookView {
  chapters: ChapterView[];
  unlocked: number;
  total: number;
  /** "17 of 29 stickers". */
  summary: string;
  progress: number;
}

/** The chapter a condition belongs to (achievements.json has no categories). */
export function chapterOf(condition: AchievementCondition): ChapterId {
  switch (condition.kind) {
    case 'harvested':
    case 'producers':
    case 'milestone':
    case 'gem_mastery':
      return 'gathering';
    case 'kills':
    case 'cleared':
    case 'boss_mastery':
      return 'battle';
    case 'pulls':
    case 'pity_hits':
    case 'card_tier':
    case 'card_stars':
    case 'full_loadout':
      return 'cards';
    case 'full_set':
    case 'cosmetics_owned':
    case 'max_cosmetic':
      return 'wardrobe';
    case 'skill_points_spent':
    case 'ascensions':
    case 'offline_hours':
      return 'journey';
  }
}

const TIER_INDEX: Record<string, number> = { bronze: 1, silver: 2, gold: 3, prismatic: 4 };

/** The gem a gathering sticker shows: the job's first or second gem. */
function gemFor(content: Content, job: 'logging' | 'mining' | undefined, step: number): string {
  const kind = job === 'mining' ? 'mine_gem' : 'tree_gem';
  const gems = content.resources.filter((r) => r.kind === kind && r.gem);
  return (gems[Math.min(step, gems.length - 1)] ?? gems[0])?.id ?? '';
}

/** The placeholder art for an achievement (swap here when the sticker art lands). */
export function stickerArt(content: Content, achievement: Achievement): StickerArt {
  const c = achievement.condition;
  switch (c.kind) {
    case 'harvested': {
      const big = c.amount.gte(1e6);
      return { kind: 'coin', resource: gemFor(content, c.job, big ? 1 : 0), tier: big ? 2 : 1 };
    }
    case 'producers':
      return { kind: 'coin', resource: gemFor(content, c.job, 2), tier: 2 };
    case 'milestone':
      return { kind: 'coin', resource: gemFor(content, 'mining', 1), tier: 1 };
    case 'gem_mastery':
      return { kind: 'coin', resource: gemFor(content, 'logging', 2), tier: c.tier };
    case 'kills':
      return { kind: 'medal', tier: 1 };
    case 'cleared': {
      const n = content.dungeons.findIndex((d) => d.id === c.dungeon);
      return { kind: 'medal', tier: n < 0 ? 4 : Math.min(3, n + 1) };
    }
    case 'boss_mastery':
      return { kind: 'medal', tier: c.tier };
    case 'card_tier':
      return { kind: 'medal', tier: TIER_INDEX[c.tier] ?? 1 };
    case 'card_stars':
      return { kind: 'medal', tier: 3 };
    case 'pulls':
    case 'pity_hits':
      return { kind: 'plaque', glyph: 'summon' };
    case 'full_loadout':
      return { kind: 'plaque', glyph: 'cards' };
    case 'full_set':
    case 'cosmetics_owned':
    case 'max_cosmetic':
      return { kind: 'plaque', glyph: 'wardrobe' };
    case 'skill_points_spent':
      return { kind: 'plaque', glyph: 'skills' };
    case 'ascensions':
      return { kind: 'plaque', glyph: 'shop' };
    case 'offline_hours':
      return { kind: 'plaque', glyph: 'home' };
  }
}

/** Goals that are simply met or not show no "x / y" count. */
const YES_NO = new Set<AchievementCondition['kind']>([
  'cleared',
  'card_tier',
  'full_loadout',
  'full_set',
  'max_cosmetic',
]);

function progressText(entry: AchievementEntry): string {
  const c = entry.achievement.condition;
  if (entry.unlocked || YES_NO.has(c.kind)) return '';
  const value = Math.min(entry.value, entry.target);
  if (c.kind === 'offline_hours') {
    return COPY.achievements.of(
      formatDuration(value * 3_600_000),
      formatDuration(entry.target * 3_600_000),
    );
  }
  if (c.kind === 'gem_mastery' || c.kind === 'boss_mastery') {
    const metal = (n: number): string => COPY.achievements.metals[n] ?? String(n);
    return COPY.achievements.of(metal(value), metal(entry.target));
  }
  const count = (n: number): string =>
    n < 1e6 ? Math.floor(n).toLocaleString('en-US') : fmt(new Decimal(n));
  return COPY.achievements.of(count(value), count(entry.target));
}

const resName = (content: Content, id: string): string => content.resourceById.get(id)?.name ?? id;

/** The reward preview lines of an achievement. */
export function rewardLines(content: Content, achievement: Achievement): string[] {
  return [
    ...achievement.reward.cosmetics.map((id) => rewardView(content, id).text),
    ...achievement.reward.resources.map((r) =>
      COPY.achievements.bundle(fmt(r.amount), resName(content, r.resource)),
    ),
  ];
}

/** A stable tilt in -6..6 degrees from the id. */
export function tiltOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 13) - 6;
}

export function stickerView(entry: AchievementEntry, content: Content): StickerView {
  const a = entry.achievement;
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    chapter: chapterOf(a.condition),
    unlocked: entry.unlocked,
    progress: entry.progress,
    progressText: progressText(entry),
    dateText:
      entry.unlockedAt === null
        ? ''
        : COPY.achievements.unlockedAt(formatDuration(entry.unlockedAt)),
    rewards: rewardLines(content, a),
    tilt: tiltOf(a.id),
    art: stickerArt(content, a),
  };
}

/** The whole book: chapters in order, each with its stickers in data order. */
export function bookView(entries: readonly AchievementEntry[], content: Content): BookView {
  const t = COPY.achievements;
  const stickers = entries.map((e) => stickerView(e, content));
  const chapters = CHAPTERS.map((id) => {
    const list = stickers.filter((s) => s.chapter === id);
    const got = list.filter((s) => s.unlocked).length;
    return {
      id,
      title: t.chapters[id],
      count: t.count(got, list.length),
      done: list.length > 0 && got === list.length,
      stickers: list,
    };
  }).filter((c) => c.stickers.length > 0);
  const unlocked = stickers.filter((s) => s.unlocked).length;
  return {
    chapters,
    unlocked,
    total: stickers.length,
    summary: t.summary(unlocked, stickers.length),
    progress: stickers.length > 0 ? unlocked / stickers.length : 0,
  };
}

/**
 * Splits the chapters over the two pages of the spread so both hold about the same number of
 * stickers, keeping chapter order (left page first).
 */
export function spread(chapters: readonly ChapterView[]): [ChapterView[], ChapterView[]] {
  const total = chapters.reduce((n, c) => n + c.stickers.length, 0);
  let best = 0;
  let bestGap = Infinity;
  let run = 0;
  for (let i = 0; i <= chapters.length; i++) {
    const gap = Math.abs(total - 2 * run);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
    run += chapters[i]?.stickers.length ?? 0;
  }
  return [chapters.slice(0, best), chapters.slice(best)];
}

/** The toast for an unlock: "Achievement: First Kill" and its rewards. */
export function unlockToast(
  content: Content,
  id: string,
): { title: string; detail: string } | null {
  const a = content.achievements.find((x) => x.id === id);
  if (!a) return null;
  const rewards = rewardLines(content, a);
  return {
    title: COPY.achievements.toast(a.name),
    detail: rewards.length > 0 ? COPY.achievements.toastReward(rewards) : a.description,
  };
}

// ---- shard shop --------------------------------------------------------------------------------

export type ShardGroup = 'cards' | 'supplies' | 'exclusive';
export const SHARD_GROUPS: readonly ShardGroup[] = ['cards', 'supplies', 'exclusive'];

export type OfferArt =
  | { kind: 'card'; cardId: string }
  | { kind: 'coin'; resource: string }
  | { kind: 'resource'; resource: string }
  | { kind: 'cosmetic'; cosmetic: string };

export interface ShardOfferView {
  id: string;
  group: ShardGroup;
  name: string;
  /** "Epic card", "×50", "Rare crown". */
  detail: string;
  rarity: Rarity | null;
  art: OfferArt;
  soldOut: boolean;
  /** "1 left", "Sold out", or empty when unlimited. */
  stockText: string;
  buy: BuyLineView;
}

/** Shards in hand, for the shop header. */
export const shardsText = (state: GameState): string => state.cards.shards.toLocaleString('en-US');

export function shardOfferViews(
  offers: readonly ShardOffer[],
  state: GameState,
  content: Content,
): ShardOfferView[] {
  const t = COPY.achievements;
  const have = state.cards.shards;
  return offers.map((o) => {
    const r = o.item.reward;
    let group: ShardGroup;
    let name: string;
    let detail: string;
    let rarity: Rarity | null = null;
    let art: OfferArt;
    let gain: string;
    if (r.kind === 'card') {
      const card = content.cardById.get(r.card);
      name = card?.name ?? r.card;
      rarity = card?.rarity ?? null;
      detail = t.cardDetail(content.rarityById.get(card?.rarity ?? 'common')?.name ?? '');
      art = { kind: 'card', cardId: r.card };
      group = 'cards';
      gain = t.copyOf(name);
    } else if (r.kind === 'resource') {
      name = resName(content, r.resource);
      detail = t.amount(fmt(r.amount));
      art = content.resourceById.get(r.resource)?.gem
        ? { kind: 'coin', resource: r.resource }
        : { kind: 'resource', resource: r.resource };
      group = 'supplies';
      gain = t.bundle(fmt(r.amount), name);
    } else {
      const v = rewardView(content, r.cosmetic);
      const c = content.cosmeticById.get(r.cosmetic);
      name = v.name;
      rarity = c?.rarity ?? null;
      detail = c ? t.cosmeticDetail(content.rarityById.get(c.rarity)?.name ?? '', c.slot) : '';
      art = { kind: 'cosmetic', cosmetic: r.cosmetic };
      group = 'exclusive';
      gain = v.text;
    }
    const soldOut = o.left === 0;
    const stockText = o.left === null ? '' : soldOut ? t.soldOut : t.left(o.left);
    const price = { resource: 'shards', amount: new Decimal(o.price) };
    return {
      id: o.item.id,
      group,
      name,
      detail,
      rarity,
      art,
      soldOut,
      stockText,
      buy: {
        id: o.item.id,
        name,
        resource: 'shards',
        level: o.bought,
        available: !soldOut,
        offer: {
          count: 1,
          price,
          affordable: o.affordable,
          progress: soldOut ? 0 : Math.min(1, have / Math.max(1, o.price)),
        },
        label: soldOut ? t.soldOut : t.buy,
        price: soldOut ? '' : t.price(o.price),
        preview: gain,
        milestone: '',
        milestoneInfo: null,
        gain: new Decimal(0),
      },
    };
  });
}

/** What a shard purchase gave: a reveal for a card or cosmetic, a toast for a bundle. */
export type ShardGainView =
  { kind: 'reveal'; view: RevealView } | { kind: 'toast'; title: string; detail: string };

export function shardGainView(
  content: Content,
  itemId: string,
  gain: CardGain | CosmeticGain | null,
): ShardGainView | null {
  const item = content.shardShop.find((i) => i.id === itemId);
  if (!item) return null;
  const r = item.reward;
  const t = COPY.achievements;
  if (r.kind === 'resource') {
    return {
      kind: 'toast',
      title: t.bought,
      detail: t.bundle(fmt(r.amount), resName(content, r.resource)),
    };
  }
  const id = r.kind === 'card' ? r.card : r.cosmetic;
  const rarity =
    r.kind === 'card'
      ? content.cardById.get(r.card)?.rarity
      : content.cosmeticById.get(r.cosmetic)?.rarity;
  const s = COPY.summon;
  const tags: string[] = [];
  if (gain?.kind === 'new') tags.push(s.isNew);
  else if (gain?.kind === 'duplicate') tags.push(s.duplicate(gain.duplicates));
  else if (gain?.kind === 'shards') tags.push(s.shards(gain.shards));
  else if (gain?.kind === 'copy') tags.push(s.copy(gain.copies));
  const r0 = rarity ?? 'common';
  return {
    kind: 'reveal',
    view: {
      itemId: id,
      name: content.cardById.get(id)?.name ?? content.cosmeticById.get(id)?.name ?? id,
      rarity: r0,
      rarityName: content.rarityById.get(r0)?.name ?? r0,
      orb: r0,
      upgrade: false,
      tags,
    },
  };
}
