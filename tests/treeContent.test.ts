import { describe, expect, it } from 'vitest';
import { loadContent, SKILL_BRANCHES, STATS, type Content } from '../src/data';
import {
  advance,
  assignForgeWorker,
  assignWorker,
  checkAchievements,
  collectModifiers,
  Decimal,
  newOwnedCard,
  nextGoals,
  setForgeRecipe,
  skillPoints,
  stageChest,
  stageDamageFactor,
  stageKey,
  stageMap,
  toolModifiers,
  weaponCircles,
  workSites,
  type GameState,
} from '../src/game';
import { allGoals } from '../src/game/goals';
import { bareState, constantRng, content, floorsContent, newGame } from './helpers';

/** The shipped numbers (the pinned test content switches lucky strikes and elements off). */
const real = loadContent();

/**
 * The content of the balance update's tree (DESIGN.md §10): five more branches, ten more weapon
 * circles, the new stats they read, and the achievements and goals for the new systems.
 */
const A = content.account;
const rng = constantRng(0.5);
const rank = (state: GameState, ...ids: string[]): GameState => {
  for (const id of ids) state.account.skills[id] = 5;
  return state;
};
const skillMods = (state: GameState) =>
  collectModifiers(state, content).filter((m) => m.source.kind === 'skill');

describe('the five new branches', () => {
  it('are Workers, Forge, Elements, Dungeons and Ascension, on the shared skeleton', () => {
    expect(SKILL_BRANCHES).toHaveLength(11);
    for (const branch of ['workers', 'forge', 'elements', 'dungeons', 'ascension'] as const) {
      const own = A.tree.filter((n) => n.branch === branch && !n.circle);
      expect(own, branch).toHaveLength(A.skeleton.length);
      expect(own.filter((n) => n.kind === 'keystone')).toHaveLength(1);
    }
  });

  it('every effect is a modifier on a stat that exists', () => {
    const stats = new Set<string>(STATS);
    for (const n of A.tree) for (const m of n.perRank) expect(stats.has(m.stat), n.id).toBe(true);
  });

  it('each branch keystone changes a rule rather than adding one more percent', () => {
    const keys = ['workers_k', 'forge_k', 'elements_k', 'dungeons_k', 'ascension_k'];
    const stat = (id: string) => A.tree.find((n) => n.id === id)!.perRank.map((m) => m.kind);
    expect(stat('workers_k')).toContain('min'); // a crit chance floor
    expect(stat('forge_k')).toContain('flat'); // inputs given back
    expect(stat('elements_k')).toContain('set'); // no element malus
    expect(stat('dungeons_k').length).toBeGreaterThan(1); // stars count double
    expect(stat('ascension_k')).toContain('mult');
    for (const id of keys) expect(A.tree.find((n) => n.id === id)!.cost).toBe(5);
  });
});

describe('the weapon circles', () => {
  const kinds = content.items.types.map((t) => t.kind);

  it('has one circle per item type, about ten skills each, over the four steps', () => {
    expect(A.circles.map((c) => c.kind).sort()).toEqual([...kinds].sort());
    for (const circle of A.circles) {
      const skills = A.tree.filter((n) => n.circle === circle.kind);
      expect(skills.length, circle.kind).toBe(10);
      expect(new Set(skills.map((n) => n.step))).toEqual(
        new Set(['gold', 'prismatic', 'mythic', 'heirloom']),
      );
      const keystones = skills.filter((n) => n.kind === 'keystone');
      expect(keystones.map((n) => n.step)).toEqual(['heirloom']);
    }
  });

  it('gives the Mythic and the Void skills of a circle different effects', () => {
    for (const circle of A.circles) {
      const [light, shadow] = A.tree.filter((n) => n.circle === circle.kind && n.step === 'mythic');
      expect(light && shadow, circle.kind).toBeTruthy();
      expect(JSON.stringify(light!.perRank), circle.kind).not.toBe(JSON.stringify(shadow!.perRank));
    }
  });

  it('keeps every circle skill on its own type: it acts only where a card of that type is at work', () => {
    const s = bareState();
    s.cards.owned['ember_squire'] = newOwnedCard();
    s.cards.owned['hollow_spearman'] = newOwnedCard();
    s.cards.loadouts.fighting.main = 'ember_squire';
    s.account.skills['sword_edge'] = 1;
    s.account.skills['spear_a'] = 1;
    const ids = (st: GameState) => skillMods(st).map((m) => m.source.id);
    expect(ids(s)).toContain('sword_edge');
    expect(ids(s)).not.toContain('spear_a');
    s.cards.loadouts.fighting.main = 'hollow_spearman';
    expect(ids(s)).toContain('spear_a');
    expect(ids(s)).not.toContain('sword_edge');
  });

  it('keeps the pickaxe and logging axe circles at the places their cards work', () => {
    const s = bareState();
    s.cards.owned['cave_digger'] = newOwnedCard();
    s.cards.owned['apprentice_feller'] = newOwnedCard();
    s.production.workers = { copper_quarry: ['cave_digger'], oak: ['apprentice_feller'] };
    s.account.skills['pickaxe_a'] = 1;
    s.account.skills['logging_axe_a'] = 1;
    const mods = skillMods(s);
    const pick = mods.filter((m) => m.source.id === 'pickaxe_a');
    const axe = mods.filter((m) => m.source.id === 'logging_axe_a');
    expect(pick.map((m) => m.scope?.producer)).toEqual(['copper_quarry']);
    expect(axe.map((m) => m.scope?.producer)).toEqual(['oak']);
  });

  it('reveals a circle from the tiers of the cards owned', () => {
    const s = bareState();
    s.cards.owned['hollow_spearman'] = { ...newOwnedCard(), tier: 'gold' };
    expect(weaponCircles(s, content).find((c) => c.kind === 'spear')!.revealed).toBe(true);
    expect(weaponCircles(s, content).find((c) => c.kind === 'hammer')!.revealed).toBe(false);
  });
});

describe('the stats the new skills read', () => {
  it('worker.power raises a worked place and its digging, and nothing without a worker', () => {
    const base = bareState();
    base.cards.owned['apprentice_feller'] = newOwnedCard();
    base.production.workers = { oak: ['apprentice_feller'] };
    const site = (s: GameState) =>
      workSites(s, content, 'logging').find((x) => x.producer.id === 'oak')!;
    const plain = site(base);
    const skilled = site(rank({ ...base, account: { ...base.account, skills: {} } }, 'workers_s1'));
    // Hired Hands: +5% a rank
    expect(skilled.rate.div(plain.rate).toNumber()).toBeCloseTo(1.25);
    expect(skilled.dig.div(plain.dig).toNumber()).toBeCloseTo(1.25);
    const idle = bareState();
    rank(idle, 'workers_s1');
    const idleSite = workSites(idle, content, 'logging').find((x) => x.producer.id === 'oak')!;
    expect(idleSite.rate.toNumber()).toBe(plain.rate.div(plain.rate).mul(idleSite.rate).toNumber());
    expect(idleSite.workers).toEqual([]);
  });

  it('lucky.payout widens a worked place’s lucky strike', () => {
    const s = bareState();
    s.cards.owned['apprentice_feller'] = newOwnedCard();
    s.production.workers = { oak: ['apprentice_feller'] };
    const lucky = (st: GameState) =>
      workSites(st, real, 'logging')
        .find((x) => x.producer.id === 'oak')!
        .lucky.toNumber();
    const before = lucky(s);
    s.account.skills['workers_l1'] = 3; // Lucky Streak: +10% a rank, doubled for a large skill
    expect(lucky(s)).toBeGreaterThan(before);
  });

  const fast: Content = {
    ...content,
    production: {
      ...content.production,
      forge: {
        speed: new Decimal(1),
        recipes: [
          {
            id: 'star_dust',
            name: 'Star Dust',
            inputs: [
              { resource: 'moonwillow_gem', amount: new Decimal(2) },
              { resource: 'grotto_gem', amount: new Decimal(2) },
            ],
            output: { resource: 'star_dust', amount: new Decimal(1) },
            work: new Decimal(10),
          },
        ],
      },
    },
  };

  it('forge.refund gives inputs back, forge.yield widens the output, forge.speed quickens it', () => {
    const run = (skills: Record<string, number>): { dust: number; gems: number } => {
      const s = bareState();
      s.account.skills = skills;
      s.resources['moonwillow_gem'] = new Decimal(1e6);
      s.resources['grotto_gem'] = new Decimal(1e6);
      s.cards.owned['apprentice_feller'] = newOwnedCard();
      const recipe = fast.production.forge.recipes[0]!;
      const set = setForgeRecipe(s, fast, recipe.id);
      if (!set.ok) throw new Error(set.reason);
      const hired = assignForgeWorker(set.state, fast, 'apprentice_feller');
      if (!hired.ok) throw new Error(hired.reason);
      const after = advance(hired.state, fast, 600_000, rng).state;
      return {
        dust: after.resources['star_dust']?.toNumber() ?? 0,
        gems: new Decimal(1e6).sub(after.resources[recipe.inputs[0]!.resource]!).toNumber(),
      };
    };
    const plain = run({});
    const keystone = run({ forge_k: 1 }); // Alchemist's Refund: 40% back and +25% speed
    expect(plain.dust).toBeGreaterThan(0);
    expect(keystone.dust).toBeGreaterThan(plain.dust);
    // a craft costs less with the refund: more dust per gem spent
    expect(keystone.dust / keystone.gems).toBeGreaterThan(plain.dust / plain.gems);
    const wide = run({ forge_s2: 5 }); // Fine Moulds: +3% output a rank
    expect(wide.dust / wide.gems).toBeCloseTo((plain.dust / plain.gems) * 1.15, 1);
  });

  it('tool.strength scales the tool lines of its job only', () => {
    const s = bareState();
    const line = content.production.tools.find((t) => t.job === 'logging' && t.milestones)!;
    const other = content.production.tools.find((t) => t.job === 'mining' && t.milestones)!;
    s.production.tools[line.id] = 20;
    s.production.tools[other.id] = 20;
    const value = (st: GameState, id: string) =>
      collectModifiers(st, content).find((m) => m.source.id === `tool:${id}`)!.value;
    const before = value(s, line.id);
    const mining = value(s, other.id);
    expect(toolModifiers(s, content)).toHaveLength(2);
    s.account.skills['forge_s3'] = 5; // Whetstones: +3% a rank on logging lines
    expect(value(s, line.id).sub(1).div(before.sub(1)).toNumber()).toBeCloseTo(1.15);
    expect(value(s, other.id).eq(mining)).toBe(true);
  });

  it('element.bonus strengthens a weakness, element.resist softens a malus, the keystone removes it', () => {
    const elem = (st: GameState) =>
      collectModifiers(st, real)
        .find((m) => m.source.kind === 'element' && m.scope?.dungeon === 'mossy_cellar')
        ?.value.toNumber();
    const fire = bareState();
    fire.cards.owned['ember_squire'] = newOwnedCard();
    fire.cards.loadouts.fighting.main = 'ember_squire';
    expect(elem(fire)).toBe(50);
    fire.account.skills['elements_s1'] = 4; // Attunement: +5% a rank
    expect(elem(fire)).toBeCloseTo(60);
    const nature = bareState();
    nature.cards.owned['fieldhand_archer'] = newOwnedCard();
    nature.cards.loadouts.fighting.main = 'fieldhand_archer';
    expect(elem(nature)).toBe(-25);
    nature.account.skills['elements_s3'] = 4; // Ward: -5% malus a rank
    expect(elem(nature)).toBeCloseTo(-20);
    nature.account.skills['elements_k'] = 1; // Prism Heart: no malus
    expect(elem(nature)).toBe(0);
  });

  it('stars.chest, stars.damage and stars.loot widen what the star levels give', () => {
    const key = stageKey('mossy_cellar', 'normal', 10);
    const s = bareState();
    s.combat.stageKills[key] = 1;
    const dungeon = floorsContent.dungeonById.get('mossy_cellar')!;
    const factor = (st: GameState) =>
      stageDamageFactor(
        st,
        floorsContent,
        dungeon,
        'normal',
        10,
        collectModifiers(st, floorsContent),
      );
    expect(factor(s)).toBeCloseTo(1 + floorsContent.combat.stageStars.damagePerLevel);
    s.account.skills['dungeons_s2'] = 5; // Battle Scars: +5% a rank on the star step
    expect(factor(s)).toBeCloseTo(1 + floorsContent.combat.stageStars.damagePerLevel * 1.25);
    const plain = stageChest(floorsContent, 'normal', 3);
    const rich = stageChest(floorsContent, 'normal', 3, new Decimal(2));
    expect(rich.length).toBe(plain.length);
    for (const [i, p] of plain.entries())
      expect(rich[i]!.amount.gte(p.amount.mul(2).sub(1))).toBe(true);
  });
});

describe('achievements for the new systems', () => {
  const unlocked = (state: GameState, c: Content = content): string[] =>
    checkAchievements(state, c).unlocked;

  it('are all in data and a new game starts with none of them', () => {
    const ids = [
      'first_silver',
      'fully_starred',
      'star_hunter_1',
      'third_hand',
      'sharpening',
      'digging_deeper',
      'forgemaster',
      'make_a_wish',
      'keystone_bearer',
      'first_circle',
    ];
    for (const id of ids)
      expect(
        content.achievements.some((a) => a.id === id),
        id,
      ).toBe(true);
    const fresh = unlocked(newGame());
    for (const id of ids) expect(fresh).not.toContain(id);
  });

  it('stage stars: first Silver, a fully starred dungeon and star totals', () => {
    const s = newGame();
    const kills = floorsContent.combat.stageStars.kills;
    s.combat.stageKills[stageKey('mossy_cellar', 'normal', 10)] = kills[2]!;
    expect(unlocked(s, floorsContent)).toContain('first_silver');
    const map = stageMap(s, floorsContent).find((d) => d.dungeon.id === 'mossy_cellar')!;
    for (const tier of map.tiers) {
      for (const stage of tier.stages) s.combat.stageKills[stage.key] = 1;
    }
    const got = unlocked(s, floorsContent);
    expect(got).toContain('fully_starred');
    expect(got).not.toContain('golden_dungeon');
  });

  it('workers, tool lines, depth and the forge', () => {
    const s = newGame();
    s.cards.owned['apprentice_feller'] = newOwnedCard();
    s.cards.owned['cave_digger'] = newOwnedCard();
    const hired = assignWorker(s, content, 'oak', 'apprentice_feller');
    if (!hired.ok) throw new Error(hired.reason);
    const state = hired.state;
    state.production.tools['logging_yield'] = 60;
    state.production.depth['oak'] = { layer: 2, progress: new Decimal(0) };
    const set = setForgeRecipe(state, content, content.production.forge.recipes[0]!.id);
    if (!set.ok) throw new Error(set.reason);
    const forge = assignForgeWorker(set.state, content, 'cave_digger');
    if (!forge.ok) throw new Error(forge.reason);
    const got = unlocked(forge.state);
    expect(got).toEqual(expect.arrayContaining(['sharpening', 'digging_deeper', 'forgemaster']));
    expect(got).not.toContain('third_hand');
  });

  it('the wishlist and the skill tree', () => {
    const s = newGame();
    s.cards.wishlist = ['ember_squire'];
    s.cards.owned['ember_squire'] = newOwnedCard();
    s.account.skills['combat_l3'] = 1;
    s.account.skills['combat_k'] = 1;
    s.cards.owned['hollow_spearman'] = { ...newOwnedCard(), tier: 'gold' };
    const got = unlocked(s);
    expect(got).toEqual(
      expect.arrayContaining(['make_a_wish', 'wish_granted', 'keystone_bearer', 'first_circle']),
    );
  });

  it('give skill points, and the tree has far more to buy than the points can reach early on', () => {
    const per = A.levels.pointsPerAchievement;
    const s = newGame();
    const before = skillPoints(s, content).total;
    s.achievements['first_silver'] = 1;
    expect(skillPoints(s, content).total).toBe(before + per);
    const treeCost = A.tree.reduce((n, node) => n + node.cost * node.maxRank, 0);
    expect(content.achievements.length * per).toBeLessThan(treeCost / 10);
  });
});

describe('goals for the new systems', () => {
  it('shows unspent skill points, a tool line to buy and a worker to place', () => {
    const s = bareState();
    s.account.level = 5;
    s.cards.owned['apprentice_feller'] = newOwnedCard();
    s.resources['money'] = new Decimal(1e12);
    const kinds = allGoals(s, content).map((g) => g.kind);
    expect(kinds).toContain('skill_points');
    expect(kinds).toContain('tool_line');
    expect(kinds).toContain('worker_slot');
    // skill points are a reminder: they never outrank a goal that is ready
    expect(nextGoals(s, content, 1)[0]!.kind).not.toBe('skill_points');
  });

  it('asks for a wishlist while it is empty and a card is owned', () => {
    const s = bareState();
    s.cards.owned['ember_squire'] = newOwnedCard();
    expect(allGoals(s, content).some((g) => g.kind === 'wishlist')).toBe(true);
    s.cards.wishlist = ['ember_squire'];
    expect(allGoals(s, content).some((g) => g.kind === 'wishlist')).toBe(false);
  });
});

describe('Cores of the new dungeons', () => {
  it('the Gold and Prismatic steps ask for them (Prismatic for two), and their dungeons drop them', () => {
    // With the Heirloom step gone the Void Core moved to the Prismatic step (DESIGN.md §5).
    const own: [string, string][] = [
      ['gold', 'storm_core'],
      ['prismatic', 'sanctum_core'],
      ['prismatic', 'void_core'],
    ];
    const dropped = new Set(content.dungeons.map((d) => d.drops.material.resource));
    for (const [tier, core] of own) {
      expect(dropped.has(core), core).toBe(true);
      for (const job of ['logging', 'mining', 'fighting'] as const) {
        const costs = content.cardRules.tierUp[tier as 'gold'][job];
        expect(
          costs.some((c) => c.resource === core),
          `${tier} ${job}`,
        ).toBe(true);
        expect(
          costs.some((c) => c.resource === 'frost_core'),
          `${tier} ${job}`,
        ).toBe(true);
      }
    }
  });
});
