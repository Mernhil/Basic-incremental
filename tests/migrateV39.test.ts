import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent, type RankTier } from '../src/data';
import {
  CURRENT_SAVE_VERSION,
  cardBaseDamage,
  cardCost,
  cardHealth,
  createSaveText,
  levelCap,
  loadoutCostCap,
  readSave,
  serializeState,
} from '../src/game';

/**
 * Save format 39, the roster by tier (DESIGN.md §5 No tier-ups, Saves keep their cards), on a real
 * save written by the 0.7.25 game (format 38, see fixtures/saves/README.md): cards raised part of
 * the way up the old ladder stand at their own tier, and keep stars, level, XP and enhancements.
 */
const content = loadContent();
const text = readFileSync(resolve(__dirname, 'fixtures/saves/v38-0.7.25.save.txt'), 'utf8');

interface OldCard {
  tier: RankTier;
  stars: number;
  level: number;
  xp: string;
  starFill: number;
  enhancements: string[];
}
interface OldSave {
  version: number;
  savedAt: number;
  state: {
    cards: {
      owned: Record<string, OldCard>;
      shards: number;
      loadouts: { fighting: { slots: (string | null)[] } };
    };
    quests: Record<string, { doneAt: number; claimed: boolean }>;
    resources: Record<string, string>;
  };
}
const old = (): OldSave => JSON.parse(text) as OldSave;

describe('v38 -> v39 on the 0.7.25 save', () => {
  const before = old();
  const loaded = readSave(text, content);
  const state = loaded.state;

  it('is a format 38 save with cards below, at and never above their own tier', () => {
    expect(before.version).toBe(38);
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(39);
    const cards = Object.entries(before.state.cards.owned);
    expect(cards.length).toBeGreaterThan(20);
    const raised = cards.filter(
      ([id, c]) => c.tier !== 'wood' && c.tier !== content.cardById.get(id)!.tier,
    );
    const below = cards.filter(([id, c]) => c.tier !== content.cardById.get(id)!.tier);
    // e.g. the Prismatic Greatsword saved at Gold ★5 Lv 71, the Silver Lance at Bronze Lv 40
    expect(raised.map(([id]) => id)).toEqual(
      expect.arrayContaining(['dawnblade_regent', 'silver_rider']),
    );
    expect(below.length).toBeGreaterThan(5);
  });

  it('puts every owned card at its own tier and keeps its stars, level, XP and enhancements', () => {
    expect(Object.keys(state.cards.owned).sort()).toEqual(
      Object.keys(before.state.cards.owned).sort(),
    );
    for (const [id, was] of Object.entries(before.state.cards.owned)) {
      const card = content.cardById.get(id)!;
      const now = state.cards.owned[id]!;
      expect(now.tier, id).toBe(card.tier);
      expect(now.stars, id).toBe(was.stars);
      expect(now.level, id).toBe(was.level); // no level is cut, none is granted
      expect(now.xp.toString(), id).toBe(was.xp);
      expect(now.enhancements, id).toEqual(was.enhancements);
      // the new cap is never below the old one
      expect(levelCap(content, { tier: now.tier, stars: now.stars })).toBeGreaterThanOrEqual(
        levelCap(content, { tier: was.tier, stars: was.stars }),
      );
    }
    expect(state.cards.owned['dawnblade_regent']).toMatchObject({
      tier: 'prismatic',
      stars: 5,
      level: 71,
    });
    expect(state.cards.owned['silver_rider']).toMatchObject({
      tier: 'silver',
      stars: 1,
      level: 40,
    });
    expect(state.cards.owned['ember_squire']).toMatchObject({ tier: 'wood', stars: 6, level: 20 });
  });

  it('never makes a card weaker', () => {
    for (const [id, was] of Object.entries(before.state.cards.owned)) {
      const now = state.cards.owned[id]!;
      const then = { ...now, tier: was.tier };
      expect(cardBaseDamage(content, id, now).gte(cardBaseDamage(content, id, then)), id).toBe(
        true,
      );
      expect(cardHealth(content, id, now).gte(cardHealth(content, id, then)), id).toBe(true);
    }
  });

  it('keeps the star bar within the stars left to ★6 and pays the rest as shards', () => {
    let shards = before.state.cards.shards;
    const rate = content.cardRules.shards;
    for (const [id, was] of Object.entries(before.state.cards.owned)) {
      const room = 6 - was.stars;
      const now = state.cards.owned[id]!;
      expect(now.starFill, id).toBe(Math.min(was.starFill, room));
      const tier = content.cardById.get(id)!.tier;
      if (was.starFill > room && tier !== 'heirloom') {
        shards += Math.floor((was.starFill - room) * rate[tier]);
      }
    }
    expect(state.cards.shards).toBe(shards);
  });

  it('keeps the fighting team, within the cost cap', () => {
    expect(state.cards.loadouts.fighting.slots).toEqual(before.state.cards.loadouts.fighting.slots);
    const cost = state.cards.loadouts.fighting.slots.reduce(
      (sum, id) => sum + (id ? cardCost(content, id) : 0),
      0,
    );
    expect(cost).toBeLessThanOrEqual(loadoutCostCap(state, content, 'fighting'));
  });

  it('drops the five "Upgrade a weapon" quests and keeps every other quest as it was', () => {
    const gone = [
      'card_tier_bronze',
      'card_tier_silver',
      'card_tier_gold',
      'card_tier_prismatic',
      'card_tier_mythic',
    ];
    for (const id of gone) expect(state.quests[id], id).toBeUndefined();
    for (const [id, q] of Object.entries(before.state.quests)) {
      if (gone.includes(id)) continue;
      expect(state.quests[id], id).toMatchObject({ claimed: q.claimed });
    }
  });

  it('writes no tier, and loads again to the same state', () => {
    const resaved = createSaveText(state, 1);
    const envelope = JSON.parse(resaved) as {
      version: number;
      state: { cards: { owned: Record<string, object> } };
    };
    expect(envelope.version).toBe(CURRENT_SAVE_VERSION);
    for (const card of Object.values(envelope.state.cards.owned))
      expect(card).not.toHaveProperty('tier');
    const again = readSave(resaved, content).state;
    expect(serializeState(again)).toEqual(serializeState(state));
  });
});

describe('v38 -> v39: the corners', () => {
  /** The real save with a few cards and quests set by hand. */
  function corner(change: (s: OldSave['state']) => void) {
    const save = old();
    change(save.state);
    return readSave(JSON.stringify(save), content).state;
  }
  const card = (tier: RankTier, patch: Partial<OldCard> = {}): OldCard => ({
    tier,
    stars: 1,
    level: 1,
    xp: '0',
    starFill: 0,
    enhancements: [],
    ...patch,
  });

  it('a Bronze card saved at Wood ★4 Lv 20 with XP 0 is Bronze ★4 Lv 20 and can level again', () => {
    const state = corner((s) => {
      s.cards.owned['bronze_sneak'] = card('wood', { stars: 4, level: 20 });
    });
    const now = state.cards.owned['bronze_sneak']!;
    expect(now).toMatchObject({ tier: 'bronze', stars: 4, level: 20 });
    expect(levelCap(content, { tier: now.tier, stars: now.stars })).toBe(40);
  });

  it('a T6 card saved at Gold ★3 is T6 ★3, an Heirloom card stays as it was', () => {
    const state = corner((s) => {
      s.cards.owned['dawn_champion'] = card('gold', { stars: 3, level: 77, xp: '12' });
      s.cards.owned['solaris'] = card('heirloom', { stars: 2, level: 130, starFill: 9 });
    });
    expect(state.cards.owned['dawn_champion']).toMatchObject({
      tier: 'mythic',
      stars: 3,
      level: 77,
    });
    expect(state.cards.owned['dawn_champion']!.xp.toString()).toBe('12');
    expect(state.cards.owned['solaris']).toMatchObject({
      tier: 'heirloom',
      stars: 2,
      level: 130,
      starFill: 9,
    });
  });

  it('a star bar holding more than the stars left pays shards by the tier', () => {
    const base = corner((s) => {
      delete s.cards.owned['gilded_knight'];
    }).cards.shards;
    const state = corner((s) => {
      // Gold ★4: two stars left; 5.5 copies held, 3.5 too many, 4 shards a copy
      s.cards.owned['gilded_knight'] = card('wood', { stars: 4, starFill: 5.5 });
    });
    expect(state.cards.owned['gilded_knight']).toMatchObject({
      tier: 'gold',
      stars: 4,
      starFill: 2,
    });
    expect(state.cards.shards).toBe(base + Math.floor(3.5 * 4));
  });

  it('pays the scrolls of a removed quest when the quest that took them over was already claimed', () => {
    const scrolls = (change: (s: OldSave['state']) => void): number =>
      corner(change).resources['summon_scroll']!.toNumber();
    const plain = scrolls((s) => {
      s.quests['first_legendary'] = { doneAt: 1, claimed: true };
      s.quests['card_tier_prismatic'] = { doneAt: 1, claimed: true };
    });
    // the Prismatic "Upgrade" quest paid 2 scrolls: not claimed yet, its heir already was
    const owed = scrolls((s) => {
      s.quests['first_legendary'] = { doneAt: 1, claimed: true };
      delete s.quests['card_tier_prismatic'];
    });
    expect(owed - plain).toBeCloseTo(2);
    // with the heir not claimed yet nothing is paid now: its reward holds the scrolls
    const later = scrolls((s) => {
      delete s.quests['first_legendary'];
      delete s.quests['card_tier_prismatic'];
    });
    expect(later - plain).toBeCloseTo(0);
  });
});
