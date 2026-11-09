import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, RARITIES, loadContent } from '../src/data';
import { itemArt } from '../src/renderer/src/art/items';
import { EVOLUTIONS, evolutionVector, itemVector } from '../src/renderer/src/art/vector/items';
import { sprite } from '../src/renderer/src/art/pixel/sprites';

const content = loadContent();

describe('signature items (DESIGN.md §12)', () => {
  it('draws something for every item kind the data allows at every rarity, and every beta card names one', () => {
    for (const kind of ITEM_KINDS)
      for (const r of RARITIES) expect(itemArt(kind, r), `${kind} ${r}`).not.toBe('');
    for (const card of content.cards) {
      expect(ITEM_KINDS).toContain(card.item.kind);
      expect(itemArt(card.item.kind, card.rarity)).not.toBe('');
    }
  });

  it('matches the card table: element and item type per card', () => {
    const byId = Object.fromEntries(content.cards.map((c) => [c.id, [c.element, c.item.kind]]));
    expect(byId['ember_squire']).toEqual(['fire', 'sword']);
    expect(byId['storm_duelist']).toEqual(['storm', 'dagger']);
    expect(byId['core_titan']).toEqual(['void', 'pickaxe']);
  });

  it('shows the interim baked sprite for types with old art, at every rarity, with a traced outline', () => {
    const drawn = [
      'sword',
      'greatsword',
      'staff',
      'hammer',
      'bow',
      'pickaxe',
      'logging_axe',
      'dagger',
    ] as const;
    for (const kind of drawn)
      for (const r of RARITIES) {
        const art = itemArt(kind, r);
        expect(art, `${kind} ${r}`).toContain('<image');
        expect(art, `${kind} ${r}`).toContain('class="bi-item__outline"');
      }
    // The old ladder has no Uncommon: it shows the Common look.
    expect(itemArt('sword', 'uncommon')).toBe(itemArt('sword', 'common'));
  });

  it('shows a labelled placeholder for the types with no pictures yet', () => {
    for (const kind of ['spear', 'lance', 'scythe'] as const) {
      expect(itemArt(kind, 'rare')).toContain('bi-item--placeholder');
      expect(itemArt(kind, 'rare')).toContain(kind.toUpperCase());
    }
  });

  it('shows the sprite in the 200 x 240 item box, pixelated, with the outline effects trace', () => {
    const art = itemArt('sword', 'legendary');
    expect(art).toMatch(/^<g class="bi-item">/);
    expect(art).toContain('<image');
    expect(art).toContain('width="200" height="240"');
    expect(art).toContain('image-rendering:pixelated');
    expect(art).toContain('class="bi-item__outline"');
  });

  it('adds parts with rarity in the source drawing: Common plain, Rare a gem, Legendary a ribbon, Void shards', () => {
    const common = itemVector('sword', 'common');
    expect(common).not.toContain('#7fd3ff');
    expect(itemVector('sword', 'rare')).toContain('#7fd3ff');
    expect(itemVector('sword', 'legendary')).toContain('#d8322e');
    expect(itemVector('sword', 'void')).toContain('bi-art-orbit');
    const tw = (s: string) => (s.match(/bi-art-tw/g) ?? []).length;
    expect(tw(common)).toBe(0);
    expect(tw(itemVector('sword', 'void'))).toBeGreaterThan(tw(itemVector('sword', 'legendary')));
  });

  it('bakes the three unique evolutions in the card-item treatment', () => {
    for (const id of EVOLUTIONS) {
      expect(evolutionVector(id).length).toBeGreaterThan(500);
      expect(sprite(`evo-${id}`)).toMatchObject({ w: 100, h: 120 });
    }
    for (let k = 0; k < 4; k++) expect(sprite(`evo-rootbloom_staff-crystal${k}`)).toBeDefined();
  });
});
