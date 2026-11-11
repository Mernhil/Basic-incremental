import { describe, expect, it } from 'vitest';
import {
  Decimal,
  cardEnhancements,
  cloneState,
  cosmeticMaxLevel,
  floorPosition,
  type GameState,
} from '../src/game';
import {
  buyerCandidates,
  greedyBuy,
  MILESTONES,
  runSim,
  formatTable,
  shouldAscend,
  fillEnhancements,
  markWishlist,
  chooseDungeon,
  ascendNow,
  summarizeRuns,
  formatSeedTable,
  targetRatio,
  bandCheck,
  bandsPass,
  ascensionGuard,
  formatGuard,
  formatRunTable,
  RUN_MILESTONES,
  IDLE_CHECKIN_SECONDS,
  choosePush,
  type RunRecord,
} from '../scripts/sim/sim';
import { loadContent } from '../src/data';
import {
  content,
  CRYSTAL_UNIT,
  floorsContent,
  freshState,
  levelPointsOnly,
  withDps,
} from './helpers';

/** First level price of a mine or tree (the shipped numbers are tuning, DESIGN.md §4). */
const firstLevel = (kind: 'mine' | 'tree', id: string): number =>
  (kind === 'mine' ? content.mineById : content.treeById).get(id)!.level.cost.base.toNumber();

const rich = (state: GameState, resource: string, amount: number): GameState => {
  state.resources[resource] = new Decimal(amount);
  return state;
};

/** Owns `id` (a copy of the starting squire's record, so a card of any rarity is in play) and
 *  leads the fighting loadout, or works the job's first tree or mine. */
const lead = (state: GameState, id: string, job: 'fighting' | 'logging' | 'mining'): void => {
  state.cards.owned[id] = { ...state.cards.owned['ember_squire']! };
  if (job === 'fighting') state.cards.loadouts.fighting.main = id;
  else state.production.workers[job === 'logging' ? 'oak' : 'copper_quarry'] = [id];
};

describe('balance sim: greedy buyer', () => {
  it('lists purchases with an ETA, 0 when affordable now', () => {
    const state = rich(freshState(), 'money', firstLevel('mine', 'copper_quarry'));
    const candidates = buyerCandidates(state, content);
    // The damage lines are gone: damage comes from cards, so nothing on the list is a damage buy.
    expect(candidates.some((c) => c.id.startsWith('damage:'))).toBe(false);
    // A Copper Quarry level is affordable now; a dearer Oak level is paid by the wage.
    expect(candidates.find((c) => c.id === 'mine:copper_quarry')?.eta).toBe(0);
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
    // The price of an Oak level buys it (the best gain per Money); a mine level costs less.
    const state = rich(freshState(), 'money', firstLevel('tree', 'oak'));
    const { state: after, bought } = greedyBuy(state, content);
    expect(bought).toContain('tree:oak');
    expect(after.production.treeLevels['oak']).toBe(1);
    expect(after.resources['money']!.toNumber()).toBe(0);
  });

  it('summons from a portal once a pull is affordable', () => {
    const state = rich(freshState(), 'summon_crystal', 10 * CRYSTAL_UNIT);
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
    const { state: after, bought } = greedyBuy(state, levelPointsOnly(content));
    expect(bought.filter((id) => id.startsWith('skill:'))).toHaveLength(2);
    expect(after.cards.owned['ember_squire']!.enhancements.length).toBeGreaterThan(0);
  });

  it('does nothing when nothing is affordable', () => {
    // no Money and no crystals (a new game holds one pull)
    const state = rich(freshState(), 'money', 0);
    state.resources['summon_crystal'] = new Decimal(0);
    const { bought } = greedyBuy(state, levelPointsOnly(content));
    expect(bought).toEqual([]);
  });
});

describe('balance sim: smarter buyer (Phase 9)', () => {
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
    expect(bought.some((id) => id.startsWith('mine:') || id.startsWith('tree:'))).toBe(true);
    expect(after.resources['iron_gem']!.toNumber()).toBe(600);
    expect(after.resources['moss_core']!.toNumber()).toBe(10);
  });

  it('keeps buying levels while a tier-up still waits for gems, and saves its Money once the gems are close', () => {
    const base = freshState();
    lead(base, 'storm_duelist', 'fighting'); // Epic: a card that can tier up
    const squire = base.cards.owned['storm_duelist']!;
    squire.level = 20; // at the Wood cap
    squire.stars = 6; // a tier-up also needs every star
    base.clearedDungeons = ['mossy_cellar']; // Iron Deeps opens
    base.production.unlockedTrees = ['ironbark', 'moonwillow'];
    base.resources['moss_core'] = new Decimal(10);
    const woodMoney = content.cardRules.tierUp.wood.fighting.find((p) => p.resource === 'money')!;
    const short = woodMoney.amount.mul(0.8); // short of the tier-up, so affordable levels are on offer
    base.resources['money'] = short;
    // The gems are far off: Money goes into levels.
    const far = greedyBuy(base, content);
    expect(far.state.resources['money']!.lt(short)).toBe(true);
    // The gems are in hand: Money is the only thing missing, so none of it is spent on levels.
    const ready = cloneState(base);
    for (const price of content.cardRules.tierUp.wood.fighting) {
      if (price.resource !== 'money' && price.resource !== 'moss_core') {
        ready.resources[price.resource] = price.amount;
      }
    }
    ready.resources['money'] = short;
    const near = greedyBuy(ready, content);
    expect(near.state.resources['money']!.eq(short)).toBe(true);
  });

  it('weighs a mine or tree level by the share of the production', () => {
    const state = rich(freshState(), 'money', 1e9);
    const candidates = buyerCandidates(state, content);
    const gain = (id: string): number => candidates.find((c) => c.id === id)!.gain!;
    expect(gain('mine:copper_quarry')).toBeGreaterThan(0);
    expect(gain('tree:oak')).toBeGreaterThan(0);
  });

  it('buys a star-up from the star bar alone: it needs no Cores to share', () => {
    const state = freshState();
    const feller = state.cards.owned['apprentice_feller']!;
    feller.starFill = content.cardRules.starBar.needs.common.wood;
    const { bought } = greedyBuy(state, content);
    expect(bought).toContain('star:apprentice_feller');
  });

  it('finishes the fighting lead first: a more advanced production card does not starve its tier-up of gems', () => {
    const state = freshState();
    lead(state, 'storm_duelist', 'fighting'); // Epic: it can reach Gold
    lead(state, 'geode_golem', 'mining'); // Legendary: it can reach Prismatic
    const squire = state.cards.owned['storm_duelist']!;
    squire.tier = 'silver';
    squire.level = 60; // at the Silver cap: Gold costs Money, Cinder Cores and gems
    squire.stars = 6;
    const digger = state.cards.owned['geode_golem']!;
    digger.tier = 'gold';
    digger.stars = 6;
    digger.level = 80; // further along, and its Prismatic step waits for Frost Cores
    state.resources['money'] = new Decimal(5e6);
    state.resources['cinder_core'] = new Decimal(10);
    state.resources['moonwillow_gem'] = new Decimal(100000);
    state.resources['grotto_gem'] = new Decimal(100000);
    expect(greedyBuy(state, content).bought).toContain('tier:storm_duelist');
  });

  it('lets a weaker card take its step while the lead is hours from its gems', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar'];
    state.production.unlockedTrees = []; // no Ironbark grows: the lead is hours (forever) away
    state.activeDungeonId = 'mossy_cellar';
    lead(state, 'storm_duelist', 'fighting'); // Epic: it can leave Wood
    lead(state, 'gem_cutter', 'mining'); // Rare: it can leave Wood
    state.cards.owned['storm_duelist']!.level = 20; // Wood cap: needs more Ironbark than it has
    state.cards.owned['storm_duelist']!.stars = 6;
    state.cards.owned['gem_cutter']!.stars = 6;
    state.cards.owned['gem_cutter']!.level = 20; // needs less Ironbark, and Iron
    const need = (job: 'fighting' | 'mining', gem: string) =>
      content.cardRules.tierUp.wood[job].find((p) => p.resource === gem)!.amount;
    expect(need('mining', 'ironbark_gem').lt(need('fighting', 'ironbark_gem'))).toBe(true);
    state.resources['money'] = new Decimal(2e5);
    state.resources['moss_core'] = new Decimal(6);
    state.resources['iron_gem'] = need('mining', 'iron_gem').mul(3);
    state.resources['ironbark_gem'] = need('mining', 'ironbark_gem');
    expect(greedyBuy(state, content).bought).toContain('tier:gem_cutter');
  });

  it('saves the Frost Cores for the lead card still levelling toward its tier-up', () => {
    const state = freshState();
    lead(state, 'dawnblade_regent', 'fighting'); // Legendary: it can reach Prismatic
    lead(state, 'geode_golem', 'mining');
    const squire = state.cards.owned['dawnblade_regent']!;
    squire.tier = 'gold';
    squire.stars = 6;
    squire.level = 70; // Gold cap 80: not ready, but its tier-up will need Frost Cores and Sigils
    const digger = state.cards.owned['geode_golem']!;
    digger.tier = 'gold';
    digger.stars = 6;
    digger.level = 80; // at the Gold cap: ready to tier up too
    const [, coreCost, sigilCost] = content.cardRules.tierUp.gold.fighting;
    state.resources['frost_core'] = new Decimal(coreCost!.amount);
    state.resources['frost_sigil'] = new Decimal(sigilCost!.amount).mul(2);
    state.resources['storm_core'] = new Decimal(1e6); // the Gold step also asks Thunderpeak's Core
    state.resources['moonwillow_gem'] = new Decimal(1e6);
    state.resources['grotto_gem'] = new Decimal(1e6);
    state.resources['money'] = new Decimal(1e9);
    state.resources['summon_crystal'] = new Decimal(0); // no pull mixed in
    const { bought } = greedyBuy(state, content);
    expect(bought).not.toContain('tier:geode_golem');
    state.resources['frost_core'] = new Decimal(coreCost!.amount).mul(2);
    expect(greedyBuy(state, content).bought).toContain('tier:geode_golem');
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
    const { state: after } = greedyBuy(state, levelPointsOnly(content));
    expect(after.account.skills).toEqual({ combat_s1: 2 });
  });

  it('picks the best enhancement set for the budget, rebuilt when the budget grows', () => {
    const state = freshState();
    const wood = fillEnhancements(state, content);
    expect(wood.cards.owned['ember_squire']!.enhancements).toEqual(['edge']);
    wood.cards.owned['ember_squire']!.tier = 'silver';
    const silver = fillEnhancements(wood, content);
    expect([...silver.cards.owned['ember_squire']!.enhancements].sort()).toEqual([
      'bulwark',
      'edge',
    ]);
    silver.cards.owned['ember_squire']!.tier = 'gold';
    silver.cards.owned['ember_squire']!.level = 20;
    const gold = fillEnhancements(silver, content);
    // the budget grows and the first milestone option has opened
    expect(gold.cards.owned['ember_squire']!.enhancements.length).toBeGreaterThanOrEqual(2);
    expect(cardEnhancements(gold, content, 'ember_squire')!.spent).toBeLessThanOrEqual(
      content.enhancements.budget.gold,
    );
  });

  it('marks the cards it is building on the wishlist, then unowned ones, up to the limit per rarity', () => {
    const state = markWishlist(freshState(), content);
    const portal = content.portals.find((p) => p.id === 'card_portal')!;
    expect(state.cards.wishlist.length).toBeGreaterThan(0);
    for (const rarity of ['common', 'rare', 'legendary']) {
      const marked = state.cards.wishlist.filter(
        (id) => content.cardById.get(id)!.rarity === rarity,
      );
      expect(marked.length).toBeLessThanOrEqual(portal.wishlistPerRarity);
    }
    // the lead (a Common below ★6) is hunted for its copies; the rest are cards it does not own
    expect(state.cards.wishlist).toContain('ember_squire');
    expect(
      state.cards.wishlist
        .filter((id) => content.cardById.get(id)!.rarity !== 'common')
        .every((id) => !state.cards.owned[id]),
    ).toBe(true);
    // a card it comes to own leaves the list
    const id = state.cards.wishlist.find((x) => content.cardById.get(x)!.rarity === 'rare')!;
    state.cards.owned[id] = { ...state.cards.owned['ember_squire']! };
    expect(markWishlist(state, content).cards.wishlist).not.toContain(id);
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
    const squire = state.cards.owned['ember_squire']!;
    squire.level = 20;
    squire.starFill = 1;
    // Strong enough to kill the Cinder Lich in good time.
    expect(chooseDungeon(state, withDps(1e6, content))).toBe('ember_crypt');
  });

  it('keeps farming Cores while the next boss would take over ten minutes to kill', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar'];
    lead(state, 'storm_duelist', 'fighting'); // Epic: its Wood step is waiting for Moss Cores
    const squire = state.cards.owned['storm_duelist']!;
    squire.level = 20;
    squire.stars = 6;
    squire.starFill = 1;
    // Harmless boss, so only the kill time decides; a ★6 squire needs a sturdier one to take
    // over ten minutes.
    const boss = content.dungeonById.get('ember_crypt')!.boss;
    const { damage } = boss.attack;
    const { hp } = boss;
    boss.attack.damage = new Decimal(0);
    boss.hp = hp.mul(100);
    try {
      expect(chooseDungeon(state, content)).toBe('mossy_cellar');
    } finally {
      boss.attack.damage = damage;
      boss.hp = hp;
    }
  });

  it('farms the cleared Glimmer Trial for cosmetic materials only within its time share', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt', 'glimmer_trial'];
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

  it('takes the first Ascension as soon as the minimum gain is there, without waiting for a peak', () => {
    const tracker = { peakRate: 0 };
    expect(ascendNow({ gain: 9, minimum: 10, runSeconds: 3600, earned: 0 }, tracker)).toBe(false);
    expect(ascendNow({ gain: 10, minimum: 10, runSeconds: 7200, earned: 0 }, tracker)).toBe(true);
    // Later Ascensions still wait for the rate to pass its peak.
    const later = { peakRate: 0 };
    expect(ascendNow({ gain: 10, minimum: 10, runSeconds: 3600, earned: 10 }, later)).toBe(false);
  });

  it('ascends again only once the gain at least matches all the Starlight earned so far', () => {
    const tracker = { peakRate: 100 };
    // The rate is long past its peak, but 30 would add less than the 50 already earned.
    expect(ascendNow({ gain: 30, minimum: 10, runSeconds: 36000, earned: 50 }, tracker)).toBe(
      false,
    );
    expect(ascendNow({ gain: 50, minimum: 10, runSeconds: 36000, earned: 50 }, tracker)).toBe(true);
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
      worst: 3000,
      worstRun: 2,
    });
    // Unreached counts as the end of the run for the median.
    expect(summary['clear_d2']).toEqual({
      median: 9000,
      min: 7000,
      max: 9000,
      reached: 2,
      runs: 3,
      // A run that never reached it is the worst one.
      worst: null,
      worstRun: 0,
    });
  });

  it('names the worst seed, and "never" for a seed that did not get there', () => {
    const summary = summarizeRuns([
      { clear_d1: 900, clear_d2: 7000 },
      { clear_d1: 1200, clear_d2: null },
    ]);
    const table = formatSeedTable(summary, 36000, { seeds: [4, 5] });
    expect(table).toContain('| 0.33 h (seed 5) |');
    expect(table).toContain('| never (seed 5) |');
  });

  it('checks the bands: median within 25% of the target and the worst seed within 2x', () => {
    const d1 = MILESTONES.find((m) => m.id === 'clear_d1')!; // target 0.25 h = 900 s
    const spread = (times: (number | null)[]) =>
      summarizeRuns(times.map((t) => ({ clear_d1: t })))['clear_d1']!;
    expect(bandCheck(d1, spread([800, 900, 1000]))).toEqual({ median: true, worst: true });
    // The median is fine but one seed takes more than twice the target.
    expect(bandCheck(d1, spread([800, 900, 1900]))).toEqual({ median: true, worst: false });
    // A stalled seed fails the worst check even when the median is on target.
    expect(bandCheck(d1, spread([800, 900, null]))).toEqual({ median: true, worst: false });
    expect(bandCheck(d1, spread([300, 320, 340]))).toEqual({ median: false, worst: true });
    expect(bandsPass({ clear_d1: spread([800, 900, 1000]) })).toBe(true);
    expect(bandsPass({ clear_d1: spread([800, 900, null]) })).toBe(false);
    const table = formatSeedTable({ clear_d1: spread([800, 900, null]) }, 3600);
    expect(table).toContain('| FAIL worst |');
    expect(table).toContain('Bands: 0 of 1 milestones pass');
  });

  it('prints the idle profile beside the active one', () => {
    const active = summarizeRuns([{ clear_d1: 900 }]);
    const idle = summarizeRuns([{ clear_d1: 3600 }]);
    const table = formatSeedTable(active, 7200, { seeds: [1], idle });
    expect(table).toContain('| Idle median | Idle worst seed |');
    expect(table).toContain('| ok | 1.00 h | 1.00 h (seed 1) |');
  });

  it('prints target, median, spread and the ratio to the target', () => {
    const summary = summarizeRuns([{ clear_d1: 1800, first_summon: 540 }]);
    const table = formatSeedTable(summary, 3600);
    expect(table).toContain('| First dungeon cleared | 0.25 h | 0.50 h |');
    expect(table).toContain('200%');
    // A target range reads 100% anywhere inside it.
    expect(table).toMatch(/| First summon | 0.125-0.1d* h | 0.15 h |.*| 100% |/);
  });
});

describe('balance sim: run', () => {
  it('lists the DESIGN §14 milestones with their targets', () => {
    const first = MILESTONES.find((m) => m.id === 'clear_d1');
    expect(first?.targetHours).toBe(0.25);
    expect(MILESTONES.map((m) => m.targetHours)).toContain(40);
  });

  it('counts the first ★6 of any card, since every star now takes copies', () => {
    const star6 = MILESTONES.find((m) => m.id === 'first_star6')!;
    const log = { summons: 0, levelAt: {}, ascensions: [], fought: {} };
    const shipped = loadContent();
    const state = freshState();
    expect(star6.reached(state, shipped, log)).toBe(false);
    state.cards.owned['gem_cutter'] = { ...state.cards.owned['ember_squire']!, stars: 6 };
    expect(star6.reached(state, shipped, log)).toBe(true);
  });

  it('does not count a one-level UI skin as a max-level cosmetic', () => {
    const maxCosmetic = MILESTONES.find((m) => m.id === 'max_cosmetic')!;
    const log = { summons: 0, levelAt: {}, ascensions: [], fought: {} };
    const state = freshState();
    state.cosmetics.owned['nodes_b'] = { level: 1, copies: 0 };
    expect(cosmeticMaxLevel(content, content.cosmeticById.get('nodes_b')!)).toBe(1);
    expect(maxCosmetic.reached(state, content, log)).toBe(false);
  });

  it('calls the content exhausted only with every card owned and a card at the Mythic tier', () => {
    const exhausted = MILESTONES.find((m) => m.id === 'exhausted')!;
    const log = { summons: 1, levelAt: {}, ascensions: [], fought: {} };
    const state = freshState();
    for (const card of content.cards) {
      state.cards.owned[card.id] ??= { ...state.cards.owned['ember_squire']! };
    }
    state.clearedDungeons = [...content.dungeons, ...content.trials].map((d) => d.id);
    state.prestigeCount = 1;
    // ... with a Hard and a Nightmare boss beaten somewhere (the three new dungeons wait for
    // their themes and do not count).
    const first = content.dungeons[0]!;
    state.combat.floors[first.id] = {
      difficulty: 'normal',
      mode: 'farm',
      tiers: {
        normal: { floor: first.floors, best: first.floors },
        hard: { floor: first.floors, best: first.floors },
        nightmare: { floor: first.floors, best: first.floors },
      },
    };
    state.cards.owned['moonwood_dryad']!.tier = 'prismatic'; // Mythic: it can go on to T6
    state.cards.owned['moonwood_dryad']!.stars = 6;
    state.cosmetics.owned['holo_hex'] = {
      level: cosmeticMaxLevel(content, content.cosmeticById.get('holo_hex')!),
      copies: 0,
    };
    expect(exhausted.reached(state, content, log)).toBe(false);
    state.cards.owned['moonwood_dryad']!.tier = 'mythic';
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

  it('plays the shipped opening: the starter pull at once, the first clear by its target', () => {
    // The shipped numbers, not the pinned test content. A new game holds one pull (DESIGN.md §3),
    // so the first summon comes in the first step; the opening running ahead of its §14 targets
    // is accepted until the Scope 3 retune (DESIGN.md §16), but never behind them.
    const result = runSim(loadContent(), { hours: 1, seed: 1, stepSeconds: 10 });
    expect(result.hits['first_summon']).not.toBeNull();
    expect(result.hits['first_summon']!).toBeLessThanOrEqual(60);
    const clear = MILESTONES.find((m) => m.id === 'clear_d1')!;
    expect(result.hits['clear_d1']).not.toBeNull();
    expect(targetRatio(clear, result.hits['clear_d1']! / 3600)).toBeLessThan(125);
  }, 30_000);

  it('samples the fighting DPS every quarter hour for the tuning report', () => {
    const result = runSim(content, { hours: 1.1, seed: 1, stepSeconds: 10 });
    expect(result.dpsSamples.map(([t]) => t)).toEqual([900, 1800, 2700, 3600]);
    expect(result.dpsSamples[3]![1]).toBeGreaterThan(result.dpsSamples[0]![1]);
  }, 30_000);

  it('prints a markdown table with one row per milestone', () => {
    const result = runSim(content, { hours: 0.05, seed: 1, stepSeconds: 10 });
    const table = formatTable(result);
    expect(table.split('\n').filter((l) => l.startsWith('| ')).length).toBe(MILESTONES.length + 1);
    expect(table).toContain('First dungeon cleared');
  });

  it('calls the probe every probeSeconds with the state and the sim time', () => {
    const seen: number[] = [];
    runSim(content, {
      hours: 0.02,
      seed: 1,
      stepSeconds: 10,
      probeSeconds: 20,
      probe: (_state, t) => seen.push(t),
    });
    expect(seen).toEqual([20, 40, 60]);
  });
});

describe('balance sim: runs and the Ascension guard', () => {
  const run = (start: number, end: number, hits: Record<string, number | null>): RunRecord => ({
    start,
    end,
    hits: { ...Object.fromEntries(RUN_MILESTONES.map((m) => [m.id, null])), ...hits },
  });

  it('has five run milestones', () => {
    expect(RUN_MILESTONES).toHaveLength(5);
  });

  it('passes when every later run reaches each shared milestone sooner', () => {
    const guard = ascensionGuard([
      run(0, 20000, { run_money_1e4: 600, run_money_1e5: 3000 }),
      run(20000, 30000, { run_money_1e4: 60, run_money_1e5: 900, run_money_1e6: 2000 }),
    ]);
    expect(guard).toEqual({ compared: 2, misses: [] });
  });

  it('reports a milestone that took longer than in the run before', () => {
    const guard = ascensionGuard([
      run(0, 20000, { run_money_1e4: 600 }),
      run(20000, 30000, { run_money_1e4: 700 }),
    ]);
    expect(guard.misses).toEqual([{ run: 2, id: 'run_money_1e4', before: 600, after: 700 }]);
    expect(
      formatGuard([
        {
          seed: 3,
          runs: [run(0, 1, { run_money_1e4: 600 }), run(1, 9000, { run_money_1e4: 700 })],
        },
      ]),
    ).toContain('seed 3, run 2: 10K Money took 11.7 min (the run before: 10.0 min)');
  });

  it('counts a milestone never reached as slower only when the run had the time', () => {
    const short = ascensionGuard([run(0, 20000, { run_money_1e4: 600 }), run(20000, 20300, {})]);
    expect(short).toEqual({ compared: 0, misses: [] });
    const long = ascensionGuard([run(0, 20000, { run_money_1e4: 600 }), run(20000, 30000, {})]);
    expect(long.misses).toEqual([{ run: 2, id: 'run_money_1e4', before: 600, after: null }]);
  });

  it('records the first run from the start of the sim and prints one row per run', () => {
    const result = runSim(content, { hours: 0.2, seed: 1, stepSeconds: 10 });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]!.start).toBe(0);
    expect(result.runs[0]!.end).toBe(720);
    expect(Object.keys(result.runs[0]!.hits)).toEqual(RUN_MILESTONES.map((m) => m.id));
    expect(formatRunTable(result.runs).split('\n')).toHaveLength(3);
  });
});

describe('balance sim: idle profile', () => {
  it('leaves the active profile untouched', () => {
    const plain = runSim(content, { hours: 0.5, seed: 3, stepSeconds: 10 });
    const active = runSim(content, { hours: 0.5, seed: 3, stepSeconds: 10, profile: 'active' });
    expect(active.hits).toEqual(plain.hits);
    expect(active.state.resources['money']!.eq(plain.state.resources['money']!)).toBe(true);
  }, 30_000);

  it('buys only at its check-ins, every 30 minutes', () => {
    // The starter pull is spent at the first check-in (t = 0); crystals earned afterwards wait
    // for the next one.
    const before = runSim(loadContent(), { hours: 0.45, seed: 1, profile: 'idle' });
    expect(before.simSeconds).toBe(0.45 * 3600);
    expect(before.simSeconds).toBeLessThan(IDLE_CHECKIN_SECONDS);
    expect(before.log.summons).toBe(1);
    const after = runSim(loadContent(), { hours: 0.55, seed: 1, profile: 'idle' });
    expect(after.log.summons).toBeGreaterThan(1);
  }, 30_000);

  it("is offline for 8 hours after 16 hours awake, on the game's own offline progress", () => {
    const result = runSim(loadContent(), { hours: 24, seed: 1, profile: 'idle' });
    expect(result.simSeconds).toBe(24 * 3600);
    // The night was one offline session of the capped 8 hours.
    expect(result.state.stats.longestOfflineMs).toBe(8 * 3600 * 1000);
  }, 120_000);

  it('is deterministic for a seed', () => {
    const a = runSim(content, { hours: 2, seed: 5, profile: 'idle' });
    const b = runSim(content, { hours: 2, seed: 5, profile: 'idle' });
    expect(a.hits).toEqual(b.hits);
  }, 60_000);
});

describe('balance sim: floors', () => {
  it('pushes again once the next floor is one the loadout wins, and not into a wall', () => {
    const floors = floorsContent;
    const knocked = (): GameState => {
      const state = freshState();
      state.combat.floors['mossy_cellar'] = {
        difficulty: 'normal',
        mode: 'farm',
        tiers: { normal: { floor: 3, best: 3 } },
      };
      return state;
    };
    // A strong loadout wins floor 4 with room to spare: back to pushing.
    const strong = choosePush(knocked(), withDps(1e6, floors));
    expect(floorPosition(strong, floors.dungeonById.get('mossy_cellar')!).mode).toBe('push');
    // A bare-handed one would fall first: it keeps farming.
    const weak = choosePush(knocked(), withDps(0.01, floors));
    expect(floorPosition(weak, floors.dungeonById.get('mossy_cellar')!).mode).toBe('farm');
  });

  it('reaches the Ember Crypt through the ten floors of the Mossy Cellar', () => {
    const result = runSim(loadContent(), { hours: 0.5, seed: 2, stepSeconds: 10 });
    expect(result.hits['clear_d1']).not.toBeNull();
    const cellar = floorPosition(result.state, loadContent().dungeonById.get('mossy_cellar')!);
    expect(cellar.best).toBe(10);
  }, 30_000);
});
