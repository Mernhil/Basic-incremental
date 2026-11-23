import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  createSaveText,
  MIGRATIONS,
  readSave,
  slotWorkers,
} from '../src/game';
import { content, freshState } from './helpers';

/**
 * Save format 42 (DESIGN.md section 2 Base camp): the camp replaces trees, mines, tool lines, the
 * milestone picks on them, the production presets and the autobuyers. The conversion is
 * level = 1 + floor(worth / 10), worth = tree and mine levels + half the tool levels + 5 a pick
 * that is not a Training line's, at most 40.
 */

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A format 40 state as far as the migration reads it. */
function old(extra: Raw = {}): Raw {
  return {
    resources: { oak_gem: '5000', copper_gem: '300', starlight: '10', money: '40' },
    production: {
      unlockedTrees: ['ironbark'],
      treeLevels: { oak: 30, ironbark: 10 },
      mineLevels: { copper_quarry: 20 },
      tools: { logging_yield: 10, mining_speed: 4 },
      depth: { oak: { layer: 2, progress: '5' } },
      harvestGauges: { oak: { gauge: 3, timer: 0 } },
      workers: {
        oak: ['apprentice_feller'],
        ironbark: ['grove_keeper'],
        copper_quarry: ['cave_digger'],
      },
      forge: { recipe: null, progress: '0', worker: null },
    },
    upgrades: { picks: { oak_10: 'oak_10_output', sharpen_5: 'sharpen_5_cry' }, moneyEarned: '7' },
    automation: { treeLevels: true, mineLevels: false, reservePercent: 20 },
    presets: {
      dungeons: {},
      production: { logging: [null, null, null], mining: [null, null, null] },
    },
    prestige: {
      runStart: {},
      shop: { second_hands: 1, timber_steward: 1, vein_steward: 1 },
      starlightEarned: '3',
    },
    ...extra,
  };
}

describe('v41 -> v42: the base camp', () => {
  const migrate = MIGRATIONS[41]!;

  it('is the current format or older', () => {
    expect(CURRENT_SAVE_VERSION).toBeGreaterThanOrEqual(42);
  });

  it('turns the levels, tool lines and picks into a camp level', () => {
    // worth = 30 + 10 + 20 (tree and mine levels) + (10 + 4) / 2 + 5 (the oak pick) = 72 -> level 8
    const out = migrate(old()) as Raw;
    expect(out['camp'].level).toBe(8);
  });

  it('starts at level 1 for an untouched save and caps the level at 40', () => {
    expect((migrate(old({ production: { forge: null } })) as Raw)['camp'].level).toBe(1);
    const huge = old();
    huge['production'].treeLevels = { oak: 100000 };
    expect((migrate(huge) as Raw)['camp'].level).toBe(40);
  });

  it('moves posted workers to slots, on the material of their old place, as far as slots go', () => {
    // level 8: three forest slots and two cave slots
    const out = migrate(old()) as Raw;
    expect(out['camp'].forest).toEqual([
      { material: 'oak', card: 'apprentice_feller' },
      { material: 'ironbark', card: 'grove_keeper' },
    ]);
    expect(out['camp'].cave).toEqual([{ material: 'copper_quarry', card: 'cave_digger' }]);
    // a level 1 camp has one slot of each: the second wood worker goes back to the collection
    const low = old();
    low['production'].treeLevels = {};
    low['production'].mineLevels = {};
    low['production'].tools = {};
    low['upgrades'].picks = {};
    low['prestige'].shop = {};
    const out1 = migrate(low) as Raw;
    expect(out1['camp'].level).toBe(1);
    expect(out1['camp'].forest).toEqual([{ material: 'oak', card: 'apprentice_feller' }]);
  });

  it('keeps stocks, drops the old parts and refunds the autobuyer items', () => {
    const out = migrate(old()) as Raw;
    expect(out['resources'].oak_gem).toBe('5000');
    expect(out['resources'].copper_gem).toBe('300');
    expect(Object.keys(out['production'])).toEqual(['forge']);
    expect(out['automation']).toBeUndefined();
    expect(out['presets'].production).toBeUndefined();
    // 10 Starlight held + 15 + 15 for the two autobuyers; the second-slot item stays
    expect(out['resources'].starlight).toBe('40');
    expect(out['prestige'].shop).toEqual({ second_hands: 1 });
    expect(out['dummy']).toEqual({ damage: '100', team: [null, null, null, null] });
  });

  it('a whole old save reads at the current format with its stock, camp and working cards', () => {
    const base = JSON.parse(createSaveText(freshState(), 1));
    base.version = 41;
    const o = old();
    base.state.resources = { ...base.state.resources, ...o['resources'] };
    base.state.production = o['production'];
    base.state.upgrades = o['upgrades'];
    base.state.automation = o['automation'];
    base.state.presets = o['presets'];
    base.state.prestige = o['prestige'];
    base.state.clearedDungeons = ['mossy_cellar'];
    delete base.state.camp;
    delete base.state.dummy;
    base.state.cards.owned['grove_keeper'] = structuredClone(
      base.state.cards.owned['apprentice_feller'],
    );
    const { state } = readSave(JSON.stringify(base), content);
    expect(state.camp.level).toBe(8);
    expect(state.resources['oak_gem']!.toNumber()).toBe(5000);
    expect(state.prestige.shop).toEqual({ second_hands: 1, auto_push: 1 });
    expect(slotWorkers(state, content).map((w) => [w.place, w.card, w.material.id])).toEqual([
      ['forest', 'apprentice_feller', 'oak'],
      ['forest', 'grove_keeper', 'ironbark'],
      ['cave', 'cave_digger', 'copper_quarry'],
    ]);
    expect(state.dummy.damage.toNumber()).toBe(100);
    // the milestone pick on Oak is gone with its line; the Training pick stays
    expect(state.upgrades.picks).toEqual({ sharpen_5: 'sharpen_5_cry' });
  });
});
