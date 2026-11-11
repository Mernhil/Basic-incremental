import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Content } from '../src/data';
import rawCombat from '../src/data/content/combat.json';
import rawDungeons from '../src/data/content/dungeons.json';
import { combatSchema, dungeonSchema } from '../src/data/schemas';
import {
  advance,
  allGoals,
  ascend,
  ascensionStartFloor,
  bossStatus,
  createSeededRng,
  CURRENT_SAVE_VERSION,
  Decimal,
  fightStage,
  floorKind,
  floorPosition,
  floorSpec,
  isDifficultyUnlocked,
  isDungeonCleared,
  isDungeonUnlocked,
  loadoutHealth,
  MIGRATIONS,
  parseStageKey,
  readSave,
  floorChallengeView,
  initialProgress,
  nextFloorChallenge,
  setActiveDungeon,
  setAutoChallenge,
  simulateOffline,
  stageKey,
  startFloorChallenge,
  winsFloor,
  type GameState,
  type TickReport,
} from '../src/game';
import { devSetDungeonCleared, devSetFloor } from '../src/game/dev';
import {
  constantRng,
  floorsContent,
  freshState,
  neutralStars,
  withBossAttack,
  withAutoChallenge,
  withDps,
  withOverflow,
} from './helpers';

/**
 * Dungeon floors (DESIGN.md §6 Dungeon floors, Clearing, Normal enemies): a dungeon is a stack of
 * floors, waves of normal enemies with a mini-boss every 10th floor and the boss on the last one.
 * These tests use the shipped floor counts (10, 20, 30) with crits and mastery bonuses off.
 */
const plain: Content = {
  ...neutralStars(floorsContent),
  combat: { ...neutralStars(floorsContent).combat, crit: { chance: 0, damage: new Decimal(1) } },
};
/** Enemies that never hurt: the Root Warden's attack pinned to almost nothing. */
const harmless = (base: Content): Content => withBossAttack(base, 'mossy_cellar', 1e-9, 10);
const cellar = plain.dungeonById.get('mossy_cellar')!;
const crypt = plain.dungeonById.get('ember_crypt')!;
const rng = () => constantRng(0.5);

const inCellar = (content: Content): GameState => {
  const state = freshState();
  const result = setActiveDungeon(state, content, 'mossy_cellar');
  return result.ok ? result.state : state;
};
const run = (state: GameState, content: Content, seconds: number, r = rng()) =>
  advance(state, content, seconds * 1000, r);

describe('what a floor holds', () => {
  it('reads the floor counts from the data: 10, 20 and 30, then 40, 50 and 60', () => {
    expect(plain.dungeons.map((d) => d.floors)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(plain.dungeons.every((d) => d.enemies.length === 3)).toBe(true);
  });

  it('puts the boss on the last floor, a mini-boss on every 10th and waves on the rest', () => {
    expect(floorKind(plain, cellar, 1)).toBe('wave');
    expect(floorKind(plain, cellar, 9)).toBe('wave');
    expect(floorKind(plain, cellar, 10)).toBe('boss');
    expect(floorKind(plain, crypt, 10)).toBe('miniboss');
    expect(floorKind(plain, crypt, 11)).toBe('wave');
    expect(floorKind(plain, crypt, 20)).toBe('boss');
  });

  it('makes a normal floor a wave of 3 to 5 of the dungeon own enemies', () => {
    const ids = new Set(cellar.enemies.map((e) => e.id));
    for (let floor = 1; floor < 10; floor++) {
      const spec = floorSpec(plain, cellar, 'normal', floor);
      expect(spec.kind).toBe('wave');
      expect(spec.enemies.length).toBeGreaterThanOrEqual(3);
      expect(spec.enemies.length).toBeLessThanOrEqual(5);
      expect(spec.enemies.every((e) => ids.has(e.id) && e.kind === 'enemy')).toBe(true);
    }
  });

  it('always puts the same wave on the same floor', () => {
    const names = (floor: number) =>
      floorSpec(plain, crypt, 'normal', floor).enemies.map((e) => e.id);
    expect(names(7)).toEqual(names(7));
    // ... and the floors differ from each other somewhere down the dungeon.
    const all = Array.from({ length: 9 }, (_, i) => names(i + 1).join(','));
    expect(new Set(all).size).toBeGreaterThan(1);
  });

  it('grows the floors at one steady rate that ends on the boss as the data has it', () => {
    const { hpGrowth, waveHpShare, waveAttackShare } = plain.combat.floors;
    const wave = (floor: number) => floorSpec(plain, cellar, 'normal', floor);
    expect(wave(2).hp.div(wave(1).hp).toNumber()).toBeCloseTo(hpGrowth, 9);
    expect(wave(9).hp.div(wave(8).hp).toNumber()).toBeCloseTo(hpGrowth, 9);
    expect(wave(9).attack.div(wave(8).attack).toNumber()).toBeCloseTo(hpGrowth, 9);
    // A wave is a share of what a boss would be on that floor.
    expect(wave(9).hp.toNumber()).toBeCloseTo((cellar.boss.hp.toNumber() * waveHpShare) / hpGrowth);
    expect(wave(9).attack.toNumber()).toBeCloseTo(
      (cellar.boss.attack.damage.toNumber() * waveAttackShare) / hpGrowth,
    );
    const boss = wave(10);
    expect(boss.hp.eq(cellar.boss.hp)).toBe(true);
    expect(boss.attack.eq(cellar.boss.attack.damage)).toBe(true);
    expect(boss.enemies).toHaveLength(1);
    expect(boss.enemies[0]).toMatchObject({ id: 'root_warden', kind: 'boss', dropScale: 1 });
  });

  it('gives each enemy type its own HP and a purse in proportion', () => {
    const spec = floorSpec(plain, cellar, 'normal', 3);
    const total = spec.enemies.reduce((sum, e) => sum.add(e.hp), new Decimal(0));
    expect(total.toNumber()).toBeCloseTo(spec.hp.toNumber());
    for (const enemy of spec.enemies) {
      expect(enemy.dropScale).toBeCloseTo(enemy.hp.div(cellar.boss.hp).toNumber(), 12);
    }
    const weights = new Map(cellar.enemies.map((e) => [e.id, e.hpWeight]));
    const [a, b] = [spec.enemies[0]!, spec.enemies.find((e) => e.id !== spec.enemies[0]!.id)];
    if (b) {
      expect(a.hp.div(b.hp).toNumber()).toBeCloseTo(weights.get(a.id)! / weights.get(b.id)!, 9);
    }
  });

  it('makes a mini-boss a stronger copy of one of the dungeon enemies', () => {
    const spec = floorSpec(plain, crypt, 'normal', 10);
    expect(spec.enemies).toHaveLength(1);
    const mini = spec.enemies[0]!;
    expect(mini.kind).toBe('miniboss');
    expect(crypt.enemies.some((e) => e.id === mini.id)).toBe(true);
    expect(mini.name.startsWith(`${plain.combat.floors.miniBossPrefix} `)).toBe(true);
    const wave = floorSpec(plain, crypt, 'normal', 9);
    expect(mini.hp.gt(wave.hp)).toBe(true);
  });
});

describe('floors data', () => {
  it('needs at least one floor and one normal enemy per dungeon', () => {
    const raw = rawDungeons[0]!;
    expect(dungeonSchema.safeParse(raw).success).toBe(true);
    expect(dungeonSchema.safeParse({ ...raw, floors: 0 }).success).toBe(false);
    expect(dungeonSchema.safeParse({ ...raw, enemies: [] }).success).toBe(false);
    // The old kill count is gone from the data.
    expect(dungeonSchema.safeParse({ ...raw, killsToClear: 1 }).success).toBe(false);
  });

  it('keeps the floor ladder growing and the wave inside its size range', () => {
    const floors = rawCombat.floors;
    expect(combatSchema.safeParse(rawCombat).success).toBe(true);
    expect(
      combatSchema.safeParse({ ...rawCombat, floors: { ...floors, hpGrowth: 0.9 } }).success,
    ).toBe(false);
    expect(
      combatSchema.safeParse({ ...rawCombat, floors: { ...floors, waveSize: { min: 5, max: 3 } } })
        .success,
    ).toBe(false);
  });
});

describe('farming and Challenge (DESIGN.md §6)', () => {
  /** The cellar farming `floor` (beaten), with auto-challenge `auto`. */
  const farmingAt = (content: Content, floor: number, auto = false): GameState => {
    const placed = devSetFloor(inCellar(content), content, 'mossy_cellar', floor);
    if (!placed.ok) throw new Error(placed.reason);
    return withAutoChallenge(placed.state, auto);
  };
  const challenge = (state: GameState, content: Content): GameState => {
    const started = startFloorChallenge(state, content);
    if (!started.ok) throw new Error(started.reason);
    return started.state;
  };

  it('starts a new game on floor 1 of the Mossy Cellar with auto-challenge on, floor 1 its first Challenge', () => {
    const state = withAutoChallenge(inCellar(plain), true);
    expect(floorPosition(state, cellar)).toEqual({
      difficulty: 'normal',
      autoChallenge: true,
      floor: 1,
      best: 0,
      floors: 10,
      challengeFloor: 1,
    });
    const status = bossStatus(state, plain)!;
    expect(status.floor).toBe(1);
    expect(status.floorKind).toBe('wave');
    expect(status.enemy.kind).toBe('enemy');
    expect(status.wave.index).toBe(1);
    expect(status.challenge).toBeNull();
    // A new game's dungeon has the switch on (floors.ts `initialProgress`).
    expect(initialProgress().autoChallenge).toBe(true);
  });

  it('farms the farmed floor on a loop and never climbs while auto-challenge is off', () => {
    const content = harmless(withDps(100, plain));
    const { state, report } = run(farmingAt(content, 3), content, 120);
    expect(floorPosition(state, cellar)).toMatchObject({ floor: 3, best: 3, challengeFloor: 4 });
    expect(report.floorsCleared).toBeGreaterThan(1);
    expect(report.challenges).toEqual([]);
  });

  it('wins a Challenge: Victory, the best floor rises by one and the farming moves down to it', () => {
    const content = harmless(withDps(100, plain));
    const start = challenge(farmingAt(content, 3), content);
    expect(bossStatus(start, content)).toMatchObject({ floor: 4, farmFloor: 3, challengeFloor: 4 });
    expect(start.combat.challenge).toEqual({
      dungeonId: 'mossy_cellar',
      difficulty: 'normal',
      elapsedSeconds: 0,
    });
    let state = start;
    const ended: TickReport['challenges'] = [];
    for (let i = 0; i < 30 && ended.length === 0; i++) {
      const step = run(state, content, 1);
      state = step.state;
      ended.push(...step.report.challenges);
    }
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ floor: 4, won: true, reason: null, difficulty: 'normal' });
    expect(floorPosition(state, cellar)).toMatchObject({ floor: 4, best: 4, challengeFloor: 5 });
    expect(state.combat.challenge).toBeNull();
    // Auto-challenge is off: it farms floor 4 from now on.
    const later = run(state, content, 60);
    expect(floorPosition(later.state, cellar)).toMatchObject({ floor: 4, best: 4 });
    expect(later.report.challenges).toEqual([]);
  });

  it('loses a Challenge on the timer: why, the enemy HP left, back to farming, retried at once', () => {
    const content = harmless(withDps(1, plain));
    const start = challenge(farmingAt(content, 1), content);
    const timer = nextFloorChallenge(
      farmingAt(content, 1),
      content,
      'mossy_cellar',
    )!.durationSeconds;
    expect(timer).toBe(30);
    expect(floorChallengeView(start, content)).toMatchObject({ floor: 2, secondsLeft: 30 });
    const halfway = run(start, content, 10).state;
    expect(floorChallengeView(halfway, content)).toMatchObject({
      elapsedSeconds: 10,
      secondsLeft: 20,
    });
    const { state, report } = run(halfway, content, 21);
    expect(report.challenges).toHaveLength(1);
    const lost = report.challenges[0]!;
    expect(lost).toMatchObject({ floor: 2, won: false, reason: 'timer' });
    const floorHp = fightStage(start, content, 'mossy_cellar')!.hp;
    // 30 hits of 1 (and a signature attack) landed on the floor's first enemy: that much less is left.
    expect(lost.enemyHpLeft.toNumber()).toBeLessThan(floorHp.toNumber() - 30);
    expect(lost.enemyHpLeft.toNumber()).toBeGreaterThan(floorHp.toNumber() - 60);
    expect(floorPosition(state, cellar)).toMatchObject({ floor: 1, best: 1 });
    expect(state.combat.challenge).toBeNull();
    expect(state.combat.knockoutSeconds).toBe(0);
    // Auto-challenge is off: no wait, and the button starts the next try for free.
    expect(state.combat.challengeWaitSeconds).toBe(0);
    expect(startFloorChallenge(state, content).ok).toBe(true);
  });

  it('loses a Challenge when the health runs out, without a knockout, at full health after', () => {
    const content = withBossAttack(withDps(100, plain), 'mossy_cellar', 1e7, 2);
    const start = challenge(farmingAt(content, 4), content);
    const { state, report } = run(start, content, 3);
    expect(report.challenges.map((c) => [c.won, c.reason])).toEqual([[false, 'health']]);
    expect(report.knockouts).toBe(0);
    expect(report.bossAttacks.some((a) => a.knockout)).toBe(true);
    expect(floorPosition(state, cellar)).toMatchObject({ floor: 4, best: 4 });
    expect(state.combat.knockoutSeconds).toBe(0);
  });

  it('times a Challenge by what its floor holds: 30 s a wave, 45 s a mini-boss, 60 s a boss', () => {
    expect(rawCombat.challenge).toEqual({
      timerSeconds: { wave: 30, miniboss: 45, boss: 60 },
      autoWaitSeconds: 60,
    });
    const timer = (dungeonId: string, floor: number): number | undefined => {
      const placed = devSetFloor(freshState(), plain, dungeonId, floor);
      if (!placed.ok) throw new Error(placed.reason);
      return nextFloorChallenge(placed.state, plain, dungeonId)?.durationSeconds;
    };
    expect(timer('mossy_cellar', 1)).toBe(30);
    expect(timer('ember_crypt', 9)).toBe(45);
    expect(timer('mossy_cellar', 9)).toBe(60);
    // The last floor of a tier has nothing to challenge.
    expect(timer('mossy_cellar', 10)).toBeUndefined();
  });

  it('starts the next Challenge by itself after a win and waits 60 s after a loss (auto-challenge)', () => {
    // Strong: one Challenge after the other, down to the boss, which clears the dungeon.
    const strong = harmless(withDps(1e9, plain));
    const climbed = run(withAutoChallenge(inCellar(strong), true), strong, 60);
    expect(floorPosition(climbed.state, cellar)).toMatchObject({
      floor: 10,
      best: 10,
      challengeFloor: null,
    });
    expect(climbed.report.challenges.map((c) => c.floor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(climbed.report.challenges.every((c) => c.won)).toBe(true);
    expect(isDungeonCleared(climbed.state, 'mossy_cellar')).toBe(true);
    // Weak: the first Challenge is lost on the timer, then the wait runs before the next try.
    const weak = harmless(withDps(1, plain));
    const lost = run(farmingAt(weak, 1, true), weak, 30.5);
    expect(lost.report.challenges.map((c) => c.reason)).toEqual(['timer']);
    expect(lost.state.combat.challenge).toBeNull();
    expect(lost.state.combat.challengeWaitSeconds).toBeCloseTo(59.5, 6);
    expect(nextFloorChallenge(lost.state, weak, 'mossy_cellar')).toMatchObject({
      auto: true,
      floor: 2,
    });
    const waiting = run(lost.state, weak, 59.4).state;
    expect(waiting.combat.challenge).toBeNull();
    const again = run(waiting, weak, 0.2).state;
    expect(again.combat.challenge).toMatchObject({ dungeonId: 'mossy_cellar' });
    expect(again.combat.challengeWaitSeconds).toBe(0);
  });

  it('refuses a Challenge with nothing to challenge, while one runs or while knocked out', () => {
    expect(startFloorChallenge(farmingAt(plain, 10), plain)).toEqual({ ok: false, reason: 'none' });
    const running = challenge(farmingAt(plain, 3), plain);
    expect(startFloorChallenge(running, plain)).toEqual({ ok: false, reason: 'busy' });
    const knocked = farmingAt(plain, 3);
    knocked.combat.knockoutSeconds = 5;
    expect(startFloorChallenge(knocked, plain)).toEqual({ ok: false, reason: 'busy' });
    const idle = { ...freshState(), activeDungeonId: null };
    expect(startFloorChallenge(idle, plain)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('ends a running Challenge when the dungeon or the difficulty fought changes', () => {
    const running = challenge(farmingAt(plain, 3), plain);
    const away = setActiveDungeon(running, plain, null);
    expect(away.ok && away.state.combat.challenge).toBeNull();
  });

  it('switches auto-challenge only for a dungeon that is open', () => {
    const state = inCellar(plain);
    expect(setAutoChallenge(state, plain, 'ember_crypt', true)).toEqual({
      ok: false,
      reason: 'locked',
    });
    expect(setAutoChallenge(state, plain, 'nowhere', true)).toEqual({
      ok: false,
      reason: 'unknown',
    });
    const same = setAutoChallenge(state, plain, 'mossy_cellar', false);
    expect(same.ok && same.state).toBe(state);
    const on = setAutoChallenge(state, plain, 'mossy_cellar', true);
    expect(on.ok && floorPosition(on.state, cellar).autoChallenge).toBe(true);
  });

  it('farms a beaten floor: a save that stood a floor past its best farms its best', () => {
    const state = inCellar(plain);
    state.combat.floors['mossy_cellar']!.tiers.normal = { floor: 6, best: 5 };
    expect(floorPosition(state, cellar)).toMatchObject({ floor: 5, best: 5, challengeFloor: 6 });
  });
});

describe('each enemy has its own HP (DESIGN.md §6)', () => {
  it('kills the enemies of a wave one after the other', () => {
    const content = harmless(withDps(10, plain));
    const start = inCellar(content);
    const stage = fightStage(start, content, 'mossy_cellar')!;
    const first = stage.enemies[0]!;
    // Just enough hits to finish the first enemy, not the wave.
    const seconds = Math.ceil(first.hp.toNumber() / 10) + 1;
    const { state, report } = run(start, content, seconds);
    expect(report.enemyKills).toBe(1);
    expect(report.floorsCleared).toBe(0);
    const status = bossStatus(state, content)!;
    expect(status.wave).toEqual({ index: 2, size: stage.enemies.length });
    expect(status.enemy.id).toBe(stage.enemies[1]!.id);
    expect(status.maxHp.eq(stage.enemies[1]!.hp)).toBe(true);
    expect(state.combat.enemyIndex).toBe(1);
  });

  it('stops a hit at the kill while overflow is off, and carries it on while it is on', () => {
    // One hit of 1e9 is far more than a whole floor.
    const content = harmless(withDps(1e9, plain));
    const size = fightStage(inCellar(content), content, 'mossy_cellar')!.enemies.length;
    const off = run(inCellar(content), content, 1.01);
    expect(off.report.enemyKills).toBe(1);
    expect(off.report.floorsCleared).toBe(0);
    // On, the hit clears the farmed floor again and again, and never leaves it.
    const on = run(withOverflow(inCellar(content), content), content, 1.01);
    expect(on.report.floorsCleared).toBeGreaterThan(1000);
    expect(on.report.enemyKills).toBeGreaterThan(1000 * size);
    expect(floorPosition(on.state, cellar)).toMatchObject({ floor: 1, best: 0 });
    // Farmed in bulk with overflow off, it is one kill a hit, round and round the wave.
    const bulk = run(inCellar(content), content, 100.01);
    expect(bulk.report.enemyKills).toBe(100);
    expect(bulk.report.floorsCleared).toBe(Math.floor(100 / size));
    expect(bulk.state.combat.enemyIndex).toBe(100 % size);
  });

  it('gives the same floors however the time is split, Challenges included', () => {
    const content = harmless(withDps(40, plain));
    const start = withAutoChallenge(inCellar(content), true);
    const once = run(start, content, 300, createSeededRng(3));
    let state = start;
    const stepRng = createSeededRng(3);
    let cleared = 0;
    let challenges = 0;
    for (let i = 0; i < 300 * 4; i++) {
      const step = advance(state, content, 250, stepRng);
      state = step.state;
      cleared += step.report.floorsCleared;
      challenges += step.report.challenges.length;
    }
    expect(floorPosition(once.state, cellar).best).toBeGreaterThan(1);
    expect(floorPosition(state, cellar)).toEqual(floorPosition(once.state, cellar));
    expect(cleared).toBe(once.report.floorsCleared);
    expect(challenges).toBe(once.report.challenges.length);
    expect(state.combat.enemyIndex).toBe(once.state.combat.enemyIndex);
    expect(state.resources['money']!.toNumber()).toBeCloseTo(
      once.state.resources['money']!.toNumber(),
      6,
    );
    expect((state.bossHp ?? new Decimal(0)).toNumber()).toBeCloseTo(
      (once.state.bossHp ?? new Decimal(0)).toNumber(),
      3,
    );
  });

  it('lands a hit that is already due (a slower lead card was swapped for a faster one)', () => {
    const content = harmless(withDps(100, plain));
    const start = inCellar(content);
    // The gauge timer sits at the hit interval, as it does after the lead card changes.
    start.bursts.fighting = { gauge: 0, timer: 1 };
    const { report } = run(start, content, 12);
    expect(report.playerHits.reduce((n, h) => n + h.hits, 0)).toBeGreaterThanOrEqual(12);
    expect(report.enemyKills).toBeGreaterThanOrEqual(1);
  });
});

describe('health and knockouts on floors', () => {
  it('refills the loadout health when a floor is cleared', () => {
    // The floors hit hard enough to show on the health bar, not hard enough to win.
    const content = withBossAttack(withDps(100, plain), 'mossy_cellar', 30, 2);
    let state = inCellar(content);
    const missing = (s: GameState): number => {
      const health = loadoutHealth(s, content);
      return health.max.sub(health.current).toNumber();
    };
    let before = 0;
    let cleared = 0;
    for (let i = 0; i < 60 && cleared === 0; i++) {
      before = missing(state);
      const step = run(state, content, 1);
      state = step.state;
      cleared = step.report.floorsCleared;
    }
    expect(cleared).toBe(1);
    // The wave had taken a few hits' worth from the pool ...
    expect(before).toBeGreaterThan(0);
    // ... and the clear gave it all back.
    expect(missing(state)).toBe(0);
  });

  it('drops the farming a floor on a knockout, so walls work on their own', () => {
    const content = withBossAttack(withDps(100, plain), 'mossy_cellar', 1e7, 2);
    const start = devSetFloor(inCellar(content), content, 'mossy_cellar', 5);
    if (!start.ok) throw new Error(start.reason);
    expect(winsFloor(start.state, content, 'mossy_cellar')).toBe(false);
    const { state, report } = run(start.state, content, 3);
    expect(report.knockouts).toBe(1);
    const position = floorPosition(state, cellar);
    expect(position.floor).toBe(4);
    expect(position.best).toBe(5);
    expect(position.challengeFloor).toBe(5);
    expect(state.bossHp).toBeNull();
    expect(state.combat.knockoutSeconds).toBeGreaterThan(0);
  });

  it('never drops below floor 1', () => {
    const content = withBossAttack(withDps(1, plain), 'mossy_cellar', 1e9, 2);
    const { state, report } = run(inCellar(content), content, 200);
    expect(report.knockouts).toBeGreaterThan(1);
    expect(floorPosition(state, cellar).floor).toBe(1);
  });
});

describe('clearing', () => {
  it('clears the dungeon the first time its last-floor boss dies, in a Challenge', () => {
    const content = harmless(withDps(200, plain));
    const start = devSetFloor(inCellar(content), content, 'mossy_cellar', 9);
    if (!start.ok) throw new Error(start.reason);
    // Farming floor 9 never clears it, however long.
    const farmed = run(start.state, content, 120).state;
    expect(isDungeonCleared(farmed, 'mossy_cellar')).toBe(false);
    let state = withAutoChallenge(farmed, true);
    const cleared: string[] = [];
    const mines: string[] = [];
    const opened: string[] = [];
    for (let i = 0; i < 600 && !isDungeonCleared(state, 'mossy_cellar'); i++) {
      const step = run(state, content, 1);
      state = step.state;
      cleared.push(...step.report.cleared);
      mines.push(...step.report.unlockedMines);
      opened.push(...step.report.unlockedDungeons);
    }
    expect(isDungeonCleared(state, 'mossy_cellar')).toBe(true);
    expect(cleared).toEqual(['mossy_cellar']);
    expect(mines).toEqual(['iron_deeps']);
    expect(opened).toContain('ember_crypt');
    expect(state.combat.stageKills['mossy_cellar:normal:10']).toBe(1);
    // The boss floor is farmed from then on: there is nothing deeper to challenge.
    const later = run(state, content, 300).state;
    expect(floorPosition(later, cellar).floor).toBe(10);
    expect(later.combat.stageKills['mossy_cellar:normal:10']).toBeGreaterThan(1);
  });

  it('pays the first-clear purse once', () => {
    // On the boss floor, with a hit that is just the boss's HP: one kill a second.
    const content = harmless(withDps(13_000, plain));
    const below = devSetFloor(inCellar(content), content, 'mossy_cellar', 9);
    if (!below.ok) throw new Error(below.reason);
    // The boss's Challenge, then farming the boss.
    const started = startFloorChallenge(below.state, content);
    if (!started.ok) throw new Error(started.reason);
    const start = started.state;
    const crystals = (s: GameState) => s.resources['summon_crystal']!;
    const purse = cellar.drops.firstClear.find((p) => p.resource === 'summon_crystal')!.amount;
    const wage = cellar.drops.wages.find((w) => w.resource === 'summon_crystal')!.perSecond;
    const first = run(start, content, 1.5);
    expect(first.report.cleared).toEqual(['mossy_cellar']);
    expect(crystals(first.state).sub(crystals(start)).toNumber()).toBeCloseTo(
      purse.add(wage.mul(1.5)).toNumber(),
    );
    const again = run(first.state, content, 1.5);
    expect(again.report.bossKills).toBeGreaterThan(0);
    expect(crystals(again.state).sub(crystals(first.state)).toNumber()).toBeCloseTo(
      wage.mul(1.5).toNumber(),
    );
  });
});

describe('drops of normal enemies', () => {
  it('pays each enemy its share of the boss purse, and never the rare item', () => {
    const content = harmless(withDps(1e5, plain));
    const start = inCellar(content);
    const stage = fightStage(start, content, 'mossy_cellar')!;
    const wageMoney = cellar.drops.wages.find((w) => w.resource === 'money')!.perSecond;
    // rng 0: every roll is the lowest purse, every chance hits and every fraction rounds up.
    const { state, report } = run(start, content, 10, constantRng(0));
    // A hit a second, each one kill: overflow is off, so a hit stops at its enemy.
    expect(report.enemyKills).toBe(10);
    const killed = Array.from({ length: 10 }, (_, i) => stage.enemies[i % stage.enemies.length]!);
    const paid = killed.reduce((sum, e) => sum + e.purseScale, 0);
    // Each enemy is paid its share of the purse: on floor 1 its plain share of the HP, and 2%
    // more for every floor below (DESIGN.md §6 Deeper pays more).
    const worth = stage.enemies.reduce((sum, e) => sum + e.purseScale, 0);
    expect(worth).toBeCloseTo(
      stage.enemies.reduce((sum, e) => sum + e.dropScale, 0) *
        content.combat.floors.purseFloorBonus ** 0,
      12,
    );
    const { min, max } = cellar.drops.currencies[0]!;
    const gained =
      state.resources['money']!.sub(start.resources['money']!).toNumber() -
      wageMoney.toNumber() * 10;
    // A run of kills is paid at the average purse, each enemy at its share of the boss's:
    // between the lowest and the highest purse, give or take the rounding.
    expect(gained).toBeGreaterThanOrEqual(min * paid * 0.999);
    expect(gained).toBeLessThanOrEqual(max * paid + 10);
    expect(gained).toBeCloseTo(((min + max) / 2) * paid, -3);
    expect(report.drops).toEqual({});
    expect(state.pity['root_warden'] ?? 0).toBe(0);
    expect(state.combat.stageKills['mossy_cellar:normal:10'] ?? 0).toBe(0);
    expect(state.stats.bossKills).toBe(0);
  });

  it('keeps the boss drops on the boss floor: purse, Core, rare item with pity', () => {
    // A hit that is just the boss's HP: one kill a second.
    const content = harmless(withDps(13_000, plain));
    const start = devSetFloor(inCellar(content), content, 'mossy_cellar', 10);
    if (!start.ok) throw new Error(start.reason);
    const { state, report } = run(start.state, content, 5, constantRng(0.999));
    expect(report.bossKills).toBe(5);
    expect(report.enemyKills).toBe(0);
    expect(state.combat.stageKills['mossy_cellar:normal:10']).toBe(5);
    expect(state.stats.bossKills).toBe(5);
    expect(state.pity['root_warden']).toBe(5);
    expect(report.currencies['money']).toBeGreaterThanOrEqual(cellar.drops.currencies[0]!.max * 5);
  });
});

describe('offline, Ascension and goals', () => {
  it('farms offline, and climbs only where auto-challenge is on', () => {
    const content = harmless(withDps(1e6, plain));
    const start = devSetFloor(inCellar(content), content, 'mossy_cellar', 3);
    if (!start.ok) throw new Error(start.reason);
    const away = simulateOffline(start.state, content, 0, 3600 * 1000, createSeededRng(1));
    expect(floorPosition(away.state, cellar)).toMatchObject({ floor: 3, best: 3 });
    expect(away.summary!.enemyKills).toBeGreaterThan(1000);
    // With auto-challenge on, it keeps challenging the next floors by the same rules.
    const auto = withAutoChallenge(start.state, true);
    const climbed = simulateOffline(auto, content, 0, 3600 * 1000, createSeededRng(1));
    expect(floorPosition(climbed.state, cellar)).toMatchObject({ floor: 10, best: 10 });
    expect(isDungeonCleared(climbed.state, 'mossy_cellar')).toBe(true);
  });

  it('restarts each dungeon at half of its best floor on an Ascension, auto-challenge on', () => {
    expect(ascensionStartFloor(0)).toBe(1);
    expect(ascensionStartFloor(1)).toBe(1);
    expect(ascensionStartFloor(9)).toBe(4);
    expect(ascensionStartFloor(30)).toBe(15);
    const state = freshState();
    state.combat.floors['mossy_cellar'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 10, best: 10 } },
    };
    state.combat.floors['ember_crypt'] = {
      difficulty: 'normal',
      autoChallenge: false,
      tiers: { normal: { floor: 6, best: 13 } },
    };
    state.combat.challenge = { dungeonId: 'mossy_cellar', difficulty: 'normal', elapsedSeconds: 3 };
    state.combat.challengeWaitSeconds = 20;
    state.combat.enemyIndex = 2;
    state.clearedDungeons = ['mossy_cellar'];
    state.mastery.harvested['oak_gem'] = new Decimal('1e30');
    const result = ascend(state, plain);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.combat.floors['mossy_cellar']).toMatchObject({
      difficulty: 'normal',
      autoChallenge: true,
      tiers: { normal: { floor: 5, best: 10 } },
    });
    expect(floorPosition(result.state, cellar).challengeFloor).toBe(6);
    expect(result.state.combat.challenge).toBeNull();
    expect(result.state.combat.challengeWaitSeconds).toBe(0);
    expect(result.state.combat.enemyIndex).toBe(0);
    expect(result.state.combat.floors['ember_crypt']!.tiers.normal).toEqual({ floor: 6, best: 13 });
    expect(isDungeonCleared(result.state, 'mossy_cellar')).toBe(true);
  });

  it('shows the way down as the progress of the "Clear" goal', () => {
    const content = harmless(withDps(100, plain));
    const start = devSetFloor(inCellar(content), content, 'mossy_cellar', 6);
    if (!start.ok) throw new Error(start.reason);
    const goal = allGoals(start.state, content).find((g) => g.id === 'clear_dungeon:mossy_cellar')!;
    expect(goal.progress).toBeCloseTo(0.5);
    expect(goal.etaSeconds).toBeGreaterThan(0);
    // A floor that would knock the loadout out first is a wall: no ETA.
    const walled = withBossAttack(content, 'mossy_cellar', 1e9, 2);
    const stuck = allGoals(start.state, walled).find((g) => g.id === 'clear_dungeon:mossy_cellar')!;
    expect(stuck.etaSeconds).toBeNull();
  });
});

describe('dev cheats', () => {
  it('puts a cleared dungeon on its last floor, and an uncleared one back on floor 1', () => {
    const cleared = devSetDungeonCleared(freshState(), plain, 'ember_crypt', true);
    if (!cleared.ok) throw new Error(cleared.reason);
    expect(floorPosition(cleared.state, crypt)).toMatchObject({ floor: 20, best: 20 });
    const back = devSetDungeonCleared(cleared.state, plain, 'ember_crypt', false);
    if (!back.ok) throw new Error(back.reason);
    expect(floorPosition(back.state, crypt)).toMatchObject({ floor: 1, best: 0 });
  });

  it('sets a floor inside the dungeon range', () => {
    const deep = devSetFloor(freshState(), plain, 'mossy_cellar', 99);
    expect(deep.ok && floorPosition(deep.state, cellar)).toMatchObject({ floor: 10, best: 10 });
    const mid = devSetFloor(freshState(), plain, 'mossy_cellar', 4);
    expect(mid.ok && floorPosition(mid.state, cellar)).toMatchObject({
      floor: 4,
      best: 4,
      challengeFloor: 5,
    });
    expect(devSetFloor(freshState(), plain, 'nowhere', 2)).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});

describe('save formats 24 and 25: floors', () => {
  it('has a step at key 23 that puts cleared dungeons on their last floor, in farm mode', () => {
    const out = MIGRATIONS[23]!({
      clearedDungeons: ['mossy_cellar', 'ember_crypt', 'glimmer_trial', 'gone'],
      bossHp: '123',
      combat: { kills: { mossy_cellar: 7 } },
    }) as { bossHp: unknown; combat: { kills: unknown; floors: unknown } };
    expect(out.bossHp).toBeNull();
    expect(out.combat.kills).toEqual({ mossy_cellar: 7 });
    expect(out.combat.floors).toEqual({
      mossy_cellar: {
        difficulty: 'normal',
        mode: 'farm',
        tiers: { normal: { floor: 10, best: 10 } },
      },
      ember_crypt: {
        difficulty: 'normal',
        mode: 'farm',
        tiers: { normal: { floor: 20, best: 20 } },
      },
    });
    // Junk in, a valid shape out.
    expect((MIGRATIONS[23]!({}) as { combat: unknown }).combat).toEqual({ floors: {} });
  });

  it('has a step at key 24 that sends every dungeon back to floor 1 of Normal (replay Normal first)', () => {
    const out = MIGRATIONS[24]!({
      clearedDungeons: ['mossy_cellar'],
      bossHp: '55',
      combat: {
        kills: { mossy_cellar: 7 },
        floors: {
          mossy_cellar: {
            difficulty: 'hard',
            mode: 'farm',
            tiers: { normal: { floor: 10, best: 10 }, hard: { floor: 3, best: 2 } },
          },
        },
      },
    }) as { bossHp: unknown; clearedDungeons: unknown; combat: Record<string, unknown> };
    expect(out.bossHp).toBeNull();
    // What the clear unlocked stays; the floors are played again.
    expect(out.clearedDungeons).toEqual(['mossy_cellar']);
    expect(out.combat).toEqual({ kills: { mossy_cellar: 7 }, floors: {}, training: {} });
    expect((MIGRATIONS[24]!({}) as { combat: unknown }).combat).toEqual({
      floors: {},
      training: {},
    });
  });

  it('loads a format 23 save made with the 0.5.3 dev tools', () => {
    const text = readFileSync(resolve(__dirname, 'fixtures/saves/v23-dev-tools.save.txt'), 'utf8');
    expect(JSON.parse(text).version).toBe(23);
    expect(CURRENT_SAVE_VERSION).toBe(27);
    const { state } = readSave(text, floorsContent);
    // Both cleared dungeons stay cleared, with what they opened ...
    expect(state.clearedDungeons).toEqual(['mossy_cellar', 'ember_crypt']);
    expect(isDungeonUnlocked(state, floorsContent, 'frostspire_vault')).toBe(true);
    // ... but their floors were never played: every dungeon starts on floor 1 of Normal,
    // challenging, and Hard stays locked until the Normal boss falls (replay Normal first).
    for (const dungeon of [cellar, crypt, floorsContent.dungeonById.get('frostspire_vault')!]) {
      expect(floorPosition(state, dungeon)).toMatchObject({
        difficulty: 'normal',
        autoChallenge: true,
        floor: 1,
        best: 0,
      });
      expect(isDifficultyUnlocked(state, dungeon, 'hard')).toBe(false);
    }
    // Kills stay as stage kills of each Normal last floor; the fight starts fresh; no training yet.
    expect(state.combat.stageKills).toEqual({
      'mossy_cellar:normal:10': 70,
      'ember_crypt:normal:20': 1,
    });
    expect(state.mastery.bossTiers['mossy_cellar']).toBeUndefined();
    expect(state.bossHp).toBeNull();
    expect(state.combat.training).toEqual({});
    expect(state.activeDungeonId).toBe('mossy_cellar');
    expect(bossStatus(state, floorsContent)!.floor).toBe(1);
    // ... and it plays on: down the floors to the boss, which opens Hard.
    const later = advance(state, floorsContent, 600_000, createSeededRng(2));
    expect(floorPosition(later.state, cellar)).toMatchObject({ floor: 10, best: 10 });
    expect(later.state.combat.stageKills['mossy_cellar:normal:10']).toBeGreaterThan(70);
    expect(isDifficultyUnlocked(later.state, cellar, 'hard')).toBe(true);
  });
});

describe('stage keys (DESIGN.md §6 Stage stars, Overflow)', () => {
  it('names a stage by dungeon, difficulty and floor, and reads the name back', () => {
    expect(stageKey('mossy_cellar', 'normal', 10)).toBe('mossy_cellar:normal:10');
    expect(stageKey('void_hollow', 'nightmare', 60)).toBe('void_hollow:nightmare:60');
    for (const difficulty of ['normal', 'hard', 'nightmare', 'endless'] as const) {
      expect(parseStageKey(stageKey('ember_crypt', difficulty, 20))).toEqual({
        dungeonId: 'ember_crypt',
        difficulty,
        floor: 20,
      });
    }
  });

  it('refuses anything that is not a stage key', () => {
    for (const bad of [
      '',
      'mossy_cellar',
      'mossy_cellar:normal',
      'mossy_cellar:easy:10',
      'mossy_cellar:normal:0',
      'mossy_cellar:normal:-3',
      'mossy_cellar:normal:1.5',
      'mossy_cellar:normal:010',
      'mossy_cellar:normal:10:2',
      ':normal:10',
      'mossy_cellar:normal:ten',
    ]) {
      expect(parseStageKey(bad), bad).toBeNull();
    }
  });
});
