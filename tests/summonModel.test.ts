import { describe, expect, it } from 'vitest';
import {
  cardInfo,
  cardNameById,
  Decimal,
  portalInfo,
  setWishlisted,
  wishlistView,
  type PullResult,
} from '../src/game';
import {
  CUTIN_MS,
  DECK_MAX_LAYERS,
  DOOR_ORDER,
  FLY_MS,
  HERO_MS,
  bestOfPull,
  doorAbout,
  doorKeyOf,
  doorPx,
  isCutinRarity,
  revealTimeline,
  spriteNameOf,
  DECK_MIN_LAYERS,
  HAND_MAX,
  deckLayers,
  handSummary,
  lastHandView,
  lockedHeirloomState,
  oddsTable,
  portalView,
  tierBoxes,
  revealSound,
  revealViews,
  wishlistPanelView,
} from '../src/renderer/src/pages/summonModel';
import { content, freshState } from './helpers';

const portal = content.portals[0]!;

describe('summon shelf', () => {
  it('shows prices, pity and rates of a portal', () => {
    const state = freshState();
    state.resources[portal.cost.resource] = portal.cost.ten;
    const v = portalView(portalInfo(state, content, portal.id)!, content);
    expect(v.name).toBe(portal.name);
    expect(v.single.affordable && v.ten.affordable).toBe(true);
    expect(v.ten.label).toBe('Pull 10');
    expect(v.ten.amount).toBe(portal.cost.ten.toNumber().toLocaleString('en-US'));
    expect(v.resourceId).toBe(portal.cost.resource);
    // the Card Portal's pity is a T6 with a rising chance, its level and first 10-pull show
    expect(v.line).toMatch(/^A T6 card within \d+ pulls/);
    expect(v.pityText).toMatch(/^0 \/ \d+$/);
    expect(v.pity).toMatch(/^A T6 card within \d+ pulls$/);
    expect(v.level).toMatchObject({ label: 'Portal level 1', progress: 0 });
    expect(v.firstTen).toBe('Your first ×10 holds a Gold or better');
    expect(v.levelNote).toMatch(/^Portal level 1 of \d+/);
    expect(v.pityProgress).toBe(0);
    expect(v.guarantee).toMatch(/^Every ×10 holds a /);
    // the Card Portal goes by tier (DESIGN.md §7)
    expect(v.rates[0]).toMatch(/^Wood: \d/);
  });

  it('lists a check box per tier, ticked once its reward is paid', () => {
    const state = freshState();
    const boxes = tierBoxes(state, content);
    expect(boxes.map((b) => b.name)).toEqual([
      'Wood',
      'Bronze',
      'Silver',
      'Gold',
      'Prismatic',
      'Mythic',
      'Void',
    ]);
    expect(boxes.every((b) => !b.checked)).toBe(true);
    expect(boxes[0]!.count).toBe('0 / 11');
    state.summon.tierRewardsClaimed.push('wood');
    expect(tierBoxes(state, content)[0]).toMatchObject({ checked: true });
    expect(tierBoxes(state, content)[0]!.reward).toMatch(/^\+5 scrolls · \+1% damage$/);
  });

  it('cannot pull without the portal resource', () => {
    const state = freshState();
    state.resources[portal.cost.resource] = new Decimal(0);
    const v = portalView(portalInfo(state, content, portal.id)!, content);
    expect(v.single.affordable).toBe(false);
  });
});

describe('summon reveal', () => {
  it('marks upgrade flashes and what each pull became', () => {
    const card = content.cards[0]!;
    const results: PullResult[] = [
      {
        itemId: card.id,
        rarity: 'rare',
        orb: 'common',
        pity: false,
        guaranteed: true,
        gain: { kind: 'new' },
      },
      {
        itemId: card.id,
        rarity: 'legendary',
        orb: 'legendary',
        pity: true,
        guaranteed: false,
        gain: { kind: 'duplicate', duplicates: 2 },
      },
    ];
    const [a, b] = revealViews(results, content);
    expect(a).toMatchObject({
      name: cardNameById(content, card.id),
      upgrade: true,
      tags: ['New!', '×10 guarantee'],
    });
    expect(b).toMatchObject({ upgrade: false, tags: ['Duplicate (2)', 'Pity'] });
  });

  it('plays a reveal sound per rarity', () => {
    expect(revealSound('common')).toBe('summonCommon');
    expect(revealSound('legendary')).toBe('summonLegendary');
    expect(revealSound('void')).toBe('summonMythic');
  });
});

describe('summon deck and hand', () => {
  it('thickens the deck with pity progress and clamps', () => {
    expect(deckLayers(0)).toBe(DECK_MIN_LAYERS);
    expect(deckLayers(1)).toBe(DECK_MAX_LAYERS);
    expect(deckLayers(2)).toBe(DECK_MAX_LAYERS);
    expect(deckLayers(-1)).toBe(DECK_MIN_LAYERS);
    expect(deckLayers(Number.NaN)).toBe(DECK_MIN_LAYERS);
    expect(deckLayers(0.5)).toBeGreaterThan(deckLayers(0.25));
  });

  it('uses the real pity and odds of a portal', () => {
    const state = freshState();
    const v = portalView(portalInfo(state, content, portal.id)!, content);
    expect(v.pityCount).toBe(0);
    expect(v.pityThreshold).toBeGreaterThan(0);
    expect(v.deckLayers).toBe(DECK_MIN_LAYERS);
    expect(v.odds.length).toBe(v.rates.length);
    expect(v.odds[0]).toMatchObject({ rarity: 'common' });
  });

  it('builds the odds table: a row per rarity, a column per portal, from the real rates', () => {
    const state = freshState();
    const views = content.portals.map((p) =>
      portalView(portalInfo(state, content, p.id)!, content),
    );
    const t = oddsTable(views);
    expect(t.columns.map((c) => c.id)).toEqual(content.portals.map((p) => p.id));
    expect(t.columns[0]!.name).toBe('Cards');
    expect(t.rows[0]).toMatchObject({ rarity: 'common' });
    expect(t.rows.every((r) => r.cells.length === views.length)).toBe(true);
    // a rarity one portal does not hold shows as null, never as a made-up number
    const missing = t.rows.find((r) => r.cells.includes(null));
    if (missing) {
      const at = missing.cells.indexOf(null);
      expect(views[at]!.odds.some((o) => o.rarity === missing.rarity)).toBe(false);
    }
    for (const [i, v] of views.entries()) {
      for (const o of v.odds) {
        expect(t.rows.find((r) => r.rarity === o.rarity)!.cells[i]).toBe(o.chance);
      }
    }
  });

  it('builds the last hand: new marks, notes, a cap of ten, no tilt', () => {
    const card = content.cards[0]!;
    const results: PullResult[] = Array.from({ length: 12 }, (_, i) => ({
      itemId: card.id,
      rarity: 'rare',
      orb: 'rare',
      pity: false,
      guaranteed: false,
      gain: i === 11 ? { kind: 'new' } : { kind: 'duplicate', duplicates: 1 },
    }));
    const hand = lastHandView(revealViews(results, content));
    expect(hand).toHaveLength(HAND_MAX);
    expect(hand[HAND_MAX - 1]).toMatchObject({ isNew: true });
    expect(hand[HAND_MAX - 1]!.label).toContain('New!');
    expect(hand[0]!.isNew).toBe(false);
    expect(hand[HAND_MAX - 1]!.note).toBe('New card');
    expect(hand[0]!.note).toBe('+1 copy');
    expect(lastHandView([])).toEqual([]);
  });

  it('sums the last hand in one line', () => {
    const card = content.cards[0]!;
    const results: PullResult[] = Array.from({ length: 10 }, (_, i) => ({
      itemId: card.id,
      rarity: 'rare',
      orb: 'rare',
      pity: false,
      guaranteed: false,
      gain: i < 2 ? { kind: 'new' } : { kind: 'duplicate', duplicates: 1 },
    }));
    expect(handSummary(revealViews(results, content))).toBe('10 pulls · 2 new · 8 copies');
    expect(handSummary(revealViews(results.slice(0, 1), content))).toBe(
      '1 pull · 1 new · 0 copies',
    );
    expect(handSummary([])).toBe('');
  });
});

describe('wishlist panel', () => {
  it('lists the cards by rarity with the marks, the room left and a "Hunting" line', () => {
    const state = freshState();
    const none = wishlistPanelView(wishlistView(state, content, portal.id)!, state, content);
    expect(none.active).toBe(false);
    expect(none.hunting).toBe('No card marked');
    const id = portal.pool.find((e) => e.rarity === 'epic')!.itemId;
    const r = setWishlisted(state, content, id, true);
    if (!r.ok) throw new Error(r.reason);
    const v = wishlistPanelView(wishlistView(r.state, content, portal.id)!, r.state, content);
    expect(v.active).toBe(true);
    expect(v.hunting).toBe(`Hunting: ${cardNameById(content, id)}`);
    const epic = v.rows.find((x) => x.rarity === 'epic')!;
    expect(epic.countText).toBe(`1 / ${portal.wishlistPerTier}`);
    expect(epic.cards.find((c) => c.id === id)!.label).toContain('Click to unmark');
    expect(epic.cards.every((c) => c.marked || !c.blocked)).toBe(true);
  });

  it('blocks the unmarked cards of a full rarity', () => {
    let s = freshState();
    const ids = portal.pool.filter((e) => e.rarity === 'rare').map((e) => e.itemId);
    for (const id of ids.slice(0, portal.wishlistPerTier)) {
      const r = setWishlisted(s, content, id, true);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    const v = wishlistPanelView(wishlistView(s, content, portal.id)!, s, content);
    const rare = v.rows.find((x) => x.rarity === 'rare')!;
    expect(rare.full).toBe(true);
    expect(rare.cards.filter((c) => c.blocked)).toHaveLength(ids.length - portal.wishlistPerTier);
  });
});

describe('the three doors page', () => {
  it('has the Card Portal, the Focus Portal and the Heirloom Gate left to right', () => {
    expect(DOOR_ORDER).toEqual(['card_portal', 'focus_portal', 'heirloom_gate']);
  });

  it('opens the Card Portal door for gates without door art', () => {
    expect(doorKeyOf('card_portal')).toBe('card_portal');
    expect(doorKeyOf('focus_portal')).toBe('focus_portal');
    expect(doorKeyOf('heirloom_gate')).toBe('heirloom_gate');
    expect(doorKeyOf('wardrobe_gate')).toBe('card_portal');
    expect(doorKeyOf('legacy_gate')).toBe('card_portal');
  });

  it('says what each door pulls, the Focus Portal with its chosen type', () => {
    expect(doorAbout('card_portal', null)).toMatch(/Heirloom/);
    expect(doorAbout('focus_portal', 'Sword')).toMatch(/Sword/);
    expect(doorAbout('focus_portal', null)).toMatch(/Choose/);
    expect(doorAbout('heirloom_gate', null)).toMatch(/shards/i);
  });

  it('shows a door at a whole number of device pixels per art pixel', () => {
    expect(doorPx(320, 1)).toBe(320);
    expect(doorPx(320, 2)).toBe(320);
    expect(doorPx(160, 1)).toBe(160);
    expect(doorPx(50, 1)).toBe(160);
    // 125 % screen: 320 CSS px is 2.5 art pixels, so the nearest whole scale is 3 (480 device px)
    expect(doorPx(320, 1.25)).toBe(384);
    expect(Number.isInteger(doorPx(300, 1.5) * 1.5)).toBe(true);
  });

  it('reads a weapon sprite name from its art markup', () => {
    expect(spriteNameOf('<image data-sprite="item-sword-t1"/>')).toBe('item-sword-t1');
    expect(spriteNameOf('<g/>')).toBeNull();
  });
});

describe('the new reveal', () => {
  it('knows the best tier of a pull before any card moves', () => {
    expect(bestOfPull([])).toBeNull();
    expect(bestOfPull(['common', 'rare', 'common'])).toEqual({
      index: 1,
      rarity: 'rare',
      cutin: false,
    });
    // the first of equal best cards wins
    expect(bestOfPull(['epic', 'epic'])?.index).toBe(0);
    expect(bestOfPull(['common', 'mythic', 'legendary'])).toEqual({
      index: 1,
      rarity: 'mythic',
      cutin: true,
    });
    expect(bestOfPull(['void'])?.cutin).toBe(true);
  });

  it('gives the cut-in to a T6 or a whole Heirloom only', () => {
    expect(isCutinRarity('mythic')).toBe(true);
    expect(isCutinRarity('void')).toBe(true);
    expect(isCutinRarity('legendary')).toBe(false);
  });

  it('sends a ten-pull of ordinary cards through in about a second', () => {
    const t = revealTimeline(Array(10).fill('common'));
    expect(t.steps).toHaveLength(10);
    expect(t.steps.every((s) => s.kind === 'fly')).toBe(true);
    expect(t.totalMs).toBeLessThanOrEqual(1100);
    expect(t.steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const at = t.steps.map((s) => s.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('sends one card on its own', () => {
    const t = revealTimeline(['rare']);
    expect(t.steps).toEqual([{ kind: 'fly', index: 0, at: 0 }]);
    expect(t.totalMs).toBe(FLY_MS);
  });

  it('stops everything for a T6: the cut-in, then its card, then the rest', () => {
    const t = revealTimeline(['common', 'common', 'mythic', 'common']);
    const cut = t.steps.find((s) => s.kind === 'cutin')!;
    expect(cut.index).toBe(2);
    // the cards before it have landed when the cut-in starts
    for (const s of t.steps.filter((x) => x.kind === 'fly' && x.index < 2)) {
      expect(s.at + FLY_MS).toBeLessThanOrEqual(cut.at);
    }
    // its card lands at 2x, holds and settles before anything else moves
    const hero = t.steps.find((x) => x.kind === 'hero')!;
    expect(hero.index).toBe(2);
    expect(hero.at).toBeGreaterThanOrEqual(cut.at + CUTIN_MS);
    // nothing after it moves until it is over
    const after = t.steps.filter((x) => x.kind === 'fly' && x.index >= 2);
    for (const s of after) expect(s.at).toBeGreaterThanOrEqual(hero.at + HERO_MS);
    expect(t.totalMs).toBeGreaterThan(cut.at + CUTIN_MS);
  });

  it('gives each of two T6 cards its own cut-in, one after the other', () => {
    const t = revealTimeline(['mythic', 'void']);
    const cuts = t.steps.filter((s) => s.kind === 'cutin');
    expect(cuts).toHaveLength(2);
    expect(cuts[1]!.at).toBeGreaterThanOrEqual(cuts[0]!.at + CUTIN_MS);
  });
});

describe('a locked Heirloom in the reveal (the pull lock bug)', () => {
  it('previews an unlocked card without breaking the numbers or touching the save', () => {
    const state = freshState();
    const card = content.cards.find((c) => c.heirloom)!;
    expect(state.cards.owned[card.id]).toBeUndefined();
    const ghost = lockedHeirloomState(state, card.id);
    expect(ghost.cards.owned[card.id]?.tier).toBe('heirloom');
    expect(state.cards.owned[card.id]).toBeUndefined();
    // the Cards page maths reads resources as Decimals; a structuredClone turned them into plain objects
    expect(() => cardInfo(ghost, content, card.id)).not.toThrow();
    expect(ghost.resources['star_dust'] ?? new Decimal(0)).toBeInstanceOf(Decimal);
  });
});
