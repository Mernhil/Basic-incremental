/**
 * Balance sim, DESIGN.md 11.7, 12.15 and 16 E9: plays the real game logic fast with a scripted
 * player and records when each beta pacing milestone is reached.
 *
 * The buyer (Phase 9), every step:
 * - buys card star-ups and tier-ups, tree kinds, cosmetic levels, summons (10-pulls when
 *   affordable, else single pulls), Starlight shop levels (cheapest first) and skill points (a
 *   priority list) as soon as they are affordable, and rebuilds each card's enhancements as the
 *   best set its budget allows;
 * - keeps the resources the next waiting card upgrade or tree kind needs (reservations);
 * - spends its Money on the economy purchase with the best gain per Money: a damage line
 *   (relative DPS gain, with bulk buys up to the next x2 milestone), a mine level (relative gain
 *   of the weighted production) or a plot / slot (the same for the job's share), waiting for the
 *   best one unless a cheaper one costs a small share of it. Card upgrades use gems and Cores
 *   only, so they never compete with Money;
 * - spreads plots / slots over the unlocked producers, fills loadouts with the rarest cards,
 *   equips complete cosmetic sets;
 * - fights: the Glimmer Trial once it can score 100%, else a newly killable dungeon, else the
 *   cleared trial for cosmetic materials within a time share, else a dungeon whose Core a card
 *   waits for, else the hardest killable one (every dungeon pays Money and both crystals);
 * - ascends once the run's Starlight per hour has passed its peak.
 * Mastery, milestones, crits, achievements and account levels come from the real game rules.
 */
import {
  JOBS,
  RANK_TIERS,
  RARITIES,
  type Content,
  type Job,
  type ProductionJob,
} from '../../src/data';
import {
  advance,
  type OwnedCard,
  bossAttackDps,
  buyDamageLevels,
  buyExpansion,
  buyMineLevel,
  cardPower,
  collectModifiers,
  createInitialState,
  createSeededRng,
  damageLevel,
  damageLineDps,
  damageLineOffer,
  damageUpgradeCost,
  Decimal,
  emptyCardLoadout,
  expansionCost,
  incomePerSecond,
  isDamageLineUnlocked,
  isDungeonCleared,
  isDungeonUnlocked,
  isProducerUnlocked,
  loadoutCostCap,
  loadoutMaxHealth,
  mineLevel,
  upgradeShelf,
  buyUpgrade,
  treeLevel,
  treeLevelCost,
  buyTreeLevel,
  mineLevelCost,
  nextMilestone,
  productionPerSecond,
  plotCapacity,
  producerRate,
  secondsPerKill,
  setActiveDungeon,
  setLoadout,
  starUp,
  starUpCheck,
  tierUp,
  tierUpCheck,
  treeUnlockCost,
  unlockTree,
  unlockedProducers,
  averageDps,
  baseDamage,
  cloneState,
  cardCost,
  pull,
  pullPrice,
  ascend,
  ascensionPreview,
  buyStarlightItem,
  starlightShop,
  skillTree,
  buySkill,
  cardEnhancements,
  chooseEnhancement,
  resetEnhancements,
  cosmeticMaxLevel,
  cosmeticUpgradeCheck,
  upgradeCosmetic,
  equipCosmetic,
  type CardLoadout,
  type GameState,
  type Modifier,
  type Price,
  type Rng,
} from '../../src/game';

// ---- milestones (DESIGN.md 11.7) ---------------------------------------------------------------

export interface Milestone {
  id: string;
  label: string;
  targetHours: number;
  /** Whether the state has reached it. */
  reached: (state: GameState, content: Content, log: SimLog) => boolean;
  /** Set while the system the milestone needs is not built yet. */
  pending?: string;
}

/** Counters the sim keeps beside the state (things the state does not record). */
export interface SimLog {
  summons: number;
  /** Account level -> sim seconds when first reached. */
  levelAt: Record<number, number>;
  /** Sim seconds of each ascension. */
  ascensions: number[];
  /** Seconds spent fighting each dungeon / trial. */
  fought: Record<string, number>;
}

const tierAtLeast = (state: GameState, tier: (typeof RANK_TIERS)[number]): boolean =>
  Object.values(state.cards.owned).some(
    (c) => RANK_TIERS.indexOf(c.tier) >= RANK_TIERS.indexOf(tier),
  );
const tierRank = (tier: (typeof RANK_TIERS)[number]): number => RANK_TIERS.indexOf(tier);
const cleared = (id: string) => (state: GameState) => isDungeonCleared(state, id);

export const MILESTONES: Milestone[] = [
  {
    id: 'clear_d1',
    label: 'First dungeon cleared',
    targetHours: 0.5,
    reached: cleared('mossy_cellar'),
  },
  {
    id: 'first_summon',
    label: 'First summon',
    targetHours: 0.75,
    reached: (_s, _c, log) => log.summons > 0,
  },
  {
    id: 'first_silver',
    label: 'First Silver card',
    targetHours: 1.5,
    reached: (s) => tierAtLeast(s, 'silver'),
  },
  { id: 'clear_d2', label: 'Dungeon 2 cleared', targetHours: 3, reached: cleared('ember_crypt') },
  {
    id: 'first_gold',
    label: 'First Gold card',
    targetHours: 5,
    reached: (s) => tierAtLeast(s, 'gold'),
  },
  {
    id: 'first_star6',
    label: 'First ★6 (Gold)',
    targetHours: 7,
    // Gold ★6 is the first unique evolution (a lower-tier ★6 comes long before Gold).
    reached: (s) =>
      Object.values(s.cards.owned).some(
        (c) => c.stars >= 6 && tierRank(c.tier) >= tierRank('gold'),
      ),
  },
  {
    id: 'first_prestige',
    label: 'First prestige (Ascension)',
    targetHours: 8,
    reached: (s) => s.prestigeCount > 0,
  },
  {
    id: 'clear_d3',
    label: 'Dungeon 3 cleared',
    targetHours: 12,
    reached: cleared('frostspire_vault'),
  },
  {
    id: 'clear_trial',
    label: 'Glimmer Trial cleared',
    targetHours: 15,
    reached: cleared('glimmer_trial'),
  },
  {
    id: 'first_prismatic',
    label: 'First Prismatic card',
    targetHours: 25,
    reached: (s) => tierAtLeast(s, 'prismatic'),
  },
  {
    id: 'max_cosmetic',
    label: 'First max-level cosmetic',
    targetHours: 20,
    reached: (s, c) =>
      Object.entries(s.cosmetics.owned).some(([id, o]) => {
        const cosmetic = c.cosmeticById.get(id);
        return !!cosmetic && !cosmetic.starter && o.level >= cosmeticMaxLevel(c, cosmetic);
      }),
  },
  {
    id: 'exhausted',
    label: 'Beta content mostly exhausted',
    targetHours: 40,
    // Every other milestone reached, every card owned and a card maxed out (Prismatic ★6).
    reached: (s, c, log) =>
      c.cards.every((card) => s.cards.owned[card.id]) &&
      Object.values(s.cards.owned).some((card) => card.tier === 'prismatic' && card.stars >= 6) &&
      MILESTONES.every((m) => m.id === 'exhausted' || m.reached(s, c, log)),
  },
];

// ---- buyer priorities --------------------------------------------------------------------------

/** Account tree nodes in the order the buyer fills them (each up to its max rank). */
export const SKILL_PRIORITY = [
  'might',
  'vigor',
  'keen_eye',
  'crystal_luck',
  'core_luck',
  'vein_yield',
  'grove_yield',
  'quick_study',
  'brutal',
  'deep_pockets',
  'guard',
  'deep_levels',
  'renown',
  'vein_rhythm',
  'grove_rhythm',
  'trial_focus',
  'vein_bounty',
  'grove_bounty',
  'starlit_mind',
  'rare_luck',
  'pity_sense',
  'wide_groves',
  'long_watch',
];

/** Starlight shop items the buyer buys (cheapest level first); the offline cap is useless here. */
const STARLIGHT_SKIP = new Set(['long_night']);

/** How much the buyer values an enhancement option, by the stat of its first modifier. */
const ENHANCEMENT_WEIGHT: Record<string, number> = {
  'combat.damage': 3,
  'production.rate': 3,
  'combat.health': 2.5,
  'combat.critChance': 2,
  'combat.critDamage': 2,
  'burst.fill': 2,
  'burst.power': 2,
  'drops.materialChance': 1.5,
  'drops.crystalMultiplier': 1.5,
  'xp.card': 1,
};

/** An unaffordable best purchase is waited for unless another costs at most this share of it. */
const CHEAP_SHARE = 0.1;

// ---- the buyer ---------------------------------------------------------------------------------

/** Which kind of purchase a candidate is. */
export type CandidateKind =
  'card' | 'tree' | 'cosmetic' | 'summon' | 'skill' | 'starlight' | 'economy';

export interface Candidate {
  /** `damage:<line>[:x<n>]`, `mine:<mine>`, `expand:<job>`, `tree:<tree>`, `star:<card>`,
   *  `tier:<card>`, `skill:<node>`, `starlight:<item>`, `cosmetic:<item>`, `summon:<portal>[:10]`. */
  id: string;
  kind: CandidateKind;
  prices: Price[];
  /** Seconds until affordable at the current income; 0 = now; null = nothing earns it. */
  eta: number | null;
  /** Economy purchases: relative gain in their domain (damage or that gem's / job's output). */
  gain?: number;
  /** Card upgrades: how advanced the card is (tier, stars, level), higher goes first. */
  cardRank?: number;
  /** A tier-up still short of its level: never bought, but its resources are kept for it. */
  hold?: boolean;
  buy: (state: GameState, content: Content, modifiers: Modifier[], rng: Rng) => GameState | null;
}

function etaOf(
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

const okState = (r: { ok: boolean; state?: GameState }): GameState | null =>
  r.ok ? (r.state ?? null) : null;

const num = (d: Decimal): number => d.toNumber();

/**
 * How much the buyer values a share of the weighted production against the same share of damage.
 * Production only feeds card upgrades and tree kinds now (DESIGN.md 11.13), while damage feeds
 * every kill, Money included.
 */
export const PRODUCTION_VALUE = 0.35;

/** Weighted production per second of every unlocked gem: Σ rate × Starlight tier weight. */
function weightedProduction(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
  resources?: readonly string[],
): number {
  const weights = content.prestige.gain.tierWeights;
  let total = 0;
  for (const [id, rate] of Object.entries(productionPerSecond(state, content, modifiers))) {
    if (resources && !resources.includes(id)) continue;
    const tier = content.resourceById.get(id)?.tier ?? 1;
    total += num(rate) * num(weights[Math.min(tier, weights.length) - 1]!);
  }
  return total;
}

/** The economy purchases (damage lines, mine levels, plots / slots) with their gains. */
function economyCandidates(
  state: GameState,
  content: Content,
  modifiers: Modifier[],
): Omit<Candidate, 'eta'>[] {
  const out: Omit<Candidate, 'eta'>[] = [];
  const base = num(baseDamage(state, content, modifiers));
  const totalProduction = weightedProduction(state, content, modifiers);
  for (const line of content.combat.damageUpgrades) {
    if (!isDamageLineUnlocked(state, content, line)) continue;
    const price = damageUpgradeCost(state, content, line.id, modifiers);
    if (!price) continue;
    const level = damageLevel(state, line.id);
    const dpsAt = (l: number): number => num(damageLineDps(line, l, modifiers));
    out.push({
      id: `damage:${line.id}`,
      kind: 'economy',
      prices: [price],
      gain: base > 0 ? (dpsAt(level + 1) - dpsAt(level)) / base : 1,
      buy: (s, c, m) => okState(buyDamageLevels(s, c, line.id, 1, m)),
    });
    // A bulk buy up to the next x2 milestone, valued with it.
    const toNext = nextMilestone(line.milestones, level).level - level;
    if (toNext > 1 && toNext <= 10 && line.milestones.multiplier.gt(1)) {
      const offer = damageLineOffer(state, content, line.id, toNext, modifiers);
      if (offer) {
        out.push({
          id: `damage:${line.id}:x${toNext}`,
          kind: 'economy',
          prices: [offer.price],
          gain: base > 0 ? (dpsAt(level + toNext) - dpsAt(level)) / base : 1,
          buy: (s, c, m) => okState(buyDamageLevels(s, c, line.id, toNext, m)),
        });
      }
    }
  }
  for (const mine of content.mines) {
    if (!isProducerUnlocked(state, content, 'mining', mine.id)) continue;
    const price = mineLevelCost(state, content, mine.id, modifiers);
    if (!price) continue;
    const level = mineLevel(state, mine.id);
    const now = num(producerRate(mine, 'mining', modifiers, level));
    const next = num(producerRate(mine, 'mining', modifiers, level + 1));
    // The mine's share of the weighted production grows by its relative gain.
    const share =
      totalProduction > 0
        ? weightedProduction(state, content, modifiers, [mine.resource]) / totalProduction
        : 1;
    out.push({
      id: `mine:${mine.id}`,
      kind: 'economy',
      prices: [price],
      gain: PRODUCTION_VALUE * (now > 0 ? ((next - now) / now) * share : 1),
      buy: (s, c, m) => okState(buyMineLevel(s, c, mine.id, m)),
    });
  }
  for (const tree of content.trees) {
    if (!isProducerUnlocked(state, content, 'logging', tree.id)) continue;
    const price = treeLevelCost(state, content, tree.id, modifiers);
    if (!price) continue;
    const level = treeLevel(state, tree.id);
    const now = num(producerRate(tree, 'logging', modifiers, level));
    const next = num(producerRate(tree, 'logging', modifiers, level + 1));
    const share =
      totalProduction > 0
        ? weightedProduction(state, content, modifiers, [tree.resource]) / totalProduction
        : 1;
    out.push({
      id: `tree:${tree.id}`,
      kind: 'economy',
      prices: [price],
      gain: PRODUCTION_VALUE * (now > 0 ? ((next - now) / now) * share : 1),
      buy: (s, c, m) => okState(buyTreeLevel(s, c, tree.id, m)),
    });
  }
  // The upgrade shelf: one-time multipliers; the gain is the relative rise of what they touch.
  for (const item of upgradeShelf(state, content, modifiers)) {
    if (item.status !== 'available') continue;
    const p = item.preview;
    const rise = p && num(p.before) > 0 ? (num(p.after) - num(p.before)) / num(p.before) : 0.05;
    out.push({
      id: `upgrade:${item.id}`,
      kind: 'economy',
      prices: [item.cost],
      gain: (p?.kind === 'damage' ? 1 : PRODUCTION_VALUE) * rise * 0.5,
      buy: (s, c) => okState(buyUpgrade(s, c, item.id)),
    });
  }
  for (const job of ['logging', 'mining'] as const) {
    const capacity = plotCapacity(state, content, job, modifiers);
    const gems = (job === 'logging' ? content.trees : content.mines).map((p) => p.resource);
    const share =
      totalProduction > 0
        ? weightedProduction(state, content, modifiers, gems) / totalProduction
        : 1;
    out.push({
      id: `expand:${job}`,
      kind: 'economy',
      prices: [expansionCost(state, content, job, modifiers)],
      gain: PRODUCTION_VALUE * (share / Math.max(1, capacity)),
      buy: (s, c, m) => okState(buyExpansion(s, c, job, m)),
    });
  }
  return out;
}

/** Every purchase the buyer considers right now, with its ETA (and gain for economy ones). */
export function buyerCandidates(
  state: GameState,
  content: Content,
  modifiers: Modifier[] = collectModifiers(state, content),
): Candidate[] {
  const out: Omit<Candidate, 'eta'>[] = economyCandidates(state, content, modifiers);
  for (const tree of content.trees) {
    if (isProducerUnlocked(state, content, 'logging', tree.id)) continue;
    out.push({
      id: `tree:${tree.id}`,
      kind: 'tree',
      prices: treeUnlockCost(content, tree.id, modifiers),
      buy: (s, c, m) => okState(unlockTree(s, c, tree.id, m)),
    });
  }
  for (const card of content.cards) {
    if (!state.cards.owned[card.id]) continue;
    for (const kind of ['tier', 'star'] as const) {
      const check =
        kind === 'star'
          ? starUpCheck(state, content, card.id, modifiers)
          : tierUpCheck(state, content, card.id, modifiers);
      if (!check?.available) continue;
      // Only worth waiting for when the duplicate and level are already there (a tier-up that
      // only lacks levels is held: its resources are kept).
      const short = check.requirements.filter((r) => r.kind !== 'resource' && !r.met);
      const hold = kind === 'tier' && short.length > 0 && short.every((r) => r.kind === 'level');
      if (short.length > 0 && !hold) continue;
      out.push({
        id: `${kind}:${card.id}`,
        kind: 'card',
        cardRank: cardProgress(content, state.cards.owned[card.id]!),
        hold,
        prices: check.requirements
          .filter((r) => r.kind === 'resource' && r.resource)
          .map((r) => ({ resource: r.resource!, amount: r.need })),
        buy: (s, c, m) =>
          okState(kind === 'star' ? starUp(s, c, card.id, m) : tierUp(s, c, card.id, m)),
      });
    }
  }
  // Account tree: the first node of the priority list it can buy (no resource price).
  const nodes = skillTree(state, content);
  for (const id of SKILL_PRIORITY) {
    const info = nodes.find((n) => n.node.id === id);
    if (!info?.canBuy) continue;
    out.push({
      id: `skill:${id}`,
      kind: 'skill',
      prices: [],
      buy: (s, c) => okState(buySkill(s, c, id)),
    });
    break;
  }
  // Starlight shop: the cheapest level of the useful items.
  const offers = starlightShop(state, content, modifiers)
    .filter((o) => o.price && !STARLIGHT_SKIP.has(o.item.id))
    .sort((a, b) => num(a.price!.amount) - num(b.price!.amount));
  const cheapest = offers[0];
  if (cheapest) {
    out.push({
      id: `starlight:${cheapest.item.id}`,
      kind: 'starlight',
      prices: [cheapest.price!],
      buy: (s, c, m) => okState(buyStarlightItem(s, c, cheapest.item.id, m)),
    });
  }
  // Cosmetic upgrade levels, once the duplicate is in hand (equipped right after).
  for (const id of Object.keys(state.cosmetics.owned)) {
    const check = cosmeticUpgradeCheck(state, content, id, modifiers);
    if (!check?.available || check.requirements.some((r) => r.kind === 'copies' && !r.met)) {
      continue;
    }
    out.push({
      id: `cosmetic:${id}`,
      kind: 'cosmetic',
      // The cosmetic closest to its top level (and cheapest to max) goes first.
      cardRank: cosmeticProgress(state, content, id),
      prices: check.requirements
        .filter((r) => r.kind === 'resource' && r.resource)
        .map((r) => ({ resource: r.resource!, amount: r.need })),
      buy: (s, c, m) => {
        const up = upgradeCosmetic(s, c, id, m);
        if (!up.ok) return null;
        const worn = equipCosmetic(up.state, c, id);
        return worn.ok ? worn.state : up.state;
      },
    });
  }
  // Summons: a 10-pull when affordable, else a single pull.
  for (const portal of content.portals) {
    for (const count of [10, 1] as const) {
      out.push({
        id: count === 10 ? `summon:${portal.id}:10` : `summon:${portal.id}`,
        kind: 'summon',
        prices: [pullPrice(portal, count, modifiers)],
        buy: (s, c, m, rng) => okState(pull(s, c, portal.id, count, rng, m)),
      });
    }
  }
  return out.map((c) => ({ ...c, eta: etaOf(state, content, c.prices, modifiers) }));
}

/** How far a card is along: tier, then stars, then level. */
function cardProgress(content: Content, owned: OwnedCard): number {
  return (RANK_TIERS.indexOf(owned.tier) * 10 + owned.stars) * 1000 + owned.level;
}

/** How far a cosmetic is along: its level, then the cheaper ladders first. */
function cosmeticProgress(state: GameState, content: Content, id: string): number {
  const cosmetic = content.cosmeticById.get(id);
  const level = state.cosmetics.owned[id]?.level ?? 0;
  return level * 100 + (10 - (cosmetic ? cosmeticMaxLevel(content, cosmetic) : 10));
}

const have = (state: GameState, resource: string): Decimal =>
  state.resources[resource] ?? new Decimal(0);

/**
 * Resources kept for what the buyer waits for: the cheapest waiting card upgrade per resource
 * set and the next tree kind. Economy purchases only spend what is left over.
 */
function reservations(state: GameState, candidates: readonly Candidate[]): Map<string, Decimal> {
  const reserved = new Map<string, Decimal>();
  const waiting = candidates
    .filter((c) => (c.kind === 'card' || c.kind === 'tree') && (c.eta !== 0 || c.hold))
    .sort((a, b) => (a.eta ?? Infinity) - (b.eta ?? Infinity));
  const claimed = new Set<string>();
  for (const c of waiting) {
    // One waiting purchase per resource: the soonest.
    if (c.prices.some((p) => claimed.has(p.resource))) continue;
    for (const p of c.prices) {
      claimed.add(p.resource);
      reserved.set(p.resource, Decimal.min(p.amount, have(state, p.resource)));
    }
  }
  return reserved;
}

function spendable(state: GameState, reserved: Map<string, Decimal>, prices: Price[]): boolean {
  return prices.every((p) =>
    have(state, p.resource)
      .sub(reserved.get(p.resource) ?? 0)
      .gte(p.amount),
  );
}

/** Order of the always-buy kinds when several are affordable. */
const KIND_ORDER: CandidateKind[] = ['card', 'tree', 'skill', 'starlight', 'cosmetic', 'summon'];

/**
 * The card upgrades to buy now, most advanced card first. A card that waits for a resource
 * (Cores) holds it back from every weaker card: the player finishes the lead card first.
 */
function focused(
  state: GameState,
  candidates: readonly Candidate[],
  kind: CandidateKind,
): Candidate[] {
  const cards = candidates
    .filter((c) => c.kind === kind)
    .sort((a, b) => (b.cardRank ?? 0) - (a.cardRank ?? 0));
  const claimed = new Map<string, Decimal>();
  const now: Candidate[] = [];
  let holding = false;
  for (const c of cards) {
    // Weaker cards only get what the cards before them do not wait for.
    const blocked = c.prices.some((p) => {
      const kept = claimed.get(p.resource);
      return kept !== undefined && have(state, p.resource).sub(p.amount).lt(kept);
    });
    if (blocked) continue;
    if (c.eta === 0 && !c.hold) {
      now.push(c);
      continue;
    }
    if (c.hold) {
      if (holding) continue; // only the lead card's tier-up is held
      holding = true;
    }
    for (const p of c.prices)
      claimed.set(p.resource, (claimed.get(p.resource) ?? new Decimal(0)).add(p.amount));
  }
  return now;
}

/** The next purchase to make now, or null to wait. */
function pickPurchase(state: GameState, candidates: readonly Candidate[]): Candidate[] {
  const ready = candidates.filter((c) => c.eta === 0);
  const picks: Candidate[] = [];
  for (const kind of KIND_ORDER) {
    if (kind === 'card' || kind === 'cosmetic') picks.push(...focused(state, candidates, kind));
    else picks.push(...ready.filter((c) => c.kind === kind));
  }
  // Economy: per resource, the best gain per unit of price; wait for it unless a cheap one fits.
  const reserved = reservations(state, candidates);
  const byResource = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.kind !== 'economy' || c.gain === undefined || c.prices.length !== 1) continue;
    const r = c.prices[0]!.resource;
    byResource.set(r, [...(byResource.get(r) ?? []), c]);
  }
  const score = (c: Candidate): number => c.gain! / Math.max(1e-300, num(c.prices[0]!.amount));
  const economy: { c: Candidate; s: number }[] = [];
  for (const list of byResource.values()) {
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    const best = sorted[0]!;
    if (spendable(state, reserved, best.prices)) {
      economy.push({ c: best, s: score(best) });
      continue;
    }
    const limit = best.prices[0]!.amount.mul(CHEAP_SHARE);
    const cheap = sorted.find(
      (c) => c.prices[0]!.amount.lte(limit) && spendable(state, reserved, c.prices),
    );
    if (cheap) economy.push({ c: cheap, s: score(cheap) });
  }
  economy.sort((a, b) => b.s - a.s);
  picks.push(...economy.map((e) => e.c));
  return picks;
}

/** Most purchases in one pass (a safety valve). */
const MAX_BUYS_PER_PASS = 500;

/**
 * Buys while anything is worth buying now (see the file comment), then re-arranges plots,
 * loadouts, enhancements and cosmetic sets.
 */
export function greedyBuy(
  state: GameState,
  content: Content,
  rng: Rng = createSeededRng(1),
): { state: GameState; bought: string[] } {
  let current = state;
  const bought: string[] = [];
  for (let i = 0; i < MAX_BUYS_PER_PASS; i++) {
    const modifiers = collectModifiers(current, content);
    let next: GameState | null = null;
    for (const candidate of pickPurchase(current, buyerCandidates(current, content, modifiers))) {
      next = candidate.buy(current, content, modifiers, rng);
      if (next) {
        bought.push(candidate.id);
        break;
      }
    }
    if (!next) break;
    current = next;
    // New cards or ranks can change the loadouts and so the gains.
    if (/^(summon|star|tier):/.test(bought[bought.length - 1]!)) {
      current = optimizeLoadouts(current, content);
    }
  }
  if (bought.length > 0) current = optimizeLoadouts(arrangePlots(current, content), content);
  current = fillEnhancements(current, content);
  current = equipSets(current, content);
  return { state: current, bought };
}

/** The value the buyer gives an enhancement option. */
function optionWeight(option: { modifiers: readonly { stat: string }[] }): number {
  return ENHANCEMENT_WEIGHT[option.modifiers[0]?.stat ?? ''] ?? 0.5;
}

/**
 * Gives each card the enhancement set with the most weight its budget allows (all subsets of
 * its options), rebuilt with a free respec whenever a better set fits.
 */
export function fillEnhancements(state: GameState, content: Content): GameState {
  let current = state;
  for (const cardId of Object.keys(state.cards.owned)) {
    const info = cardEnhancements(current, content, cardId);
    if (!info?.unlocked) continue;
    const options = info.options.map((o) => o.option);
    let best: string[] = [];
    let bestWeight = -1;
    for (let mask = 0; mask < 1 << options.length; mask++) {
      let cost = 0;
      let weight = 0;
      const ids: string[] = [];
      options.forEach((o, i) => {
        if (!(mask & (1 << i))) return;
        cost += o.cost;
        weight += optionWeight(o);
        ids.push(o.id);
      });
      if (cost <= info.budget && weight > bestWeight) {
        best = ids;
        bestWeight = weight;
      }
    }
    const chosen = current.cards.owned[cardId]!.enhancements;
    if (best.length === chosen.length && best.every((id) => chosen.includes(id))) continue;
    current = resetEnhancements(current, content, cardId);
    for (const id of best) {
      const result = chooseEnhancement(current, content, cardId, id);
      if (result.ok) current = result.state;
    }
  }
  return current;
}

/** Equips every complete non-starter cosmetic set that is not worn yet (for its set bonus). */
export function equipSets(state: GameState, content: Content): GameState {
  let current = state;
  for (const set of content.sets) {
    const pieces = content.cosmetics.filter((c) => c.set === set.id && !c.starter);
    if (pieces.length === 0 || !pieces.every((p) => current.cosmetics.owned[p.id])) continue;
    for (const piece of pieces) {
      if (current.cosmetics.loadout.slots[piece.slot]?.id === piece.id) continue;
      const result = equipCosmetic(current, content, piece.id);
      if (result.ok) current = result.state;
    }
  }
  return current;
}

/**
 * Spreads each job's plots / slots evenly over its unlocked producers; the remainder goes to the
 * lowest tiers (their gems pay for expansions and the cheap upgrade lines).
 */
export function arrangePlots(state: GameState, content: Content): GameState {
  const next = cloneState(state);
  for (const job of ['logging', 'mining'] as ProductionJob[]) {
    const capacity = plotCapacity(state, content, job);
    const producers = [...unlockedProducers(state, content, job)].sort((a, b) => a.tier - b.tier);
    if (producers.length === 0) continue;
    const per = Math.floor(capacity / producers.length);
    let extra = capacity - per * producers.length;
    const plots: string[] = [];
    for (const p of producers) {
      const n = per + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      for (let i = 0; i < n; i++) plots.push(p.id);
    }
    next.production[job].plots = plots;
  }
  return next;
}

/** Puts each job's strongest cards in its loadout (rarity, then power) within the cost cap. */
export function optimizeLoadouts(state: GameState, content: Content): GameState {
  let current = state;
  for (const job of JOBS as readonly Job[]) {
    const cap = loadoutCostCap(current, content, job);
    const ranked = content.cards
      .filter((c) => c.job === job && current.cards.owned[c.id])
      .sort(
        (a, b) =>
          RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) ||
          cardPower(content, current.cards.owned[b.id]!) -
            cardPower(content, current.cards.owned[a.id]!),
      );
    const loadout: CardLoadout = emptyCardLoadout();
    let cost = 0;
    let support = 0;
    for (const card of ranked) {
      const c = cardCost(content, card.id);
      if (cost + c > cap) continue;
      if (loadout.main === null) loadout.main = card.id;
      else if (support < loadout.supports.length) loadout.supports[support++] = card.id;
      else break;
      cost += c;
    }
    const current_ = current.cards.loadouts[job];
    if (
      current_.main === loadout.main &&
      current_.supports.every((id, i) => id === loadout.supports[i])
    ) {
      continue;
    }
    const result = setLoadout(current, content, job, loadout);
    if (result.ok) current = result.state;
  }
  return current;
}

// ---- ascension ---------------------------------------------------------------------------------

/** Ascend once allowed and the gain at least matches all the Starlight earned so far. Kept for
 *  quick checks; the run uses `ascendNow` (rate past its peak). */
export function shouldAscend(state: GameState, content: Content): boolean {
  const preview = ascensionPreview(state, content);
  return preview.canAscend && preview.gain.gte(state.prestige.starlightEarned);
}

/** The best Starlight per second seen this run. */
export interface AscendTracker {
  peakRate: number;
}

/** Share of the peak rate below which the run is past its peak. */
const PAST_PEAK = 0.9;

/**
 * The ascension rule: once the gain reaches the minimum, track the run's Starlight per second;
 * ascend when it has dropped to 90% of its peak or less (more run time no longer pays).
 */
export function ascendNow(
  now: { gain: number; minimum: number; runSeconds: number },
  tracker: AscendTracker,
): boolean {
  if (now.gain < now.minimum || now.runSeconds <= 0) return false;
  const rate = now.gain / now.runSeconds;
  if (rate > tracker.peakRate) {
    tracker.peakRate = rate;
    return false;
  }
  return rate <= tracker.peakRate * PAST_PEAK;
}

/** Share of a tier-up's missing resource already held at which the player waits for it. */
const HOLD_SHARE = 0.4;
/** The longest a run is stretched while waiting for a tier-up, in seconds. */
export const HOLD_MAX_RUN_SECONDS = 12 * 3600;

/**
 * Whether a tier-up is close: some card is at its level cap and ★6 and only resources are short,
 * and the slow ones (the Cores and Frost Sigils an ascension resets) are at least 40% in hand, or
 * all in hand with only gems to wait for (they come back within minutes). A player finishes that
 * step before ascending instead of throwing the Cores away.
 */
export function holdAscension(state: GameState, content: Content): boolean {
  for (const id of Object.keys(state.cards.owned)) {
    const check = tierUpCheck(state, content, id);
    if (!check || !check.available || check.met) continue;
    const missing = check.requirements.filter((r) => !r.met);
    if (missing.some((r) => r.kind !== 'resource')) continue;
    const slow = missing.filter(
      (r) => content.resourceById.get(r.resource ?? '')?.kind === 'material',
    );
    // Only the Prismatic step is worth waiting for gems on: the lower steps' Cores are cheap.
    if (slow.length === 0) {
      if (state.cards.owned[id]?.tier === 'gold') return true;
      continue;
    }
    if (slow.every((r) => r.have.gte(r.need.mul(HOLD_SHARE)))) return true;
  }
  return false;
}

// ---- where to fight ----------------------------------------------------------------------------

/** Whether the loadout kills the boss before the boss knocks it out. */
function canKill(state: GameState, content: Content, id: string, modifiers: Modifier[]): boolean {
  const dungeon = content.dungeonById.get(id);
  if (!dungeon || !isDungeonUnlocked(state, content, id)) return false;
  const spk = secondsPerKill(state, content, id, modifiers);
  if (spk === null || !Number.isFinite(spk)) return false;
  const health = loadoutMaxHealth(state, content, modifiers, id);
  const incoming = bossAttackDps(dungeon, state.prestigeCount, modifiers);
  return !(health.gt(0) && incoming.gt(0) && health.div(incoming).toNumber() < spk);
}

/**
 * Resources a card upgrade or cosmetic level is waiting for (duplicate and level in hand), the
 * most advanced card's first: the Cores to farm next are the lead card's.
 */
function wantedResources(state: GameState, content: Content, modifiers: Modifier[]): string[] {
  const wanted: string[] = [];
  const waiting = buyerCandidates(state, content, modifiers)
    .filter((c) => c.kind === 'card' || c.kind === 'cosmetic')
    .sort((a, b) => (b.cardRank ?? 0) - (a.cardRank ?? 0));
  for (const c of waiting) {
    for (const p of c.prices) {
      if (have(state, p.resource).lt(p.amount) && !wanted.includes(p.resource)) {
        wanted.push(p.resource);
      }
    }
  }
  return wanted;
}

/** A dungeon is pushed on (first clear) only when one kill takes at most this long, in seconds. */
export const PUSH_MAX_SECONDS = 600;

/** Most of the time spent fighting the cleared Glimmer Trial for cosmetic materials. */
export const TRIAL_FARM_SHARE = 0.25;

/**
 * What to fight: the Glimmer Trial once it can be cleared; a killable dungeon not cleared yet
 * whose kill takes at most PUSH_MAX_SECONDS;
 * the cleared trial for cosmetic materials while its share of the time is under
 * TRIAL_FARM_SHARE; a dungeon whose Core is wanted (the crystals and Money drop everywhere); the hardest killable dungeon; else the first
 * open dungeon not cleared (a wall to push on).
 */
export function chooseDungeon(
  state: GameState,
  content: Content,
  options: { trialShare?: number } = {},
): string | null {
  const modifiers = collectModifiers(state, content);
  for (const trial of content.trials) {
    if (!isDungeonUnlocked(state, content, trial.id) || isDungeonCleared(state, trial.id)) continue;
    const dealt = averageDps(state, content, trial.id, modifiers).mul(trial.durationSeconds);
    if (dealt.gte(trial.target.hp)) return trial.id;
  }
  const killable = content.dungeons.filter((d) => canKill(state, content, d.id, modifiers));
  const push = killable.find(
    (d) =>
      !isDungeonCleared(state, d.id) &&
      (secondsPerKill(state, content, d.id, modifiers) ?? Infinity) <= PUSH_MAX_SECONDS,
  );
  if (push) return push.id;
  const wantedList = wantedResources(state, content, modifiers);
  const wanted = new Set(wantedList);
  const trialFarm = content.trials.find(
    (t) =>
      isDungeonCleared(state, t.id) &&
      t.tiers.some((tier) => tier.rewards.some((r) => wanted.has(r.resource))),
  );
  if (trialFarm && (options.trialShare ?? 0) < TRIAL_FARM_SHARE) return trialFarm.id;
  // The lead card's missing Core first (a Moss Core for a Bronze tier-up is farmed in Mossy Cellar).
  for (const resource of wantedList) {
    const farm = killable.find((d) => d.drops.material.resource === resource);
    if (farm) return farm.id;
  }
  const hardest = killable[killable.length - 1];
  if (hardest) return hardest.id;
  const open = content.dungeons.find(
    (d) => isDungeonUnlocked(state, content, d.id) && !isDungeonCleared(state, d.id),
  );
  return open?.id ?? content.dungeons[0]?.id ?? null;
}

// ---- running -----------------------------------------------------------------------------------

export interface SimOptions {
  hours: number;
  seed?: number;
  /** Seconds of play per step (the buyer acts between steps). */
  stepSeconds?: number;
  /** Open portals that wait for their screen (default true: the sim plays the whole beta). */
  openAllPortals?: boolean;
}

export interface SimResult {
  /** Milestone id -> sim seconds when reached, or null. */
  hits: Record<string, number | null>;
  simSeconds: number;
  state: GameState;
  log: SimLog;
  /** [sim seconds, average fighting DPS against the first dungeon] every half hour. */
  dpsSamples: Array<[number, number]>;
}

/** How often the fight target is re-chosen without a kill, in seconds. */
const RECHOOSE_SECONDS = 300;
/** How often the ascension rule is checked, in seconds. */
const ASCEND_CHECK_SECONDS = 60;
/** How often the fighting DPS is sampled for the report, in seconds. */
const DPS_SAMPLE_SECONDS = 1800;

export function runSim(bundled: Content, options: SimOptions): SimResult {
  // The sim plays the whole beta: portals waiting for their screen (the Wardrobe Gate) are open.
  const content: Content =
    options.openAllPortals === false ? bundled : { ...bundled, portals: bundled.allPortals };
  const rng: Rng = createSeededRng(options.seed ?? 1);
  const step = options.stepSeconds ?? 5;
  const total = Math.round(options.hours * 3600);
  const log: SimLog = { summons: 0, levelAt: {}, ascensions: [], fought: {} };
  const hits: Record<string, number | null> = Object.fromEntries(
    MILESTONES.map((m) => [m.id, null]),
  );
  let state = createInitialState(content);
  let sinceChoose = Infinity;
  let sinceAscendCheck = 0;
  let runStart = 0;
  let tracker: AscendTracker = { peakRate: 0 };
  let trialClearedAt: number | null = null;
  const dpsSamples: Array<[number, number]> = [];
  let t = 0;
  const countSummons = (bought: string[]): void => {
    for (const id of bought) if (id.startsWith('summon:')) log.summons++;
  };
  while (t < total) {
    const buys = greedyBuy(state, content, rng);
    state = buys.state;
    countSummons(buys.bought);
    if (sinceAscendCheck >= ASCEND_CHECK_SECONDS) {
      sinceAscendCheck = 0;
      const preview = ascensionPreview(state, content);
      const now = { gain: num(preview.gain), minimum: preview.minimum, runSeconds: t - runStart };
      const holding = now.runSeconds < HOLD_MAX_RUN_SECONDS && holdAscension(state, content);
      if (ascendNow(now, tracker) && !holding) {
        const result = ascend(state, content);
        if (result.ok) {
          const after = greedyBuy(result.state, content, rng);
          state = after.state;
          countSummons(after.bought);
          log.ascensions.push(t);
          runStart = t;
          tracker = { peakRate: 0 };
          sinceChoose = RECHOOSE_SECONDS;
        }
      }
    }
    if (sinceChoose >= RECHOOSE_SECONDS) {
      if (trialClearedAt === null && isDungeonCleared(state, 'glimmer_trial')) trialClearedAt = t;
      const since = trialClearedAt === null ? 0 : t - trialClearedAt;
      const trialShare = since > 0 ? (log.fought['glimmer_trial'] ?? 0) / since : 0;
      const target = chooseDungeon(state, content, { trialShare });
      if (target !== state.activeDungeonId) {
        const result = setActiveDungeon(state, content, target);
        if (result.ok) state = result.state;
      }
      sinceChoose = 0;
    }
    const dt = Math.min(step, total - t);
    const { state: next, report } = advance(state, content, dt * 1000, rng);
    state = next;
    if (state.activeDungeonId) {
      const fightingTrial = state.activeDungeonId !== 'glimmer_trial' || trialClearedAt !== null;
      if (fightingTrial) {
        log.fought[state.activeDungeonId] = (log.fought[state.activeDungeonId] ?? 0) + dt;
      }
    }
    t += dt;
    sinceChoose += dt;
    sinceAscendCheck += dt;
    if (report.bossKills > 0 || report.knockouts > 0 || report.trialAttempts > 0) {
      sinceChoose = RECHOOSE_SECONDS;
    }
    if (report.cardDrops.length > 0) state = optimizeLoadouts(state, content);
    if (t % DPS_SAMPLE_SECONDS < dt) {
      const first = content.dungeons[0]!.id;
      dpsSamples.push([t - (t % DPS_SAMPLE_SECONDS), num(averageDps(state, content, first))]);
    }
    for (const m of MILESTONES) {
      if (hits[m.id] === null && m.reached(state, content, log)) hits[m.id] = t;
    }
    for (let level = 2; level <= state.account.level; level++) {
      log.levelAt[level] ??= t;
    }
  }
  return { hits, simSeconds: t, state, log, dpsSamples };
}

const hoursText = (seconds: number): string => `${(seconds / 3600).toFixed(2)} h`;

/** The result as a markdown table: milestone, sim time, DESIGN 11.7 target. */
export function formatTable(result: SimResult): string {
  const lines = ['| Milestone | Sim time | Target |', '|---|---|---|'];
  for (const m of MILESTONES) {
    const hit = result.hits[m.id];
    const time =
      hit !== null && hit !== undefined
        ? hoursText(hit)
        : m.pending
          ? `not built (${m.pending})`
          : `not reached in ${hoursText(result.simSeconds)}`;
    lines.push(`| ${m.label} | ${time} | ${m.targetHours} h |`);
  }
  return lines.join('\n');
}

// ---- several seeds -----------------------------------------------------------------------------

/** One milestone over several runs (seconds). */
export interface MilestoneSpread {
  /** Median time, unreached runs counted as never; null when half or more never reached it. */
  median: number | null;
  /** Earliest and latest time among the runs that reached it (null when none did). */
  min: number | null;
  max: number | null;
  reached: number;
  runs: number;
}

/** Median and spread of every milestone over runs (milestone id -> seconds or null). */
export function summarizeRuns(
  runs: readonly Record<string, number | null | undefined>[],
): Record<string, MilestoneSpread> {
  const out: Record<string, MilestoneSpread> = {};
  for (const m of MILESTONES) {
    const times = runs.map((r) => r[m.id] ?? null);
    const hit = times.filter((x): x is number => x !== null).sort((a, b) => a - b);
    if (runs.length === 0 || (hit.length === 0 && !runs.some((r) => m.id in r))) continue;
    const all = times.map((x) => x ?? Infinity).sort((a, b) => a - b);
    const mid = all.length / 2;
    const median = all.length % 2 === 1 ? all[Math.floor(mid)]! : (all[mid - 1]! + all[mid]!) / 2;
    out[m.id] = {
      median: Number.isFinite(median) ? median : null,
      min: hit[0] ?? null,
      max: hit[hit.length - 1] ?? null,
      reached: hit.length,
      runs: runs.length,
    };
  }
  return out;
}

const shortHours = (seconds: number): string => (seconds / 3600).toFixed(2);

/** Markdown table: milestone, target, median, spread, runs reaching it, median / target. */
export function formatSeedTable(
  summary: Record<string, MilestoneSpread>,
  simSeconds: number,
): string {
  const lines = [
    '| Milestone | Target | Sim median | Spread (min-max) | Reached | Median / target |',
    '|---|---|---|---|---|---|',
  ];
  for (const m of MILESTONES) {
    const s = summary[m.id];
    if (!s) continue;
    const median = s.median === null ? `> ${hoursText(simSeconds)}` : hoursText(s.median);
    const spread =
      s.min === null || s.max === null ? '-' : `${shortHours(s.min)}-${shortHours(s.max)} h`;
    const ratio =
      s.median === null ? '-' : `${Math.round((s.median / 3600 / m.targetHours) * 100)}%`;
    lines.push(
      `| ${m.label} | ${m.targetHours} h | ${median} | ${spread} | ${s.reached}/${s.runs} | ${ratio} |`,
    );
  }
  return lines.join('\n');
}

/** One line per job and a few totals, to read alongside the table. */
export function formatSummary(result: SimResult, content: Content): string {
  const s = result.state;
  const cards = Object.entries(s.cards.owned)
    .map(([id, c]) => `${content.cardById.get(id)?.name ?? id} ${c.tier} ★${c.stars} Lv ${c.level}`)
    .join(', ');
  const damage = content.combat.damageUpgrades
    .map((u) => `${u.name} ${s.combat.damageLevels[u.id] ?? 0}`)
    .join(', ');
  const mines = content.mines
    .map((m) => `${m.name} ${s.production.mineLevels[m.id] ?? 0}`)
    .join(', ');
  const fought = Object.entries(result.log.fought)
    .map(([d, sec]) => `${d} ${hoursText(sec)}`)
    .join(', ');
  const modifiers = collectModifiers(s, content);
  const walls = content.dungeons
    .map((d) => {
      const spk = secondsPerKill(s, content, d.id, modifiers);
      const health = loadoutMaxHealth(s, content, modifiers, d.id);
      const incoming = bossAttackDps(d, s.prestigeCount, modifiers);
      const survive = incoming.gt(0) ? num(health.div(incoming)) : Infinity;
      return `${d.id} ${spk === null ? '-' : `${spk.toFixed(0)} s/kill`} (survives ${survive.toFixed(0)} s)`;
    })
    .join(', ');
  return [
    `Fights at the end: ${walls}`,
    `Kills: ${s.stats.bossKills} (${Object.entries(s.combat.kills)
      .map(([d, k]) => `${d} ${k}`)
      .join(', ')})`,
    `DPS vs Mossy Cellar: ${result.dpsSamples
      .filter(([t]) => [1, 2, 4, 8, 12, 16, 20, 30, 40].includes(t / 3600))
      .map(([t, d]) => `${t / 3600} h ${d.toExponential(1)}`)
      .join(', ')}`,
    `Time fought: ${fought || 'none'}`,
    `Summons: ${result.log.summons} pulls; Money in hand ${num(s.resources['money'] ?? new Decimal(0)).toExponential(1)}, crystals ${num(s.resources['summon_crystal'] ?? new Decimal(0)).toFixed(0)} summon / ${num(s.resources['glamour_crystal'] ?? new Decimal(0)).toFixed(0)} glamour`,
    `Ascensions at: ${result.log.ascensions.map(hoursText).join(', ') || 'none'} (Starlight earned ${s.prestige.starlightEarned.toFixed(0)})`,
    `Plots: ${plotCapacity(s, content, 'logging')}, slots: ${plotCapacity(s, content, 'mining')}`,
    `Damage lines: ${damage}`,
    `Mine levels: ${mines}`,
    `Cards: ${cards}`,
    `Account level ${s.account.level}, skills: ${
      Object.entries(s.account.skills)
        .map(([id, r]) => `${id} ${r}`)
        .join(', ') || 'none'
    }`,
    `Account level reached at: ${[5, 10, 20, 30, 40, 50]
      .map((l) => `${l}: ${l in result.log.levelAt ? hoursText(result.log.levelAt[l]!) : '-'}`)
      .join(', ')}`,
    `Achievements: ${Object.keys(s.achievements).length} / ${content.achievements.length}`,
  ].join('\n');
}
