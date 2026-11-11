import { RANK_TIERS, type Achievement, type AchievementCondition, type Content } from '../data';
import { skillPointsSpent, weaponCircles } from './account';
import { grantCard } from './cards';
import { Decimal } from './num';
import { isProducerUnlocked, mineLevel, producersOf } from './production';
import { floorCount, floorPosition, stageFloors, STAR_DIFFICULTIES, stageKey } from './floors';
import { stageStarLevel, totalStageStarLevels } from './stageStars';
import { totalChallengeCompletions } from './challenges';
import { activeWorkers, forgeWorker } from './workers';
import type { TickReport } from './report';
import { cloneState, type GameState } from './state';
import { cosmeticMaxLevel, detectSets } from './theme';
import { grantCosmetic } from './wardrobe';
import type { CosmeticGain } from './portals';
import type { CardGain } from './report';

/**
 * Achievements (DESIGN.md §10, §11 sticker book) and the shard shop. Each achievement's
 * condition (achievements.json) reads the state; it unlocks once, records the play time, and
 * grants its reward (cosmetics, a copy when owned; resources). The game tick checks them on the
 * whole-second grid (tick.ts), offline progress checks them after the session, and actions can
 * call `checkAchievements` straight after.
 */

/** Where a condition stands: the value read from the state and the target to reach. */
function measure(
  state: GameState,
  content: Content,
  condition: AchievementCondition,
): { value: number; target: number } {
  const cards = Object.values(state.cards.owned);
  switch (condition.kind) {
    case 'harvested': {
      let total = new Decimal(0);
      for (const [id, amount] of Object.entries(state.mastery.harvested)) {
        const kind = content.resourceById.get(id)?.kind;
        const job = kind === 'tree_gem' ? 'logging' : kind === 'mine_gem' ? 'mining' : null;
        if (job && (!condition.job || condition.job === job)) total = total.add(amount);
      }
      return { value: total.toNumber(), target: condition.amount.toNumber() };
    }
    case 'kills':
      return { value: state.stats.bossKills, target: condition.amount };
    case 'producers': {
      const all = producersOf(content, condition.job);
      const unlocked = all.filter((p) => isProducerUnlocked(state, content, condition.job, p.id));
      return { value: unlocked.length, target: condition.count ?? all.length };
    }
    case 'cleared':
      return { value: state.clearedDungeons.includes(condition.dungeon) ? 1 : 0, target: 1 };
    case 'pulls':
      return {
        value: Object.values(state.portals).reduce((a, p) => a + p.pulls, 0),
        target: condition.amount,
      };
    case 'pity_hits':
      return {
        value: Object.values(state.portals).reduce((a, p) => a + p.pityHits, 0),
        target: condition.amount,
      };
    case 'card_tier': {
      const want = RANK_TIERS.indexOf(condition.tier);
      const best = Math.max(-1, ...cards.map((c) => RANK_TIERS.indexOf(c.tier)));
      return { value: best >= want ? 1 : 0, target: 1 };
    }
    case 'card_stars':
      return { value: Math.max(0, ...cards.map((c) => c.stars)), target: condition.stars };
    case 'full_loadout': {
      const full = Object.values(state.cards.loadouts).some(
        (l) => l.main !== null && l.supports.every((s) => s !== null),
      );
      return { value: full ? 1 : 0, target: 1 };
    }
    case 'full_set': {
      const starterSets = new Set(
        content.cosmetics.filter((c) => c.starter && c.set).map((c) => c.set!),
      );
      const full = detectSets(content, state.cosmetics.loadout).some(
        (s) => s.complete && !starterSets.has(s.set),
      );
      return { value: full ? 1 : 0, target: 1 };
    }
    case 'cosmetics_owned': {
      const owned = Object.keys(state.cosmetics.owned).filter(
        (id) => content.cosmeticById.get(id)?.starter === false,
      );
      return { value: owned.length, target: condition.amount };
    }
    case 'skill_points_spent':
      return { value: skillPointsSpent(state, content), target: condition.amount };
    case 'challenge_completions':
      return { value: totalChallengeCompletions(state, content), target: condition.amount };
    case 'ascensions':
      return { value: state.prestigeCount, target: condition.amount };
    case 'offline_hours':
      return { value: state.stats.longestOfflineMs / 3_600_000, target: condition.hours };
    case 'gem_mastery':
      return {
        value: Math.max(0, ...Object.values(state.mastery.gemTiers)),
        target: condition.tier,
      };
    case 'boss_mastery':
      return {
        value: Math.max(0, ...Object.values(state.mastery.bossTiers)),
        target: condition.tier,
      };
    case 'milestone': {
      const levels = content.mines.map((m) => mineLevel(state, m.id));
      return { value: Math.max(0, ...levels), target: condition.level };
    }
    case 'stage_stars': {
      let n = 0;
      for (const key of Object.keys(state.combat.stageKills)) {
        if (stageStarLevel(state, content, key) >= condition.level) n++;
      }
      return { value: n, target: condition.count };
    }
    case 'dungeon_starred': {
      const done = content.dungeons.some((d) =>
        stageFloors(content, d).every((floor) =>
          (condition.difficulty ? [condition.difficulty] : STAR_DIFFICULTIES).every(
            (diff) =>
              stageStarLevel(state, content, stageKey(d.id, diff, floor)) >= condition.level,
          ),
        ),
      );
      return { value: done ? 1 : 0, target: 1 };
    }
    case 'tier_cleared': {
      const beaten = content.dungeons.filter(
        (d) =>
          floorPosition(state, d, condition.difficulty).best >= floorCount(d, condition.difficulty),
      ).length;
      return { value: beaten, target: condition.count ?? content.dungeons.length };
    }
    case 'endless_depth': {
      const deepest = Math.max(
        0,
        ...content.dungeons.map((d) => floorPosition(state, d, 'endless').best),
      );
      return { value: deepest, target: condition.depth };
    }
    case 'star_total':
      return { value: totalStageStarLevels(state, content), target: condition.amount };
    case 'workers':
      return {
        value: Object.values(activeWorkers(state, content)).reduce((n, ids) => n + ids.length, 0),
        target: condition.count,
      };
    case 'tool_levels':
      return {
        value: Object.values(state.production.tools).reduce((n, level) => n + level, 0),
        target: condition.amount,
      };
    case 'depth':
      return {
        value: Math.max(1, ...Object.values(state.production.depth).map((d) => d.layer)),
        target: condition.layer,
      };
    case 'forge_working': {
      const working =
        state.production.forge.recipe !== null && forgeWorker(state, content) !== null;
      return { value: working ? 1 : 0, target: 1 };
    }
    case 'wishlist':
      return { value: state.cards.wishlist.length, target: condition.count };
    case 'wishlist_owned':
      return {
        value: state.cards.wishlist.filter((id) => state.cards.owned[id]).length,
        target: condition.count,
      };
    case 'skills_learned':
      return {
        value: Object.values(state.account.skills).filter((rank) => rank > 0).length,
        target: condition.amount,
      };
    case 'keystones': {
      const keys = content.account.tree.filter(
        (n) => n.kind === 'keystone' && (state.account.skills[n.id] ?? 0) > 0,
      );
      return { value: keys.length, target: condition.amount };
    }
    case 'circles_open':
      return {
        value: weaponCircles(state, content).filter((c) => c.revealed).length,
        target: condition.amount,
      };
    case 'max_cosmetic': {
      const maxed = Object.entries(state.cosmetics.owned).some(([id, o]) => {
        const c = content.cosmeticById.get(id);
        return !!c && !c.starter && o.level >= cosmeticMaxLevel(content, c);
      });
      return { value: maxed ? 1 : 0, target: 1 };
    }
  }
}

/** Whether an achievement's condition is met now (unlocked or not). */
function met(state: GameState, content: Content, achievement: Achievement): boolean {
  const { value, target } = measure(state, content, achievement.condition);
  return value >= target;
}

/** Grants a reward (mutates `state`, a fresh copy). */
function grantReward(state: GameState, achievement: Achievement): void {
  for (const id of achievement.reward.cosmetics) grantCosmetic(state, id);
  for (const r of achievement.reward.resources) {
    state.resources[r.resource] = (state.resources[r.resource] ?? new Decimal(0)).add(r.amount);
  }
}

/** Whether any locked achievement's condition is met (a settle would unlock it). */
export function achievementsDue(state: GameState, content: Content): boolean {
  return content.achievements.some((a) => !(a.id in state.achievements) && met(state, content, a));
}

/**
 * Unlocks every achievement whose condition is met (mutates `state`), grants the rewards and
 * lists the ids in `report.achievements`. Rewards can meet further conditions, so it repeats
 * until nothing new unlocks.
 */
export function settleAchievements(
  state: GameState,
  content: Content,
  report?: TickReport,
): string[] {
  const unlocked: string[] = [];
  for (let pass = 0; pass < content.achievements.length; pass++) {
    const fresh = content.achievements.filter(
      (a) => !(a.id in state.achievements) && met(state, content, a),
    );
    if (fresh.length === 0) break;
    for (const a of fresh) {
      state.achievements[a.id] = state.stats.playTimeMs;
      grantReward(state, a);
      unlocked.push(a.id);
    }
  }
  report?.achievements.push(...unlocked);
  return unlocked;
}

/** Unlocks whatever an action just earned. Call after pulls, star-ups, equips, ascensions, ... */
export function checkAchievements(
  state: GameState,
  content: Content,
): { state: GameState; unlocked: string[] } {
  if (!achievementsDue(state, content)) return { state, unlocked: [] };
  const next = cloneState(state);
  return { state: next, unlocked: settleAchievements(next, content) };
}

export interface AchievementEntry {
  achievement: Achievement;
  unlocked: boolean;
  /** Play time (ms) when unlocked, or null. */
  unlockedAt: number | null;
  /** The value read from the state and the target (e.g. 5000 / 10000 gems). */
  value: number;
  target: number;
  /** 0..1 (1 once unlocked). */
  progress: number;
}

/** Every achievement in data order with its progress, for the sticker book. */
export function achievementList(state: GameState, content: Content): AchievementEntry[] {
  return content.achievements.map((achievement) => {
    const at = state.achievements[achievement.id];
    const { value, target } = measure(state, content, achievement.condition);
    const unlocked = at !== undefined;
    const progress = unlocked ? 1 : target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
    return { achievement, unlocked, unlockedAt: at ?? null, value, target, progress };
  });
}

// ---- shard shop --------------------------------------------------------------------------------

export interface ShardOffer {
  item: Content['shardShop'][number];
  price: number;
  affordable: boolean;
  /** Purchases made. */
  bought: number;
  /** Purchases left, or null when unlimited. */
  left: number | null;
}

/** The shard shop, in data order. */
export function shardShop(state: GameState, content: Content): ShardOffer[] {
  return content.shardShop.map((item) => {
    const bought = state.shardShop[item.id] ?? 0;
    const left = item.stock === null ? null : Math.max(0, item.stock - bought);
    return {
      item,
      price: item.price,
      affordable: state.cards.shards >= item.price && left !== 0,
      bought,
      left,
    };
  });
}

export type ShardBuyResult =
  | { ok: true; state: GameState; gain: CardGain | CosmeticGain | null }
  | { ok: false; reason: 'unknown' | 'sold-out' | 'unaffordable' };

/** Spends card shards on one shop item: a card copy, a resource bundle or a cosmetic. */
export function buyShardItem(state: GameState, content: Content, itemId: string): ShardBuyResult {
  const item = content.shardShop.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: 'unknown' };
  const bought = state.shardShop[itemId] ?? 0;
  if (item.stock !== null && bought >= item.stock) return { ok: false, reason: 'sold-out' };
  if (state.cards.shards < item.price) return { ok: false, reason: 'unaffordable' };
  const next = cloneState(state);
  next.cards.shards -= item.price;
  next.shardShop[itemId] = bought + 1;
  const r = item.reward;
  let gain: CardGain | CosmeticGain | null = null;
  if (r.kind === 'card') gain = grantCard(next.cards, content, content.cardById.get(r.card)!);
  else if (r.kind === 'cosmetic') gain = grantCosmetic(next, r.cosmetic);
  else next.resources[r.resource] = (next.resources[r.resource] ?? new Decimal(0)).add(r.amount);
  return { ok: true, state: next, gain };
}
