import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  arenaLadder,
  arenaOpen,
  arenaRank,
  arenaShop,
  arenaTriesLeft,
  buyShopHeirloom,
  claimSeasonChest,
  collectModifiers,
  Decimal,
  createSaveText,
  currentRival,
  duelTeams,
  fightArena,
  newOwnedCard,
  otherRival,
  raidCoinsFor,
  raidShop,
  raidSeasonRank,
  rankForPlace,
  readSave,
  rivalRows,
  rivalTeam,
  seasonAt,
  seasonStartMs,
  shopPerkModifiers,
  syncSeason,
  tryArena,
  tryRaid,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

/** The arena, its seasons and the shops (DESIGN.md Arena and raids): the rules, not the tuning. */

const DAY = 86_400_000;
const S1 = seasonStartMs(content, 1);
const LEN = content.arena.season.days * DAY;
const TODAY = '2026-12-01';

function teamOf(ids: string[]): GameState {
  const state = freshState();
  state.prestigeCount = 1;
  for (const id of ids) {
    state.cards.owned[id] = {
      ...newOwnedCard(content.cardById.get(id)!.tier),
      level: 60,
      stars: 3,
      skillOpen: true,
    };
  }
  state.cards.loadouts.fighting = {
    slots: [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null],
  };
  return state;
}
const TEAM = ['gilded_knight', 'golden_tilter', 'golden_sharpshot', 'golden_sage'];

describe('the season clock', () => {
  it('seasons are 4 weeks and the first starts on the data date', () => {
    expect(content.arena.season.days).toBe(28);
    expect(seasonAt(content, S1 - 1)).toBe(0);
    expect(seasonAt(content, S1)).toBe(1);
    expect(seasonAt(content, S1 + LEN - 1)).toBe(1);
    expect(seasonAt(content, S1 + LEN)).toBe(2);
  });

  it('the first look starts the current season and a second at the same time changes nothing', () => {
    const a = syncSeason(freshState(), content, S1 + 3 * DAY);
    expect(a.arena.season).toBe(1);
    expect(syncSeason(a, content, S1 + 3 * DAY)).toBe(a);
  });

  it('a season ending makes one chest per mode played, once, and starts the figures again', () => {
    let s = syncSeason(freshState(), content, S1 + DAY);
    s.arena.points = 500;
    s.arena.wins = 3;
    s.arena.raidBest = { tide_queen: 0.6 };
    s.arena.coins = 7;
    s = syncSeason(s, content, S1 + LEN + 1000);
    expect(s.arena.season).toBe(2);
    expect(s.arena.chests.map((c) => `${c.mode}:${c.season}`)).toEqual(['arena:1', 'raid:1']);
    expect(s.arena).toMatchObject({ points: 0, wins: 0, raidBest: {}, coins: 7, paidThrough: 1 });
    expect(syncSeason(s, content, S1 + LEN + 2000).arena.chests).toHaveLength(2);
  });

  it('a player who never fought gets no chest', () => {
    let s = syncSeason(freshState(), content, S1 + DAY);
    s = syncSeason(s, content, S1 + LEN + 1);
    expect(s.arena.chests).toEqual([]);
  });

  it('a clock jumped far ahead pays only the season the player was in, once', () => {
    let s = syncSeason(freshState(), content, S1 + DAY);
    s.arena.wins = 1;
    s.arena.points = 100;
    s = syncSeason(s, content, S1 + 10 * LEN);
    expect(s.arena.season).toBe(11);
    expect(s.arena.chests).toHaveLength(1);
    // set back again: a small step back keeps the season, a big one starts the check again with no pay
    expect(syncSeason(s, content, S1 + 10 * LEN - DAY / 24).arena.season).toBe(11);
    const back = syncSeason(s, content, S1 + 3 * LEN);
    expect(back.arena.season).toBe(4);
    expect(back.arena.chests).toHaveLength(1);
    back.arena.wins = 1;
    const again = syncSeason(back, content, S1 + 4 * LEN + 5);
    expect(again.arena.season).toBe(5);
    expect(again.arena.paidThrough).toBe(10); // season 4 was already behind the ones seen
    expect(again.arena.chests).toHaveLength(1);
  });

  it('claiming a chest pays its resources and coins and keeps a frame for the top ranks', () => {
    const top = content.arena.ranks.find((r) => r.id === 'top10')!;
    let s = freshState();
    s.arena.chests = [
      { mode: 'arena', season: 1, rank: 'top10', place: 7 },
      { mode: 'raid', season: 1, rank: 'contender', place: 150 },
    ];
    const before = s.resources['summon_scroll']!;
    const a = claimSeasonChest(s, content)!;
    s = a.state;
    expect(s.arena.coins).toBe(top.chest.arenaCoins);
    expect(s.resources['summon_scroll']!.sub(before).toNumber()).toBe(
      Number(top.chest.rewards.find((r) => r.resource === 'summon_scroll')!.amount),
    );
    expect(s.arena.frames).toEqual([{ mode: 'arena', season: 1, rank: 'top10', place: 7 }]);
    const b = claimSeasonChest(s, content)!;
    expect(b.state.arena.frames).toHaveLength(1); // Contender has no frame
    expect(b.state.arena.raidCoins['tide_queen']).toBe(content.arena.ranks[0]!.chest.raidCoins);
    expect(claimSeasonChest(b.state, content)).toBeNull();
  });
});

describe('the ladder and the ranks', () => {
  it('has five ranks that are the chest bands', () => {
    expect(content.arena.ranks.map((r) => r.id)).toEqual([
      'contender',
      'top100',
      'top50',
      'top10',
      'champion',
    ]);
    expect(rankForPlace(content, 500).id).toBe('contender');
    expect(rankForPlace(content, 100).id).toBe('top100');
    expect(rankForPlace(content, 51).id).toBe('top100');
    expect(rankForPlace(content, 50).id).toBe('top50');
    expect(rankForPlace(content, 10).id).toBe('top10');
    expect(rankForPlace(content, 1).id).toBe('champion');
  });

  it('is the same every time, sorted, and the player takes the place their points earn', () => {
    const now = S1 + 10 * DAY;
    const a = arenaLadder(content, 1, now, 1234);
    expect(arenaLadder(content, 1, now, 1234)).toEqual(a);
    for (let i = 1; i < a.length; i++) expect(a[i]!.points).toBeLessThanOrEqual(a[i - 1]!.points);
    expect(a.map((r) => r.rank)).toEqual(a.map((_, i) => i + 1));
    expect(a.filter((r) => r.you)).toHaveLength(1);
    const more = arenaLadder(content, 1, now, 99999).find((r) => r.you)!;
    expect(more.rank).toBe(1);
  });

  it('the AI rows climb during the season, and a new season draws other names', () => {
    const early = arenaLadder(content, 1, S1, 0)[0]!.points;
    const late = arenaLadder(content, 1, S1 + LEN - 1, 0)[0]!.points;
    expect(late).toBeGreaterThan(early);
    expect(arenaLadder(content, 2, S1 + LEN, 0).map((r) => r.name)).not.toEqual(
      arenaLadder(content, 1, S1, 0).map((r) => r.name),
    );
  });

  it('every row plays an archetype of its rank band', () => {
    for (const row of arenaLadder(content, 1, S1 + DAY, null)) {
      expect(row.band!.archetypes).toContain(row.archetype!.id);
    }
  });
});

describe('the fight', () => {
  const state = (): GameState => syncSeason(teamOf(TEAM), content, S1 + 2 * DAY);
  const now = S1 + 2 * DAY;

  it('is open from the Ascension milestone', () => {
    expect(arenaOpen(freshState(), content)).toBe(false);
    expect(arenaOpen(state(), content)).toBe(true);
  });

  it('gives one result for one pair of teams, with the sides swapped it is the mirror', () => {
    const s = state();
    const row = currentRival(s, content, now)!;
    const a = fightArena(s, content, row)!;
    expect(fightArena(s, content, row)).toEqual(a);
    const r = rivalTeam(content, row.archetype!, row.band!);
    const mirror = duelTeams(content, r, r);
    expect(mirror.won).toBe(false); // equal teams: a tie goes to the rival
    expect(mirror.seconds).toBeGreaterThan(5);
    expect(mirror.seconds).toBeLessThanOrEqual(content.arena.fights.maxSeconds);
  });

  it('the stronger team wins', () => {
    const row = currentRival(state(), content, now)!;
    const weak = rivalTeam(content, row.archetype!, { ...row.band!, damage: 0.05, health: 0.05 });
    const strong = rivalTeam(content, row.archetype!, { ...row.band!, damage: 20, health: 20 });
    expect(duelTeams(content, strong, weak).won).toBe(true);
    expect(duelTeams(content, weak, strong).won).toBe(false);
  });

  it('a try spends a fight, pays points and coins, and offers a new rival', () => {
    const s = state();
    const rolls = s.arena.rolls;
    const r = tryArena(s, content, now, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { result, state: next } = r;
    expect(next.arena.used).toBe(1);
    expect(next.arena.rolls).toBe(rolls + 1);
    expect(next.arena.wins + next.arena.losses).toBe(1);
    expect(next.arena.coins).toBe(result.coins);
    expect(next.arena.points).toBe(Math.max(0, result.pointsDelta));
    expect(arenaTriesLeft(next, content, TODAY)).toBe(content.arena.fights.perDay - 1);
    expect(arenaTriesLeft(next, content, '2026-12-02')).toBe(content.arena.fights.perDay);
    expect(s.arena.used).toBe(0); // the state it was given is unchanged
  });

  it('refuses with no team, no fights left, or before the milestone', () => {
    const empty = syncSeason(freshState(), content, now);
    empty.prestigeCount = 1;
    empty.cards.loadouts.fighting = { slots: [null, null, null, null] };
    expect(tryArena(empty, content, now, TODAY)).toEqual({ ok: false, reason: 'no-team' });
    expect(tryArena(syncSeason(freshState(), content, now), content, now, TODAY)).toEqual({
      ok: false,
      reason: 'locked',
    });
    const s = state();
    s.arena.day = TODAY;
    s.arena.used = content.arena.fights.perDay;
    expect(tryArena(s, content, now, TODAY)).toEqual({ ok: false, reason: 'no-tries' });
  });

  it('rivals are the rows near the player, and Other rival draws another', () => {
    const s = state();
    const rows = rivalRows(s, content, now);
    const me = arenaRank(s, content, now);
    for (const r of rows) {
      expect(Math.abs(r.rank - me)).toBeLessThanOrEqual(content.arena.ladder.rivalsAbove);
    }
    const seen = new Set<number>();
    let cur = s;
    for (let i = 0; i < 12; i++) {
      seen.add(currentRival(cur, content, now)!.index);
      cur = otherRival(cur);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('the shops', () => {
  it('shows the last two seasons, four Heirlooms, and the oldest two leave', () => {
    const s1 = syncSeason(freshState(), content, S1 + DAY);
    expect(arenaShop(s1, content).map((e) => e.card.id)).toEqual([
      'victors_longbow',
      'pit_piercer',
    ]);
    const s2 = syncSeason(freshState(), content, S1 + LEN + DAY);
    expect(arenaShop(s2, content)).toHaveLength(4);
    const s3 = syncSeason(freshState(), content, S1 + 2 * LEN + DAY);
    expect(arenaShop(s3, content).map((e) => e.season)).toEqual([2, 2]);
  });

  it('a purchase takes arena coins once and gives the card; too poor and sold are refused', () => {
    let s = syncSeason(freshState(), content, S1 + DAY);
    const id = 'victors_longbow';
    expect(buyShopHeirloom(s, content, id)).toEqual({ ok: false, reason: 'too-poor' });
    expect(buyShopHeirloom(s, content, 'laurel_staff')).toEqual({
      ok: false,
      reason: 'not-on-sale',
    });
    const price = content.arena.shop.seasons[0]!.items[0]!.price;
    s.arena.coins = price + 5;
    const r = buyShopHeirloom(s, content, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.arena.coins).toBe(5);
    expect(s.cards.owned[id]).toBeDefined();
    s.arena.coins = 99999;
    expect(buyShopHeirloom(s, content, id)).toEqual({ ok: false, reason: 'owned' });
  });

  it('each raid boss sells its four with its own coin only', () => {
    let s = freshState();
    for (const boss of content.raids.bosses) expect(raidShop(s, content, boss.id)).toHaveLength(4);
    const card = content.arena.raid.shops['ember_tyrant']!.items[1]!;
    s.arena.raidCoins = { rootstone_titan: 99999 };
    expect(buyShopHeirloom(s, content, card.card)).toEqual({ ok: false, reason: 'too-poor' });
    s.arena.raidCoins = { ember_tyrant: card.price };
    const r = buyShopHeirloom(s, content, card.card);
    expect(r.ok).toBe(true);
    if (r.ok) s = r.state;
    expect(s.arena.raidCoins['ember_tyrant']).toBe(0);
  });

  it('every shop Heirloom is in the shop of its element, and not in the Heirloom Gate', () => {
    for (const boss of content.raids.bosses)
      for (const item of content.arena.raid.shops[boss.id]!.items)
        expect(content.cardById.get(item.card)!.element).toBe(boss.element);
    const gate = content.cards.filter((c) => c.heirloom && !c.shop);
    expect(gate).toHaveLength(34);
  });
});

describe('perks', () => {
  it('count only in the arena (or against raid bosses), and elsewhere the card is a normal Heirloom', () => {
    const s = teamOf(['victors_longbow']);
    const mods = shopPerkModifiers(s, content);
    expect(mods.length).toBeGreaterThan(0);
    expect(mods.every((m) => m.scope?.dungeon === 'arena' && m.source.kind === 'shop')).toBe(true);
    expect(collectModifiers(s, content).filter((m) => m.source.kind === 'shop')).toEqual(mods);
    const raid = teamOf(['stonehewer']);
    expect(
      shopPerkModifiers(raid, content)
        .map((m) => m.scope?.dungeon)
        .sort(),
    ).toEqual([...content.raids.bosses.map((b) => b.id)].sort());
  });

  it('a perk that names a tag counts only against a rival that carries it', () => {
    const item = content.arena.shop.seasons
      .flatMap((x) => x.items)
      .find((i) => i.perk?.vs !== undefined);
    expect(item).toBeDefined();
    const s = teamOf([item!.card]);
    const vs = item!.perk!.vs!;
    expect(shopPerkModifiers(s, content)).toEqual([]);
    expect(shopPerkModifiers(s, content, [], 'vs')).toEqual([]);
    expect(shopPerkModifiers(s, content, [vs], 'vs').length).toBeGreaterThan(0);
  });
});

describe('raid coins and the raid season', () => {
  it('a try pays coins of its boss and keeps the season best', () => {
    let s = teamOf(['prism_paladin', 'gilded_knight', 'mirror_cavalier', 'rainbow_sniper']);
    s = syncSeason(s, content, S1 + DAY);
    const mods = collectModifiers(s, content);
    const soft = {
      ...content,
      raidById: new Map([
        ['tide_queen', { ...content.raidById.get('tide_queen')!, hp: new Decimal(1e5) }],
      ]),
    };
    const r = tryRaid(s, soft, mods, 'tide_queen', TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.coins).toBe(raidCoinsFor(soft, r.result.fight.share, r.result.fight.killed));
    expect(r.state.arena.raidCoins['tide_queen']).toBe(r.result.coins);
    expect(r.state.arena.raidBest['tide_queen']).toBeCloseTo(r.result.fight.share, 9);
    expect(raidSeasonRank(r.state, soft, S1 + DAY)).toBeGreaterThan(0);
    expect(raidSeasonRank(s, content, S1 + DAY)).toBeNull();
  });

  it('a kill pays more than the same share without one', () => {
    expect(raidCoinsFor(content, 1, true)).toBeGreaterThan(raidCoinsFor(content, 1, false));
    expect(raidCoinsFor(content, 0, false)).toBe(0);
  });
});

describe('saving', () => {
  it('the arena is saved and loaded, and the format is 48', () => {
    expect(CURRENT_SAVE_VERSION).toBe(48);
    const s = syncSeason(teamOf(TEAM), content, S1 + DAY);
    s.arena.coins = 42;
    s.arena.raidCoins = { tide_queen: 9 };
    s.arena.bought = ['laurel_staff'];
    s.arena.chests = [{ mode: 'arena', season: 1, rank: 'top50', place: 33 }];
    s.arena.frames = [{ mode: 'raid', season: 1, rank: 'top10', place: 4 }];
    const back = readSave(createSaveText(s, 5), content).state;
    expect(back.arena).toEqual(s.arena);
  });
});
