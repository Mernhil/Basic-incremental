import { describe, expect, it } from 'vitest';
import { RANK_TIERS } from '../src/data';
import {
  addCard,
  buyShardItem,
  cardBaseDamage,
  cardHealth,
  cardInfo,
  cardItem,
  cardTier,
  createSaveText,
  gradeLabel,
  isMaxRank,
  levelCap,
  newOwnedCard,
  readSave,
  starBarView,
  starUp,
  starUpCheck,
  tierLabel,
  type CardResult,
  type GameState,
  type OwnedCard,
} from '../src/game';
import { content, freshState } from './helpers';

function ok(result: CardResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}

/** Owns a card at its own tier (DESIGN.md §5 No tier-ups), with the given stars, level and fill. */
function own(state: GameState, id: string, card: Partial<OwnedCard> = {}): GameState {
  state.cards.owned[id] = { ...newOwnedCard(cardTier(content, id)), ...card };
  return state;
}

describe('the star bar (DESIGN.md §5 One copy a star)', () => {
  it('fills by one copy per duplicate and keeps the fill on the card', () => {
    let state = own(freshState(), 'dawnblade_regent');
    for (let i = 1; i <= 3; i++) {
      const result = addCard(state, content, 'dawnblade_regent')!;
      expect(result.gain).toEqual({ kind: 'duplicate', duplicates: i });
      state = result.state;
    }
    expect(state.cards.owned['dawnblade_regent']!.starFill).toBe(3);
  });

  it('shows a gauge between 0 and 1 and no bar at ★6 or for a card not owned', () => {
    const card = content.cardById.get('ember_squire')!;
    expect(starBarView(content, card, { ...newOwnedCard(), starFill: 0 })).toMatchObject({
      need: 1,
      gauge: 0,
      ready: false,
    });
    expect(starBarView(content, card, { ...newOwnedCard(), starFill: 0.5 })!.gauge).toBe(0.5);
    expect(starBarView(content, card, { ...newOwnedCard(), starFill: 4 })).toMatchObject({
      gauge: 1,
      ready: true,
    });
    expect(starBarView(content, card, { ...newOwnedCard(), stars: 6 })).toBeNull();
    expect(cardInfo(freshState(), content, 'storm_duelist')!.starBar).toBeNull();
  });

  it('makes a star-up cost only the copy: no level cap, no Core, gems or Money', () => {
    const state = own(freshState(), 'storm_duelist', { starFill: 1 });
    for (const id of Object.keys(state.resources)) delete state.resources[id];
    const check = starUpCheck(state, content, 'storm_duelist')!;
    expect(check.requirements.map((r) => r.kind)).toEqual(['starFill']);
    expect(ok(starUp(state, content, 'storm_duelist')).cards.owned['storm_duelist']).toMatchObject({
      tier: 'gold',
      stars: 2,
      level: 1,
      starFill: 0,
    });
  });

  it('refuses a star-up while the bar is short and carries the leftover over', () => {
    const short = own(freshState(), 'ember_squire', { starFill: 0.5 });
    expect(starUp(short, content, 'ember_squire')).toEqual({ ok: false, reason: 'requirements' });
    const over = own(freshState(), 'ember_squire', { starFill: 2.5 });
    expect(ok(starUp(over, content, 'ember_squire')).cards.owned['ember_squire']).toMatchObject({
      stars: 2,
      starFill: 1.5,
    });
  });

  it('has no star-up at ★6', () => {
    const state = own(freshState(), 'ember_squire', { stars: 6, starFill: 3 });
    expect(starUpCheck(state, content, 'ember_squire')!.available).toBe(false);
    expect(starUp(state, content, 'ember_squire')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('copies past ★6 become shards', () => {
  it('turns a copy of a ★6 card into shards, by its tier', () => {
    const shards = { ember_squire: 1, silver_cavalier: 2, storm_duelist: 4, dawnblade_regent: 8 };
    for (const [id, want] of Object.entries(shards)) {
      const state = own(freshState(), id, { stars: 6 });
      const result = addCard(state, content, id)!;
      expect(result.gain, id).toEqual({ kind: 'shards', shards: want });
      expect(result.state.cards.owned[id]!.starFill).toBe(0);
    }
  });

  it('turns a copy into shards once the bar already holds every star left to ★6', () => {
    // ★4 has two stars left, one copy each: a bar of 2 holds them all.
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

  it('keeps a maxed Wood card below a fresh Prismatic card in base health', () => {
    const maxed = cardHealth(content, 'ember_squire', { ...newOwnedCard(), stars: 6 });
    const prismatic = cardHealth(content, 'dawnblade_regent', newOwnedCard('prismatic'));
    expect(maxed.lt(prismatic)).toBe(true);
  });
});

describe('a card has one tier, for good (DESIGN.md §5 No tier-ups)', () => {
  it('gives every card the tier written on it, and its level cap', () => {
    const caps = {
      wood: 20,
      bronze: 40,
      silver: 60,
      gold: 80,
      prismatic: 100,
      mythic: 120,
      heirloom: 140,
    };
    for (const card of content.cards) {
      expect(cardTier(content, card.id)).toBe(card.tier);
      expect(levelCap(content, { tier: card.tier, stars: 1 })).toBe(caps[card.tier]);
    }
    expect(cardTier(content, 'grove_keeper')).toBe('silver');
    expect(cardTier(content, 'apprentice_feller')).toBe('wood');
    expect(cardTier(content, 'nope')).toBe('wood');
  });

  it('counts as fully ranked at ★6, at any tier', () => {
    for (const id of ['ember_squire', 'storm_duelist', 'core_titan', 'heartdelver']) {
      const state = own(freshState(), id, { stars: 6 });
      expect(isMaxRank(content, id, state.cards.owned[id]!), id).toBe(true);
      expect(cardInfo(state, content, id)!.maxRank).toBe(true);
      own(state, id, { stars: 5 });
      expect(cardInfo(state, content, id)!.maxRank).toBe(false);
    }
  });

  it('names T6 Mythic or Void by the card side, every other tier the same', () => {
    expect(tierLabel('mythic', 'mythic')).toBe('Mythic');
    expect(tierLabel('mythic', 'void')).toBe('Void');
    expect(tierLabel('mythic')).toBe('Mythic');
    expect(tierLabel('wood', 'void')).toBe('Wood');
    expect(tierLabel('prismatic', 'void')).toBe('Prismatic');
    expect(tierLabel('heirloom', 'void')).toBe('Heirloom');
    expect(RANK_TIERS.map((t) => tierLabel(t))).toEqual([
      'Wood',
      'Bronze',
      'Silver',
      'Gold',
      'Prismatic',
      'Mythic',
      'Heirloom',
    ]);
    expect(gradeLabel('silver')).toBe('Silver');
    expect(gradeLabel('void')).toBe('Void');
  });

  it('keeps an Heirloom card at its own tier: level cap 140, no star bar', () => {
    expect(levelCap(content, { tier: 'heirloom', stars: 1 })).toBe(140);
    const state = own(freshState(), 'heartdelver', { level: 140, stars: 3 });
    expect(state.cards.owned['heartdelver']!.tier).toBe('heirloom');
    expect(starUpCheck(state, content, 'heartdelver')).toMatchObject({ available: false });
    expect(cardInfo(state, content, 'heartdelver')!.starBar).toBeNull();
    expect(cardInfo(state, content, 'heartdelver')!.levelCap).toBe(140);
  });
});

describe('weapon looks (DESIGN.md §5)', () => {
  it('gives the item the name of the card tier, type and heirloom flag', () => {
    expect(cardItem(content, 'ember_squire')).toEqual({
      kind: 'sword',
      name: 'Wooden Sword',
      heirloom: false,
    });
    expect(cardItem(content, 'storm_duelist')).toMatchObject({
      kind: 'dagger',
      name: 'Golden Dagger',
      heirloom: false,
    });
    expect(cardItem(content, 'dawnblade_regent')).toMatchObject({
      kind: 'greatsword',
      name: 'Prismatic Greatsword',
      heirloom: false,
    });
    expect(cardItem(content, 'core_titan')).toMatchObject({
      kind: 'pickaxe',
      name: 'Void Hollowdeep Pickaxe',
      heirloom: false,
    });
    expect(cardItem(content, 'heartdelver')).toMatchObject({
      kind: 'pickaxe',
      name: 'Heartdelver',
      heirloom: true,
    });
    expect(cardItem(content, 'nope')).toBeNull();
  });
});

describe('production cards use the same model', () => {
  it('star up from the bar like a fighting card, at their own tier', () => {
    const state = own(freshState(), 'grove_keeper', { starFill: 1, level: 20 });
    const starred = ok(starUp(state, content, 'grove_keeper'));
    expect(starred.cards.owned['grove_keeper']).toMatchObject({
      tier: 'silver',
      stars: 2,
      starFill: 0,
      level: 20,
    });
  });
});

describe('save format 18, read through the whole migration chain', () => {
  it('moves duplicates to an empty star bar, keeping stars and level; the tier is the card own', () => {
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
      tier: 'prismatic',
      stars: 6,
      level: 40,
      starFill: 0,
    });
    expect(loaded.cards.owned['apprentice_feller']!.starFill).toBe(0);
    expect(loaded.cards.owned['dawnblade_regent']).not.toHaveProperty('duplicates');
    expect(cardItem(content, 'dawnblade_regent')!.heirloom).toBe(false);
  });

  it('round-trips the star fill of a T6 card', () => {
    const state = own(freshState(), 'core_titan', { stars: 3, level: 120, starFill: 3 });
    const loaded = readSave(createSaveText(state, 1), content).state;
    expect(loaded.cards.owned['core_titan']).toMatchObject({
      tier: 'mythic',
      stars: 3,
      level: 120,
      starFill: 3,
    });
  });
});
