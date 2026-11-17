import { describe, expect, it } from 'vitest';
import {
  buyMineLevels,
  cardItem,
  cardItemKind,
  Decimal,
  itemName,
  newOwnedCard,
  resetProduction,
  simulateOffline,
  starUp,
  tileStage,
  type OwnedCard,
} from '../src/game';
import { RANK_TIERS } from '../src/data';
import { bareState, constantRng, content, freshState } from './helpers';

describe('tile stages (DESIGN.md §12)', () => {
  it('grows a mine tile one stage per 15-level milestone, up to stage 4', () => {
    const state = freshState();
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(0);
    state.production.mineLevels['copper_quarry'] = 14;
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(0);
    state.production.mineLevels['copper_quarry'] = 30;
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(2);
    state.production.mineLevels['copper_quarry'] = 400;
    expect(tileStage(state, content, 'mining', 'copper_quarry')).toBe(4);
    expect(tileStage(state, content, 'mining', 'iron_deeps')).toBe(0);
  });

  it('grows a tree tile one stage per 15-level milestone (DESIGN.md §4)', () => {
    expect(content.progression.tileStages.logging).toEqual({ source: 'level' });
    const state = freshState();
    expect(tileStage(state, content, 'logging', 'oak')).toBe(0);
    state.production.treeLevels['oak'] = 30;
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
    const small = buyMineLevels(state, content, 'copper_quarry', 10); // under the first milestone (15)
    expect(small.ok && small.tierUps).toEqual([]);
    const big = buyMineLevels(state, content, 'copper_quarry', 100);
    expect(big.ok && big.tierUps).toEqual([
      { kind: 'mine_milestone', id: 'copper_quarry', from: 0, to: 6, metal: 'prismatic' },
    ]);
  });
});

function cardAt(tier: OwnedCard['tier'], stars: number, level = 200): OwnedCard {
  return { ...newOwnedCard(), tier, stars, level, starFill: 5 };
}

describe('card star-ups', () => {
  it('reports nothing for an ordinary star-up', () => {
    const state = freshState();
    state.cards.owned['ember_squire'] = cardAt('wood', 1, 20);
    state.cards.owned['ember_squire']!.starFill = 5;
    for (const r of Object.keys(state.resources)) state.resources[r] = new Decimal('1e9');
    const result = starUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps).toEqual([]);
  });
});

describe('item types per card (DESIGN.md §5)', () => {
  it('gives every card one of the 11 item types, by its job and role', () => {
    const kinds = new Set(content.items.types.map((t) => t.kind));
    expect(kinds.size).toBe(11);
    for (const card of content.cards) expect(kinds.has(card.item.kind), card.id).toBe(true);
    for (const card of content.cards.filter((c) => c.job === 'logging'))
      expect(card.item.kind, card.id).toBe('logging_axe');
    for (const card of content.cards.filter((c) => c.job === 'mining'))
      expect(card.item.kind, card.id).toBe('pickaxe');
  });

  it('draws the same item type at every tier of a card', () => {
    expect(cardItemKind(content, 'ember_squire')).toBe('sword');
    expect(cardItemKind(content, 'ember_squire')).toBe('sword');
    expect(cardItemKind(content, 'dawnblade_regent')).toBe('greatsword');
    expect(cardItemKind(content, 'storm_duelist')).toBe('dagger');
    expect(cardItemKind(content, 'reaper_test')).toBe('scythe');
    expect(cardItemKind(content, 'grove_keeper')).toBe('logging_axe');
    expect(cardItemKind(content, 'gem_cutter')).toBe('pickaxe');
    expect(cardItemKind(content, 'nope')).toBeNull();
  });

  it('gives the item name and whether it is an Heirloom', () => {
    expect(cardItem(content, 'ember_squire')).toEqual({
      kind: 'sword',
      name: 'Wooden Sword',
      heirloom: false,
    });
    expect(cardItem(content, 'moonwood_dryad')).toEqual({
      kind: 'logging_axe',
      name: 'Mythic Grove Axe',
      heirloom: false,
    });
  });
});

describe('item names (DESIGN.md §5, items.json)', () => {
  it('names T1 to T4 "<material> <type>": Wooden, Bronze, Silver, Golden', () => {
    expect(itemName(content, 'sword', 'wood', undefined)).toBe('Wooden Sword');
    expect(itemName(content, 'sword', 'bronze', undefined)).toBe('Bronze Sword');
    expect(itemName(content, 'sword', 'silver', undefined)).toBe('Silver Sword');
    expect(itemName(content, 'sword', 'gold', undefined)).toBe('Golden Sword');
    expect(itemName(content, 'greatsword', 'gold', undefined)).toBe('Golden Greatsword');
    expect(itemName(content, 'dagger', 'silver', undefined)).toBe('Silver Dagger');
  });

  it('shows the logging axe as "Axe"', () => {
    expect(itemName(content, 'logging_axe', 'wood', undefined)).toBe('Wooden Axe');
    expect(itemName(content, 'logging_axe', 'gold', undefined)).toBe('Golden Axe');
    expect(itemName(content, 'logging_axe', 'prismatic', undefined)).toBe('Prismatic Axe');
  });

  it('names T5 "Prismatic <type>", the same for both sides', () => {
    expect(itemName(content, 'sword', 'prismatic', undefined)).toBe('Prismatic Sword');
    expect(itemName(content, 'sword', 'prismatic', 'void')).toBe('Prismatic Sword');
    expect(itemName(content, 'bow', 'prismatic', undefined)).toBe('Prismatic Bow');
  });

  it('names T6 by the card side: Mythic Light Sword for Mythic, Void Shadow Sword for Void', () => {
    expect(itemName(content, 'sword', 'mythic', 'mythic')).toBe('Mythic Light Sword');
    expect(itemName(content, 'sword', 'mythic', 'void')).toBe('Void Shadow Sword');
    expect(itemName(content, 'scythe', 'mythic', 'mythic')).toBe('Mythic Mercy Scythe');
    expect(itemName(content, 'scythe', 'mythic', 'void')).toBe('Void Grim Scythe');
    expect(itemName(content, 'pickaxe', 'mythic', 'void')).toBe('Void Hollowdeep Pickaxe');
  });

  it('names the Heirloom by its type alone: one per type, whichever side the card leans', () => {
    expect(itemName(content, 'sword', 'heirloom', 'mythic')).toBe('Solaris');
    expect(itemName(content, 'sword', 'heirloom', 'void')).toBe('Solaris');
    expect(itemName(content, 'logging_axe', 'heirloom', 'mythic')).toBe('Elderwarden');
    expect(itemName(content, 'greatsword', 'heirloom', 'void')).toBe('Grimhowl');
  });

  it('has a name at every tier and side for each of the 11 types', () => {
    for (const type of content.items.types) {
      for (const tier of RANK_TIERS) {
        for (const rarity of ['mythic', 'void'] as const) {
          const name = itemName(content, type.kind, tier, rarity);
          expect(name.length, `${type.kind} ${tier} ${rarity}`).toBeGreaterThan(0);
          expect(name, `${type.kind} ${tier} ${rarity}`).not.toBe(type.kind);
        }
      }
    }
  });

  it('falls back to the kind for an unknown type', () => {
    expect(itemName(content, 'nothing' as never, 'wood', undefined)).toBe('nothing');
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
