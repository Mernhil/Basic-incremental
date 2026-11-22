import { cardStyle } from '../src/data';
import { describe, expect, it } from 'vitest';
import { cardItem, itemName, heirloomCards } from '../src/game';
import { cardTierArt, itemArt } from '../src/renderer/src/art/items';
import { sprite } from '../src/renderer/src/art/pixel/sprites';
import { content } from './helpers';

/** DESIGN §2 The Wildwood batch: batch 3 adds 22 T6 cards and 12 Heirlooms (two daggers). */
const ww = content.cards.filter((c) => c.batch === 'wildwood');
const t6 = ww.filter((c) => !c.heirloom);
const heirlooms = ww.filter((c) => c.heirloom);

const EARTH_HEIRLOOMS = ['sword', 'greatsword', 'lance', 'hammer', 'bow', 'logging_axe', 'dagger'];
const FIRE_HEIRLOOMS = ['dagger', 'spear', 'scythe', 'staff', 'pickaxe'];

describe('the Wildwood batch (DESIGN.md §2 The Wildwood batch)', () => {
  it('adds a hero (earth) and a villain (fire) T6 card per type and twelve Heirlooms', () => {
    expect(content.cards).toHaveLength(200);
    expect(ww).toHaveLength(34);
    expect(t6).toHaveLength(22);
    expect(heirlooms).toHaveLength(12);
    for (const t of content.items.types) {
      const mine = t6.filter((c) => c.item.kind === t.kind);
      expect(mine.map((c) => `${c.side}:${c.element}`).sort()).toEqual([
        'mythic:earth',
        'void:fire',
      ]);
    }
    const heirloomElements = (el: string) =>
      heirlooms
        .filter((c) => c.element === el)
        .map((c) => c.item.kind)
        .sort();
    expect(heirloomElements('earth')).toEqual([...EARTH_HEIRLOOMS].sort());
    expect(heirloomElements('fire')).toEqual([...FIRE_HEIRLOOMS].sort());
  });

  it('has two daggers among the Heirlooms, each with its own picture, tree and options', () => {
    const daggers = heirlooms.filter((c) => c.item.kind === 'dagger');
    expect(daggers.map((c) => c.heirloomName).sort()).toEqual(['Foxtail', 'Phoenixquill']);
    expect(daggers.filter((c) => c.pictureAlt)).toHaveLength(1);
    expect(
      cardTierArt(
        daggers.find((c) => c.pictureAlt)!,
        'heirloom',
      ),
    ).toContain('item-dagger-wildwood-heirloom-alt');
    expect(
      cardTierArt(
        daggers.find((c) => !c.pictureAlt)!,
        'heirloom',
      ),
    ).not.toContain('-alt');
    for (const c of heirlooms) {
      expect(c.heirloomName).toBe(c.name);
      expect(content.heirloomTreeByCard.has(c.id), c.id).toBe(true);
      expect(content.enhancements.cards[c.id], c.id).toBeTruthy();
      expect(
        heirloomCards(content).some((x) => x.id === c.id),
        c.id,
      ).toBe(true);
    }
    expect(heirloomCards(content)).toHaveLength(34);
  });

  it('puts the T6 cards in the Card Portal and the shard shop, never an Heirloom', () => {
    const pool = content.portals.find((p) => p.id === 'card_portal')!.pool;
    const ids = new Set(pool.map((e) => e.itemId));
    const shop = new Set(
      content.shardShop.map((e) => (e.reward.kind === 'card' ? e.reward.card : '')),
    );
    for (const c of t6) {
      expect(ids.has(c.id), c.id).toBe(true);
      expect(shop.has(c.id), c.id).toBe(true);
    }
    for (const c of heirlooms) expect(ids.has(c.id), c.id).toBe(false);
    // 53 Mythic and 58 Void entries, each tier's weights still add to the same chance
    expect(pool.filter((e) => e.rarity === 'mythic')).toHaveLength(53);
    expect(pool.filter((e) => e.rarity === 'void')).toHaveLength(58);
    const sum = (tier: string) =>
      pool.filter((e) => e.rarity === tier).reduce((a, e) => a + e.weight, 0);
    expect(sum('mythic')).toBeCloseTo(0.2, 5);
    expect(sum('void')).toBeCloseTo(0.1, 5);
  });

  it('shows its own picture and weapon name, and the kit of the batch', () => {
    expect(content.batchById.get('wildwood')?.kit).toBe('kit-t6-wildwood');
    expect(content.batchById.get('wildwood')?.backdrop).toBeUndefined();
    expect(sprite('kit-t6-wildwood')).toMatchObject({ w: 212, h: 256 });
    for (const c of t6) {
      const art = cardStyle(c) === 'void' ? 't6v' : 't6m';
      const name = `item-${c.item.kind}-wildwood-${art}`;
      expect(sprite(name), name).toBeTruthy();
      expect(cardTierArt(c, 'mythic'), c.id).toContain(name);
      expect(itemName(content, c.item.kind, 'mythic', c.side, c)).toBe(c.heirloomName);
      expect(cardTierArt(c, 'wood'), c.id).toBe(itemArt(c.item.kind, undefined, 'wood'));
    }
    for (const c of heirlooms) {
      const name = `item-${c.item.kind}-wildwood-heirloom${c.pictureAlt ? '-alt' : ''}`;
      expect(sprite(name), name).toBeTruthy();
      expect(cardTierArt(c, 'heirloom'), c.id).toContain(name);
      expect(cardItem(content, c.id)?.name).toBe(c.name);
    }
  });
});
