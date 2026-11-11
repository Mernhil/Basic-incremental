import { describe, expect, it } from 'vitest';
import {
  Decimal,
  activeWorkers,
  cloneState,
  collectModifiers,
  createSeededRng,
  floorPosition,
  forgeWorker,
  isProducerUnlocked,
  mineLevel,
  mineLevelCost,
  stageKey,
  type GameState,
} from '../src/game';
import { loadContent, type Content } from '../src/data';
import {
  CHALLENGE_RETRY_SECONDS,
  CHALLENGE_TRY_MARGIN,
  CHALLENGE_WIN,
  ascendOrChallenge,
  challengeMargin,
  chooseAutoChallenge,
  chooseFight,
  focusChoice,
  nextChallengeKey,
  runExpeditions,
  teamForChallenge,
  trainingFeed,
  trainingValue,
  wantsCardsNow,
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
import {
  content,
  freshState,
  withAutoChallenge,
  withBossAttack,
  withBossHp,
  withDps,
} from './helpers';

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

// ---- the table update's systems (DESIGN.md §14 The sim player's choices) ------------------------

describe('sim player: floor Challenges and the team of four', () => {
  const real = loadContent();
  /** Mossy Cellar on floor 9 of 10 (its boss floor is the next Challenge), a team of Commons. */
  const atBossWall = (): GameState => {
    const state = freshState();
    for (const id of ['rusty_brute', 'militia_picket', 'alley_cutpurse', 'hedge_acolyte']) {
      own(state, id, { level: 20 });
    }
    // An Uncommon hammer: a guard with more health than any of them.
    own(state, 'bronze_forgehand', { level: 40, tier: 'bronze', stars: 6 });
    state.cards.owned['ember_squire']!.level = 20;
    state.cards.loadouts.fighting = {
      main: 'ember_squire',
      supports: ['rusty_brute', 'militia_picket', 'alley_cutpurse'],
    };
    state.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 9, best: 9 } },
    };
    state.activeDungeonId = 'mossy_cellar';
    state.account.level = 30; // room under the cost cap for any four of them
    return state;
  };
  const margin = (state: GameState, c: Content): number =>
    challengeMargin(state, c, 'mossy_cellar', collectModifiers(state, c))!;

  it('counts the Challenge timer: a team that lasts but is too slow does not win', () => {
    // The boss hits for nothing, so the team lasts for ever; with a billion HP it is far too slow.
    const harmless = withBossAttack(real, 'mossy_cellar', 0, 2);
    expect(margin(atBossWall(), withBossHp(harmless, 'mossy_cellar', 1e9))).toBeLessThan(1);
    expect(margin(atBossWall(), harmless)).toBeGreaterThan(1);
  });

  it('fields a guard when the damage team falls before it wins the next Challenge', () => {
    const hard = withBossAttack(real, 'mossy_cellar', 400, 2);
    const state = atBossWall();
    expect(margin(state, hard)).toBeLessThan(CHALLENGE_WIN);
    const team = teamForChallenge(state, hard);
    expect(team.cards.loadouts.fighting.supports).toContain('bronze_forgehand');
    expect(margin(team, hard)).toBeGreaterThanOrEqual(CHALLENGE_WIN);
    // A team that already wins is left as it is.
    expect(teamForChallenge(state, withBossAttack(real, 'mossy_cellar', 50, 2))).toBe(state);
  });

  it('leaves auto-challenge on only while it wins, and tries a close Challenge by hand now and then', () => {
    const cellar = real.dungeonById.get('mossy_cellar')!;
    // Wins: auto-challenge on, nothing pressed.
    const easy = withBossAttack(real, 'mossy_cellar', 50, 2);
    const on = chooseAutoChallenge(withAutoChallenge(atBossWall(), false), easy, 0, null);
    expect(floorPosition(on.state, cellar).autoChallenge).toBe(true);
    expect(on.tried).toBe(false);
    // Close: auto-challenge off, the Challenge button pressed, and not again within the wait.
    // (No guard here: the team is the damage team.)
    const state = withAutoChallenge(atBossWall(), true);
    delete state.cards.owned['bronze_forgehand'];
    const close = withBossAttack(real, 'mossy_cellar', 200, 2);
    expect(margin(state, close)).toBeGreaterThan(CHALLENGE_TRY_MARGIN);
    expect(margin(state, close)).toBeLessThan(CHALLENGE_WIN);
    const tried = chooseAutoChallenge(state, close, 1000, null);
    expect(floorPosition(tried.state, cellar).autoChallenge).toBe(false);
    expect(tried.tried).toBe(true);
    expect(tried.state.combat.challenge).not.toBeNull();
    const again = chooseAutoChallenge(state, close, 1000 + CHALLENGE_RETRY_SECONDS - 1, 1000);
    expect(again.tried).toBe(false);
    // Hopeless: off, and not even tried.
    const hopeless = withBossAttack(real, 'mossy_cellar', 800, 2);
    expect(margin(state, hopeless)).toBeLessThan(CHALLENGE_TRY_MARGIN);
    expect(chooseAutoChallenge(state, hopeless, 1000, null).tried).toBe(false);
  });
});

describe('sim player: a lost Challenge', () => {
  it('believes a defeat over the estimate until the team has grown', () => {
    const real = loadContent();
    const state = freshState();
    state.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: true,
      tiers: { normal: { floor: 9, best: 9 } },
    };
    state.activeDungeonId = 'mossy_cellar';
    const easy = withBossAttack(withDps(1e6, real), 'mossy_cellar', 0, 2);
    const margin = challengeMargin(state, easy, 'mossy_cellar', collectModifiers(state, easy))!;
    expect(margin).toBeGreaterThan(CHALLENGE_WIN);
    const cellar = real.dungeonById.get('mossy_cellar')!;
    const key = nextChallengeKey(state, easy)!;
    // Lost at this very margin: auto-challenge off, though the estimate says it wins.
    const after = chooseAutoChallenge(state, easy, 0, null, { key, margin });
    expect(floorPosition(after.state, cellar).autoChallenge).toBe(false);
    // Lost long ago at a far smaller margin: the team has grown, it is on again.
    const grown = chooseAutoChallenge(state, easy, 0, null, { key, margin: margin / 2 });
    expect(floorPosition(grown.state, cellar).autoChallenge).toBe(true);
  });
});

describe('sim player: training in gems', () => {
  const real = loadContent();
  it('values health like damage while health is what loses it the next Challenge', () => {
    const state = freshState();
    state.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 9, best: 9 } },
    };
    state.activeDungeonId = 'mossy_cellar';
    const at = (c: Content): number =>
      trainingValue(state, c, 'combat.health', collectModifiers(state, c));
    expect(at(withBossAttack(real, 'mossy_cellar', 1e6, 2))).toBe(1);
    expect(at(withBossAttack(real, 'mossy_cellar', 0, 2))).toBe(0.5);
  });

  it('counts the training a gem pays for in the value of its mine or tree', () => {
    const state = freshState();
    const modifiers = collectModifiers(state, content);
    const sharpen = content.training.find((t) => t.stat === 'combat.damage')!;
    // The gem Sharpen costs feeds damage; a gem no line costs feeds nothing.
    expect(trainingFeed(state, content, sharpen.cost.resource, modifiers)).toBeGreaterThan(0);
    expect(trainingFeed(state, content, 'grotto_gem', modifiers)).toBe(0);
  });
});

describe('sim player: scrolls and the Focus Portal', () => {
  it('pulls one at a time only while a team or worker slot waits for a card', () => {
    const state = freshState();
    state.resources['summon_scroll'] = new Decimal(3);
    const ids = (s: GameState): string[] => buyerCandidates(s, content).map((c) => c.id);
    expect(wantsCardsNow(state, content)).toBe(true);
    expect(ids(state)).toContain('summon:card_portal');
    // Every slot filled: it saves for 10-pulls.
    for (const id of ['rusty_brute', 'militia_picket', 'alley_cutpurse']) own(state, id);
    state.cards.loadouts.fighting.supports = ['rusty_brute', 'militia_picket', 'alley_cutpurse'];
    const full = placeBestWorkers(state, content);
    expect(wantsCardsNow(full, content)).toBe(false);
    expect(ids(full)).not.toContain('summon:card_portal');
    expect(ids(full)).toContain('summon:card_portal:10');
  });

  it('aims the Focus Portal at the one item type it is missing, unless the wishlist already does', () => {
    const state = freshState();
    const kind = 'bow';
    for (const card of content.cards)
      if (card.item.kind !== kind) own(state, card.id, { stars: 6 });
    state.cards.wishlist = [];
    const choice = focusChoice(state, content, new Set());
    expect(choice.kind).toBe(kind);
    expect(choice.value).toBeGreaterThan(choice.cardValue);
    // The wishlist marks the missing bows: every Card Portal pull of their rarities goes to them.
    expect(focusChoice(markWishlist(state, content), content, new Set()).kind).toBeNull();
  });
});

describe('sim player: expeditions', () => {
  it('sends an idle card to the place of its element, keeps guards home, collects finished trips', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    own(state, 'rusty_brute'); // a fire striker, idle
    own(state, 'bronze_forgehand'); // a guard: kept home for the team
    const sent = runExpeditions(state, content, 1);
    expect(sent.state.expeditions.trips).toEqual([
      { cardId: 'rusty_brute', placeId: 'ember_catacombs', hours: 1, elapsedSeconds: 0 },
    ]);
    const done = cloneState(sent.state);
    done.expeditions.trips[0]!.elapsedSeconds = 3600;
    const back = runExpeditions(done, content, 1);
    expect(back.income.trips).toBe(1);
    expect(back.income.materials).toBeGreaterThan(0);
    expect(back.state.expeditions.completed).toBe(1);
  });
});

describe('sim player: Ascension challenges', () => {
  const real = loadContent();
  /** After a first Ascension, with a run worth ascending. */
  const ready = (): GameState => {
    const state = freshState();
    state.prestigeCount = 1;
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt', 'frostspire_vault'];
    state.mastery.harvested['oak_gem'] = new Decimal(1e20);
    return state;
  };

  it('starts the challenge whose target its team already wins, else ascends plainly', () => {
    const run = ascendOrChallenge(ready(), withDps(1e9, real));
    expect(run.ok && run.state.ascensionChallenges.active).toBe(real.challenges[0]!.id);
    const plain = ascendOrChallenge(ready(), withDps(1e-3, real));
    expect(plain.ok && plain.state.ascensionChallenges.active).toBeNull();
    expect(plain.ok && plain.state.prestigeCount).toBe(2);
  });

  it('climbs the target of a challenge run first', () => {
    const state = ready();
    state.ascensionChallenges.active = real.challenges[0]!.id;
    const target = real.challenges[0]!.targets[0]!;
    expect(chooseFight(state, real)).toEqual({ id: target.dungeon, difficulty: target.difficulty });
  });
});
