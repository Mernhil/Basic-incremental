import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, RARITIES, loadContent } from '../src/data';
import { ITEM_KINDS_DRAWN, itemArt } from '../src/renderer/src/art/items';

const content = loadContent();

describe('signature items (DESIGN.md 13)', () => {
  it('draws every item kind the data allows, and every beta card names one', () => {
    expect([...ITEM_KINDS].sort()).toEqual([...ITEM_KINDS_DRAWN].sort());
    for (const card of content.cards) expect(itemArt(card.item.kind, card.rarity)).not.toBe('');
  });

  it('matches the card table: element and item per card', () => {
    const byId = Object.fromEntries(content.cards.map((c) => [c.id, [c.element, c.item.name]]));
    expect(byId['ember_squire']).toEqual(['fire', 'Ember Blade']);
    expect(byId['shield_warden']).toEqual(['light', 'Bulwark']);
    expect(byId['core_titan']).toEqual(['void', 'Core Gauntlet']);
  });

  it('draws every kind at every rarity', () => {
    for (const kind of ITEM_KINDS)
      for (const r of RARITIES) expect(itemArt(kind, r).length).toBeGreaterThan(200);
  });

  it('adds parts with rarity: Common plain, Rare a gem, Legendary a ribbon, Void orbiting shards', () => {
    const common = itemArt('sword', 'common');
    const rare = itemArt('sword', 'rare');
    const legendary = itemArt('sword', 'legendary');
    const voidArt = itemArt('sword', 'void');
    expect(common).not.toContain('#7fd3ff');
    expect(rare).toContain('#7fd3ff');
    expect(legendary).toContain('#d8322e');
    expect(voidArt).toContain('bi-art-orbit');
    expect(common).not.toContain('bi-art-orbit');
    const tw = (s: string) => (s.match(/bi-art-tw/g) ?? []).length;
    expect(tw(common)).toBe(0);
    expect(tw(voidArt)).toBeGreaterThan(tw(legendary));
  });

  it('returns nothing for an unknown kind', () => {
    expect(itemArt('banana', 'common')).toBe('');
  });
});
