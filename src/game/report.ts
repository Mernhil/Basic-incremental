import type { BurstJob, Metal } from '../data';

/**
 * What tiered up (DESIGN.md 16, E1): gem mastery, a boss medal (dungeon or special dungeon), a
 * mine level or damage line milestone, a tree tile stage, a card tier, or a card's unique
 * evolution.
 */
export type TierUpKind =
  | 'gem_mastery'
  | 'boss_mastery'
  | 'mine_milestone'
  | 'damage_milestone'
  | 'tile_stage'
  | 'card_tier'
  | 'evolution';

/**
 * One tier-up moment, the same shape for everything with tiers so the UI plays one kind of
 * moment (a metal flash and a short toast).
 */
export interface TierUp {
  kind: TierUpKind;
  /** Gem resource, dungeon, mine, damage line, producer or card id. */
  id: string;
  /** Tier before and after: mastery tier 0..4, milestones reached, tile stage 0..4, or the card
   *  tier as a metal index (bronze 1 .. prismatic 4); for `evolution` 0 -> 1. */
  from: number;
  to: number;
  /** The metal to flash: METALS[to] capped at prismatic (a card's own tier for `evolution`). */
  metal: Metal;
}

/** What happened during one advance() call, for notifications, animations and the away summary. */
export interface TickReport {
  bossKills: number;
  /** Rare item id -> times dropped. */
  drops: Record<string, number>;
  /** Material resource id (Cores, Glimmer Dust, Facet Shards) -> units gained. */
  materials: Record<string, number>;
  /** Bursts fired per job: signature attacks (fighting) and bonus harvests (logging, mining). */
  bursts: Record<BurstJob, number>;
  /** Dungeons and special dungeons cleared for the first time. */
  cleared: string[];
  /** Dungeons and special dungeons that became available. */
  unlockedDungeons: string[];
  /** Mine types unlocked by a clear. */
  unlockedMines: string[];
  /** Special dungeon attempts finished. */
  trialAttempts: number;
  /** Best score (0..1) among those attempts; 0 when there were none. */
  trialTopScore: number;
  /** Cards gained while advancing, in order. Empty in the beta: cards come from the Card Portal
   *  (`pull`), which replaced the boss card drop (DESIGN.md 6, 11.9). */
  cardDrops: CardDrop[];
  /** Card id -> levels before and after, for cards that levelled up. */
  cardLevels: Record<string, { from: number; to: number }>;
  /** Times the fighting loadout was knocked out (DESIGN.md 11.10). */
  knockouts: number;
  /** Mastery tiers reached (gem mastery and boss medals), in order. */
  tierUps: TierUp[];
  /** Achievement ids unlocked, in order (their rewards are already granted). */
  achievements: string[];
}

export function emptyReport(): TickReport {
  return {
    bossKills: 0,
    drops: {},
    materials: {},
    bursts: { fighting: 0, logging: 0, mining: 0 },
    cleared: [],
    unlockedDungeons: [],
    unlockedMines: [],
    trialAttempts: 0,
    trialTopScore: 0,
    cardDrops: [],
    cardLevels: {},
    knockouts: 0,
    tierUps: [],
    achievements: [],
  };
}

export function mergeReports(into: TickReport, add: TickReport): TickReport {
  into.bossKills += add.bossKills;
  for (const [id, n] of Object.entries(add.drops)) into.drops[id] = (into.drops[id] ?? 0) + n;
  for (const [id, n] of Object.entries(add.materials)) {
    into.materials[id] = (into.materials[id] ?? 0) + n;
  }
  for (const job of Object.keys(into.bursts) as BurstJob[]) into.bursts[job] += add.bursts[job];
  into.cleared.push(...add.cleared);
  into.unlockedDungeons.push(...add.unlockedDungeons);
  into.unlockedMines.push(...add.unlockedMines);
  into.trialAttempts += add.trialAttempts;
  into.trialTopScore = Math.max(into.trialTopScore, add.trialTopScore);
  into.knockouts += add.knockouts;
  into.cardDrops.push(...add.cardDrops);
  into.tierUps.push(...add.tierUps);
  into.achievements.push(...add.achievements);
  for (const [id, change] of Object.entries(add.cardLevels)) {
    const prev = into.cardLevels[id];
    into.cardLevels[id] = prev ? { from: prev.from, to: change.to } : { ...change };
  }
  return into;
}

/** What a card obtained turned into (DESIGN.md 11.9). */
export type CardGain =
  /** A card not owned before, now at Bronze ★1 Lv 1. */
  | { kind: 'new' }
  /** Stored on the owned card as a duplicate; `duplicates` is the new count. */
  | { kind: 'duplicate'; duplicates: number }
  /** The card is Prismatic ★6: the copy became this many shards. */
  | { kind: 'shards'; shards: number };

export type CardDrop = CardGain & { cardId: string };
