import { describe, expect, it } from 'vitest';
import { Decimal, achievementList, buyShardItem, shardShop } from '../src/game';
import {
  CHAPTERS,
  bookView,
  chapterOf,
  shardGainView,
  shardOfferViews,
  spread,
  stickerView,
  tiltOf,
  unlockToast,
} from '../src/renderer/src/pages/achievementsModel';
import { content, newGame } from './helpers';

const entry = (id: string, s = newGame()) =>
  achievementList(s, content).find((e) => e.achievement.id === id)!;

describe('sticker book', () => {
  it('puts every achievement in exactly one chapter, in chapter order', () => {
    const v = bookView(achievementList(newGame(), content), content);
    expect(v.total).toBe(content.achievements.length);
    expect(v.unlocked).toBe(0);
    expect(v.summary).toBe(`0 of ${content.achievements.length} stickers`);
    expect(v.chapters.map((c) => c.id)).toEqual(CHAPTERS);
    const ids = v.chapters.flatMap((c) => c.stickers.map((s) => s.id));
    expect(new Set(ids).size).toBe(content.achievements.length);
    expect(v.chapters.find((c) => c.id === 'battle')!.count).toMatch(/^0 of \d+$/);
  });

  it('groups by what the goal reads', () => {
    const chapter = (id: string) =>
      chapterOf(content.achievements.find((a) => a.id === id)!.condition);
    expect(chapter('lumberjack_1')).toBe('gathering');
    expect(chapter('giant_slayer_2')).toBe('battle');
    expect(chapter('ten_pulls')).toBe('cards');
    expect(chapter('fashionista')).toBe('wardrobe');
    expect(chapter('night_owl')).toBe('journey');
  });

  it('shows progress, the reward and no date while locked', () => {
    const s = newGame();
    s.mastery.harvested['oak_gem'] = new Decimal(5000);
    const v = stickerView(entry('lumberjack_1', s), content);
    expect(v.unlocked).toBe(false);
    expect(v.progress).toBeCloseTo(0.5);
    expect(v.progressText).toBe('5,000 / 10,000');
    expect(v.dateText).toBe('');
    expect(v.rewards).toEqual(['3 Moss Core']);
  });

  it('shows no count for yes / no goals and hours for Night Owl', () => {
    expect(stickerView(entry('giant_slayer_1'), content).progressText).toBe('');
    const s = newGame();
    s.stats.longestOfflineMs = 2.5 * 3_600_000;
    expect(stickerView(entry('night_owl', s), content).progressText).toBe('2h 30m / 8h');
    s.mastery.bossTiers['root_warden'] = 1;
    expect(stickerView(entry('medalist', s), content).progressText).toBe('Bronze / Silver');
  });

  it('dates an unlocked sticker by play time and lists cosmetic rewards by name', () => {
    const s = newGame();
    s.achievements['giant_slayer_1'] = 2 * 3_600_000 + 14 * 60_000;
    const v = stickerView(entry('giant_slayer_1', s), content);
    expect(v.unlocked).toBe(true);
    expect(v.progressText).toBe('');
    expect(v.dateText).toBe('After 2h 14m of play');
    expect(v.rewards.length).toBeGreaterThan(0);
    expect(v.rewards[0]).toMatch(/, \w+ \w+$/);
  });

  it('keeps each tilt small and stable', () => {
    for (const a of content.achievements) {
      expect(Math.abs(tiltOf(a.id))).toBeLessThanOrEqual(6);
      expect(tiltOf(a.id)).toBe(tiltOf(a.id));
    }
  });

  it('splits the chapters over two pages of about the same size', () => {
    const v = bookView(achievementList(newGame(), content), content);
    const [left, right] = spread(v.chapters);
    expect([...left, ...right].map((c) => c.id)).toEqual(v.chapters.map((c) => c.id));
    const n = (list: typeof left) => list.reduce((a, c) => a + c.stickers.length, 0);
    expect(Math.abs(n(left) - n(right))).toBeLessThanOrEqual(
      Math.max(...v.chapters.map((c) => c.stickers.length)),
    );
  });

  it('names the achievement and its reward in the unlock toast', () => {
    const reward = content.achievements.find((a) => a.id === 'first_kill')!.reward.resources![0]!;
    expect(unlockToast(content, 'first_kill')).toEqual({
      title: 'Achievement: First Kill',
      detail: `Reward: ${reward.amount.toString()} Summon Crystal`,
    });
    expect(unlockToast(content, 'nope')).toBeNull();
  });
});

describe('shard shop', () => {
  it('groups offers and prices them in shards', () => {
    const s = newGame();
    s.cards.shards = 12;
    const views = shardOfferViews(shardShop(s, content), s, content);
    expect(views.length).toBe(content.shardShop.length);
    const squire = views.find((v) => v.id === 'copy_ember_squire')!;
    expect(squire.group).toBe('cards');
    expect(squire.detail).toBe('Common card');
    expect(squire.buy.price).toBe('5 shards');
    expect(squire.buy.preview).toBe('+1 copy of Ember Squire');
    expect(squire.buy.offer.affordable).toBe(true);
    expect(squire.stockText).toBe('');
    const crown = views.find((v) => v.id === 'ember_crown')!;
    expect(crown.group).toBe('exclusive');
    expect(crown.stockText).toBe('1 left');
    expect(crown.buy.offer.affordable).toBe(false);
    expect(crown.buy.offer.progress).toBeCloseTo(12 / 150);
    expect(views.some((v) => v.group === 'supplies')).toBe(true);
  });

  it('marks a bought-out item sold out', () => {
    const s = newGame();
    s.cards.shards = 500;
    const r = buyShardItem(s, content, 'ember_crown');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const crown = shardOfferViews(shardShop(r.state, content), r.state, content).find(
      (v) => v.id === 'ember_crown',
    )!;
    expect(crown.soldOut).toBe(true);
    expect(crown.stockText).toBe('Sold out');
    expect(crown.buy.available).toBe(false);
    expect(crown.buy.label).toBe('Sold out');
  });

  it('reveals cards and cosmetics, and toasts bundles', () => {
    const card = shardGainView(content, 'copy_ember_squire', { kind: 'new' });
    expect(card?.kind).toBe('reveal');
    if (card?.kind === 'reveal') {
      expect(card.view.name).toBe('Ember Squire');
      expect(card.view.tags).toEqual(['New!']);
      expect(card.view.upgrade).toBe(false);
    }
    const bundle = content.shardShop.find((i) => i.reward.kind === 'resource')!;
    const gain = shardGainView(content, bundle.id, null);
    expect(gain?.kind).toBe('toast');
    if (gain?.kind === 'toast') expect(gain.detail).toMatch(/^\d[\d,.]* \w/);
  });
});
