import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, RARITIES, loadContent } from '../src/data';
import { ITEM_KINDS_DRAWN, itemArt } from '../src/renderer/src/art/items';
import { EVOLUTIONS, evolutionVector, itemVector } from '../src/renderer/src/art/vector/items';
import { sprite } from '../src/renderer/src/art/pixel/sprites';

const content = loadContent();

describe('signature items (DESIGN.md §12)', () => {
  it('draws every item kind the data allows, and every beta card names one', () => {
    expect([...ITEM_KINDS].sort()).toEqual([...ITEM_KINDS_DRAWN].sort());
    for (const card of content.cards) expect(itemArt(card.item.kind, card.rarity)).not.toBe('');
  });

  it('matches the card table: element and item per card', () => {
    const byId = Object.fromEntries(content.cards.map((c) => [c.id, [c.element, c.item.name]]));
    expect(byId['ember_squire']).toEqual(['fire', 'Ember Blade']);
    expect(byId['storm_duelist']).toEqual(['storm', 'Twin Storm Blades']);
    expect(byId['core_titan']).toEqual(['void', 'Core Gauntlet']);
  });

  it('bakes every kind at every rarity as a 100 x 120 pixel sprite with a traced outline', () => {
    for (const kind of ITEM_KINDS)
      for (const r of RARITIES) {
        const s = sprite(`item-${kind}-${r}`);
        expect(s, `${kind} ${r}`).toMatchObject({ w: 100, h: 120 });
        expect(s!.outline?.length ?? 0).toBeGreaterThan(20);
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

  it('returns nothing for an unknown kind', () => {
    expect(itemArt('banana', 'common')).toBe('');
  });

  it('bakes the three unique evolutions in the card-item treatment', () => {
    for (const id of EVOLUTIONS) {
      expect(evolutionVector(id).length).toBeGreaterThan(500);
      expect(sprite(`evo-${id}`)).toMatchObject({ w: 100, h: 120 });
    }
    for (let k = 0; k < 4; k++) expect(sprite(`evo-rootbloom_staff-crystal${k}`)).toBeDefined();
  });
});
