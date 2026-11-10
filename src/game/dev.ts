/**
 * Dev cheats (Phase 9): pure state changes for the dev panel, so balance and screens can be
 * checked without playing hours. Every function returns a new state and never mutates its input.
 *
 * This module is a separate entry point on purpose and is NOT re-exported from `game/index.ts`:
 * the renderer loads it only behind `import.meta.env.DEV` (a dynamic import Vite drops from a
 * release build), and the main process confirms with `!app.isPackaged`. `npm run build` checks
 * that no release bundle contains `DEV_CHEATS_MARKER` (scripts/check-release-bundle.mjs).
 */
import { RANK_TIERS, type Content, type RankTier } from '../data';
import { grantAccountXp, settleAccount } from './account';
import { settleAchievements } from './achievements';
import { cardTopTier, levelCap } from './cards';
import { floorCount, initialProgress } from './floors';
import { settleMastery } from './mastery';
import { collectModifiers } from './modifiers';
import { Decimal, isDecimalString } from './num';
import { clearDungeon } from './production';
import { emptyReport, type TickReport } from './report';
import { createSeededRng, type Rng } from './rng';
import { cloneState, newOwnedCard, type GameState } from './state';
import { advance } from './tick';
import { grantCosmetic } from './wardrobe';

/** Found in this module's code; a release bundle that contains it shipped the cheats. */
export const DEV_CHEATS_MARKER = 'bi-dev-cheats-entry';

/** Why a cheat did nothing. */
export type DevFailure = 'unknown' | 'invalid';

/** Every cheat returns the new state, or why it refused. */
export type DevResult = { ok: true; state: GameState } | { ok: false; reason: DevFailure };

const fail = (reason: DevFailure): DevResult => ({ ok: false, reason });

function toDecimal(amount: number | string): Decimal | null {
  if (typeof amount === 'number') return Number.isFinite(amount) ? new Decimal(amount) : null;
  return isDecimalString(amount) ? new Decimal(amount) : null;
}

/** Re-runs the whole-second settles (levels, mastery, account, achievements) after a cheat. */
function settle(state: GameState, content: Content): void {
  const report: TickReport = emptyReport();
  settleMastery(state, content, report);
  settleAccount(state, content, report);
  settleAchievements(state, content, report);
}

/** Adds `amount` (a number or a decimal string such as "1e30") of a resource, or of every
 *  resource with `resource: 'all'`. */
export function devGrant(
  state: GameState,
  content: Content,
  grant: { resource: string; amount: number | string },
): DevResult {
  const amount = toDecimal(grant.amount);
  if (!amount || amount.lt(0)) return fail('invalid');
  const ids =
    grant.resource === 'all'
      ? content.resources.map((r) => r.id)
      : content.resourceById.has(grant.resource)
        ? [grant.resource]
        : [];
  if (ids.length === 0) return fail('unknown');
  const next = cloneState(state);
  for (const id of ids) next.resources[id] = (next.resources[id] ?? new Decimal(0)).add(amount);
  return { ok: true, state: next };
}

/** Marks a dungeon (with its mine unlock) or the Glimmer Trial (best score 100%) cleared, or
 *  takes the clear back with `cleared: false`. A cleared dungeon has at least one kill. */
export function devSetDungeonCleared(
  state: GameState,
  content: Content,
  dungeonId: string,
  cleared: boolean,
): DevResult {
  const isDungeon = content.dungeonById.has(dungeonId);
  if (!isDungeon && !content.trialById.has(dungeonId)) return fail('unknown');
  if (!cleared) {
    const next = cloneState(state);
    next.clearedDungeons = next.clearedDungeons.filter((id) => id !== dungeonId);
    // Back to the top of its floors, nothing beaten.
    delete next.combat.floors[dungeonId];
    if (next.activeDungeonId === dungeonId) next.bossHp = null;
    return { ok: true, state: next };
  }
  let next = isDungeon ? clearDungeon(state, content, dungeonId).state : state;
  next = cloneState(next);
  if (!next.clearedDungeons.includes(dungeonId)) next.clearedDungeons.push(dungeonId);
  if (isDungeon) {
    next.combat.kills[dungeonId] = Math.max(1, next.combat.kills[dungeonId] ?? 0);
    // It stands on its Normal last floor, with that floor as its best.
    const floors = floorCount(content.dungeonById.get(dungeonId)!);
    const progress = (next.combat.floors[dungeonId] ??= initialProgress());
    const normal = progress.tiers.normal ?? { floor: 1, best: 0 };
    progress.tiers.normal = { floor: Math.max(normal.floor, floors), best: floors };
    if (next.activeDungeonId === dungeonId) next.bossHp = null;
  } else next.combat.trialBest[dungeonId] = 1;
  settle(next, content);
  return { ok: true, state: next };
}

/** Puts a dungeon on a floor of its chosen difficulty (inside its range); the floors above it
 *  count as beaten. The fight on that floor starts fresh. */
export function devSetFloor(
  state: GameState,
  content: Content,
  dungeonId: string,
  floor: number,
): DevResult {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return fail('unknown');
  if (!Number.isFinite(floor)) return fail('invalid');
  const next = cloneState(state);
  const at = Math.min(floorCount(dungeon), Math.max(1, Math.floor(floor)));
  const progress = (next.combat.floors[dungeonId] ??= initialProgress());
  const tier = progress.tiers[progress.difficulty] ?? { floor: 1, best: 0 };
  progress.tiers[progress.difficulty] = { floor: at, best: Math.max(tier.best, at - 1) };
  if (next.activeDungeonId === dungeonId) next.bossHp = null;
  return { ok: true, state: next };
}

/** Sets a card's tier, stars (1..6) and level (default: kept; clamped to 1..the rank's cap).
 *  Owns the card first when needed. */
export function devSetCardRank(
  state: GameState,
  content: Content,
  cardId: string,
  rank: { tier: RankTier; stars: number; level?: number },
): DevResult {
  if (!content.cardById.has(cardId)) return fail('unknown');
  if (!RANK_TIERS.includes(rank.tier)) return fail('invalid');
  // The Heirloom is open only for an item type whose Heirloom art is approved (items.json).
  if (rank.tier === 'heirloom' && cardTopTier(content, cardId) !== 'heirloom')
    return fail('invalid');
  if (!Number.isInteger(rank.stars) || rank.stars < 1 || rank.stars > 6) return fail('invalid');
  const next = cloneState(state);
  const owned = { ...(next.cards.owned[cardId] ?? newOwnedCard()) };
  owned.tier = rank.tier;
  owned.stars = rank.stars;
  const cap = levelCap(content, { tier: rank.tier, stars: rank.stars });
  const level = rank.level ?? owned.level;
  owned.level = Math.max(1, Math.min(cap, Math.floor(Number.isFinite(level) ? level : 1)));
  owned.xp = new Decimal(0);
  next.cards.owned[cardId] = owned;
  settle(next, content);
  return { ok: true, state: next };
}

/** Adds account XP (through `xp.account`) and applies the level-ups with their track rewards. */
export function devAddAccountXp(
  state: GameState,
  content: Content,
  amount: number | string,
): DevResult {
  const xp = toDecimal(amount);
  if (!xp || xp.lt(0)) return fail('invalid');
  const next = cloneState(state);
  grantAccountXp(next, content, xp, collectModifiers(state, content));
  settle(next, content);
  return { ok: true, state: next };
}

/** Grants one copy of a cosmetic: new at level 1, or a copy toward its upgrade levels. */
export function devGrantCosmetic(
  state: GameState,
  content: Content,
  cosmeticId: string,
): DevResult {
  if (!content.cosmeticById.has(cosmeticId)) return fail('unknown');
  const next = cloneState(state);
  grantCosmetic(next, cosmeticId);
  settle(next, content);
  return { ok: true, state: next };
}

/** Plays `seconds` of the game with the real rules (like leaving it open that long). */
export function devAdvanceTime(
  state: GameState,
  content: Content,
  seconds: number,
  rng: Rng = createSeededRng(Date.now() % 2147483647),
): DevResult {
  if (!Number.isFinite(seconds) || seconds < 0) return fail('invalid');
  return { ok: true, state: advance(state, content, seconds * 1000, rng).state };
}

/** What the dev panel can pick from, in content order. */
export interface DevOptions {
  resources: { id: string; name: string }[];
  /** Dungeons, then special dungeons. */
  dungeons: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  cosmetics: { id: string; name: string }[];
  tiers: readonly RankTier[];
}

/** Ids and names for the dev panel's pickers. */
export function devOptions(content: Content): DevOptions {
  const pick = (x: { id: string; name: string }) => ({ id: x.id, name: x.name });
  return {
    resources: content.resources.map(pick),
    dungeons: [...content.dungeons, ...content.trials].map(pick),
    cards: content.cards.map(pick),
    cosmetics: content.cosmetics.map(pick),
    tiers: RANK_TIERS,
  };
}
