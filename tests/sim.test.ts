import { describe, expect, it } from 'vitest';
import { Decimal, cosmeticMaxLevel, damageLevel, type GameState } from '../src/game';
import {
  buyerCandidates,
  greedyBuy,
  MILESTONES,
  runSim,
  formatTable,
  shouldAscend,
  fillEnhancements,
  chooseDungeon,
  ascendNow,
  summarizeRuns,
  formatSeedTable,
} from '../scripts/sim/sim';
import { content, freshState } from './helpers';

const rich = (state: GameState, resource: string, amount: number): GameState => {
  state.resources[resource] = new Decimal(amount);
  return state;
};

describe('balance sim: greedy buyer', () => {
  it('lists purchases with an ETA, 0 when affordable now', () => {
    const state = rich(freshState(), 'money', 10);
    const candidates = buyerCandidates(state, content);
    const copperEdge = candidates.find((c) => c.id === 'damage:copper_edge');
    expect(copperEdge?.eta).toBe(0);
    // Iron Edge waits for Iron Deeps; an Oak level (20 Money) is paid by the wage being earned.
    expect(candidates.find((c) => c.id === 'damage:iron_edge')).toBeUndefined();
    const oak = candidates.find((c) => c.id === 'tree:oak');
    expect(oak?.eta).toBeGreaterThan(0);
    expect(Number.isFinite(oak!.eta!)).toBe(true);
    // Plots, slots and expansions are gone.
    expect(candidates.some((c) => c.id.startsWith('expand:'))).toBe(false);
    // Nothing earns Glamour Crystals before a kill, so a Wardrobe Gate pull is out of reach.
    const gate = candidates.find((c) => c.id === 'summon:wardrobe_gate');
    expect(gate?.eta === null || gate!.eta! > 0).toBe(true);
  });

  it('buys the cheapest affordable purchase first, then keeps buying', () => {
    // 10 Money buys Copper Edge (10); a mine level costs 15 and an Oak level 20.
    const state = rich(freshState(), 'money', 10);
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought).toContain('damage:copper_edge');
    expect(damageLevel(after, 'copper_edge')).toBe(1);
    expect(after.resources['money']!.toNumber()).toBe(0);
  });

  it('summons from a portal once a pull is affordable', () => {
    const state = rich(freshState(), 'summon_crystal', 10);
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought).toContain('summon:card_portal');
    expect(after.portals['card_portal']?.pulls).toBe(1);
    expect(MILESTONES.find((m) => m.id === 'first_summon')?.pending).toBeUndefined();
  });

  it('ascends once the gain is worth it, then spends the Starlight', () => {
    const state = freshState();
    state.mastery.harvested['oak_gem'] = new Decimal(1e9);
    expect(shouldAscend(state, content)).toBe(true);
    expect(shouldAscend(freshState(), content)).toBe(false);
    const rich = freshState();
    rich.resources['starlight'] = new Decimal(100);
    const { bought } = greedyBuy(rich, content);
    expect(bought.some((id) => id.startsWith('starlight:'))).toBe(true);
    expect(MILESTONES.find((m) => m.id === 'first_prestige')?.pending).toBeUndefined();
  });

  it('upgrades a cosmetic once it has the copy and the material, and equips it', () => {
    const state = freshState();
    state.cosmetics.owned['holo_hex'] = { level: 1, copies: 1 };
    state.resources['glimmer_dust'] = new Decimal(1000);
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought).toContain('cosmetic:holo_hex');
    expect(after.cosmetics.owned['holo_hex']!.level).toBe(2);
    expect(MILESTONES.find((m) => m.id === 'max_cosmetic')?.pending).toBeUndefined();
  });

  it('spends skill points and fills card enhancement budgets', () => {
    const state = freshState();
    state.account.level = 3;
    state.cards.owned['ember_squire']!.tier = 'silver';
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought.filter((id) => id.startsWith('skill:'))).toHaveLength(2);
    expect(after.cards.owned['ember_squire']!.enhancements.length).toBeGreaterThan(0);
  });

  it('does nothing when nothing is affordable', () => {
    const { bought } = greedyBuy(rich(freshState(), 'money', 0), content);
    expect(bought).toEqual([]);
  });
});

describe('balance sim: smarter buyer (Phase 9)', () => {
  it('values an economy purchase by its gain: the first Copper Edge level doubles damage', () => {
    const state = rich(freshState(), 'money', 10);
    const edge = buyerCandidates(state, content).find((c) => c.id === 'damage:copper_edge');
    expect(edge?.gain).toBeCloseTo(1);
  });

  it('offers a bulk buy up to the next milestone, valued with the x2', () => {
    const state = rich(freshState(), 'money', 1e6);
    state.combat.damageLevels['copper_edge'] = 20;
    const bulk = buyerCandidates(state, content).find((c) => c.id === 'damage:copper_edge:x5');
    expect(bulk).toBeDefined();
    // 21 -> 25 levels with the x2: from 1 + 20 to 1 + 50 damage.
    expect(bulk!.gain).toBeCloseTo(30 / 21);
  });

  it('spends Money on the economy and leaves the gems to the card upgrades waiting for them', () => {
    const state = freshState();
    const squire = state.cards.owned['ember_squire']!;
    squire.stars = 6;
    squire.level = 40;
    state.resources['moss_core'] = new Decimal(10);
    state.resources['iron_gem'] = new Decimal(600);
    state.resources['money'] = new Decimal(1e5);
    state.clearedDungeons = ['mossy_cellar'];
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought.some((id) => id.startsWith('damage:'))).toBe(true);
    expect(after.resources['iron_gem']!.toNumber()).toBe(600);
    expect(after.resources['moss_core']!.toNumber()).toBe(10);
  });

  it('weighs a mine or tree level against damage by the share of the production', () => {
    const state = rich(freshState(), 'money', 1e9);
    const candidates = buyerCandidates(state, content);
    const gain = (id: string): number => candidates.find((c) => c.id === id)!.gain!;
    // The first Copper Edge level doubles the damage; no production purchase beats that.
    expect(gain('damage:copper_edge')).toBeGreaterThan(gain('mine:copper_quarry'));
    expect(gain('damage:copper_edge')).toBeGreaterThan(gain('tree:oak'));
    expect(gain('tree:oak')).toBeGreaterThan(0);
  });

  it('keeps Cores for the most advanced card instead of spreading them over weaker ones', () => {
    const state = freshState();
    const squire = state.cards.owned['ember_squire']!;
    squire.stars = 5;
    squire.level = 36;
    squire.duplicates = 1;
    const feller = state.cards.owned['apprentice_feller']!;
    feller.level = 20;
    feller.duplicates = 1;
    state.resources['moss_core'] = new Decimal(3); // ★5 to ★6 needs 10; ★1 to ★2 needs 1
    const { bought } = greedyBuy(state, content);
    expect(bought).not.toContain('star:apprentice_feller');
  });

  it('saves the Frost Cores for the lead card still levelling toward its tier-up', () => {
    const state = freshState();
    const squire = state.cards.owned['ember_squire']!;
    squire.tier = 'gold';
    squire.stars = 6;
    squire.level = 70; // Gold cap 80: not ready, but its tier-up will need Frost Cores and Sigils
    const digger = state.cards.owned['cave_digger']!;
    digger.tier = 'gold';
    digger.stars = 1;
    digger.level = 60; // at the Gold ★1 cap
    digger.duplicates = 1;
    const [coreCost, sigilCost] = content.cardRules.tierUp.gold.fighting;
    state.resources['frost_core'] = new Decimal(coreCost!.amount);
    state.resources['frost_sigil'] = new Decimal(sigilCost!.amount);
    state.resources['moonwillow_gem'] = new Decimal(1e6);
    state.resources['grotto_gem'] = new Decimal(1e6);
    state.resources['money'] = new Decimal(0);
    const { bought } = greedyBuy(state, content);
    expect(bought).not.toContain('star:cave_digger');
    state.resources['frost_core'] = new Decimal(coreCost!.amount).add(1);
    expect(greedyBuy(state, content).bought).toContain('star:cave_digger');
  });

  it('saves the Glimmer Dust for the cosmetic closest to its top level', () => {
    const state = freshState();
    state.cosmetics.owned['holo_hex'] = { level: 2, copies: 1 }; // next step: accent, 600 Dust
    state.cosmetics.owned['holo_waves'] = { level: 1, copies: 1 }; // next step: shape, 300 Dust
    state.resources['glimmer_dust'] = new Decimal(400);
    const { bought } = greedyBuy(state, content);
    expect(bought).not.toContain('cosmetic:holo_waves');
  });

  it('spends skill points by priority (Might before the data order)', () => {
    const state = freshState();
    state.account.level = 3;
    const { state: after } = greedyBuy(state, content);
    expect(after.account.skills).toEqual({ might: 2 });
  });

  it('picks the best enhancement set for the budget, rebuilt when the budget grows', () => {
    const state = freshState();
    state.cards.owned['ember_squire']!.tier = 'silver';
    const silver = fillEnhancements(state, content);
    expect(silver.cards.owned['ember_squire']!.enhancements).toEqual(['edge']);
    silver.cards.owned['ember_squire']!.tier = 'gold';
    const gold = fillEnhancements(silver, content);
    expect([...gold.cards.owned['ember_squire']!.enhancements].sort()).toEqual(['bulwark', 'edge']);
  });

  it('equips a complete cosmetic set for its bonus', () => {
    const state = freshState();
    for (const c of content.cosmetics.filter((c) => c.set === 'gilded_tradition')) {
      state.cosmetics.owned[c.id] = { level: 1, copies: 0 };
    }
    const { state: after } = greedyBuy(state, content);
    expect(after.cosmetics.loadout.slots['attack']?.id).toBe('gt_attack');
  });
});

describe('balance sim: where to fight', () => {
  it('pushes a newly killable dungeon before farming Cores for a waiting star-up', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar'];
    state.combat.damageLevels['crystal_edge'] = 300;
    const squire = state.cards.owned['ember_squire']!;
    squire.level = 20;
    squire.duplicates = 1;
    expect(chooseDungeon(state, content)).toBe('ember_crypt');
  });

  it('keeps farming Cores while the next boss would take over ten minutes to kill', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar'];
    state.combat.damageLevels['iron_edge'] = 60; // Ember Crypt: about 2600 s per kill
    const squire = state.cards.owned['ember_squire']!;
    squire.level = 20;
    squire.duplicates = 1;
    // Harmless boss, so only the kill time decides.
    const attack = content.dungeonById.get('ember_crypt')!.boss.attack;
    const damage = attack.damage;
    attack.damage = new Decimal(0);
    try {
      expect(chooseDungeon(state, content)).toBe('mossy_cellar');
    } finally {
      attack.damage = damage;
    }
  });

  it('farms the cleared Glimmer Trial for cosmetic materials only within its time share', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt', 'glimmer_trial'];
    state.combat.damageLevels['copper_edge'] = 100;
    state.cosmetics.owned['holo_hex'] = { level: 1, copies: 1 };
    expect(chooseDungeon(state, content, { trialShare: 0 })).toBe('glimmer_trial');
    expect(chooseDungeon(state, content, { trialShare: 0.9 })).not.toBe('glimmer_trial');
  });
});

describe('balance sim: ascension decision', () => {
  it('ascends once the Starlight per hour of the run has passed its peak', () => {
    const tracker = { peakRate: 0 };
    // Rate rising: 10/h, 15/h, then falling to 12/h (90% of the peak or less is past it).
    expect(ascendNow({ gain: 10, minimum: 10, runSeconds: 3600 }, tracker)).toBe(false);
    expect(ascendNow({ gain: 30, minimum: 10, runSeconds: 7200 }, tracker)).toBe(false);
    expect(ascendNow({ gain: 36, minimum: 10, runSeconds: 10800 }, tracker)).toBe(true);
  });

  it('never ascends below the minimum gain', () => {
    const tracker = { peakRate: 100 };
    expect(ascendNow({ gain: 5, minimum: 10, runSeconds: 36000 }, tracker)).toBe(false);
  });
});

describe('balance sim: several seeds', () => {
  it('reports the median and spread of each milestone, unreached runs counted as not reached', () => {
    const runs = [
      { clear_d1: 1000, clear_d2: null },
      { clear_d1: 2000, clear_d2: 9000 },
      { clear_d1: 3000, clear_d2: 7000 },
    ];
    const summary = summarizeRuns(runs);
    expect(summary['clear_d1']).toEqual({
      median: 2000,
      min: 1000,
      max: 3000,
      reached: 3,
      runs: 3,
    });
    // Unreached counts as the end of the run for the median.
    expect(summary['clear_d2']).toEqual({
      median: 9000,
      min: 7000,
      max: 9000,
      reached: 2,
      runs: 3,
    });
  });

  it('prints target, median, spread and the ratio to the target', () => {
    const summary = summarizeRuns([{ clear_d1: 1800 }]);
    const table = formatSeedTable(summary, 3600);
    expect(table).toContain('| First dungeon cleared | 0.5 h | 0.50 h |');
    expect(table).toContain('100%');
  });
});

describe('balance sim: run', () => {
  it('lists the DESIGN §14 milestones with their targets', () => {
    const first = MILESTONES.find((m) => m.id === 'clear_d1');
    expect(first?.targetHours).toBe(0.5);
    expect(MILESTONES.map((m) => m.targetHours)).toContain(40);
  });

  it('counts the first ★6 only once a Gold card reaches it (the unique evolution)', () => {
    const star6 = MILESTONES.find((m) => m.id === 'first_star6')!;
    const log = { summons: 0, levelAt: {}, ascensions: [], fought: {} };
    const state = freshState();
    const owned = state.cards.owned['ember_squire']!;
    owned.stars = 6;
    owned.tier = 'silver';
    expect(star6.reached(state, content, log)).toBe(false);
    owned.tier = 'gold';
    expect(star6.reached(state, content, log)).toBe(true);
  });

  it('calls the content exhausted only with every card owned and a Prismatic ★6 card', () => {
    const exhausted = MILESTONES.find((m) => m.id === 'exhausted')!;
    const log = { summons: 1, levelAt: {}, ascensions: [], fought: {} };
    const state = freshState();
    for (const card of content.cards) {
      state.cards.owned[card.id] ??= { ...state.cards.owned['ember_squire']! };
    }
    state.clearedDungeons = [...content.dungeons, ...content.trials].map((d) => d.id);
    state.prestigeCount = 1;
    state.cards.owned['ember_squire']!.tier = 'gold';
    state.cards.owned['ember_squire']!.stars = 6;
    state.cards.owned['apprentice_feller']!.tier = 'prismatic';
    state.cards.owned['apprentice_feller']!.stars = 5;
    state.cosmetics.owned['holo_hex'] = {
      level: cosmeticMaxLevel(content, content.cosmeticById.get('holo_hex')!),
      copies: 0,
    };
    expect(exhausted.reached(state, content, log)).toBe(false);
    state.cards.owned['apprentice_feller']!.stars = 6;
    expect(exhausted.reached(state, content, log)).toBe(true);
  });

  it('is deterministic for a seed and records milestone times', () => {
    const a = runSim(content, { hours: 1, seed: 7, stepSeconds: 10 });
    const b = runSim(content, { hours: 1, seed: 7, stepSeconds: 10 });
    expect(a.hits).toEqual(b.hits);
    expect(a.simSeconds).toBe(3600);
    // The first boss falls well within the first hour of greedy play.
    expect(a.hits['clear_d1']).not.toBeNull();
    expect(a.hits['clear_d1']!).toBeLessThan(3600);
    // Two simulated hours of the real game: slower than a unit test, notably on CI runners.
  }, 30_000);

  it('samples the fighting DPS every half hour for the tuning report', () => {
    const result = runSim(content, { hours: 1.1, seed: 1, stepSeconds: 10 });
    expect(result.dpsSamples.map(([t]) => t)).toEqual([1800, 3600]);
    expect(result.dpsSamples[1]![1]).toBeGreaterThan(result.dpsSamples[0]![1]);
  }, 30_000);

  it('prints a markdown table with one row per milestone', () => {
    const result = runSim(content, { hours: 0.05, seed: 1, stepSeconds: 10 });
    const table = formatTable(result);
    expect(table.split('\n').filter((l) => l.startsWith('| ')).length).toBe(MILESTONES.length + 1);
    expect(table).toContain('First dungeon cleared');
  });
});
