import { describe, expect, it } from 'vitest';
import { RANK_TIERS, RARITIES } from '../src/data';
import {
  addCard,
  buyShardItem,
  cardBaseDamage,
  cardHealth,
  cardInfo,
  cardItem,
  cardTopTier,
  createSaveText,
  Decimal,
  levelCap,
  newOwnedCard,
  readSave,
  starFillNeeded,
  starUp,
  starUpCheck,
  tierUp,
  tierUpCheck,
  tierUpCost,
  weaponLookRarity,
  type CardResult,
  type GameState,
  type OwnedCard,
} from '../src/game';
import { content, freshState } from './helpers';

function ok(result: CardResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}

function own(state: GameState, id: string, card: Partial<OwnedCard> = {}): GameState {
  state.cards.owned[id] = { ...newOwnedCard(), ...card };
  return state;
}

function give(state: GameState, resource: string, amount: number | string): GameState {
  state.resources[resource] = new Decimal(amount);
  return state;
}

/** Gives enough of everything a tier-up costs (5 more than needed). */
function fund(state: GameState, id: string): GameState {
  const card = content.cardById.get(id)!;
  for (const c of tierUpCost(content, card, state.cards.owned[id]!)) {
    give(state, c.resource, c.amount.add(5).toString());
  }
  return state;
}

/** Copies a Common needs for the star after `stars` (cardRules.json). */
const commonNeed = (stars: number): number => content.cardRules.starBar.needs.common[stars - 1]!;

describe('the star bar (DESIGN.md §5)', () => {
  it('needs the copies of the table for ★2 to ★6, per rarity', () => {
    // The table itself is tuning (cardRules.json); the rules are its shape: every star takes at
    // least as many copies as the one before for Commons, totals fall with rarity, and the top
    // rarities need only a few copies.
    const totals: Record<string, number> = {};
    for (const rarity of RARITIES) {
      const copies = [1, 2, 3, 4, 5].map(
        (stars) =>
          starFillNeeded(content, rarity, stars)! /
          content.cardRules.starBar.fillPerDuplicate[rarity],
      );
      expect(copies, rarity).toEqual(content.cardRules.starBar.needs[rarity]);
      totals[rarity] = copies.reduce((x, y) => x + y, 0);
    }
    const common = content.cardRules.starBar.needs.common;
    expect(common.every((n, i) => i === 0 || n >= common[i - 1]!)).toBe(true);
    expect(totals['common']).toBeGreaterThanOrEqual(10);
    const order = RARITIES.map((r) => totals[r]!);
    expect(order.every((n, i) => i === 0 || n <= order[i - 1]!)).toBe(true);
    expect(totals['void']).toBeLessThanOrEqual(3);
    expect(starFillNeeded(content, 'common', 6)).toBeNull();
  });

  it('fills by the rarity of each duplicate and keeps the fill on the card', () => {
    let result = addCard(freshState(), content, 'ember_squire')!;
    expect(result.gain).toEqual({ kind: 'duplicate', duplicates: 1 });
    result = addCard(result.state, content, 'ember_squire')!;
    expect(result.state.cards.owned['ember_squire']!.starFill).toBe(2);
    const view = cardInfo(result.state, content, 'ember_squire')!.starBar!;
    expect(view).toMatchObject({ fill: 2, need: commonNeed(1), ready: true });
    expect(view.gauge).toBe(1);
  });

  it('shows a gauge between 0 and 1 and no bar at ★6 or for a card not owned', () => {
    const state = own(freshState(), 'ember_squire', { stars: 3, starFill: 1 });
    expect(cardInfo(state, content, 'ember_squire')!.starBar).toMatchObject({
      fill: 1,
      need: commonNeed(3),
      gauge: 1 / commonNeed(3),
      ready: false,
    });
    own(state, 'shield_warden', { stars: 6 });
    expect(cardInfo(state, content, 'shield_warden')!.starBar).toBeNull();
    expect(cardInfo(state, content, 'storm_duelist')!.starBar).toBeNull();
  });

  it('makes a star-up cost only the fill: no level cap, no Core, gems or Money', () => {
    const state = own(freshState(), 'ember_squire', { level: 1, starFill: commonNeed(1) });
    const check = starUpCheck(state, content, 'ember_squire')!;
    expect(check.to).toEqual({ tier: 'bronze', stars: 2 });
    expect(check.requirements.map((r) => r.kind)).toEqual(['starFill']);
    expect(check.met).toBe(true);
    const money = state.resources['money']!;
    const after = ok(starUp(state, content, 'ember_squire'));
    expect(after.cards.owned['ember_squire']).toMatchObject({ stars: 2, level: 1, starFill: 0 });
    expect(after.resources['money']!.eq(money)).toBe(true);
    expect(state.cards.owned['ember_squire']!.stars).toBe(1); // pure
  });

  it('refuses a star-up while the bar is short and carries the leftover over', () => {
    const state = own(freshState(), 'ember_squire', { starFill: commonNeed(1) - 1 });
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
    own(state, 'ember_squire', { starFill: commonNeed(1) + 3 });
    const once = ok(starUp(state, content, 'ember_squire'));
    expect(once.cards.owned['ember_squire']).toMatchObject({ stars: 2, starFill: 3 });
  });

  it('lets a star with no copies to pay (Legendary ★2 to ★3) be taken at once', () => {
    const state = own(freshState(), 'dawnblade_regent', { stars: 2, starFill: 0 });
    expect(starUpCheck(state, content, 'dawnblade_regent')!.met).toBe(true);
    expect(
      ok(starUp(state, content, 'dawnblade_regent')).cards.owned['dawnblade_regent'],
    ).toMatchObject({ stars: 3 });
  });

  it('has no star-up at ★6', () => {
    const state = own(freshState(), 'ember_squire', { stars: 6 });
    expect(starUpCheck(state, content, 'ember_squire')).toMatchObject({ available: false });
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('copies past ★6 become shards', () => {
  it('turns a copy of a ★6 card into shards at any tier', () => {
    for (const tier of ['bronze', 'gold'] as const) {
      const state = own(freshState(), 'dawnblade_regent', { tier, stars: 6 });
      const result = addCard(state, content, 'dawnblade_regent')!;
      expect(result.gain).toEqual({ kind: 'shards', shards: 8 }); // Legendary
      expect(result.state.cards.shards).toBe(8);
      expect(result.state.cards.owned['dawnblade_regent']!.starFill).toBe(0);
    }
  });

  it('turns a copy into shards once the bar already holds every star left to ★6', () => {
    // Exotic ★4 -> ★5 is the only star left that needs a copy (table: 1, 0, 0, 1, 0).
    const state = own(freshState(), 'core_titan', { stars: 4, starFill: 1 });
    const result = addCard(state, content, 'core_titan')!;
    expect(result.gain).toEqual({ kind: 'shards', shards: 25 });
    expect(result.state.cards.owned['core_titan']!.starFill).toBe(1);
    const empty = own(freshState(), 'core_titan', { stars: 4, starFill: 0 });
    expect(addCard(empty, content, 'core_titan')!.gain).toEqual({
      kind: 'duplicate',
      duplicates: 1,
    });
  });

  it('fills the bar with a copy bought in the shard shop, like any duplicate', () => {
    const state = freshState();
    state.cards.shards = 100;
    const bought = buyShardItem(state, content, 'copy_ember_squire');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.state.cards.owned['ember_squire']!.starFill).toBe(1);
    expect(bought.gain).toEqual({ kind: 'duplicate', duplicates: 1 });
  });
});

describe('star impact on base stats', () => {
  it('multiplies base damage and health by x1.25 / 1.6 / 2 / 2.6 / 3.5 at ★2 to ★6', () => {
    const base = cardBaseDamage(content, 'ember_squire', newOwnedCard());
    const health = cardHealth(content, 'ember_squire', newOwnedCard());
    expect(content.cardRules.power.starMultiplier).toEqual([1.25, 1.6, 2, 2.6, 3.5]);
    [1, 1.25, 1.6, 2, 2.6, 3.5].forEach((mult, i) => {
      const owned = { ...newOwnedCard(), stars: i + 1 };
      expect(cardBaseDamage(content, 'ember_squire', owned).div(base).toNumber()).toBeCloseTo(mult);
      expect(cardHealth(content, 'ember_squire', owned).div(health).toNumber()).toBeCloseTo(mult);
    });
  });

  it('makes a maxed Common equal a fresh Legendary in base health', () => {
    const maxed = cardHealth(content, 'ember_squire', { ...newOwnedCard(), stars: 6 });
    const legendary = cardHealth(content, 'dawnblade_regent', newOwnedCard());
    expect(maxed.eq(legendary)).toBe(true);
  });
});

describe('tier-up at max level, paid with Money (DESIGN.md §5)', () => {
  it('needs the level cap, Money, the tier Core and gems, but not ★6', () => {
    const state = own(freshState(), 'ember_squire', { stars: 2, level: 20 });
    const check = tierUpCheck(state, content, 'ember_squire')!;
    expect(check.available).toBe(true);
    expect(check.to).toEqual({ tier: 'silver', stars: 2 });
    expect(check.requirements.map((r) => r.kind)).not.toContain('starFill');
    const resources = check.requirements.flatMap((r) => r.resource ?? []);
    expect(resources).toEqual(['money', 'moss_core', 'iron_gem', 'ironbark_gem']);
    expect(check.requirements[0]).toMatchObject({ kind: 'level', met: true });
  });

  it('refuses below the level cap and with missing Money', () => {
    const low = fund(own(freshState(), 'ember_squire', { level: 19 }), 'ember_squire');
    expect(tierUp(low, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
    const poor = fund(own(freshState(), 'ember_squire', { level: 20 }), 'ember_squire');
    give(poor, 'money', 0);
    expect(tierUp(poor, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
  });

  it('pays Money and materials and keeps stars, star fill, level and XP', () => {
    const state = fund(
      own(freshState(), 'ember_squire', { stars: 3, starFill: 2, level: 20 }),
      'ember_squire',
    );
    const costs = tierUpCost(
      content,
      content.cardById.get('ember_squire')!,
      state.cards.owned['ember_squire']!,
    );
    const money = costs.find((c) => c.resource === 'money')!;
    expect(money.amount.gt(0)).toBe(true);
    const after = ok(tierUp(state, content, 'ember_squire'));
    expect(after.cards.owned['ember_squire']).toMatchObject({
      tier: 'silver',
      stars: 3,
      starFill: 2,
      level: 20,
    });
    for (const c of costs) expect(after.resources[c.resource]!.eq(5)).toBe(true);
  });

  it('keeps stars through every tier on the way up', () => {
    let state = own(freshState(), 'ember_squire', { stars: 4 });
    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      state.cards.owned['ember_squire']!.level = levelCap(content, { tier, stars: 4 });
      state = ok(tierUp(fund(state, 'ember_squire'), content, 'ember_squire'));
      expect(state.cards.owned['ember_squire']!.stars).toBe(4);
    }
    expect(state.cards.owned['ember_squire']!.tier).toBe('prismatic');
  });

  it('asks Frost Sigils on Gold to Prismatic', () => {
    const state = own(freshState(), 'ember_squire', { tier: 'gold', level: 60 });
    const resources = tierUpCheck(state, content, 'ember_squire')!.requirements.flatMap(
      (r) => r.resource ?? [],
    );
    expect(resources).toContain('frost_sigil');
    expect(resources).toContain('money');
  });

  it('prices every tier-up in Money, rising with the tier', () => {
    const card = content.cardById.get('ember_squire')!;
    const amounts = RANK_TIERS.slice(0, 4).map((tier) => {
      const owned = { ...newOwnedCard(), tier };
      return tierUpCost(content, card, owned).find((c) => c.resource === 'money')!.amount;
    });
    for (let i = 1; i < amounts.length; i++) expect(amounts[i]!.gt(amounts[i - 1]!)).toBe(true);
  });
});

describe('the Unique tier (DESIGN.md §5)', () => {
  it('opens after Prismatic only for cards with a unique version', () => {
    expect(cardTopTier(content, 'ember_squire')).toBe('unique');
    expect(cardTopTier(content, 'grove_keeper')).toBe('unique');
    expect(cardTopTier(content, 'shield_warden')).toBe('prismatic');
    const state = own(
      own(freshState(), 'ember_squire', { tier: 'prismatic', level: 80 }),
      'shield_warden',
      { tier: 'prismatic', level: 80 },
    );
    expect(tierUpCheck(state, content, 'shield_warden')).toMatchObject({ available: false });
    expect(tierUp(state, content, 'shield_warden')).toEqual({ ok: false, reason: 'unavailable' });
    const check = tierUpCheck(state, content, 'ember_squire')!;
    expect(check).toMatchObject({ available: true, to: { tier: 'unique', stars: 1 } });
  });

  it('has a level cap of 100 and no step past it', () => {
    expect(levelCap(content, { tier: 'unique', stars: 1 })).toBe(100);
    expect(levelCap(content, { tier: 'prismatic', stars: 1 })).toBe(80);
    const state = fund(
      own(freshState(), 'ember_squire', { tier: 'prismatic', level: 80 }),
      'ember_squire',
    );
    const after = ok(tierUp(state, content, 'ember_squire'));
    expect(after.cards.owned['ember_squire']).toMatchObject({ tier: 'unique', level: 80 });
    expect(tierUpCheck(after, content, 'ember_squire')).toMatchObject({ available: false });
    expect(cardInfo(after, content, 'ember_squire')!.levelCap).toBe(100);
  });

  it('tells the unique evolution moment when a card reaches it', () => {
    const state = fund(
      own(freshState(), 'ember_squire', { tier: 'prismatic', level: 80 }),
      'ember_squire',
    );
    const result = tierUp(state, content, 'ember_squire');
    expect(result.ok && result.tierUps.map((t) => t.kind)).toContain('evolution');
  });

  it('is only a flag in the card data', () => {
    const withUnique = content.cards.filter((c) => c.evolution).map((c) => c.id);
    expect(withUnique.sort()).toEqual(['ember_squire', 'grove_keeper', 'reaper_test']);
  });

  it('counts as fully ranked at Unique ★6, and at Prismatic ★6 for a card without one', () => {
    const state = own(
      own(freshState(), 'ember_squire', { tier: 'prismatic', stars: 6 }),
      'shield_warden',
      { tier: 'prismatic', stars: 6 },
    );
    expect(cardInfo(state, content, 'ember_squire')!.maxRank).toBe(false);
    expect(cardInfo(state, content, 'shield_warden')!.maxRank).toBe(true);
    own(state, 'ember_squire', { tier: 'unique', stars: 6 });
    expect(cardInfo(state, content, 'ember_squire')!.maxRank).toBe(true);
  });
});

describe('weapon looks for now (DESIGN.md §5)', () => {
  it('moves one step up the rarity ladder per tier', () => {
    expect(weaponLookRarity('common', 'bronze')).toBe('common');
    expect(weaponLookRarity('common', 'silver')).toBe('rare');
    expect(weaponLookRarity('common', 'gold')).toBe('epic');
    expect(weaponLookRarity('common', 'prismatic')).toBe('legendary');
    expect(weaponLookRarity('rare', 'gold')).toBe('legendary');
  });

  it('caps at Void', () => {
    expect(weaponLookRarity('exotic', 'prismatic')).toBe('void');
    expect(weaponLookRarity('void', 'silver')).toBe('void');
    expect(weaponLookRarity('legendary', 'unique')).toBe('void');
  });

  it('draws the unique item at Unique only, not at Gold ★6', () => {
    const at = (tier: OwnedCard['tier'], stars: number) =>
      cardItem(content, 'ember_squire', { ...newOwnedCard(), tier, stars });
    expect(at('gold', 6)).toMatchObject({ kind: 'sword', unique: false, rarity: 'epic' });
    expect(at('prismatic', 6)).toMatchObject({ kind: 'sword', unique: false, rarity: 'legendary' });
    expect(at('unique', 1)).toMatchObject({ kind: 'flameblade', unique: true });
    expect(cardItem(content, 'ember_squire', null)).toMatchObject({
      unique: false,
      rarity: 'common',
    });
    expect(
      cardItem(content, 'shield_warden', { ...newOwnedCard(), tier: 'prismatic' }),
    ).toMatchObject({ kind: 'shield', unique: false, rarity: 'mythic' });
  });
});

describe('production cards use the same model', () => {
  it('star up from the bar and tier up at max level like a fighting card', () => {
    const state = own(freshState(), 'apprentice_feller', { starFill: commonNeed(1), level: 20 });
    fund(state, 'apprentice_feller');
    const starred = ok(starUp(state, content, 'apprentice_feller'));
    expect(starred.cards.owned['apprentice_feller']).toMatchObject({ stars: 2, starFill: 0 });
    const tiered = ok(tierUp(starred, content, 'apprentice_feller'));
    expect(tiered.cards.owned['apprentice_feller']).toMatchObject({ tier: 'silver', stars: 2 });
    expect(cardTopTier(content, 'apprentice_feller')).toBe('prismatic');
    expect(cardTopTier(content, 'grove_keeper')).toBe('unique');
  });
});

describe('save format 18', () => {
  it('moves duplicates to an empty star bar, keeping tier and stars', () => {
    const envelope = JSON.parse(createSaveText(freshState(), 1));
    envelope.version = 17;
    const owned = envelope.state.cards.owned;
    owned.ember_squire = {
      tier: 'gold',
      stars: 6,
      level: 40,
      xp: '0',
      duplicates: 3,
      enhancements: [],
    };
    delete owned.apprentice_feller.starFill;
    owned.apprentice_feller.duplicates = 7;
    delete owned.cave_digger.starFill;
    owned.cave_digger.duplicates = 0;
    const loaded = readSave(JSON.stringify(envelope), content).state;
    expect(loaded.cards.owned['ember_squire']).toMatchObject({
      tier: 'gold',
      stars: 6,
      level: 40,
      starFill: 0,
    });
    expect(loaded.cards.owned['apprentice_feller']!.starFill).toBe(0);
    expect(loaded.cards.owned['ember_squire']).not.toHaveProperty('duplicates');
    expect(cardItem(content, 'ember_squire', loaded.cards.owned['ember_squire']!)!.unique).toBe(
      false,
    );
  });

  it('round-trips the star fill and a Unique card', () => {
    const state = own(freshState(), 'ember_squire', {
      tier: 'unique',
      stars: 4,
      level: 100,
      starFill: 3,
    });
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cards.owned['ember_squire']).toMatchObject({
      tier: 'unique',
      stars: 4,
      level: 100,
      starFill: 3,
    });
  });
});
