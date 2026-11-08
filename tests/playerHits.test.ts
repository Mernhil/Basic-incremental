import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceChunked,
  bossMaxHp,
  burstStats,
  Decimal,
  effectiveDamage,
  emptyCardLoadout,
  hitDamage,
  setActiveDungeon,
  signatureDamage,
  type CombatResult,
  type GameState,
  type PlayerHitEvent,
} from '../src/game';
import { constantRng, content as pinned, freshState, withDps } from './helpers';

/**
 * Our damage lands in chunks (DESIGN.md §6): one hit every burst interval, each worth
 * dps x interval, plus the signature attack on a full gauge. Nothing lands between two hits.
 */
const rng = constantRng(0.99);
const ok = (r: CombatResult): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const content = withDps(1000);
const fighting = burstStats(content, 'fighting');
const boss = content.dungeonById.get('mossy_cellar')!;
/** Bare-handed so no card levels up while the damage is counted. */
const start = (): GameState => {
  const state = ok(setActiveDungeon(freshState(), content, 'mossy_cellar'));
  state.cards.loadouts.fighting = emptyCardLoadout();
  return state;
};
const dpsOf = (state: GameState) => effectiveDamage(state, content, 'mossy_cellar');
const dealt = (state: GameState) => bossMaxHp(boss, 0).sub(state.bossHp!);

describe('chunked damage to bosses (DESIGN.md §6)', () => {
  it('holds damage until the hit lands, then drops the bar by exactly one hit', () => {
    const s = start();
    const half = advance(s, content, 500, rng);
    expect(half.state.bossHp === null || dealt(half.state).eq(0)).toBe(true);
    expect(half.report.playerHits).toEqual([]);
    const second = advance(half.state, content, 500, rng);
    expect(dealt(second.state).eq(hitDamage(dpsOf(s), fighting))).toBe(true);
  });

  it('reports each chunk: hits, damage per hit and the signature flag', () => {
    const s = start();
    const { report } = advance(s, content, 20_000, rng);
    const hit = hitDamage(dpsOf(s), fighting);
    const normal = report.playerHits.filter((e) => !e.signature);
    const signature = report.playerHits.filter((e) => e.signature);
    expect(normal.reduce((n, e) => n + e.hits, 0)).toBe(20);
    expect(normal.every((e) => e.damage.eq(hit) && e.target === 'mossy_cellar')).toBe(true);
    expect(signature.reduce((n, e) => n + e.hits, 0)).toBe(1);
    expect(signature[0]!.damage.eq(signatureDamage(dpsOf(s), fighting))).toBe(true);
    expect(report.bursts.fighting).toBe(1);
  });

  it('every chunk added up equals the damage taken from the boss', () => {
    const s = start();
    const { state, report } = advance(s, content, 45_000, rng);
    const total = report.playerHits.reduce(
      (sum: Decimal, e: PlayerHitEvent) => sum.add(e.damage.mul(e.hits)),
      new Decimal(0),
    );
    expect(total.eq(dealt(state))).toBe(true);
  });

  it('gives the same boss HP for any split of time (tick sizes, carrying the timer)', () => {
    const s = start();
    const whole = advance(s, content, 47_300, rng).state;
    let split = s;
    for (let i = 0; i < 473; i++) split = advance(split, content, 100, rng).state;
    let tiny = s;
    for (let i = 0; i < 2956; i++) tiny = advance(tiny, content, 16, rng).state;
    expect(dealt(split).eq(dealt(whole))).toBe(true);
    // 2956 x 16 ms = 47,296 ms: the same 47 hits and 2 signature attacks, 4 ms still held.
    expect(dealt(tiny).eq(dealt(whole))).toBe(true);
  });

  it('offline (big chunks) equals online (small ticks)', () => {
    const s = start();
    const offline = advanceChunked(s, content, 600_000, rng, 60_000).state;
    let online = s;
    for (let i = 0; i < 6000; i++) online = advance(online, content, 100, rng).state;
    expect(offline.stats.bossKills).toBe(online.stats.bossKills);
    expect(offline.bossHp!.eq(online.bossHp!)).toBe(true);
    expect(offline.bursts.fighting).toEqual(online.bursts.fighting);
  });
});

describe('chunked damage in the Glimmer Trial', () => {
  const trial = content.trialById.get('glimmer_trial')!;
  const openTrial = (): GameState => {
    const state = freshState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    const next = ok(setActiveDungeon(state, content, trial.id));
    next.cards.loadouts.fighting = emptyCardLoadout();
    return next;
  };

  it('holds damage until the hit lands and reports the chunks', () => {
    const s = openTrial();
    const early = advance(s, content, 900, rng);
    expect(early.state.combat.trialAttempt.dealt.eq(0)).toBe(true);
    const later = advance(early.state, content, 100, rng);
    expect(later.state.combat.trialAttempt.dealt.eq(hitDamage(dpsOf(s), fighting))).toBe(true);
    expect(later.report.playerHits[0]!.target).toBe(trial.id);
  });

  it('scores the same for any split of time', () => {
    const s = openTrial();
    const whole = advance(s, content, 20_000, rng).state.combat.trialAttempt.dealt;
    let split = s;
    for (let i = 0; i < 200; i++) split = advance(split, content, 100, rng).state;
    expect(split.combat.trialAttempt.dealt.eq(whole)).toBe(true);
  });
});

void pinned;
