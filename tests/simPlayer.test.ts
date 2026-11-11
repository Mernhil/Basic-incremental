import { describe, expect, it } from 'vitest';
import {
  Decimal,
  activeWorkers,
  collectModifiers,
  createSeededRng,
  forgeWorker,
  isProducerUnlocked,
  mineLevel,
  mineLevelCost,
  stageKey,
  type GameState,
} from '../src/game';
import {
  ECONOMY_RUN,
  ascendNow,
  buyAgain,
  buyerCandidates,
  buildOrder,
  chooseLead,
  chooseAutomation,
  chooseOverflow,
  chooseRespec,
  fastestFarm,
  forgePlan,
  markWishlist,
  nextSkill,
  placeBestWorkers,
  skillValue,
  spendShards,
  spendStarDust,
  starFarm,
  toolGain,
  workerPicks,
} from '../scripts/sim/sim';
import { content, freshState, withDps } from './helpers';

/** Owns `id` as a copy of the squire's record (Wood ★1 Lv 1), optionally changed. */
const own = (
  state: GameState,
  id: string,
  patch: Partial<GameState['cards']['owned'][string]> = {},
) => {
  state.cards.owned[id] = { ...state.cards.owned['ember_squire']!, ...patch };
};

describe('sim player: the card it builds', () => {
  it('hunts the card it is building: the fighting lead is on the wishlist until ★6', () => {
    const state = freshState();
    own(state, 'seraph_lancer'); // Mythic
    state.cards.loadouts.fighting.main = 'seraph_lancer';
    const marked = markWishlist(state, content);
    expect(marked.cards.wishlist).toContain('seraph_lancer');
    // the other Mythic mark goes to a card it does not own yet
    const mythics = marked.cards.wishlist.filter(
      (id) => content.cardById.get(id)!.rarity === 'mythic',
    );
    expect(mythics.filter((id) => !marked.cards.owned[id])).toHaveLength(mythics.length - 1);
    marked.cards.owned['seraph_lancer']!.stars = 6; // copies would only become shards now
    expect(markWishlist(marked, content).cards.wishlist).not.toContain('seraph_lancer');
  });

  it('builds the lead first, then its supports, then the strongest workers', () => {
    const state = freshState();
    own(state, 'storm_duelist');
    state.cards.loadouts.fighting.main = 'storm_duelist';
    state.cards.loadouts.fighting.supports[0] = 'ember_squire';
    expect(buildOrder(state, content).slice(0, 2)).toEqual(['storm_duelist', 'ember_squire']);
    expect(buildOrder(state, content)).toContain('apprentice_feller');
  });

  it('spends star dust on the fighting lead first, and saves it for the lead when short', () => {
    const state = freshState();
    state.resources['star_dust'] = new Decimal(1000);
    const { state: after, spent } = spendStarDust(state, content);
    expect(after.cards.owned['ember_squire']!.stars).toBeGreaterThan(1);
    expect(spent).toBeGreaterThan(0);
    expect(after.cards.owned['apprentice_feller']!.stars).toBe(1);
    // Short of the lead's next star: nothing goes to a worker meanwhile.
    const poor = freshState();
    poor.resources['star_dust'] = new Decimal(1);
    const kept = spendStarDust(poor, content);
    expect(kept.spent).toBe(0);
    expect(kept.state.resources['star_dust']!.toNumber()).toBe(1);
  });

  it('spends card shards on copies of the card it is building', () => {
    const state = freshState();
    state.cards.shards = 1000;
    const after = spendShards(state, content);
    expect(after.cards.owned['ember_squire']!.stars).toBe(6);
    expect(after.cards.shards).toBeLessThan(1000);
  });
});

describe('sim player: workers and the forge', () => {
  it('puts its strongest worker on the place worth the most, gem tier counted', () => {
    const state = freshState();
    state.production.unlockedTrees = ['oak', 'ironbark', 'moonwillow'];
    own(state, 'moonwood_dryad'); // Mythic logging card
    const picks = workerPicks(state, content);
    expect(picks[0]).toMatchObject({ place: 'moonwillow', card: 'moonwood_dryad' });
  });

  it('fills a second worker slot bought with Starlight', () => {
    const state = freshState();
    state.prestigeCount = 10; // a first slot on every tree and mine
    state.prestige.shop['second_hands'] = 1; // Oak gets a second slot
    own(state, 'moss_forager');
    const after = placeBestWorkers(state, content);
    expect(activeWorkers(after, content)['oak']).toHaveLength(2);
  });

  it('runs the forge only for a card that needs stars and with spare gems', () => {
    const state = freshState();
    state.production.unlockedTrees = ['oak', 'ironbark', 'moonwillow'];
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    expect(forgePlan(state, content).run).toBe(false); // no gems in hand
    state.resources['moonwillow_gem'] = new Decimal(1e6);
    state.resources['grotto_gem'] = new Decimal(1e6);
    expect(forgePlan(state, content)).toMatchObject({ recipe: 'star_dust', run: true });
    // the slots are full and the weakest place worker adds plenty: it stays where it is
    expect(forgeWorker(placeBestWorkers(state, content), content)).toBeNull();
    // the weakest worker adds little beside two rich places: it goes to the forge
    state.prestigeCount = 10;
    own(state, 'moonwood_dryad');
    own(state, 'core_titan');
    state.production.treeLevels['moonwillow'] = 200;
    state.production.mineLevels['crystal_grotto'] = 200;
    expect(forgeWorker(placeBestWorkers(state, content), content)).not.toBeNull();
  });

  it('values a tool line by what it adds: crit damage is worth nothing without crit chance', () => {
    const none: never[] = [];
    expect(toolGain('harvest.critDamage', new Decimal(0), new Decimal(0.05), 'mining', none)).toBe(
      0,
    );
    expect(
      toolGain('harvest.critChance', new Decimal(0), new Decimal(0.01), 'mining', none),
    ).toBeCloseTo(0.01);
    expect(
      toolGain('production.rate', new Decimal(1), new Decimal(1.08), 'mining', none),
    ).toBeCloseTo(0.08);
  });
});

describe('sim player: skill tree', () => {
  it('values a weapon circle only while a card of that type is at work', () => {
    const sword = content.account.tree.find((n) => n.id === 'sword_edge')!;
    const spear = content.account.tree.find((n) => n.id === 'spear_a')!;
    const state = freshState(); // Ember Squire leads: a sword
    expect(skillValue(state, content, sword)).toBeGreaterThan(0);
    expect(skillValue(state, content, spear)).toBe(0);
  });

  it('buys the skill worth the most per point', () => {
    const state = freshState();
    expect(nextSkill(state, content)).toBe('combat_s1');
  });

  it('respecs when skill points sit in a circle of a weapon no longer at work', () => {
    const state = freshState();
    state.account.skills = { spear_a: 5 };
    const after = chooseRespec(state, content);
    expect(after.account.skills).toEqual({});
    // points in skills that act are kept
    const kept = freshState();
    kept.account.skills = { combat_s1: 5 };
    expect(chooseRespec(kept, content)).toBe(kept);
  });
});

describe('sim player: where to fight', () => {
  const beaten = (state: GameState, tiers: Array<'normal' | 'hard'>): void => {
    const d = content.dungeonById.get('mossy_cellar')!;
    const t = Object.fromEntries(tiers.map((x) => [x, { floor: d.floors, best: d.floors }]));
    state.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      mode: 'farm',
      autoChallenge: false,
      tiers: t,
    };
    state.clearedDungeons = ['mossy_cellar'];
  };

  it('farms a wanted Core on the harder tier when it is killed as easily there', () => {
    const state = freshState();
    beaten(state, ['normal']);
    const strong = withDps(1e12, content);
    expect(fastestFarm(state, strong, 'moss_core')).toEqual({
      id: 'mossy_cellar',
      difficulty: 'hard',
    });
    // a loadout that cannot hold the Hard floor farms Normal
    expect(fastestFarm(state, withDps(1e4, content), 'moss_core')?.difficulty).toBe('normal');
  });

  it('farms a last-floor boss a few minutes from its next star level', () => {
    const state = freshState();
    beaten(state, ['normal']);
    const d = content.dungeonById.get('mossy_cellar')!;
    state.combat.stageKills[stageKey('mossy_cellar', 'normal', d.floors)] = 99;
    expect(starFarm(state, withDps(1e12, content))).toEqual({
      id: 'mossy_cellar',
      difficulty: 'normal',
    });
  });

  it('turns overflow on when a stage reaches Silver', () => {
    const state = freshState();
    const key = stageKey('mossy_cellar', 'normal', content.dungeonById.get('mossy_cellar')!.floors);
    state.combat.stageKills[key] = 99; // Bronze
    expect(chooseOverflow(state, content).combat.overflow[key]).toBeUndefined();
    state.combat.stageKills[key] = 100; // Silver
    expect(chooseOverflow(state, content).combat.overflow[key]).toBe(true);
  });
});

describe('sim player: autobuyers', () => {
  it('switches on the autobuyers it owns, holding them while it saves Money for a tier-up', () => {
    const state = freshState();
    expect(chooseAutomation(state, content)).toBe(state); // none owned
    state.prestige.shop['timber_steward'] = 1;
    const on = chooseAutomation(state, content);
    expect(on.automation).toMatchObject({ treeLevels: true, mineLevels: false, reservePercent: 0 });
    // the squire is ready to tier up but short of Money: the autobuyer spends none of it
    const squire = state.cards.owned['ember_squire']!;
    own(state, 'storm_duelist', { level: 20, stars: 6 });
    state.cards.loadouts.fighting.main = 'storm_duelist';
    for (const p of content.cardRules.tierUp.wood.fighting) state.resources[p.resource] = p.amount;
    state.resources['money'] = new Decimal(1);
    void squire;
    expect(chooseAutomation(state, content).automation.reservePercent).toBe(100);
  });
});

describe('sim player: lead and Ascension', () => {
  it('leads with the card that hits hardest, not the rarest one, and keeps a lead within 10%', () => {
    const state = freshState();
    own(state, 'grave_hammerer'); // Void at Wood ★1 Lv 1
    own(state, 'storm_duelist', { tier: 'gold', stars: 6, level: 80 }); // a starred Epic
    expect(chooseLead(state, content, 99)).toBe('storm_duelist');
    // a fresh Void beats a fresh Common
    const fresh = freshState();
    own(fresh, 'grave_hammerer');
    expect(chooseLead(fresh, content, 99)).toBe('grave_hammerer');
  });

  it('cashes a run in at three times the Starlight earned even while its rate still rises', () => {
    const tracker = { peakRate: 0 };
    expect(ascendNow({ gain: 20, minimum: 10, runSeconds: 3600, earned: 10 }, tracker)).toBe(false);
    expect(ascendNow({ gain: 30, minimum: 10, runSeconds: 3700, earned: 10 }, tracker)).toBe(true);
  });
});

describe('sim player: runs of one economy line', () => {
  const run = (ore: number): number => {
    const state = freshState();
    const mine = content.mines.find((m) => isProducerUnlocked(state, content, 'mining', m.id))!;
    const paidIn = mineLevelCost(state, content, mine.id)!.resource;
    state.resources[paidIn] = new Decimal(ore);
    const modifiers = collectModifiers(state, content);
    const candidate = buyerCandidates(state, content, modifiers).find(
      (c) => c.id === `mine:${mine.id}`,
    )!;
    const after = buyAgain(state, content, candidate, modifiers, createSeededRng(1), new Map(), []);
    return mineLevel(after, mine.id) - mineLevel(state, mine.id);
  };

  it('buys more levels of the best line while they stay cheap beside what is left', () => {
    // a modest purse stops the run within ECONOMY_RUN levels (it runs out or levels get dear)
    expect(run(1e3)).toBeLessThanOrEqual(ECONOMY_RUN);
    // a huge purse then bulk-buys as many levels as a 1/ECONOMY_RUN share of it pays for
    expect(run(1e300)).toBeGreaterThan(ECONOMY_RUN);
  });
});
