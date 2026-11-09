import type { BurstJob, Metal, ProductionJob } from '../data';
import type { Decimal } from './num';

/**
 * What tiered up (DESIGN.md §12): gem mastery, a boss medal (dungeon or special dungeon), a
 * mine level or tree level milestone, a tree tile stage, a card tier, or a card's unique
 * Heirloom.
 */
export type TierUpKind =
  | 'gem_mastery'
  | 'boss_mastery'
  | 'mine_milestone'
  | 'tree_milestone'
  | 'tile_stage'
  | 'card_tier'
  | 'heirloom';

/**
 * One tier-up moment, the same shape for everything with tiers so the UI plays one kind of
 * moment (a metal flash and a short toast).
 */
export interface TierUp {
  kind: TierUpKind;
  /** Gem resource, dungeon, mine, producer or card id. */
  id: string;
  /** Tier before and after: mastery tier 0..4, milestones reached, tile stage 0..4, or the card
   *  tier as a metal index (bronze 1 .. prismatic 4); for `heirloom` 0 -> 1. */
  from: number;
  to: number;
  /** The metal to flash: METALS[to] capped at prismatic (a card's own tier for `heirloom`). */
  metal: Metal;
}

/**
 * One harvest strike for the stage (DESIGN.md §4): "the card chops tree 2 for +14". The
 * economy is the expected value; these are the discrete moments that add up to it. When many
 * strikes land on one kind in a report they are merged: `strikes` counts them.
 */
export interface HarvestEvent {
  job: ProductionJob;
  /** Position of the struck tree kind / mine type among the job's, in content order (stable). */
  kind: number;
  /** Tree or mine id struck. */
  producer: string;
  /** Gem harvested. */
  resource: string;
  /** Total gained by the merged strikes (crits included). */
  amount: Decimal;
  /** Strikes merged into this event (1 when played live). */
  strikes: number;
  /** How many of them were crits; `crits > 0` means show the crit look. */
  crits: number;
  /** The bonus harvest of a full harvest gauge (one event per unlocked kind). */
  burst: boolean;
  /** Support card ids whose effect helps this job's harvest. */
  supports: string[];
}

/** Most harvest events a merged report keeps before folding strikes of the same kind together. */
export const MAX_REPORT_HARVESTS = 64;

/** Adds a strike event, folding it into a matching one when the list is full. */
export function pushHarvest(into: HarvestEvent[], event: HarvestEvent): void {
  if (into.length >= MAX_REPORT_HARVESTS) {
    const same = into.find(
      (e) =>
        e.job === event.job &&
        e.kind === event.kind &&
        e.burst === event.burst &&
        e.producer === event.producer,
    );
    if (same) {
      same.amount = same.amount.add(event.amount);
      same.strikes += event.strikes;
      same.crits += event.crits;
      for (const id of event.supports) if (!same.supports.includes(id)) same.supports.push(id);
      return;
    }
  }
  into.push(event);
}

/**
 * Our hits on a boss or the trial's target (DESIGN.md §6): damage lands in chunks, one hit per
 * burst interval, so the HP bar drops in steps. Live spans list the hits that landed in the
 * step (usually 0 or 1, plus the signature attack when the gauge filled); a long span (offline)
 * folds them into one event per kind. Signature attacks come in their own event, after the
 * normal hits of the span, because they land on top of the hit that filled the gauge.
 */
export interface PlayerHitEvent {
  /** Dungeon or special dungeon being fought. */
  target: string;
  /** Damage of one hit (crits at their expected value, so the average when merged). */
  damage: Decimal;
  /** Hits of this kind that landed (1 when played live). */
  hits: number;
  /** A signature attack (full burst gauge) rather than a normal hit. */
  signature: boolean;
}

/** Most player hit events a merged report keeps before folding hits of one kind together. */
export const MAX_REPORT_PLAYER_HITS = 64;

/** Adds a player hit event, folding it into a matching one when the list is full. */
export function pushPlayerHit(into: PlayerHitEvent[], event: PlayerHitEvent): void {
  if (event.hits <= 0) return;
  if (into.length >= MAX_REPORT_PLAYER_HITS) {
    const same = into.find((e) => e.target === event.target && e.signature === event.signature);
    if (same) {
      const total = same.damage.mul(same.hits).add(event.damage.mul(event.hits));
      same.hits += event.hits;
      same.damage = total.div(same.hits);
      return;
    }
  }
  into.push(event);
}

/**
 * One boss attack on the fighting loadout (DESIGN.md §6): a chunk taken from its health pool, at
 * the boss's rhythm. Live spans list every attack; a long span (offline) folds them into one
 * event for the light hits and one for the slams, so `attacks` counts the merged ones.
 */
export interface BossAttackEvent {
  /** Dungeon whose boss attacked. */
  dungeon: string;
  /** Total taken from the pool by the merged attacks, after defence. */
  damage: Decimal;
  /** A slam (every sixth attack) rather than a light hit. */
  slam: boolean;
  /** Attacks merged into this event (1 when played live). */
  attacks: number;
  /** This single hit emptied the pool and knocked the loadout out (false once merged). */
  knockout: boolean;
  /** Seconds from this attack (the last one, when merged) until the next slam lands, for the
   *  wind-up; a slam itself looks a whole cycle ahead. */
  nextSlamSeconds: number;
}

/** Most boss attack events a merged report keeps before folding attacks of one kind together. */
export const MAX_REPORT_BOSS_ATTACKS = 64;

/** Adds a boss attack event, folding it into a matching one when the list is full. */
export function pushBossAttack(into: BossAttackEvent[], event: BossAttackEvent): void {
  if (into.length >= MAX_REPORT_BOSS_ATTACKS) {
    const same = into.find((e) => e.dungeon === event.dungeon && e.slam === event.slam);
    if (same) {
      same.damage = same.damage.add(event.damage);
      same.attacks += event.attacks;
      same.knockout = false; // a merged event is no single lethal hit
      same.nextSlamSeconds = event.nextSlamSeconds;
      return;
    }
  }
  into.push(event);
}

/** What happened during one advance() call, for notifications, animations and the away summary. */
export interface TickReport {
  bossKills: number;
  /** Rare item id -> times dropped. */
  drops: Record<string, number>;
  /** Material resource id (Cores, Glimmer Dust, Facet Shards) -> units gained. */
  materials: Record<string, number>;
  /** Currency (Money, crystals) id -> units gained from boss kills and the fighting wage. */
  currencies: Record<string, number>;
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
   *  (`pull`), which replaced the boss card drop (DESIGN.md §7, §5). */
  cardDrops: CardDrop[];
  /** Card id -> levels before and after, for cards that levelled up. */
  cardLevels: Record<string, { from: number; to: number }>;
  /** Times the fighting loadout was knocked out (DESIGN.md §6). */
  knockouts: number;
  /** The boss's attacks on the fighting loadout, in order (merged when there are many). */
  bossAttacks: BossAttackEvent[];
  /** Our hits on the boss or trial target, in order (merged when there are many). */
  playerHits: PlayerHitEvent[];
  /** Mastery tiers reached (gem mastery and boss medals), in order. */
  tierUps: TierUp[];
  /** Harvest strikes and harvest bursts of the production main cards, in order (11.15). */
  harvests: HarvestEvent[];
  /** Achievement ids unlocked, in order (their rewards are already granted). */
  achievements: string[];
  /** Account level before and after, when it rose (the track's rewards are granted). */
  accountLevel: { from: number; to: number } | null;
}

export function emptyReport(): TickReport {
  return {
    bossKills: 0,
    drops: {},
    materials: {},
    currencies: {},
    bursts: { fighting: 0, logging: 0, mining: 0 },
    cleared: [],
    unlockedDungeons: [],
    unlockedMines: [],
    trialAttempts: 0,
    trialTopScore: 0,
    cardDrops: [],
    cardLevels: {},
    knockouts: 0,
    bossAttacks: [],
    playerHits: [],
    tierUps: [],
    harvests: [],
    achievements: [],
    accountLevel: null,
  };
}

export function mergeReports(into: TickReport, add: TickReport): TickReport {
  into.bossKills += add.bossKills;
  for (const [id, n] of Object.entries(add.drops)) into.drops[id] = (into.drops[id] ?? 0) + n;
  for (const [id, n] of Object.entries(add.materials)) {
    into.materials[id] = (into.materials[id] ?? 0) + n;
  }
  for (const [id, n] of Object.entries(add.currencies)) {
    into.currencies[id] = (into.currencies[id] ?? 0) + n;
  }
  for (const job of Object.keys(into.bursts) as BurstJob[]) into.bursts[job] += add.bursts[job];
  into.cleared.push(...add.cleared);
  into.unlockedDungeons.push(...add.unlockedDungeons);
  into.unlockedMines.push(...add.unlockedMines);
  into.trialAttempts += add.trialAttempts;
  into.trialTopScore = Math.max(into.trialTopScore, add.trialTopScore);
  into.knockouts += add.knockouts;
  into.cardDrops.push(...add.cardDrops);
  for (const event of add.bossAttacks) pushBossAttack(into.bossAttacks, { ...event });
  for (const event of add.playerHits) pushPlayerHit(into.playerHits, { ...event });
  into.tierUps.push(...add.tierUps);
  for (const event of add.harvests)
    pushHarvest(into.harvests, { ...event, supports: [...event.supports] });
  into.achievements.push(...add.achievements);
  if (add.accountLevel) {
    into.accountLevel = {
      from: into.accountLevel?.from ?? add.accountLevel.from,
      to: add.accountLevel.to,
    };
  }
  for (const [id, change] of Object.entries(add.cardLevels)) {
    const prev = into.cardLevels[id];
    into.cardLevels[id] = prev ? { from: prev.from, to: change.to } : { ...change };
  }
  return into;
}

/** What a card obtained turned into (DESIGN.md §5). */
export type CardGain =
  /** A card not owned before, now at Bronze ★1 Lv 1. */
  | { kind: 'new' }
  /** Added to the card's star bar; `duplicates` is the fill held after it. */
  | { kind: 'duplicate'; duplicates: number }
  /** The copy was past ★6: it became this many shards. */
  | { kind: 'shards'; shards: number };

export type CardDrop = CardGain & { cardId: string };
