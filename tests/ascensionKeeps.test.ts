import { describe, expect, it } from 'vitest';
import {
  ascend,
  ascensionPreview,
  collectModifiers,
  Decimal,
  newOwnedCard,
  ringOpen,
  type GameState,
} from '../src/game';
import { content, freshState, openAscension } from './helpers';

/**
 * What an Ascension keeps and what it resets (DESIGN.md §9), as one list so a later change cannot
 * break it silently.
 */
function richRun(): GameState {
  const s = freshState();
  s.mastery.harvested['oak_gem'] = new Decimal(1e14);
  s.camp = {
    level: 9,
    forest: [{ material: 'oak', card: 'apprentice_feller' }],
    cave: [{ material: 'copper_quarry', card: 'cave_digger' }],
  };
  s.production.forge = { recipe: 'x', progress: new Decimal(2), worker: null };
  s.resources['star_dust'] = new Decimal(7);
  s.combat.training = { sharpen: 5 };
  s.combat.stageKills = { 'mossy_cellar:normal:10': 11 };
  s.combat.stageChests = { 'mossy_cellar:normal:10': 2 };
  s.cards.wishlist = ['ember_squire'];
  s.cards.owned['ember_squire'] = { ...newOwnedCard(), stars: 3, tier: 'bronze' };
  s.account.skills = { ...s.account.skills };
  return openAscension(s);
}

describe('what an Ascension keeps and resets', () => {
  it('resets the run economy', () => {
    const r = ascend(richRun(), content);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    expect(s.combat.training).toEqual({});
    expect(s.resources['oak_gem']!.toNumber()).toBe(0);
  });

  it('keeps the collection and the long-term systems, the camp included', () => {
    const before = richRun();
    openAscension(before);
    const r = ascend(before, content);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    expect(s.camp).toEqual(before.camp);
    expect(s.production.forge).toEqual(before.production.forge);
    expect(s.resources['star_dust']!.toNumber()).toBe(7);
    expect(s.combat.stageKills).toEqual(before.combat.stageKills);
    expect(s.combat.stageChests).toEqual(before.combat.stageChests);
    expect(s.cards.wishlist).toEqual(['ember_squire']);
    expect(s.cards.owned['ember_squire']).toEqual(before.cards.owned['ember_squire']);
    expect(s.account.skills).toEqual(before.account.skills);
    expect(s.combat.floors).toBeDefined();
    expect(s.prestige.shop).toEqual(before.prestige.shop);
  });

  it('opens one more skill ring each time', () => {
    let s = richRun();
    expect(ringOpen(s, 0)).toBe(true);
    expect(ringOpen(s, 1)).toBe(false);
    openAscension(s);
    const r = ascend(s, content);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    expect(ringOpen(s, 1)).toBe(true);
  });

  it('names the camp in the gate lists', () => {
    const preview = ascensionPreview(richRun(), content, collectModifiers(richRun(), content));
    expect(preview.resets).toEqual(['resources']);
    expect(preview.persists).toEqual(
      expect.arrayContaining([
        'camp',
        'forge',
        'star_dust',
        'stage_stars',
        'wishlist',
        'skill_tree',
      ]),
    );
  });
});
