import { describe, expect, it } from 'vitest';
import { combatSchema } from '../src/data/schemas';
import type { Content } from '../src/data';
import rawCombat from '../src/data/content/combat.json';
import {
  advance,
  allGoals,
  averageDps,
  bossAttackDamages,
  bossAttackDps,
  bossAttackMultiplier,
  bossAttackView,
  collectModifiers,
  Decimal,
  emptyReport,
  levelCap,
  loadoutHealth,
  loadoutMaxHealth,
  mergeReports,
  setActiveDungeon,
  stageReadout,
  type CombatResult,
  type GameState,
  type Modifier,
  type TickReport,
} from '../src/game';
import { constantRng, content, freshState } from './helpers';

/**
 * Boss hits in chunks (DESIGN.md §6): discrete attacks at the boss's interval, five light hits at
 * 0.4x and a slam at 4x in every six, derived from play time so any split of time agrees.
 *
 * Mossy Cellar: Root Warden hits for 1 every 10 s, so attacks land at 10 s, 20 s ... of play time
 * (the 6th, 12th ... are slams) and the starting loadout has 100 health.
 */
const rng = constantRng(0.99);
const ok = (r: CombatResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const inCellar = (): GameState => ok(setActiveDungeon(freshState(), content, 'mossy_cellar'));
/** The cellar with the Ember Squire at its level cap, so the time spent fighting does not level it
 *  up (and grow the health pool) while a knockout is timed. */
const inCappedCellar = (): GameState => {
  const state = inCellar();
  state.cards.owned['ember_squire']!.level = levelCap(content, { tier: 'bronze', stars: 1 });
  return state;
};
const mods = (s: GameState) => collectModifiers(s, content);
const pool = (s: GameState) => loadoutMaxHealth(s, content, mods(s), 'mossy_cellar');
const run = (s: GameState, seconds: number, c: Content = content) =>
  advance(s, c, seconds * 1000, rng);
const sum = (r: TickReport, pick: (e: TickReport['bossAttacks'][number]) => number) =>
  r.bossAttacks.reduce((n, e) => n + pick(e), 0);
const damageOf = (r: TickReport) => r.bossAttacks.reduce((n, e) => n + e.damage.toNumber(), 0);
const taken = (s: GameState) => s.combat.loadoutDamage.toNumber();

describe('the attack pattern', () => {
  const pattern = content.combat.bossPattern;

  it('is five light hits at 0.4x and a slam at 4x in every six attacks', () => {
    expect(pattern.attacksPerCycle).toBe(6);
    const multipliers = Array.from({ length: 12 }, (_, i) => bossAttackMultiplier(i + 1, pattern));
    expect(multipliers).toEqual([0.4, 0.4, 0.4, 0.4, 0.4, 4, 0.4, 0.4, 0.4, 0.4, 0.4, 4]);
  });

  it('adds up to six normal attacks, so damage per minute holds', () => {
    const cycle = Array.from({ length: 6 }, (_, i) => bossAttackMultiplier(i + 1, pattern));
    expect(cycle.reduce((a, b) => a + b, 0)).toBeCloseTo(6);
  });

  it('is rejected in the content when a cycle would not add up', () => {
    expect(combatSchema.safeParse({ ...rawCombat }).success).toBe(true);
    const bad = { ...rawCombat, bossPattern: { ...rawCombat.bossPattern, lightMultiplier: 0.5 } };
    expect(combatSchema.safeParse(bad).success).toBe(false);
  });
});

describe('hits land in chunks', () => {
  it('records each attack with its damage and whether it is a slam', () => {
    const { report } = run(inCellar(), 120);
    expect(report.bossAttacks.length).toBe(12);
    expect(report.bossAttacks.map((e) => e.slam)).toEqual(
      Array.from({ length: 12 }, (_, i) => i % 6 === 5),
    );
    expect(report.bossAttacks[0]!.damage.toNumber()).toBeCloseTo(0.4);
    expect(report.bossAttacks[5]!.damage.toNumber()).toBeCloseTo(4);
    expect(report.bossAttacks.every((e) => e.attacks === 1 && e.dungeon === 'mossy_cellar')).toBe(
      true,
    );
  });

  it('takes the health in chunks, not smoothly', () => {
    const start = inCellar();
    expect(taken(run(start, 9.99).state)).toBe(0);
    expect(taken(run(start, 10.01).state)).toBeCloseTo(0.4);
    expect(taken(run(start, 59.99).state)).toBeCloseTo(2);
    expect(taken(run(start, 60.01).state)).toBeCloseTo(6);
  });

  it('keeps the same damage per minute as the dungeon data (any start in the cycle)', () => {
    const dps = bossAttackDps(content.dungeonById.get('mossy_cellar')!, 0, []).toNumber();
    for (const offsetMs of [0, 25_000, 41_000, 59_999]) {
      const start = inCellar();
      start.stats.playTimeMs = offsetMs;
      const { state } = run(start, 600);
      expect(taken(state)).toBeCloseTo(dps * 600, 6);
    }
  });

  it('applies defence to every hit', () => {
    const pattern = content.combat.bossPattern;
    const dungeon = content.dungeonById.get('mossy_cellar')!;
    const defence = [
      {
        stat: 'combat.defence',
        kind: 'flat',
        value: new Decimal(50),
        scale: 'full',
        source: { kind: 'cosmetic', id: 'test' },
      } as Modifier,
    ];
    const open = bossAttackDamages(dungeon, 0, [], pattern);
    const guarded = bossAttackDamages(dungeon, 0, defence, pattern);
    expect(open.normal.toNumber()).toBeCloseTo(1);
    expect(guarded.light.toNumber()).toBeCloseTo(0.2);
    expect(guarded.slam.toNumber()).toBeCloseTo(2);
    expect(bossAttackDamages(dungeon, 3, [], pattern).normal.gt(open.normal)).toBe(true);
  });

  it('does not attack special dungeons', () => {
    const s = freshState();
    s.clearedDungeons.push('mossy_cellar', 'ember_crypt');
    const trial = ok(setActiveDungeon(s, content, 'glimmer_trial'));
    expect(run(trial, 3600).report.bossAttacks).toEqual([]);
  });
});

describe('online equals offline', () => {
  const total = 2530.7;
  const once = run(inCellar(), total);

  function split(lengths: number[]): { state: GameState; report: TickReport } {
    let s = inCellar();
    const report = emptyReport();
    let left = total;
    for (let i = 0; left > 1e-9; i++) {
      const step = Math.min(left, lengths[i % lengths.length]!);
      const r = run(s, step);
      s = r.state;
      mergeReports(report, r.report);
      left -= step;
    }
    return { state: s, report };
  }

  it.each([
    ['25 equal steps', [total / 25]],
    ['7.3 s frames', [7.3]],
    ['uneven steps', [0.37, 4.91, 13.2, 0.05, 29.5]],
  ])('gives one result for %s', (_name, lengths) => {
    const many = split(lengths as number[]);
    expect(many.report.knockouts).toBe(once.report.knockouts);
    expect(many.state.combat.knockoutSeconds).toBeCloseTo(once.state.combat.knockoutSeconds, 3);
    expect(taken(many.state)).toBeCloseTo(taken(once.state), 4);
    expect(sum(many.report, (e) => e.attacks)).toBe(sum(once.report, (e) => e.attacks));
    expect(damageOf(many.report)).toBeCloseTo(damageOf(once.report), 4);
    expect(sum(many.report, (e) => (e.slam ? e.attacks : 0))).toBe(
      sum(once.report, (e) => (e.slam ? e.attacks : 0)),
    );
  });

  it('merges a long offline span into a short event list', () => {
    const long = run(inCellar(), 3 * 3600);
    expect(long.report.bossAttacks.length).toBeLessThanOrEqual(64);
    expect(long.report.knockouts).toBeGreaterThan(5);
    expect(sum(long.report, (e) => e.attacks)).toBeGreaterThan(900);
  });
});

describe('knockout timing', () => {
  it('knocks the loadout out on the hit that empties the pool (a light hit)', () => {
    const start = inCappedCellar();
    start.combat.loadoutDamage = pool(start).sub(0.7); // 0.7 left: the 2nd light hit empties it
    const before = run(start, 19.9);
    expect(before.report.knockouts).toBe(0);
    expect(taken(before.state)).toBeCloseTo(pool(start).toNumber() - 0.3);
    const after = run(start, 20.1);
    expect(after.report.knockouts).toBe(1);
    expect(after.state.bossHp).toBeNull();
    expect(after.state.combat.knockoutSeconds).toBeCloseTo(content.combat.knockoutSeconds - 0.1, 3);
    const hits = after.report.bossAttacks;
    expect(hits.map((e) => e.knockout)).toEqual([false, true]);
    expect(hits[1]!.slam).toBe(false);
  });

  it('knocks the loadout out on a slam when only a slam can finish it', () => {
    const start = inCappedCellar();
    start.combat.loadoutDamage = pool(start).sub(3); // five lights take 2, the slam takes 4
    expect(run(start, 59.9).report.knockouts).toBe(0);
    const after = run(start, 60.1);
    expect(after.report.knockouts).toBe(1);
    const last = after.report.bossAttacks.at(-1)!;
    expect(last.slam).toBe(true);
    expect(last.knockout).toBe(true);
  });

  it('deals no further hits while knocked out, then starts again at full health', () => {
    const start = inCappedCellar();
    start.combat.loadoutDamage = pool(start).sub(0.1);
    const ko = content.combat.knockoutSeconds;
    const out = run(start, 10 + ko / 2);
    expect(out.state.combat.knockoutSeconds).toBeGreaterThan(0);
    // The lethal hit lands at 10 s; the hits at 20 s and 30 s fall in the knockout (it ends at
    // 40 s); the one at 50 s lands on the rebuilt pool.
    expect(ko).toBe(30);
    const back = run(start, 55);
    expect(back.state.combat.knockoutSeconds).toBe(0);
    expect(back.report.knockouts).toBe(1);
    expect(back.report.bossAttacks.length).toBe(2);
    expect(taken(back.state)).toBeCloseTo(0.4);
    expect(loadoutHealth(back.state, content).current.toNumber()).toBeCloseTo(
      pool(start).toNumber() - 0.4,
    );
  });

  it('survives a light hit that leaves a sliver, and falls to the next one', () => {
    const start = inCappedCellar();
    start.combat.loadoutDamage = pool(start).sub(0.5);
    expect(run(start, 10.1).report.knockouts).toBe(0);
    expect(run(start, 20.1).report.knockouts).toBe(1);
  });
});

describe('the wind-up and the "you fall in" readout', () => {
  it('says when the next attack and the next slam land', () => {
    const start = inCellar();
    const v0 = bossAttackView(start, content)!;
    expect(v0.intervalSeconds).toBe(10);
    expect(v0.nextAttackSeconds).toBeCloseTo(10);
    expect(v0.nextIsSlam).toBe(false);
    expect(v0.nextSlamSeconds).toBeCloseTo(60);
    expect(v0.lightDamage.toNumber()).toBeCloseTo(0.4);
    expect(v0.slamDamage.toNumber()).toBeCloseTo(4);

    start.stats.playTimeMs = 55_000;
    const v1 = bossAttackView(start, content)!;
    expect(v1.nextAttackSeconds).toBeCloseTo(5);
    expect(v1.nextIsSlam).toBe(true);
    expect(v1.nextSlamSeconds).toBeCloseTo(5);
    expect(v1.slamProgress).toBeGreaterThan(0.9);

    start.stats.playTimeMs = 61_000;
    const v2 = bossAttackView(start, content)!;
    expect(v2.nextAttackSeconds).toBeCloseTo(9);
    expect(v2.nextIsSlam).toBe(false);
    expect(v2.nextSlamSeconds).toBeCloseTo(59);
    expect(v2.slamProgress).toBeLessThan(0.05);
  });

  it('has no attack view without a boss, or while knocked out', () => {
    const idle = freshState();
    idle.activeDungeonId = null;
    expect(bossAttackView(idle, content)).toBeNull();
    const s = inCellar();
    s.combat.knockoutSeconds = 5;
    expect(bossAttackView(s, content)).toBeNull();
  });

  it('gives the time until the knockout on the real schedule', () => {
    // 16 cycles = 96 damage by attack 96; then 5 lights make 98; the slam (attack 102) empties 100.
    const r = stageReadout(inCellar(), content);
    expect(r.secondsToKnockoutNow).toBeCloseTo(1020);
  });

  it('averages the steady time until the knockout over the cycle (Root Warden: about 1000 s)', () => {
    const r = stageReadout(inCellar(), content);
    expect(r.secondsToKnockout!).toBeGreaterThan(960);
    expect(r.secondsToKnockout!).toBeLessThan(1030);
  });

  /** The Cellar with its boss HP set so the loadout needs `seconds` to kill it. */
  function cellarKilledIn(seconds: number): { state: GameState; content: Content } {
    const state = inCellar();
    const avg = averageDps(state, content, 'mossy_cellar');
    const dungeon = content.dungeonById.get('mossy_cellar')!;
    const patched = { ...dungeon, boss: { ...dungeon.boss, hp: avg.mul(seconds) } };
    const dungeons = content.dungeons.map((d) => (d.id === patched.id ? patched : d));
    return {
      state,
      content: {
        ...content,
        dungeons,
        dungeonById: new Map(dungeons.map((d) => [d.id, d])),
      },
    };
  }

  it('flags that the loadout falls first when the boss takes longer to kill than it survives', () => {
    // The Root Warden case: killing takes 17 min 22 s but 100 health lasts about 16 min 40 s.
    const { state, content: c } = cellarKilledIn(1042.4);
    const r = stageReadout(state, c);
    expect(r.secondsPerKill).toBeCloseTo(1042.4, 1);
    expect(r.fallsFirst).toBe(true);
  });

  it('hands the goal tracker the same wall: no ETA when the loadout falls first', () => {
    const eta = (c: Content, s: GameState) =>
      allGoals(s, c).find((g) => g.id === 'clear_dungeon:mossy_cellar')!.etaSeconds;
    for (const seconds of [1042.4, 995]) {
      const wall = cellarKilledIn(seconds);
      expect(stageReadout(wall.state, wall.content).fallsFirst).toBe(true);
      expect(eta(wall.content, wall.state)).toBeNull();
    }
    const clear = cellarKilledIn(900);
    expect(eta(clear.content, clear.state)).not.toBeNull();
  });

  it('does not flag it when the boss dies first', () => {
    const { state, content: c } = cellarKilledIn(900);
    expect(stageReadout(state, c).fallsFirst).toBe(false);
  });

  it('has no knockout figure without a boss, and none for the special dungeon', () => {
    const none = freshState();
    none.activeDungeonId = null;
    const idle = stageReadout(none, content);
    expect(idle.secondsToKnockout).toBeNull();
    expect(idle.secondsToKnockoutNow).toBeNull();
    expect(idle.fallsFirst).toBe(false);

    const s = freshState();
    s.clearedDungeons.push('mossy_cellar', 'ember_crypt');
    const trial = stageReadout(ok(setActiveDungeon(s, content, 'glimmer_trial')), content);
    expect(trial.secondsToKnockout).toBeNull();
    expect(trial.secondsToKnockoutNow).toBeNull();
    expect(trial.fallsFirst).toBe(false);
  });
});
