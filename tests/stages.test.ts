import { describe, expect, it } from 'vitest';
import {
  buyDamageLevels,
  buyExpansions,
  buyMineLevels,
  cardItem,
  cardItemKind,
  Decimal,
  edgeStage,
  newOwnedCard,
  resetProduction,
  simulateOffline,
  starUp,
  tierUp,
  tileStage,
  type OwnedCard,
} from '../src/game';
import { bareState, constantRng, content, freshState } from './helpers';

describe('tile stages (DESIGN.md 16, E4)', () => {
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

  it('grows tree tiles one stage per 5 plots bought (trees have no levels)', () => {
    expect(content.progression.tileStages.logging).toEqual({ source: 'expansions', every: 5 });
    const state = freshState();
    state.production.logging.expansions = 4;
    expect(tileStage(state, content, 'logging', 'oak')).toBe(0);
    state.production.logging.expansions = 12;
    expect(tileStage(state, content, 'logging', 'oak')).toBe(2);
    expect(tileStage(state, content, 'logging', 'ironbark')).toBe(2);
  });

  it('is 0 for unknown producers or the wrong job', () => {
    const state = freshState();
    state.production.mineLevels['copper_quarry'] = 100;
    expect(tileStage(state, content, 'mining', 'nope')).toBe(0);
    expect(tileStage(state, content, 'logging', 'copper_quarry')).toBe(0);
  });

  it('resets with the levels and plots on prestige', () => {
    const state = freshState();
    state.production.mineLevels['copper_quarry'] = 75;
    state.production.logging.expansions = 10;
    const after = resetProduction(state, content);
    expect(tileStage(after, content, 'mining', 'copper_quarry')).toBe(0);
    expect(tileStage(after, content, 'logging', 'oak')).toBe(0);
  });
});

describe('forged edges (DESIGN.md 16, E5)', () => {
  it('steps the blade at every damage line milestone, up to stage 4', () => {
    const state = freshState();
    expect(edgeStage(state, content, 'copper_edge')).toBe(0);
    state.combat.damageLevels['copper_edge'] = 25;
    expect(edgeStage(state, content, 'copper_edge')).toBe(1);
    state.combat.damageLevels['copper_edge'] = 1000;
    expect(edgeStage(state, content, 'copper_edge')).toBe(4);
    expect(edgeStage(state, content, 'unknown_edge')).toBe(0);
  });
});

describe('tier-ups from purchases (DESIGN.md 16, E1)', () => {
  it('reports damage line milestones crossed by a bulk buy', () => {
    const state = freshState();
    state.combat.damageLevels['copper_edge'] = 20;
    state.resources['copper_gem'] = new Decimal('1e30');
    const result = buyDamageLevels(state, content, 'copper_edge', 10);
    expect(result.ok && result.tierUps).toEqual([
      { kind: 'damage_milestone', id: 'copper_edge', from: 0, to: 1, metal: 'bronze' },
    ]);
  });

  it('reports mine milestones and nothing when none is crossed', () => {
    const state = freshState();
    state.resources['copper_gem'] = new Decimal('1e60');
    const small = buyMineLevels(state, content, 'copper_quarry', 10);
    expect(small.ok && small.tierUps).toEqual([]);
    const big = buyMineLevels(state, content, 'copper_quarry', 100);
    expect(big.ok && big.tierUps).toEqual([
      { kind: 'mine_milestone', id: 'copper_quarry', from: 0, to: 4, metal: 'prismatic' },
    ]);
  });

  it('reports a tree tile stage reached by buying plots', () => {
    const state = freshState();
    state.production.logging.expansions = 3;
    state.resources['oak_gem'] = new Decimal('1e30');
    state.resources['copper_gem'] = new Decimal('1e30');
    const result = buyExpansions(state, content, 'logging', 2);
    expect(result.ok && result.tierUps).toEqual([
      { kind: 'tile_stage', id: 'logging', from: 0, to: 1, metal: 'bronze' },
    ]);
    const slots = buyExpansions(state, content, 'mining', 1);
    expect(slots.ok && slots.tierUps).toEqual([]);
  });
});

function cardAt(tier: OwnedCard['tier'], stars: number, level = 200): OwnedCard {
  return { ...newOwnedCard(), tier, stars, level, duplicates: 5 };
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

  it('reports the unique evolution when a star-up reaches Gold ★6', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = cardAt('gold', 5, 76);
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e9');
    const result = starUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps).toEqual([
      { kind: 'evolution', id: 'ember_squire', from: 0, to: 1, metal: 'gold' },
    ]);
  });

  it('reports nothing for an ordinary star-up', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = cardAt('bronze', 1, 20);
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e9');
    const result = starUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps).toEqual([]);
  });
});

describe('unique evolutions (DESIGN.md 16, E6)', () => {
  it('maps Flameblade and Rootbloom Staff, and defines Soul Reaper unassigned', () => {
    expect(content.cardById.get('ember_squire')!.evolution).toBe('flameblade');
    expect(content.cardById.get('grove_keeper')!.evolution).toBe('rootbloom_staff');
    expect(content.cards.filter((c) => c.evolution === 'soul_reaper')).toEqual([]);
    expect(content.progression.evolutions.items.map((i) => i.kind)).toContain('soul_reaper');
    expect(content.progression.evolutions.from).toEqual({ tier: 'gold', stars: 6 });
  });

  it('draws the generic item below Gold ★6 and the unique one from Gold ★6 on', () => {
    expect(cardItemKind(content, 'ember_squire', null)).toBe('sword');
    expect(cardItemKind(content, 'ember_squire', cardAt('gold', 5))).toBe('sword');
    expect(cardItemKind(content, 'ember_squire', cardAt('gold', 6))).toBe('flameblade');
    expect(cardItemKind(content, 'ember_squire', cardAt('prismatic', 1))).toBe('flameblade');
    expect(cardItemKind(content, 'grove_keeper', cardAt('prismatic', 3))).toBe('rootbloom_staff');
  });

  it('keeps the generic item for cards without an evolution', () => {
    expect(cardItemKind(content, 'shield_warden', cardAt('prismatic', 6))).toBe('shield');
    expect(cardItemKind(content, 'nope', null)).toBeNull();
  });

  it('gives the item name and whether it is unique', () => {
    expect(cardItem(content, 'ember_squire', cardAt('gold', 6))).toEqual({
      kind: 'flameblade',
      name: 'Flameblade',
      unique: true,
    });
    expect(cardItem(content, 'ember_squire', null)).toEqual({
      kind: 'sword',
      name: 'Ember Blade',
      unique: false,
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
