import type { Content, Dungeon } from '../data';
import { Decimal } from './num';
import {
  DIFFICULTIES,
  type Difficulty,
  type DungeonProgress,
  type FloorMode,
  type GameState,
  type TierProgress,
} from './state';

/**
 * Dungeon floors (DESIGN.md §6 Dungeon floors, Normal enemies, Difficulty tiers, Endless depths):
 * what stands on each floor of a dungeon, before Ascension growth and modifiers, and where the
 * player is in each dungeon.
 *
 * A dungeon is a stack of floors. A normal floor is a wave of 3 to 5 of the dungeon's normal
 * enemies, every 10th floor holds a mini-boss and the last floor holds the dungeon's boss. A
 * floor's strength is measured against the boss (`combat.json` `floors`): floor `f` of `n` is
 * worth `hpGrowth^(f - n)` of the boss's HP and attack, so the ladder is steady and ends on the
 * boss as it is in `dungeons.json`.
 *
 * Every dungeon has three difficulty tiers with their own floors: Normal, then Hard and
 * Nightmare, which multiply every enemy and every drop (`combat.json` `difficulties`). Beating a
 * tier's last-floor boss unlocks the next one, and beating Nightmare unlocks the dungeon's
 * endless depths: floors without end below the Nightmare boss, each `hpGrowth` above the one
 * before, with a mini-boss on every 10th.
 *
 * Pure: no state is changed here. The fight itself is in combat.ts.
 */

/** What a floor holds. */
export type FloorKind = 'wave' | 'miniboss' | 'boss';

/** One enemy of a floor, before Ascension growth and modifiers. */
export interface FloorEnemy {
  /** The enemy's id (`dungeons.json`): one of the dungeon's enemies, or its boss. */
  id: string;
  name: string;
  kind: 'enemy' | 'miniboss' | 'boss';
  hp: Decimal;
  /** Its share of the boss's drops, XP and purse on this difficulty: its HP over the HP of the
   *  difficulty's boss. The boss is 1; an endless depth grows past it. */
  dropScale: number;
  /** The HP is shown as this many stacked bars. */
  hpBars: number;
}

/** What a difficulty multiplies on top of Normal. */
export interface DifficultyScale {
  hp: number;
  attack: number;
  /** Money purses. */
  purse: number;
  /** Units of every material drop. */
  material: number;
}

/** A floor of a dungeon, before Ascension growth and modifiers. */
export interface FloorSpec {
  kind: FloorKind;
  difficulty: Difficulty;
  floor: number;
  /** The enemies in the order our damage reaches them. */
  enemies: FloorEnemy[];
  /** The HP of all of them together. */
  hp: Decimal;
  /** Damage of one normal attack of the floor (the wave attacks as one), before defence. */
  attack: Decimal;
  /** Seconds between its attacks. */
  intervalSeconds: number;
  /** What the difficulty multiplies the drops by. */
  scale: DifficultyScale;
}

/** A dungeon's progress as a new game has it: Normal, pushing, on floor 1, nothing beaten. */
export function initialProgress(): DungeonProgress {
  return { difficulty: 'normal', mode: 'push', tiers: {} };
}

/** How many floors a dungeon has on a difficulty; the endless depths have no last floor. */
export function floorCount(dungeon: Dungeon, difficulty: Difficulty = 'normal'): number {
  return difficulty === 'endless' ? Infinity : dungeon.floors;
}

/** What a difficulty multiplies on top of Normal; the endless depths start from Nightmare's. */
export function difficultyScale(content: Content, difficulty: Difficulty): DifficultyScale {
  if (difficulty === 'normal') return { hp: 1, attack: 1, purse: 1, material: 1 };
  return content.combat.difficulties[difficulty === 'hard' ? 'hard' : 'nightmare'];
}

/** The saved progress of a dungeon (a fresh one when it was never fought). Not a copy to change. */
export function dungeonProgress(state: GameState, dungeonId: string): DungeonProgress {
  return state.combat.floors[dungeonId] ?? initialProgress();
}

/** Where the player stands in a dungeon. */
export interface FloorPosition {
  difficulty: Difficulty;
  mode: FloorMode;
  /** The floor being fought, 1 to the floor count (the depth, in the endless depths). */
  floor: number;
  /** The deepest floor beaten on this difficulty (0 = none). Kept through Ascension. */
  best: number;
  /** Floors on this difficulty; Infinity in the endless depths. */
  floors: number;
}

const clampFloor = (floor: number, floors: number): number =>
  Math.min(floors, Math.max(1, Math.floor(floor) || 1));

/**
 * The player's position on a dungeon's chosen difficulty (or on `difficulty` when given), with
 * the floor inside its range.
 */
export function floorPosition(
  state: GameState,
  dungeon: Dungeon,
  difficulty?: Difficulty,
): FloorPosition {
  const progress = dungeonProgress(state, dungeon.id);
  const at = difficulty ?? progress.difficulty;
  const tier: TierProgress = progress.tiers[at] ?? { floor: 1, best: 0 };
  const floors = floorCount(dungeon, at);
  return {
    difficulty: at,
    mode: progress.mode,
    floor: clampFloor(tier.floor, floors),
    best: Math.max(0, Math.floor(tier.best) || 0),
    floors,
  };
}

/**
 * Whether a difficulty of a dungeon is open (DESIGN.md §6 Difficulty tiers): Normal always is,
 * and each of the others once the last-floor boss of the one before it has been beaten. Whether
 * the dungeon itself is unlocked is `isDungeonUnlocked`.
 */
export function isDifficultyUnlocked(
  state: GameState,
  dungeon: Dungeon,
  difficulty: Difficulty,
): boolean {
  const index = DIFFICULTIES.indexOf(difficulty);
  if (index <= 0) return index === 0;
  const before = DIFFICULTIES[index - 1]!;
  return floorPosition(state, dungeon, before).best >= floorCount(dungeon, before);
}

/** The difficulties of a dungeon that are open, in order. */
export function unlockedDifficulties(state: GameState, dungeon: Dungeon): Difficulty[] {
  return DIFFICULTIES.filter((d) => isDifficultyUnlocked(state, dungeon, d));
}

/** Whether a deeper floor exists below this one (push has somewhere to go). */
export function hasDeeperFloor(position: Pick<FloorPosition, 'floor' | 'floors'>): boolean {
  return position.floor < position.floors;
}

/** The floor an Ascension starts a dungeon tier on: half of the best floor, at least floor 1. */
export function ascensionStartFloor(best: number): number {
  return Math.max(1, Math.floor(best / 2));
}

/**
 * What kind of floor `floor` is: the last one holds the boss, every 10th a mini-boss. The
 * endless depths have no boss.
 */
export function floorKind(
  content: Content,
  dungeon: Dungeon,
  floor: number,
  difficulty: Difficulty = 'normal',
): FloorKind {
  if (floor >= floorCount(dungeon, difficulty)) return 'boss';
  return floor % content.combat.floors.miniBossEvery === 0 ? 'miniboss' : 'wave';
}

/** A small deterministic mix of two integers, so a floor always holds the same wave. */
function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

const seedOf = (id: string): number => {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (Math.imul(seed, 31) + id.charCodeAt(i)) | 0;
  return seed;
};

/**
 * The floor's worth against the boss of its difficulty, as a multiple of that boss's HP and
 * attack: `hpGrowth^(floor - floors)`, so the last floor is exactly the boss. An endless depth
 * `d` is `hpGrowth^d`: the first depth is one step above the Nightmare boss.
 */
export function floorScale(
  content: Content,
  dungeon: Dungeon,
  floor: number,
  difficulty: Difficulty = 'normal',
): number {
  const from = difficulty === 'endless' ? 0 : floorCount(dungeon, difficulty);
  return Math.pow(content.combat.floors.hpGrowth, floor - from);
}

/** Past this an endless depth's worth no longer fits a plain number. */
const MAX_PLAIN_SCALE = 1e300;

/**
 * `floorScale` as a Decimal, so an endless depth too deep for a plain number still has an HP
 * (DESIGN.md §6 Endless depths: the floors keep going forever).
 */
function floorScaleDecimal(
  content: Content,
  dungeon: Dungeon,
  floor: number,
  difficulty: Difficulty,
): Decimal {
  const scale = floorScale(content, dungeon, floor, difficulty);
  if (scale < MAX_PLAIN_SCALE) return new Decimal(scale);
  const from = difficulty === 'endless' ? 0 : floorCount(dungeon, difficulty);
  return Decimal.pow(content.combat.floors.hpGrowth, floor - from);
}

/**
 * What stands on a floor of a dungeon, before Ascension growth and modifiers. The same floor
 * always holds the same wave (its size and enemy types come from the dungeon, difficulty and
 * floor alone), so nothing about it needs saving.
 */
export function floorSpec(
  content: Content,
  dungeon: Dungeon,
  difficulty: Difficulty,
  floor: number,
): FloorSpec {
  const config = content.combat.floors;
  const kind = floorKind(content, dungeon, floor, difficulty);
  // The floor's worth against the boss: a plain number for the drops (it stops growing where
  // plain numbers end), a Decimal for the HP and attack.
  const scale = Math.min(floorScale(content, dungeon, floor, difficulty), MAX_PLAIN_SCALE);
  const worth = floorScaleDecimal(content, dungeon, floor, difficulty);
  const plain = scale < MAX_PLAIN_SCALE;
  /** `base` times the floor's worth times `fraction`; `share` is that worth times fraction. */
  const part = (base: Decimal, share: number, fraction: number): Decimal =>
    plain ? base.mul(share) : base.mul(worth).mul(fraction);
  const tier = difficultyScale(content, difficulty);
  // The boss of this difficulty: every floor is measured against it.
  const bossHp = dungeon.boss.hp.mul(tier.hp);
  const bossAttack = dungeon.boss.attack.damage.mul(tier.attack);
  const base = {
    difficulty,
    floor,
    intervalSeconds: dungeon.boss.attack.intervalSeconds,
    scale: tier,
  };
  if (kind === 'boss') {
    return {
      ...base,
      kind,
      hp: bossHp,
      attack: bossAttack,
      enemies: [
        {
          id: dungeon.boss.id,
          name: dungeon.boss.name,
          kind: 'boss',
          hp: bossHp,
          dropScale: 1,
          hpBars: dungeon.boss.hpBars,
        },
      ],
    };
  }
  // Each difficulty has its own waves (Normal keeps the dungeon's own seed).
  const seed = seedOf(dungeon.id) + DIFFICULTIES.indexOf(difficulty) * 7919;
  if (kind === 'miniboss') {
    const type =
      dungeon.enemies[Math.floor(floor / config.miniBossEvery) % dungeon.enemies.length]!;
    const share = scale * config.miniBossHpShare;
    const hp = part(bossHp, share, config.miniBossHpShare);
    return {
      ...base,
      kind,
      hp,
      attack: part(bossAttack, scale * config.miniBossAttackShare, config.miniBossAttackShare),
      enemies: [
        {
          id: type.id,
          name: `${config.miniBossPrefix} ${type.name}`,
          kind: 'miniboss',
          hp,
          dropScale: share,
          hpBars: Math.max(1, Math.round(dungeon.boss.hpBars / 2)),
        },
      ],
    };
  }
  const span = config.waveSize.max - config.waveSize.min + 1;
  const size = config.waveSize.min + (mix(seed, floor) % span);
  const types = Array.from(
    { length: size },
    (_, i) => dungeon.enemies[mix(seed + i + 1, floor) % dungeon.enemies.length]!,
  );
  const weight = types.reduce((sum, t) => sum + t.hpWeight, 0);
  const waveShare = scale * config.waveHpShare;
  const enemies = types.map((type): FloorEnemy => {
    const share = (waveShare * type.hpWeight) / weight;
    return {
      id: type.id,
      name: type.name,
      kind: 'enemy',
      hp: part(bossHp, share, (config.waveHpShare * type.hpWeight) / weight),
      dropScale: share,
      hpBars: 1,
    };
  });
  return {
    ...base,
    kind,
    hp: enemies.reduce((sum, e) => sum.add(e.hp), new Decimal(0)),
    attack: part(bossAttack, scale * config.waveAttackShare, config.waveAttackShare),
    enemies,
  };
}
