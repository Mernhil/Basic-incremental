/**
 * Balance sim, DESIGN.md §14: plays the real game logic fast with a scripted
 * player and records when each beta pacing milestone is reached.
 *
 * The buyer (Phase 9), every step:
 * - buys card star-ups and tier-ups, tree kinds, cosmetic levels, summons (10-pulls when
 *   affordable, else single pulls), Starlight shop levels (cheapest first) and skill points (a
 *   priority list) as soon as they are affordable, and rebuilds each card's enhancements as the
 *   best set its budget allows;
 * - keeps the resources the next waiting card upgrade or tree kind needs (reservations);
 * - spends its Money on the economy purchase with the best gain per Money: a mine level (relative gain
 *   of the weighted production) or a tree level (the same), waiting for the
 *   best one unless a cheaper one costs a small share of it. A card's tier-up also costs Money, so
 *   it is kept for it once the card is at its level cap (a star-up costs only the star bar);
 * - fills loadouts with the rarest cards,
 *   equips complete cosmetic sets;
 * - pushes down a dungeon's floors whenever the next floor is one it wins with room to spare (a
 *   knockout drops it a floor and back to farming, by the game's own rule);
 * - fights on Normal while a dungeon is not cleared or a Core is wanted, and climbs the Hard and
 *   Nightmare tiers and the endless depths when nothing else is waiting;
 * - fights: the Glimmer Trial once it can score 100%, else a newly killable dungeon, else the
 *   cleared trial for cosmetic materials within a time share, else a dungeon whose Core a card
 *   waits for, else the hardest killable one (every dungeon pays Money and both crystals);
 * - ascends once the run's Starlight per hour has passed its peak.
 * Mastery, milestones, crits, achievements and account levels come from the real game rules.
 *
 * Profiles (DESIGN.md §14 Sim bands): `active` plays every step for the whole time; `idle` checks
 * in every 30 minutes (the game stays open in between, nothing is bought or re-aimed) and is
 * offline 8 hours a day, taking the game's own offline progress on return.
 */
import { JOBS, RANK_TIERS, RARITIES, type Content, type Job } from '../../src/data';
import {
  advance,
  type OwnedCard,
  buyMineLevel,
  cardPower,
  collectModifiers,
  createInitialState,
  createSeededRng,
  Decimal,
  emptyCardLoadout,
  incomePerSecond,
  isDungeonCleared,
  isDungeonUnlocked,
  isProducerUnlocked,
  loadoutCostCap,
  mineLevel,
  upgradeShelf,
  buyUpgrade,
  treeLevel,
  treeLevelCost,
  buyTreeLevel,
  mineLevelCost,
  productionPerSecond,
  producerRate,
  secondsPerKill,
  survivalSeconds,
  simulateOffline,
  fightStage,
  floorCount,
  floorPosition,
  hasDeeperFloor,
  isDifficultyUnlocked,
  setDifficulty,
  setFloorMode,
  DIFFICULTIES,
  type Difficulty,
  setActiveDungeon,
  setLoadout,
  starUp,
  starUpCheck,
  tierUp,
  tierUpCheck,
  treeUnlockCost,
  unlockTree,
  averageDps,
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

// ---- milestones (DESIGN.md §14) ---------------------------------------------------------------

export interface Milestone {
  id: string;
  label: string;
  targetHours: number;
  /** Upper end of a target range (`targetHours` is its lower end); absent for a single target. */
  toHours?: number;
  /** Whether the state has reached it. */
  reached: (state: GameState, content: Content, log: SimLog) => boolean;
  /** Set while what the milestone needs is not in the game yet (the three new dungeons wait for
   *  their themes): it is left out of the band check and of "mostly exhausted". */
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
/** Whether a card of the rarity or a rarer one is owned (RARITIES runs Common to Void). */
const ownsRarityAtLeast = (
  state: GameState,
  content: Content,
  rarity: (typeof RARITIES)[number],
): boolean =>
  content.cards.some(
    (card) =>
      state.cards.owned[card.id] && RARITIES.indexOf(card.rarity) >= RARITIES.indexOf(rarity),
  );
const cleared = (id: string) => (state: GameState) => isDungeonCleared(state, id);
/** Whether the last-floor boss of a dungeon's difficulty tier has been beaten. */
const tierBeaten = (
  state: GameState,
  dungeon: Content['dungeons'][number],
  difficulty: Difficulty,
): boolean => floorPosition(state, dungeon, difficulty).best >= floorCount(dungeon, difficulty);

export const MILESTONES: Milestone[] = [
  {
    id: 'clear_d1',
    label: 'First dungeon cleared',
    targetHours: 0.25,
    reached: cleared('mossy_cellar'),
  },
  {
    id: 'first_summon',
    label: 'First summon',
    targetHours: 0.125,
    toHours: 1 / 6,
    reached: (_s, _c, log) => log.summons > 0,
  },
  {
    id: 'first_silver',
    label: 'First Silver card',
    targetHours: 1.5,
    reached: (s) => tierAtLeast(s, 'silver'),
  },
  {
    id: 'first_epic',
    label: 'First Epic',
    targetHours: 1.5,
    toHours: 2,
    reached: (s, c) => ownsRarityAtLeast(s, c, 'epic'),
  },
  { id: 'clear_d2', label: 'Dungeon 2 cleared', targetHours: 2, reached: cleared('ember_crypt') },
  {
    id: 'first_gold',
    label: 'First Gold card',
    targetHours: 4,
    reached: (s) => tierAtLeast(s, 'gold'),
  },
  {
    id: 'first_legendary',
    label: 'First Legendary',
    targetHours: 4,
    toHours: 5,
    reached: (s, c) => ownsRarityAtLeast(s, c, 'legendary'),
  },
  {
    id: 'first_star6',
    label: 'First ★6 from copies',
    targetHours: 7,
    // A ★6 earned with duplicates: a card whose rarity still needs copies per star (Common and
    // Uncommon; Rare and up star up for free, DESIGN.md §5 Star bar).
    reached: (s, c) =>
      Object.entries(s.cards.owned).some(([id, owned]) => {
        const rarity = c.cardById.get(id)?.rarity;
        const needs = rarity ? c.cardRules.starBar.needs[rarity] : undefined;
        return owned.stars >= 6 && (needs ?? []).some((n) => n > 0);
      }),
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
        if (!cosmetic || cosmetic.starter) return false;
        // Slot items whose only level is 1 (UI skins) are max from the moment they are owned:
        // the milestone is about a cosmetic taken up its whole upgrade ladder.
        const max = cosmeticMaxLevel(c, cosmetic);
        return max > 1 && o.level >= max;
      }),
  },
  {
    id: 'first_hard',
    label: 'First Hard clear',
    targetHours: 14,
    reached: (s, c) => c.dungeons.some((d) => tierBeaten(s, d, 'hard')),
  },
  {
    id: 'clear_d4',
    label: 'Dungeon 4 cleared',
    targetHours: 18,
    reached: cleared('thunderpeak_aerie'),
  },
  {
    id: 'first_nightmare',
    label: 'First Nightmare clear',
    targetHours: 24,
    reached: (s, c) => c.dungeons.some((d) => tierBeaten(s, d, 'nightmare')),
  },
  {
    id: 'clear_d5',
    label: 'Dungeon 5 cleared',
    targetHours: 28,
    reached: cleared('sunken_sanctum'),
  },
  {
    id: 'clear_d6',
    label: 'Dungeon 6 cleared',
    targetHours: 36,
    reached: cleared('void_hollow'),
  },
  {
    id: 'exhausted',
    label: 'Beta content mostly exhausted',
    targetHours: 40,
    // Every other milestone reached, every card owned and a weapon taken to the last tier
    // (T6, Mythic or Void, DESIGN.md §5): the final upgrade of the beta.
    reached: (s, c, log) =>
      c.cards.every((card) => s.cards.owned[card.id]) &&
      Object.values(s.cards.owned).some((card) => card.tier === 'mythic') &&
      MILESTONES.every((m) => m.id === 'exhausted' || m.pending || m.reached(s, c, log)),
  },
];

// ---- milestones of one run (the Ascension guard, DESIGN.md §6 Harder each Ascension) -----------

/** What a run started from: the counters an Ascension keeps, as they stood at its start. */
export interface RunBase {
  /** Lifetime Money earned when the run started. */
  moneyEarned: Decimal;
}

/** A checkpoint every run passes again after an Ascension. */
export interface RunMilestone {
  id: string;
  label: string;
  reached: (state: GameState, content: Content, base: RunBase) => boolean;
}

/** Money earned since the run started (it comes only from dungeons, DESIGN.md §3). */
const runMoney =
  (amount: number) =>
  (state: GameState, _content: Content, base: RunBase): boolean =>
    state.upgrades.moneyEarned.sub(base.moneyEarned).gte(amount);

/**
 * The first 5 milestones of a run, in the order a run meets them: Money earned since the
 * Ascension, a decade apart. Money comes only from fighting and an Ascension resets it, so it
 * measures how fast a run gets going whatever the player chooses to fight. The guard compares the
 * time each run takes to reach them with the run before.
 */
export const RUN_MILESTONES: RunMilestone[] = [
  { id: 'run_money_1e4', label: '10K Money', reached: runMoney(1e4) },
  { id: 'run_money_1e5', label: '100K Money', reached: runMoney(1e5) },
  { id: 'run_money_1e6', label: '1M Money', reached: runMoney(1e6) },
  { id: 'run_money_1e7', label: '10M Money', reached: runMoney(1e7) },
  { id: 'run_money_1e8', label: '100M Money', reached: runMoney(1e8) },
];

/** One run (the stretch between two Ascensions) and when it reached each run milestone. */
export interface RunRecord {
  /** Sim seconds when the run started. */
  start: number;
  /** Sim seconds when it ended (the next Ascension, or the end of the sim). */
  end: number;
  /** Run milestone id -> seconds since the run started, or null. */
  hits: Record<string, number | null>;
}

/** A run milestone a run reached later than the run before it (or not at all, given the time). */
export interface GuardMiss {
  /** 1-based number of the slower run. */
  run: number;
  id: string;
  /** Seconds the run before took. */
  before: number;
  /** Seconds this run took, or null when it had at least that long and never got there. */
  after: number | null;
}

/**
 * The Ascension guard: every run must reach its first 5 milestones sooner than the run before.
 * A milestone the earlier run never reached, or that the later run had no time for, is skipped.
 */
export function ascensionGuard(runs: readonly RunRecord[]): {
  compared: number;
  misses: GuardMiss[];
} {
  const misses: GuardMiss[] = [];
  let compared = 0;
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1]!;
    const run = runs[i]!;
    for (const m of RUN_MILESTONES) {
      const before = prev.hits[m.id] ?? null;
      if (before === null) continue;
      const after = run.hits[m.id] ?? null;
      if (after === null) {
        if (run.end - run.start <= before) continue; // it never had the time
        compared++;
        misses.push({ run: i + 1, id: m.id, before, after: null });
        continue;
      }
      compared++;
      if (after > before) misses.push({ run: i + 1, id: m.id, before, after });
    }
  }
  return { compared, misses };
}

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
  /** `damage:<line>[:x<n>]`, `mine:<mine>`, `tree:<tree>`, `star:<card>`,
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
  /**
   * A tier-up whose other resources (Cores, gems) are still further off than its Money: the
   * player keeps spending Money on levels meanwhile and saves it only once Money is the laggard.
   */
  deferMoney?: boolean;
  buy: (state: GameState, content: Content, modifiers: Modifier[], rng: Rng) => GameState | null;
}

/**
 * `incomePerSecond`, remembered per state and modifier list. The buyer asks for the same few
 * resources for every candidate, and states are never changed in place, so the answer for one
 * state, modifier list and resource is always the same.
 */
const incomes = new WeakMap<GameState, WeakMap<readonly Modifier[], Map<string, Decimal>>>();

function incomeOf(
  state: GameState,
  content: Content,
  resource: string,
  modifiers: readonly Modifier[],
): Decimal {
  let byModifiers = incomes.get(state);
  if (!byModifiers) incomes.set(state, (byModifiers = new WeakMap()));
  let byResource = byModifiers.get(modifiers);
  if (!byResource) byModifiers.set(modifiers, (byResource = new Map()));
  let income = byResource.get(resource);
  if (!income)
    byResource.set(resource, (income = incomePerSecond(state, content, resource, modifiers)));
  return income;
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
    const income = incomeOf(state, content, p.resource, modifiers);
    if (income.lte(0)) return null;
    worst = Math.max(worst, missing.div(income).toNumber());
  }
  return Number.isFinite(worst) ? worst : null;
}

/**
 * Whether a tier-up's Money should not be saved yet: some other resource is still missing and
 * is not due before the Money would be (or nothing earns either). Money is the laggard only
 * when the Cores and gems come first.
 */
function defersMoney(
  state: GameState,
  content: Content,
  prices: readonly Price[],
  modifiers: readonly Modifier[],
): boolean {
  const money = prices.filter((p) => p.resource === 'money');
  if (money.length === 0) return false;
  const others = etaOf(
    state,
    content,
    prices.filter((p) => p.resource !== 'money'),
    modifiers,
  );
  if (others === 0) return false;
  const own = etaOf(state, content, money, modifiers);
  return others === null || own === null || others > own;
}

const okState = (r: { ok: boolean; state?: GameState }): GameState | null =>
  r.ok ? (r.state ?? null) : null;

const num = (d: Decimal): number => d.toNumber();

/**
 * How much the buyer values a share of the weighted production against the same share of damage.
 * Production only feeds card upgrades and tree kinds now (DESIGN.md §3), while damage feeds
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

/** The economy purchases (mine and tree levels, shelf upgrades) with their gains. */
function economyCandidates(
  state: GameState,
  content: Content,
  modifiers: Modifier[],
): Omit<Candidate, 'eta'>[] {
  const out: Omit<Candidate, 'eta'>[] = [];
  const totalProduction = weightedProduction(state, content, modifiers);
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
          ? starUpCheck(state, content, card.id)
          : tierUpCheck(state, content, card.id, modifiers);
      if (!check?.available) continue;
      // Only worth waiting for when the star bar and level are already there (a tier-up that
      // only lacks levels is held: its resources are kept).
      const short = check.requirements.filter((r) => r.kind !== 'resource' && !r.met);
      const hold = kind === 'tier' && short.length > 0 && short.every((r) => r.kind === 'level');
      if (short.length > 0 && !hold) continue;
      const prices = check.requirements
        .filter((r) => r.kind === 'resource' && r.resource && !(hold && r.resource === 'money'))
        .map((r) => ({ resource: r.resource!, amount: r.need }));
      out.push({
        id: `${kind}:${card.id}`,
        kind: 'card',
        cardRank:
          cardProgress(content, state.cards.owned[card.id]!) +
          (state.cards.loadouts.fighting.main === card.id ? FIGHTING_LEAD_BONUS : 0),
        hold,
        deferMoney: kind === 'tier' && defersMoney(state, content, prices, modifiers),
        // A held tier-up (level still short) keeps its Cores and gems but not its Money: the
        // player keeps buying levels with it until the card is at its cap.
        prices,
        buy: (s, c, m) =>
          okState(kind === 'star' ? starUp(s, c, card.id) : tierUp(s, c, card.id, m)),
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

/**
 * The fighting lead's upgrades go first whatever other cards have reached: its damage is what
 * clears dungeons, earns Money and the Cores, so the player finishes it before the rest.
 */
const FIGHTING_LEAD_BONUS = 1e9;

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

/** The prices a waiting purchase keeps back (its Money too, unless that is deferred). */
function keptPrices(c: Candidate): Price[] {
  return c.deferMoney ? c.prices.filter((p) => p.resource !== 'money') : c.prices;
}

/** A far-off card upgrade (further than this, in seconds) holds back only its scarce materials. */
const CLAIM_HORIZON_SECONDS = 3600;

/**
 * What a waiting card upgrade holds back from weaker cards: all of its kept prices when it is
 * close, only its scarce materials (Cores, Sigils, Dust) when it is hours away, so a far-off
 * step does not starve the cheaper steps of the other cards of gems and Money meanwhile.
 */
function claimedPrices(content: Content, c: Candidate): Price[] {
  const kept = keptPrices(c);
  if (c.eta !== null && c.eta <= CLAIM_HORIZON_SECONDS) return kept;
  return kept.filter((p) => content.resourceById.get(p.resource)?.kind === 'material');
}

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
    const kept = keptPrices(c);
    if (kept.some((p) => claimed.has(p.resource))) continue;
    for (const p of kept) {
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
  content: Content,
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
    const blocked = claimedPrices(content, c).some((p) => {
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
    for (const p of claimedPrices(content, c))
      claimed.set(p.resource, (claimed.get(p.resource) ?? new Decimal(0)).add(p.amount));
  }
  return now;
}

/** The next purchase to make now, or null to wait. */
function pickPurchase(
  state: GameState,
  content: Content,
  candidates: readonly Candidate[],
): Candidate[] {
  const ready = candidates.filter((c) => c.eta === 0);
  const picks: Candidate[] = [];
  for (const kind of KIND_ORDER) {
    if (kind === 'card' || kind === 'cosmetic')
      picks.push(...focused(state, content, candidates, kind));
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
 * Buys while anything is worth buying now (see the file comment), then re-arranges
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
    for (const candidate of pickPurchase(
      current,
      content,
      buyerCandidates(current, content, modifiers),
    )) {
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
  if (bought.length > 0) current = optimizeLoadouts(current, content);
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
 * The ascension rule: the first one is taken as soon as the gain reaches the minimum (the
 * player wants the first Starlight shop levels, and the Starlight formula makes the minimum the
 * pacing lever, DESIGN.md §9). After that the gain must at least match all the Starlight earned
 * so far, and the run's Starlight per second must have dropped to 90% of its peak or less (more
 * run time no longer pays).
 */
export function ascendNow(
  now: { gain: number; minimum: number; runSeconds: number; earned?: number },
  tracker: AscendTracker,
): boolean {
  if (now.gain < now.minimum || now.runSeconds <= 0) return false;
  if (now.earned === 0) return true;
  // Each later Ascension must be worth at least all the Starlight earned so far (a doubling).
  if (now.earned !== undefined && now.gain < now.earned) return false;
  const rate = now.gain / now.runSeconds;
  if (rate > tracker.peakRate) {
    tracker.peakRate = rate;
    return false;
  }
  return rate <= tracker.peakRate * PAST_PEAK;
}

/** Share of a tier-up's missing resource already held at which the player waits for it. */
const HOLD_SHARE = 0.75;
/** The longest a run is stretched while waiting for a tier-up, in seconds. */
export const HOLD_MAX_RUN_SECONDS = 12 * 3600;

/**
 * Whether a tier-up is close: some card is at its level cap and ★6 and only resources are short,
 * and the slow ones (the Money, Cores and Frost Sigils an ascension resets) are at least 40% in hand, or
 * all in hand with only gems to wait for (they come back within minutes). A player finishes that
 * step before ascending instead of throwing the Cores away.
 */
export function holdAscension(state: GameState, content: Content): boolean {
  for (const id of Object.keys(state.cards.owned)) {
    const check = tierUpCheck(state, content, id);
    if (!check || !check.available || check.met) continue;
    const missing = check.requirements.filter((r) => !r.met);
    if (missing.some((r) => r.kind !== 'resource')) continue;
    // Money resets on Ascension like the Cores do, so it counts as slow too.
    const slow = missing.filter((r) => {
      const kind = content.resourceById.get(r.resource ?? '')?.kind;
      return kind === 'material' || kind === 'currency';
    });
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

/** Whether the loadout clears the floor it stands on, on Normal, before the floor knocks it out. */
function canKill(state: GameState, content: Content, id: string, modifiers: Modifier[]): boolean {
  const dungeon = content.dungeonById.get(id);
  if (!dungeon || !isDungeonUnlocked(state, content, id)) return false;
  return holds(state, content, id, modifiers, 'normal');
}

/** Whether the loadout clears the floor it stands on, on a difficulty, before it is knocked out. */
function holds(
  state: GameState,
  content: Content,
  id: string,
  modifiers: readonly Modifier[],
  difficulty: Difficulty,
): boolean {
  const spk = secondsPerKill(state, content, id, modifiers, undefined, difficulty);
  if (spk === null || !Number.isFinite(spk)) return false;
  const survival = survivalSeconds(state, content, id, modifiers, undefined, difficulty);
  return !(survival !== null && survival < spk);
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

/** What the sim player fights next: a dungeon or special dungeon, and the difficulty tier. */
export interface FightChoice {
  id: string | null;
  difficulty: Difficulty;
}

/**
 * What to fight: the Glimmer Trial once it can be cleared; a killable dungeon not cleared yet
 * whose floors it can still get down (not one at a wall) and whose floor takes at most
 * PUSH_MAX_SECONDS;
 * the cleared trial for cosmetic materials while its share of the time is under
 * TRIAL_FARM_SHARE; a dungeon whose Core is wanted (or that drops a wanted material as an extra;
 * crystals come as a wage everywhere); a Hard or Nightmare tier, or the endless depths, it can
 * still get down; the hardest killable dungeon; else the first open dungeon not cleared (a wall
 * to push on). Everything but the tier climb is fought on Normal: an enemy's drops follow its
 * share of the boss's HP, so the Normal floors are where Cores come fastest.
 */
export function chooseFight(
  state: GameState,
  content: Content,
  options: { trialShare?: number } = {},
): FightChoice {
  const normal = (id: string | null): FightChoice => ({ id, difficulty: 'normal' });
  const modifiers = collectModifiers(state, content);
  for (const trial of content.trials) {
    if (!isDungeonUnlocked(state, content, trial.id) || isDungeonCleared(state, trial.id)) continue;
    const dealt = averageDps(state, content, trial.id, modifiers).mul(trial.durationSeconds);
    if (dealt.gte(trial.target.hp)) return normal(trial.id);
  }
  const perFloor = (id: string): number | null =>
    secondsPerKill(state, content, id, modifiers, undefined, 'normal');
  const killable = content.dungeons.filter((d) => canKill(state, content, d.id, modifiers));
  const push = killable.find(
    (d) =>
      !isDungeonCleared(state, d.id) &&
      advances(state, content, d.id, modifiers) &&
      (perFloor(d.id) ?? Infinity) <= PUSH_MAX_SECONDS,
  );
  if (push) return normal(push.id);
  const wantedList = wantedResources(state, content, modifiers);
  const wanted = new Set(wantedList);
  const trialFarm = content.trials.find(
    (t) =>
      isDungeonCleared(state, t.id) &&
      t.tiers.some((tier) => tier.rewards.some((r) => wanted.has(r.resource))),
  );
  if (trialFarm && (options.trialShare ?? 0) < TRIAL_FARM_SHARE) return normal(trialFarm.id);
  // The lead card's missing Core first (a Moss Core for a Bronze tier-up is farmed in Mossy Cellar).
  for (const resource of wantedList) {
    const farm = killable.find((d) => d.drops.material.resource === resource);
    if (farm) return normal(farm.id);
    // Else the dungeon that drops it as an extra fastest (the Ember Crypt's Frost Cores and
    // Sigils, DESIGN.md §3).
    let best: { id: string; rate: number } | null = null;
    for (const d of killable) {
      const extra = d.drops.extraMaterials.find((e) => e.resource === resource);
      const spk = perFloor(d.id);
      if (!extra || spk === null || spk <= 0) continue;
      const rate = (extra.chance * (extra.min + extra.max)) / 2 / spk;
      if (!best || rate > best.rate) best = { id: d.id, rate };
    }
    if (best) return normal(best.id);
  }
  // Nothing is waiting: climb the tiers and the endless depths.
  const climb = climbTarget(state, content, modifiers);
  if (climb) return climb;
  const hardest = killable[killable.length - 1];
  if (hardest) return normal(hardest.id);
  const open = content.dungeons.find(
    (d) => isDungeonUnlocked(state, content, d.id) && !isDungeonCleared(state, d.id),
  );
  return normal(open?.id ?? content.dungeons[0]?.id ?? null);
}

/** The dungeon or special dungeon `chooseFight` picks. */
export function chooseDungeon(
  state: GameState,
  content: Content,
  options: { trialShare?: number } = {},
): string | null {
  return chooseFight(state, content, options).id;
}

/** The sim player pushes on only when the next floor's "you fall in" is this many times its clear time. */
export const PUSH_MARGIN = 1.2;

/**
 * Whether the floor below the one the player stands on (on the dungeon's chosen difficulty, or
 * on `difficulty`) is one the loadout wins with room to spare.
 */
function winsNextFloor(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[],
  difficulty?: Difficulty,
): boolean {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return false;
  const position = floorPosition(state, dungeon, difficulty);
  if (!hasDeeperFloor(position)) return false;
  const next = position.floor + 1;
  const at = position.difficulty;
  const spk = secondsPerKill(state, content, dungeonId, modifiers, next, at);
  if (spk === null || !Number.isFinite(spk)) return false;
  const survival = survivalSeconds(state, content, dungeonId, modifiers, next, at);
  return survival === null || survival >= spk * PUSH_MARGIN;
}

/**
 * Whether fighting a dungeon on a difficulty gets the player nearer that tier's boss (or deeper,
 * in the endless depths): it stands on a floor it wins and is pushing, or stands on a last floor
 * it wins, or was knocked back to farming and now wins the floor below. A dungeon at a wall is
 * only worth its drops.
 */
function advances(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: Modifier[],
  difficulty: Difficulty = 'normal',
): boolean {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon || !isDungeonUnlocked(state, content, dungeonId)) return false;
  if (!holds(state, content, dungeonId, modifiers, difficulty)) return false;
  const position = floorPosition(state, dungeon, difficulty);
  // The mode is the dungeon's: it only says something about the difficulty being fought.
  const chosen = floorPosition(state, dungeon).difficulty === difficulty;
  if (!hasDeeperFloor(position) || (chosen && position.mode === 'push')) return true;
  return winsNextFloor(state, content, dungeonId, modifiers, difficulty);
}

/**
 * The tier to climb when nothing else is waiting (DESIGN.md §6 Difficulty tiers, Endless depths):
 * among the open tiers above Normal whose boss is not beaten yet, and the endless depths, the
 * weakest one the loadout can still get down. Null when every one of them is a wall.
 */
function climbTarget(
  state: GameState,
  content: Content,
  modifiers: Modifier[],
): { id: string; difficulty: Difficulty } | null {
  let best: { id: string; difficulty: Difficulty; hp: number } | null = null;
  for (const dungeon of content.dungeons) {
    if (!isDungeonUnlocked(state, content, dungeon.id)) continue;
    for (const difficulty of DIFFICULTIES) {
      if (difficulty === 'normal' || !isDifficultyUnlocked(state, dungeon, difficulty)) continue;
      const position = floorPosition(state, dungeon, difficulty);
      if (position.best >= position.floors) continue; // its boss is beaten
      if (!advances(state, content, dungeon.id, modifiers, difficulty)) continue;
      const stage = fightStage(state, content, dungeon.id, modifiers, undefined, difficulty);
      const hp = stage ? stage.hp.log10().toNumber() : Infinity;
      if (!best || hp < best.hp) best = { id: dungeon.id, difficulty, hp };
    }
  }
  return best && { id: best.id, difficulty: best.difficulty };
}

/**
 * Push or farm (DESIGN.md §6 Dungeon floors): a player who was knocked back to farming pushes
 * again once the next floor is one the loadout wins with room to spare.
 */
export function choosePush(state: GameState, content: Content): GameState {
  const dungeon = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
  if (!dungeon) return state;
  if (floorPosition(state, dungeon).mode === 'push') return state;
  if (!winsNextFloor(state, content, dungeon.id, collectModifiers(state, content))) return state;
  const result = setFloorMode(state, content, dungeon.id, 'push');
  return result.ok ? result.state : state;
}

// ---- running -----------------------------------------------------------------------------------

export interface SimOptions {
  hours: number;
  seed?: number;
  /** Seconds of play per step (the buyer acts between steps). */
  stepSeconds?: number;
  /** Called every `probeSeconds` of sim time with the state (for timelines and tuning). */
  probe?: (state: GameState, t: number) => void;
  probeSeconds?: number;
  /** Also open portals that wait for their screen, such as the Legacy Gate (default false: the
   *  sim plays the game as it ships). */
  openAllPortals?: boolean;
  /** How the player plays (default `active`). */
  profile?: SimProfile;
}

/** `active`: plays every step. `idle`: checks in every 30 min and is offline 8 h a day. */
export type SimProfile = 'active' | 'idle';

/** Idle profile: seconds between two check-ins while the game is open. */
export const IDLE_CHECKIN_SECONDS = 30 * 60;
/** Idle profile: each day is this long awake (game open), then offline for the rest. */
export const IDLE_AWAKE_SECONDS = 16 * 3600;
const DAY_SECONDS = 24 * 3600;
/** Idle profile: seconds of play per step between check-ins (as offline progress chunks it). */
const IDLE_STEP_SECONDS = 60;

export interface SimResult {
  /** Milestone id -> sim seconds when reached, or null. */
  hits: Record<string, number | null>;
  simSeconds: number;
  state: GameState;
  log: SimLog;
  /** [sim seconds, average fighting DPS against the first dungeon] every half hour. */
  dpsSamples: Array<[number, number]>;
  /** [sim seconds, Card Portal pulls, Wardrobe Gate pulls] so far, every quarter hour. */
  pullSamples: Array<[number, number, number]>;
  /** Every run (the stretch between two Ascensions) with its run milestone times. */
  runs: RunRecord[];
}

/** How often the fight target is re-chosen without a kill, in seconds. */
const RECHOOSE_SECONDS = 300;
/** How often the ascension rule is checked, in seconds. */
const ASCEND_CHECK_SECONDS = 60;
/** How often the fighting DPS is sampled for the report, in seconds. */
const DPS_SAMPLE_SECONDS = 900;

export function runSim(bundled: Content, options: SimOptions): SimResult {
  // The sim plays the game as it ships: portals waiting for their screen (the Legacy Gate) stay
  // closed unless asked for.
  const content: Content = options.openAllPortals
    ? { ...bundled, portals: bundled.allPortals }
    : bundled;
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
  const pullSamples: Array<[number, number, number]> = [];
  let t = 0;
  const countSummons = (bought: string[]): void => {
    for (const id of bought) if (id.startsWith('summon:')) log.summons++;
  };
  // Run milestones (the Ascension guard): observed only, they never change what the player does.
  const newRun = (start: number): RunRecord => ({
    start,
    end: start,
    hits: Object.fromEntries(RUN_MILESTONES.map((m) => [m.id, null])),
  });
  const runs: RunRecord[] = [newRun(0)];
  let runBase: RunBase = { moneyEarned: state.upgrades.moneyEarned };
  const idle = options.profile === 'idle';
  let sinceCheckin = Infinity;
  while (t < total) {
    // Idle profile: the night. The game is closed and its own offline progress is taken on return.
    if (idle && t % DAY_SECONDS >= IDLE_AWAKE_SECONDS) {
      const away = Math.min(DAY_SECONDS - (t % DAY_SECONDS), total - t);
      state = simulateOffline(state, content, 0, away * 1000, rng).state;
      if (state.activeDungeonId) {
        log.fought[state.activeDungeonId] = (log.fought[state.activeDungeonId] ?? 0) + away;
      }
      t += away;
      sinceAscendCheck += away;
      sinceCheckin = Infinity;
      recordProgress();
      continue;
    }
    // Idle profile: between check-ins the game runs by itself.
    const acting = !idle || sinceCheckin >= IDLE_CHECKIN_SECONDS;
    if (acting) sinceCheckin = 0;
    if (acting) {
      const buys = greedyBuy(state, content, rng);
      state = buys.state;
      countSummons(buys.bought);
    }
    if (acting && sinceAscendCheck >= ASCEND_CHECK_SECONDS) {
      sinceAscendCheck = 0;
      const preview = ascensionPreview(state, content);
      const now = {
        gain: num(preview.gain),
        minimum: preview.minimum,
        runSeconds: t - runStart,
        earned: num(state.prestige.starlightEarned),
      };
      const holding = now.runSeconds < HOLD_MAX_RUN_SECONDS && holdAscension(state, content);
      if (ascendNow(now, tracker) && !holding) {
        const result = ascend(state, content);
        if (result.ok) {
          const after = greedyBuy(result.state, content, rng);
          state = after.state;
          countSummons(after.bought);
          log.ascensions.push(t);
          runs[runs.length - 1]!.end = t;
          runs.push(newRun(t));
          runBase = { moneyEarned: state.upgrades.moneyEarned };
          runStart = t;
          tracker = { peakRate: 0 };
          sinceChoose = RECHOOSE_SECONDS;
        }
      }
    }
    if (idle ? acting : sinceChoose >= RECHOOSE_SECONDS) {
      if (trialClearedAt === null && isDungeonCleared(state, 'glimmer_trial')) trialClearedAt = t;
      const since = trialClearedAt === null ? 0 : t - trialClearedAt;
      const trialShare = since > 0 ? (log.fought['glimmer_trial'] ?? 0) / since : 0;
      const fight = chooseFight(state, content, { trialShare });
      if (fight.id !== state.activeDungeonId) {
        const result = setActiveDungeon(state, content, fight.id);
        if (result.ok) state = result.state;
      }
      if (fight.id !== null && content.dungeonById.has(fight.id)) {
        const tier = setDifficulty(state, content, fight.id, fight.difficulty);
        if (tier.ok) state = tier.state;
      }
      state = choosePush(state, content);
      sinceChoose = 0;
    }
    const dt = idle
      ? Math.min(
          IDLE_STEP_SECONDS,
          total - t,
          IDLE_CHECKIN_SECONDS - sinceCheckin,
          IDLE_AWAKE_SECONDS - (t % DAY_SECONDS),
        )
      : Math.min(step, total - t);
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
    sinceCheckin += dt;
    if (
      report.bossKills > 0 ||
      report.knockouts > 0 ||
      report.trialAttempts > 0 ||
      report.cleared.length > 0
    ) {
      sinceChoose = RECHOOSE_SECONDS;
    }
    if (report.cardDrops.length > 0) state = optimizeLoadouts(state, content);
    if (t % DPS_SAMPLE_SECONDS < dt) {
      const first = content.dungeons[0]!.id;
      dpsSamples.push([t - (t % DPS_SAMPLE_SECONDS), num(averageDps(state, content, first))]);
      pullSamples.push([
        t - (t % DPS_SAMPLE_SECONDS),
        state.portals['card_portal']?.pulls ?? 0,
        state.portals['wardrobe_gate']?.pulls ?? 0,
      ]);
    }
    if (options.probe && options.probeSeconds && t % options.probeSeconds < dt) {
      options.probe(state, t - (t % options.probeSeconds));
    }
    recordProgress();
  }
  return { hits, simSeconds: t, state, log, dpsSamples, pullSamples, runs };

  /** Notes the milestones, run milestones and account levels the state has reached by now. */
  function recordProgress(): void {
    for (const m of MILESTONES) {
      if (hits[m.id] === null && m.reached(state, content, log)) hits[m.id] = t;
    }
    const run = runs[runs.length - 1]!;
    run.end = t;
    for (const m of RUN_MILESTONES) {
      if (run.hits[m.id] === null && m.reached(state, content, runBase)) {
        run.hits[m.id] = t - run.start;
      }
    }
    for (let level = 2; level <= state.account.level; level++) {
      log.levelAt[level] ??= t;
    }
  }
}

const hoursText = (seconds: number): string => `${(seconds / 3600).toFixed(2)} h`;

/** A target in hours, rounded so a range like 5 to 10 minutes does not print sixteen digits. */
const targetHours = (hours: number): string => String(Number(hours.toFixed(3)));
/** A milestone's target as text: "4 h" or, for a range, "1.5-2 h". */
export const targetText = (m: Milestone): string =>
  m.toHours === undefined
    ? `${targetHours(m.targetHours)} h`
    : `${targetHours(m.targetHours)}-${targetHours(m.toHours)} h`;

/** Sim time over target in percent; inside a target range it is 100%, outside the nearest end. */
export function targetRatio(m: Milestone, hours: number): number {
  const to = m.toHours ?? m.targetHours;
  if (hours >= m.targetHours && hours <= to) return 100;
  return Math.round((hours / (hours < m.targetHours ? m.targetHours : to)) * 100);
}

/** The result as a markdown table: milestone, sim time, DESIGN §14 target. */
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
    lines.push(`| ${m.label} | ${time} | ${targetText(m)} |`);
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
  /** The slowest run: its time, or null when it never reached the milestone. */
  worst: number | null;
  /** Index of that run in the list given (the first of the runs that never reached it). */
  worstRun: number;
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
      worst: hit.length === runs.length ? (hit[hit.length - 1] ?? null) : null,
      worstRun:
        hit.length === runs.length
          ? times.indexOf(hit[hit.length - 1] ?? null)
          : times.indexOf(null),
    };
  }
  return out;
}

const shortHours = (seconds: number): string => (seconds / 3600).toFixed(2);

/** How far the median may sit from its target (DESIGN.md §14 Sim bands): within 25%. */
export const BAND_MEDIAN_PERCENT = 25;
/** How late the worst seed may be: at most this many times the target. */
export const BAND_WORST_FACTOR = 2;

/**
 * The band check of one milestone: the median within 25% of its target and the worst seed
 * within 2x (a seed that never reaches it fails), so a stalled run cannot hide behind the median.
 */
export function bandCheck(m: Milestone, s: MilestoneSpread): { median: boolean; worst: boolean } {
  const ratio = s.median === null ? Infinity : targetRatio(m, s.median / 3600);
  const limit = (m.toHours ?? m.targetHours) * 3600 * BAND_WORST_FACTOR;
  return {
    median: Math.abs(ratio - 100) <= BAND_MEDIAN_PERCENT,
    worst: s.worst !== null && s.worst <= limit,
  };
}

/** The slowest run of a milestone as text: "19.27 h (seed 3)" or "never (seed 2)". */
function worstText(s: MilestoneSpread, seeds?: readonly number[]): string {
  const seed = seeds?.[s.worstRun];
  const who = seed === undefined ? '' : ` (seed ${seed})`;
  return `${s.worst === null ? 'never' : hoursText(s.worst)}${who}`;
}

/**
 * Markdown table: milestone, target, median, spread, worst seed, runs reaching it, median /
 * target and the band check; with `idle`, the idle profile's median and worst seed beside it.
 */
export function formatSeedTable(
  summary: Record<string, MilestoneSpread>,
  simSeconds: number,
  options: { seeds?: readonly number[]; idle?: Record<string, MilestoneSpread> } = {},
): string {
  const idleHead = options.idle ? ' Idle median | Idle worst seed |' : '';
  const lines = [
    `| Milestone | Target | Sim median | Spread (min-max) | Worst seed | Reached | Median / target | Check |${idleHead}`,
    `|---|---|---|---|---|---|---|---|${options.idle ? '---|---|' : ''}`,
  ];
  let passed = 0;
  let rows = 0;
  for (const m of MILESTONES) {
    const s = summary[m.id];
    if (!s) continue;
    const median = s.median === null ? `> ${hoursText(simSeconds)}` : hoursText(s.median);
    const spread =
      s.min === null || s.max === null ? '-' : `${shortHours(s.min)}-${shortHours(s.max)} h`;
    const ratio = s.median === null ? '-' : `${targetRatio(m, s.median / 3600)}%`;
    const check = bandCheck(m, s);
    const failed = [check.median ? '' : 'median', check.worst ? '' : 'worst'].filter(Boolean);
    // What a milestone needs may not be in the game yet: it is not held against the bands.
    const notBuilt = m.pending !== undefined && s.reached === 0;
    if (!notBuilt) rows++;
    if (!notBuilt && failed.length === 0) passed++;
    let idle = '';
    if (options.idle) {
      const i = options.idle[m.id];
      const idleMedian = !i
        ? '-'
        : i.median === null
          ? `> ${hoursText(simSeconds)}`
          : hoursText(i.median);
      idle = ` ${idleMedian} | ${i ? worstText(i, options.seeds) : '-'} |`;
    }
    lines.push(
      `| ${m.label} | ${targetText(m)} | ${median} | ${spread} | ${worstText(s, options.seeds)} | ${s.reached}/${s.runs} | ${ratio} | ${notBuilt ? `not built (${m.pending})` : failed.length === 0 ? 'ok' : `FAIL ${failed.join(', ')}`} |${idle}`,
    );
  }
  lines.push(
    '',
    `Bands: ${passed} of ${rows} milestones pass (median within ${BAND_MEDIAN_PERCENT}% of the target, worst seed within ${BAND_WORST_FACTOR}x).`,
  );
  return lines.join('\n');
}

/** Whether every milestone of the summary passes its band check. */
export function bandsPass(summary: Record<string, MilestoneSpread>): boolean {
  return MILESTONES.every((m) => {
    const s = summary[m.id];
    if (!s || (m.pending !== undefined && s.reached === 0)) return true;
    const check = bandCheck(m, s);
    return check.median && check.worst;
  });
}

const minutesText = (seconds: number | null | undefined): string =>
  seconds === null || seconds === undefined ? '-' : `${(seconds / 60).toFixed(1)} min`;

/** Markdown table: one row per run with the time it took to reach each run milestone. */
export function formatRunTable(runs: readonly RunRecord[]): string {
  const lines = [
    `| Run | Started | Length | ${RUN_MILESTONES.map((m) => m.label).join(' | ')} |`,
    `|---|---|---|${RUN_MILESTONES.map(() => '---|').join('')}`,
  ];
  runs.forEach((run, i) => {
    lines.push(
      `| ${i + 1} | ${hoursText(run.start)} | ${hoursText(run.end - run.start)} | ${RUN_MILESTONES.map((m) => minutesText(run.hits[m.id])).join(' | ')} |`,
    );
  });
  return lines.join('\n');
}

/** The Ascension guard over several seeds as one line (and the misses, if any). */
export function formatGuard(
  runsBySeed: ReadonlyArray<{ seed: number; runs: readonly RunRecord[] }>,
): string {
  let compared = 0;
  const lines: string[] = [];
  for (const { seed, runs } of runsBySeed) {
    const guard = ascensionGuard(runs);
    compared += guard.compared;
    for (const miss of guard.misses) {
      const label = RUN_MILESTONES.find((m) => m.id === miss.id)?.label ?? miss.id;
      lines.push(
        `- seed ${seed}, run ${miss.run}: ${label} took ${miss.after === null ? 'longer than the run lasted' : minutesText(miss.after)} (the run before: ${minutesText(miss.before)})`,
      );
    }
  }
  const head = `Ascension guard (every run reaches its first ${RUN_MILESTONES.length} milestones sooner than the run before): ${
    compared === 0
      ? 'nothing to compare'
      : lines.length === 0
        ? `ok, ${compared} comparisons`
        : `${lines.length} of ${compared} comparisons slower`
  }`;
  return [head, ...lines].join('\n');
}

/** One line per job and a few totals, to read alongside the table. */
export function formatSummary(result: SimResult, content: Content): string {
  const s = result.state;
  const cards = Object.entries(s.cards.owned)
    .map(([id, c]) => `${content.cardById.get(id)?.name ?? id} ${c.tier} ★${c.stars} Lv ${c.level}`)
    .join(', ');
  const mines = content.mines
    .map((m) => `${m.name} ${s.production.mineLevels[m.id] ?? 0}`)
    .join(', ');
  const trees = content.trees
    .map((t) => `${t.name} ${s.production.treeLevels[t.id] ?? 0}`)
    .join(', ');
  const fought = Object.entries(result.log.fought)
    .map(([d, sec]) => `${d} ${hoursText(sec)}`)
    .join(', ');
  const modifiers = collectModifiers(s, content);
  const walls = content.dungeons
    .map((d) => {
      const spk = secondsPerKill(s, content, d.id, modifiers);
      const survive = survivalSeconds(s, content, d.id, modifiers) ?? Infinity;
      const at = floorPosition(s, d);
      const where = Number.isFinite(at.floors)
        ? `floor ${at.floor}/${at.floors}`
        : `depth ${at.floor}`;
      return `${d.id} ${at.difficulty} ${where} (best ${at.best}, ${at.mode}) ${spk === null ? '-' : `${spk.toFixed(0)} s/floor`} (survives ${survive.toFixed(0)} s)`;
    })
    .join(', ');
  return [
    `Fights at the end: ${walls}`,
    `Best floors: ${content.dungeons
      .map(
        (d) =>
          `${d.id} ${DIFFICULTIES.filter((x) => isDifficultyUnlocked(s, d, x))
            .map((x) => `${x} ${floorPosition(s, d, x).best}`)
            .join(', ')}`,
      )
      .join('; ')}`,
    `Boss and mini-boss kills: ${s.stats.bossKills} (last-floor bosses: ${Object.entries(
      s.combat.kills,
    )
      .map(([d, k]) => `${d} ${k}`)
      .join(', ')})`,
    `DPS vs Mossy Cellar: ${result.dpsSamples
      .filter(([t]) => [1, 2, 4, 8, 12, 16, 20, 30, 40].includes(t / 3600))
      .map(([t, d]) => `${t / 3600} h ${d.toExponential(1)}`)
      .join(', ')}`,
    `Time fought: ${fought || 'none'}`,
    `Summons: ${result.log.summons} pulls; Money in hand ${num(s.resources['money'] ?? new Decimal(0)).toExponential(1)}, crystals ${num(s.resources['summon_crystal'] ?? new Decimal(0)).toFixed(0)} summon / ${num(s.resources['glamour_crystal'] ?? new Decimal(0)).toFixed(0)} glamour`,
    `Ascensions at: ${result.log.ascensions.map(hoursText).join(', ') || 'none'} (Starlight earned ${s.prestige.starlightEarned.toFixed(0)})`,
    `Tree levels: ${trees}`,
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
