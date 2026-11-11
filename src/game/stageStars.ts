import type { Content, Dungeon } from '../data';
import { Decimal } from './num';
import {
  floorCount,
  isStageFloor,
  isStarDifficulty,
  overflowStage,
  parseStageKey,
  stageFloors,
  stageKey,
  STAR_DIFFICULTIES,
  type StageRef,
  type StarDifficulty,
} from './floors';
import type { Price } from './production';
import type { TickReport } from './report';
import { cloneState, type Difficulty, type GameState } from './state';

/**
 * Stage stars and overflow (DESIGN.md §6). Every mini-boss floor and last-floor boss of Normal,
 * Hard and Nightmare is a stage. Kills there count toward six star levels (Wood .. Mythic, at the
 * kill counts of `combat.json` `stageStars`). Each level pays a one-time chest (crystals, star dust
 * from Gold up), adds damage and loot on that stage, and counts toward skill points (§10). From
 * Silver a stage's overflow switch can be turned on: leftover damage from a kill then carries on
 * instead of being lost. Star levels are derived from the kills, never saved.
 *
 * Pure apart from `payStageChests`, which mutates a state being built by `advance`.
 */

/** The star level `kills` reach on a stage, 0 (none) .. 6 (Mythic). */
export function starLevelForKills(content: Content, kills: number): number {
  let level = 0;
  for (const needed of content.combat.stageStars.kills) if (kills >= needed) level++;
  return level;
}

/** The stage a key names, when it is a stage of a dungeon in the game; null otherwise. */
export function stageRef(
  content: Content,
  key: string,
): (StageRef & { difficulty: StarDifficulty; dungeon: Dungeon }) | null {
  const ref = parseStageKey(key);
  if (!ref || !isStarDifficulty(ref.difficulty)) return null;
  const dungeon = content.dungeonById.get(ref.dungeonId);
  if (!dungeon || !isStageFloor(content, dungeon, ref.difficulty, ref.floor)) return null;
  return { ...ref, difficulty: ref.difficulty, dungeon };
}

/** Kills on a stage, ever. */
export function stageKills(state: GameState, key: string): number {
  return state.combat.stageKills[key] ?? 0;
}

/** A stage's star level, 0..6; 0 for anything that is not a stage. */
export function stageStarLevel(state: GameState, content: Content, key: string): number {
  if (!stageRef(content, key)) return 0;
  return starLevelForKills(content, stageKills(state, key));
}

/** Every star level of every stage added up (an input to skill points, DESIGN.md §10). */
export function totalStageStarLevels(state: GameState, content: Content): number {
  let total = 0;
  for (const key of Object.keys(state.combat.stageKills)) {
    total += stageStarLevel(state, content, key);
  }
  return total;
}

/** A stage's stars as the Dungeons page shows them. */
export interface StageStarInfo {
  key: string;
  dungeonId: string;
  difficulty: StarDifficulty;
  floor: number;
  kills: number;
  /** Star level 0..6. */
  level: number;
  /** Kills that reach the next level, or null at the top. */
  nextKills: number | null;
  /** Star levels whose chest is paid. */
  chestsPaid: number;
  /** The overflow switch can be turned on (the stage reached Silver). */
  overflowUnlocked: boolean;
  /** The switch is on. */
  overflowOn: boolean;
}

/** A stage's stars; null for a key that is not a stage. */
export function stageStars(state: GameState, content: Content, key: string): StageStarInfo | null {
  const ref = stageRef(content, key);
  if (!ref) return null;
  const config = content.combat.stageStars;
  const kills = stageKills(state, key);
  const level = starLevelForKills(content, kills);
  const unlocked = level >= config.overflowFromLevel;
  return {
    key,
    dungeonId: ref.dungeonId,
    difficulty: ref.difficulty,
    floor: ref.floor,
    kills,
    level,
    nextKills: config.kills[level] ?? null,
    chestsPaid: Math.min(level, state.combat.stageChests[key] ?? 0),
    overflowUnlocked: unlocked,
    overflowOn: unlocked && state.combat.overflow[key] === true,
  };
}

/** The star level of a floor as the fight sees it (0 for a wave floor or a depth). */
function floorStarLevel(
  state: GameState,
  content: Content,
  dungeon: Dungeon,
  difficulty: Difficulty,
  floor: number,
): number {
  if (!isStageFloor(content, dungeon, difficulty, floor)) return 0;
  return starLevelForKills(content, stageKills(state, stageKey(dungeon.id, difficulty, floor)));
}

/** What a stage's star levels multiply our damage by there: +5% a level (1 off a stage). */
export function stageDamageFactor(
  state: GameState,
  content: Content,
  dungeon: Dungeon,
  difficulty: Difficulty,
  floor: number,
): number {
  const level = floorStarLevel(state, content, dungeon, difficulty, floor);
  return 1 + level * content.combat.stageStars.damagePerLevel;
}

/** What a stage's star levels multiply its loot by (Money purses, material chances). */
export function stageLootFactor(
  state: GameState,
  content: Content,
  dungeon: Dungeon,
  difficulty: Difficulty,
  floor: number,
): number {
  const level = floorStarLevel(state, content, dungeon, difficulty, floor);
  return 1 + level * content.combat.stageStars.lootPerLevel;
}

/**
 * Whether leftover damage carries on from a kill on this floor (DESIGN.md §6 Overflow): the
 * switch of the floor's stage (a wave floor follows the next stage below it, a depth the
 * Nightmare boss) is on and that stage has reached Silver.
 */
export function overflowActive(
  state: GameState,
  content: Content,
  dungeon: Dungeon,
  difficulty: Difficulty,
  floor: number,
): boolean {
  const ref = overflowStage(content, dungeon, difficulty, floor);
  const key = stageKey(ref.dungeonId, ref.difficulty, ref.floor);
  return stageStars(state, content, key)?.overflowOn ?? false;
}

export type OverflowResult =
  | { ok: true; state: GameState }
  /** `unknown`: not a stage; `locked`: the stage has not reached Silver yet. */
  | { ok: false; reason: 'unknown' | 'locked' };

/** Turns a stage's overflow switch on or off. Turning it on needs Silver on that stage. */
export function setOverflow(
  state: GameState,
  content: Content,
  key: string,
  on: boolean,
): OverflowResult {
  const info = stageStars(state, content, key);
  if (!info) return { ok: false, reason: 'unknown' };
  if (on && !info.overflowUnlocked) return { ok: false, reason: 'locked' };
  if ((state.combat.overflow[key] === true) === on) return { ok: true, state };
  const next = cloneState(state);
  if (on) next.combat.overflow[key] = true;
  else delete next.combat.overflow[key];
  return { ok: true, state: next };
}

/** What the chest of one star level (1..6) pays on a difficulty. */
export function stageChest(content: Content, difficulty: StarDifficulty, level: number): Price[] {
  const chests = content.combat.stageStars.chests;
  const factor = chests.difficulty[difficulty];
  const out: Price[] = [];
  for (const reward of chests.rewards) {
    const amount = (reward.amounts[level - 1] ?? new Decimal(0)).mul(factor).floor();
    if (amount.gt(0)) out.push({ resource: reward.resource, amount });
  }
  return out;
}

/**
 * Pays the chests of every star level a stage has reached and not been paid for (mutates `state`,
 * a fresh clone owned by `advance`). A save from before the stars reaches its levels with its old
 * boss kills and is paid with its next kill on that stage.
 */
export function payStageChests(
  state: GameState,
  content: Content,
  key: string,
  report: TickReport,
): void {
  const info = stageStars(state, content, key);
  if (!info || info.level <= info.chestsPaid) return;
  for (let level = info.chestsPaid + 1; level <= info.level; level++) {
    for (const { resource, amount } of stageChest(content, info.difficulty, level)) {
      state.resources[resource] = (state.resources[resource] ?? new Decimal(0)).add(amount);
      const kind = content.resourceById.get(resource)?.kind;
      const into = kind === 'material' ? report.materials : report.currencies;
      into[resource] = (into[resource] ?? 0) + amount.toNumber();
    }
  }
  state.combat.stageChests[key] = info.level;
}

/** One stage on the stage map. */
export interface StageMapStage extends StageStarInfo {
  /** The dungeon's last-floor boss, or a mini-boss. */
  kind: 'miniboss' | 'boss';
}

/** One dungeon on the stage map: its stages on each star difficulty. */
export interface StageMapDungeon {
  dungeon: Dungeon;
  tiers: { difficulty: StarDifficulty; stages: StageMapStage[] }[];
  /** Star levels earned in this dungeon, and the most it can have. */
  levels: number;
  maxLevels: number;
}

/** The stage map (DESIGN.md §6 Stage stars): every dungeon by tier by stage, with its stars. */
export function stageMap(state: GameState, content: Content): StageMapDungeon[] {
  const top = content.combat.stageStars.kills.length;
  return content.dungeons.map((dungeon) => {
    const floors = stageFloors(content, dungeon);
    let levels = 0;
    const tiers = STAR_DIFFICULTIES.map((difficulty) => ({
      difficulty,
      stages: floors.map((floor): StageMapStage => {
        const info = stageStars(state, content, stageKey(dungeon.id, difficulty, floor))!;
        levels += info.level;
        const kind = floor >= floorCount(dungeon, difficulty) ? 'boss' : 'miniboss';
        return { ...info, kind };
      }),
    }));
    return { dungeon, tiers, levels, maxLevels: floors.length * STAR_DIFFICULTIES.length * top };
  });
}

/** The name of each star level, 0 (none) .. 6, on the weapon ladder. */
export const STAGE_STAR_NAMES = [
  'None',
  'Wood',
  'Bronze',
  'Silver',
  'Gold',
  'Prismatic',
  'Mythic',
] as const;
