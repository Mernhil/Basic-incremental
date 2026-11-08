import { describe, expect, it } from 'vitest';
import {
  buyMineLevels,
  cardItem,
  cardItemKind,
  Decimal,
  newOwnedCard,
  resetProduction,
  simulateOffline,
  starUp,
  tierUp,
  tileStage,
  type OwnedCard,
} from '../src/game';
import { bareState, constantRng, content, freshState } from './helpers';

describe('tile stages (DESIGN.md §12)', () => {
  it('grows a mine tile one stage per 25-level milestone, up to stage 4', () => {
    const state = freshState();
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(0);
    state.production.mineLevels['copper_quarry'] = 24;
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(0);
    state.production.mineLevels['copper_quarry'] = 50;
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(2);
    state.production.mineLevels['copper_quarry'] = 400;
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(4);
    expect(tileStage(state, content, 'mining', 'iron_deeps')).toBe(0);
  });

  it('grows a tree tile one stage per 25-level milestone (DESIGN.md §4)', () => {
    expect(content.progression.tileStages.logging).toEqual({ source: 'level' });
    const state = freshState();
    expect(tileStage(state, content, 'logging', 'oak')).toBe(0);
    state.production.treeLevels['oak'] = 50;
    expect(tileStage(state, content, 'logging', 'oak')).toBe(2);
    expect(tileStage(state, content, 'logging', 'ironbark')).toBe(0);
  });

  it('is 0 for unknown producers or the wrong job', () => {
    const state = freshState();
    state.production.mineLevels['copper_quarry'] = 100;
    expect(tileStage(state, content, 'mining', 'nope')).toBe(0);
    expect(tileStage(state, content, 'logging', 'copper_quarry')).toBe(0);
  });

  it('resets with the levels on prestige', () => {
    const state = freshState();
    state.production.mineLevels['copper_quarry'] = 75;
    state.production.treeLevels['oak'] = 50;
    const after = resetProduction(state);
    expect(tileStage(after, content, 'mining', 'copper_quarry')).toBe(0);
    expect(tileStage(after, content, 'logging', 'oak')).toBe(0);
  });
});

describe('tier-ups from purchases (DESIGN.md §12)', () => {
  it('reports mine milestones and nothing when none is crossed', () => {
    const state = freshState();
    state.resources['money'] = new Decimal('1e60');
    const small = buyMineLevels(state, content, 'copper_quarry', 10);
    expect(small.ok && small.tierUps).toEqual([]);
    const big = buyMineLevels(state, content, 'copper_quarry', 100);
    expect(big.ok && big.tierUps).toEqual([
      { kind: 'mine_milestone', id: 'copper_quarry', from: 0, to: 4, metal: 'prismatic' },
    ]);
  });
});

function cardAt(tier: OwnedCard['tier'], stars: number, level = 200): OwnedCard {
  return { ...newOwnedCard(), tier, stars, level, starFill: 5 };
}

describe('card tier and evolution tier-ups', () => {
  it('reports a card tier-up with the new tier metal', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = cardAt('bronze', 6, 40);
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e9');
    const result = tierUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps).toEqual([
      { kind: 'card_tier', id: 'ember_squire', from: 1, to: 2, metal: 'silver' },
    ]);
  });

  it('reports the unique evolution when a tier-up reaches the Unique tier', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = cardAt('prismatic', 6, 80);
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e12');
    const result = tierUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps).toEqual([
      { kind: 'card_tier', id: 'ember_squire', from: 4, to: 5, metal: 'prismatic' },
      { kind: 'evolution', id: 'ember_squire', from: 0, to: 1, metal: 'prismatic' },
    ]);
  });

  it('reports no evolution when a card reaches Gold ★6', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = cardAt('silver', 6, 40);
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e12');
    const result = tierUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps.map((t) => t.kind)).toEqual(['card_tier']);
  });

  it('reports nothing for an ordinary star-up', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = cardAt('bronze', 1, 20);
    state.cards.owned['ember_squire']!.starFill = 5;
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e9');
    const result = starUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps).toEqual([]);
  });
});

describe('unique evolutions (DESIGN.md §5)', () => {
  it('maps Flameblade and Rootbloom Staff, and defines Soul Reaper unassigned', () => {
    expect(content.cardById.get('ember_squire')!.evolution).toBe('flameblade');
    expect(content.cardById.get('grove_keeper')!.evolution).toBe('rootbloom_staff');
    expect(content.cards.filter((c) => c.evolution === 'soul_reaper')).toEqual([]);
    expect(content.progression.evolutions.items.map((i) => i.kind)).toContain('soul_reaper');
  });

  it('draws the generic item below the Unique tier and the unique one at Unique', () => {
    expect(cardItemKind(content, 'ember_squire', null)).toBe('sword');
    expect(cardItemKind(content, 'ember_squire', cardAt('gold', 5))).toBe('sword');
    expect(cardItemKind(content, 'ember_squire', cardAt('gold', 6))).toBe('sword');
    expect(cardItemKind(content, 'ember_squire', cardAt('prismatic', 6))).toBe('sword');
    expect(cardItemKind(content, 'ember_squire', cardAt('unique', 1))).toBe('flameblade');
    expect(cardItemKind(content, 'grove_keeper', cardAt('unique', 3))).toBe('rootbloom_staff');
  });

  it('keeps the generic item for cards without an evolution', () => {
    expect(cardItemKind(content, 'shield_warden', cardAt('prismatic', 6))).toBe('shield');
    expect(cardItemKind(content, 'nope', null)).toBeNull();
  });

  it('gives the item name and whether it is unique', () => {
    expect(cardItem(content, 'ember_squire', cardAt('unique', 1))).toEqual({
      kind: 'flameblade',
      name: 'Flameblade',
      unique: true,
      rarity: 'mythic',
    });
    expect(cardItem(content, 'ember_squire', null)).toEqual({
      kind: 'sword',
      name: 'Ember Blade',
      unique: false,
      rarity: 'common',
    });
  });
});

describe('welcome back', () => {
  it('lists the mastery tiers reached while away', () => {
    const state = bareState();
    state.mastery.harvested['oak_gem'] = new Decimal(995);
    const { summary } = simulateOffline(state, content, 0, 60_000, constantRng(0.5));
    expect(summary!.tierUps).toEqual([
      { kind: 'gem_mastery', id: 'oak_gem', from: 0, to: 1, metal: 'bronze' },
    ]);
  });
});
