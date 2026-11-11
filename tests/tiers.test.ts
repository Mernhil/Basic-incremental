import { describe, expect, it } from 'vitest';
import { loadContent, type Content } from '../src/data';
import rawCombat from '../src/data/content/combat.json';
import { combatSchema } from '../src/data/schemas';
import {
  advance,
  ascend,
  bossStatus,
  createSeededRng,
  Decimal,
  difficultyScale,
  fightStage,
  floorCount,
  floorKind,
  floorPosition,
  floorSpec,
  incomePerSecond,
  isDifficultyUnlocked,
  isDungeonCleared,
  setActiveDungeon,
  setDifficulty,
  simulateOffline,
  unlockedDifficulties,
  type GameState,
} from '../src/game';
import { devSetFloor } from '../src/game/dev';
import { chooseFight, MILESTONES } from '../scripts/sim/sim';
import { floorParts } from '../src/renderer/src/pages/dungeonsModel';
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
 * Difficulty tiers, endless depths, harder Ascensions and the three new dungeons (DESIGN.md §6).
 * The shipped floor counts, with crits and mastery bonuses off.
 */
const plain: Content = {
  ...neutralStars(floorsContent),
  combat: { ...neutralStars(floorsContent).combat, crit: { chance: 0, damage: new Decimal(1) } },
};
const harmless = (base: Content): Content => withBossAttack(base, 'mossy_cellar', 1e-30, 10);
const cellar = plain.dungeonById.get('mossy_cellar')!;

const inCellar = (content: Content): GameState => {
  const result = setActiveDungeon(freshState(), content, 'mossy_cellar');
  if (!result.ok) throw new Error(result.reason);
  return result.state;
};
const on = (state: GameState, content: Content, floor: number, difficulty?: string): GameState => {
  const result = devSetFloor(state, content, 'mossy_cellar', floor, difficulty as never);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
};
const run = (state: GameState, content: Content, seconds: number, rng = constantRng(0.5)) =>
  advance(state, content, seconds * 1000, rng);

describe('difficulty tiers', () => {
  it('reads what Hard and Nightmare multiply from the data: a thousand a tier', () => {
    expect(difficultyScale(plain, 'normal')).toEqual({
      hp: 1,
      attack: 1,
      purse: 1,
      material: 1,
      wage: 1,
      xp: 1,
    });
    expect(difficultyScale(plain, 'hard')).toMatchObject({ hp: 1000, attack: 1000 });
    expect(difficultyScale(plain, 'nightmare')).toMatchObject({ hp: 1e6, attack: 1e6 });
    // The endless depths start from Nightmare's numbers.
    expect(difficultyScale(plain, 'endless')).toEqual(difficultyScale(plain, 'nightmare'));
    expect(
      combatSchema.safeParse({
        ...rawCombat,
        difficulties: {
          ...rawCombat.difficulties,
          hard: { ...rawCombat.difficulties.hard, hp: 0 },
        },
      }).success,
    ).toBe(false);
  });

  it('gives each tier its own floors, a thousand times the HP and attack of the one below', () => {
    for (const floor of [1, 9, 10]) {
      const normal = floorSpec(plain, cellar, 'normal', floor);
      const hard = floorSpec(plain, cellar, 'hard', floor);
      const nightmare = floorSpec(plain, cellar, 'nightmare', floor);
      expect(hard.kind).toBe(normal.kind);
      expect(hard.hp.div(normal.hp).toNumber()).toBeCloseTo(1000, 6);
      expect(hard.attack.div(normal.attack).toNumber()).toBeCloseTo(1000, 6);
      expect(nightmare.hp.div(hard.hp).toNumber()).toBeCloseTo(1000, 6);
    }
    expect(floorCount(cellar, 'hard')).toBe(10);
    expect(floorSpec(plain, cellar, 'hard', 10).enemies[0]).toMatchObject({
      id: 'root_warden',
      kind: 'boss',
      dropScale: 1,
    });
  });

  it('starts a dungeon on Normal with the other tiers locked', () => {
    const state = inCellar(plain);
    expect(unlockedDifficulties(state, cellar)).toEqual(['normal']);
    expect(setDifficulty(state, plain, 'mossy_cellar', 'hard')).toEqual({
      ok: false,
      reason: 'locked',
    });
    expect(setDifficulty(state, plain, 'nowhere', 'hard')).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('unlocks Hard by beating the Normal boss, Nightmare by the Hard one, the depths by Nightmare', () => {
    // One hit kills anything: with overflow on, the first hit takes the whole Normal tier.
    const content = harmless(withDps(1e40, plain));
    let state = run(withOverflow(inCellar(content), content), content, 1.01).state;
    expect(isDungeonCleared(state, 'mossy_cellar')).toBe(true);
    expect(unlockedDifficulties(state, cellar)).toEqual(['normal', 'hard']);
    // Push does not walk into Hard by itself: the player picks the tier.
    state = run(state, content, 5).state;
    expect(floorPosition(state, cellar)).toMatchObject({ difficulty: 'normal', floor: 10 });

    const hard = setDifficulty(state, content, 'mossy_cellar', 'hard');
    if (!hard.ok) throw new Error(hard.reason);
    expect(hard.state.bossHp).toBeNull();
    expect(floorPosition(hard.state, cellar)).toMatchObject({
      difficulty: 'hard',
      floor: 1,
      best: 0,
    });
    state = run(hard.state, content, 1.01).state;
    expect(floorPosition(state, cellar)).toMatchObject({ difficulty: 'hard', floor: 10, best: 10 });
    expect(unlockedDifficulties(state, cellar)).toEqual(['normal', 'hard', 'nightmare']);

    const nightmare = setDifficulty(state, content, 'mossy_cellar', 'nightmare');
    if (!nightmare.ok) throw new Error(nightmare.reason);
    state = run(nightmare.state, content, 1.01).state;
    expect(isDifficultyUnlocked(state, cellar, 'endless')).toBe(true);
    // Each tier kept its own floor and best floor.
    expect(floorPosition(state, cellar, 'normal')).toMatchObject({ floor: 10, best: 10 });
    expect(floorPosition(state, cellar, 'hard')).toMatchObject({ floor: 10, best: 10 });
  });

  it('clears the dungeon only by its Normal boss', () => {
    const content = harmless(withDps(1e40, plain));
    // Hard is fought first here (set by the dev cheat); the Normal boss was never killed.
    const state = run(on(inCellar(content), content, 10, 'hard'), content, 1.01).state;
    expect(state.combat.stageKills['mossy_cellar:hard:10']).toBeGreaterThan(0);
    expect(isDungeonCleared(state, 'mossy_cellar')).toBe(false);
  });

  it('pays better on a harder tier: more Money for the same damage, materials in more units', () => {
    // On the boss floor, a hit that is just the boss's HP: one kill a second.
    const kill = (difficulty: string, dps: number) => {
      const content = harmless(withDps(dps, plain));
      const start = on(inCellar(content), content, 10, difficulty);
      const { state, report } = run(start, content, 1.5, constantRng(0));
      return {
        money: report.currencies['money']! - 50 * 1.5,
        cores: state.resources['moss_core']!.sub(start.resources['moss_core']!).toNumber(),
        kills: report.bossKills,
      };
    };
    const normal = kill('normal', 13_000);
    const hard = kill('hard', 13_000_000);
    expect(normal.kills).toBe(1);
    expect(hard.kills).toBe(1);
    // A thousand times the HP pays 1,500 times the purse: half as much again per damage.
    expect(plain.combat.difficulties.hard.purse).toBe(1500);
    expect(plain.combat.difficulties.nightmare.purse).toBe(1500 * 1500);
    // (whole Money units, so within a few parts in a thousand)
    expect(hard.money / normal.money).toBeCloseTo(1500, -1);
    expect(hard.cores).toBe(normal.cores * plain.combat.difficulties.hard.material);
  });

  it('counts the tier in the income estimate', () => {
    const content = harmless(withDps(1e9, plain));
    const normal = on(inCellar(content), content, 10, 'normal');
    const hard = on(inCellar(content), content, 10, 'hard');
    const perSecond = (s: GameState) => incomePerSecond(s, content, 'money').toNumber();
    // Overflow off: a hit is one kill on either tier, so Hard pays its whole purse factor.
    expect(perSecond(hard) / perSecond(normal)).toBeCloseTo(1500, -2);
    // Overflow on: Normal dies a thousand times as often, and Hard still pays half as much again.
    const on2 = (s: GameState) => withOverflow(s, content);
    expect(perSecond(on2(hard)) / perSecond(on2(normal))).toBeCloseTo(1.5, 1);
  });

  it('pays more Money per second the deeper the floor, and keeps the boss purse as the data has it', () => {
    const content = harmless(withDps(1e9, plain));
    const perSecond = (floor: number, difficulty = 'normal') =>
      incomePerSecond(
        withOverflow(on(inCellar(content), content, floor, difficulty), content),
        content,
        'money',
      )
        .sub(50) // the first dungeon's Money wage
        .toNumber();
    const bonus = plain.combat.floors.purseFloorBonus;
    expect(bonus).toBeGreaterThan(1);
    expect(perSecond(2) / perSecond(1)).toBeCloseTo(bonus, 6);
    expect(perSecond(9) / perSecond(1)).toBeCloseTo(bonus ** 8, 6);
    // Floor 1 pays its plain share of the HP; the boss, nine floors below, pays 1.02^9 of the
    // purse in dungeons.json.
    const first = floorSpec(plain, cellar, 'normal', 1).enemies[0]!;
    expect(first.purseScale).toBe(first.dropScale);
    expect(floorSpec(plain, cellar, 'normal', 10).enemies[0]!.purseScale).toBeCloseTo(
      bonus ** 9,
      12,
    );
    // ... and every endless depth pays more per second than the one above.
    expect(perSecond(8, 'endless') / perSecond(7, 'endless')).toBeCloseTo(bonus, 6);
  });

  it('pays the same purses after an Ascension: enemies and purses do not grow with it', () => {
    const content = harmless(withDps(1e9, plain));
    const at = (prestigeCount: number) => {
      const state = on(inCellar(content), content, 10, 'normal');
      state.prestigeCount = prestigeCount;
      return state;
    };
    const perSecond = (s: GameState) => incomePerSecond(s, content, 'money').sub(50).toNumber();
    expect(perSecond(at(3)) / perSecond(at(0))).toBeCloseTo(1, 6);
    expect(fightStage(at(2), content, 'mossy_cellar')!.scale.purse).toBe(1);
  });

  it('keeps every tier through an Ascension and restarts each at half of its best floor', () => {
    const state = on(on(freshState(), plain, 8, 'hard'), plain, 4, 'nightmare');
    state.mastery.harvested['oak_gem'] = new Decimal('1e30');
    const result = ascend(state, plain);
    if (!result.ok) throw new Error(result.reason);
    const after = result.state;
    expect(unlockedDifficulties(after, cellar)).toEqual(['normal', 'hard', 'nightmare']);
    expect(floorPosition(after, cellar, 'normal')).toMatchObject({ floor: 5, best: 10 });
    expect(floorPosition(after, cellar, 'hard')).toMatchObject({ floor: 5, best: 10 });
    expect(floorPosition(after, cellar, 'nightmare')).toMatchObject({ floor: 1, best: 3 });
    // The difficulty chosen is kept too.
    expect(floorPosition(after, cellar).difficulty).toBe('nightmare');
  });
});

describe('endless depths', () => {
  it('has no last floor and no boss, with a mini-boss on every 10th depth', () => {
    expect(floorCount(cellar, 'endless')).toBe(Infinity);
    expect(floorKind(plain, cellar, 7, 'endless')).toBe('wave');
    expect(floorKind(plain, cellar, 10, 'endless')).toBe('miniboss');
    expect(floorKind(plain, cellar, 1_000_000, 'endless')).toBe('miniboss');
    expect(floorKind(plain, cellar, 1_000_001, 'endless')).toBe('wave');
  });

  it('keeps growing at the steady floor rate from the Nightmare boss', () => {
    const { hpGrowth, waveHpShare, miniBossHpShare } = plain.combat.floors;
    const boss = floorSpec(plain, cellar, 'nightmare', 10);
    const depth = (d: number) => floorSpec(plain, cellar, 'endless', d);
    expect(depth(1).hp.div(boss.hp).toNumber()).toBeCloseTo(hpGrowth * waveHpShare, 9);
    expect(depth(2).hp.div(depth(1).hp).toNumber()).toBeCloseTo(hpGrowth, 9);
    expect(depth(2).attack.div(depth(1).attack).toNumber()).toBeCloseTo(hpGrowth, 9);
    expect(depth(10).hp.div(boss.hp).toNumber()).toBeCloseTo(hpGrowth ** 10 * miniBossHpShare, 6);
    // Depth 500 is still a finite, larger floor, and so is one far past where plain numbers end.
    expect(depth(500).hp.gt(depth(499).hp)).toBe(true);
    const far = depth(20_000);
    expect(far.hp.gt(depth(19_999).hp)).toBe(true);
    expect(far.hp.isFinite() && far.attack.isFinite()).toBe(true);
    expect(Number.isFinite(far.enemies[0]!.dropScale)).toBe(true);
    // The deeper, the better the rewards: an enemy's share of the purse grows with its HP.
    expect(depth(50).enemies[0]!.dropScale).toBeGreaterThan(depth(5).enemies[0]!.dropScale);
  });

  it('drops its own dungeon materials at every depth', () => {
    const content = harmless(withDps(1e60, plain));
    const start = on(inCellar(content), content, 1, 'endless');
    const { state, report } = run(start, content, 3.01, constantRng(0));
    expect(report.materials['moss_core']).toBeGreaterThan(0);
    expect(Object.keys(report.materials)).toEqual(['moss_core']);
    expect(floorPosition(state, cellar).difficulty).toBe('endless');
  });

  it('pushes down the depths and stops where the hit runs out', () => {
    // A hit worth 1e25: the Nightmare boss has about 1.3e10 HP, and each depth is 1.12 times
    // the one before, so the hit carries a long way down and then stops.
    const content = harmless(withDps(1e25, plain));
    const start = withOverflow(on(inCellar(content), content, 1, 'endless'), content);
    const { state } = run(start, content, 1.01);
    const position = floorPosition(state, cellar);
    expect(position.floors).toBe(Infinity);
    expect(position.floor).toBeGreaterThan(100);
    expect(position.floor).toBeLessThan(400);
    expect(position.best).toBe(position.floor - 1);
    const status = bossStatus(state, content)!;
    expect(status.floors).toBe(Infinity);
    expect(status.difficulty).toBe('endless');
  });

  it('drops a depth and switches to farm on a knockout, never above depth 1', () => {
    const content = withBossAttack(withDps(1, plain), 'mossy_cellar', 1, 2);
    const start = on(inCellar(content), content, 5, 'endless');
    const { state, report } = run(start, content, 3);
    expect(report.knockouts).toBe(1);
    expect(floorPosition(state, cellar)).toMatchObject({ floor: 4, mode: 'farm', best: 4 });
    const bottom = run(on(inCellar(content), content, 1, 'endless'), content, 200).state;
    expect(floorPosition(bottom, cellar).floor).toBe(1);
  });

  it('resets the depth to half of the best one on an Ascension and keeps the best', () => {
    const state = on(freshState(), plain, 31, 'endless');
    state.mastery.harvested['oak_gem'] = new Decimal('1e30');
    const result = ascend(state, plain);
    if (!result.ok) throw new Error(result.reason);
    expect(floorPosition(result.state, cellar, 'endless')).toMatchObject({ floor: 15, best: 30 });
  });

  it('never pushes deeper while offline', () => {
    const content = harmless(withDps(1e25, plain));
    const start = on(inCellar(content), content, 3, 'endless');
    const away = simulateOffline(start, content, 0, 600_000, createSeededRng(1));
    expect(floorPosition(away.state, cellar)).toMatchObject({ floor: 3, difficulty: 'endless' });
  });

  it('reads as a depth on the interim floor line', () => {
    const parts = floorParts({
      floor: 12,
      floors: Infinity,
      floorKind: 'wave',
      wave: { index: 1, size: 3 },
      bestFloor: 30,
    });
    expect(parts).toEqual([
      { kind: 'depth', depth: 12 },
      { kind: 'enemy', index: 1, size: 3 },
      { kind: 'best', best: 30 },
    ]);
  });
});

describe('enemies do not grow with Ascension (DESIGN.md §6)', () => {
  it('keeps every floor of every tier as it is, HP and attack alike', () => {
    const at = (prestigeCount: number, floor: number, difficulty: 'normal' | 'hard') =>
      fightStage({ ...freshState(), prestigeCount }, plain, 'mossy_cellar', [], floor, difficulty)!;
    for (const floor of [1, 10]) {
      for (const difficulty of ['normal', 'hard'] as const) {
        expect(at(3, floor, difficulty).hp.eq(at(0, floor, difficulty).hp)).toBe(true);
        expect(at(3, floor, difficulty).attack.eq(at(0, floor, difficulty).attack)).toBe(true);
      }
    }
  });
});

describe('the three new dungeons', () => {
  it('follow the Frostspire Vault, each after the one before, with 40, 50 and 60 floors', () => {
    const shipped = loadContent();
    const later = shipped.dungeons.slice(3);
    expect(later.map((d) => [d.id, d.name, d.floors, d.unlockedBy])).toEqual([
      ['thunderpeak_aerie', 'Thunderpeak Aerie', 40, 'frostspire_vault'],
      ['sunken_sanctum', 'Sunken Sanctum', 50, 'thunderpeak_aerie'],
      ['void_hollow', 'Hollow of the Void', 60, 'sunken_sanctum'],
    ]);
    expect(later.map((d) => [d.boss.name, ...d.enemies.map((e) => e.name)])).toEqual([
      ['Storm Roc', 'Spark Wisp', 'Gale Harpy', 'Thunder Ram'],
      ['Dawn Hierophant', 'Lantern Moth', 'Gilded Acolyte', 'Marble Sentinel'],
      ['The Unmade King', 'Shade Mote', 'Hollow Stalker', 'Rift Maw'],
    ]);
    expect(later.map((d) => d.background)).toEqual(later.map((d) => d.id));
    expect(shipped.allDungeons).toHaveLength(6);
    expect(shipped.allDungeons.every((d) => d.enabled)).toBe(true);
    for (const d of later) {
      expect(d.enemies).toHaveLength(3);
      // No drawing yet: the labelled placeholder stands in.
      expect(d.boss.art).toBeUndefined();
      expect(shipped.cosmeticById.has(d.drops.rare.itemId)).toBe(true);
    }
    // Their rare items are their own.
    expect(new Set(shipped.dungeons.map((d) => d.drops.rare.itemId)).size).toBe(6);
  });

  it('open no new mine; each drops its own Core and Frost Sigils in growing amounts', () => {
    const shipped = loadContent();
    const later = shipped.dungeons.slice(3);
    expect(shipped.mines.some((m) => later.some((d) => d.id === m.unlockedByDungeon))).toBe(false);
    expect(later.map((d) => [d.drops.material.resource, d.drops.material.amount])).toEqual([
      ['storm_core', 3],
      ['sanctum_core', 4],
      ['void_core', 5],
    ]);
    expect(later.map((d) => d.drops.extraMaterials.map((e) => [e.resource, e.min]))).toEqual([
      [['frost_sigil', 2]],
      [['frost_sigil', 3]],
      [['frost_sigil', 4]],
    ]);
  });

  it('follow the floor rules like any dungeon', () => {
    const shipped = loadContent();
    const aerie = shipped.dungeonById.get('thunderpeak_aerie')!;
    expect(floorKind(shipped, aerie, 40)).toBe('boss');
    expect(floorKind(shipped, aerie, 30)).toBe('miniboss');
    expect(
      floorSpec(shipped, aerie, 'hard', 1).hp.gt(floorSpec(shipped, aerie, 'normal', 1).hp),
    ).toBe(true);
    expect(devSetFloor(freshState(), shipped, 'thunderpeak_aerie', 7).ok).toBe(true);
    // A dungeon can still be kept out of the game by its data.
    expect(loadContent({ unreleased: true }).dungeons).toHaveLength(6);
  });
});

describe('balance sim: tiers', () => {
  it('has milestones for the first Hard and Nightmare clears and the three new dungeons', () => {
    const byId = new Map(MILESTONES.map((m) => [m.id, m]));
    expect(byId.get('first_hard')!.targetHours).toBe(14);
    expect(byId.get('first_nightmare')!.targetHours).toBe(24);
    expect([4, 5, 6].map((n) => byId.get(`clear_d${n}`)!.targetHours)).toEqual([18, 28, 36]);
    expect(byId.get('clear_d4')!.pending).toBeUndefined();
    expect(byId.get('exhausted')!.targetHours).toBe(40);
    const state = on(freshState(), plain, 1, 'nightmare');
    const log = { summons: 0, levelAt: {}, ascensions: [], fought: {} };
    expect(byId.get('first_hard')!.reached(state, plain, log)).toBe(true);
    expect(byId.get('first_nightmare')!.reached(state, plain, log)).toBe(false);
  });

  it('climbs a tier it can get down when nothing else is waiting, and fights Normal otherwise', () => {
    const content = harmless(withDps(1e40, plain));
    // Everything cleared on Normal and no card upgrade waiting on a Core.
    let state = freshState();
    for (const d of content.dungeons) {
      const id = d.id;
      state.combat.floors[id] = {
        difficulty: 'normal',
        mode: 'farm',
        autoChallenge: false,
        tiers: { normal: { floor: d.floors, best: d.floors } },
      };
    }
    state.clearedDungeons = [...content.dungeons.map((d) => d.id), 'glimmer_trial'];
    state.combat.trialBest['glimmer_trial'] = 1;
    for (const card of Object.values(state.cards.owned)) card.level = 1;
    const fight = chooseFight(state, content, { trialShare: 1 });
    // The weakest open tier above Normal is the Mossy Cellar on Hard.
    if (fight.difficulty !== 'normal') {
      expect(fight).toEqual({ id: 'mossy_cellar', difficulty: 'hard' });
    } else {
      // A Core was wanted after all: it is farmed on Normal.
      expect(fight.difficulty).toBe('normal');
    }
    // A fresh game has nothing above Normal to climb.
    state = freshState();
    expect(chooseFight(state, content).difficulty).toBe('normal');
  });
});
