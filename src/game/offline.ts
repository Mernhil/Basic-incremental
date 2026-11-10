import type { Content } from '../data';
import { Decimal } from './num';
import type { Rng } from './rng';
import { collectModifiers, statValue } from './modifiers';
import { advanceChunked } from './tick';
import type { CardDrop, TierUp } from './report';
import { xpToNextLevel } from './cards';
import { settleAchievements } from './achievements';
import { cloneState, type GameState } from './state';

/** Base offline cap (8 hours). The offline.capHours modifiers can raise it. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** The offline cap for this state, after modifiers. Never below zero. */
export function offlineCapMs(state: GameState, content: Content): number {
  const hours = statValue(
    'offline.capHours',
    OFFLINE_CAP_MS / HOUR_MS,
    collectModifiers(state, content),
  );
  return Math.max(0, hours.toNumber()) * HOUR_MS;
}
/** Below this, nothing is simulated and no summary is shown. */
export const MIN_OFFLINE_MS = 10_000;
const OFFLINE_CHUNK_MS = 60_000;

export interface OfflineSummary {
  /** Real time since the last save. */
  elapsedMs: number;
  /** Time actually simulated (elapsed, capped). */
  simulatedMs: number;
  /** The cap that applied. */
  capMs: number;
  capped: boolean;
  /** Resource id -> amount gained while away (only positive gains). */
  gains: Record<string, Decimal>;
  /** Mini-bosses and bosses killed while away. */
  bossKills: number;
  /** Normal enemies killed while away. */
  enemyKills: number;
  drops: Record<string, number>;
  /** Cards dropped while away. */
  cardDrops: CardDrop[];
  /** Card id -> levels before and after, for cards that levelled up while away. */
  cardLevels: Record<string, { from: number; to: number }>;
  /** Times the fighting loadout was knocked out while away (DESIGN.md §6). */
  knockouts: number;
  /** Material id (Cores, Glimmer Dust, Facet Shards) -> units gained while away. */
  materials: Record<string, number>;
  /** Card id -> XP gained while away, level-ups included (only cards that gained some). */
  cardXp: Record<string, Decimal>;
  /** Mastery tiers (gem mastery, boss medals) reached while away, in order. */
  tierUps: TierUp[];
  /** Achievement ids unlocked while away (Night Owl included), in order. */
  achievements: string[];
}

/** XP a card has earned in total: every level below its level, plus its current XP. */
function totalXp(content: Content, owned: { level: number; xp: Decimal } | undefined): Decimal {
  if (!owned) return new Decimal(0);
  let sum = owned.xp;
  for (let level = 1; level < owned.level; level++) sum = sum.add(xpToNextLevel(content, level));
  return sum;
}

/** Simulates the time between `savedAtMs` and `nowMs`, capped at OFFLINE_CAP_MS. */
export function simulateOffline(
  state: GameState,
  content: Content,
  savedAtMs: number,
  nowMs: number,
  rng: Rng,
): { state: GameState; summary: OfflineSummary | null } {
  const elapsedMs = nowMs - savedAtMs;
  // Clock moved backwards, or the gap is too small to be worth reporting.
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_OFFLINE_MS) {
    return { state, summary: null };
  }

  const capMs = offlineCapMs(state, content);
  const simulatedMs = Math.min(elapsedMs, capMs);
  // Offline progress fights the floor the player left it on and never pushes deeper
  // (DESIGN.md §6 Offline on floors).
  const result = advanceChunked(state, content, simulatedMs, rng, OFFLINE_CHUNK_MS, {
    noPush: true,
  });
  // The session itself counts (Night Owl), then whatever it earned unlocks.
  const recorded = cloneState(result.state);
  recorded.stats.longestOfflineMs = Math.max(recorded.stats.longestOfflineMs, simulatedMs);
  const unlocked = settleAchievements(recorded, content);
  result.state = recorded;

  const gains: Record<string, Decimal> = {};
  for (const [id, after] of Object.entries(result.state.resources)) {
    const gained = after.sub(state.resources[id] ?? new Decimal(0));
    if (gained.gt(0)) gains[id] = gained;
  }
  const cardXp: Record<string, Decimal> = {};
  for (const [id, after] of Object.entries(result.state.cards.owned)) {
    const gained = totalXp(content, after).sub(totalXp(content, state.cards.owned[id]));
    if (gained.gt(0)) cardXp[id] = gained;
  }

  return {
    state: result.state,
    summary: {
      elapsedMs,
      simulatedMs,
      capMs,
      capped: elapsedMs > capMs,
      gains,
      bossKills: result.report.bossKills,
      enemyKills: result.report.enemyKills,
      drops: result.report.drops,
      cardDrops: result.report.cardDrops,
      cardLevels: result.report.cardLevels,
      knockouts: result.report.knockouts,
      materials: result.report.materials,
      cardXp,
      tierUps: result.report.tierUps,
      achievements: [...result.report.achievements, ...unlocked],
    },
  };
}
