import { describe, expect, it } from 'vitest';
import type { RawContent } from '../src/data';
import { validateContent } from '../src/data';
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
  buyDamageUpgrade,
  clearDungeon,
  isDamageLineUnlocked,
  createSaveText,
  damageStat,
  damageUpgradeCost,
  Decimal,
  effectiveDamage,
  effectiveDrops,
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
import { constantRng, bareState, plainContent as content, freshState } from './helpers';

const rng = constantRng(0.5);
const [mossy, ember, frost] = content.dungeons as [
  (typeof content.dungeons)[0],
  (typeof content.dungeons)[0],
  (typeof content.dungeons)[0],
];
const trial = content.trials[0]!;
const copper = content.combat.damageUpgrades.find((u) => u.gem === 'copper_gem')!;

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

/** A fresh state dealing `dps` damage per second (through Copper Edge levels). */
function withDps(dps: Decimal | number, state = freshState()): GameState {
  const levels = new Decimal(dps)
    .sub(content.combat.startingDamage)
    .div(copper.damagePerLevel)
    .toNumber();
  state.combat.damageLevels = { [copper.id]: levels };
  return state;
}

function cleared(...ids: string[]): GameState {
  const state = freshState();
  state.clearedDungeons = ids;
  return state;
}

describe('damage purchases (one line per ore, DESIGN.md 11.8)', () => {
  it('has one upgrade line per ore, higher ores adding more', () => {
    const ores = content.resources.filter((r) => r.kind === 'mine_gem').map((r) => r.id);
    const lines = content.combat.damageUpgrades;
    expect(lines.map((u) => u.gem).sort()).toEqual([...ores].sort());
    // Damage is bought with Money, whichever gem the line is forged from.
    expect(lines.every((u) => u.cost.resource === 'money')).toBe(true);
    const byTier = [...lines].sort(
      (a, b) => content.resourceById.get(a.gem)!.tier - content.resourceById.get(b.gem)!.tier,
    );
    for (let i = 1; i < byTier.length; i++) {
      expect(byTier[i]!.damagePerLevel.gt(byTier[i - 1]!.damagePerLevel)).toBe(true);
    }
  });

  it('starts at the starting damage and adds each level', () => {
    const state = freshState();
    expect(baseDamage(state, content).eq(content.combat.startingDamage)).toBe(true);
    state.combat.damageLevels = { [copper.id]: 3 };
    const expected = content.combat.startingDamage.add(copper.damagePerLevel.mul(3));
    expect(baseDamage(state, content).eq(expected)).toBe(true);
  });

  it('buys a level with Money on an exponential curve', () => {
    const first = damageUpgradeCost(freshState(), content, copper.id)!;
    expect(first.resource).toBe('money');
    expect(first.amount.eq(copper.cost.base.ceil())).toBe(true);

    const rich = freshState();
    rich.resources['money'] = new Decimal(1000);
    const after = ok(buyDamageUpgrade(rich, content, copper.id));
    expect(after.combat.damageLevels[copper.id]).toBe(1);
    expect(after.resources['money']!.eq(new Decimal(1000).sub(first.amount))).toBe(true);
    const second = damageUpgradeCost(after, content, copper.id)!;
    expect(second.amount.eq(copper.cost.base.mul(copper.cost.growth).ceil())).toBe(true);
    expect(rich.combat.damageLevels[copper.id]).toBeUndefined(); // input untouched
  });

  it('unlocks the Iron and Crystal Edge with their mines, and refuses them before', () => {
    const state = freshState();
    state.resources['money'] = new Decimal(1e12);
    const iron = content.combat.damageUpgrades.find((u) => u.gem === 'iron_gem')!;
    const crystal = content.combat.damageUpgrades.find((u) => u.gem === 'grotto_gem')!;
    expect(isDamageLineUnlocked(state, content, copper)).toBe(true);
    expect(isDamageLineUnlocked(state, content, iron)).toBe(false);
    expect(buyDamageUpgrade(state, content, iron.id)).toEqual({ ok: false, reason: 'locked' });
    const cleared1 = clearDungeon(state, content, 'mossy_cellar').state;
    expect(isDamageLineUnlocked(cleared1, content, iron)).toBe(true);
    expect(isDamageLineUnlocked(cleared1, content, crystal)).toBe(false);
    expect(buyDamageUpgrade(cleared1, content, iron.id).ok).toBe(true);
    const cleared2 = clearDungeon(cleared1, content, 'ember_crypt').state;
    expect(buyDamageUpgrade(cleared2, content, crystal.id).ok).toBe(true);
  });

  it('refuses unknown lines and unaffordable levels', () => {
    expect(buyDamageUpgrade(freshState(), content, 'nope')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    const broke = freshState();
    broke.resources['money'] = new Decimal(0);
    expect(buyDamageUpgrade(broke, content, copper.id)).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
  });

  it('runs every number through the modifier pipeline', () => {
    const state = freshState();
    state.combat.damageLevels = { [copper.id]: 10 };
    const gain = [mod('combat.upgradeGain', 'mult', '2', { resource: 'copper_gem' })];
    expect(baseDamage(state, content, gain).eq(content.combat.startingDamage.add(20))).toBe(true);

    const double = [mod('combat.damage', 'mult', '2', { dungeon: 'mossy_cellar' })];
    expect(effectiveDamage(state, content, 'mossy_cellar', double).eq(22)).toBe(true);
    expect(effectiveDamage(state, content, 'ember_crypt', double).eq(11)).toBe(true);
    expect(damageStat(state, content, 'mossy_cellar', double).applied).toHaveLength(1);

    const cheaper = [mod('cost.multiplier', 'mult', '0.5', { job: 'fighting' })];
    const price = damageUpgradeCost(freshState(), content, copper.id, cheaper)!;
    expect(price.amount.eq(copper.cost.base.mul(0.5).ceil())).toBe(true);
  });
});

describe('dungeon progression (first kill clears, DESIGN.md 11.8)', () => {
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
    const maxHp = bossMaxHp(mossy, 0);
    const start = withDps(maxHp);
    expect(isProducerUnlocked(start, content, 'mining', 'iron_deeps')).toBe(false);
    const { state, report } = advance(start, content, 1000, rng);
    expect(report.bossKills).toBe(1);
    expect(report.cleared).toEqual([mossy.id]);
    expect(report.unlockedDungeons).toEqual([ember.id]);
    expect(report.unlockedMines).toEqual(['iron_deeps']);
    expect(state.clearedDungeons).toEqual([mossy.id]);
    expect(state.combat.kills).toEqual({ [mossy.id]: 1 });
    expect(isProducerUnlocked(state, content, 'mining', 'iron_deeps')).toBe(true);

    // Farming afterwards counts kills but clears nothing again.
    const again = advance(state, content, 1000, rng);
    expect(again.report.cleared).toEqual([]);
    expect(again.state.combat.kills[mossy.id]).toBe(2);
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
    expect(boss.hp.eq(mossy.boss.hp.sub(10))).toBe(true);
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
  it('each dungeon drops its own Core', () => {
    expect(content.dungeons.map((d) => d.drops.material.resource)).toEqual([
      'moss_core',
      'cinder_core',
      'frost_core',
    ]);
  });

  it('every dungeon drops Money and both crystals, and deeper ones drop more', () => {
    const ids = ['money', 'summon_crystal', 'glamour_crystal'];
    for (const d of content.dungeons) {
      expect(d.drops.currencies.map((c) => c.resource)).toEqual(ids);
    }
    for (const id of ids) {
      const average = content.dungeons.map((d) => {
        const c = d.drops.currencies.find((x) => x.resource === id)!;
        return (c.min + c.max) / 2;
      });
      expect(average[1]!).toBeGreaterThan(average[0]!);
      expect(average[2]!).toBeGreaterThan(average[1]!);
    }
    // Only the first dungeon pays a wage: a wall cannot be farmed idle.
    expect(content.dungeons.map((d) => d.drops.wage !== undefined)).toEqual([true, false, false]);
  });

  it('only the Frostspire Vault drops Frost Sigils, a material used for Prismatic card upgrades', () => {
    const extras = content.dungeons.map((d) => d.drops.extraMaterials.map((e) => e.resource));
    expect(extras).toEqual([[], [], ['frost_sigil']]);
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
    expect(after.resources['money']!.toNumber()).toBeCloseTo(
      dungeon.drops.wage!.perSecond.toNumber() * 10,
    );
    expect(report.currencies['money']).toBeCloseTo(dungeon.drops.wage!.perSecond.toNumber() * 10);
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
      withDps(bossMaxHp(mossy, 0)),
      content,
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

describe('burst gauges (DESIGN.md 11.3, 11.8)', () => {
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
    const start = freshState();
    const { state, report } = advance(start, content, 20_000, rng);
    expect(report.bursts.fighting).toBe(1);
    const dealt = new Decimal(20).add(signatureDamage(new Decimal(1), fighting));
    expect(state.bossHp!.eq(mossy.boss.hp.sub(dealt))).toBe(true);
    expect(burstView(state, content, 'fighting').fraction).toBe(0);
    const later = advance(state, content, 5000, rng).state;
    expect(burstView(later, content, 'fighting').fraction).toBeCloseTo(5 / 20);
  });

  it('a harvest burst adds 10 s of each job’s output', () => {
    const { state, report } = advance(bareState(), content, 30_000, rng);
    expect(report.bursts).toMatchObject({ logging: 1, mining: 1 });
    expect(state.resources['oak_gem']!.eq(30 + 10)).toBe(true); // Oak: 1/s
    expect(state.resources['copper_gem']!.eq(15 + 5)).toBe(true); // Copper Quarry: 0.5/s
  });
});

describe('The Glimmer Trial (timed attempts, DESIGN.md 11.8)', () => {
  /** What the data pays for a score: every tier at or below it, summed per resource. */
  const pays = (score: number, id: string): number =>
    trial.tiers
      .filter((t) => t.score <= score + 1e-9)
      .flatMap((t) => t.rewards)
      .filter((r) => r.resource === id)
      .reduce((sum, r) => sum + r.amount.toNumber(), 0);
  const open = (): GameState =>
    ok(setActiveDungeon(cleared(mossy.id, ember.id), content, trial.id));

  it('scores the share of the fixed target HP, capped at 1', () => {
    expect(trialScore(trial, new Decimal(0))).toBe(0);
    expect(trialScore(trial, trial.target.hp.div(2))).toBeCloseTo(0.5);
    expect(trialScore(trial, trial.target.hp.mul(3))).toBe(1);
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
    const start = withDps(dps, open());
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

  it('a full score clears the trial', () => {
    const start = withDps(trial.target.hp, open());
    const { state, report } = advance(start, content, 30_000, rng);
    expect(report.cleared).toEqual([trial.id]);
    expect(state.clearedDungeons).toContain(trial.id);
    expect(trialStatus(state, content)!.cleared).toBe(true);
    expect(state.resources['facet_shard']!.eq(pays(1, 'facet_shard'))).toBe(true);
  });

  it('long spans resolve many attempts the same as small steps', () => {
    const start = withDps(trial.target.hp.div(30), open());
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

  it('round-trips damage levels, kills, the trial attempt and burst gauges', () => {
    let state = ok(setActiveDungeon(cleared(mossy.id, ember.id), content, trial.id));
    state = withDps(1234, state);
    state = advance(state, content, 12_345, rng).state;
    state.combat.kills = { mossy_cellar: 4 };
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

  it('migrates a v3 save: damage becomes upgrade levels, earlier kills clear the Mossy Cellar', () => {
    const v3 = JSON.parse(createSaveText(freshState(), NOW));
    v3.version = 3;
    delete v3.state.combat;
    delete v3.state.bursts;
    v3.state.damage = '1';
    v3.state.bossHp = '40';
    v3.state.stats.bossKills = 5;
    const { state } = readSave(JSON.stringify(v3), content);
    expect(state.combat.damageLevels).toEqual({});
    expect(state.combat.kills).toEqual({ mossy_cellar: 5 });
    expect(state.clearedDungeons).toEqual(['mossy_cellar']);
    expect(state.bossHp).toBeNull();
    expect(state.bursts.fighting).toEqual({ gauge: 0, timer: 0 });
    expect(isProducerUnlocked(state, content, 'mining', 'iron_deeps')).toBe(true);

    v3.state.stats.bossKills = 0;
    const fresh = readSave(JSON.stringify(v3), content).state;
    expect(fresh.clearedDungeons).toEqual([]);
    expect(fresh.combat.kills).toEqual({});
  });
});

describe('combat data is validated', () => {
  const raw = (): RawContent =>
    structuredClone({
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

  it('catches wrong resource kinds for Cores, trial rewards and damage costs', () => {
    const bad = raw();
    (bad.dungeons as { drops: { material: { resource: string } } }[])[0]!.drops.material.resource =
      'summon_crystal';
    const t = (bad.trials as { tiers: { rewards: { resource: string }[] }[] }[])[0]!;
    t.tiers[0]!.rewards[0]!.resource = 'oak_gem';
    const c = bad.combat as { damageUpgrades: { cost: { resource: string } }[] };
    c.damageUpgrades[0]!.cost.resource = 'oak_gem';
    const found = issues(bad).join('\n');
    expect(found).toContain(
      'drops › material › resource: "summon_crystal" is crystal, expected material',
    );
    expect(found).toContain('rewards › [0] › resource: "oak_gem" is tree_gem, expected material');
    expect(found).toContain(
      'damageUpgrades › [0] › cost › resource: "oak_gem" is tree_gem, expected currency',
    );
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
