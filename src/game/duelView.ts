import type { Content, Skill } from '../data';
import { fightStage, bossStatus } from './combat';
import {
  buildTeam,
  cardAverageDps,
  damageTaken,
  enemyTarget,
  gaugeAt,
  isStanding,
  type TeamCard,
} from './duel';
import type { FloorEnemy } from './floors';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import type { SkillEvent, TickReport } from './report';
import type { GameState } from './state';

/**
 * What the card duel shows (DESIGN.md §6 "What the duel shows"), as pure selectors for the UI: the
 * team's cards with their own health and state, the enemy standing ahead and the deck waiting
 * behind it, and a log of the fight (per-card damage, the hit feed, the stat sheet, the skill
 * activations) that the UI keeps in memory and feeds with every TickReport. Nothing here is saved.
 */

/** One team card as the duel shows it. */
export interface TeamCardView {
  cardId: string;
  /** Position in the hand, 0 (the main card, leftmost) to 3. */
  slot: number;
  skill: Pick<Skill, 'id' | 'name' | 'role' | 'description' | 'guard' | 'weaken'>;
  /** The signature heals instead of striking. */
  heals: boolean;
  maxHealth: Decimal;
  /** Health left (0 when knocked out), and as a share of the max, 0..1. */
  health: Decimal;
  fraction: number;
  /** Out of the fight: its health ran out (until the floor is cleared) or the team is knocked
   *  out. Show it greyed. */
  knockedOut: boolean;
  /** The enemy's next attack lands on it. */
  targeted: boolean;
  /** Its own average damage per second (hits, signature and crits at their expected value). */
  averageDps: Decimal;
  hitSeconds: number;
  /** Its signature gauge, 0..1. */
  gauge: number;
}

/** The team in hand order, against the active dungeon; empty with no card in the loadout. */
export function teamView(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): TeamCardView[] {
  const team = buildTeam(state, content, modifiers, state.activeDungeonId).filter((c) => c.id);
  const out = state.combat.knockoutSeconds > 0;
  const target = out ? null : enemyTarget(state, team);
  const clock = state.stats.playTimeMs / 1000;
  return team.map((card: TeamCard): TeamCardView => {
    const down = out || !isStanding(state, card);
    const health = down
      ? new Decimal(0)
      : Decimal.max(card.maxHealth.sub(damageTaken(state, card.id)), 0);
    return {
      cardId: card.id,
      slot: card.slot,
      skill: {
        id: card.skill.id,
        name: card.skill.name,
        role: card.skill.role,
        description: card.skill.description,
        guard: card.skill.guard,
        weaken: card.skill.weaken,
      },
      heals: card.heal > 0,
      maxHealth: card.maxHealth,
      health,
      fraction: card.maxHealth.gt(0) ? health.div(card.maxHealth).toNumber() : 0,
      knockedOut: down,
      targeted: target?.id === card.id,
      averageDps: cardAverageDps(card),
      hitSeconds: card.interval,
      gauge: gaugeAt(card, clock),
    };
  });
}

/** The enemy standing ahead and the deck of the wave waiting behind it. */
export interface DuelEnemyView {
  enemy: { id: string; name: string; kind: FloorEnemy['kind'] };
  hp: Decimal;
  maxHp: Decimal;
  /** Which enemy of the floor this is (1-based) and how many the floor holds. */
  index: number;
  size: number;
  /** The enemies still waiting face down, in the order they come (the boss last). */
  waiting: { id: string; name: string; kind: FloorEnemy['kind'] }[];
}

/** The duel's enemy side in the active dungeon, or null (special dungeon, nothing active). */
export function duelEnemy(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): DuelEnemyView | null {
  const status = bossStatus(state, content, modifiers);
  if (!status) return null;
  const stage = fightStage(state, content, status.dungeon.id, modifiers);
  if (!stage) return null;
  const index = status.wave.index - 1;
  return {
    enemy: { id: status.enemy.id, name: status.enemy.name, kind: status.enemy.kind },
    hp: status.hp,
    maxHp: status.maxHp,
    index: status.wave.index,
    size: status.wave.size,
    waiting: stage.enemies.slice(index + 1).map((e) => ({ id: e.id, name: e.name, kind: e.kind })),
  };
}

// ---- the fight log ---------------------------------------------------------------------------

/** One line of the hit feed: a card's hits (merged when many landed in one report). */
export interface DuelFeedEntry {
  cardId: string;
  /** Damage of one hit (a signature's extra damage on top of its hit). */
  damage: Decimal;
  hits: number;
  signature: boolean;
}

/** The stat sheet: the fight's damage in total, per second and its best hit. */
export interface DuelSheet {
  total: Decimal;
  perSecond: Decimal;
  best: Decimal;
  seconds: number;
}

/** A fight's running log, kept by the UI in memory (DESIGN.md §6 What the duel shows). */
export interface DuelLog {
  /** The fight it belongs to (`duelFightKey`). */
  key: string;
  seconds: number;
  total: Decimal;
  best: Decimal;
  /** Damage each team card dealt this fight. */
  perCard: Record<string, Decimal>;
  /** The latest hits, newest first (at most DUEL_FEED_SIZE). */
  feed: DuelFeedEntry[];
  /** The latest skill activations, newest first, for the banners (at most DUEL_FEED_SIZE). */
  skills: SkillEvent[];
  /** The sheet of the fight before this one, or null. */
  previous: DuelSheet | null;
}

export const DUEL_FEED_SIZE = 8;

/** The fight being fought: dungeon, difficulty, floor and whether it is a Challenge. */
export function duelFightKey(state: GameState, content: Content): string {
  const status = bossStatus(state, content);
  if (!status) return state.activeDungeonId ?? '';
  return `${status.dungeon.id}:${status.difficulty}:${status.floor}:${status.challenge ? 'c' : 'f'}`;
}

export function emptyDuelLog(key = '', previous: DuelSheet | null = null): DuelLog {
  return {
    key,
    seconds: 0,
    total: new Decimal(0),
    best: new Decimal(0),
    perCard: {},
    feed: [],
    skills: [],
    previous,
  };
}

/** The stat sheet of a log. */
export function duelSheet(log: DuelLog): DuelSheet {
  return {
    total: log.total,
    perSecond: log.seconds > 0 ? log.total.div(log.seconds) : new Decimal(0),
    best: log.best,
    seconds: log.seconds,
  };
}

/**
 * The log after one report of `seconds` while fighting `key`. A fight ends when the floor is
 * cleared, a Challenge ends, the team is knocked out or the fight changes: the log then starts
 * again (keeping the ended fight's sheet as `previous`), and the report's own hits begin it.
 */
export function recordDuel(
  log: DuelLog,
  report: TickReport,
  seconds: number,
  key: string,
): DuelLog {
  const ended =
    key !== log.key ||
    report.floorsCleared > 0 ||
    report.challenges.length > 0 ||
    report.knockouts > 0;
  const next: DuelLog = ended
    ? emptyDuelLog(key, log.seconds > 0 || log.total.gt(0) ? duelSheet(log) : log.previous)
    : { ...log, perCard: { ...log.perCard }, feed: [...log.feed], skills: [...log.skills] };
  next.seconds += Math.max(0, seconds);
  for (const hit of report.playerHits) {
    if (hit.hits <= 0) continue;
    const dealt = hit.damage.mul(hit.hits);
    next.total = next.total.add(dealt);
    next.perCard[hit.cardId] = (next.perCard[hit.cardId] ?? new Decimal(0)).add(dealt);
    if (hit.damage.gt(next.best)) next.best = hit.damage;
    next.feed.unshift({ ...hit });
  }
  for (const skill of report.skills) next.skills.unshift({ ...skill });
  next.feed.length = Math.min(next.feed.length, DUEL_FEED_SIZE);
  next.skills.length = Math.min(next.skills.length, DUEL_FEED_SIZE);
  return next;
}
