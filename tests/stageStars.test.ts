import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Content } from '../src/data';
import {
  advance,
  bossStatus,
  createSeededRng,
  Decimal,
  fightStage,
  floorPosition,
  isStageFloor,
  overflowActive,
  overflowStage,
  readSave,
  secondsPerKill,
  setFloorMode,
  setActiveDungeon,
  setOverflow,
  simulateOffline,
  stageChest,
  stageDamageFactor,
  stageFloors,
  stageKey,
  stageLootFactor,
  stageMap,
  stageStarLevel,
  stageStars,
  starLevelForKills,
  totalStageStarLevels,
  type Difficulty,
  type GameState,
} from '../src/game';
import { devSetFloor } from '../src/game/dev';
import {
  constantRng,
  floorsContent,
  freshState,
  neutralStars,
  withBossAttack,
  withDps,
  withOverflow,
} from './helpers';

/**
 * Stage stars and overflow (DESIGN.md §6): every mini-boss floor and last-floor boss of Normal,
 * Hard and Nightmare is a stage with six star levels earned by kills there; Silver opens the
 * stage's overflow switch. The shipped floors and star numbers, with crits off.
 */
const real: Content = {
  ...floorsContent,
  combat: { ...floorsContent.combat, crit: { chance: 0, damage: new Decimal(1) } },
};
/** The same with stars that add no damage, loot or chests, for exact totals. */
const neutral = neutralStars(real);
const harmless = (base: Content): Content =>
  withBossAttack(withBossAttack(base, 'mossy_cellar', 1e-30, 10), 'ember_crypt', 1e-30, 10);
const cellar = real.dungeonById.get('mossy_cellar')!;
const crypt = real.dungeonById.get('ember_crypt')!;
const BOSS = stageKey('mossy_cellar', 'normal', 10);
const HARD_BOSS = stageKey('mossy_cellar', 'hard', 10);

/** A new game fighting the Mossy Cellar on `floor` of `difficulty`, farming. */
function at(content: Content, floor: number, difficulty: Difficulty = 'normal'): GameState {
  const active = setActiveDungeon(freshState(), content, 'mossy_cellar');
  if (!active.ok) throw new Error(active.reason);
  const placed = devSetFloor(active.state, content, 'mossy_cellar', floor, difficulty);
  if (!placed.ok) throw new Error(placed.reason);
  const farming = setFloorMode(placed.state, content, 'mossy_cellar', 'farm');
  if (!farming.ok) throw new Error(farming.reason);
  return farming.state;
}
const run = (state: GameState, content: Content, seconds: number, rng = constantRng(0.5)) =>
  advance(state, content, seconds * 1000, rng);
const crystals = (s: GameState): number => s.resources['summon_scroll']!.toNumber();

describe('stages', () => {
  it('are the mini-boss floors and the last-floor boss of Normal, Hard and Nightmare', () => {
    expect(stageFloors(real, cellar)).toEqual([10]);
    expect(stageFloors(real, crypt)).toEqual([10, 20]);
    expect(stageFloors(real, real.dungeonById.get('frostspire_vault')!)).toEqual([10, 20, 30]);
    for (const difficulty of ['normal', 'hard', 'nightmare'] as const) {
      expect(isStageFloor(real, crypt, difficulty, 10)).toBe(true);
      expect(isStageFloor(real, crypt, difficulty, 20)).toBe(true);
      expect(isStageFloor(real, crypt, difficulty, 11)).toBe(false);
    }
    // The endless depths have no stages, and floors outside the dungeon are none.
    expect(isStageFloor(real, crypt, 'endless', 10)).toBe(false);
    expect(isStageFloor(real, crypt, 'normal', 30)).toBe(false);
  });

  it('has six star levels at 1, 10, 100, 1,000, 10,000 and 100,000 kills, +5% damage each', () => {
    const stars = real.combat.stageStars;
    expect(stars.kills).toEqual([1, 10, 100, 1000, 10_000, 100_000]);
    expect(stars.damagePerLevel).toBe(0.05);
    expect(stars.overflowFromLevel).toBe(3); // Silver
    expect(
      [0, 1, 9, 10, 99, 100, 99_999, 100_000, 1e9].map((k) => starLevelForKills(real, k)),
    ).toEqual([0, 1, 1, 2, 2, 3, 5, 6, 6]);
  });
});

describe('kills and star levels', () => {
  it('counts boss kills on the stage of their tier only', () => {
    const content = harmless(withDps(1e12, neutral));
    const normal = run(at(content, 10, 'normal'), content, 5).state;
    expect(normal.combat.stageKills).toEqual({ [BOSS]: 5 });
    const hard = run(at(content, 10, 'hard'), content, 3).state;
    expect(hard.combat.stageKills).toEqual({ [HARD_BOSS]: 3 });
    expect(stageStarLevel(hard, content, BOSS)).toBe(0);
    expect(stageStarLevel(hard, content, HARD_BOSS)).toBe(1);
  });

  it('counts mini-boss kills on their own stage and wave kills nowhere', () => {
    const content = harmless(withDps(1e12, neutral));
    const active = setActiveDungeon(freshState(), content, 'mossy_cellar');
    if (!active.ok) throw new Error(active.reason);
    active.state.clearedDungeons = ['mossy_cellar'];
    const inCrypt = setActiveDungeon(active.state, content, 'ember_crypt');
    if (!inCrypt.ok) throw new Error(inCrypt.reason);
    // Pushing from floor 1 at one floor a hit: floor 10 (a mini-boss) falls on the 10th hit.
    const { state } = run(inCrypt.state, content, 12);
    expect(state.combat.stageKills).toEqual({ [stageKey('ember_crypt', 'normal', 10)]: 1 });
  });

  it('describes a stage: kills, level, kills for the next level, chests, overflow', () => {
    const state = freshState();
    state.combat.stageKills[BOSS] = 150;
    expect(stageStars(state, real, BOSS)).toMatchObject({
      key: BOSS,
      dungeonId: 'mossy_cellar',
      difficulty: 'normal',
      floor: 10,
      kills: 150,
      level: 3,
      nextKills: 1000,
      chestsPaid: 0,
      overflowUnlocked: true,
      overflowOn: false,
    });
    expect(stageStars(state, real, stageKey('mossy_cellar', 'normal', 3))).toBeNull();
    expect(stageStars(state, real, 'nowhere:normal:10')).toBeNull();
    expect(stageStars(state, real, stageKey('mossy_cellar', 'endless', 10))).toBeNull();
  });

  it('adds every stage star level up for the skill points', () => {
    const state = freshState();
    state.combat.stageKills[BOSS] = 10; // 2
    state.combat.stageKills[HARD_BOSS] = 1; // 1
    state.combat.stageKills[stageKey('ember_crypt', 'normal', 10)] = 100_000; // 6
    state.combat.stageKills[stageKey('mossy_cellar', 'normal', 3)] = 50; // not a stage
    expect(totalStageStarLevels(state, real)).toBe(9);
    expect(stageStarLevel(state, real, BOSS)).toBe(2);
    expect(stageStarLevel(state, real, 'junk')).toBe(0);
  });

  it('is kept through Ascension (the stage kills are not reset)', async () => {
    const { ascend } = await import('../src/game');
    const state = freshState();
    state.combat.stageKills[BOSS] = 120;
    state.combat.stageChests[BOSS] = 3;
    state.combat.overflow[BOSS] = true;
    state.mastery.harvested['oak_gem'] = new Decimal('1e30');
    const result = ascend(state, real);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.combat.stageKills).toEqual({ [BOSS]: 120 });
    expect(result.state.combat.stageChests).toEqual({ [BOSS]: 3 });
    expect(result.state.combat.overflow).toEqual({ [BOSS]: true });
  });
});

describe('chests', () => {
  it('pays each level its chest once, bigger at each level and on harder tiers', () => {
    for (let level = 2; level <= 6; level++) {
      const amount = (d: 'normal' | 'hard' | 'nightmare', l: number) =>
        stageChest(real, d, l)
          .find((p) => p.resource === 'summon_scroll')!
          .amount.toNumber();
      expect(amount('normal', level)).toBeGreaterThan(amount('normal', level - 1));
      expect(amount('hard', level)).toBeGreaterThan(amount('normal', level));
      expect(amount('nightmare', level)).toBeGreaterThan(amount('hard', level));
    }
  });

  it('gives star dust from Gold up', () => {
    const dust = (l: number) =>
      stageChest(real, 'normal', l)
        .find((p) => p.resource === 'star_dust')
        ?.amount.toNumber() ?? 0;
    expect([1, 2, 3].map(dust)).toEqual([0, 0, 0]);
    for (const level of [4, 5, 6]) expect(dust(level)).toBeGreaterThan(0);
  });

  it('pays the Wood chest with the first kill and the Bronze chest with the tenth, never again', () => {
    const content = harmless(withDps(1e12, real));
    const start = at(content, 10);
    // the first win of the boss floor pays its scroll lump with the first kill
    const lump = real.scrolls.floorFirstWin.boss.summon;
    const wood = stageChest(real, 'normal', 1).find((p) => p.resource === 'summon_scroll')!;
    const bronze = stageChest(real, 'normal', 2).find((p) => p.resource === 'summon_scroll')!;
    const first = run(start, content, 1);
    expect(first.state.combat.stageKills[BOSS]).toBe(1);
    expect(first.state.combat.stageChests[BOSS]).toBe(1);
    // The dungeon was cleared too: the first-clear purse is paid with the same kill.
    const purse = cellar.drops.firstClear.find((p) => p.resource === 'summon_scroll')!.amount;
    expect(crystals(first.state) - crystals(start)).toBeCloseTo(
      lump.add(wood.amount).add(purse).toNumber(),
      6,
    );
    const tenth = run(first.state, content, 9);
    expect(tenth.state.combat.stageChests[BOSS]).toBe(2);
    expect(crystals(tenth.state) - crystals(first.state)).toBeCloseTo(bronze.amount.toNumber(), 6);
    const later = run(tenth.state, content, 5);
    expect(crystals(later.state) - crystals(tenth.state)).toBeCloseTo(0, 6);
  });

  it('pays a save from before the stars for every level its old kills reach, with its next kill', () => {
    // Format 26 turned each dungeon's boss kills into kills on its Normal last floor, with no
    // chest paid (DESIGN.md §6 Stage stars, the [Default] for migrated saves).
    const content = harmless(withDps(1e12, real));
    const start = at(content, 10);
    start.clearedDungeons = ['mossy_cellar'];
    start.combat.stageKills[BOSS] = 150;
    expect(stageStarLevel(start, content, BOSS)).toBe(3);
    expect(stageStars(start, content, BOSS)!.chestsPaid).toBe(0);
    const owed = [1, 2, 3]
      .map((l) => stageChest(real, 'normal', l).find((p) => p.resource === 'summon_scroll')!)
      .reduce((sum, p) => sum + p.amount.toNumber(), 0);
    const lump = real.scrolls.floorFirstWin.boss.summon;
    const after = run(start, content, 1);
    expect(after.state.combat.stageChests[BOSS]).toBe(3);
    expect(crystals(after.state) - crystals(start)).toBeCloseTo(owed + lump.toNumber(), 6);
  });

  it('turns a real 0.5.5 save into stage kills that reach star levels', () => {
    const text = readFileSync(
      resolve(__dirname, 'fixtures/saves/v25-dev-tools.save.txt'),
      'utf8',
    ).trim();
    const { state } = readSave(text, floorsContent);
    expect(state.combat.stageKills[BOSS]).toBe(78);
    expect(stageStarLevel(state, floorsContent, BOSS)).toBe(2);
    expect(totalStageStarLevels(state, floorsContent)).toBe(2);
    expect(state.mastery.bossTiers['mossy_cellar']).toBeUndefined();
  });
});

describe('damage and loot on a starred stage', () => {
  it('adds +5% damage a level on that stage only', () => {
    const state = freshState();
    state.combat.stageKills[BOSS] = 100; // Silver
    expect(stageDamageFactor(state, real, cellar, 'normal', 10)).toBeCloseTo(1.15);
    expect(stageDamageFactor(state, real, cellar, 'hard', 10)).toBe(1);
    expect(stageDamageFactor(state, real, cellar, 'normal', 9)).toBe(1);
    // The fight deals it: a boss that takes many hits loses 15% more per hit.
    const content = harmless(withDps(100, real));
    const plainFight = run(at(content, 10), content, 10).state;
    const starred = at(content, 10);
    starred.combat.stageKills[BOSS] = 100;
    const starFight = run(starred, content, 10).state;
    const hp = fightStage(starred, content, 'mossy_cellar')!.hp;
    const dealt = (s: GameState) => hp.sub(s.bossHp ?? hp).toNumber();
    expect(dealt(starFight) / dealt(plainFight)).toBeCloseTo(1.15, 9);
    expect(secondsPerKill(starred, content, 'mossy_cellar')!).toBeLessThan(
      secondsPerKill(at(content, 10), content, 'mossy_cellar')!,
    );
  });

  it('pays better loot there: Money purses and material chances grow with the level', () => {
    const state = freshState();
    state.combat.stageKills[BOSS] = 1000; // Gold
    expect(stageLootFactor(state, real, cellar, 'normal', 10)).toBeCloseTo(1.4);
    expect(stageLootFactor(state, real, cellar, 'normal', 5)).toBe(1);
    const content = harmless(
      withDps(1e12, {
        ...real,
        combat: {
          ...real.combat,
          stageStars: {
            ...real.combat.stageStars,
            chests: { ...real.combat.stageStars.chests, rewards: [] },
          },
        },
      }),
    );
    const money = (s: GameState) => s.resources['money']!.toNumber();
    // Silver (+30%) against Gold (+40%): each holds its level for the whole run.
    const plainStart = at(content, 10);
    plainStart.clearedDungeons = ['mossy_cellar'];
    plainStart.combat.stageKills[BOSS] = 100;
    const starred = at(content, 10);
    starred.clearedDungeons = ['mossy_cellar'];
    starred.combat.stageKills[BOSS] = 1000;
    const rng = () => constantRng(0.5);
    const plainGain = money(run(plainStart, content, 10, rng()).state) - money(plainStart);
    const starGain = money(run(starred, content, 10, rng()).state) - money(starred);
    const wage = cellar.drops.wages.find((w) => w.resource === 'money')!.perSecond.toNumber() * 10;
    expect((starGain - wage) / (plainGain - wage)).toBeCloseTo(1.4 / 1.3, 2);
  });
});

describe('overflow switch', () => {
  it('opens at Silver on that stage and tier, and can always be turned off', () => {
    const state = freshState();
    state.combat.stageKills[BOSS] = 99;
    expect(setOverflow(state, real, BOSS, true)).toEqual({ ok: false, reason: 'locked' });
    state.combat.stageKills[BOSS] = 100;
    const on = setOverflow(state, real, BOSS, true);
    if (!on.ok) throw new Error(on.reason);
    expect(on.state.combat.overflow).toEqual({ [BOSS]: true });
    expect(stageStars(on.state, real, BOSS)!.overflowOn).toBe(true);
    // Hard is its own stage: still locked there.
    expect(setOverflow(on.state, real, HARD_BOSS, true)).toEqual({ ok: false, reason: 'locked' });
    const off = setOverflow(on.state, real, BOSS, false);
    if (!off.ok) throw new Error(off.reason);
    expect(off.state.combat.overflow).toEqual({});
    expect(setOverflow(off.state, real, BOSS, false)).toEqual({ ok: true, state: off.state });
    expect(setOverflow(state, real, stageKey('mossy_cellar', 'normal', 4), true)).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('on a wave floor follows the next stage below it; in the depths, the Nightmare boss', () => {
    expect(overflowStage(real, crypt, 'normal', 3)).toEqual({
      dungeonId: 'ember_crypt',
      difficulty: 'normal',
      floor: 10,
    });
    expect(overflowStage(real, crypt, 'hard', 15)).toMatchObject({ difficulty: 'hard', floor: 20 });
    expect(overflowStage(real, crypt, 'normal', 20)).toMatchObject({ floor: 20 });
    expect(overflowStage(real, crypt, 'endless', 37)).toMatchObject({
      difficulty: 'nightmare',
      floor: 20,
    });
    const state = freshState();
    state.combat.stageKills[stageKey('ember_crypt', 'normal', 10)] = 100;
    state.combat.overflow[stageKey('ember_crypt', 'normal', 10)] = true;
    expect(overflowActive(state, real, crypt, 'normal', 7)).toBe(true);
    expect(overflowActive(state, real, crypt, 'normal', 10)).toBe(true);
    expect(overflowActive(state, real, crypt, 'normal', 11)).toBe(false);
    expect(overflowActive(state, real, crypt, 'hard', 7)).toBe(false);
  });

  it('loses the leftover damage of a kill while off and carries it while on, farming', () => {
    // A hit of 2.5 bosses: one kill a hit while off, two and a half while on.
    const content = harmless(withDps(cellar.boss.hp.mul(2.5), neutral));
    const hits = (r: { report: { playerHits: { hits: number; signature: boolean }[] } }) =>
      r.report.playerHits.filter((h) => !h.signature).reduce((n, h) => n + h.hits, 0);
    const off = run(at(content, 10), content, 10);
    expect(hits(off)).toBe(10);
    expect(off.report.bossKills).toBe(10);
    // On, the card's levels add to the 2.5 bosses a hit is worth.
    const on = run(withOverflow(at(content, 10), content), content, 10);
    expect(on.report.bossKills).toBeGreaterThanOrEqual(25);
    expect(bossStatus(on.state, content)!.overflow).toBe(true);
    expect(bossStatus(off.state, content)!.overflow).toBe(false);
  });

  it('loses the leftover damage while off and carries it while on, pushing', () => {
    const content = harmless(withDps(1e12, neutral));
    const start = setActiveDungeon(freshState(), content, 'mossy_cellar');
    if (!start.ok) throw new Error(start.reason);
    // One hit: one floor while off, every floor while on.
    expect(floorPosition(run(start.state, content, 1).state, cellar).floor).toBe(2);
    expect(
      floorPosition(run(withOverflow(start.state, content), content, 1).state, cellar).floor,
    ).toBe(10);
  });
});

describe('the same totals online, offline and in any split of time', () => {
  /** What a fight has paid: everything the split tests compare. */
  const totals = (s: GameState) => ({
    kills: s.combat.stageKills,
    chests: s.combat.stageChests,
    floor: floorPosition(s, cellar),
    money: s.resources['money']!.toNumber(),
    crystals: crystals(s),
    cores: s.resources['moss_core']!.toNumber(),
    dust: s.resources['star_dust']?.toNumber() ?? 0,
    hp: (s.bossHp ?? new Decimal(-1)).toNumber(),
  });
  const expectSame = (a: GameState, b: GameState) => {
    const x = totals(a);
    const y = totals(b);
    expect(x.kills).toEqual(y.kills);
    expect(x.chests).toEqual(y.chests);
    expect(x.floor).toEqual(y.floor);
    expect(x.money).toBeCloseTo(y.money, 3);
    expect(x.crystals).toBeCloseTo(y.crystals, 3);
    expect(x.cores).toBe(y.cores);
    expect(x.dust).toBe(y.dust);
    expect(x.hp).toBeCloseTo(y.hp, 3);
  };

  for (const overflow of [false, true]) {
    for (const [name, dps] of [
      ['a boss that takes several hits', 3000],
      ['a boss every hit kills, two and a half times over', 32_250],
    ] as const) {
      it(`farms ${name} with overflow ${overflow ? 'on' : 'off'}, through star levels`, () => {
        // Real stars: the boss reaches Wood, Bronze and Silver within the span, so the damage
        // and loot change mid-span; the attacks are real too.
        const content = noRareDrops(withDps(dps, real));
        let start = at(content, 10);
        start.clearedDungeons = ['mossy_cellar'];
        if (overflow) {
          // The switch is open from Silver: start just short of Gold, with the switch on.
          start.combat.stageKills[BOSS] = 900;
          start = withOverflowOn(start);
        }
        const seconds = 600;
        const once = run(start, content, seconds, createSeededRng(7));
        let split = start;
        const rng = createSeededRng(7);
        for (let i = 0; i < seconds * 4; i++) split = advance(split, content, 250, rng).state;
        expectSame(split, once.state);
        // Offline farms the same floor (it never pushes, and this one is farmed anyway).
        const away = simulateOffline(start, content, 0, seconds * 1000, createSeededRng(7));
        expectSame(away.state, once.state);
        // The span crossed at least one star level, so the damage and loot changed inside it.
        expect(stageStarLevel(once.state, content, BOSS)).toBeGreaterThan(
          stageStarLevel(start, content, BOSS),
        );
      });
    }
  }

  it('pushes the same floors with overflow on or off however the time is split', () => {
    for (const overflow of [false, true]) {
      const content = harmless(withDps(400, real));
      const active = setActiveDungeon(freshState(), content, 'mossy_cellar');
      if (!active.ok) throw new Error(active.reason);
      const start = overflow ? withOverflow(active.state, content) : active.state;
      const once = run(start, content, 120, createSeededRng(3));
      let split = start;
      const rng = createSeededRng(3);
      for (let i = 0; i < 120 * 4; i++) split = advance(split, content, 250, rng).state;
      expectSame(split, once.state);
    }
  });
});

/**
 * The same content with the rare item out of reach (no chance, no pity): its cosmetic adds damage
 * from the next span on, which the split tests are not about.
 */
function noRareDrops(base: Content): Content {
  const dungeons = base.dungeons.map((d) => ({
    ...d,
    drops: { ...d.drops, rare: { ...d.drops.rare, chance: 1e-12, pityThreshold: 1e12 } },
  }));
  return { ...base, dungeons, dungeonById: new Map(dungeons.map((d) => [d.id, d])) };
}

/** The Mossy Cellar boss's overflow switch on (the stage must already be at Silver). */
function withOverflowOn(state: GameState): GameState {
  const result = setOverflow(state, real, BOSS, true);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

describe('harder modes pay more (DESIGN.md §6)', () => {
  it('pays more per second of Money, Cores, crystals and card XP on each tier than the one below, for a loadout that one-hits both', () => {
    // A hit that kills the Nightmare boss outright, so every tier is farmed at a kill a hit.
    const content = harmless(withDps(1e15, neutral));
    const farm = (difficulty: Difficulty) => {
      const start = at(content, 10, difficulty);
      start.clearedDungeons = ['mossy_cellar'];
      const id = start.cards.loadouts.fighting.main!;
      const before = start.cards.owned[id]!;
      const { report } = run(start, content, 30, constantRng(0));
      expect(report.bossKills).toBe(30);
      // Card XP over the first kill, before the card reaches its level cap.
      const after = run(start, content, 1, constantRng(0)).state.cards.owned[id]!;
      return {
        money: report.currencies['money']!,
        cores: report.materials['moss_core']!,
        crystals: report.currencies['summon_scroll']!,
        glamour: report.currencies['glamour_scroll']!,
        // Card XP: levels first, then the XP into the level.
        xp: [after.level - before.level, after.xp.sub(before.xp).toNumber()] as const,
      };
    };
    const tiers = (['normal', 'hard', 'nightmare'] as const).map(farm);
    for (let i = 1; i < tiers.length; i++) {
      const lower = tiers[i - 1]!;
      const higher = tiers[i]!;
      expect(higher.money).toBeGreaterThan(lower.money);
      expect(higher.cores).toBeGreaterThan(lower.cores);
      expect(higher.crystals).toBeGreaterThan(lower.crystals);
      expect(higher.glamour).toBeGreaterThan(lower.glamour);
      const moreXp =
        higher.xp[0] > lower.xp[0] || (higher.xp[0] === lower.xp[0] && higher.xp[1] > lower.xp[1]);
      expect(moreXp).toBe(true);
    }
  });

  it('reads the wage and card XP factors of each tier from the data', () => {
    const { hard, nightmare } = real.combat.difficulties;
    expect(hard.wage).toBeGreaterThan(1);
    expect(nightmare.wage).toBeGreaterThan(hard.wage);
    expect(hard.xp).toBeGreaterThan(1);
    expect(nightmare.xp).toBeGreaterThan(hard.xp);
    expect(fightStage(at(real, 10, 'hard'), real, 'mossy_cellar')!.scale.wage).toBe(hard.wage);
  });
});

describe('the stage map', () => {
  it('lists every dungeon by tier by stage with its stars', () => {
    const state = freshState();
    state.combat.stageKills[stageKey('ember_crypt', 'hard', 20)] = 1000;
    const map = stageMap(state, real);
    expect(map.map((d) => d.dungeon.id)).toEqual(real.dungeons.map((d) => d.id));
    const cryptMap = map.find((d) => d.dungeon.id === 'ember_crypt')!;
    expect(cryptMap.tiers.map((t) => t.difficulty)).toEqual(['normal', 'hard', 'nightmare']);
    const hard = cryptMap.tiers[1]!.stages;
    expect(hard.map((s) => [s.floor, s.kind, s.level])).toEqual([
      [10, 'miniboss', 0],
      [20, 'boss', 4],
    ]);
    expect(cryptMap.levels).toBe(4);
    expect(cryptMap.maxLevels).toBe(2 * 3 * 6);
  });
});
