import { describe, expect, it } from 'vitest';
import { RANK_TIERS, RARITIES, type Content, type Rarity } from '../src/data';
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
  isMaxRank,
  levelCap,
  newOwnedCard,
  readSave,
  starFillNeeded,
  starUp,
  starUpCheck,
  tierUp,
  tierUpCheck,
  tierLabel,
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
const COMMON_NEED: number = content.cardRules.starBar.needs.common.wood;

describe('the star bar (DESIGN.md §5)', () => {
  it('needs the copies of the table for ★2 to ★5, per rarity and tier', () => {
    // The shipped table is tuned and tested in cardsFromStart.test.ts; this content pins one whole
    // copy per star, so the rules below count copies.
    for (const rarity of RARITIES) {
      for (const tier of RANK_TIERS.slice(0, -1) as Exclude<(typeof RANK_TIERS)[number], 'heirloom'>[]) {
        for (const stars of [1, 2, 3, 4, 5]) {
          expect(starFillNeeded(content, rarity, stars, tier), `${rarity} ${tier}`).toBe(
            content.cardRules.starBar.needs[rarity][tier] *
              content.cardRules.starBar.fillPerDuplicate[rarity],
          );
        }
      }
    }
    expect(starFillNeeded(content, 'common', 6, 'wood')).toBeNull();
    expect(starFillNeeded(content, 'void', 1, 'heirloom')).toBeNull();
  });

  it('fills by the rarity of each duplicate and keeps the fill on the card', () => {
    let result = addCard(freshState(), content, 'ember_squire')!;
    expect(result.gain).toEqual({ kind: 'duplicate', duplicates: 1 });
    result = addCard(result.state, content, 'ember_squire')!;
    expect(result.state.cards.owned['ember_squire']!.starFill).toBe(2);
    const view = cardInfo(result.state, content, 'ember_squire')!.starBar!;
    expect(view).toMatchObject({ fill: 2, need: COMMON_NEED, ready: true });
    expect(view.gauge).toBe(1);
  });

  it('shows a gauge between 0 and 1 and no bar at ★6 or for a card not owned', () => {
    const state = own(freshState(), 'ember_squire', { stars: 4, starFill: 0.5 });
    expect(cardInfo(state, content, 'ember_squire')!.starBar).toMatchObject({
      fill: 0.5,
      need: COMMON_NEED,
      gauge: 0.5 / COMMON_NEED,
      ready: false,
    });
    own(state, 'storm_duelist', { stars: 6 });
    expect(cardInfo(state, content, 'storm_duelist')!.starBar).toBeNull();
    expect(cardInfo(state, content, 'storm_duelist')!.starBar).toBeNull();
  });

  it('makes a star-up cost only the fill: no level cap, no Core, gems or Money', () => {
    const state = own(freshState(), 'ember_squire', { level: 1, starFill: COMMON_NEED });
    const check = starUpCheck(state, content, 'ember_squire')!;
    expect(check.to).toEqual({ tier: 'wood', stars: 2 });
    expect(check.requirements.map((r) => r.kind)).toEqual(['starFill']);
    expect(check.met).toBe(true);
    const money = state.resources['money']!;
    const after = ok(starUp(state, content, 'ember_squire'));
    expect(after.cards.owned['ember_squire']).toMatchObject({ stars: 2, level: 1, starFill: 0 });
    expect(after.resources['money']!.eq(money)).toBe(true);
    expect(state.cards.owned['ember_squire']!.stars).toBe(1); // pure
  });

  it('refuses a star-up while the bar is short and carries the leftover over', () => {
    const state = own(freshState(), 'ember_squire', { starFill: COMMON_NEED - 1 });
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
    own(state, 'ember_squire', { starFill: COMMON_NEED + 3 });
    const once = ok(starUp(state, content, 'ember_squire'));
    expect(once.cards.owned['ember_squire']).toMatchObject({ stars: 2, starFill: 3 });
  });

  it('has no free star: a Legendary ★2 to ★3 needs its copy too', () => {
    const state = own(freshState(), 'dawnblade_regent', { stars: 2, starFill: 0 });
    expect(starUpCheck(state, content, 'dawnblade_regent')!.met).toBe(false);
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

  it('fills the emptied star bar again after a tier-up, and shards again at the new ★6', () => {
    const state = fund(
      own(freshState(), 'dawnblade_regent', { stars: 6, level: 20 }),
      'dawnblade_regent',
    );
    const tiered = ok(tierUp(state, content, 'dawnblade_regent'));
    const copy = addCard(tiered, content, 'dawnblade_regent')!;
    expect(copy.gain).toMatchObject({ kind: 'duplicate' });
    expect(copy.state.cards.owned['dawnblade_regent']!.starFill).toBeGreaterThan(0);
  });

  it('turns a copy into shards once the bar already holds every star left to ★6', () => {
    // Void ★4 has two stars left, one copy each (pinned): a bar of 2 holds them all.
    const state = own(freshState(), 'core_titan', { stars: 4, starFill: 2 });
    const result = addCard(state, content, 'core_titan')!;
    expect(result.gain).toEqual({ kind: 'shards', shards: 25 });
    expect(result.state.cards.owned['core_titan']!.starFill).toBe(2);
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
  it('multiplies base damage and health by x1.21 / 1.49 / 1.8 / 2.25 / 2.89 at ★2 to ★6', () => {
    const base = cardBaseDamage(content, 'ember_squire', newOwnedCard());
    const health = cardHealth(content, 'ember_squire', newOwnedCard());
    expect(content.cardRules.power.starMultiplier).toEqual([1.21, 1.49, 1.8, 2.25, 2.89]);
    [1, 1.21, 1.49, 1.8, 2.25, 2.89].forEach((mult, i) => {
      const owned = { ...newOwnedCard(), stars: i + 1 };
      expect(cardBaseDamage(content, 'ember_squire', owned).div(base).toNumber()).toBeCloseTo(mult);
      expect(cardHealth(content, 'ember_squire', owned).div(health).toNumber()).toBeCloseTo(mult);
    });
  });

  it('keeps a maxed Common below a fresh Legendary in base health', () => {
    const maxed = cardHealth(content, 'ember_squire', { ...newOwnedCard(), stars: 6 });
    const legendary = cardHealth(content, 'dawnblade_regent', newOwnedCard());
    expect(maxed.lt(legendary)).toBe(true);
  });
});

describe('tier-up at max level and ★6, paid with Money (DESIGN.md §5)', () => {
  it('needs the level cap, ★6, Money, the tier Core and gems; the stars restart at ★1', () => {
    const state = own(freshState(), 'storm_duelist', { stars: 6, level: 20 });
    const check = tierUpCheck(state, content, 'storm_duelist')!;
    expect(check.available).toBe(true);
    expect(check.to).toEqual({ tier: 'bronze', stars: 1 });
    expect(check.requirements.map((r) => r.kind)).not.toContain('starFill');
    const resources = check.requirements.flatMap((r) => r.resource ?? []);
    expect(resources).toEqual(['money', 'moss_core', 'iron_gem', 'ironbark_gem']);
    expect(check.requirements[0]).toMatchObject({ kind: 'level', met: true });
    expect(check.requirements[1]).toMatchObject({ kind: 'stars', met: true });
  });

  it('reports the missing stars and refuses the tier-up below ★6', () => {
    const state = fund(
      own(freshState(), 'storm_duelist', { stars: 5, level: 20 }),
      'storm_duelist',
    );
    const check = tierUpCheck(state, content, 'storm_duelist')!;
    const stars = check.requirements.find((r) => r.kind === 'stars')!;
    expect(stars).toMatchObject({ met: false });
    expect(stars.have.toNumber()).toBe(5);
    expect(stars.need.toNumber()).toBe(6);
    expect(check.met).toBe(false);
    expect(tierUp(state, content, 'storm_duelist')).toEqual({ ok: false, reason: 'requirements' });
  });

  it('refuses below the level cap and with missing Money', () => {
    const low = fund(own(freshState(), 'storm_duelist', { level: 19, stars: 6 }), 'storm_duelist');
    expect(tierUp(low, content, 'storm_duelist')).toEqual({ ok: false, reason: 'requirements' });
    const poor = fund(own(freshState(), 'storm_duelist', { level: 20, stars: 6 }), 'storm_duelist');
    give(poor, 'money', 0);
    expect(tierUp(poor, content, 'storm_duelist')).toEqual({ ok: false, reason: 'requirements' });
  });

  it('pays Money and materials, resets stars to ★1 with an empty bar and keeps level and XP', () => {
    const state = fund(
      own(freshState(), 'storm_duelist', { stars: 6, starFill: 0, level: 20, xp: new Decimal(7) }),
      'storm_duelist',
    );
    const costs = tierUpCost(
      content,
      content.cardById.get('storm_duelist')!,
      state.cards.owned['storm_duelist']!,
    );
    const money = costs.find((c) => c.resource === 'money')!;
    expect(money.amount.gt(0)).toBe(true);
    const after = ok(tierUp(state, content, 'storm_duelist'));
    expect(after.cards.owned['storm_duelist']).toMatchObject({
      tier: 'bronze',
      stars: 1,
      starFill: 0,
      level: 20,
    });
    expect(after.cards.owned['storm_duelist']!.xp.eq(7)).toBe(true);
    for (const c of costs) expect(after.resources[c.resource]!.eq(5)).toBe(true);
  });

  it('restarts the stars at every tier on the way up', () => {
    let state = own(freshState(), 'dawnblade_regent', { stars: 6 });
    for (const tier of ['wood', 'bronze', 'silver', 'gold'] as const) {
      state.cards.owned['dawnblade_regent']!.level = levelCap(content, { tier, stars: 6 });
      state.cards.owned['dawnblade_regent']!.stars = 6;
      state.cards.owned['dawnblade_regent']!.tier = tier;
      state = ok(tierUp(fund(state, 'dawnblade_regent'), content, 'dawnblade_regent'));
      expect(state.cards.owned['dawnblade_regent']).toMatchObject({ stars: 1, starFill: 0 });
    }
    expect(state.cards.owned['dawnblade_regent']!.tier).toBe('prismatic');
  });

  it('asks Frost Sigils on Gold to Prismatic', () => {
    const state = own(freshState(), 'dawnblade_regent', { tier: 'gold', level: 80, stars: 6 });
    const resources = tierUpCheck(state, content, 'dawnblade_regent')!.requirements.flatMap(
      (r) => r.resource ?? [],
    );
    expect(resources).toContain('frost_sigil');
    expect(resources).toContain('money');
  });

  it('prices every tier-up in Money, rising with the tier', () => {
    const card = content.cardById.get('moonwood_dryad')!; // Mythic: every step up to T6 is open
    const amounts = RANK_TIERS.slice(0, 5).map((tier) => {
      const owned = { ...newOwnedCard(), tier };
      return tierUpCost(content, card, owned).find((c) => c.resource === 'money')!.amount;
    });
    for (let i = 1; i < amounts.length; i++) expect(amounts[i]!.gt(amounts[i - 1]!)).toBe(true);
  });
});

/** The bundled content with a card moved to another rarity (the starting cards are all Common). */
function withRarity(cardId: string, rarity: Rarity): Content {
  const cards = content.cards.map((c) => (c.id === cardId ? { ...c, rarity } : c));
  return { ...content, cards, cardById: new Map(cards.map((c) => [c.id, c])) };
}

describe('rarity caps the tier (DESIGN.md §5)', () => {
  it('stops each rarity at its tier: Common Wood ... Legendary Prismatic, Mythic and Void Mythic', () => {
    const top: Record<Rarity, string> = {
      common: 'wood',
      uncommon: 'bronze',
      rare: 'silver',
      epic: 'gold',
      legendary: 'prismatic',
      mythic: 'mythic',
      void: 'mythic',
    };
    for (const rarity of RARITIES) {
      expect(cardTopTier(withRarity('ember_squire', rarity), 'ember_squire'), rarity).toBe(
        top[rarity],
      );
    }
  });

  it('gives the bundled cards the cap of their own rarity', () => {
    expect(cardTopTier(content, 'ember_squire')).toBe('wood'); // Common
    expect(cardTopTier(content, 'grove_keeper')).toBe('silver'); // Rare
    expect(cardTopTier(content, 'storm_duelist')).toBe('gold'); // Epic
    expect(cardTopTier(content, 'dawnblade_regent')).toBe('prismatic'); // Legendary
    expect(cardTopTier(content, 'moonwood_dryad')).toBe('mythic'); // Mythic
    expect(cardTopTier(content, 'core_titan')).toBe('mythic'); // Void
    expect(cardTopTier(content, 'deepmaw')).toBe('heirloom'); // an Heirloom card
    expect(cardTopTier(content, 'nope')).toBe('wood');
  });

  it('refuses a tier-up past the cap of the rarity', () => {
    const state = own(freshState(), 'storm_duelist', { tier: 'gold', level: 80, stars: 6 });
    expect(tierUpCheck(state, content, 'storm_duelist')).toMatchObject({ available: false });
    expect(tierUp(state, content, 'storm_duelist')).toEqual({ ok: false, reason: 'unavailable' });
    const wood = own(freshState(), 'ember_squire', { level: 20, stars: 6 });
    expect(tierUp(wood, content, 'ember_squire')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('counts as fully ranked at ★6 of the rarity cap', () => {
    const state = own(own(freshState(), 'ember_squire', { stars: 6 }), 'dawnblade_regent', {
      tier: 'prismatic',
      stars: 6,
    });
    expect(cardInfo(state, content, 'ember_squire')!.maxRank).toBe(true); // Common: Wood ★6
    expect(cardInfo(state, content, 'dawnblade_regent')!.maxRank).toBe(true); // Legendary
    own(state, 'moonwood_dryad', { tier: 'prismatic', stars: 6 });
    expect(cardInfo(state, content, 'moonwood_dryad')!.maxRank).toBe(false); // Mythic goes on
    own(state, 'moonwood_dryad', { tier: 'mythic', stars: 5 });
    expect(isMaxRank(content, 'moonwood_dryad', state.cards.owned['moonwood_dryad']!)).toBe(false);
    own(state, 'moonwood_dryad', { tier: 'mythic', stars: 6 });
    expect(isMaxRank(content, 'moonwood_dryad', state.cards.owned['moonwood_dryad']!)).toBe(true);
  });

  it('names T6 Mythic or Void by the card side, every other tier the same', () => {
    expect(tierLabel('mythic', 'mythic')).toBe('Mythic');
    expect(tierLabel('mythic', 'void')).toBe('Void');
    expect(tierLabel('mythic')).toBe('Mythic');
    expect(tierLabel('wood', 'void')).toBe('Wood');
    expect(tierLabel('prismatic', 'void')).toBe('Prismatic');
    expect(tierLabel('heirloom', 'void')).toBe('Heirloom');
    expect(RANK_TIERS.map((t) => tierLabel(t, 'common'))).toEqual([
      'Wood',
      'Bronze',
      'Silver',
      'Gold',
      'Prismatic',
      'Mythic',
      'Heirloom',
    ]);
  });
});

describe('the ladder ends at Mythic / Void; Heirlooms are their own cards (DESIGN.md §5)', () => {
  it('has no tier-up after Mythic or Void', () => {
    const state = fund(
      own(freshState(), 'core_titan', { tier: 'mythic', level: 120, stars: 6 }),
      'core_titan',
    );
    expect(tierUpCheck(state, content, 'core_titan')).toMatchObject({ available: false });
    expect(tierUp(state, content, 'core_titan')).toEqual({ ok: false, reason: 'unavailable' });
    expect(tierUpCost(content, content.cardById.get('core_titan')!, state.cards.owned['core_titan']!)).toEqual([]);
  });

  it('keeps an Heirloom card at its own tier: level cap 140, no star bar, no tier-up', () => {
    expect(levelCap(content, { tier: 'heirloom', stars: 1 })).toBe(140);
    const state = own(freshState(), 'deepmaw', { tier: 'heirloom', level: 140, stars: 3 });
    expect(tierUpCheck(state, content, 'deepmaw')).toMatchObject({ available: false });
    expect(starUpCheck(state, content, 'deepmaw')).toMatchObject({ available: false });
    expect(cardInfo(state, content, 'deepmaw')!.starBar).toBeNull();
    expect(cardInfo(state, content, 'deepmaw')!.levelCap).toBe(140);
    own(state, 'deepmaw', { tier: 'heirloom', stars: 6 });
    expect(cardInfo(state, content, 'deepmaw')!.maxRank).toBe(true);
  });

  it('reports only the card tier moment on a tier-up', () => {
    const plain = fund(
      own(freshState(), 'dawnblade_regent', { tier: 'gold', level: 80, stars: 6 }),
      'dawnblade_regent',
    );
    const ordinary = tierUp(plain, content, 'dawnblade_regent');
    expect(ordinary.ok && ordinary.tierUps.map((t) => t.kind)).toEqual(['card_tier']);
  });
});

describe('weapon looks for now (DESIGN.md §5)', () => {
  it('moves one step up the rarity ladder per tier', () => {
    expect(weaponLookRarity('common', 'wood')).toBe('common');
    expect(weaponLookRarity('common', 'bronze')).toBe('uncommon');
    expect(weaponLookRarity('common', 'silver')).toBe('rare');
    expect(weaponLookRarity('common', 'gold')).toBe('epic');
    expect(weaponLookRarity('common', 'prismatic')).toBe('legendary');
    expect(weaponLookRarity('rare', 'gold')).toBe('mythic');
  });

  it('caps at Void', () => {
    expect(weaponLookRarity('legendary', 'prismatic')).toBe('void');
    expect(weaponLookRarity('void', 'silver')).toBe('void');
    expect(weaponLookRarity('legendary', 'heirloom')).toBe('void');
  });

  it('gives the item its name, type and heirloom flag by the card rank', () => {
    const at = (id: string, tier: OwnedCard['tier'], stars = 1, c: Content = content) =>
      cardItem(c, id, { ...newOwnedCard(), tier, stars });
    expect(at('ember_squire', 'wood')).toEqual({
      kind: 'sword',
      name: 'Wooden Sword',
      heirloom: false,
      rarity: 'common',
    });
    expect(cardItem(content, 'ember_squire', null)).toMatchObject({
      name: 'Wooden Sword',
      heirloom: false,
      rarity: 'common',
    });
    expect(at('storm_duelist', 'gold', 6)).toMatchObject({
      kind: 'dagger',
      name: 'Golden Dagger',
      heirloom: false,
    });
    expect(at('dawnblade_regent', 'prismatic', 6)).toMatchObject({
      kind: 'greatsword',
      name: 'Prismatic Glacier Greatsword',
      heirloom: false,
    });
    expect(at('core_titan', 'mythic')).toMatchObject({
      kind: 'pickaxe',
      name: 'Void Hollowdeep Pickaxe',
      heirloom: false,
    });
    expect(cardItem(content, 'deepmaw', null)).toMatchObject({
      kind: 'pickaxe',
      name: 'Deepmaw',
      heirloom: true,
    });
    expect(cardItem(content, 'nope', null)).toBeNull();
  });
});

describe('production cards use the same model', () => {
  it('star up from the bar and tier up at max level like a fighting card', () => {
    const need = content.cardRules.starBar.needs.rare.wood;
    const state = own(freshState(), 'grove_keeper', { starFill: need, level: 20 });
    fund(state, 'grove_keeper');
    const starred = ok(starUp(state, content, 'grove_keeper'));
    expect(starred.cards.owned['grove_keeper']).toMatchObject({ stars: 2, starFill: 0 });
    expect(tierUp(starred, content, 'grove_keeper')).toEqual({
      ok: false,
      reason: 'requirements',
    });
    starred.cards.owned['grove_keeper']!.stars = 6;
    const tiered = ok(tierUp(starred, content, 'grove_keeper'));
    expect(tiered.cards.owned['grove_keeper']).toMatchObject({ tier: 'bronze', stars: 1 });
    expect(cardTopTier(content, 'grove_keeper')).toBe('silver');
    expect(cardTopTier(content, 'apprentice_feller')).toBe('wood');
  });
});

describe('save format 18, read through the whole migration chain', () => {
  it('moves duplicates to an empty star bar, keeping tier and stars', () => {
    const envelope = JSON.parse(createSaveText(freshState(), 1));
    envelope.version = 17;
    const owned = envelope.state.cards.owned;
    owned.dawnblade_regent = {
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
    expect(loaded.cards.owned['dawnblade_regent']).toMatchObject({
      tier: 'gold',
      stars: 6,
      level: 40,
      starFill: 0,
    });
    expect(loaded.cards.owned['apprentice_feller']!.starFill).toBe(0);
    expect(loaded.cards.owned['dawnblade_regent']).not.toHaveProperty('duplicates');
    expect(
      cardItem(content, 'dawnblade_regent', loaded.cards.owned['dawnblade_regent']!)!.heirloom,
    ).toBe(false);
  });

  it('round-trips the star fill and a Mythic-tier card', () => {
    // ★3 (the next star costs a copy in the tests' star bar, so nothing is free to take on load)
    const state = own(freshState(), 'core_titan', {
      tier: 'mythic',
      stars: 3,
      level: 120,
      starFill: 3,
    });
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cards.owned['core_titan']).toMatchObject({
      tier: 'mythic',
      stars: 3,
      level: 120,
      starFill: 3,
    });
  });
});
