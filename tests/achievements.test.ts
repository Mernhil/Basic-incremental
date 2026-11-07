import { describe, expect, it } from 'vitest';
import {
  achievementList,
  advance,
  buyShardItem,
  checkAchievements,
  createSaveText,
  CURRENT_SAVE_VERSION,
  Decimal,
  MIGRATIONS,
  readSave,
  shardShop,
  simulateOffline,
  type GameState,
} from '../src/game';
import { constantRng, content, newGame } from './helpers';

const BETA_25 = [
  'first_harvest',
  'first_kill',
  'lumberjack_1',
  'lumberjack_2',
  'prospector_1',
  'prospector_2',
  'tree_hugger',
  'deep_delver',
  'giant_slayer_1',
  'giant_slayer_2',
  'giant_slayer_3',
  'glimmer_seeker',
  'first_summon',
  'ten_pulls',
  'pity_breaker',
  'silver_lining',
  'golden_hour',
  'six_stars',
  'prismatic_dawn',
  'full_loadout',
  'dressed_up',
  'fashionista',
  'skilled',
  'first_ascension',
  'night_owl',
];
const unlockedBy = (state: GameState): string[] => checkAchievements(state, content).unlocked;

describe('achievements (DESIGN.md 11.6)', () => {
  it('has the 25 beta achievements plus mastery and milestone ones', () => {
    const ids = content.achievements.map((a) => a.id);
    for (const id of BETA_25) expect(ids, id).toContain(id);
    expect(ids).toEqual(expect.arrayContaining(['first_milestone', 'gem_adept', 'medalist']));
  });

  it('a new game has none', () => {
    expect(unlockedBy(newGame())).toEqual([]);
  });

  it('unlocks once, records when, and grants its reward', () => {
    const state = newGame();
    state.stats.bossKills = 1;
    state.stats.playTimeMs = 5000;
    const first = checkAchievements(state, content);
    expect(first.unlocked).toEqual(['first_kill']);
    expect(first.state.achievements['first_kill']).toBe(5000);
    const reward = content.achievements.find((a) => a.id === 'first_kill')!.reward.resources[0]!;
    expect(first.state.resources[reward.resource]!.eq(reward.amount)).toBe(true);
    expect(checkAchievements(first.state, content).unlocked).toEqual([]);
  });

  it('grants cosmetic rewards (a copy when already owned)', () => {
    const state = newGame();
    state.clearedDungeons = ['mossy_cellar'];
    const after = checkAchievements(state, content).state;
    expect(after.cosmetics.owned['holo_hex']).toEqual({ level: 1, copies: 0 });
  });

  it('detects harvests by job, kills, unlocks, clears and pulls', () => {
    const state = newGame();
    state.mastery.harvested = { oak_gem: new Decimal(2e4), copper_gem: new Decimal(10) };
    state.production.unlockedTrees = ['ironbark', 'moonwillow'];
    state.portals['card_portal'] = { pity: 0, pulls: 12, pityHits: 1 };
    const got = unlockedBy(state);
    expect(got).toEqual(
      expect.arrayContaining([
        'first_harvest',
        'lumberjack_1',
        'tree_hugger',
        'first_summon',
        'ten_pulls',
        'pity_breaker',
      ]),
    );
    expect(got).not.toContain('prospector_1');
    expect(got).not.toContain('deep_delver');
  });

  it('detects card ranks, loadouts, sets, cosmetics owned, ascensions and mastery', () => {
    const state = newGame();
    const squire = state.cards.owned['ember_squire']!;
    state.cards.owned['ember_squire'] = { ...squire, tier: 'gold', stars: 6 };
    state.cards.owned['shield_warden'] = { ...squire };
    state.cards.loadouts.fighting = {
      main: 'ember_squire',
      supports: ['shield_warden', 'storm_duelist', 'dawnblade_regent'],
    };
    for (const c of content.cosmetics.filter((x) => x.set === 'gilded_tradition')) {
      state.cosmetics.owned[c.id] = { level: 1, copies: 0 };
      state.cosmetics.loadout.slots[c.slot] = { id: c.id, level: 1 };
    }
    state.prestigeCount = 1;
    state.mastery.gemTiers = { oak_gem: 3 };
    state.mastery.bossTiers = { mossy_cellar: 2 };
    state.production.mineLevels = { copper_quarry: 25 };
    const got = unlockedBy(state);
    expect(got).toEqual(
      expect.arrayContaining([
        'silver_lining',
        'golden_hour',
        'six_stars',
        'full_loadout',
        'dressed_up',
        'first_ascension',
        'gem_adept',
        'medalist',
        'first_milestone',
      ]),
    );
    expect(got).not.toContain('prismatic_dawn');
    // The 7 Gilded Tradition items plus the 3 UI-skin pieces that Dressed Up, Medalist and Gem Adept
    // grant make the 10 non-starter items Fashionista needs.
    expect(got).toContain('fashionista');
  });

  it('does not count the starter set as a full set', () => {
    expect(unlockedBy(newGame())).not.toContain('dressed_up');
  });

  it('gives progress for the sticker book', () => {
    const state = newGame();
    state.mastery.harvested = { oak_gem: new Decimal(5000) };
    const entry = achievementList(state, content).find((a) => a.achievement.id === 'lumberjack_1')!;
    expect(entry.unlocked).toBe(false);
    expect(entry.progress).toBeCloseTo(0.5, 9);
    expect(entry.value).toBe(5000);
    expect(entry.target).toBe(1e4);
  });

  it('reports unlocks in the tick report, on the whole-second grid', () => {
    const state = newGame();
    const { state: after, report } = advance(state, content, 2500, constantRng(0.5));
    expect(report.achievements).toContain('first_harvest');
    expect(after.achievements['first_harvest']).toBe(1000);
  });

  it('Night Owl comes from 8 h of offline progress at once', () => {
    const now = 100 * 3_600_000;
    const short = simulateOffline(newGame(), content, now - 3_600_000, now, constantRng(0.5));
    expect(short.summary!.achievements).not.toContain('night_owl');
    const long = simulateOffline(newGame(), content, now - 9 * 3_600_000, now, constantRng(0.5));
    expect(long.summary!.achievements).toContain('night_owl');
    expect(long.state.achievements['night_owl']).toBeDefined();
    expect(long.state.stats.longestOfflineMs).toBe(8 * 3_600_000);
  });
});

describe('shard shop (DESIGN.md 5, 17)', () => {
  const withShards = (n: number): GameState => {
    const state = newGame();
    state.cards.shards = n;
    return state;
  };

  it('lists the stock from data with prices and what is left', () => {
    const shop = shardShop(withShards(10), content);
    expect(shop.map((o) => o.item.id)).toEqual(content.shardShop.map((i) => i.id));
    const crown = shop.find((o) => o.item.id === 'ember_crown')!;
    expect(crown).toMatchObject({ price: 150, affordable: false, bought: 0, left: 1 });
    const copy = shop.find((o) => o.item.id === 'copy_ember_squire')!;
    expect(copy).toMatchObject({ affordable: true, left: null });
  });

  it('spends shards for a card copy, a resource bundle or a cosmetic', () => {
    const card = buyShardItem(withShards(100), content, 'copy_ember_squire');
    if (!card.ok) throw new Error(card.reason);
    expect(card.state.cards.shards).toBe(95);
    expect(card.state.cards.owned['ember_squire']!.duplicates).toBe(1);

    const bundle = buyShardItem(withShards(100), content, 'summon_crystals');
    if (!bundle.ok) throw new Error(bundle.reason);
    expect(bundle.state.resources['summon_crystal']!.toNumber()).toBe(100);

    const crown = buyShardItem(withShards(200), content, 'ember_crown');
    if (!crown.ok) throw new Error(crown.reason);
    expect(crown.state.cosmetics.owned['ember_crown']).toEqual({ level: 1, copies: 0 });
    expect(crown.state.shardShop['ember_crown']).toBe(1);
    expect(buyShardItem(crown.state, content, 'ember_crown')).toEqual({
      ok: false,
      reason: 'sold-out',
    });
  });

  it('refuses unknown items and what it cannot afford', () => {
    expect(buyShardItem(withShards(100), content, 'nope')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(buyShardItem(withShards(1), content, 'copy_core_titan')).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
  });
});

describe('saving (save format v12)', () => {
  it('round-trips unlocked achievements, the longest offline session and shop purchases', () => {
    const state = newGame();
    state.achievements = { first_kill: 1234, gone: 1 };
    state.stats.longestOfflineMs = 3600;
    state.shardShop = { ember_crown: 1 };
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.achievements).toEqual({ first_kill: 1234 });
    expect(loaded.stats.longestOfflineMs).toBe(3600);
    expect(loaded.shardShop).toEqual({ ember_crown: 1 });
  });

  it('migrates v11 -> v12 with nothing unlocked yet (detection catches up on load)', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(12);
    expect(MIGRATIONS[11]!({ stats: { playTimeMs: 5, bossKills: 2 } })).toEqual({
      stats: { playTimeMs: 5, bossKills: 2, longestOfflineMs: 0 },
      achievements: {},
      shardShop: {},
    });
  });
});
