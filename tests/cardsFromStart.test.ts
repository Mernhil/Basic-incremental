import { describe, expect, it } from 'vitest';
import { CARD_GRADES, RANK_TIERS, cardGrade, loadContent } from '../src/data';
import {
  addCard,
  ascend,
  buyShardItem,
  cardBaseDamage,
  cardDisplayName,
  cardItem,
  cardTier,
  createInitialState,
  createSaveText,
  Decimal,
  levelCap,
  newOwnedCard,
  readSave,
  starDustCost,
  starFillNeeded,
  starUpWithDust,
} from '../src/game';

// The shipped content, not the pinned test content: these are the rules of the roster by tier
// (DESIGN.md §5 Roster, No tier-ups).
const content = loadContent();
const fresh = () => createInitialState(content);

describe('a card arrives at its own tier and stays there (DESIGN.md §5 No tier-ups)', () => {
  it('a pulled card of any tier arrives at that tier, ★1, Lv 1, with an empty bar', () => {
    const cases = [
      ['ember_squire', 'wood', 20, 'Wooden Sword'],
      ['brass_vanguard', 'bronze', 40, 'Bronze Sword'],
      ['silver_cavalier', 'silver', 60, 'Silver Sword'],
      ['gilded_knight', 'gold', 80, 'Golden Sword'],
      ['prism_paladin', 'prismatic', 100, 'Prismatic Sword'],
      ['dawn_champion', 'mythic', 120, 'Mythic Light Sword'],
    ] as const;
    for (const [id, tier, cap, name] of cases) {
      const state = fresh();
      delete state.cards.owned[id];
      const owned = addCard(state, content, id)!.state.cards.owned[id]!;
      expect(owned, id).toMatchObject({ tier, stars: 1, level: 1, starFill: 0 });
      expect(levelCap(content, { tier: owned.tier, stars: owned.stars }), id).toBe(cap);
      const card = content.cardById.get(id)!;
      expect(cardTier(content, id)).toBe(tier);
      expect(cardDisplayName(content, card)).toBe(name);
      expect(cardItem(content, id)!.name).toBe(name);
    }
  });

  it('the five swords from Wood to Prismatic are five cards, one per tier', () => {
    for (const kind of content.items.types.map((t) => t.kind)) {
      for (const tier of RANK_TIERS.slice(0, 5)) {
        const cards = content.cards.filter((c) => c.item.kind === kind && c.tier === tier);
        expect(cards, `${kind} ${tier}`).toHaveLength(1);
      }
    }
    expect(content.cards.filter((c) => c.tier === 'mythic')).toHaveLength(89);
    expect(content.cards.filter((c) => c.tier === 'heirloom')).toHaveLength(22);
    expect(content.cards).toHaveLength(166);
  });

  it('only T6 and Heirloom cards have a side, and the grade is the tier or that side', () => {
    for (const card of content.cards) {
      const top = card.tier === 'mythic' || card.tier === 'heirloom';
      expect(card.side !== undefined, card.id).toBe(top);
      expect(CARD_GRADES).toContain(cardGrade(card));
      expect(cardGrade(card)).toBe(top ? card.side : card.tier);
    }
  });

  it('every name is unique: no two cards share a weapon name', () => {
    const names = content.cards.map((c) => cardDisplayName(content, c));
    expect(new Set(names).size).toBe(names.length);
  });

  it('a copy never changes the tier: it fills the star bar', () => {
    let state = addCard(fresh(), content, 'silver_cavalier')!.state;
    for (let i = 0; i < 3; i++) state = addCard(state, content, 'silver_cavalier')!.state;
    expect(state.cards.owned['silver_cavalier']).toMatchObject({ tier: 'silver', starFill: 3 });
  });

  it('a save keeps the stars its cards have and reads the tier from the card', () => {
    const state = fresh();
    state.cards.owned['grove_keeper'] = { ...newOwnedCard('silver'), stars: 2 };
    state.cards.owned['seraph_lancer'] = { ...newOwnedCard('mythic'), stars: 6 };
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cards.owned['grove_keeper']).toMatchObject({ tier: 'silver', stars: 2 });
    expect(loaded.cards.owned['seraph_lancer']).toMatchObject({ tier: 'mythic', stars: 6 });
  });
});

describe('the star bar: one copy a star at every tier (DESIGN.md §5)', () => {
  it('asks one copy from ★1 to ★5 at every tier, none at ★6 or for an Heirloom', () => {
    for (const tier of RANK_TIERS) {
      for (let stars = 1; stars <= 6; stars++) {
        const want = stars >= 6 || tier === 'heirloom' ? null : 1;
        expect(starFillNeeded({ tier }, stars), `${tier} ★${stars}`).toBe(want);
      }
    }
  });
});

describe('star dust (DESIGN.md §5)', () => {
  const withCard = (fill: number, dust: number) => {
    const state = addCard(fresh(), content, 'grove_keeper')!.state;
    state.cards.owned['grove_keeper']!.starFill = fill;
    state.resources['star_dust'] = new Decimal(dust);
    return state;
  };

  it('prices the missing part of a star by the tier, and tops it up', () => {
    const state = withCard(0, 1000);
    const price = starDustCost(state, content, 'grove_keeper')!;
    expect(price).toBe(content.cardRules.starBar.dust.silver);
    expect(starDustCost(withCard(0.5, 1000), content, 'grove_keeper')!).toBe(Math.ceil(price / 2));
    const up = starUpWithDust(state, content, 'grove_keeper');
    if (!up.ok) throw new Error(up.reason);
    expect(up.state.cards.owned['grove_keeper']).toMatchObject({ stars: 2, starFill: 0 });
    expect(up.state.resources['star_dust']!.toNumber()).toBe(1000 - price);
    expect(state.resources['star_dust']!.toNumber()).toBe(1000); // pure
  });

  it('costs more dust for a higher tier, up to Prismatic', () => {
    const dust = content.cardRules.starBar.dust;
    const order = [dust.wood, dust.bronze, dust.silver, dust.gold, dust.prismatic];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(5);
    expect(dust.mythic).toBeGreaterThan(dust.prismatic);
  });

  it('is refused when there is too little dust, and takes none when the bar is full', () => {
    const poor = withCard(0, 0);
    expect(starUpWithDust(poor, content, 'grove_keeper')).toEqual({
      ok: false,
      reason: 'requirements',
    });
    const full = withCard(1, 0);
    expect(starDustCost(full, content, 'grove_keeper')).toBe(0);
    expect(starUpWithDust(full, content, 'grove_keeper').ok).toBe(true);
  });

  it('survives an Ascension: it belongs to the collection', () => {
    expect(content.resourceById.get('star_dust')!.keptOnAscend).toBe(true);
    const state = fresh();
    state.resources['star_dust'] = new Decimal(42);
    state.mastery.harvested['oak_gem'] = new Decimal(1e14);
    const result = ascend(state, content);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.resources['star_dust']!.toNumber()).toBe(42);
  });
});

describe('tier ratios (DESIGN.md §5 Base damage)', () => {
  it('base damage and health follow 1 / 1.49 / 2.18 / 3.24 / 5.2 / 8.22 from Wood to T6', () => {
    const ratios = [1, 1.49, 2.18, 3.24, 5.2, 8.22];
    const order = ['wood', 'bronze', 'silver', 'gold', 'prismatic', 'mythic'] as const;
    const rules = content.cardRules;
    order.forEach((r, i) => {
      expect(rules.baseDamage[r].div(rules.baseDamage.wood).toNumber()).toBeCloseTo(ratios[i]!);
      expect(rules.health[r].div(rules.health.wood).toNumber()).toBeCloseTo(ratios[i]!);
    });
    expect(cardBaseDamage(content, 'ember_squire', newOwnedCard()).toNumber()).toBe(7.6);
  });

  it('a fresh card of a higher tier beats a fresh card of the tier below', () => {
    const ids = [
      'ember_squire',
      'brass_vanguard',
      'silver_cavalier',
      'gilded_knight',
      'prism_paladin',
      'dawn_champion',
    ];
    const dmg = ids.map((id) =>
      cardBaseDamage(content, id, newOwnedCard(cardTier(content, id))).toNumber(),
    );
    for (let i = 1; i < dmg.length; i++) expect(dmg[i]!, ids[i]).toBeGreaterThan(dmg[i - 1]!);
  });
});

describe('the shard shop sells copies of every card (DESIGN.md §5)', () => {
  it('has one entry per card, priced by its tier, rising steeply', () => {
    const price = new Map<string, number>();
    for (const card of content.cards.filter((c) => !c.heirloom)) {
      const items = content.shardShop.filter(
        (i) => i.reward.kind === 'card' && i.reward.card === card.id,
      );
      expect(items, card.id).toHaveLength(1);
      expect(items[0]!.stock).toBeNull();
      const known = price.get(card.tier);
      if (known !== undefined) expect(items[0]!.price, card.id).toBe(known);
      price.set(card.tier, items[0]!.price);
    }
    const order = RANK_TIERS.slice(0, 6).map((r) => price.get(r)!);
    expect(order.every((p, i) => i === 0 || p >= order[i - 1]!)).toBe(true);
    expect(price.get('prismatic')! / price.get('wood')!).toBeGreaterThanOrEqual(10);
  });

  it('a bought copy of a T6 card fills its bar', () => {
    const state = addCard(fresh(), content, 'seraph_lancer')!.state;
    state.cards.shards = 100000;
    const bought = buyShardItem(state, content, 'copy_seraph_lancer');
    if (!bought.ok) throw new Error(bought.reason);
    expect(bought.state.cards.owned['seraph_lancer']!.starFill).toBe(1);
  });
});
