import type { Content, Dungeon } from '../data';
import { Decimal } from './num';
import type { Difficulty, DungeonProgress, FloorMode, GameState, TierProgress } from './state';

/**
 * Dungeon floors (DESIGN.md §6 Dungeon floors, Normal enemies): what stands on each floor of a
 * dungeon, before Ascension growth and modifiers, and where the player is in each dungeon.
 *
 * A dungeon is a stack of floors. A normal floor is a wave of 3 to 5 of the dungeon's normal
 * enemies, every 10th floor holds a mini-boss and the last floor holds the dungeon's boss. A
 * floor's strength is measured against the boss (`combat.json` `floors`): floor `f` of `n` is
 * worth `hpGrowth^(f - n)` of the boss's HP and attack, so the ladder is steady and ends on the
 * boss as it is in `dungeons.json`.
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
  /** Its share of the boss's drops, XP and purse: its HP over the boss's HP. The boss is 1. */
  dropScale: number;
  /** The HP is shown as this many stacked bars. */
  hpBars: number;
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
}

/** A dungeon's progress as a new game has it: Normal, pushing, on floor 1, nothing beaten. */
export function initialProgress(): DungeonProgress {
  return { difficulty: 'normal', mode: 'push', tiers: {} };
}

/** How many floors a dungeon has on a difficulty tier. */
export function floorCount(dungeon: Dungeon): number {
  return dungeon.floors;
}

/** The saved progress of a dungeon (a fresh one when it was never fought). Not a copy to change. */
export function dungeonProgress(state: GameState, dungeonId: string): DungeonProgress {
  return state.combat.floors[dungeonId] ?? initialProgress();
}

/** Where the player stands in a dungeon. */
export interface FloorPosition {
  difficulty: Difficulty;
  mode: FloorMode;
  /** The floor being fought, 1 to the floor count. */
  floor: number;
  /** The deepest floor beaten on this difficulty (0 = none). Kept through Ascension. */
  best: number;
  /** Floors on this difficulty. */
  floors: number;
}

const clampFloor = (floor: number, floors: number): number =>
  Math.min(floors, Math.max(1, Math.floor(floor) || 1));

/** The player's position on a dungeon's chosen difficulty, with the floor inside its range. */
export function floorPosition(state: GameState, dungeon: Dungeon): FloorPosition {
  const progress = dungeonProgress(state, dungeon.id);
  const tier: TierProgress = progress.tiers[progress.difficulty] ?? { floor: 1, best: 0 };
  const floors = floorCount(dungeon);
  return {
    difficulty: progress.difficulty,
    mode: progress.mode,
    floor: clampFloor(tier.floor, floors),
    best: Math.max(0, Math.floor(tier.best) || 0),
    floors,
  };
}

/** Whether a deeper floor exists below this one (push has somewhere to go). */
export function hasDeeperFloor(position: Pick<FloorPosition, 'floor' | 'floors'>): boolean {
  return position.floor < position.floors;
}

/** The floor an Ascension starts a dungeon tier on: half of the best floor, at least floor 1. */
export function ascensionStartFloor(best: number): number {
  return Math.max(1, Math.floor(best / 2));
}

/** What kind of floor `floor` is: the last one holds the boss, every 10th a mini-boss. */
export function floorKind(content: Content, dungeon: Dungeon, floor: number): FloorKind {
  if (floor >= floorCount(dungeon)) return 'boss';
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
 * The floor's worth against the dungeon's boss, as a multiple of the boss's HP and attack:
 * `hpGrowth^(floor - floors)`, so the last floor is exactly the boss.
 */
export function floorScale(content: Content, dungeon: Dungeon, floor: number): number {
  return Math.pow(content.combat.floors.hpGrowth, floor - floorCount(dungeon));
}

/**
 * What stands on a floor of a dungeon, before Ascension growth and modifiers. The same floor
 * always holds the same wave (its size and enemy types come from the dungeon and floor alone),
 * so nothing about it needs saving.
 */
export function floorSpec(
  content: Content,
  dungeon: Dungeon,
  difficulty: Difficulty,
  floor: number,
): FloorSpec {
  const config = content.combat.floors;
  const kind = floorKind(content, dungeon, floor);
  const scale = floorScale(content, dungeon, floor);
  const base = { difficulty, floor, intervalSeconds: dungeon.boss.attack.intervalSeconds };
  if (kind === 'boss') {
    return {
      ...base,
      kind,
      hp: dungeon.boss.hp,
      attack: dungeon.boss.attack.damage,
      enemies: [
        {
          id: dungeon.boss.id,
          name: dungeon.boss.name,
          kind: 'boss',
          hp: dungeon.boss.hp,
          dropScale: 1,
          hpBars: dungeon.boss.hpBars,
        },
      ],
    };
  }
  const seed = seedOf(dungeon.id);
  if (kind === 'miniboss') {
    const type =
      dungeon.enemies[Math.floor(floor / config.miniBossEvery) % dungeon.enemies.length]!;
    const share = scale * config.miniBossHpShare;
    const hp = dungeon.boss.hp.mul(share);
    return {
      ...base,
      kind,
      hp,
      attack: dungeon.boss.attack.damage.mul(scale * config.miniBossAttackShare),
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
      hp: dungeon.boss.hp.mul(share),
      dropScale: share,
      hpBars: 1,
    };
  });
  return {
    ...base,
    kind,
    hp: enemies.reduce((sum, e) => sum.add(e.hp), new Decimal(0)),
    attack: dungeon.boss.attack.damage.mul(scale * config.waveAttackShare),
    enemies,
  };
}
