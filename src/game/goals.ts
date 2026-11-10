import { type Content, type GoalKind, type GoalPage, type GoalRule } from '../data';
import { curveBulkPrice, MAX_BULK_LEVELS } from './bulk';
import { starUpCheck, tierUpCheck } from './cards';
import {
  averageDps,
  bossMaxHp,
  burstStats,
  effectiveDrops,
  isDungeonCleared,
  isDungeonUnlocked,
  secondsPerKill,
  survivalSeconds,
  trialRewards,
} from './combat';
import { bossMastery, gemMastery, MAX_MASTERY_TIER, metalOf } from './mastery';
import { milestoneInfo } from './milestones';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { runPoints, starlightGain } from './prestige';
import { Decimal } from './num';
import {
  isProducerUnlocked,
  mineLevel,
  PRODUCTION_JOBS,
  productionPerSecond,
  treeUnlockCost,
  type Price,
} from './production';
import type { GameState } from './state';

const TIER_NAMES: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
  mythic: 'Mythic',
  heirloom: 'Heirloom',
};

/**
 * The goal tracker (DESIGN.md §10): the next few things to aim for, picked by the rules in
 * progression.json (never a fixed script) and sorted by estimated time. Each goal carries a
 * progress bar (0..1), an ETA in seconds when one can be estimated from the current rates, and
 * the page to jump to.
 */

export interface Goal {
  /** `<kind>:<targetId>`, stable across ticks (for keys and animations). */
  id: string;
  kind: GoalKind;
  /** The dungeon, special dungeon, tree, mine, gem or card it is about. */
  targetId: string;
  /** Ready to show, e.g. "Clear Ember Crypt → Crystal Grotto". */
  title: string;
  /** 0..1. */
  progress: number;
  /** Estimated seconds at the current rates (0 = can be done now); null when it cannot be
   *  estimated (nothing earns what is missing, or a boss knocks the loadout out first). */
  etaSeconds: number | null;
  /** Page to jump to on click. */
  page: GoalPage;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const ratio = (have: Decimal, need: Decimal): number =>
  need.lte(0) ? 1 : clamp01(have.div(need).toNumber());
const metalName = (tier: number): string => {
  const m = metalOf(tier);
  return m.charAt(0).toUpperCase() + m.slice(1);
};

// ---- rates -------------------------------------------------------------------------------------

/**
 * Seconds per kill in a dungeon, or null when no damage is dealt or the boss would knock the
 * loadout out before it dies (a wall until the player gets stronger).
 */
function killSeconds(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[],
): number | null {
  const dungeon = content.dungeonById.get(dungeonId);
  const spk = secondsPerKill(state, content, dungeonId, modifiers);
  if (!dungeon || spk === null || !(spk > 0) || !Number.isFinite(spk)) return null;
  // The same "you fall in" figure the stage shows (DESIGN.md §6): the loadout falls first.
  const survival = survivalSeconds(state, content, dungeonId, modifiers);
  if (survival !== null && survival < spk) return null;
  return spk;
}

/** Score the loadout reaches in one special dungeon attempt at its average damage, 0..1. */
function trialCapability(
  state: GameState,
  content: Content,
  trialId: string,
  modifiers: readonly Modifier[],
): number {
  const trial = content.trialById.get(trialId);
  if (!trial) return 0;
  const dealt = averageDps(state, content, trialId, modifiers).mul(trial.durationSeconds);
  return ratio(dealt, trial.target.hp);
}

/**
 * Units of a resource earned per second at the current rates: production with the average
 * harvest burst, plus the drops of whatever is being fought (dungeon drops per kill on average,
 * or the special dungeon's rewards per attempt at the score it reaches).
 */
export function incomePerSecond(
  state: GameState,
  content: Content,
  resourceId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Decimal {
  let total = new Decimal(0);
  const produced = productionPerSecond(state, content, modifiers)[resourceId];
  if (produced) {
    const job = PRODUCTION_JOBS.find((j) =>
      (j === 'logging' ? content.trees : content.mines).some((p) => p.resource === resourceId),
    );
    const burst = job ? burstStats(content, job, modifiers) : null;
    const extra =
      burst && burst.fill > 0 ? burst.power.mul(burst.fill / (burst.size * burst.interval)) : 0;
    total = total.add(produced.mul(new Decimal(extra).add(1)));
  }
  const active = state.activeDungeonId;
  const dungeon = active ? content.dungeonById.get(active) : undefined;
  if (dungeon) {
    const drops = effectiveDrops(dungeon, modifiers, content);
    // The wage is paid for every second of fighting.
    if (drops.wage?.resource === resourceId) total = total.add(drops.wage.perSecond);
    const spk = killSeconds(state, content, dungeon.id, modifiers);
    if (spk !== null) {
      let perKill = 0;
      for (const currency of drops.currencies) {
        if (currency.resource !== resourceId) continue;
        perKill += ((currency.min + currency.max) / 2) * (currency.multiplier ?? 1);
      }
      if (drops.material.resource === resourceId) {
        perKill += drops.material.chance * drops.material.amount;
      }
      for (const extra of drops.extraMaterials) {
        if (extra.resource === resourceId) perKill += (extra.min + extra.max) / 2;
      }
      total = total.add(perKill / spk);
    }
  }
  const trial = active ? content.trialById.get(active) : undefined;
  if (trial) {
    const score = trialCapability(state, content, trial.id, modifiers);
    const reward = trialRewards(trial, score, modifiers).find((r) => r.resource === resourceId);
    if (reward) total = total.add(reward.amount.div(trial.durationSeconds));
  }
  return total;
}

/** Seconds until every price is affordable at the current income (0 now, null never). */
function secondsToAfford(
  state: GameState,
  content: Content,
  prices: readonly Price[],
  modifiers: readonly Modifier[],
): number | null {
  let worst = 0;
  for (const p of prices) {
    const missing = p.amount.sub(state.resources[p.resource] ?? 0);
    if (missing.lte(0)) continue;
    const income = incomePerSecond(state, content, p.resource, modifiers);
    if (income.lte(0)) return null;
    worst = Math.max(worst, missing.div(income).toNumber());
  }
  return Number.isFinite(worst) ? worst : null;
}

function priceProgress(state: GameState, prices: readonly Price[]): number {
  return prices.reduce(
    (min, p) => Math.min(min, ratio(state.resources[p.resource] ?? new Decimal(0), p.amount)),
    1,
  );
}

// ---- rules -------------------------------------------------------------------------------------

type Candidate = Omit<Goal, 'id' | 'kind' | 'page'>;
type RuleFn = (state: GameState, content: Content, modifiers: readonly Modifier[]) => Candidate[];

const clearDungeon: RuleFn = (state, content, modifiers) =>
  content.dungeons
    .filter((d) => isDungeonUnlocked(state, content, d.id) && !isDungeonCleared(state, d.id))
    .map((d) => {
      const opens = [
        ...content.mines.filter((m) => m.unlockedByDungeon === d.id).map((m) => m.name),
        ...[...content.dungeons, ...content.trials]
          .filter((x) => x.unlockedBy === d.id)
          .map((x) => x.name),
      ];
      const maxHp = bossMaxHp(d, state.prestigeCount, modifiers);
      const fighting = state.activeDungeonId === d.id;
      const hp = fighting && state.bossHp ? Decimal.min(state.bossHp, maxHp) : maxHp;
      const kills = Math.max(1, d.killsToClear - (state.combat.kills[d.id] ?? 0));
      const spk = killSeconds(state, content, d.id, modifiers);
      const eta = spk === null ? null : (kills - 1) * spk + hp.div(maxHp).toNumber() * spk;
      return {
        targetId: d.id,
        title: opens.length ? `Clear ${d.name} → ${opens[0]}` : `Clear ${d.name}`,
        progress:
          d.killsToClear > 1
            ? ratio(new Decimal(d.killsToClear - kills), new Decimal(d.killsToClear))
            : clamp01(1 - hp.div(maxHp).toNumber()),
        etaSeconds: eta,
      };
    });

const clearTrial: RuleFn = (state, content, modifiers) =>
  content.trials
    .filter((t) => isDungeonUnlocked(state, content, t.id) && !isDungeonCleared(state, t.id))
    .map((t) => {
      const capable = trialCapability(state, content, t.id, modifiers) >= 1;
      const elapsed = state.activeDungeonId === t.id ? state.combat.trialAttempt.elapsedSeconds : 0;
      return {
        targetId: t.id,
        title: `Clear ${t.name}`,
        progress: clamp01(state.combat.trialBest[t.id] ?? 0),
        etaSeconds: capable ? Math.max(0, t.durationSeconds - elapsed) : null,
      };
    });

const unlockTree: RuleFn = (state, content, modifiers) =>
  content.trees
    .filter((t) => !isProducerUnlocked(state, content, 'logging', t.id))
    .map((t) => {
      const prices = treeUnlockCost(content, t.id, modifiers);
      return {
        targetId: t.id,
        title: `Unlock ${t.name}`,
        progress: priceProgress(state, prices),
        etaSeconds: secondsToAfford(state, content, prices, modifiers),
      };
    });

const mineMilestone: RuleFn = (state, content, modifiers) =>
  content.mines
    .filter((m) => isProducerUnlocked(state, content, 'mining', m.id))
    .map((m) => {
      const level = mineLevel(state, m.id);
      const info = milestoneInfo(m.level.milestones, level);
      const ctx = { job: 'mining' as const, producer: m.id, resource: m.resource };
      const count = Math.min(info.levelsToNext, MAX_BULK_LEVELS);
      const price = curveBulkPrice(m.level.cost, level, count, modifiers, ctx);
      return {
        targetId: m.id,
        title: `${m.name} Lv ${info.nextLevel} (×${info.nextMultiplier.toString()})`,
        progress: info.progress,
        etaSeconds: secondsToAfford(state, content, [price], modifiers),
      };
    });

const gemMasteryRule: RuleFn = (state, content, modifiers) =>
  content.resources
    .filter((r) => r.kind === 'tree_gem' || r.kind === 'mine_gem')
    .flatMap((r) => {
      const m = gemMastery(state, content, r.id);
      if (m.tier >= MAX_MASTERY_TIER || !m.nextThreshold) return [];
      const income = incomePerSecond(state, content, r.id, modifiers);
      if (m.total.lte(0) && income.lte(0)) return [];
      const missing = m.nextThreshold.sub(m.total);
      return [
        {
          targetId: r.id,
          title: `${r.name} mastery: ${metalName(m.tier + 1)}`,
          progress: m.progress,
          etaSeconds: missing.lte(0) ? 0 : income.gt(0) ? missing.div(income).toNumber() : null,
        },
      ];
    });

const bossMasteryRule: RuleFn = (state, content, modifiers) => {
  const out: Candidate[] = [];
  for (const d of content.dungeons) {
    const m = bossMastery(state, content, d.id);
    if (!m || m.tier >= MAX_MASTERY_TIER || m.nextThreshold === null) continue;
    if (!isDungeonUnlocked(state, content, d.id) || m.value <= 0) continue;
    const spk = killSeconds(state, content, d.id, modifiers);
    const left = Math.max(0, m.nextThreshold - m.value);
    out.push({
      targetId: d.id,
      title: `${d.boss.name} medal: ${metalName(m.tier + 1)}`,
      progress: m.progress,
      etaSeconds: left === 0 ? 0 : spk === null ? null : left * spk,
    });
  }
  for (const t of content.trials) {
    const m = bossMastery(state, content, t.id);
    if (!m || m.tier >= MAX_MASTERY_TIER || m.nextThreshold === null) continue;
    if (!isDungeonUnlocked(state, content, t.id)) continue;
    const capable = trialCapability(state, content, t.id, modifiers) >= m.nextThreshold;
    out.push({
      targetId: t.id,
      title: `${t.name} medal: ${metalName(m.tier + 1)}`,
      progress: m.progress,
      etaSeconds: capable ? t.durationSeconds : null,
    });
  }
  return out;
};

/**
 * Fill a card's star bar (DESIGN.md §5): cards that hold some fill but not enough for the next
 * star. Copies come from summons and the shard shop, so there is no ETA.
 */
const starUpRule: RuleFn = (state, content) =>
  content.cards.flatMap((card) => {
    const owned = state.cards.owned[card.id];
    if (!owned) return [];
    const check = starUpCheck(state, content, card.id);
    const fill = check?.requirements[0];
    if (!check?.available || check.met || !fill || fill.have.lte(0)) return [];
    return [
      {
        targetId: card.id,
        title: `Fill ${card.name}'s star bar for ★${owned.stars + 1}`,
        progress: ratio(fill.have, fill.need),
        etaSeconds: null,
      },
    ];
  });

/**
 * Tier up a card that is at its level cap (DESIGN.md §5): short of ★6 the goal shows the stars
 * (no ETA, copies come from summons); otherwise progress is the scarcest of Money, Core and gems
 * and the ETA is the time to earn what is missing.
 */
const tierUpRule: RuleFn = (state, content, modifiers) =>
  content.cards.flatMap((card) => {
    const owned = state.cards.owned[card.id];
    if (!owned) return [];
    const check = tierUpCheck(state, content, card.id, modifiers);
    if (!check?.available || check.met || !check.to) return [];
    const level = check.requirements.find((r) => r.kind === 'level');
    if (!level?.met) return [];
    // At its level cap but short of ★6: the missing requirement is the stars (DESIGN.md §5).
    const stars = check.requirements.find((r) => r.kind === 'stars');
    if (stars && !stars.met) {
      return [
        {
          targetId: card.id,
          title: `Tier up ${card.name} to ${TIER_NAMES[check.to.tier]}: needs ★${stars.need.toString()}`,
          progress: ratio(stars.have, stars.need),
          etaSeconds: null,
        },
      ];
    }
    const prices: Price[] = check.requirements
      .filter((r) => r.kind === 'resource' && r.resource)
      .map((r) => ({ resource: r.resource!, amount: r.need }));
    return [
      {
        targetId: card.id,
        title: `Tier up ${card.name} to ${TIER_NAMES[check.to.tier]}`,
        progress: priceProgress(state, prices),
        etaSeconds: secondsToAfford(state, content, prices, modifiers),
      },
    ];
  });

/**
 * The next ascension: progress is the Starlight gain over the minimum; the ETA is the weighted
 * gem points still missing over the rate the current production earns them.
 */
const ascensionRule: RuleFn = (state, content, modifiers) => {
  const { divisor, exponent, minimum, tierWeights } = content.prestige.gain;
  const gain = starlightGain(state, content, modifiers);
  const progress = clamp01(gain.toNumber() / minimum);
  let eta: number | null = 0;
  if (gain.lt(minimum)) {
    // Points needed so that (points / divisor) ^ exponent, through prestige.gain, reaches it.
    const factor = statValue('prestige.gain', 1, modifiers).toNumber();
    const needed = factor > 0 ? divisor.mul(new Decimal(minimum / factor).pow(1 / exponent)) : null;
    let rate = new Decimal(0);
    for (const r of content.resources) {
      if (r.kind !== 'tree_gem' && r.kind !== 'mine_gem') continue;
      const weight = tierWeights[Math.min(r.tier, tierWeights.length) - 1]!;
      rate = rate.add(incomePerSecond(state, content, r.id, modifiers).mul(weight));
    }
    const missing = needed ? needed.sub(runPoints(state, content)) : null;
    eta = missing && rate.gt(0) ? Math.max(0, missing.div(rate).toNumber()) : null;
  }
  return [
    {
      targetId: 'ascension',
      title: `Ascend: ${gain.toString()} / ${minimum} Starlight`,
      progress,
      etaSeconds: eta,
    },
  ];
};

const RULES: Record<GoalKind, RuleFn> = {
  clear_dungeon: clearDungeon,
  clear_trial: clearTrial,
  unlock_tree: unlockTree,
  mine_milestone: mineMilestone,
  gem_mastery: gemMasteryRule,
  boss_mastery: bossMasteryRule,
  star_up: starUpRule,
  tier_up: tierUpRule,
  ascension: ascensionRule,
};

function goalsOf(
  rule: GoalRule,
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
): Goal[] {
  return RULES[rule.kind](state, content, modifiers)
    .filter((c) => c.progress >= rule.minProgress)
    .map((c) => ({ ...c, id: `${rule.kind}:${c.targetId}`, kind: rule.kind, page: rule.page }));
}

/** Nearest first: by ETA (unknown last), then by progress (furthest along first), then id. */
function compareGoals(a: Goal, b: Goal): number {
  const ea = a.etaSeconds ?? Infinity;
  const eb = b.etaSeconds ?? Infinity;
  if (ea !== eb) return ea < eb ? -1 : 1;
  if (a.progress !== b.progress) return b.progress - a.progress;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every goal the data's rules find, nearest by estimated time first. */
export function allGoals(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Goal[] {
  return content.progression.goals
    .flatMap((rule) => goalsOf(rule, state, content, modifiers))
    .sort(compareGoals);
}

/** The `n` nearest goals (by estimated time) for the header widget. */
export function nextGoals(
  state: GameState,
  content: Content,
  n = 3,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Goal[] {
  return allGoals(state, content, modifiers).slice(0, Math.max(0, n));
}

/**
 * Seconds until one price (a tree or mine level cost) is affordable at the current income:
 * 0 when affordable now, null when the resource earns nothing (the Production "Next buy" wait).
 */
export function timeToAfford(
  state: GameState,
  content: Content,
  price: Price,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): number | null {
  return secondsToAfford(state, content, [price], modifiers);
}
