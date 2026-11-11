import { describe, expect, it } from 'vitest';
import {
  ascend,
  ascensionPreview,
  collectModifiers,
  Decimal,
  newOwnedCard,
  workerSlots,
  ringOpen,
  type GameState,
} from '../src/game';
import { content, freshState } from './helpers';

/**
 * What an Ascension keeps and what it resets (DESIGN.md §9), as one list so a later change cannot
 * break it silently.
 */
function richRun(): GameState {
  const s = freshState();
  s.mastery.harvested['oak_gem'] = new Decimal(1e14);
  s.production.treeLevels = { oak: 12 };
  s.production.mineLevels = { copper_quarry: 9 };
  s.production.tools = { logging_yield: 3 };
  s.production.depth = { oak: { layer: 2, progress: new Decimal(1) } };
  s.production.harvestGauges = { oak: { gauge: 5, timer: 0 } };
  s.production.workers = { oak: ['apprentice_feller'], copper_quarry: ['cave_digger'] };
  s.production.forge = { recipe: 'x', progress: new Decimal(2), worker: null };
  s.resources['star_dust'] = new Decimal(7);
  s.combat.training = { sharpen: 5 };
  s.combat.stageKills = { 'mossy_cellar:normal:10': 11 };
  s.combat.stageChests = { 'mossy_cellar:normal:10': 2 };
  s.cards.wishlist = ['ember_squire'];
  s.cards.owned['ember_squire'] = { ...newOwnedCard(), stars: 3, tier: 'bronze' };
  s.account.skills = { ...s.account.skills };
  return s;
}

describe('what an Ascension keeps and resets', () => {
  it('resets the run economy', () => {
    const r = ascend(richRun(), content);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    expect(s.production.treeLevels).toEqual({});
    expect(s.production.mineLevels).toEqual({});
    expect(s.production.tools).toEqual({});
    expect(s.production.depth).toEqual({});
    expect(s.production.harvestGauges).toEqual({});
    expect(s.combat.training).toEqual({});
    expect(s.resources['oak_gem']!.toNumber()).toBe(0);
  });

  it('keeps the collection and the long-term systems', () => {
    const before = richRun();
    const r = ascend(before, content);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    expect(s.production.workers).toEqual(before.production.workers);
    expect(s.production.forge).toEqual(before.production.forge);
    expect(s.production.unlockedTrees).toEqual(before.production.unlockedTrees);
    expect(s.resources['star_dust']!.toNumber()).toBe(7);
    expect(s.combat.stageKills).toEqual(before.combat.stageKills);
    expect(s.combat.stageChests).toEqual(before.combat.stageChests);
    expect(s.cards.wishlist).toEqual(['ember_squire']);
    expect(s.cards.owned['ember_squire']).toEqual(before.cards.owned['ember_squire']);
    expect(s.account.skills).toEqual(before.account.skills);
    expect(s.combat.floors).toBeDefined();
    expect(s.prestige.shop).toEqual(before.prestige.shop);
  });

  it('opens one more worker slot and one more skill ring each time', () => {
    let s = richRun();
    const slots = workerSlots(s, content);
    expect(ringOpen(s, 0)).toBe(true);
    expect(ringOpen(s, 1)).toBe(false);
    const r = ascend(s, content);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    expect(workerSlots(s, content)).toBe(slots + 1);
    expect(ringOpen(s, 1)).toBe(true);
  });

  it('names the new systems in the gate lists', () => {
    const preview = ascensionPreview(richRun(), content, collectModifiers(richRun(), content));
    expect(preview.resets).toEqual(
      expect.arrayContaining(['tool_lines', 'depth_growth', 'mine_levels', 'tree_levels']),
    );
    expect(preview.persists).toEqual(
      expect.arrayContaining([
        'workers',
        'forge',
        'star_dust',
        'stage_stars',
        'wishlist',
        'skill_tree',
      ]),
    );
  });
});
