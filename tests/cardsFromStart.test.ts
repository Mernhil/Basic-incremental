import { describe, expect, it } from 'vitest';
import { RANK_TIERS, RARITIES, loadContent } from '../src/data';
import {
  addCard,
  ascend,
  buyShardItem,
  cardBaseDamage,
  cardItem,
  cardTopTier,
  createInitialState,
  createSaveText,
  Decimal,
  lookTier,
  newOwnedCard,
  readSave,
  RARITY_TIER_CAP,
  starDustCost,
  starFillNeeded,
  starUp,
  starUpWithDust,
  tierUp,
} from '../src/game';

// The shipped content, not the pinned test content: these are the rules of "Cards from the start".
const content = loadContent();
const fresh = () => createInitialState(content);

describe('every card starts at Wood ★1 (DESIGN.md §5 Stars)', () => {
  it('a new card of any rarity arrives at ★1 with an empty bar and its wooden weapon', () => {
    for (const card of content.cards) {
      if (fresh().cards.owned[card.id]) continue;
      const got = addCard(fresh(), content, card.id)!;
      const owned = got.state.cards.owned[card.id]!;
      expect(owned, card.id).toMatchObject({ tier: 'wood', stars: 1, starFill: 0 });
    }
    const mythic = addCard(fresh(), content, 'seraph_lancer')!.state.cards.owned['seraph_lancer']!;
    expect(cardItem(content, 'seraph_lancer', mythic)).toMatchObject({
      name: 'Wooden Lance',
      heirloom: false,
    });
  });

  it('the look follows the tier, for every rarity, Gold included', () => {
    for (const rarity of RARITIES) {
      for (const tier of RANK_TIERS) expect(lookTier(rarity, tier)).toBe(tier);
    }
    const owned = { ...newOwnedCard(), tier: 'gold' as const };
    expect(cardItem(content, 'storm_duelist', owned)!.name).toBe('Golden Dagger');
  });

  it('a tier-up restarts at ★1, with no free stars at any rarity', () => {
    const state = fresh();
    state.cards.owned['grove_keeper'] = { ...newOwnedCard(), stars: 6, level: 20 };
    for (const id of Object.keys(state.resources)) state.resources[id] = new Decimal(1e12);
    const result = tierUp(state, content, 'grove_keeper');
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.cards.owned['grove_keeper']).toMatchObject({
      tier: 'bronze',
      stars: 1,
      starFill: 0,
    });
  });

  it('a save keeps the stars its cards already have, free or not', () => {
    const state = fresh();
    state.cards.owned['grove_keeper'] = { ...newOwnedCard(), stars: 2 };
    state.cards.owned['seraph_lancer'] = { ...newOwnedCard(), stars: 6 };
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cards.owned['grove_keeper']!.stars).toBe(2);
    expect(loaded.cards.owned['seraph_lancer']!.stars).toBe(6);
  });
});

describe('the star bar by rarity and tier (DESIGN.md §5)', () => {
  it('costs a whole copy at the card top tier and less below it, rising by tier', () => {
    for (const card of content.cards) {
      const top = cardTopTier(content, card.id);
      const cap = RARITY_TIER_CAP[card.rarity];
      const needs = content.cardRules.starBar.needs[card.rarity];
      expect(needs[cap], card.id).toBe(1);
      expect(needs[top], card.id).toBe(1);
      const upTo = RANK_TIERS.slice(0, RANK_TIERS.indexOf(cap) + 1);
      upTo.forEach((tier, i) => {
        if (i > 0) expect(needs[tier]).toBeGreaterThanOrEqual(needs[upTo[i - 1]!]);
        if (tier !== cap) expect(needs[tier], `${card.rarity} ${tier}`).toBeLessThan(1);
      });
    }
  });

  it('a copy fills the bar by the tier cost and the rest carries to the next star', () => {
    const rare = addCard(fresh(), content, 'grove_keeper')!.state; // Rare at Wood: a fraction
    const need = starFillNeeded(content, 'rare', 1, 'wood')!;
    expect(need).toBeLessThan(1);
    const copy = addCard(rare, content, 'grove_keeper')!;
    expect(copy.state.cards.owned['grove_keeper']!.starFill).toBe(1);
    const up = starUp(copy.state, content, 'grove_keeper');
    if (!up.ok) throw new Error(up.reason);
    expect(up.state.cards.owned['grove_keeper']).toMatchObject({ stars: 2, starFill: 1 - need });
  });

  it('a Common at its top tier still needs a whole copy per star', () => {
    const state = addCard(fresh(), content, 'rusty_brute')!.state;
    expect(starUp(state, content, 'rusty_brute')).toEqual({ ok: false, reason: 'requirements' });
    const copy = addCard(state, content, 'rusty_brute')!.state;
    const up = starUp(copy, content, 'rusty_brute');
    expect(up.ok && up.state.cards.owned['rusty_brute']!.stars).toBe(2);
  });
});

describe('star dust (DESIGN.md §5)', () => {
  const withCard = (fill: number, dust: number) => {
    const state = addCard(fresh(), content, 'grove_keeper')!.state;
    // Bronze: a Rare's Wood star costs under one dust, so halving its fill would not show.
    state.cards.owned['grove_keeper']!.tier = 'bronze';
    state.cards.owned['grove_keeper']!.starFill = fill;
    state.resources['star_dust'] = new Decimal(dust);
    return state;
  };

  it('prices the missing part of a star by rarity and tier, and tops it up', () => {
    const state = withCard(0, 1000);
    const price = starDustCost(state, content, 'grove_keeper')!;
    expect(price).toBeGreaterThan(0);
    const half = withCard(starFillNeeded(content, 'rare', 1, 'bronze')! / 2, 1000);
    expect(starDustCost(half, content, 'grove_keeper')!).toBeLessThan(price);
    const up = starUpWithDust(state, content, 'grove_keeper');
    if (!up.ok) throw new Error(up.reason);
    expect(up.state.cards.owned['grove_keeper']).toMatchObject({ stars: 2, starFill: 0 });
    expect(up.state.resources['star_dust']!.toNumber()).toBe(1000 - price);
    expect(state.resources['star_dust']!.toNumber()).toBe(1000); // pure
  });

  it('costs more dust for a higher rarity and a higher tier', () => {
    const dust = content.cardRules.starBar.dust;
    expect(dust.epic.wood).toBeGreaterThan(dust.rare.wood);
    expect(dust.rare.silver).toBeGreaterThan(dust.rare.wood);
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

describe('rarity ratios (DESIGN.md §5 Base damage)', () => {
  it('base damage and health follow 1 / 1.49 / 2.18 / 3.24 / 5.2 / 8.22', () => {
    const ratios = [1, 1.49, 2.18, 3.24, 5.2, 8.22];
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
    const rules = content.cardRules;
    order.forEach((r, i) => {
      expect(rules.baseDamage[r].div(rules.baseDamage.common).toNumber()).toBeCloseTo(ratios[i]!);
      expect(rules.health[r].div(rules.health.common).toNumber()).toBeCloseTo(ratios[i]!);
    });
    expect(rules.baseDamage.void.eq(rules.baseDamage.mythic)).toBe(true);
    expect(cardBaseDamage(content, 'ember_squire', newOwnedCard()).toNumber()).toBe(7.6);
  });
});

describe('the shard shop sells copies of every card (DESIGN.md §5)', () => {
  it('has one entry per card, priced by rarity, rising steeply', () => {
    const price = new Map<string, number>();
    for (const card of content.cards) {
      const items = content.shardShop.filter(
        (i) => i.reward.kind === 'card' && i.reward.card === card.id,
      );
      expect(items, card.id).toHaveLength(1);
      expect(items[0]!.stock).toBeNull();
      const known = price.get(card.rarity);
      if (known !== undefined) expect(items[0]!.price, card.id).toBe(known);
      price.set(card.rarity, items[0]!.price);
    }
    const order = RARITIES.map((r) => price.get(r)!);
    expect(order.every((p, i) => i === 0 || p >= order[i - 1]!)).toBe(true);
    expect(price.get('void')).toBe(price.get('mythic'));
    expect(price.get('legendary')! / price.get('common')!).toBeGreaterThanOrEqual(10);
  });

  it('a bought copy of a Mythic fills its bar', () => {
    const state = addCard(fresh(), content, 'seraph_lancer')!.state;
    state.cards.shards = 100000;
    const bought = buyShardItem(state, content, 'copy_seraph_lancer');
    if (!bought.ok) throw new Error(bought.reason);
    expect(bought.state.cards.owned['seraph_lancer']!.starFill).toBe(1);
  });
});
