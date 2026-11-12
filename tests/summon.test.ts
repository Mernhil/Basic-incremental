import { describe, expect, it } from 'vitest';
import {
  Decimal,
  FOCUS_PORTAL_ID,
  advance,
  claimDaily,
  fieldCacheScrolls,
  dailyAvailable,
  focusKinds,
  floorFirstWinScrolls,
  localDay,
  payFloorFirstWin,
  portalInfo,
  pull,
  revealPlan,
  setFocusKind,
  type GameState,
  type Modifier,
} from '../src/game';
import { loadContent } from '../src/data';
import { constantRng, content, freshState } from './helpers';

/** The shipped floors (the test content pins every dungeon to one floor). */
const real = loadContent();

/** Scrolls and the Focus Portal (DESIGN.md §3 Crystal wage / scrolls, §7 Focus Portal, Reveal). */
const rich = (n: number, kind: string | null = 'sword'): GameState => {
  const s = freshState();
  s.resources['summon_scroll'] = new Decimal(n);
  s.summon.focusKind = kind;
  return s;
};

describe('Focus Portal', () => {
  it('lists the 11 item types', () => {
    expect(focusKinds(content).map((k) => k.kind)).toEqual(content.items.types.map((t) => t.kind));
    expect(focusKinds(content)).toHaveLength(11);
  });

  it('chooses and clears its item type, and refuses an unknown one', () => {
    const picked = setFocusKind(freshState(), content, 'dagger');
    expect(picked.ok && picked.state.summon.focusKind).toBe('dagger');
    const cleared = setFocusKind(rich(1), content, null);
    expect(cleared.ok && cleared.state.summon.focusKind).toBeNull();
    expect(setFocusKind(freshState(), content, 'banana')).toEqual({ ok: false });
  });

  it('costs what the Card Portal costs, one scroll a pull, and gives only that type', () => {
    const info = portalInfo(rich(10), content, FOCUS_PORTAL_ID)!;
    expect(info.single.price).toEqual({ resource: 'summon_scroll', amount: new Decimal(1) });
    expect(info.ten.price.amount.toNumber()).toBe(10);
    const out = pull(rich(10), content, FOCUS_PORTAL_ID, 10, constantRng(0.4));
    if (!out.ok) throw new Error(out.reason);
    expect(out.results).toHaveLength(10);
    for (const r of out.results) {
      expect(content.cardById.get(r.itemId)!.item.kind).toBe('sword');
    }
    expect(out.state.resources['summon_scroll']!.toNumber()).toBe(0);
  });

  it('keeps the Card Portal rarity rates', () => {
    const focus = portalInfo(rich(1), content, FOCUS_PORTAL_ID)!;
    const card = portalInfo(rich(1), content, 'card_portal')!;
    expect(focus.rates.byRarity.length).toBe(card.rates.byRarity.length);
    for (const [i, r] of focus.rates.byRarity.entries()) {
      expect(r.rarity).toBe(card.rates.byRarity[i]!.rarity);
      expect(r.chance).toBeCloseTo(card.rates.byRarity[i]!.chance, 9);
    }
  });

  it('shares the Card Portal pity counter', () => {
    const s = rich(10);
    s.portals['card_portal'] = { pity: 20, pulls: 20, pityHits: 0 };
    const out = pull(s, content, FOCUS_PORTAL_ID, 1, constantRng(0.01));
    if (!out.ok) throw new Error(out.reason);
    expect(out.state.portals['card_portal']!.pulls).toBe(21);
    expect(out.state.portals[FOCUS_PORTAL_ID]).toBeUndefined();
    expect(portalInfo(s, content, FOCUS_PORTAL_ID)!.pity.count).toBe(20);
  });

  it('gives Legendary or better at the hard pity', () => {
    const s = rich(20);
    const threshold = portalInfo(s, content, FOCUS_PORTAL_ID)!.pity.threshold;
    s.portals['card_portal'] = { pity: threshold - 1, pulls: 0, pityHits: 0 };
    const out = pull(s, content, FOCUS_PORTAL_ID, 1, constantRng(0.01));
    if (!out.ok) throw new Error(out.reason);
    expect(out.results[0]!.pity).toBe(true);
    expect(['legendary', 'mythic', 'void']).toContain(out.results[0]!.rarity);
  });

  it('refuses a pull with no type chosen, or without a scroll', () => {
    expect(pull(rich(5, null), content, FOCUS_PORTAL_ID, 1, constantRng(0.5))).toEqual({
      ok: false,
      reason: 'no-focus',
    });
    expect(pull(rich(0), content, FOCUS_PORTAL_ID, 1, constantRng(0.5))).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
  });

  it('honours the wishlist inside its type', () => {
    const s = rich(10);
    const marked = content.cards.find((c) => c.item.kind === 'sword' && c.rarity === 'common')!;
    s.cards.wishlist = [marked.id];
    const out = pull(s, content, FOCUS_PORTAL_ID, 1, constantRng(0));
    if (!out.ok) throw new Error(out.reason);
    expect(out.results[0]!.itemId).toBe(marked.id);
  });
});

describe('scroll sources', () => {
  it('pays a lump the first time a floor is won, by floor kind and difficulty', () => {
    const cfg = real.scrolls.floorFirstWin;
    const dungeon = real.dungeonById.get('mossy_cellar')!;
    const wave = floorFirstWinScrolls(real, dungeon.id, 'normal', 1);
    expect(wave.map((l) => l.resource)).toEqual(['summon_scroll', 'glamour_scroll']);
    expect(wave[0]!.amount.toNumber()).toBeCloseTo(cfg.wave.summon.toNumber());
    expect(floorFirstWinScrolls(real, dungeon.id, 'normal', 10)[0]!.amount.toNumber()).toBeCloseTo(
      cfg.boss.summon.toNumber(),
    );
    const hard = floorFirstWinScrolls(real, dungeon.id, 'hard', 1);
    expect(hard[0]!.amount.toNumber()).toBeCloseTo(
      wave[0]!.amount.toNumber() * cfg.difficulty.hard,
    );
  });

  it('is multiplied by the crystal-drop stat and added to the scroll balance', () => {
    const s = freshState();
    const before = s.resources['summon_scroll']!;
    const mods: Modifier[] = [
      {
        stat: 'drops.crystalMultiplier',
        kind: 'percent',
        value: new Decimal(100),
        source: { kind: 'upgrade', id: 'crystal_lure' },
      },
    ];
    const lumps = payFloorFirstWin(s, real, 'mossy_cellar', 'normal', 1, mods);
    const base = real.scrolls.floorFirstWin.wave.summon.toNumber();
    expect(lumps[0]!.amount.toNumber()).toBeCloseTo(base * 2);
    expect(s.resources['summon_scroll']!.sub(before).toNumber()).toBeCloseTo(base * 2);
  });

  it('claims the daily reward once a local day', () => {
    const s = freshState();
    const today = localDay(new Date(2026, 10, 11));
    expect(today).toBe('2026-11-11');
    expect(dailyAvailable(s, today)).toBe(true);
    const got = claimDaily(s, content, today);
    if (!got.ok) throw new Error('not claimed');
    expect(got.state.summon.dailyClaimedDay).toBe(today);
    expect(got.state.resources['summon_scroll']!.toNumber()).toBe(
      1 + content.scrolls.daily.summon.toNumber(),
    );
    expect(s.summon.dailyClaimedDay).toBeNull();
    expect(dailyAvailable(got.state, today)).toBe(false);
    expect(claimDaily(got.state, content, today)).toEqual({ ok: false });
    expect(claimDaily(got.state, content, '2026-11-12').ok).toBe(true);
  });
});

describe('reveal show plan', () => {
  const cfg = content.scrolls.reveal;
  it('glows the rare ones and flips the best card last with the entrance', () => {
    const plan = revealPlan(
      [
        'common',
        'rare',
        'uncommon',
        'legendary',
        'epic',
        'common',
        'common',
        'common',
        'common',
        'rare',
      ],
      cfg,
    );
    expect(plan.glow).toEqual([
      null,
      'rare',
      null,
      'legendary',
      'epic',
      null,
      null,
      null,
      null,
      'rare',
    ]);
    expect(plan.best).toBe(3);
    expect(plan.order).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 9, 3]);
  });

  it('gives no entrance to a single pull or a hand with nothing rare', () => {
    expect(revealPlan(['legendary'], cfg).best).toBeNull();
    const plain = revealPlan(['common', 'uncommon', 'common'], cfg);
    expect(plain.best).toBeNull();
    expect(plain.order).toEqual([0, 1, 2]);
  });

  it('picks the first of equal best cards', () => {
    expect(revealPlan(['epic', 'common', 'epic'], cfg).best).toBe(0);
  });
});

describe('the field cache (DESIGN.md §3 Scrolls)', () => {
  const cache = real.scrolls.fieldCache;
  const periodMs = cache.everyMinutes * 60_000;
  const fighting = (difficulty: 'normal' | 'hard' = 'normal'): GameState => {
    const state = freshState();
    state.activeDungeonId = 'mossy_cellar';
    state.combat.floors['mossy_cellar'] = {
      difficulty,
      autoChallenge: false,
      tiers: { normal: { floor: 1, best: 1 }, hard: { floor: 1, best: 0 } },
    };
    return state;
  };
  const summonOf = (lumps: { resource: string; amount: Decimal }[]): number =>
    lumps.find((l) => l.resource === 'summon_scroll')?.amount.toNumber() ?? 0;

  it('pays one lump per whole period of play time, however the time is split', () => {
    const state = fighting();
    expect(summonOf(fieldCacheScrolls(state, real, 0, periodMs - 1))).toBe(0);
    expect(summonOf(fieldCacheScrolls(state, real, 0, periodMs))).toBe(cache.summon.toNumber());
    const whole = summonOf(fieldCacheScrolls(state, real, 0, 3.5 * periodMs));
    let split = 0;
    for (let t = 0; t < 3.5 * periodMs; t += 7_000) {
      split += summonOf(fieldCacheScrolls(state, real, t, Math.min(t + 7_000, 3.5 * periodMs)));
    }
    expect(whole).toBe(3 * cache.summon.toNumber());
    expect(split).toBeCloseTo(whole);
  });

  it('pays more on a harder tier and nothing with no dungeon fought', () => {
    const normal = summonOf(fieldCacheScrolls(fighting('normal'), real, 0, periodMs));
    const hard = summonOf(fieldCacheScrolls(fighting('hard'), real, 0, periodMs));
    expect(hard).toBeGreaterThan(normal);
    const idle = fighting();
    idle.activeDungeonId = null;
    expect(fieldCacheScrolls(idle, real, 0, 10 * periodMs)).toEqual([]);
  });

  it('is paid by the game step', () => {
    const state = fighting();
    const before = state.resources['summon_scroll'] ?? new Decimal(0);
    const after = advance(state, real, periodMs, constantRng(0.5)).state;
    expect(after.resources['summon_scroll']!.sub(before).toNumber()).toBeGreaterThanOrEqual(
      cache.summon.toNumber(),
    );
  });
});
