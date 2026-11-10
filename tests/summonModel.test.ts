import { describe, expect, it } from 'vitest';
import { Decimal, portalInfo, type PullResult } from '../src/game';
import {
  DECK_MAX_LAYERS,
  DECK_MIN_LAYERS,
  HAND_MAX,
  deckLayers,
  handSummary,
  lastHandView,
  oddsTable,
  portalView,
  revealSound,
  revealViews,
} from '../src/renderer/src/pages/summonModel';
import { content, freshState } from './helpers';

const portal = content.portals[0]!;

describe('summon shelf', () => {
  it('shows prices, pity and rates of a portal', () => {
    const state = freshState();
    state.resources[portal.cost.resource] = new Decimal(1000);
    const v = portalView(portalInfo(state, content, portal.id)!, content);
    expect(v.name).toBe(portal.name);
    expect(v.single.affordable && v.ten.affordable).toBe(true);
    expect(v.ten.label).toBe('Pull 10');
    expect(v.ten.amount).toBe('100');
    expect(v.resourceId).toBe(portal.cost.resource);
    expect(v.line).toMatch(/or better within \d+ pulls$/);
    expect(v.pityText).toMatch(/^0 \/ \d+$/);
    expect(v.pity).toMatch(/or better within \d+ pulls$/);
    expect(v.pityProgress).toBe(0);
    expect(v.guarantee).toMatch(/^Every ×10 holds a /);
    expect(v.rates[0]).toMatch(/^Common: \d/);
  });

  it('cannot pull without the portal resource', () => {
    const v = portalView(portalInfo(freshState(), content, portal.id)!, content);
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
    expect(a).toMatchObject({ name: card.name, upgrade: true, tags: ['New!', '×10 guarantee'] });
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
