import { describe, expect, it } from 'vitest';
import type { RawContent } from '../src/data';
import { bundledRawContent, validateContent } from '../src/data';
import {
  advance,
  advanceChunked,
  advanceGauge,
  approxEq,
  baseDamage,
  bossMaxHp,
  bossStatus,
  burstStats,
  burstView,
  createSaveText,
  damageStat,
  Decimal,
  effectiveDamage,
  effectiveDrops,
  emptyCardLoadout,
  isDungeonUnlocked,
  isProducerUnlocked,
  readSave,
  setActiveDungeon,
  signatureDamage,
  trialRewards,
  trialScore,
  trialStatus,
  unlockedDungeons,
  unlockedTrials,
  type CombatResult,
  type GameState,
  type Modifier,
} from '../src/game';
import resources from '../src/data/content/resources.json';
import trees from '../src/data/content/trees.json';
import mines from '../src/data/content/mines.json';
import production from '../src/data/content/production.json';
import cards from '../src/data/content/cards.json';
import cardRules from '../src/data/content/cardRules.json';
import dungeons from '../src/data/content/dungeons.json';
import trials from '../src/data/content/trials.json';
import combat from '../src/data/content/combat.json';
import cosmetics from '../src/data/content/cosmetics.json';
import portals from '../src/data/content/portals.json';
import rarities from '../src/data/content/rarities.json';
import wearRules from '../src/data/content/wearRules.json';
import sets from '../src/data/content/sets.json';
import progression from '../src/data/content/progression.json';
import enhancements from '../src/data/content/enhancements.json';
import account from '../src/data/content/account.json';
import achievements from '../src/data/content/achievements.json';
import cosmeticRules from '../src/data/content/cosmeticRules.json';
import prestige from '../src/data/content/prestige.json';
import upgrades from '../src/data/content/upgrades.json';
import training from '../src/data/content/training.json';
import coins from '../src/data/content/coins.json';
import weaponSkins from '../src/data/content/weaponSkins.json';
import items from '../src/data/content/items.json';
import { constantRng, bareState, plainContent as content, freshState, withDps } from './helpers';

const rng = constantRng(0.5);
const [mossy, ember, frost] = content.dungeons as [
  (typeof content.dungeons)[0],
  (typeof content.dungeons)[0],
  (typeof content.dungeons)[0],
];
const trial = content.trials[0]!;

const mod = (
  stat: Modifier['stat'],
  kind: Modifier['kind'],
  value: string,
  scope?: Modifier['scope'],
): Modifier => ({
  stat,
  kind,
  value: new Decimal(value),
  scope,
  source: { kind: 'card', id: 'x' },
});

function ok(result: CombatResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}

function cleared(...ids: string[]): GameState {
  const state = freshState();
  state.clearedDungeons = ids;
  return state;
}

describe('damage from the main card (DESIGN.md §5, §6)', () => {
  const common = content.cardRules.baseDamage.common;

  it('is the main card base damage, with no purchase involved', () => {
    const state = freshState();
    expect(baseDamage(state, content).eq(common)).toBe(true);
    expect(effectiveDamage(state, content).eq(common)).toBe(true);
  });

  it('runs every number through the modifier pipeline', () => {
    const state = freshState();
    const double = [mod('combat.damage', 'mult', '2', { dungeon: 'mossy_cellar' })];
    expect(effectiveDamage(state, content, 'mossy_cellar', double).eq(common.mul(2))).toBe(true);
    expect(effectiveDamage(state, content, 'ember_crypt', double).eq(common)).toBe(true);
    expect(damageStat(state, content, 'mossy_cellar', double).applied).toHaveLength(1);
    const more = [mod('combat.damage', 'percent', '50')];
    expect(effectiveDamage(state, content, 'mossy_cellar', more).eq(common.mul(1.5))).toBe(true);
  });

  it('has no damage upgrade lines, price curves or gain stat any more', () => {
    expect('damageUpgrades' in content.combat).toBe(false);
    expect('damageLevels' in freshState().combat).toBe(false);
  });
});

describe('dungeon progression (first kill clears, DESIGN.md §6)', () => {
  it('opens only the first dungeon in a new game', () => {
    const state = freshState();
    expect(unlockedDungeons(state, content).map((d) => d.id)).toEqual(['mossy_cellar']);
    expect(unlockedTrials(state, content)).toEqual([]);
    expect(setActiveDungeon(state, content, ember.id)).toEqual({ ok: false, reason: 'locked' });
    expect(setActiveDungeon(state, content, 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('each clear opens the next dungeon; Dungeon 2 opens the Glimmer Trial', () => {
    expect(isDungeonUnlocked(cleared(mossy.id), content, ember.id)).toBe(true);
    expect(isDungeonUnlocked(cleared(mossy.id), content, frost.id)).toBe(false);
    expect(isDungeonUnlocked(cleared(mossy.id), content, trial.id)).toBe(false);
    const two = cleared(mossy.id, ember.id);
    expect(isDungeonUnlocked(two, content, frost.id)).toBe(true);
    expect(isDungeonUnlocked(two, content, trial.id)).toBe(true);
  });

  it('the first kill clears the dungeon and unlocks the next dungeon and a mine', () => {
    const maxHp = bossMaxHp(mossy);
    const content = withDps(maxHp);
    const start = freshState();
    expect(isProducerUnlocked(start, content, 'mining', 'iron_deeps')).toBe(false);
    const { state, report } = advance(start, content, 1000, rng);
    expect(report.bossKills).toBe(1);
    expect(report.cleared).toEqual([mossy.id]);
    expect(report.unlockedDungeons).toEqual([ember.id]);
    expect(report.unlockedMines).toEqual(['iron_deeps']);
    expect(state.clearedDungeons).toEqual([mossy.id]);
    expect(state.combat.stageKills).toEqual({ 'mossy_cellar:normal:1': 1 });
    expect(isProducerUnlocked(state, content, 'mining', 'iron_deeps')).toBe(true);

    // Farming afterwards counts kills but clears nothing again.
    const again = advance(state, content, 1000, rng);
    expect(again.report.cleared).toEqual([]);
    expect(again.state.combat.stageKills['mossy_cellar:normal:1']).toBe(2);
    expect(again.state.clearedDungeons).toEqual([mossy.id]);
  });

  it('switching dungeons spawns a fresh boss; null stops fighting', () => {
    const state = advance(freshState(), content, 5000, rng).state;
    expect(state.bossHp).not.toBeNull();
    expect(ok(setActiveDungeon(state, content, mossy.id))).toBe(state); // same: unchanged

    state.clearedDungeons = [mossy.id];
    const switched = ok(setActiveDungeon(state, content, ember.id));
    expect(switched.activeDungeonId).toBe(ember.id);
    expect(switched.bossHp).toBeNull();

    const idle = ok(setActiveDungeon(switched, content, null));
    const after = advance(idle, content, 60_000, rng).state;
    expect(after.bossHp).toBeNull();
    expect(after.bursts.fighting).toEqual(idle.bursts.fighting);
  });

  it('reports the boss with its stacked HP bars and pity', () => {
    const state = advance(freshState(), content, 10_000, rng).state;
    const boss = bossStatus(state, content)!;
    expect(boss.dungeon.id).toBe(mossy.id);
    expect(boss.maxHp.eq(mossy.boss.hp)).toBe(true);
    // 10 s of the Ember Squire's base damage.
    expect(boss.hp.eq(mossy.boss.hp.sub(content.cardRules.baseDamage.common.mul(10)))).toBe(true);
    expect(boss.bars.remaining).toBe(mossy.boss.hpBars);
    expect(boss.kills).toBe(0);
    expect(bossStatus(ok(setActiveDungeon(state, content, null)), content)).toBeNull();
  });

  it('has harder bosses deeper in, each with its own bar count', () => {
    expect(ember.boss.hp.gt(mossy.boss.hp)).toBe(true);
    expect(frost.boss.hp.gt(ember.boss.hp)).toBe(true);
    expect(new Set(content.dungeons.map((d) => d.boss.hpBars)).size).toBe(3);
  });
});

describe('drops', () => {
  it('every dungeon drops its own Core', () => {
    expect(content.dungeons.map((d) => d.drops.material.resource)).toEqual([
      'moss_core',
      'cinder_core',
      'frost_core',
      'storm_core',
      'sanctum_core',
      'void_core',
    ]);
  });

  it('pays Money by the kill and both crystals as a wage, and deeper dungeons pay more', () => {
    for (const d of content.dungeons) {
      expect(d.drops.currencies.map((c) => c.resource)).toEqual(['money']);
      expect(d.drops.firstClear.map((p) => p.resource)).toEqual([
        'summon_crystal',
        'glamour_crystal',
      ]);
    }
    const money = content.dungeons.map(
      (d) => (d.drops.currencies[0]!.min + d.drops.currencies[0]!.max) / 2,
    );
    expect(money[1]!).toBeGreaterThan(money[0]!);
    expect(money[2]!).toBeGreaterThan(money[1]!);
    for (const id of ['summon_crystal', 'glamour_crystal']) {
      const wage = content.dungeons.map((d) =>
        d.drops.wages.find((w) => w.resource === id)!.perSecond.toNumber(),
      );
      expect(wage[1]!).toBeGreaterThan(wage[0]!);
      expect(wage[2]!).toBeGreaterThan(wage[1]!);
    }
    // Only the first dungeon pays a Money wage: Money still comes by the kill.
    expect(content.dungeons.map((d) => d.drops.wages.some((w) => w.resource === 'money'))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('pays the crystal wage for every second of fighting, never per kill', () => {
    const dungeon = content.dungeons[0]!;
    const wage = (id: string): number =>
      dungeon.drops.wages.find((w) => w.resource === id)!.perSecond.toNumber();
    const state = bareState();
    state.clearedDungeons = [dungeon.id]; // no first-clear purse
    const before = state.resources['summon_crystal']!.toNumber();
    const { state: after, report } = advance(state, content, 10_000, constantRng(0.5));
    expect(after.resources['summon_crystal']!.toNumber()).toBeCloseTo(
      before + wage('summon_crystal') * 10,
    );
    expect(report.currencies['glamour_crystal']).toBeCloseTo(wage('glamour_crystal') * 10);
    // A kill adds no crystals on top of the wage.
    const kill = bareState();
    kill.clearedDungeons = [dungeon.id];
    kill.bossHp = new Decimal(1e-6);
    const killed = advance(kill, content, 1000, constantRng(0.5));
    expect(killed.report.bossKills).toBe(1);
    expect(killed.report.currencies['summon_crystal']).toBeCloseTo(wage('summon_crystal'));
    // Knocked out: no wage.
    const knocked = bareState();
    knocked.combat.knockoutSeconds = 30;
    const out = advance(knocked, content, 10_000, constantRng(0.5));
    expect(out.report.currencies['summon_crystal'] ?? 0).toBe(0);
  });

  it('pays the first-clear purse once, on the clear', () => {
    const dungeon = content.dungeons[0]!;
    const purse = dungeon.drops.firstClear.find((p) => p.resource === 'summon_crystal')!.amount;
    const wage = dungeon.drops.wages.find((w) => w.resource === 'summon_crystal')!.perSecond;
    const state = bareState();
    state.bossHp = new Decimal(1e-6);
    const first = advance(state, content, 1000, constantRng(0.5));
    expect(first.report.cleared).toContain(dungeon.id);
    expect(first.report.currencies['summon_crystal']).toBeCloseTo(purse.add(wage).toNumber());
    const again = advance(
      { ...first.state, bossHp: new Decimal(1e-6) },
      content,
      1000,
      constantRng(0.5),
    );
    expect(again.report.cleared).toEqual([]);
    expect(again.report.currencies['summon_crystal']).toBeCloseTo(wage.toNumber());
  });

  it('drops Frost Sigils on every Frostspire Vault kill and, rarely, in the Ember Crypt', () => {
    const extras = content.dungeons.map((d) => d.drops.extraMaterials.map((e) => e.resource));
    expect(extras.slice(0, 3)).toEqual([[], ['frost_core', 'frost_sigil'], ['frost_sigil']]);
    // The three later dungeons drop Sigils on every boss kill too.
    expect(extras.slice(3)).toEqual([['frost_sigil'], ['frost_sigil'], ['frost_sigil']]);
    // The Ember Crypt's Frost drops are rare (DESIGN.md §3); the Vault's Sigil comes every kill.
    for (const e of content.dungeonById.get('ember_crypt')!.drops.extraMaterials) {
      expect(e.chance).toBeGreaterThan(0);
      expect(e.chance).toBeLessThan(0.1);
    }
    const crypt = bareState();
    crypt.clearedDungeons = ['mossy_cellar'];
    crypt.activeDungeonId = 'ember_crypt';
    crypt.bossHp = new Decimal(1e-6);
    // a roll under the chance drops both, a roll over it drops none
    const lucky = advance(crypt, content, 1000, constantRng(0)).state;
    expect(lucky.resources['frost_core']!.toNumber()).toBe(1);
    expect(lucky.resources['frost_sigil']!.toNumber()).toBe(1);
    const unlucky = advance(
      { ...crypt, bossHp: new Decimal(1e-6) },
      content,
      1000,
      constantRng(0.999),
    ).state;
    expect(unlucky.resources['frost_core']!.toNumber()).toBe(0);
    expect(unlucky.resources['frost_sigil']!.toNumber()).toBe(0);
    const frost = content.dungeonById.get('frostspire_vault')!;
    const { min, max } = frost.drops.extraMaterials[0]!;
    expect(min).toBeGreaterThan(0);
    const state = bareState();
    state.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    state.activeDungeonId = frost.id;
    state.bossHp = new Decimal(1e-6);
    const { state: after, report } = advance(state, content, 1000, constantRng(0));
    expect(report.bossKills).toBe(1);
    expect(after.resources['frost_sigil']!.toNumber()).toBe(min);
    expect(report.materials['frost_sigil']).toBe(min);
    // The widest roll gives the maximum.
    const top = advance(
      { ...state, bossHp: new Decimal(1e-6) },
      content,
      1000,
      constantRng(0.999),
    ).state;
    expect(top.resources['frost_sigil']!.toNumber()).toBe(max);
  });

  it('pays the Money wage for every second of fighting, even before the first kill', () => {
    const dungeon = content.dungeons[0]!;
    const state = bareState();
    state.resources['money'] = new Decimal(0);
    const { state: after, report } = advance(state, content, 10_000, constantRng(0.5));
    expect(report.bossKills).toBe(0);
    const wage = dungeon.drops.wages.find((w) => w.resource === 'money')!.perSecond.toNumber();
    expect(after.resources['money']!.toNumber()).toBeCloseTo(wage * 10);
    expect(report.currencies['money']).toBeCloseTo(wage * 10);
  });

  it('pays no wage in the later dungeons, only by the kill', () => {
    const state = bareState();
    state.resources['money'] = new Decimal(0);
    state.clearedDungeons = ['mossy_cellar'];
    state.activeDungeonId = 'ember_crypt';
    const { state: after, report } = advance(state, content, 10_000, constantRng(0.5));
    expect(report.bossKills).toBe(0);
    expect(after.resources['money']!.toNumber()).toBe(0);
  });

  it('pays no wage while the loadout is knocked out or in a special dungeon', () => {
    const state = bareState();
    state.resources['money'] = new Decimal(0);
    state.combat.knockoutSeconds = 30;
    const knocked = advance(state, content, 10_000, constantRng(0.5)).state;
    expect(knocked.resources['money']!.toNumber()).toBe(0);
    const trial = bareState();
    trial.resources['money'] = new Decimal(0);
    trial.clearedDungeons = ['ember_crypt'];
    trial.activeDungeonId = 'glimmer_trial';
    const inTrial = advance(trial, content, 10_000, constantRng(0.5)).state;
    expect(inTrial.resources['money']!.toNumber()).toBe(0);
  });

  it('drops a Core when the roll is under its chance', () => {
    const { state, report } = advance(
      freshState(),
      withDps(bossMaxHp(mossy)),
      1000,
      constantRng(0.01),
    );
    expect(state.resources['moss_core']!.eq(1)).toBe(true);
    expect(report.materials).toEqual({ moss_core: 1 });
  });

  it('applies material modifiers and clamps the chance', () => {
    const mods = [
      mod('drops.materialChance', 'mult', '100', { dungeon: mossy.id }),
      mod('drops.materialAmount', 'flat', '2', { resource: 'moss_core' }),
    ];
    const drops = effectiveDrops(mossy, mods, content);
    expect(drops.material.chance).toBe(1);
    expect(drops.material.amount).toBe(mossy.drops.material.amount + 2);
  });
});

describe('burst gauges (DESIGN.md §6)', () => {
  const fighting = burstStats(content, 'fighting');

  it('uses the data numbers: 20 hits, 10x a hit; harvest 30 ticks, 10 s', () => {
    expect(fighting).toMatchObject({ interval: 1, size: 20, fill: 1 });
    expect(fighting.power.eq(10)).toBe(true);
    const logging = burstStats(content, 'logging');
    expect(logging).toMatchObject({ interval: 1, size: 30, fill: 1 });
    expect(logging.power.eq(10)).toBe(true);
  });

  it('counts hits and bursts, carrying leftovers', () => {
    const run = advanceGauge({ gauge: 0, timer: 0 }, 45.5, fighting);
    expect(run.hits).toBe(45);
    expect(run.bursts).toBe(2);
    expect(run.gauge.gauge).toBe(5);
    expect(run.gauge.timer).toBeCloseTo(0.5);
  });

  it('gives the same result in many small steps as in one', () => {
    let gauge = { gauge: 0, timer: 0 };
    let hits = 0;
    let bursts = 0;
    for (let i = 0; i < 2000; i++) {
      const run = advanceGauge(gauge, 0.016, fighting);
      gauge = run.gauge;
      hits += run.hits;
      bursts += run.bursts;
    }
    const whole = advanceGauge({ gauge: 0, timer: 0 }, 32, fighting);
    expect(hits).toBe(whole.hits);
    expect(bursts).toBe(whole.bursts);
  });

  it('supports fill the gauge faster', () => {
    const faster = burstStats(content, 'fighting', [
      mod('burst.fill', 'percent', '100', { job: 'fighting' }),
    ]);
    expect(advanceGauge({ gauge: 0, timer: 0 }, 10, faster).bursts).toBe(1);
    expect(advanceGauge({ gauge: 0, timer: 0 }, 10, fighting).bursts).toBe(0);
  });

  it('the signature attack deals 10x a hit on top of the normal damage', () => {
    // Bare-handed, so no card levels up during the 20 s and the damage stays the same.
    const start = bareState();
    const { state, report } = advance(start, content, 20_000, rng);
    expect(report.bursts.fighting).toBe(1);
    const dps = content.combat.unarmedDamage;
    const dealt = dps.mul(20).add(signatureDamage(dps, fighting));
    expect(state.bossHp!.eq(mossy.boss.hp.sub(dealt))).toBe(true);
    expect(burstView(state, content, 'fighting').fraction).toBe(0);
    const later = advance(state, content, 5000, rng).state;
    expect(burstView(later, content, 'fighting').fraction).toBeCloseTo(5 / 20);
  });
});

describe('The Glimmer Trial (timed attempts, DESIGN.md §6)', () => {
  /** What the data pays for a score: every tier at or below it, summed per resource. */
  const pays = (score: number, id: string): number =>
    trial.tiers
      .filter((t) => t.score <= score + 1e-9)
      .flatMap((t) => t.rewards)
      .filter((r) => r.resource === id)
      .reduce((sum, r) => sum + r.amount.toNumber(), 0);
  // Bare-handed, so no card levels up mid-attempt and the damage stays exactly what a test sets.
  const open = (): GameState => {
    const state = ok(setActiveDungeon(cleared(mossy.id, ember.id), content, trial.id));
    state.cards.loadouts.fighting = emptyCardLoadout();
    return state;
  };

  it('scores the share of the fixed target HP, past 1 for the extra levels', () => {
    expect(trialScore(trial, new Decimal(0))).toBe(0);
    expect(trialScore(trial, trial.target.hp.div(2))).toBeCloseTo(0.5);
    expect(trialScore(trial, trial.target.hp.mul(3))).toBeCloseTo(3);
  });

  it('pays every tier reached; Facet Shards only from 75%', () => {
    const amount = (score: number, id: string) =>
      trialRewards(trial, score)
        .find((r) => r.resource === id)
        ?.amount.toNumber() ?? 0;
    expect(trialRewards(trial, 0.2)).toEqual([]);
    expect(amount(0.25, 'glimmer_dust')).toBe(pays(0.25, 'glimmer_dust'));
    expect(amount(0.6, 'glimmer_dust')).toBe(pays(0.5, 'glimmer_dust'));
    expect(amount(0.6, 'facet_shard')).toBe(0);
    expect(amount(0.75, 'facet_shard')).toBe(pays(0.75, 'facet_shard'));
    expect(amount(0.75, 'facet_shard')).toBeGreaterThan(0);
    expect(amount(1, 'glimmer_dust')).toBe(pays(1, 'glimmer_dust'));
    expect(amount(1, 'facet_shard')).toBe(pays(1, 'facet_shard'));
    const doubled = trialRewards(trial, 1, [mod('trial.reward', 'mult', '2')]);
    expect(
      doubled.find((r) => r.resource === 'facet_shard')!.amount.eq(2 * pays(1, 'facet_shard')),
    ).toBe(true);
  });

  it('runs a 30 s attempt, pays by score and starts the next one', () => {
    // Half the target over an attempt, counting signature attacks: 30 hits + 1 burst of 10 = 40.
    const dps = trial.target.hp.div(2).div(40);
    const content = withDps(dps);
    const start = open();
    const mid = advance(start, content, 10_000, rng).state;
    const status = trialStatus(mid, content)!;
    expect(status.elapsedSeconds).toBeCloseTo(10);
    expect(status.durationSeconds).toBe(30);
    expect(status.score).toBeGreaterThan(0);
    expect(status.best).toBe(0);

    const { state, report } = advance(mid, content, 20_000, rng);
    expect(report.trialAttempts).toBe(1);
    expect(report.trialTopScore).toBeCloseTo(0.5);
    expect(report.materials).toEqual({ glimmer_dust: pays(0.5, 'glimmer_dust') });
    expect(state.resources['glimmer_dust']!.eq(pays(0.5, 'glimmer_dust'))).toBe(true);
    expect(state.combat.trialBest[trial.id]).toBeCloseTo(0.5);
    expect(state.combat.trialAttempt.elapsedSeconds).toBeCloseTo(0);
    expect(state.clearedDungeons).not.toContain(trial.id);
    expect(bossStatus(state, content)).toBeNull();
  });

  it('a full score clears the trial, and a score past it pays the extra levels', () => {
    const content = withDps(trial.target.hp.div(25));
    const start = open();
    const { state, report } = advance(start, content, 30_000, rng);
    expect(report.cleared).toEqual([trial.id]);
    expect(state.clearedDungeons).toContain(trial.id);
    expect(trialStatus(state, content)!.cleared).toBe(true);
    const score = state.combat.trialBest[trial.id]!;
    expect(score).toBeGreaterThanOrEqual(1);
    expect(state.resources['facet_shard']!.eq(pays(score, 'facet_shard'))).toBe(true);
    expect(pays(5, 'glimmer_dust')).toBeGreaterThan(pays(1, 'glimmer_dust'));
  });

  it('has score levels above 100%', () => {
    expect(trial.tiers.filter((t) => t.score > 1).length).toBeGreaterThanOrEqual(3);
    const rich = trialRewards(trial, 5).find((r) => r.resource === 'glimmer_dust')!.amount;
    const clear = trialRewards(trial, 1).find((r) => r.resource === 'glimmer_dust')!.amount;
    expect(rich.gt(clear)).toBe(true);
  });

  it('long spans resolve many attempts the same as small steps', () => {
    const content = withDps(trial.target.hp.div(30));
    const start = open();
    const whole = advance(start, content, 300_000, rng);
    const steps = advanceChunked(start, content, 300_000, rng, 1000);
    expect(whole.report.trialAttempts).toBe(10);
    expect(steps.report.trialAttempts).toBe(10);
    expect(
      approxEq(whole.state.resources['glimmer_dust']!, steps.state.resources['glimmer_dust']!),
    ).toBe(true);
  });

  it('is never fought while locked', () => {
    const state = freshState();
    state.activeDungeonId = trial.id;
    const after = advance(state, content, 60_000, rng);
    expect(after.report.trialAttempts).toBe(0);
  });
});

describe('save format v4: combat', () => {
  const NOW = 1_700_000_000_000;

  it('round-trips kills, the trial attempt and burst gauges', () => {
    let state = ok(setActiveDungeon(cleared(mossy.id, ember.id), content, trial.id));
    state = advance(state, withDps(1234), 12_345, rng).state;
    state.combat.stageKills = { 'mossy_cellar:normal:1': 4 };
    const loaded = readSave(createSaveText(state, NOW), content).state;
    expect(loaded.combat).toEqual(state.combat);
    expect(loaded.bursts).toEqual(state.bursts);
    expect(loaded.activeDungeonId).toBe(trial.id);
  });

  it('falls back to the first dungeon when the saved one is locked', () => {
    const json = JSON.parse(createSaveText(freshState(), NOW));
    json.state.activeDungeonId = 'frostspire_vault';
    expect(readSave(JSON.stringify(json), content).state.activeDungeonId).toBe(mossy.id);
  });

  it('migrates a v3 save: earlier kills clear the Mossy Cellar', () => {
    const v3 = JSON.parse(createSaveText(freshState(), NOW));
    v3.version = 3;
    delete v3.state.combat;
    delete v3.state.bursts;
    v3.state.damage = '1';
    v3.state.bossHp = '40';
    v3.state.stats.bossKills = 5;
    const { state } = readSave(JSON.stringify(v3), content);
    expect(state.combat.stageKills).toEqual({ 'mossy_cellar:normal:10': 5 });
    expect(state.clearedDungeons).toEqual(['mossy_cellar']);
    expect(state.bossHp).toBeNull();
    expect(state.bursts.fighting).toEqual({ gauge: 0, timer: 0 });
    expect(isProducerUnlocked(state, content, 'mining', 'iron_deeps')).toBe(true);

    v3.state.stats.bossKills = 0;
    const fresh = readSave(JSON.stringify(v3), content).state;
    expect(fresh.clearedDungeons).toEqual([]);
    expect(fresh.combat.stageKills).toEqual({});
  });
});

describe('combat data is validated', () => {
  const raw = (): RawContent =>
    structuredClone({
      ...bundledRawContent(),
      resources,
      trees,
      mines,
      production,
      cards,
      cardRules,
      dungeons,
      trials,
      combat,
      cosmetics,
      portals,
      rarities,
      wearRules,
      sets,
      progression,
      enhancements,
      account,
      achievements,
      cosmeticRules,
      prestige,
      upgrades,
      training,
      coins,
      weaponSkins,
      items,
    });
  const issues = (input: RawContent): string[] => {
    try {
      validateContent(input);
      return [];
    } catch (error) {
      return (error as { issues: string[] }).issues;
    }
  };

  it('accepts the bundled data', () => {
    expect(issues(raw())).toEqual([]);
  });

  it('catches unlock chains that point forward or nowhere', () => {
    const bad = raw();
    const list = bad.dungeons as { unlockedBy: string | null }[];
    list[0]!.unlockedBy = 'ember_crypt';
    (bad.trials as { unlockedBy: string }[])[0]!.unlockedBy = 'nowhere';
    const found = issues(bad);
    expect(found).toContain(
      'dungeons.json › [0] › unlockedBy: "ember_crypt" is not a dungeon listed before it',
    );
    expect(found).toContain('trials.json › [0] › unlockedBy: unknown dungeon "nowhere"');
  });

  it('catches wrong resource kinds for Cores and trial rewards', () => {
    const bad = raw();
    (bad.dungeons as { drops: { material: { resource: string } } }[])[0]!.drops.material.resource =
      'summon_crystal';
    const t = (bad.trials as { tiers: { rewards: { resource: string }[] }[] }[])[0]!;
    t.tiers[0]!.rewards[0]!.resource = 'oak_gem';
    const found = issues(bad).join('\n');
    expect(found).toContain(
      'drops › material › resource: "summon_crystal" is crystal, expected material',
    );
    expect(found).toContain('rewards › [0] › resource: "oak_gem" is tree_gem, expected material');
  });

  it('requires trial tiers in increasing score order', () => {
    const bad = raw();
    const t = (bad.trials as { tiers: { score: number }[] }[])[0]!;
    t.tiers[0]!.score = 0.9;
    expect(issues(bad).join('\n')).toContain('tiers must be in increasing score order');
  });

  it('lets modifier scopes name the special dungeon', () => {
    const good = raw();
    (good.sets as { modifiers: unknown[] }[])[0]!.modifiers = [
      { stat: 'trial.reward', kind: 'percent', value: '5', scope: { dungeon: 'glimmer_trial' } },
    ];
    expect(issues(good)).toEqual([]);
  });
});
