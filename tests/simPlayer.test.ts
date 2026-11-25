import { cardStyle } from '../src/data';
import { describe, expect, it } from 'vitest';
import {
  Decimal,
  slotWorkers,
  openSlots,
  cloneState,
  collectModifiers,
  createSeededRng,
  floorPosition,
  forgeWorker,
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
  chooseOverflow,
  chooseRespec,
  fastestFarm,
  forgePlan,
  markWishlist,
  nextSkill,
  nextWebNode,
  placeBestWorkers,
  skillValue,
  spendShards,
  spendStarDust,
  workerPicks,
} from '../scripts/sim/sim';
import {
  content,
  freshState,
  withAutoChallenge,
  withBossAttack,
  withBossHp,
  withDps,
  levelPointsOnly,
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
    state.cards.loadouts.fighting.slots[0] = 'seraph_lancer';
    const marked = markWishlist(state, content);
    expect(marked.cards.wishlist).toContain('seraph_lancer');
    // the other Mythic mark goes to a card it does not own yet
    const mythics = marked.cards.wishlist.filter(
      (id) => cardStyle(content.cardById.get(id)!) === 'mythic',
    );
    expect(mythics.filter((id) => !marked.cards.owned[id])).toHaveLength(mythics.length - 1);
    marked.cards.owned['seraph_lancer']!.stars = 6; // copies would only become shards now
    expect(markWishlist(marked, content).cards.wishlist).not.toContain('seraph_lancer');
  });

  it('builds the lead first, then its supports, then the strongest workers', () => {
    const state = freshState();
    own(state, 'storm_duelist');
    state.cards.loadouts.fighting.slots[0] = 'storm_duelist';
    state.cards.loadouts.fighting.slots[1] = 'ember_squire';
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
  it('puts its strongest cards on the open slots, on the material the camp level needs', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    state.camp.level = 9; // the price asks for every wood and ore now
    own(state, 'moonwood_dryad'); // Mythic logging card
    const picks = workerPicks(state, content);
    const forest = picks.filter((p) => p.place === 'forest');
    expect(forest[0]).toMatchObject({ place: 'forest', card: 'moonwood_dryad' });
    expect(forest).toHaveLength(Math.min(2, openSlots(state, content, 'forest')));
  });

  it('fills the open slots of the camp level, and Wider Grounds opens none', () => {
    const state = freshState();
    state.prestige.shop['second_hands'] = 1;
    own(state, 'moss_forager');
    const after = placeBestWorkers(state, content);
    expect(slotWorkers(after, content).filter((w) => w.place === 'forest')).toHaveLength(1);
  });

  it('runs the forge only for a card that needs stars and with spare gems', () => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    expect(forgePlan(state, content).run).toBe(false); // no gems in hand
    state.resources['moonwillow_gem'] = new Decimal(1e6);
    state.resources['grotto_gem'] = new Decimal(1e6);
    expect(forgePlan(state, content)).toMatchObject({ recipe: 'star_dust', run: true });
    // a card left over with no slot to take it goes to the forge
    own(state, 'moonwood_dryad');
    own(state, 'elder_treant');
    expect(forgeWorker(placeBestWorkers(state, content), content)).not.toBeNull();
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

  it('buys the web node worth the most per point', () => {
    const state = freshState();
    state.account.level = 6;
    expect(nextWebNode(state, levelPointsOnly(content))).toBe('dg_might');
    // the weapon circles are all that is left in the old tree
    expect(nextSkill(state, content)).toBeNull();
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

  it('turns overflow on for every stage, none needs a star level', () => {
    const state = freshState();
    const key = stageKey('mossy_cellar', 'normal', content.dungeonById.get('mossy_cellar')!.floors);
    expect(chooseOverflow(state, content).combat.overflow[key]).toBe(true);
  });
});

describe('sim player: lead and Ascension', () => {
  it('leads with the card that hits hardest, not the rarest one, and keeps a lead within 10%', () => {
    const state = freshState();
    own(state, 'brass_vanguard', { tier: 'bronze' }); // a fresh Bronze card
    own(state, 'ember_squire', { stars: 6, level: 20 }); // a maxed Wood card
    expect(chooseLead(state, content, 99)).toBe('ember_squire');
    // a fresh T6 card beats a fresh Wood card
    const fresh = freshState();
    own(fresh, 'grave_hammerer', { tier: 'mythic' });
    expect(chooseLead(fresh, content, 99)).toBe('grave_hammerer');
  });

  it('cashes a run in at three times the Starlight earned even while its rate still rises', () => {
    const tracker = { peakRate: 0 };
    expect(ascendNow({ gain: 20, minimum: 10, runSeconds: 3600, earned: 10 }, tracker)).toBe(false);
    expect(ascendNow({ gain: 30, minimum: 10, runSeconds: 3700, earned: 10 }, tracker)).toBe(true);
  });
});

describe('sim player: runs of one economy line', () => {
  const run = (amount: number): number => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    for (const r of content.resources) {
      if (r.kind === 'tree_gem' || r.kind === 'mine_gem')
        state.resources[r.id] = new Decimal(amount);
    }
    const modifiers = collectModifiers(state, content);
    const candidate = buyerCandidates(state, content, modifiers).find(
      (c) => c.id === 'camp:level',
    )!;
    const after = buyAgain(state, content, candidate, modifiers, createSeededRng(1), new Map(), []);
    return after.camp.level - state.camp.level;
  };

  it('buys more camp levels while they stay cheap beside what is left, at most ECONOMY_RUN', () => {
    expect(run(1e3)).toBeLessThan(run(1e300));
    expect(run(1e300)).toBeLessThanOrEqual(ECONOMY_RUN);
  });
});

// ---- the table update's systems (DESIGN.md §14 The sim player's choices) ------------------------

describe('sim player: floor Challenges and the team of four', () => {
  // The boss HP these margins were set against, so tuning the dungeon data does not move them
  // (the tests below pin the boss attack the same way; on the readable scale of DESIGN.md §14).
  const real = withBossHp(loadContent(), 'mossy_cellar', 1700);
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
      slots: ['ember_squire', 'rusty_brute', 'militia_picket', 'alley_cutpurse'],
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
    const hard = withBossAttack(real, 'mossy_cellar', 120, 2);
    const state = atBossWall();
    expect(margin(state, hard)).toBeLessThan(CHALLENGE_WIN);
    const team = teamForChallenge(state, hard);
    expect(team.cards.loadouts.fighting.slots).toContain('bronze_forgehand');
    expect(margin(team, hard)).toBeGreaterThanOrEqual(CHALLENGE_WIN);
    // A team that already wins is left as it is.
    expect(teamForChallenge(state, withBossAttack(real, 'mossy_cellar', 21, 2))).toBe(state);
  });

  it('leaves auto-challenge on only while it wins, and tries a close Challenge by hand now and then', () => {
    const cellar = real.dungeonById.get('mossy_cellar')!;
    // Wins: auto-challenge on, nothing pressed.
    const easy = withBossAttack(real, 'mossy_cellar', 21, 2);
    const owner = withAutoChallenge(atBossWall(), false);
    const on = chooseAutoChallenge(owner, easy, 0, null);
    expect(floorPosition(on.state, cellar).autoChallenge).toBe(true);
    expect(on.tried).toBe(false);
    // Close: auto-challenge off, the Challenge button pressed, and not again within the wait.
    // (No guard here: the team is the damage team.)
    const state = withAutoChallenge(atBossWall(), true);
    delete state.cards.owned['bronze_forgehand'];
    const close = withBossAttack(real, 'mossy_cellar', 78, 2);
    expect(margin(state, close)).toBeGreaterThan(CHALLENGE_TRY_MARGIN);
    expect(margin(state, close)).toBeLessThan(CHALLENGE_WIN);
    const tried = chooseAutoChallenge(state, close, 1000, null);
    expect(floorPosition(tried.state, cellar).autoChallenge).toBe(false);
    expect(tried.tried).toBe(true);
    expect(tried.state.combat.challenge).not.toBeNull();
    const again = chooseAutoChallenge(state, close, 1000 + CHALLENGE_RETRY_SECONDS - 1, 1000);
    expect(again.tried).toBe(false);
    // Hopeless: off, and not even tried.
    const hopeless = withBossAttack(real, 'mossy_cellar', 220, 2);
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
    state.cards.loadouts.fighting.slots = [
      state.cards.loadouts.fighting.slots[0] ?? null,
      'rusty_brute',
      'militia_picket',
      'alley_cutpurse',
    ];
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
