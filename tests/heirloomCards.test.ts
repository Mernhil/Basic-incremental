import { cardStyle } from '../src/data';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RARITIES, type Rarity } from '../src/data';
import { cardItem, itemName } from '../src/game';
import { cardTierArt, itemArt } from '../src/renderer/src/art/items';
import { sprite } from '../src/renderer/src/art/pixel/sprites';
import { content } from './helpers';

/** DESIGN §5 More weapons from the Heirloom candidates: 45 new Mythic and Void cards. */
interface Recolour {
  label: string;
  type: string;
  side: 'mythic' | 'void';
  letter: string;
  file: string;
  paletteName: string;
}
const recolours = JSON.parse(
  readFileSync(new URL('../design/heirloom-recolours.json', import.meta.url), 'utf8'),
) as Recolour[];

const withArt = content.cards.filter((c) => c.heirloomArt);
// The ladder cards: the 22 Heirloom cards are apart (DESIGN.md §5 Heirlooms).
const ladder = content.cards.filter((c) => !c.heirloom && !c.starterArt);
const byRarity = (r: Rarity) => ladder.filter((c) => cardStyle(c) === r);
const key = (r: { type: string; side: string; letter: string }) =>
  `${r.type}/${r.side}/${r.letter}`;

describe('the 45 Heirloom-candidate cards (DESIGN.md §5)', () => {
  it('takes the roster to 166: 53 Mythic, 58 Void, 11 of every other rarity (22 are Leviathan, 22 Wildwood)', () => {
    expect(ladder).toHaveLength(166);
    expect(ladder.filter((c) => c.batch === 'leviathan')).toHaveLength(22);
    expect(ladder.filter((c) => c.batch === 'wildwood')).toHaveLength(22);
    expect(withArt).toHaveLength(45);
    expect(withArt.filter((c) => cardStyle(c) === 'mythic')).toHaveLength(20);
    expect(withArt.filter((c) => cardStyle(c) === 'void')).toHaveLength(25);
    for (const r of RARITIES) {
      const want = r === 'mythic' ? 53 : r === 'void' ? 58 : 11;
      expect(byRarity(r), r).toHaveLength(want);
    }
  });

  it('has one card per recoloured picture: its item type, side and letter', () => {
    expect(recolours).toHaveLength(45);
    expect(
      withArt
        .map((c) => key({ type: c.item.kind, side: cardStyle(c), letter: c.heirloomArt! }))
        .sort(),
    ).toEqual(recolours.map(key).sort());
  });

  it('gives every new card its own card name and its own Heirloom name', () => {
    const cardNames = content.cards.map((c) => c.name.toLowerCase());
    expect(new Set(cardNames).size).toBe(cardNames.length);
    const original = content.items.types.map((t) => t.heirloom);
    const names = withArt.map((c) => c.heirloomName);
    for (const c of withArt) expect(c.heirloomName, c.id).toBeTruthy();
    const all = [...original, ...names].map((n) => n!.toLowerCase());
    expect(new Set(all).size).toBe(11 + 45);
    // tiles truncate long names
    for (const c of withArt) expect(c.name.length, c.name).toBeLessThanOrEqual(16);
  });

  it('keeps each new card at the power of its rarity peers: the type main ability, a comparable support', () => {
    for (const c of withArt) {
      const peer = content.cards.find(
        (p) => !p.heirloomArt && p.item.kind === c.item.kind && cardStyle(p) === cardStyle(c),
      )!;
      if (c.job === 'fighting' && peer.job === 'fighting') {
        expect(c.ability, c.id).toEqual(peer.ability);
        const damage = c.teamBonus.modifiers.find((m) => m.stat === 'combat.damage');
        expect(damage?.value.toString(), c.id).toBe('16');
        // the second bonus is worth the same as the peer's: one +12% line
        expect(c.teamBonus.modifiers, c.id).toHaveLength(2);
        expect(c.teamBonus.modifiers[1]!.value.toString(), c.id).toBe('10');
      } else if (c.job !== 'fighting' && peer.job !== 'fighting') {
        expect(c.worker, c.id).toEqual(peer.worker);
      }
    }
  });

  it('varies elements, and gives a few cards a different support', () => {
    for (const rarity of ['mythic', 'void'] as const) {
      const elements = new Set(
        withArt.filter((c) => cardStyle(c) === rarity).map((c) => c.element),
      );
      expect(elements.size, rarity).toBeGreaterThanOrEqual(4);
    }
    const supports = new Set(
      withArt.flatMap((c) => (c.job === 'fighting' ? [c.teamBonus.description] : [])),
    );
    expect(supports.size).toBeGreaterThanOrEqual(3);
  });

  it('puts every card in the Card Portal at its rarity, a rarity keeping its whole chance split equally', () => {
    const portal = content.portals.find((p) => p.id === 'card_portal')!;
    expect(portal.pool).toHaveLength(166);
    expect(new Set(portal.pool.map((e) => e.itemId)).size).toBe(166);
    const total: Record<string, number> = {
      common: 53.2,
      uncommon: 28,
      rare: 13,
      epic: 4,
      legendary: 1.5,
      mythic: 0.2,
      void: 0.1,
    };
    for (const r of RARITIES) {
      const entries = portal.pool.filter((e) => e.rarity === r);
      expect(entries.map((e) => e.itemId).sort(), r).toEqual(
        byRarity(r)
          .map((c) => c.id)
          .sort(),
      );
      const sum = entries.reduce((a, e) => a + e.weight, 0);
      expect(sum, r).toBeCloseTo(total[r]!, 3);
      for (const e of entries) expect(e.weight, r).toBeCloseTo(sum / entries.length, 5);
    }
  });

  it('sells a copy of every card in the shard shop, Mythic and Void at the same price', () => {
    for (const c of withArt) {
      const item = content.shardShop.find((i) => i.id === `copy_${c.id}`);
      expect(item, c.id).toBeTruthy();
      expect(item!.price, c.id).toBe(300);
    }
    for (const c of ladder) {
      expect(
        content.shardShop.some((i) => i.reward.kind === 'card' && i.reward.card === c.id),
      ).toBe(true);
    }
  });

  it('names the weapon after the card at Mythic or Void and as its Heirloom', () => {
    const card = withArt[0]!;
    const type = content.itemTypeByKind.get(card.item.kind)!;
    expect(itemName(content, card.item.kind, 'heirloom', card.side, card)).toBe(card.heirloomName);
    expect(itemName(content, card.item.kind, 'heirloom', card.side)).toBe(type.heirloom);
    // its own weapon at Mythic or Void; Wood to Prismatic are the type's one model
    expect(itemName(content, card.item.kind, 'mythic', card.side, card)).toBe(card.heirloomName);
    expect(itemName(content, card.item.kind, 'wood', card.side, card)).toBe(
      itemName(content, card.item.kind, 'wood', card.side),
    );
    expect(itemName(content, card.item.kind, 'prismatic', card.side, card)).toBe(
      itemName(content, card.item.kind, 'prismatic', card.side),
    );
    expect(itemName(content, card.item.kind, 'mythic', card.side)).toBe(
      type[card.side === 'void' ? 'void' : 'mythic'],
    );
    // the card's item is its own weapon: a T6 card is never at another tier
    expect(cardItem(content, card.id)?.name).toBe(card.heirloomName);
    // a T6 card without the field has its type's T6 name for its side
    expect(cardItem(content, 'dawn_champion')?.name).toBe('Mythic Light Sword');
  });

  it('shows each new card its own Heirloom picture, and an old card the type original', () => {
    for (const c of withArt) {
      const side = cardStyle(c) === 'void' ? 'hv' : 'hm';
      const name = `item-${c.item.kind}-${side}-${c.heirloomArt}`;
      expect(sprite(name), name).toBeTruthy();
      const art = cardTierArt(c, 'heirloom');
      expect(art, c.id).toContain(name);
      expect(art, c.id).not.toBe(itemArt(c.item.kind, undefined, 'heirloom', c.side));
      // at Mythic or Void it shows the same picture; Wood to Prismatic are the type's one model
      expect(cardTierArt(c, 'mythic')).toBe(art);
      for (const t of ['wood', 'bronze', 'silver', 'gold', 'prismatic'] as const)
        expect(cardTierArt(c, t), `${c.id} ${t}`).toBe(itemArt(c.item.kind, undefined, t));
    }
    const plain = content.cards.find((c) => c.id === 'dawn_champion')!;
    expect(cardTierArt(plain, 'heirloom')).toBe(itemArt('sword', 'mythic', 'heirloom', 'mythic'));
  });
});
