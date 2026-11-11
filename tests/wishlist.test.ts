import { describe, expect, it } from 'vitest';
import {
  createSeededRng,
  Decimal,
  portalInfo,
  pull,
  setWishlisted,
  wishlistView,
  type GameState,
} from '../src/game';
import { RARITIES, type Rarity } from '../src/data';
import { constantRng, content, CRYSTAL_UNIT, freshState } from './helpers';

const PORTAL = 'card_portal';
const portal = content.portals.find((p) => p.id === PORTAL)!;
const ofRarity = (r: Rarity) => portal.pool.filter((e) => e.rarity === r).map((e) => e.itemId);
const rich = (): GameState => {
  const s = freshState();
  s.resources['summon_crystal'] = new Decimal(1e9 * CRYSTAL_UNIT);
  return s;
};
const mark = (state: GameState, ...ids: string[]): GameState => {
  let s = state;
  for (const id of ids) {
    const r = setWishlisted(s, content, id, true);
    if (!r.ok) throw new Error(`${id}: ${r.reason}`);
    s = r.state;
  }
  return s;
};

describe('Wishlist marking (DESIGN.md §7)', () => {
  it('the portal data holds a per-rarity limit', () => {
    expect(portal.wishlistPerRarity).toBeGreaterThanOrEqual(1);
  });

  it('marks and unmarks a card, in the order marked', () => {
    const [a, b] = ofRarity('epic');
    let s = mark(freshState(), a!, b!);
    expect(s.cards.wishlist).toEqual([a, b]);
    const off = setWishlisted(s, content, a!, false);
    if (!off.ok) throw new Error(off.reason);
    s = off.state;
    expect(s.cards.wishlist).toEqual([b]);
  });

  it('refuses a card past the limit of its rarity, an unknown card and a card of no card portal', () => {
    const ids = ofRarity('rare');
    const limit = portal.wishlistPerRarity;
    const s = mark(freshState(), ...ids.slice(0, limit));
    expect(setWishlisted(s, content, ids[limit]!, true)).toEqual({ ok: false, reason: 'full' });
    expect(setWishlisted(s, content, 'nobody', true)).toEqual({ ok: false, reason: 'unknown' });
    // Another rarity is counted on its own.
    expect(setWishlisted(s, content, ofRarity('epic')[0]!, true).ok).toBe(true);
  });

  it('marking twice changes nothing', () => {
    const id = ofRarity('rare')[0]!;
    const s = mark(freshState(), id);
    const again = setWishlisted(s, content, id, true);
    if (!again.ok) throw new Error(again.reason);
    expect(again.state.cards.wishlist).toEqual([id]);
  });

  it('shows the marked cards by rarity with the room left', () => {
    const id = ofRarity('epic')[0]!;
    const view = wishlistView(mark(freshState(), id), content, PORTAL)!;
    const epic = view.byRarity.find((r) => r.rarity === 'epic')!;
    expect(epic.cards.find((c) => c.itemId === id)!.marked).toBe(true);
    expect(epic.limit).toBe(portal.wishlistPerRarity);
    expect(epic.marked).toBe(1);
    expect(view.active).toBe(true);
    expect(wishlistView(freshState(), content, PORTAL)!.active).toBe(false);
  });
});

describe('Wishlist pulls', () => {
  it('a pull of a rarity with a marked card gives a marked card of that rarity', () => {
    const [, b] = ofRarity('common');
    const s = mark(rich(), b!);
    for (const roll of [0, 0.1, 0.3, 0.5]) {
      const r = pull(s, content, PORTAL, 1, constantRng(roll));
      if (!r.ok) throw new Error(r.reason);
      expect(r.results[0]).toMatchObject({ rarity: 'common', itemId: b });
    }
  });

  it('a rarity with no marked card behaves as without a wishlist', () => {
    const marked = mark(rich(), ofRarity('epic')[0]!);
    const plain = rich();
    for (const roll of [0, 0.2, 0.55, 0.8]) {
      const a = pull(marked, content, PORTAL, 1, constantRng(roll));
      const b = pull(plain, content, PORTAL, 1, constantRng(roll));
      if (!a.ok || !b.ok) throw new Error('pull');
      if (b.results[0]!.rarity !== 'epic') expect(a.results[0]!.itemId).toBe(b.results[0]!.itemId);
    }
  });

  it('picks among several marked cards of a rarity with the pool weights', () => {
    const [a, b] = ofRarity('uncommon');
    const s = mark(rich(), a!, b!);
    const seen = new Set<string>();
    const rng = createSeededRng(7);
    for (let i = 0; i < 300; i++) {
      const r = pull(s, content, PORTAL, 1, rng);
      if (!r.ok) throw new Error(r.reason);
      if (r.results[0]!.rarity === 'uncommon') seen.add(r.results[0]!.itemId);
    }
    expect([...seen].sort()).toEqual([a, b].sort());
  });

  it('the chance of each rarity is the same with and without a wishlist', () => {
    const count = (state: GameState) => {
      const tally: Record<string, number> = {};
      const rng = createSeededRng(2026);
      let s = state;
      for (let i = 0; i < 4000; i++) {
        const r = pull(s, content, PORTAL, 1, rng);
        if (!r.ok) throw new Error(r.reason);
        const rarity = r.results[0]!.rarity;
        tally[rarity] = (tally[rarity] ?? 0) + 1;
        s = { ...r.state, resources: state.resources, portals: {} };
      }
      return tally;
    };
    const marked = mark(rich(), ...RARITIES.flatMap((r) => ofRarity(r).slice(0, 1)));
    // The rarity roll uses the same draws, so the tallies match exactly, not just closely.
    expect(count(marked)).toEqual(count(rich()));
  });

  it('hard pity and the 10-pull guarantee land on a marked card of their rarity too', () => {
    const wanted = ofRarity('legendary')[3]!;
    const pity = mark(rich(), wanted);
    pity.portals[PORTAL] = { pity: 89, pulls: 89, pityHits: 0 };
    const hit = pull(pity, content, PORTAL, 1, constantRng(0));
    if (!hit.ok) throw new Error(hit.reason);
    expect(hit.results[0]).toMatchObject({ pity: true, rarity: 'legendary', itemId: wanted });

    const rare = ofRarity('rare')[4]!;
    const ten = pull(mark(rich(), rare), content, PORTAL, 10, constantRng(0));
    if (!ten.ok) throw new Error(ten.reason);
    expect(ten.results[9]).toMatchObject({ guaranteed: true, rarity: 'rare', itemId: rare });
  });

  it('price, pity counters and the odds are unchanged', () => {
    const marked = mark(rich(), ofRarity('common')[0]!);
    const a = pull(marked, content, PORTAL, 10, constantRng(0.4));
    const b = pull(rich(), content, PORTAL, 10, constantRng(0.4));
    if (!a.ok || !b.ok) throw new Error('pull');
    expect(a.state.resources['summon_crystal']).toEqual(b.state.resources['summon_crystal']);
    expect(a.state.portals[PORTAL]).toEqual(b.state.portals[PORTAL]);
    expect(portalInfo(marked, content, PORTAL)!.rates).toEqual(
      portalInfo(rich(), content, PORTAL)!.rates,
    );
  });
});
