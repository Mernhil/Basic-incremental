import { cardStyle } from '../src/data';
import { describe, expect, it } from 'vitest';
import { cardItem, itemName } from '../src/game';
import { cardTierArt, itemArt } from '../src/renderer/src/art/items';
import { sprite } from '../src/renderer/src/art/pixel/sprites';
import { content } from './helpers';

/** DESIGN §5 Art batches: batch 2 (Leviathan) adds 22 T6 cards and 11 Heirlooms next to the Dragon ones. */
const lev = content.cards.filter((c) => c.batch === 'leviathan');
const t6 = lev.filter((c) => !c.heirloom);
const heirlooms = lev.filter((c) => c.heirloom);

describe('the Leviathan batch (DESIGN.md §5 Art batches)', () => {
  it('adds a Mythic and a Void T6 card and one Heirloom per weapon type', () => {
    expect(t6).toHaveLength(22);
    expect(heirlooms).toHaveLength(11);
    for (const t of content.items.types) {
      expect(
        t6
          .filter((c) => c.item.kind === t.kind)
          .map((c) => cardStyle(c))
          .sort(),
      ).toEqual(['mythic', 'void']);
      expect(heirlooms.filter((c) => c.item.kind === t.kind)).toHaveLength(1);
    }
    for (const c of heirlooms) expect(['mythic', 'void']).toContain(cardStyle(c));
  });

  it('names every weapon and card on its own, and has an Heirloom tree and options for each Heirloom', () => {
    const names = [
      ...content.cards.map((c) => c.name),
      ...content.cards.filter((c) => !c.heirloom && c.heirloomName).map((c) => c.heirloomName!),
    ];
    const lower = names.map((n) => n.toLowerCase());
    // no weapon name equals another card or weapon name
    expect(new Set(lower).size).toBe(lower.length);
    for (const c of heirlooms) {
      expect(c.heirloomName).toBe(c.name);
      expect(content.heirloomTreeByCard.has(c.id), c.id).toBe(true);
      expect(content.enhancements.cards[c.id], c.id).toBeTruthy();
    }
    for (const c of t6) expect(c.name.length, c.name).toBeLessThanOrEqual(16);
  });

  it('puts the T6 cards in the Card Portal and the shard shop, and never an Heirloom', () => {
    const pool = new Set(
      content.portals.find((p) => p.id === 'card_portal')!.pool.map((e) => e.itemId),
    );
    const shop = new Set(
      content.shardShop.map((e) => (e.reward.kind === 'card' ? e.reward.card : '')),
    );
    for (const c of t6) {
      expect(pool.has(c.id), c.id).toBe(true);
      expect(shop.has(c.id), c.id).toBe(true);
    }
    for (const c of heirlooms) {
      expect(pool.has(c.id), c.id).toBe(false);
      expect(shop.has(c.id), c.id).toBe(false);
    }
  });

  it('shows its own picture and weapon name at T6, and the type model below', () => {
    for (const c of t6) {
      const art = cardStyle(c) === 'void' ? 't6v' : 't6m';
      const name = `item-${c.item.kind}-leviathan-${art}`;
      expect(sprite(name), name).toBeTruthy();
      expect(cardTierArt(c, 'mythic'), c.id).toContain(name);
      expect(itemName(content, c.item.kind, 'mythic', c.side, c)).toBe(c.heirloomName);
      for (const tier of ['wood', 'bronze', 'silver', 'gold', 'prismatic'] as const) {
        expect(cardTierArt(c, tier), `${c.id} ${tier}`).toBe(itemArt(c.item.kind, undefined, tier));
        expect(itemName(content, c.item.kind, tier, c.side, c)).toBe(
          itemName(content, c.item.kind, tier, c.side),
        );
      }
    }
  });

  it('shows each Heirloom its own picture and name', () => {
    for (const c of heirlooms) {
      const name = `item-${c.item.kind}-leviathan-heirloom`;
      expect(sprite(name), name).toBeTruthy();
      expect(cardTierArt(c, 'heirloom'), c.id).toContain(name);
      expect(cardItem(content, c.id)?.name).toBe(c.name);
    }
  });
});
