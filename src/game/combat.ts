import type { BurstJob, Content, Dungeon, Trial } from '../data';
import {
  cardBaseDamage,
  cardHealth,
  fightingXpPerKill,
  fightingXpPerSecond,
  grantLoadoutXp,
} from './cards';
import { grantCosmetic } from './wardrobe';
import { grantAccountXp, killXp } from './account';
import { rollBossDrop, rollEnemyDrops, rollMaterialDrop, type DropTable } from './drops';
import {
  challengeSeconds,
  floorCount,
  floorPosition,
  floorSpec,
  initialProgress,
  isDifficultyUnlocked,
  isStageFloor,
  stageKey,
  type DifficultyScale,
  type FloorEnemy,
  type FloorKind,
} from './floors';
import { hpBarState, type HpBarState } from './hpBars';
import {
  bossAttacksBy,
  bossDamageBetween,
  lethalBossAttack,
  meanAttacksToKnockout,
  nextBossSlam,
  recordBossAttacks,
  type BossPattern,
} from './bossAttacks';
import {
  collectModifiers,
  computeStat,
  statValue,
  type Modifier,
  type StatContext,
  type StatResult,
} from './modifiers';
import { Decimal } from './num';
import { clearDungeon, type Price } from './production';
import { pushPlayerHit, type TickReport } from './report';
import type { Rng } from './rng';
import {
  overflowActive,
  payStageChests,
  stageDamageFactor,
  stageLootFactor,
  stageStars,
  type StageStarInfo,
} from './stageStars';
import {
  cloneState,
  type BurstGauge,
  type Difficulty,
  type DungeonProgress,
  type GameState,
  type TierProgress,
} from './state';

/**
 * Combat (DESIGN.md §6): a dungeon is a stack of floors (floors.ts), auto-fought in parallel with
 * production: waves of normal enemies, a mini-boss every 10th floor and the dungeon's boss on the
 * last one. The loadout farms the best floor it has beaten, on a loop; the next floor is a
 * Challenge, started by a button or by auto-challenge, at full health and on a timer. A won
 * Challenge moves the farming down to that floor; a lost one returns to farming (with
 * auto-challenge on, after a wait). The enemies hit back, and a loadout that runs out of health
 * while farming is knocked out and drops a floor. Each enemy has its own HP: a hit stops at the
 * kill unless the stage's overflow switch is on. Damage comes from the main fighting card
 * (DESIGN.md §5). A dungeon is cleared the first time its Normal last-floor boss dies, which
 * unlocks the next dungeon and a mine type.
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
  /** No dungeon / special dungeon with that id. */
  | 'unknown'
  /** The dungeon, or the difficulty asked for, is not unlocked yet. */
  | 'locked'
  /** There is no floor to challenge (the last floor of a tier is farmed). */
  | 'none'
  /** A Challenge is already running, or the loadout is knocked out. */
  | 'busy';

export type CombatResult = { ok: true; state: GameState } | { ok: false; reason: CombatFailure };

const fail = (reason: CombatFailure): CombatResult => ({ ok: false, reason });
const FIGHTING = { job: 'fighting' } as const;
/** Absorbs floating-point drift when time is split into many small steps. */
const EPSILON = 1e-9;

// ---- damage ----------------------------------------------------------------------------------

/**
 * Damage per second before `combat.damage` modifiers (DESIGN.md §5, §6): the main fighting
 * card's base damage by rarity, grown by its level, tier and stars. With no card leading (or
 * one that is not owned) it is the bare-hands damage. Supports add only through their bonuses.
 */
export function baseDamage(state: GameState, content: Content): Decimal {
  const id = state.cards.loadouts.fighting.main;
  const owned = id ? state.cards.owned[id] : undefined;
  if (!id || !owned || !content.cardById.has(id)) return content.combat.unarmedDamage;
  return cardBaseDamage(content, id, owned);
}

/** `combat.damage` with its breakdown (for tooltips), against a dungeon or special dungeon. */
export function damageStat(
  state: GameState,
  content: Content,
  dungeonId: string | null = state.activeDungeonId,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): StatResult {
  const ctx: StatContext = dungeonId ? { ...FIGHTING, dungeon: dungeonId } : FIGHTING;
  return computeStat('combat.damage', baseDamage(state, content), modifiers, ctx);
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
  resetFight(next);
  next.combat.trialAttempt = { elapsedSeconds: 0, dealt: new Decimal(0) };
  return { ok: true, state: next };
}

/**
 * Back to farming a fresh floor (a state being built): no Challenge, no auto-challenge wait, the
 * floor's first enemy at full HP. Used when the dungeon or the difficulty fought changes.
 */
function resetFight(next: GameState): void {
  freshFloor(next);
  next.combat.challenge = null;
  next.combat.challengeWaitSeconds = 0;
}

/** The floor starts again: its first enemy, at full HP (DESIGN.md §6 Each enemy has its own HP). */
function freshFloor(next: GameState): void {
  next.bossHp = null;
  next.combat.enemyIndex = 0;
}

/**
 * Turns a dungeon's auto-challenge on or off (DESIGN.md §6 Auto-challenge). A Challenge already
 * running plays out; the wait after a loss is kept.
 */
export function setAutoChallenge(
  state: GameState,
  content: Content,
  dungeonId: string,
  on: boolean,
): CombatResult {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return fail('unknown');
  if (!isDungeonUnlocked(state, content, dungeonId)) return fail('locked');
  if (floorPosition(state, dungeon).autoChallenge === on) return { ok: true, state };
  const next = cloneState(state);
  ensureProgress(next, dungeonId).autoChallenge = on;
  return { ok: true, state: next };
}

/**
 * Starts a Challenge of the next floor in the active dungeon (DESIGN.md §6 Farming and Challenge):
 * the Challenge button. It starts at full health on a fresh floor with its timer at 0. Fails when
 * nothing is active, there is no floor to challenge, a Challenge is running or the loadout is
 * knocked out.
 */
export function startChallenge(state: GameState, content: Content): CombatResult {
  const dungeon = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
  if (!dungeon) return fail('unknown');
  if (!isDungeonUnlocked(state, content, dungeon.id)) return fail('locked');
  if (state.combat.challenge || state.combat.knockoutSeconds > 0) return fail('busy');
  const position = floorPosition(state, dungeon);
  if (position.challengeFloor === null) return fail('none');
  const next = cloneState(state);
  beginChallenge(next, dungeon.id, position.difficulty);
  return { ok: true, state: next };
}

/** A Challenge begins (a state being built): fresh floor, full health, timer at 0. */
function beginChallenge(next: GameState, dungeonId: string, difficulty: Difficulty): void {
  freshFloor(next);
  next.combat.loadoutDamage = new Decimal(0);
  next.combat.challenge = { dungeonId, difficulty, elapsedSeconds: 0 };
}

/** The running Challenge as the arena shows it (DESIGN.md §6 Farming and Challenge). */
export interface ChallengeView {
  dungeonId: string;
  difficulty: Difficulty;
  floor: number;
  /** Seconds on its timer, and how many have run. */
  durationSeconds: number;
  elapsedSeconds: number;
  secondsLeft: number;
}

/** The next Challenge of a dungeon (its floor and timer), or null when there is none. */
export interface NextChallenge {
  floor: number;
  durationSeconds: number;
  /** Auto-challenge is on, and the seconds it still waits after a loss (0 = none). */
  auto: boolean;
  waitSeconds: number;
}

/**
 * The running Challenge of a dungeon in a state, or null: it must be on the active dungeon and on
 * its chosen difficulty, with a floor to challenge.
 */
function runningChallenge(
  state: GameState,
  content: Content,
): { dungeon: Dungeon; difficulty: Difficulty; floor: number; elapsedSeconds: number } | null {
  const run = state.combat.challenge;
  if (!run || run.dungeonId !== state.activeDungeonId) return null;
  const dungeon = content.dungeonById.get(run.dungeonId);
  if (!dungeon) return null;
  const position = floorPosition(state, dungeon);
  if (position.difficulty !== run.difficulty || position.challengeFloor === null) return null;
  return {
    dungeon,
    difficulty: run.difficulty,
    floor: position.challengeFloor,
    elapsedSeconds: run.elapsedSeconds,
  };
}

/** The Challenge running in the active dungeon, or null while farming. */
export function challengeView(state: GameState, content: Content): ChallengeView | null {
  const run = runningChallenge(state, content);
  if (!run) return null;
  const kind = floorSpec(content, run.dungeon, run.difficulty, run.floor).kind;
  const duration = challengeSeconds(content, kind);
  return {
    dungeonId: run.dungeon.id,
    difficulty: run.difficulty,
    floor: run.floor,
    durationSeconds: duration,
    elapsedSeconds: run.elapsedSeconds,
    secondsLeft: Math.max(0, duration - run.elapsedSeconds),
  };
}

/** What the Challenge button of a dungeon would start, on its chosen difficulty. */
export function nextChallenge(
  state: GameState,
  content: Content,
  dungeonId: string,
): NextChallenge | null {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return null;
  const position = floorPosition(state, dungeon);
  if (position.challengeFloor === null) return null;
  const kind = floorSpec(content, dungeon, position.difficulty, position.challengeFloor).kind;
  return {
    floor: position.challengeFloor,
    durationSeconds: challengeSeconds(content, kind),
    auto: position.autoChallenge,
    waitSeconds: state.activeDungeonId === dungeonId ? state.combat.challengeWaitSeconds : 0,
  };
}

/**
 * The floor being fought in a dungeon: the Challenge's while one runs there on that difficulty,
 * otherwise the farmed floor.
 */
export function currentFloor(
  state: GameState,
  content: Content,
  dungeon: Dungeon,
  difficulty?: Difficulty,
): number {
  const position = floorPosition(state, dungeon, difficulty);
  const run = runningChallenge(state, content);
  return run && run.dungeon.id === dungeon.id && run.difficulty === position.difficulty
    ? run.floor
    : position.floor;
}

/**
 * Chooses the difficulty a dungeon is fought on (DESIGN.md §6 Difficulty tiers): Normal, or a
 * tier whose way in has been beaten, or the endless depths below Nightmare. Each difficulty keeps
 * its own floor; the fight on the new one starts fresh.
 */
export function setDifficulty(
  state: GameState,
  content: Content,
  dungeonId: string,
  difficulty: Difficulty,
): CombatResult {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return fail('unknown');
  if (!isDungeonUnlocked(state, content, dungeonId)) return fail('locked');
  if (!isDifficultyUnlocked(state, dungeon, difficulty)) return fail('locked');
  if (floorPosition(state, dungeon).difficulty === difficulty) return { ok: true, state };
  const next = cloneState(state);
  ensureProgress(next, dungeonId).difficulty = difficulty;
  if (next.activeDungeonId === dungeonId) resetFight(next);
  return { ok: true, state: next };
}

/** The dungeon's saved floors in a state being built (a fresh clone), created when missing. */
function ensureProgress(next: GameState, dungeonId: string): DungeonProgress {
  return (next.combat.floors[dungeonId] ??= initialProgress());
}

/** The progress on the chosen difficulty in a state being built, created when missing. */
function ensureTier(next: GameState, dungeon: Dungeon): TierProgress {
  const progress = ensureProgress(next, dungeon.id);
  const position = floorPosition(next, dungeon);
  return (progress.tiers[progress.difficulty] ??= { floor: position.floor, best: position.best });
}

/**
 * HP of the dungeon's last-floor boss after the combat.bossHp modifiers. Enemies do not grow with
 * Ascension (DESIGN.md §6): harder enemies come from the difficulty tiers and the depths.
 */
export function bossMaxHp(dungeon: Dungeon, modifiers: readonly Modifier[] = []): Decimal {
  return enemyMaxHp(dungeon, dungeon.boss.hp, modifiers);
}

/** An enemy's HP after the combat.bossHp modifiers (at least 1). */
function enemyMaxHp(dungeon: Dungeon, hp: Decimal, modifiers: readonly Modifier[]): Decimal {
  return Decimal.max(
    statValue('combat.bossHp', hp, modifiers, { ...FIGHTING, dungeon: dungeon.id }),
    1,
  );
}

/** One enemy of the floor being fought, with its HP after modifiers. */
export interface StageEnemy extends FloorEnemy {
  /** Damage dealt to the floor by the time this enemy is dead (the HP of it and those before). */
  upto: Decimal;
}

/**
 * The floor being fought in a dungeon as the fight sees it (DESIGN.md §6): its enemies in the
 * order our damage reaches them and how hard the floor hits back, after modifiers and defence.
 */
export interface FightStage {
  dungeon: Dungeon;
  kind: FloorKind;
  difficulty: Difficulty;
  /** The floor (1-based) and how many the dungeon has on this difficulty. */
  floor: number;
  floors: number;
  enemies: StageEnemy[];
  /** HP of the whole floor. */
  hp: Decimal;
  /** What one normal attack of the floor takes from the health pool, after defence. */
  attack: Decimal;
  intervalSeconds: number;
  /** What the difficulty multiplies the drops, the wage and card XP by. */
  scale: DifficultyScale;
}

/**
 * The stage of a dungeon's floor: the one the player stands on, or `floor` when given, on the
 * chosen difficulty or on `difficulty` when given. Null for an unknown dungeon.
 */
export function fightStage(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
  floor?: number,
  difficulty?: Difficulty,
): FightStage | null {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return null;
  const position = floorPosition(state, dungeon, difficulty);
  const here = floor ?? currentFloor(state, content, dungeon, position.difficulty);
  const at = Math.min(position.floors, Math.max(1, Math.floor(here)));
  return stageOf(content, dungeon, position.difficulty, at, modifiers);
}

function stageOf(
  content: Content,
  dungeon: Dungeon,
  difficulty: Difficulty,
  floor: number,
  modifiers: readonly Modifier[],
): FightStage {
  const spec = floorSpec(content, dungeon, difficulty, floor);
  let upto = new Decimal(0);
  const enemies = spec.enemies.map((enemy): StageEnemy => {
    const hp = enemyMaxHp(dungeon, enemy.hp, modifiers);
    upto = upto.add(hp);
    return { ...enemy, hp, upto };
  });
  const attack = spec.attack.mul(1 - defencePercent(modifiers, dungeon.id) / 100);
  return {
    dungeon,
    kind: spec.kind,
    difficulty,
    floor,
    floors: floorCount(dungeon, difficulty),
    enemies,
    hp: upto,
    attack,
    intervalSeconds: spec.intervalSeconds,
    scale: spec.scale,
  };
}

/** Index of the enemy being fought on a stage's floor (the ones before it are dead). */
function enemyIndexOn(state: GameState, stage: FightStage): number {
  const i = Math.floor(state.combat.enemyIndex) || 0;
  return Math.min(stage.enemies.length - 1, Math.max(0, i));
}

/** HP left of the enemy being fought: the saved HP, never above its own HP (null = full). */
function enemyHpLeft(state: GameState, stage: FightStage): Decimal {
  const enemy = stage.enemies[enemyIndexOn(state, stage)]!;
  return Decimal.min(state.bossHp ?? enemy.hp, enemy.hp);
}

/** HP left of a stage's whole floor: the enemy being fought and every one after it. */
function stageHpLeft(state: GameState, stage: FightStage): Decimal {
  const index = enemyIndexOn(state, stage);
  const after = stage.hp.sub(stage.enemies[index]!.upto);
  return enemyHpLeft(state, stage).add(after);
}

/**
 * Sets the floor's HP left as one pool (a state being built; overflow on): the enemy it falls in
 * becomes the one being fought, with the rest of its HP. At or above the floor's HP the floor is
 * fresh.
 */
function setStageHpLeft(state: GameState, stage: FightStage, left: Decimal): void {
  if (left.gte(stage.hp)) {
    freshFloor(state);
    return;
  }
  const dealt = stage.hp.sub(left);
  const found = stage.enemies.findIndex((e) => e.upto.gt(dealt));
  const index = found < 0 ? stage.enemies.length - 1 : found;
  state.combat.enemyIndex = index;
  // The floor guards against rounding pushing HP to <= 0.
  const enemy = stage.enemies[index]!;
  state.bossHp = Decimal.max(enemy.upto.sub(dealt), enemy.hp.mul(1e-9));
}

export interface BossStatus {
  dungeon: Dungeon;
  /** The enemy our damage is on now: a wave's next enemy, the mini-boss or the boss. */
  enemy: Pick<StageEnemy, 'id' | 'name' | 'kind' | 'hpBars'>;
  /** That enemy's HP left and full HP. */
  hp: Decimal;
  maxHp: Decimal;
  /** Stacked bars ("x N") for the life gauge. */
  bars: HpBarState;
  /** Kills on the stage being fought, ever (0 on a wave floor or a depth). */
  kills: number;
  /** The stars of the stage being fought; null on a wave floor or a depth (DESIGN.md §6). */
  stars: StageStarInfo | null;
  /** Leftover damage from a kill carries on here (DESIGN.md §6 Overflow). */
  overflow: boolean;
  /** Rare-drop pity counter: boss kills in a row without the rare item. */
  pity: number;
  /** The floor being fought, of how many, and what it holds. */
  floor: number;
  floors: number;
  floorKind: FloorKind;
  difficulty: Difficulty;
  /** Auto-challenge is on for the dungeon (DESIGN.md §6 Auto-challenge). */
  autoChallenge: boolean;
  /** The floor being farmed, and the next one to challenge (null on a tier's last floor). */
  farmFloor: number;
  challengeFloor: number | null;
  /** The Challenge being fought, or null while farming. */
  challenge: ChallengeView | null;
  /** The deepest floor beaten on this difficulty. */
  bestFloor: number;
  /** Which enemy of the floor this is (1-based) and how many the floor holds. */
  wave: { index: number; size: number };
}

/** The enemy being fought, or null when a special dungeon or nothing is active. */
export function bossStatus(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BossStatus | null {
  const stage = state.activeDungeonId
    ? fightStage(state, content, state.activeDungeonId, modifiers)
    : null;
  if (!stage) return null;
  const { dungeon } = stage;
  const position = floorPosition(state, dungeon);
  const index = enemyIndexOn(state, stage);
  const enemy = stage.enemies[index]!;
  const hp = Decimal.max(enemyHpLeft(state, stage), 0);
  const stars = stageStars(state, content, stageKey(dungeon.id, stage.difficulty, stage.floor));
  return {
    dungeon,
    enemy: { id: enemy.id, name: enemy.name, kind: enemy.kind, hpBars: enemy.hpBars },
    hp,
    maxHp: enemy.hp,
    bars: hpBarState(hp, enemy.hp, enemy.hpBars),
    kills: stars?.kills ?? 0,
    stars,
    overflow: overflowActive(state, content, dungeon, stage.difficulty, stage.floor),
    pity: state.pity[dungeon.boss.id] ?? 0,
    floor: stage.floor,
    floors: stage.floors,
    floorKind: stage.kind,
    difficulty: stage.difficulty,
    autoChallenge: position.autoChallenge,
    farmFloor: position.floor,
    challengeFloor: position.challengeFloor,
    challenge: challengeView(state, content),
    bestFloor: position.best,
    wave: { index: index + 1, size: stage.enemies.length },
  };
}

/** The multiplier stat a currency's drops use: Money or crystals (DESIGN.md §3). */
function currencyMultiplierStat(
  content: Content,
  resource: string,
): 'drops.moneyMultiplier' | 'drops.crystalMultiplier' {
  return content.resourceById.get(resource)?.kind === 'crystal'
    ? 'drops.crystalMultiplier'
    : 'drops.moneyMultiplier';
}

/** The dungeon's drop table after modifiers (chances clamped to 0..1, pity at least 1). */
export function effectiveDrops(
  dungeon: Dungeon,
  modifiers: readonly Modifier[],
  content: Content,
): DropTable {
  const ctx = { ...FIGHTING, dungeon: dungeon.id };
  const { rare, currencies, material, wages, extraMaterials, firstClear } = dungeon.drops;
  const clamp01 = (d: Decimal): number => Math.min(1, Math.max(0, d.toNumber()));
  const chance = clamp01(statValue('drops.rareChance', rare.chance, modifiers, ctx));
  const pity = statValue('drops.pityThreshold', rare.pityThreshold, modifiers, ctx).toNumber();
  const materialCtx = { ...ctx, resource: material.resource };
  return {
    rare: { ...rare, chance, pityThreshold: Math.max(1, Math.round(pity)) },
    firstClear,
    wages: wages.map((wage) => ({
      ...wage,
      perSecond: Decimal.max(
        statValue(currencyMultiplierStat(content, wage.resource), wage.perSecond, modifiers, {
          ...ctx,
          resource: wage.resource,
        }),
        0,
      ),
    })),
    currencies: currencies.map((currency) => {
      const currencyCtx = { ...ctx, resource: currency.resource };
      const amount = (n: number): number =>
        Math.max(
          0,
          Math.floor(statValue('drops.currencyAmount', n, modifiers, currencyCtx).toNumber()),
        );
      const min = amount(currency.min);
      const multiplier = Math.max(
        0,
        statValue(
          currencyMultiplierStat(content, currency.resource),
          1,
          modifiers,
          currencyCtx,
        ).toNumber(),
      );
      return { ...currency, min, max: Math.max(min, amount(currency.max)), multiplier };
    }),
    extraMaterials: extraMaterials.map((extra) => {
      const extraCtx = { ...ctx, resource: extra.resource };
      const amount = (n: number): number =>
        Math.max(
          0,
          Math.floor(statValue('drops.materialAmount', n, modifiers, extraCtx).toNumber()),
        );
      const min = amount(extra.min);
      const chance = clamp01(statValue('drops.materialChance', extra.chance, modifiers, extraCtx));
      return { ...extra, min, max: Math.max(min, amount(extra.max)), chance };
    }),
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

// ---- crits (DESIGN.md §6) -------------------------------------------------------------------

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

/** The fighting gauge for display (the renderer animates it). Harvest gauges: harvest.ts. */
export function burstView(
  state: GameState,
  content: Content,
  job: 'fighting',
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

/**
 * Average seconds to clear a floor of a dungeon from full HP (the floor the player stands on, or
 * `floor` when given), or null when no damage is dealt. On the last floor this is the seconds per
 * boss kill.
 */
export function secondsPerKill(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
  floor?: number,
  difficulty?: Difficulty,
): number | null {
  const stage = fightStage(state, content, dungeonId, modifiers, floor, difficulty);
  if (!stage) return null;
  const avg = averageDps(state, content, dungeonId, modifiers).mul(
    stageDamageFactor(state, content, stage.dungeon, stage.difficulty, stage.floor, modifiers),
  );
  if (avg.lte(0)) return null;
  if (overflowActive(state, content, stage.dungeon, stage.difficulty, stage.floor)) {
    return stage.hp.div(avg).toNumber();
  }
  // Overflow off (DESIGN.md §6 Each enemy has its own HP): a hit stops at the kill, so each enemy
  // takes whole hits of its own.
  const interval = burstStats(content, 'fighting', modifiers).interval;
  const hit = avg.mul(interval);
  let hits = 0;
  for (const enemy of stage.enemies) {
    hits += Math.max(1, Math.ceil(enemy.hp.div(hit).toNumber() - EPSILON));
  }
  return hits * interval;
}

// ---- live stage readouts (DESIGN.md §11) --------------------------------------------------------

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

/** Floors cleared per minute in a dungeon (60 / seconds per floor), or null without kills. */
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
  /** Floors cleared per minute; null for a special dungeon, nothing active or no damage. */
  killsPerMinute: number | null;
  /** Average seconds to clear the floor from full HP; null like killsPerMinute. */
  secondsPerKill: number | null;
  /** Seconds to finish the floor from its HP now; null like killsPerMinute. */
  secondsLeft: number | null;
  /**
   * "You fall in": seconds the full health pool lasts against the boss, averaged over the places in
   * the attack cycle a fight can start from (the figure to set beside `secondsPerKill`); null when
   * nothing attacks (special dungeon, idle, no loadout health).
   */
  secondsToKnockout: number | null;
  /** Seconds until the knockout from the health left now, on the real attack schedule; null like
   *  secondsToKnockout, and while already knocked out. */
  secondsToKnockoutNow: number | null;
  /** The loadout falls before it kills the boss (`secondsToKnockout` < `secondsPerKill`): show red. */
  fallsFirst: boolean;
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
  const dungeon = id ? content.dungeonById.get(id) : undefined;
  const here = dungeon ? fightStage(state, content, dungeon.id, modifiers) : null;
  // The stage's star levels add their damage there (DESIGN.md §6 Stage stars).
  const factor = here
    ? stageDamageFactor(state, content, here.dungeon, here.difficulty, here.floor, modifiers)
    : 1;
  const avg = averageDps(state, content, id, modifiers).mul(factor);
  const spk = dungeon ? secondsPerKill(state, content, dungeon.id, modifiers) : null;
  const stage = spk !== null ? here : null;
  const survival = dungeon ? survivalSeconds(state, content, dungeon.id, modifiers) : null;
  return {
    dps: effectiveDamage(state, content, id, modifiers).mul(factor),
    averageDps: avg,
    killsPerMinute: spk === null || spk <= 0 ? null : 60 / spk,
    secondsPerKill: spk,
    secondsLeft: stage ? stageHpLeft(state, stage).div(avg).toNumber() : null,
    secondsToKnockout: survival,
    secondsToKnockoutNow: secondsToKnockoutNow(state, content, modifiers),
    fallsFirst: survival !== null && spk !== null && survival < spk,
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

/** Share of the target's HP dealt: 1 is a clear, and it goes on past that (more score levels). */
export function trialScore(trial: Trial, dealt: Decimal): number {
  if (dealt.lte(0)) return 0;
  return dealt.div(trial.target.hp).toNumber();
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
  /** Score of the running attempt so far (1 = the target's whole HP; it can go above). */
  score: number;
  /** Best score ever. */
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

// ---- card health (DESIGN.md §6) ----

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

/** What one boss attack takes from the pool, after defence (DESIGN.md §6). */
export interface BossAttackDamages {
  /** A normal attack: the damage in dungeons.json. */
  normal: Decimal;
  /** A light hit (five of every six attacks). */
  light: Decimal;
  /** A slam (every sixth attack). */
  slam: Decimal;
}

/** Damage of a boss's normal attack, less defence. */
function bossNormalAttack(dungeon: Dungeon, modifiers: readonly Modifier[]): Decimal {
  return dungeon.boss.attack.damage.mul(1 - defencePercent(modifiers, dungeon.id) / 100);
}

/** Damage of a boss's normal, light and slam attacks (the pattern is combat.json's `bossPattern`). */
export function bossAttackDamages(
  dungeon: Dungeon,
  modifiers: readonly Modifier[],
  pattern: BossPattern,
): BossAttackDamages {
  return attackDamages(bossNormalAttack(dungeon, modifiers), pattern);
}

/** The light and slam damage that go with a normal attack. */
function attackDamages(normal: Decimal, pattern: BossPattern): BossAttackDamages {
  return {
    normal,
    light: normal.mul(pattern.lightMultiplier),
    slam: normal.mul(pattern.slamMultiplier),
  };
}

/**
 * Average damage per second a boss deals to the loadout: its attacks spread over their interval.
 * The hits themselves land in chunks (bossAttackDamages); this is the same damage per minute as
 * dungeons.json, for readouts and balance.
 */
export function bossAttackDps(dungeon: Dungeon, modifiers: readonly Modifier[]): Decimal {
  return bossNormalAttack(dungeon, modifiers).div(dungeon.boss.attack.intervalSeconds);
}

export interface LoadoutHealth {
  max: Decimal;
  current: Decimal;
  /** Seconds of knockout left; 0 when fighting. */
  knockoutSeconds: number;
  /** Average damage per second the current boss deals; the hits land in chunks (0 for special
   *  dungeons and when idle). */
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
  const stage = dungeon ? fightStage(state, content, dungeon.id, modifiers) : null;
  const incoming = stage ? stage.attack.div(stage.intervalSeconds) : new Decimal(0);
  return { max, current, knockoutSeconds: ko, incoming };
}

/** The boss's attack rhythm right now, for the wind-up (DESIGN.md §6). */
export interface BossAttackView {
  /** Seconds between attacks. */
  intervalSeconds: number;
  /** What a light hit and a slam take from the pool, after defence. */
  lightDamage: Decimal;
  slamDamage: Decimal;
  /** Seconds until the next attack lands, and whether it is the slam. */
  nextAttackSeconds: number;
  nextIsSlam: boolean;
  /** Seconds until the next slam lands (a whole cycle right after one). */
  nextSlamSeconds: number;
  /** How far the wind-up has come, 0 right after a slam to 1 as the next one lands. */
  slamProgress: number;
}

/** The boss attack the fighting loadout faces, or null with no boss, no health or a knockout. */
export function bossAttackView(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): BossAttackView | null {
  const stage = state.activeDungeonId
    ? fightStage(state, content, state.activeDungeonId, modifiers)
    : null;
  if (!stage || state.combat.knockoutSeconds > 0) return null;
  if (loadoutMaxHealth(state, content, modifiers, stage.dungeon.id).lte(0)) return null;
  const pattern = content.combat.bossPattern;
  const interval = stage.intervalSeconds;
  const damages = attackDamages(stage.attack, pattern);
  if (damages.normal.lte(0)) return null;
  const clock = state.stats.playTimeMs / 1000;
  const landed = bossAttacksBy(clock, interval);
  const slam = nextBossSlam(landed, pattern);
  const cycleSeconds = pattern.attacksPerCycle * interval;
  const nextSlamSeconds = slam * interval - clock;
  return {
    intervalSeconds: interval,
    lightDamage: damages.light,
    slamDamage: damages.slam,
    nextAttackSeconds: (landed + 1) * interval - clock,
    nextIsSlam: slam === landed + 1,
    nextSlamSeconds,
    slamProgress: Math.min(1, Math.max(0, 1 - nextSlamSeconds / cycleSeconds)),
  };
}

/** Seconds from now until the health left is emptied on the real attack schedule, or null. */
export function secondsToKnockoutNow(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number | null {
  const stage = state.activeDungeonId
    ? fightStage(state, content, state.activeDungeonId, modifiers)
    : null;
  if (!stage || state.combat.knockoutSeconds > 0) return null;
  const max = loadoutMaxHealth(state, content, modifiers, stage.dungeon.id);
  const pattern = content.combat.bossPattern;
  const normal = stage.attack;
  if (max.lte(0) || normal.lte(0)) return null;
  const interval = stage.intervalSeconds;
  const clock = state.stats.playTimeMs / 1000;
  const pool = Decimal.max(max.sub(state.combat.loadoutDamage), 0);
  const lethal = lethalBossAttack(pool, normal, bossAttacksBy(clock, interval), pattern);
  return Math.max(0, lethal * interval - clock);
}

/**
 * Seconds the full health pool lasts against a floor of a dungeon (the one the player stands on,
 * or `floor` when given), averaged over the places in the attack cycle a fight can start from;
 * null when nothing would attack (no health, no damage). This is the "you fall in" figure to set
 * beside `secondsPerKill`.
 */
export function survivalSeconds(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
  floor?: number,
  difficulty?: Difficulty,
): number | null {
  const stage = fightStage(state, content, dungeonId, modifiers, floor, difficulty);
  if (!stage) return null;
  const max = loadoutMaxHealth(state, content, modifiers, dungeonId);
  const pattern = content.combat.bossPattern;
  const normal = stage.attack;
  if (max.lte(0) || normal.lte(0)) return null;
  // A fight starts between two hits: on average half an interval before the next one.
  const attacks = meanAttacksToKnockout(max, normal, pattern) - 0.5;
  return attacks * stage.intervalSeconds;
}

/**
 * Whether the loadout wins a floor of a dungeon: it clears the floor before the floor knocks it
 * out (DESIGN.md §6 "You fall in"). False when it deals no damage.
 */
export function winsFloor(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
  floor?: number,
  difficulty?: Difficulty,
): boolean {
  const spk = secondsPerKill(state, content, dungeonId, modifiers, floor, difficulty);
  if (spk === null || !Number.isFinite(spk)) return false;
  const survival = survivalSeconds(state, content, dungeonId, modifiers, floor, difficulty);
  return survival === null || survival >= spk;
}

/** Counts down the auto-challenge wait after a loss (a state being built). */
function countDownWait(next: GameState, seconds: number): void {
  const wait = next.combat.challengeWaitSeconds - seconds;
  next.combat.challengeWaitSeconds = wait <= EPSILON ? 0 : wait;
}

/**
 * Fights whatever is active for `seconds`. Mutates `next` (a fresh clone owned by advance).
 * Offline progress runs the same rules (DESIGN.md §6 Offline on floors): it farms, and it climbs
 * only where auto-challenge is on.
 */
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
  // A knocked-out loadout sits out first, whatever is active (DESIGN.md §6).
  let left = seconds;
  if (next.combat.knockoutSeconds > 0) {
    const wait = Math.min(left, next.combat.knockoutSeconds);
    next.combat.knockoutSeconds -= wait;
    countDownWait(next, wait);
    left -= wait;
    if (next.combat.knockoutSeconds <= EPSILON) {
      next.combat.knockoutSeconds = 0;
      next.combat.loadoutDamage = new Decimal(0);
    } else return;
  }
  const dungeon = content.dungeonById.get(id);
  let mods = modifiers;
  // A rare drop joins the collection and its cosmetic bonus counts at once: the fight stops
  // there and carries on with fresh modifiers, so any split of time deals the same damage.
  for (let resume = 0; left > EPSILON && resume <= MAX_FIGHT_EVENTS_PER_ADVANCE; resume++) {
    // Crits add their expected damage to every hit and signature attack.
    const dps = effectiveDamage(next, content, id, mods).mul(
      critFactor(critStats(content, mods, id)),
    );
    if (dps.lte(0)) return;
    const stats = burstStats(content, 'fighting', mods);
    if (!dungeon) {
      const trial = content.trialById.get(id);
      if (trial) fightTrial(next, content, trial, dps, stats, left, report, mods);
      return;
    }
    left = fightDungeon(next, content, dungeon, dps, stats, left, rng, report, mods);
    if (left > EPSILON) mods = collectModifiers(next, content);
  }
}

/**
 * The damage of a run of hits (`hits` normal hits of dps x interval plus `bursts` signature
 * attacks), listed on the report for the stage. Returns the total dealt.
 */
function recordPlayerHits(
  report: TickReport,
  target: string,
  dps: Decimal,
  stats: BurstStats,
  run: { hits: number; bursts: number },
): Decimal {
  const hit = hitDamage(dps, stats);
  const signature = signatureDamage(dps, stats);
  pushPlayerHit(report.playerHits, { target, damage: hit, hits: run.hits, signature: false });
  pushPlayerHit(report.playerHits, {
    target,
    damage: signature,
    hits: run.bursts,
    signature: true,
  });
  return hit.mul(run.hits).add(signature.mul(run.bursts));
}

/** Most knockouts handled in one advance (each costs knockoutSeconds, so this is generous). */
const MAX_KNOCKOUTS_PER_ADVANCE = 100_000;
/** Safety valve: never resolve more fight events (floor clears, knockouts) in one advance(). */
const MAX_FIGHT_EVENTS_PER_ADVANCE = 200_000;

/** The least time a fight event takes: a hit that is already due lands after this. */
const DUE_HIT_SECONDS = 1e-6;

/**
 * Seconds until the hits of a gauge have dealt `hp`, or null when the hits landing within
 * `maxSeconds` do not get there. Hits land one per interval, each `dps` x interval, with a
 * signature attack on every full gauge: the same damage `advanceGauge` and `recordPlayerHits`
 * give for that time.
 */
function secondsToDeal(
  gauge: BurstGauge,
  stats: BurstStats,
  dps: Decimal,
  hp: Decimal,
  maxSeconds: number,
): number | null {
  if (!(maxSeconds > 0)) return null;
  const hit = hitDamage(dps, stats);
  const signature = signatureDamage(dps, stats);
  const dealtBy = (hits: number): Decimal =>
    hit
      .mul(hits)
      .add(signature.mul(Math.floor((gauge.gauge + hits * stats.fill) / stats.size + EPSILON)));
  const most = Math.floor((gauge.timer + maxSeconds) / stats.interval + EPSILON);
  if (most < 1 || dealtBy(most).lt(hp)) return null;
  let low = 1;
  let high = most;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (dealtBy(mid).gte(hp)) high = mid;
    else low = mid + 1;
  }
  // A hit already due (the timer is at or past the interval, as after a change of lead card)
  // still takes a moment, so the fight always moves on.
  return Math.min(maxSeconds, Math.max(DUE_HIT_SECONDS, low * stats.interval - gauge.timer));
}

/**
 * A dungeon fight (DESIGN.md §6 Farming and Challenge). The loadout farms its floor on a loop, or
 * fights a Challenge of the next floor; the floor's enemies take our hits one at a time and the
 * floor hits back. Time is split at the events that change the fight:
 * - an enemy dies: with overflow off (DESIGN.md §6 Each enemy has its own HP) the hit stops at the
 *   kill and the next enemy stands at full HP; with it on the floor is one pool and the leftover
 *   carries on, while farming even into the floor started again;
 * - the floor is cleared: the loadout's health refills; farming starts the floor again; a
 *   Challenge is won (the best floor, the farming and the Victory);
 * - a stage reaches a new star level: its damage bonus applies from the next hit on;
 * - the health runs out: farming, the loadout is knocked out, drops a floor and sits out; in a
 *   Challenge, the Challenge is lost and farming goes on at full health;
 * - a Challenge's timer runs out: it is lost;
 * - auto-challenge (DESIGN.md §6 Auto-challenge) starts the next Challenge after every win and
 *   when the wait after a loss is over.
 *
 * Package 7 (the card duel) plugs in here: the health is one pool (`max`, `loadoutDamage`, the
 * floor's attacks through `lethalBossAttack` / `bossDamageBetween`); per-card health replaces those
 * reads with the team's cards (the first standing card takes each attack, the fight is lost when
 * all are out), and per-card attacks replace `baseDps` / `fightFor` with each card's own hits.
 * The events (kill, clear, loss, win) stay as they are.
 */
function fightDungeon(
  next: GameState,
  content: Content,
  dungeon: Dungeon,
  baseDps: Decimal,
  stats: BurstStats,
  seconds: number,
  rng: Rng,
  report: TickReport,
  modifiers: readonly Modifier[],
): number {
  /**
   * Fights `stage` for `t` seconds at `dps`: the hits that land, the card XP and the wages, both
   * grown by the stage's difficulty (DESIGN.md §6 Harder modes pay more). Returns the damage.
   */
  const fightFor = (
    t: number,
    dps: Decimal,
    stage: FightStage,
  ): { dealt: Decimal; hits: number; timer: number } => {
    const timer = next.bursts.fighting.timer;
    if (t <= EPSILON) return { dealt: new Decimal(0), hits: 0, timer };
    const run = advanceGauge(next.bursts.fighting, t, stats);
    next.bursts.fighting = run.gauge;
    report.bursts.fighting += run.bursts;
    // Damage lands in chunks: one hit per interval, held until it lands (DESIGN.md §6).
    const dealt = recordPlayerHits(report, dungeon.id, dps, stats, run);
    // Card XP for the time fought, never for a knockout (DESIGN.md §5).
    grantLoadoutXp(
      next,
      content,
      'fighting',
      fightingXpPerSecond(content, dungeon, modifiers).mul(t * stage.scale.xp),
    );
    // The wages: crystals (and, in the first dungeon, Money) for every second spent fighting,
    // so pulls do not grow with kill speed (DESIGN.md §3).
    for (const wage of drops.wages) {
      const paid = wage.perSecond.mul(t * stage.scale.wage);
      addResource(next, wage.resource, paid);
      report.currencies[wage.resource] = (report.currencies[wage.resource] ?? 0) + paid.toNumber();
    }
    return { dealt, hits: run.hits, timer };
  };
  const drops = effectiveDrops(dungeon, modifiers, content);
  const stages = new Map<string, FightStage>();
  const stageAt = (difficulty: Difficulty, floor: number): FightStage => {
    const key = `${difficulty}:${floor}`;
    let stage = stages.get(key);
    if (!stage) {
      stage = stageOf(content, dungeon, difficulty, floor, modifiers);
      stages.set(key, stage);
    }
    return stage;
  };
  const max = loadoutMaxHealth(next, content, modifiers, dungeon.id);
  const pattern = content.combat.bossPattern;
  const ko = content.combat.knockoutSeconds;
  const rareItem = dungeon.drops.rare.itemId;
  const raresAtStart = report.drops[rareItem] ?? 0;
  let left = seconds;
  let knockouts = 0;
  // The floor's attacks sit on the play-time clock (bossAttacks.ts): this fight is its last
  // `seconds`, so any split of time lands the same hits.
  let clock = next.stats.playTimeMs / 1000 - seconds;
  /** Attacks up to this number are settled (landed, or skipped by a knockout or a clear). */
  let settled = 0;
  /** Set when a kill came with the attack that empties the health: that attack still lands. */
  let pendingDone: number | null = null;

  /** Time passes: the span, the play-time clock, the Challenge's timer and the wait. */
  const pass = (t: number): void => {
    left -= t;
    clock += t;
    if (next.combat.challenge) next.combat.challenge.elapsedSeconds += t;
    countDownWait(next, t);
  };
  /** The floor was cleared `clears` times: health refills; a Challenge is won. */
  const onCleared = (stage: FightStage, clears: number): void => {
    // The loadout catches its breath between floors: its health refills (DESIGN.md §6).
    next.combat.loadoutDamage = new Decimal(0);
    report.floorsCleared += clears;
    if (!next.combat.challenge) return;
    // Victory (DESIGN.md §6 Farming and Challenge): the best floor rises and the farming moves
    // down to the floor won. Clearing (DESIGN.md §6): the Normal last-floor boss died. The last
    // floor of a tier also opens the next one (floors.ts `isDifficultyUnlocked`).
    const tier = ensureTier(next, dungeon);
    tier.best = Math.max(tier.best, stage.floor);
    tier.floor = stage.floor;
    next.combat.challenge = null;
    next.combat.challengeWaitSeconds = 0;
    freshFloor(next);
    report.challenges.push({
      dungeonId: dungeon.id,
      difficulty: stage.difficulty,
      floor: stage.floor,
      won: true,
      reason: null,
      enemyHpLeft: new Decimal(0),
    });
    if (stage.difficulty === 'normal' && stage.kind === 'boss') {
      markCleared(next, content, dungeon.id, report);
    }
  };
  /** The Challenge is lost: it says why and how much enemy HP was left; farming goes on. */
  const loseChallenge = (stage: FightStage, reason: 'timer' | 'health'): void => {
    report.challenges.push({
      dungeonId: dungeon.id,
      difficulty: stage.difficulty,
      floor: stage.floor,
      won: false,
      reason,
      enemyHpLeft: stageHpLeft(next, stage),
    });
    next.combat.challenge = null;
    freshFloor(next);
    next.combat.loadoutDamage = new Decimal(0);
    if (floorPosition(next, dungeon).autoChallenge) {
      next.combat.challengeWaitSeconds = content.combat.challenge.autoWaitSeconds;
    }
  };
  /** One enemy (overflow off) takes `dealt`: the hit stops at the kill. True on a floor clear. */
  const landOnEnemy = (stage: FightStage, dealt: Decimal): boolean => {
    const hp = enemyHpLeft(next, stage);
    if (dealt.lt(hp)) {
      if (dealt.gt(0)) next.bossHp = hp.sub(dealt);
      return false;
    }
    const index = enemyIndexOn(next, stage);
    const kills = stage.enemies.map((_, i) => (i === index ? 1 : 0));
    next.bossHp = null;
    next.combat.enemyIndex = index + 1;
    const cleared = index + 1 >= stage.enemies.length;
    if (cleared) freshFloor(next);
    killEnemies(next, content, stage, drops, kills, rng, report, modifiers);
    if (cleared) onCleared(stage, 1);
    return cleared;
  };
  /** The floor as one pool (overflow on) takes `dealt`. True on a floor clear. */
  const landOnPool = (stage: FightStage, dealt: Decimal, once: boolean): boolean => {
    const clears = damageFloor(next, content, stage, drops, dealt, once, rng, report, modifiers);
    if (clears > 0) onCleared(stage, clears);
    return clears > 0;
  };

  for (let event = 0; event < MAX_FIGHT_EVENTS_PER_ADVANCE; event++) {
    if (left <= EPSILON) return 0;
    // A rare drop changed the modifiers (its cosmetic): hand the rest of the span back.
    if ((report.drops[rareItem] ?? 0) > raresAtStart) return left;
    // A Challenge left behind (another dungeon or difficulty) is over.
    if (next.combat.challenge && !runningChallenge(next, content)) next.combat.challenge = null;
    const position = floorPosition(next, dungeon);
    // Auto-challenge: the next Challenge starts by itself once the wait is over.
    if (
      !next.combat.challenge &&
      position.autoChallenge &&
      position.challengeFloor !== null &&
      next.combat.challengeWaitSeconds <= 0
    ) {
      beginChallenge(next, dungeon.id, position.difficulty);
      pendingDone = null;
    }
    const run = runningChallenge(next, content);
    const stage = stageAt(position.difficulty, run ? run.floor : position.floor);
    const timerLeft = run ? challengeSeconds(content, stage.kind) - run.elapsedSeconds : Infinity;
    if (run && timerLeft <= EPSILON) {
      loseChallenge(stage, 'timer');
      pendingDone = null;
      continue;
    }
    const waitLeft =
      !run && position.autoChallenge && position.challengeFloor !== null
        ? next.combat.challengeWaitSeconds
        : Infinity;
    const horizon = Math.min(left, timerLeft, waitLeft);
    // The stage's star levels add their damage there; overflow decides whether a kill's leftover
    // damage carries on (DESIGN.md §6 Stage stars, Overflow).
    const dps = baseDps.mul(
      stageDamageFactor(next, content, dungeon, stage.difficulty, stage.floor, modifiers),
    );
    const overflow = overflowActive(next, content, dungeon, stage.difficulty, stage.floor);
    const interval = stage.intervalSeconds;
    const normal = stage.attack;
    const attacked = max.gt(0) && normal.gt(0);
    const done = pendingDone ?? Math.max(settled, bossAttacksBy(clock, interval));
    pendingDone = null;
    const last = bossAttacksBy(clock + horizon, interval);
    const pool = Decimal.max(max.sub(next.combat.loadoutDamage), 0);
    const lethal = attacked ? lethalBossAttack(pool, normal, done, pattern) : Infinity;
    const falls = lethal <= last;
    const untilDown = falls ? Math.min(horizon, Math.max(0, lethal * interval - clock)) : horizon;

    // Farming in bulk: nothing can change for the rest of the span but the kills, so it is
    // resolved in one go, up to the kill that gives the stage its next star level. Either nothing
    // hits back (no health to lose, or a floor that deals no damage) and the kills follow from the
    // damage alone, or every hit kills and the attacks between two floor clears cannot empty a
    // full pool. With overflow off that is every hit killing the floor's strongest enemy (one
    // kill a hit); with it on, every hit clearing the floor, or the damage alone without attacks.
    const hit = hitDamage(dps, stats);
    const size = stage.enemies.length;
    const strongest = stage.enemies.reduce((m, e) => Decimal.max(m, e.hp), new Decimal(0));
    const holds = (hitsPerClear: number): boolean => {
      if (!attacked) return true;
      const perHit = Math.ceil((hitsPerClear * stats.interval) / interval) + 1;
      const worst = normal.mul(
        perHit * pattern.lightMultiplier +
          Math.ceil(perHit / pattern.attacksPerCycle) * pattern.slamMultiplier,
      );
      return next.combat.loadoutDamage.add(worst).lt(max);
    };
    const bulk =
      !run &&
      (overflow ? !attacked || (hit.gte(stage.hp) && holds(1)) : hit.gte(strongest) && holds(size));
    if (bulk) {
      let span = horizon;
      const need = killsToNextStar(next, content, stage);
      if (need !== null) {
        // With overflow off each hit is one kill; with it on the kills follow the damage.
        const at = overflow
          ? secondsToDeal(
              next.bursts.fighting,
              stats,
              dps,
              stageHpLeft(next, stage).add(stage.hp.mul(need - 1)),
              horizon,
            )
          : Math.max(DUE_HIT_SECONDS, need * stats.interval - next.bursts.fighting.timer);
        if (at !== null && at < span) span = at;
      }
      const end = bossAttacksBy(clock + span, interval);
      const fought = fightFor(span, dps, stage);
      let clears = 0;
      /** Hits from the start of the span to the last floor clear. */
      let toLastClear = 0;
      if (overflow) {
        clears = damageFloor(
          next,
          content,
          stage,
          drops,
          fought.dealt,
          false,
          rng,
          report,
          modifiers,
        );
        toLastClear = clears > 0 ? fought.hits : 0;
      } else if (fought.hits > 0) {
        // One kill a hit, in the wave's order, round and round the floor.
        const from = enemyIndexOn(next, stage);
        const to = from + fought.hits;
        const upTo = (x: number, j: number): number =>
          Math.max(0, Math.floor((x - j + size - 1) / size));
        const kills = stage.enemies.map((_, j) => upTo(to, j) - upTo(from, j));
        clears = Math.floor(to / size);
        toLastClear = clears * size - from;
        next.combat.enemyIndex = to % size;
        next.bossHp = null;
        killEnemies(next, content, stage, drops, kills, rng, report, modifiers);
      }
      if (clears > 0) onCleared(stage, clears);
      if (attacked) {
        recordBossAttacks(report, dungeon.id, done, end, normal, interval, pattern, false);
        // Each clear refilled the pool: only the attacks since the last one are still on it.
        const since =
          clears > 0
            ? Math.max(
                done,
                bossAttacksBy(clock + toLastClear * stats.interval - fought.timer, interval),
              )
            : done;
        const taken = bossDamageBetween(since, end, normal, pattern);
        next.combat.loadoutDamage = clears > 0 ? taken : next.combat.loadoutDamage.add(taken);
      }
      settled = Math.max(done, end);
      pass(span);
      continue;
    }

    // The next kill, when it comes before the health runs out (or the timer, or the wait).
    const target = overflow ? stageHpLeft(next, stage) : enemyHpLeft(next, stage);
    const toKill = secondsToDeal(next.bursts.fighting, stats, dps, target, untilDown);
    if (toKill !== null) {
      const fought = fightFor(toKill, dps, stage);
      const at = bossAttacksBy(clock + toKill, interval);
      // An attack that lands with the kill does not empty the health first.
      const landed = Math.min(at, lethal - 1);
      if (attacked) {
        recordBossAttacks(report, dungeon.id, done, landed, normal, interval, pattern, false);
        next.combat.loadoutDamage = next.combat.loadoutDamage.add(
          bossDamageBetween(done, landed, normal, pattern),
        );
      }
      pass(toKill);
      const cleared = overflow
        ? landOnPool(stage, fought.dealt, !!run)
        : landOnEnemy(stage, fought.dealt);
      // A clear refills the health, so the attack that came with it is spent; after a kill that
      // leaves the floor standing it still lands.
      settled = cleared ? Math.max(landed, at) : landed;
      if (!cleared && landed < at) pendingDone = landed;
      continue;
    }
    // No kill before the horizon or the knockout: the damage stays on the enemy.
    const fought = fightFor(untilDown, dps, stage);
    if (overflow) landOnPool(stage, fought.dealt, !!run);
    else landOnEnemy(stage, fought.dealt);
    pass(untilDown);
    if (!falls) {
      if (attacked) {
        next.combat.loadoutDamage = next.combat.loadoutDamage.add(
          bossDamageBetween(done, last, normal, pattern),
        );
        recordBossAttacks(report, dungeon.id, done, last, normal, interval, pattern, false);
      }
      settled = Math.max(done, last);
      continue;
    }
    // The health runs dry on the attack that lands at `lethal`.
    recordBossAttacks(report, dungeon.id, done, lethal, normal, interval, pattern, true);
    settled = lethal;
    if (run) {
      // A Challenge is lost; farming goes on at full health (DESIGN.md §6 Farming and Challenge).
      loseChallenge(stage, 'health');
      continue;
    }
    // Knocked out while farming: the floor heals, the farming drops a floor and the loadout sits
    // out; hits during it do not land (DESIGN.md §6).
    freshFloor(next);
    ensureTier(next, dungeon).floor = Math.max(1, position.floor - 1);
    report.knockouts++;
    knockouts++;
    const wait = Math.min(left, ko);
    pass(wait);
    settled = Math.max(lethal, bossAttacksBy(clock, interval));
    if (wait + EPSILON < ko || knockouts >= MAX_KNOCKOUTS_PER_ADVANCE) {
      next.combat.knockoutSeconds = ko - wait;
      next.combat.loadoutDamage = max;
      return 0;
    }
    next.combat.loadoutDamage = new Decimal(0);
  }
  return 0;
}

function addResource(state: GameState, resource: string, amount: Decimal | number): void {
  state.resources[resource] = (state.resources[resource] ?? new Decimal(0)).add(amount);
}

/** Records a first clear and what it unlocks. */
function markCleared(next: GameState, content: Content, id: string, report: TickReport): void {
  if (isDungeonCleared(next, id)) return;
  const dungeon = content.dungeonById.get(id);
  if (dungeon) {
    const result = clearDungeon(next, content, id);
    next.clearedDungeons = result.state.clearedDungeons;
    report.unlockedMines.push(...result.unlockedMines);
    // The first-clear purse (DESIGN.md §3).
    for (const purse of dungeon.drops.firstClear) {
      addResource(next, purse.resource, purse.amount);
      report.currencies[purse.resource] =
        (report.currencies[purse.resource] ?? 0) + purse.amount.toNumber();
    }
  } else {
    next.clearedDungeons.push(id);
  }
  report.cleared.push(id);
  for (const entry of [...content.dungeons, ...content.trials]) {
    if (entry.unlockedBy === id) report.unlockedDungeons.push(entry.id);
  }
}

/**
 * Kills still needed on the floor's stage for its next star level; null on a wave floor, a depth
 * or a stage at the top level.
 */
function killsToNextStar(state: GameState, content: Content, stage: FightStage): number | null {
  if (!isStageFloor(content, stage.dungeon, stage.difficulty, stage.floor)) return null;
  const key = stageKey(stage.dungeon.id, stage.difficulty, stage.floor);
  const info = stageStars(state, content, key);
  if (!info || info.nextKills === null) return null;
  return Math.max(1, info.nextKills - info.kills);
}

/**
 * Lands `dealt` damage on the floor being fought as one pool, as it is where the overflow switch
 * is on (DESIGN.md §6 Overflow): the enemies it kills drop their loot and the leftover of a kill
 * carries into the next enemy. Returns how often the floor was cleared. With `once` (a Challenge)
 * the first clear ends the fight and the damage past it is lost; farming, the floor starts again
 * as often as the damage clears it and what is left stays on the fresh floor. The caller handles
 * what a clear does (health, Victory).
 */
function damageFloor(
  state: GameState,
  content: Content,
  stage: FightStage,
  drops: DropTable,
  dealt: Decimal,
  once: boolean,
  rng: Rng,
  report: TickReport,
  modifiers: readonly Modifier[],
): number {
  if (dealt.lte(0)) return 0;
  const total = stage.hp;
  const hp = stageHpLeft(state, stage);
  const before = total.sub(hp);
  const kills = stage.enemies.map(() => 0);
  if (dealt.lt(hp)) {
    const after = before.add(dealt);
    stage.enemies.forEach((e, i) => {
      if (e.upto.gt(before) && e.upto.lte(after)) kills[i] = 1;
    });
    setStageHpLeft(state, stage, hp.sub(dealt));
    killEnemies(state, content, stage, drops, kills, rng, report, modifiers);
    return 0;
  }
  // The floor is cleared at least once: every enemy still standing dies.
  stage.enemies.forEach((e, i) => {
    if (e.upto.gt(before)) kills[i] = 1;
  });
  let clears = 1;
  if (once) {
    freshFloor(state);
  } else {
    // Farming: damage left over carries into the floor as it starts again.
    let overflow = dealt.sub(hp);
    const extra = Decimal.min(overflow.div(total).floor(), MAX_KILLS_PER_ADVANCE - 1).toNumber();
    clears += extra;
    overflow = clears >= MAX_KILLS_PER_ADVANCE ? new Decimal(0) : overflow.sub(total.mul(extra));
    stage.enemies.forEach((e, i) => {
      kills[i]! += extra;
      // What is left is below the floor's HP, so the last enemy always stands.
      if (i < stage.enemies.length - 1 && e.upto.lte(overflow)) kills[i]! += 1;
    });
    setStageHpLeft(state, stage, total.sub(overflow));
  }
  killEnemies(state, content, stage, drops, kills, rng, report, modifiers);
  return clears;
}

/**
 * A dungeon's drop table on a difficulty (DESIGN.md §6 Difficulty tiers): Money purses times the
 * difficulty's purse, material units times its material. Normal is the table itself.
 */
export function difficultyDrops(drops: DropTable, scale: DifficultyScale): DropTable {
  if (scale.purse === 1 && scale.material === 1) return drops;
  return {
    ...drops,
    currencies: drops.currencies.map((currency) => ({
      ...currency,
      multiplier: (currency.multiplier ?? 1) * scale.purse,
    })),
    material: { ...drops.material, amount: drops.material.amount * scale.material },
    extraMaterials: drops.extraMaterials.map((extra) => ({
      ...extra,
      min: extra.min * scale.material,
      max: extra.max * scale.material,
    })),
  };
}

/**
 * Pays what the enemies killed drop. `kills[i]` is how often `stage.enemies[i]` died. The boss
 * rolls the dungeon's whole table (rare item with pity included); a normal enemy or mini-boss
 * rolls the same table scaled by its share of the boss's HP, without the rare item.
 */
function killEnemies(
  state: GameState,
  content: Content,
  stage: FightStage,
  drops: DropTable,
  kills: readonly number[],
  rng: Rng,
  report: TickReport,
  modifiers: readonly Modifier[],
): void {
  const { dungeon } = stage;
  const bossId = dungeon.boss.id;
  drops = stageLoot(
    difficultyDrops(drops, stage.scale),
    stageLootFactor(state, content, dungeon, stage.difficulty, stage.floor, modifiers),
  );
  let pity = state.pity[bossId] ?? 0;
  const purse = drops.currencies.map(() => 0);
  const extras = drops.extraMaterials.map(() => 0);
  let rares = 0;
  let material = 0;
  let bossFloorKills = 0;
  let enemyKills = 0;
  /** Kills as shares of a boss kill, for the XP. */
  let worth = 0;
  stage.enemies.forEach((enemy, e) => {
    const count = kills[e] ?? 0;
    if (count <= 0) return;
    worth += enemy.dropScale * count;
    if (enemy.kind === 'enemy') enemyKills += count;
    else bossFloorKills += count;
    if (enemy.kind !== 'boss') {
      const roll = rollEnemyDrops(drops, enemy.dropScale, count, rng, enemy.purseScale);
      roll.currencies.forEach((units, j) => (purse[j]! += units));
      material += roll.material;
      roll.extraMaterials.forEach((units, j) => (extras[j]! += units));
      return;
    }
    // The boss's purse grows with the floor it stands on (DESIGN.md §6 Deeper pays more).
    const table =
      enemy.purseScale === 1
        ? drops
        : {
            ...drops,
            currencies: drops.currencies.map((currency) => ({
              ...currency,
              multiplier: (currency.multiplier ?? 1) * enemy.purseScale,
            })),
          };
    for (let i = 0; i < count; i++) {
      const roll = rollBossDrop(table, pity, rng);
      pity = roll.pity;
      roll.currencies.forEach((units, j) => (purse[j]! += units));
      if (roll.rare) rares++;
      material += rollMaterialDrop(drops, rng);
      drops.extraMaterials.forEach((extra, j) => {
        if (extra.chance < 1 && rng() >= extra.chance) return;
        extras[j]! += extra.min + Math.floor(rng() * (extra.max - extra.min + 1));
      });
    }
  });
  if (worth <= 0) return;

  state.pity[bossId] = pity;
  state.stats.bossKills += bossFloorKills;
  report.bossKills += bossFloorKills;
  report.enemyKills += enemyKills;
  // Stage stars (DESIGN.md §6): a mini-boss or last-floor boss kill counts on its stage, and each
  // star level reached pays its chest once.
  if (bossFloorKills > 0 && isStageFloor(content, dungeon, stage.difficulty, stage.floor)) {
    const key = stageKey(dungeon.id, stage.difficulty, stage.floor);
    state.combat.stageKills[key] = (state.combat.stageKills[key] ?? 0) + bossFloorKills;
    payStageChests(state, content, key, report);
  }
  drops.currencies.forEach((currency, j) => {
    const units = purse[j]!;
    if (units <= 0) return;
    addResource(state, currency.resource, units);
    report.currencies[currency.resource] = (report.currencies[currency.resource] ?? 0) + units;
  });
  if (material > 0) {
    const id = drops.material.resource;
    addResource(state, id, material);
    report.materials[id] = (report.materials[id] ?? 0) + material;
  }
  drops.extraMaterials.forEach((extra, j) => {
    const units = extras[j]!;
    if (units <= 0) return;
    addResource(state, extra.resource, units);
    report.materials[extra.resource] = (report.materials[extra.resource] ?? 0) + units;
  });
  if (rares > 0) {
    const item = dungeon.drops.rare.itemId;
    state.inventory[item] = (state.inventory[item] ?? 0) + rares;
    report.drops[item] = (report.drops[item] ?? 0) + rares;
    // The rare item joins the collection: a cosmetic in the wardrobe (copies feed its levels).
    if (content.cosmeticById.has(item)) {
      for (let i = 0; i < rares; i++) grantCosmetic(state, item);
    }
  }
  // Account and card XP per kill, a normal enemy worth its share of a boss kill.
  grantAccountXp(state, content, killXp(content, dungeon.tier).mul(worth), modifiers, 'fighting');
  grantLoadoutXp(
    state,
    content,
    'fighting',
    fightingXpPerKill(content, dungeon, modifiers).mul(worth * stage.scale.xp),
  );
}

/**
 * A drop table with a stage's star loot (DESIGN.md §6 Stage stars): Money purses and the chances
 * of every material drop grown by `factor` (chances stay at most 1).
 */
export function stageLoot(drops: DropTable, factor: number): DropTable {
  if (factor === 1) return drops;
  const chance = (c: number): number => Math.min(1, c * factor);
  return {
    ...drops,
    currencies: drops.currencies.map((currency) => ({
      ...currency,
      multiplier: (currency.multiplier ?? 1) * factor,
    })),
    material: { ...drops.material, chance: chance(drops.material.chance) },
    extraMaterials: drops.extraMaterials.map((extra) => ({
      ...extra,
      chance: chance(extra.chance),
    })),
  };
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
    dealt = dealt.add(recordPlayerHits(report, trial.id, dps, stats, run));
    // Card XP for the time fought (DESIGN.md §5), at the tier 1 rate.
    grantLoadoutXp(
      state,
      content,
      'fighting',
      fightingXpPerSecond(content, trial, modifiers).mul(step),
    );
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
  if (attempts > 0) {
    const xp = content.account.xp.perTrialAttempt.mul(attempts);
    grantAccountXp(state, content, xp, modifiers, 'fighting');
  }
  state.combat.trialAttempt = { elapsedSeconds, dealt };
}
