import type { BurstJob, Content, DamageUpgrade, Dungeon, ProductionJob, Trial } from '../data';
import {
  cardDropChance,
  cardHealth,
  fightingXpPerKill,
  grantCardDrop,
  grantLoadoutXp,
  rollCardDrop,
} from './cards';
import { rollBossDrop, rollMaterialDrop, type DropTable } from './drops';
import { hpBarState, type HpBarState } from './hpBars';
import { milestoneInfo, milestoneMultiplier, type MilestoneInfo } from './milestones';
import {
  collectModifiers,
  computeStat,
  statValue,
  type Modifier,
  type StatContext,
  type StatResult,
} from './modifiers';
import { Decimal } from './num';
import {
  canAfford,
  clearDungeon,
  curvePrice,
  jobProductionPerSecond,
  PRODUCTION_JOBS,
  type Price,
} from './production';
import type { TickReport } from './report';
import type { Rng } from './rng';
import { cloneState, type BurstGauge, type GameState } from './state';

/**
 * Combat (DESIGN.md 4, 11.3, 11.8): bosses are HP walls auto-fought in parallel with production,
 * respawning for farming. Damage is bought with ore (one upgrade line per ore) and kept through
 * prestige. The first kill clears a dungeon, which unlocks the next dungeon and a mine type.
 * The Glimmer Trial is a special dungeon fought in timed attempts for a score.
 * Burst gauges fill with each hit (fighting) or tick (logging, mining) and fire automatically.
 *
 * Every function is pure: state changes return a new state. Every number goes through the
 * modifier pipeline; functions that need modifiers take them as an optional last argument.
 */

/** Safety valve: never resolve more boss kills than this in one advance() call. */
export const MAX_KILLS_PER_ADVANCE = 100_000;
/** Safety valve: never resolve more special-dungeon attempts than this in one advance() call. */
export const MAX_TRIAL_ATTEMPTS_PER_ADVANCE = 10_000;

export type CombatFailure =
  /** No dungeon / special dungeon / damage upgrade with that id. */
  | 'unknown'
  /** The dungeon is not unlocked yet. */
  | 'locked'
  /** Not enough resources. */
  | 'unaffordable'
  /** A bulk buy count that is not a whole number from 1 to MAX_BULK_LEVELS. */
  | 'invalid-count';

export type CombatResult = { ok: true; state: GameState } | { ok: false; reason: CombatFailure };

const fail = (reason: CombatFailure): CombatResult => ({ ok: false, reason });
const FIGHTING = { job: 'fighting' } as const;
/** Absorbs floating-point drift when time is split into many small steps. */
const EPSILON = 1e-9;

// ---- damage ----------------------------------------------------------------------------------

export function damageLevel(state: GameState, upgradeId: string): number {
  return state.combat.damageLevels[upgradeId] ?? 0;
}

/** Damage per second one level of this line adds, through `combat.upgradeGain`. */
export function damageUpgradeGain(
  upgrade: DamageUpgrade,
  modifiers: readonly Modifier[] = [],
): Decimal {
  const ctx = { ...FIGHTING, resource: upgrade.cost.resource };
  return Decimal.max(statValue('combat.upgradeGain', upgrade.damagePerLevel, modifiers, ctx), 0);
}

/** Damage per second one line adds at its level, milestones included (DESIGN.md 11.12). */
export function damageLineDps(
  upgrade: DamageUpgrade,
  level: number,
  modifiers: readonly Modifier[] = [],
): Decimal {
  if (level <= 0) return new Decimal(0);
  return damageUpgradeGain(upgrade, modifiers)
    .mul(level)
    .mul(milestoneMultiplier(upgrade.milestones, level));
}

/** A damage line's milestones at its level ("Lv 25: x2"), or null for an unknown line. */
export function damageLineMilestone(
  state: GameState,
  content: Content,
  upgradeId: string,
): MilestoneInfo | null {
  const upgrade = content.combat.damageUpgrades.find((u) => u.id === upgradeId);
  return upgrade ? milestoneInfo(upgrade.milestones, damageLevel(state, upgradeId)) : null;
}

/** Damage per second before `combat.damage` modifiers: start + every upgrade level bought. */
export function baseDamage(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Decimal {
  let total = content.combat.startingDamage;
  for (const upgrade of content.combat.damageUpgrades) {
    total = total.add(damageLineDps(upgrade, damageLevel(state, upgrade.id), modifiers));
  }
  return total;
}

/** `combat.damage` with its breakdown (for tooltips), against a dungeon or special dungeon. */
export function damageStat(
  state: GameState,
  content: Content,
  dungeonId: string | null = state.activeDungeonId,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): StatResult {
  const ctx: StatContext = dungeonId ? { ...FIGHTING, dungeon: dungeonId } : FIGHTING;
  return computeStat('combat.damage', baseDamage(state, content, modifiers), modifiers, ctx);
}

/** Damage per second after modifiers. Never negative. */
export function effectiveDamage(
  state: GameState,
  content: Content,
  dungeonId: string | null = state.activeDungeonId,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Decimal {
  return Decimal.max(damageStat(state, content, dungeonId, modifiers).value, 0);
}

/** Price of the next level of a damage upgrade line, in its ore. */
export function damageUpgradeCost(
  state: GameState,
  content: Content,
  upgradeId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Price | null {
  const upgrade = content.combat.damageUpgrades.find((u) => u.id === upgradeId);
  if (!upgrade) return null;
  return curvePrice(upgrade.cost, damageLevel(state, upgradeId), modifiers, FIGHTING);
}

/** Buys one level of a damage upgrade line. Kept through prestige. */
export function buyDamageUpgrade(
  state: GameState,
  content: Content,
  upgradeId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): CombatResult {
  const price = damageUpgradeCost(state, content, upgradeId, modifiers);
  if (!price) return fail('unknown');
  if (!canAfford(state, [price])) return fail('unaffordable');
  const next = cloneState(state);
  next.resources[price.resource] = next.resources[price.resource]!.sub(price.amount);
  next.combat.damageLevels[upgradeId] = damageLevel(state, upgradeId) + 1;
  return { ok: true, state: next };
}

// ---- dungeons --------------------------------------------------------------------------------

export function isDungeonCleared(state: GameState, id: string): boolean {
  return state.clearedDungeons.includes(id);
}

/** Dungeons and special dungeons open from the start or once the dungeon before them is cleared. */
export function isDungeonUnlocked(state: GameState, content: Content, id: string): boolean {
  const entry = content.dungeonById.get(id) ?? content.trialById.get(id);
  if (!entry) return false;
  return entry.unlockedBy === null || isDungeonCleared(state, entry.unlockedBy);
}

export function unlockedDungeons(state: GameState, content: Content): Dungeon[] {
  return content.dungeons.filter((d) => isDungeonUnlocked(state, content, d.id));
}

export function unlockedTrials(state: GameState, content: Content): Trial[] {
  return content.trials.filter((t) => isDungeonUnlocked(state, content, t.id));
}

/** Boss kills in this dungeon, ever. */
export function dungeonKills(state: GameState, dungeonId: string): number {
  return state.combat.kills[dungeonId] ?? 0;
}

/**
 * Chooses what is auto-fought: a dungeon, a special dungeon, or nothing (null). Switching
 * spawns a fresh boss and starts a new trial attempt; picking the current one changes nothing.
 */
export function setActiveDungeon(
  state: GameState,
  content: Content,
  id: string | null,
): CombatResult {
  if (id !== null) {
    if (!content.dungeonById.has(id) && !content.trialById.has(id)) return fail('unknown');
    if (!isDungeonUnlocked(state, content, id)) return fail('locked');
  }
  if (id === state.activeDungeonId) return { ok: true, state };
  const next = cloneState(state);
  next.activeDungeonId = id;
  next.bossHp = null;
  next.combat.trialAttempt = { elapsedSeconds: 0, dealt: new Decimal(0) };
  return { ok: true, state: next };
}

/**
 * Boss HP grows slowly with prestige count: base * (1 + scaling)^prestiges, then the
 * combat.bossHp modifiers apply.
 */
export function bossMaxHp(
  dungeon: Dungeon,
  prestigeCount: number,
  modifiers: readonly Modifier[] = [],
): Decimal {
  const growth = Decimal.pow(1 + dungeon.boss.hpScalingPerPrestige, prestigeCount);
  const base = dungeon.boss.hp.mul(growth);
  return Decimal.max(
    statValue('combat.bossHp', base, modifiers, { ...FIGHTING, dungeon: dungeon.id }),
    1,
  );
}

export interface BossStatus {
  dungeon: Dungeon;
  hp: Decimal;
  maxHp: Decimal;
  /** Stacked bars ("x N") for the life gauge. */
  bars: HpBarState;
  kills: number;
  /** Rare-drop pity counter: kills in a row without the rare item. */
  pity: number;
}

/** The boss being fought, or null when a special dungeon or nothing is active. */
export function bossStatus(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BossStatus | null {
  const dungeon = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
  if (!dungeon) return null;
  const maxHp = bossMaxHp(dungeon, state.prestigeCount, modifiers);
  const hp = Decimal.min(state.bossHp ?? maxHp, maxHp);
  return {
    dungeon,
    hp,
    maxHp,
    bars: hpBarState(hp, maxHp, dungeon.boss.hpBars),
    kills: dungeonKills(state, dungeon.id),
    pity: state.pity[dungeon.boss.id] ?? 0,
  };
}

/** The dungeon's drop table after modifiers (chances clamped to 0..1, pity at least 1). */
export function effectiveDrops(dungeon: Dungeon, modifiers: readonly Modifier[]): DropTable {
  const ctx = { ...FIGHTING, dungeon: dungeon.id };
  const { rare, portalResource, material } = dungeon.drops;
  const clamp01 = (d: Decimal): number => Math.min(1, Math.max(0, d.toNumber()));
  const chance = clamp01(statValue('drops.rareChance', rare.chance, modifiers, ctx));
  const pity = statValue('drops.pityThreshold', rare.pityThreshold, modifiers, ctx).toNumber();
  const portalCtx = { ...ctx, resource: portalResource.resource };
  const amount = (n: number): number =>
    Math.max(0, Math.floor(statValue('drops.portalAmount', n, modifiers, portalCtx).toNumber()));
  const min = amount(portalResource.min);
  const multiplier = Math.max(
    0,
    statValue('drops.portalMultiplier', 1, modifiers, portalCtx).toNumber(),
  );
  const materialCtx = { ...ctx, resource: material.resource };
  return {
    rare: { ...rare, chance, pityThreshold: Math.max(1, Math.round(pity)) },
    portalResource: {
      ...portalResource,
      min,
      max: Math.max(min, amount(portalResource.max)),
      multiplier,
    },
    material: {
      ...material,
      chance: clamp01(statValue('drops.materialChance', material.chance, modifiers, materialCtx)),
      amount: Math.max(
        0,
        Math.floor(
          statValue('drops.materialAmount', material.amount, modifiers, materialCtx).toNumber(),
        ),
      ),
    },
  };
}

// ---- crits (DESIGN.md 11.11) -------------------------------------------------------------------

export interface CritStats {
  /** Chance a hit or signature attack crits, 0..1. */
  chance: number;
  /** Damage multiplier of a crit, at least 1. */
  damage: Decimal;
}

export function critStats(
  content: Content,
  modifiers: readonly Modifier[] = [],
  dungeonId?: string | null,
): CritStats {
  const ctx: StatContext = dungeonId ? { ...FIGHTING, dungeon: dungeonId } : FIGHTING;
  const base = content.combat.crit;
  const chance = statValue('combat.critChance', base.chance, modifiers, ctx).toNumber();
  return {
    chance: Math.min(1, Math.max(0, chance)),
    damage: Decimal.max(statValue('combat.critDamage', base.damage, modifiers, ctx), 1),
  };
}

/**
 * Average damage factor from crits: 1 + chance * (damage - 1). The simulation deals this
 * expected value so online, offline and split steps give the same totals; the stage rolls
 * individual crits only for show.
 */
export function critFactor(crit: CritStats): Decimal {
  return crit.damage.sub(1).mul(crit.chance).add(1);
}

/** Rolls whether one shown hit is a crit. For the stage only: never changes the state. */
export function rollCritForShow(crit: CritStats, rng: Rng): boolean {
  return rng() < crit.chance;
}

/** One hit as the stage shows it: rolls a crit and gives the number to float. Show only. */
export function rollHitForShow(
  hit: Decimal,
  crit: CritStats,
  rng: Rng,
): { damage: Decimal; crit: boolean } {
  const isCrit = rollCritForShow(crit, rng);
  return { damage: isCrit ? hit.mul(crit.damage) : hit, crit: isCrit };
}

// ---- burst gauges ----------------------------------------------------------------------------

/** One job's burst numbers after modifiers. */
export interface BurstStats {
  /** Seconds between hits / ticks (above 0). */
  interval: number;
  /** Gauge points needed to fire (at least 1). */
  size: number;
  /** Gauge points per hit / tick (at least 0). */
  fill: number;
  /** Fighting: damage as a multiple of one hit. Production: seconds of the job's output. */
  power: Decimal;
}

export function burstStats(
  content: Content,
  job: BurstJob,
  modifiers: readonly Modifier[] = [],
): BurstStats {
  const config = content.combat.bursts[job];
  const ctx = { job };
  const num = (stat: Parameters<typeof statValue>[0], base: number): number =>
    statValue(stat, base, modifiers, ctx).toNumber();
  return {
    interval: Math.max(0.05, num('burst.interval', config.intervalSeconds)),
    size: Math.max(1, num('burst.size', config.gaugeSize)),
    fill: Math.max(0, num('burst.fill', config.fill)),
    power: Decimal.max(statValue('burst.power', config.power, modifiers, ctx), 0),
  };
}

export interface BurstView {
  gauge: number;
  size: number;
  /** How full the gauge is, 0..1. */
  fraction: number;
  stats: BurstStats;
}

/** A job's gauge for display (the renderer animates it). */
export function burstView(
  state: GameState,
  content: Content,
  job: BurstJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BurstView {
  const stats = burstStats(content, job, modifiers);
  const gauge = Math.min(state.bursts[job].gauge, stats.size);
  return { gauge, size: stats.size, fraction: gauge / stats.size, stats };
}

/**
 * Runs a gauge for `seconds`: one hit / tick every `interval`, each adding `fill` points; every
 * `size` points fire one burst and the leftover carries over. Splitting the time into steps
 * gives the same totals as one big step.
 */
export function advanceGauge(
  gauge: BurstGauge,
  seconds: number,
  stats: BurstStats,
): { gauge: BurstGauge; hits: number; bursts: number } {
  if (!(seconds > 0)) return { gauge: { ...gauge }, hits: 0, bursts: 0 };
  const time = gauge.timer + seconds;
  const hits = Math.floor(time / stats.interval + EPSILON);
  const timer = Math.max(0, time - hits * stats.interval);
  const points = gauge.gauge + hits * stats.fill;
  const bursts = Math.floor(points / stats.size + EPSILON);
  return {
    gauge: { gauge: Math.max(0, points - bursts * stats.size), timer },
    hits,
    bursts,
  };
}

/** Damage of one hit at this damage per second. */
export function hitDamage(dps: Decimal, stats: BurstStats): Decimal {
  return dps.mul(stats.interval);
}

/** Damage of one signature attack (on top of the normal damage). */
export function signatureDamage(dps: Decimal, stats: BurstStats): Decimal {
  return hitDamage(dps, stats).mul(stats.power);
}

/**
 * Average damage per second including signature attacks: a burst fires every size/fill hits and
 * adds `power` hits' worth of damage, so it adds dps * power * fill / size on average.
 */
export function averageDamage(dps: Decimal, stats: BurstStats): Decimal {
  if (stats.fill <= 0) return dps;
  return dps.mul(stats.power.mul(stats.fill / stats.size).add(1));
}

/** Average seconds to defeat a dungeon's boss from full HP, or null when no damage is dealt. */
export function secondsPerKill(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number | null {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return null;
  const avg = averageDps(state, content, dungeonId, modifiers);
  if (avg.lte(0)) return null;
  return bossMaxHp(dungeon, state.prestigeCount, modifiers).div(avg).toNumber();
}

// ---- live stage readouts (DESIGN.md 14) --------------------------------------------------------

/**
 * Average damage per second against a dungeon or special dungeon: damage after modifiers with
 * signature attacks and crits at their expected value (what the simulation deals).
 */
export function averageDps(
  state: GameState,
  content: Content,
  dungeonId: string | null = state.activeDungeonId,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Decimal {
  const dps = effectiveDamage(state, content, dungeonId, modifiers);
  return averageDamage(dps, burstStats(content, 'fighting', modifiers)).mul(
    critFactor(critStats(content, modifiers, dungeonId)),
  );
}

/** Boss kills per minute in a dungeon (60 / seconds per kill), or null without kills. */
export function killsPerMinute(
  state: GameState,
  content: Content,
  dungeonId: string | null = state.activeDungeonId,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number | null {
  if (!dungeonId) return null;
  const spk = secondsPerKill(state, content, dungeonId, modifiers);
  return spk === null || spk <= 0 ? null : 60 / spk;
}

/** The stage's live numbers for whatever is being fought. */
export interface StageReadout {
  /** Damage per second after modifiers (no signature attacks or crits). */
  dps: Decimal;
  /** Damage per second with signature attacks and crits at their expected value. */
  averageDps: Decimal;
  /** Boss kills per minute; null for a special dungeon, nothing active or no damage. */
  killsPerMinute: number | null;
  /** Average seconds to kill the boss from full HP; null like killsPerMinute. */
  secondsPerKill: number | null;
  /** Seconds to finish the current boss from its HP now; null like killsPerMinute. */
  secondsLeft: number | null;
}

/**
 * DPS, kills per minute and time-to-kill for the active dungeon. Knockouts are not counted
 * in: the readouts say how fast the loadout kills while it is fighting.
 */
export function stageReadout(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): StageReadout {
  const id = state.activeDungeonId;
  const avg = averageDps(state, content, id, modifiers);
  const dungeon = id ? content.dungeonById.get(id) : undefined;
  const spk = dungeon ? secondsPerKill(state, content, dungeon.id, modifiers) : null;
  const boss = dungeon && spk !== null ? bossStatus(state, content, modifiers) : null;
  return {
    dps: effectiveDamage(state, content, id, modifiers),
    averageDps: avg,
    killsPerMinute: spk === null || spk <= 0 ? null : 60 / spk,
    secondsPerKill: spk,
    secondsLeft: boss ? boss.hp.div(avg).toNumber() : null,
  };
}

/** What clearing a dungeon or special dungeon for the first time opens. */
export function clearUnlocks(
  content: Content,
  id: string,
): { dungeons: string[]; mines: string[] } {
  return {
    dungeons: [...content.dungeons, ...content.trials]
      .filter((d) => d.unlockedBy === id)
      .map((d) => d.id),
    mines: content.mines.filter((m) => m.unlockedByDungeon === id).map((m) => m.id),
  };
}

// ---- special dungeons ------------------------------------------------------------------------

/** Share of the target's HP dealt, 0..1. */
export function trialScore(trial: Trial, dealt: Decimal): number {
  if (dealt.lte(0)) return 0;
  return Math.min(1, dealt.div(trial.target.hp).toNumber());
}

/** Everything one attempt with this score pays: every tier reached, merged by resource. */
export function trialRewards(
  trial: Trial,
  score: number,
  modifiers: readonly Modifier[] = [],
): Price[] {
  const totals = new Map<string, Decimal>();
  for (const tier of trial.tiers) {
    if (score + EPSILON < tier.score) break;
    for (const reward of tier.rewards) {
      const ctx = { ...FIGHTING, dungeon: trial.id, resource: reward.resource };
      const amount = Decimal.max(statValue('trial.reward', reward.amount, modifiers, ctx), 0);
      totals.set(reward.resource, (totals.get(reward.resource) ?? new Decimal(0)).add(amount));
    }
  }
  return [...totals].map(([resource, amount]) => ({ resource, amount: amount.floor() }));
}

export interface TrialStatus {
  trial: Trial;
  elapsedSeconds: number;
  durationSeconds: number;
  dealt: Decimal;
  /** Score of the running attempt so far, 0..1. */
  score: number;
  /** Best score ever, 0..1. */
  best: number;
  cleared: boolean;
}

/** The special dungeon being fought, or null. */
export function trialStatus(state: GameState, content: Content): TrialStatus | null {
  const trial = state.activeDungeonId ? content.trialById.get(state.activeDungeonId) : null;
  if (!trial) return null;
  const { elapsedSeconds, dealt } = state.combat.trialAttempt;
  return {
    trial,
    elapsedSeconds,
    durationSeconds: trial.durationSeconds,
    dealt,
    score: trialScore(trial, dealt),
    best: state.combat.trialBest[trial.id] ?? 0,
    cleared: isDungeonCleared(state, trial.id),
  };
}

// ---- stepping (called by advance) ------------------------------------------------------------

/**
 * Harvest bursts: ticks fill each production job's gauge; full = that much extra output.
 * Returns, per job, the seconds of output the bursts harvested (0 when none fired).
 */
export function advanceHarvestBursts(
  next: GameState,
  before: GameState,
  content: Content,
  seconds: number,
  report: TickReport,
  modifiers: readonly Modifier[],
): Record<ProductionJob, Decimal> {
  const harvested: Record<ProductionJob, Decimal> = {
    logging: new Decimal(0),
    mining: new Decimal(0),
  };
  for (const job of PRODUCTION_JOBS) {
    const stats = burstStats(content, job, modifiers);
    const run = advanceGauge(next.bursts[job], seconds, stats);
    next.bursts[job] = run.gauge;
    if (run.bursts === 0) continue;
    report.bursts[job] += run.bursts;
    const harvestSeconds = stats.power.mul(run.bursts);
    harvested[job] = harvestSeconds;
    for (const [resource, perSecond] of Object.entries(
      jobProductionPerSecond(before, content, job, modifiers),
    )) {
      next.resources[resource] = (next.resources[resource] ?? new Decimal(0)).add(
        perSecond.mul(harvestSeconds),
      );
    }
  }
  return harvested;
}

// ---- card health (DESIGN.md 11.10) ----

/** Most a defence stat can block, in percent. */
const MAX_DEFENCE = 90;

/** Fighting loadout's health pool: the sum of its cards' health, read through `combat.health`. */
export function loadoutMaxHealth(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
  dungeonId?: string,
): Decimal {
  const l = state.cards.loadouts.fighting;
  let sum = new Decimal(0);
  for (const id of [l.main, ...l.supports]) {
    const owned = id ? state.cards.owned[id] : undefined;
    if (id && owned) sum = sum.add(cardHealth(content, id, owned));
  }
  const ctx: StatContext = dungeonId ? { dungeon: dungeonId } : {};
  return Decimal.max(computeStat('combat.health', sum, modifiers, ctx).value, 0);
}

/** Percent of boss damage blocked (0..90), from `combat.defence`. */
export function defencePercent(modifiers: readonly Modifier[], dungeonId: string): number {
  const v = computeStat('combat.defence', 0, modifiers, { dungeon: dungeonId }).value.toNumber();
  return Math.max(0, Math.min(MAX_DEFENCE, v));
}

/** Damage per second a boss deals to the loadout: grows with prestige like its HP, less defence. */
export function bossAttackDps(
  dungeon: Dungeon,
  prestigeCount: number,
  modifiers: readonly Modifier[],
): Decimal {
  const a = dungeon.boss.attack;
  const grown = a.damage.mul(Decimal.pow(1 + dungeon.boss.hpScalingPerPrestige, prestigeCount));
  return grown.div(a.intervalSeconds).mul(1 - defencePercent(modifiers, dungeon.id) / 100);
}

export interface LoadoutHealth {
  max: Decimal;
  current: Decimal;
  /** Seconds of knockout left; 0 when fighting. */
  knockoutSeconds: number;
  /** Damage per second the current boss deals (0 for special dungeons and when idle). */
  incoming: Decimal;
}

/** The fighting loadout's health as the Home screen shows it. */
export function loadoutHealth(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): LoadoutHealth {
  const id = state.activeDungeonId ?? undefined;
  const dungeon = id ? content.dungeonById.get(id) : undefined;
  const max = loadoutMaxHealth(state, content, modifiers, id);
  const ko = state.combat.knockoutSeconds;
  const current = ko > 0 ? new Decimal(0) : Decimal.max(max.sub(state.combat.loadoutDamage), 0);
  const incoming = dungeon
    ? bossAttackDps(dungeon, state.prestigeCount, modifiers)
    : new Decimal(0);
  return { max, current, knockoutSeconds: ko, incoming };
}

/** Fights whatever is active for `seconds`. Mutates `next` (a fresh clone owned by advance). */
export function advanceCombat(
  next: GameState,
  content: Content,
  seconds: number,
  rng: Rng,
  report: TickReport,
  modifiers: readonly Modifier[],
): void {
  const id = next.activeDungeonId;
  if (!id || !isDungeonUnlocked(next, content, id)) return;
  // A knocked-out loadout sits out first, whatever is active (DESIGN.md 11.10).
  let left = seconds;
  if (next.combat.knockoutSeconds > 0) {
    const wait = Math.min(left, next.combat.knockoutSeconds);
    next.combat.knockoutSeconds -= wait;
    left -= wait;
    if (next.combat.knockoutSeconds <= EPSILON) {
      next.combat.knockoutSeconds = 0;
      next.combat.loadoutDamage = new Decimal(0);
    } else return;
  }
  if (left <= EPSILON) return;
  // Crits add their expected damage to every hit and signature attack.
  const dps = effectiveDamage(next, content, id, modifiers).mul(
    critFactor(critStats(content, modifiers, id)),
  );
  if (dps.lte(0)) return;
  const stats = burstStats(content, 'fighting', modifiers);

  const dungeon = content.dungeonById.get(id);
  if (dungeon) {
    fightDungeon(next, content, dungeon, dps, stats, left, rng, report, modifiers);
    return;
  }
  const trial = content.trialById.get(id);
  if (trial) fightTrial(next, content, trial, dps, stats, left, report, modifiers);
}

/** Most knockouts handled in one advance (each costs knockoutSeconds, so this is generous). */
const MAX_KNOCKOUTS_PER_ADVANCE = 100_000;

/**
 * A dungeon fight where the boss hits back. Time splits at the moment the pool runs out: the
 * loadout deals damage until then, is knocked out (the boss heals to full), sits out, and the
 * fight starts again with full health.
 */
function fightDungeon(
  next: GameState,
  content: Content,
  dungeon: Dungeon,
  dps: Decimal,
  stats: BurstStats,
  seconds: number,
  rng: Rng,
  report: TickReport,
  modifiers: readonly Modifier[],
): void {
  const fight = (t: number): void => {
    if (t <= EPSILON) return;
    const run = advanceGauge(next.bursts.fighting, t, stats);
    next.bursts.fighting = run.gauge;
    report.bursts.fighting += run.bursts;
    const dealt = dps.mul(t).add(signatureDamage(dps, stats).mul(run.bursts));
    fightBoss(next, content, dungeon, dealt, rng, report, modifiers);
  };
  const max = loadoutMaxHealth(next, content, modifiers, dungeon.id);
  const incoming = bossAttackDps(dungeon, next.prestigeCount, modifiers);
  const ko = content.combat.knockoutSeconds;
  let left = seconds;
  let knockouts = 0;
  while (left > EPSILON) {
    if (max.lte(0) || incoming.lte(0)) {
      fight(left);
      return;
    }
    const hpLeft = Decimal.max(max.sub(next.combat.loadoutDamage), 0);
    const untilDown = hpLeft.div(incoming).toNumber();
    if (untilDown >= left) {
      fight(left);
      next.combat.loadoutDamage = next.combat.loadoutDamage.add(incoming.mul(left));
      return;
    }
    fight(untilDown);
    left -= untilDown;
    // Knocked out: the boss heals to full and the loadout sits out.
    next.bossHp = null;
    report.knockouts++;
    knockouts++;
    const wait = Math.min(left, ko);
    left -= wait;
    if (wait + EPSILON < ko || knockouts >= MAX_KNOCKOUTS_PER_ADVANCE) {
      next.combat.knockoutSeconds = ko - wait;
      next.combat.loadoutDamage = max;
      return;
    }
    next.combat.loadoutDamage = new Decimal(0);
  }
}

function addResource(state: GameState, resource: string, amount: Decimal | number): void {
  state.resources[resource] = (state.resources[resource] ?? new Decimal(0)).add(amount);
}

/** Records a first clear and what it unlocks. */
function markCleared(next: GameState, content: Content, id: string, report: TickReport): void {
  if (isDungeonCleared(next, id)) return;
  if (content.dungeonById.has(id)) {
    const result = clearDungeon(next, content, id);
    next.clearedDungeons = result.state.clearedDungeons;
    report.unlockedMines.push(...result.unlockedMines);
  } else {
    next.clearedDungeons.push(id);
  }
  report.cleared.push(id);
  for (const entry of [...content.dungeons, ...content.trials]) {
    if (entry.unlockedBy === id) report.unlockedDungeons.push(entry.id);
  }
}

function fightBoss(
  state: GameState,
  content: Content,
  dungeon: Dungeon,
  dealt: Decimal,
  rng: Rng,
  report: TickReport,
  modifiers: readonly Modifier[],
): void {
  const maxHp = bossMaxHp(dungeon, state.prestigeCount, modifiers);
  const hp = Decimal.min(state.bossHp ?? maxHp, maxHp);

  if (dealt.lt(hp)) {
    state.bossHp = hp.sub(dealt);
    return;
  }

  // At least one kill. Overflow damage carries into respawned bosses.
  let overflow = dealt.sub(hp);
  let kills = 1;
  const extra = Decimal.min(overflow.div(maxHp).floor(), MAX_KILLS_PER_ADVANCE - 1).toNumber();
  kills += extra;
  overflow = kills >= MAX_KILLS_PER_ADVANCE ? new Decimal(0) : overflow.sub(maxHp.mul(extra));
  // Remaining overflow is < maxHp; the floor guards against rounding pushing HP to <= 0.
  state.bossHp = Decimal.max(maxHp.sub(overflow), maxHp.mul(1e-9));

  const bossId = dungeon.boss.id;
  const drops = effectiveDrops(dungeon, modifiers);
  const cardChance = cardDropChance(content, dungeon, modifiers);
  let pity = state.pity[bossId] ?? 0;
  let portal = 0;
  let rares = 0;
  let material = 0;
  for (let i = 0; i < kills; i++) {
    const roll = rollBossDrop(drops, pity, rng);
    pity = roll.pity;
    portal += roll.portal;
    if (roll.rare) rares++;
    material += rollMaterialDrop(drops, rng);
    // Rolled per kill, after the other drops, so the rolls keep their order however time is split.
    const card = rollCardDrop(content, cardChance, rng);
    if (card) grantCardDrop(state, content, card, report);
  }

  state.pity[bossId] = pity;
  state.stats.bossKills += kills;
  report.bossKills += kills;
  const totalKills = dungeonKills(state, dungeon.id) + kills;
  state.combat.kills[dungeon.id] = totalKills;
  if (portal > 0) addResource(state, drops.portalResource.resource, portal);
  if (material > 0) {
    const id = drops.material.resource;
    addResource(state, id, material);
    report.materials[id] = (report.materials[id] ?? 0) + material;
  }
  if (rares > 0) {
    const item = dungeon.drops.rare.itemId;
    state.inventory[item] = (state.inventory[item] ?? 0) + rares;
    report.drops[item] = (report.drops[item] ?? 0) + rares;
  }
  // Cards: the fighting loadout gains XP per kill.
  grantLoadoutXp(
    state,
    content,
    'fighting',
    fightingXpPerKill(content, dungeon, modifiers).mul(kills),
  );
  if (totalKills >= dungeon.killsToClear) markCleared(state, content, dungeon.id, report);
}

function fightTrial(
  state: GameState,
  content: Content,
  trial: Trial,
  dps: Decimal,
  stats: BurstStats,
  seconds: number,
  report: TickReport,
  modifiers: readonly Modifier[],
): void {
  let remaining = seconds;
  let attempts = 0;
  let { elapsedSeconds, dealt } = state.combat.trialAttempt;
  while (remaining > EPSILON && attempts < MAX_TRIAL_ATTEMPTS_PER_ADVANCE) {
    const step = Math.min(remaining, trial.durationSeconds - elapsedSeconds);
    const run = advanceGauge(state.bursts.fighting, step, stats);
    state.bursts.fighting = run.gauge;
    report.bursts.fighting += run.bursts;
    dealt = dealt.add(dps.mul(step)).add(signatureDamage(dps, stats).mul(run.bursts));
    elapsedSeconds += step;
    remaining -= step;
    if (elapsedSeconds + EPSILON < trial.durationSeconds) break;

    // The attempt is over: score it, pay every tier reached and start the next one.
    attempts++;
    const score = trialScore(trial, dealt);
    for (const reward of trialRewards(trial, score, modifiers)) {
      if (reward.amount.lte(0)) continue;
      addResource(state, reward.resource, reward.amount);
      const n = reward.amount.toNumber();
      report.materials[reward.resource] = (report.materials[reward.resource] ?? 0) + n;
    }
    state.combat.trialBest[trial.id] = Math.max(state.combat.trialBest[trial.id] ?? 0, score);
    report.trialTopScore = Math.max(report.trialTopScore, score);
    if (score + EPSILON >= 1) markCleared(state, content, trial.id, report);
    elapsedSeconds = 0;
    dealt = new Decimal(0);
  }
  report.trialAttempts += attempts;
  state.combat.trialAttempt = { elapsedSeconds, dealt };
}
