/**
 * Balance sim, DESIGN.md §14: plays the real game logic fast with a scripted
 * player and records when each beta pacing milestone is reached.
 *
 * The buyer (Phase 9), every step:
 * - buys card star-ups and tier-ups, tree kinds, cosmetic levels, summons (10-pulls when
 *   affordable, else single pulls), Starlight shop levels (cheapest first) and skill points (the
 *   most value per point, `nextSkill`) as soon as they are affordable, and rebuilds each card's
 *   enhancements as the best set its budget allows;
 * - builds one card at a time (`buildOrder`: the lead, its supports, its workers): the wishlist,
 *   star dust and shard-shop copies go to it;
 * - keeps the resources the next waiting card upgrade or tree kind needs (reservations);
 * - spends its Money on the economy purchase with the best gain per Money: a mine level (relative gain
 *   of the weighted production) or a tree level (the same), waiting for the
 *   best one unless a cheaper one costs a small share of it. A card's tier-up also costs Money, so
 *   it is kept for it once the card is at its level cap (a star-up costs only the star bar);
 * - leads with the hardest-hitting card, fills the supports with the rarest ones, places workers
 *   where they bring in the most (second slots too), runs the forge for star dust, equips complete
 *   cosmetic sets, switches its autobuyers on and every overflow switch as it opens;
 * - pushes down a dungeon's floors whenever the next floor is one it wins with room to spare (a
 *   knockout drops it a floor and back to farming, by the game's own rule);
 * - farms a wanted Core on the tier that pays it fastest and a last-floor boss close to its next
 *   star level, and climbs the Hard and Nightmare tiers and the endless depths when nothing else
 *   is waiting;
 * - fights: the Glimmer Trial once it can score 100%, else a newly killable dungeon, else the
 *   cleared trial for cosmetic materials within a time share, else a dungeon whose Core a card
 *   waits for, else the hardest killable one (every dungeon pays Money and both crystals);
 * - ascends once the run's Starlight per hour has passed its peak, or its gain is three times all
 *   the Starlight earned.
 * Mastery, milestones, crits, achievements and account levels come from the real game rules.
 *
 * Profiles (DESIGN.md §14 Sim bands): `active` plays every step for the whole time; `idle` checks
 * in every 30 minutes (the game stays open in between, nothing is bought or re-aimed) and is
 * offline 8 hours a day, taking the game's own offline progress on return.
 */
import { RANK_TIERS, RARITIES, type Content, type SkillNode } from '../../src/data';
import {
  advance,
  activeWorkers,
  assignForgeWorker,
  assignWorker,
  forgeWorker,
  setForgeRecipe,
  workersUsed,
  producerLevel,
  producersOf,
  workerPower,
  workerSlots,
  PRODUCTION_JOBS,
  type OwnedCard,
  buyMineLevel,
  buyMineLevels,
  curveMaxAffordable,
  MAX_BULK_LEVELS,
  buyTraining,
  buyTool,
  toolLines,
  trainingLines,
  cardPower,
  cardBaseDamage,
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
  buyTreeLevels,
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
  setAutoChallenge,
  setOverflow,
  stageStars,
  DIFFICULTIES,
  type Difficulty,
  setActiveDungeon,
  setLoadout,
  starUp,
  starUpCheck,
  starDustCost,
  starUpWithDust,
  buyShardItem,
  tierUp,
  tierUpCheck,
  cardStatPower,
  treeUnlockCost,
  unlockTree,
  averageDps,
  cardCost,
  claimDaily,
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
  setWishlisted,
  autobuyerOwned,
  setAutomation,
  depthYield,
  workersPerPlace,
  forgeRecipe,
  statValue,
  respecInfo,
  respecSkills,
  skillPoints,
  stageKey,
  cosmeticMaxLevel,
  cosmeticUpgradeCheck,
  upgradeCosmetic,
  equipCosmetic,
  type CardLoadout,
  type GameState,
  type Modifier,
  type Price,
  type Rng,
  pickDungeon,
  startFloorChallenge,
  startChallenge,
  leaveChallenge,
  isOnTrip,
  isRestricted,
  challengesOpen,
  challengeById,
  challengeTarget,
  FOCUS_PORTAL_ID,
  setFocusKind,
  formatShort,
} from '../../src/game';
import {
  CHALLENGE_GIVE_UP_SECONDS,
  CHALLENGE_TRY_MARGIN,
  CHALLENGE_WIN,
  challengeLooksQuick,
  challengeMargin,
  challengeOrder,
  challengeWall,
  focusChoice,
  gemWeight,
  runExpeditions,
  teamForChallenge,
  teamRoles,
  wantsCardsNow,
} from './table';
export {
  CHALLENGE_TRY_MARGIN,
  CHALLENGE_WIN,
  challengeMargin,
  focusChoice,
  pullValue,
  runExpeditions,
  teamForChallenge,
  teamSurvival,
  wantsCardsNow,
} from './table';

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
  /** Star dust spent on stars. */
  dustSpent?: number;
  /** The table update's systems (DESIGN.md §14 The sim player's choices), for the report. */
  table?: TableLog;
}

/** What the sim counts of the table update's systems. */
export interface TableLog {
  /** Floor Challenges won and lost, and how many of them the player started by hand. */
  challengesWon: number;
  challengesLost: number;
  manualTries: number;
  /** The longest stretch without a new best floor anywhere (seconds), and where it fought. */
  stuckLongest: number;
  stuckWhere: string;
  /** Sim seconds of the last new best floor, and the sum of best floors then. */
  lastRiseAt: number;
  bestSum: number;
  /** Scrolls spent on pulls: Summon (Card and Focus Portal) and Glamour. */
  summonSpent: number;
  glamourSpent: number;
  /** Pulls made at the Focus Portal. */
  focusPulls: number;
  /** Expeditions: trips collected, Core units and tier-weighted gems they brought. */
  trips: number;
  tripMaterials: number;
  tripGems: number;
  /** Core units the fights brought (the trips' share is measured against them). */
  fightMaterials: number;
  /** Ascension challenges started, left, and each completion: [challenge id, sim seconds]. */
  challengeRuns: number;
  challengesLeft: number;
  completions: Array<[string, number]>;
}

/** An empty `TableLog`. */
export const emptyTableLog = (): TableLog => ({
  challengesWon: 0,
  challengesLost: 0,
  manualTries: 0,
  stuckLongest: 0,
  stuckWhere: '-',
  lastRiseAt: 0,
  bestSum: 0,
  summonSpent: 0,
  glamourSpent: 0,
  focusPulls: 0,
  trips: 0,
  tripMaterials: 0,
  tripGems: 0,
  fightMaterials: 0,
  challengeRuns: 0,
  challengesLeft: 0,
  completions: [],
});

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
    // 0.5 h (user, 2026-11-11): a Common needs a copy a star and the wishlist sends it every
    // Common pull, so its stars fill within the first hour.
    targetHours: 0.5,
    // Every card starts at ★1, so any ★6 was earned with copies (DESIGN.md §5 Stars).
    reached: (s) => Object.values(s.cards.owned).some((owned) => owned.stars >= 6),
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
    // Every other milestone reached and a weapon taken to the last tier (T6, Mythic or Void,
    // DESIGN.md §5): the final upgrade of the beta. Owning every card is not asked (user,
    // 2026-11-11): the Mythic and Void cards come at 0.2% and 0.1% a pull.
    reached: (s, c, log) =>
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

/** The branches the buyer fills first: what makes a run faster, then the rest. */
const SKILL_BRANCH_PRIORITY = [
  'combat',
  'luck',
  'mining',
  'logging',
  'workers',
  'dungeons',
  'forge',
  'elements',
  'collection',
  'automation',
  'ascension',
];

/**
 * Account tree nodes in the order the buyer fills them (each up to its max rank): the skeleton's
 * slots from the middle outwards, every branch in turn, then the weapon circles. The buyer takes
 * the first one it can buy, so closed rings and locked nodes are skipped on their own.
 */
export function skillPriority(content: Content): string[] {
  const out: string[] = [];
  for (const slot of content.account.skeleton) {
    for (const branch of SKILL_BRANCH_PRIORITY) out.push(`${branch}_${slot.slot}`);
  }
  for (const node of content.account.tree) if (node.circle) out.push(node.id);
  return out;
}

/**
 * What one unit of a skill's stat is worth to the player, as a share of its power: per 1 for a
 * percent modifier (5 = +5%) and per 1 for a flat one. Damage is the yardstick (+1% damage = 0.01);
 * production counts at PRODUCTION_VALUE, as the buyer values it; anything unlisted a little.
 */
const SKILL_WEIGHT: Record<string, number> = {
  'combat.damage': 0.01,
  'combat.health': 0.005,
  'combat.critChance': 1,
  'combat.critDamage': 0.1,
  'combat.defence': 0.003,
  'burst.power': 0.01,
  'burst.fill': 0.003,
  'burst.interval': 0.005,
  'production.rate': 0.0035,
  'worker.power': 0.0035,
  'production.levelBonus': 0.002,
  'cost.growth': 0.01,
  'drops.crystalMultiplier': 0.003,
  'drops.materialChance': 0.003,
  'prestige.gain': 0.004,
  'stars.damage': 0.002,
  'xp.card': 0.002,
};

/**
 * Whether a skill acts now (DESIGN.md §10 Hidden weapon circles): a branch skill always; a fighting
 * circle only while the loadout's main card carries that weapon type; the pickaxe and logging axe
 * circles while a card carrying it is at work.
 */
function skillActive(state: GameState, content: Content, node: SkillNode): boolean {
  if (!node.circle) return true;
  const kindOf = (id: string | null): string | undefined =>
    id ? content.cardById.get(id)?.item.kind : undefined;
  if (kindOf(state.cards.loadouts.fighting.main) === node.circle) return true;
  return Object.values(activeWorkers(state, content))
    .flat()
    .some((id) => kindOf(id) === node.circle);
}

/** What one rank of a skill is worth now (0 for a circle skill that does not act). */
export function skillValue(state: GameState, content: Content, node: SkillNode): number {
  if (!skillActive(state, content, node)) return 0;
  return node.perRank.reduce(
    (sum, m) => sum + Math.abs(num(new Decimal(m.value))) * (SKILL_WEIGHT[m.stat] ?? 0.001),
    0,
  );
}

/**
 * The skill to buy next (DESIGN.md §10): among the nodes it can buy now, the most value per skill
 * point, where a node also counts half of the best node it opens (so a path to a keystone or a
 * large skill is walked). Ties go to the branch priority order (`skillPriority`).
 */
export function nextSkill(state: GameState, content: Content): string | null {
  const nodes = skillTree(state, content);
  const value = new Map(nodes.map((n) => [n.node.id, skillValue(state, content, n.node)]));
  const order = skillPriority(content);
  let best: { id: string; score: number; rank: number } | null = null;
  for (const info of nodes) {
    if (!info.canBuy) continue;
    const id = info.node.id;
    const opens = nodes
      .filter((n) => n.rank === 0 && n.node.requires.includes(id))
      .map((n) => (value.get(n.node.id) ?? 0) / n.node.cost);
    const own = value.get(id) ?? 0;
    if (own === 0 && opens.every((v) => v === 0)) continue;
    const score = own / info.node.cost + 0.5 * Math.max(0, ...opens);
    const rank = order.indexOf(id) < 0 ? order.length : order.indexOf(id);
    if (
      !best ||
      score > best.score + 1e-12 ||
      (Math.abs(score - best.score) <= 1e-12 && rank < best.rank)
    ) {
      best = { id, score, rank };
    }
  }
  return best?.id ?? null;
}

/** Skill points in skills that do nothing now at which the player respecs. */
export const RESPEC_WASTED_POINTS = 3;
/** Most of the Starlight in hand a paid respec may cost. */
const RESPEC_PRICE_SHARE = 0.1;

/**
 * Respec (DESIGN.md §10): when at least RESPEC_WASTED_POINTS skill points sit in weapon circle
 * skills that do not act (the lead changed weapon type), the player refunds every point, free once
 * per Ascension, else when it costs at most a tenth of the Starlight in hand; the buyer then spends
 * them again by value.
 */
export function chooseRespec(state: GameState, content: Content): GameState {
  let wasted = 0;
  for (const node of content.account.tree) {
    const rank = state.account.skills[node.id] ?? 0;
    if (rank > 0 && !skillActive(state, content, node)) wasted += rank * node.cost;
  }
  if (wasted < RESPEC_WASTED_POINTS) return state;
  const modifiers = collectModifiers(state, content);
  const info = respecInfo(state, content, modifiers);
  const affordable =
    info.free ||
    (info.price !== null &&
      info.price.amount.lte(have(state, info.price.resource).mul(RESPEC_PRICE_SHARE)));
  if (!affordable) return state;
  const result = respecSkills(state, content, modifiers);
  return result.ok ? result.state : state;
}

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
  /** Mine and tree levels: buys as many levels as `budget` pays for (the game's bulk buy) and says how many, or null. */
  bulk?: (
    state: GameState,
    content: Content,
    modifiers: Modifier[],
    budget: Decimal,
  ) => { state: GameState; count: number } | null;
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

/** `productionPerSecond`, remembered per state and modifier list like `incomeOf`. */
const productions = new WeakMap<GameState, WeakMap<readonly Modifier[], Record<string, Decimal>>>();

function productionOf(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
): Record<string, Decimal> {
  let byModifiers = productions.get(state);
  if (!byModifiers) productions.set(state, (byModifiers = new WeakMap()));
  let out = byModifiers.get(modifiers);
  if (!out) byModifiers.set(modifiers, (out = productionPerSecond(state, content, modifiers)));
  return out;
}

/** Weighted production per second of every unlocked gem: Σ rate × Starlight tier weight. */
function weightedProduction(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
  resources?: readonly string[],
): number {
  const weights = content.prestige.gain.tierWeights;
  let total = 0;
  for (const [id, rate] of Object.entries(productionOf(state, content, modifiers))) {
    if (resources && !resources.includes(id)) continue;
    const tier = content.resourceById.get(id)?.tier ?? 1;
    total += num(rate) * num(weights[Math.min(tier, weights.length) - 1]!);
  }
  return total;
}

/** How much the buyer values a relative rise of what a training line raises (damage is 1). */
const TRAINING_VALUE: Record<string, number> = {
  'combat.damage': 1,
  'drops.moneyMultiplier': 0.7,
  'combat.health': 0.5,
  'burst.fill': 0.3,
};

/** `challengeWall`, remembered per state and modifier list like `incomeOf`. */
const walls = new WeakMap<GameState, WeakMap<readonly Modifier[], 'health' | 'damage' | null>>();

/**
 * The value of a relative rise of a training line's stat: TRAINING_VALUE, except that health is
 * worth as much as damage while the team's health is what loses it the next Challenge
 * (`challengeWall`).
 */
export function trainingValue(
  state: GameState,
  content: Content,
  stat: string,
  modifiers: readonly Modifier[],
): number {
  if (stat !== 'combat.health') return TRAINING_VALUE[stat] ?? 0.3;
  let byModifiers = walls.get(state);
  if (!byModifiers) walls.set(state, (byModifiers = new WeakMap()));
  let wall = byModifiers.get(modifiers);
  if (wall === undefined) {
    wall = challengeWall(state, content, modifiers);
    byModifiers.set(modifiers, wall);
  }
  return wall === 'health' ? TRAINING_VALUE['combat.damage']! : TRAINING_VALUE[stat]!;
}

/**
 * What a relative rise of a gem's income is worth through the training it pays for (DESIGN.md §6
 * The gems of training): a line's price grows `growth` times a level, so income `1 + x` times as
 * high buys about ln(1 + x) / ln(growth) more levels, each worth the line's next rise
 * (`trainingValue`). Mines and trees add it to their gain, so a level of the gem a wall needs is
 * worth more. 0 for a gem no line costs.
 */
export function trainingFeed(
  state: GameState,
  content: Content,
  resource: string,
  modifiers: readonly Modifier[],
): number {
  let value = 0;
  for (const t of trainingLines(state, content, 1, modifiers)) {
    if (t.offer.price.resource !== resource || t.now.lte(0)) continue;
    const growth = num(new Decimal(t.line.cost.growth));
    if (!(growth > 1)) continue;
    const rise = t.after.div(t.now).toNumber() - 1;
    value += (trainingValue(state, content, t.line.stat, modifiers) * rise) / Math.log(growth);
  }
  return value;
}

/** Share of a place's output its harvest gauge bursts add at a strike speed of 1 (10 s every 30). */
const BURST_SHARE = 1 / 3;

/**
 * The relative rise of a job's output one tool line level gives (DESIGN.md §4 Tool lines): yield
 * multiplies the output; strike speed fills the harvest gauge faster (its bursts are about a third
 * of the output) and digs faster; crit chance and crit damage raise the expected harvest,
 * 1 + chance × (damage − 1), the one by the other.
 */
export function toolGain(
  stat: string,
  now: Decimal,
  after: Decimal,
  job: (typeof PRODUCTION_JOBS)[number],
  modifiers: readonly Modifier[],
): number {
  const rise = num(now) > 0 ? num(after) / num(now) - 1 : 0;
  if (stat === 'production.rate') return rise;
  if (stat === 'harvest.speed') return (rise * BURST_SHARE) / (1 + BURST_SHARE);
  const chance = num(statValue('harvest.critChance', 0, modifiers, { job }));
  const damage = num(statValue('harvest.critDamage', 2, modifiers, { job }));
  const expected = 1 + chance * (damage - 1);
  const delta = num(after) - num(now);
  if (stat === 'harvest.critChance') return (delta * (damage - 1)) / expected;
  if (stat === 'harvest.critDamage') return (delta * chance) / expected;
  return 0;
}

/** The economy purchases (mine and tree levels, training, shelf upgrades) with their gains. */
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
    const rise = now > 0 ? (next - now) / now : 1;
    out.push({
      id: `mine:${mine.id}`,
      kind: 'economy',
      prices: [price],
      gain:
        PRODUCTION_VALUE * (now > 0 ? rise * share : 1) +
        rise * trainingFeed(state, content, mine.resource, modifiers),
      buy: (s, c, m) => okState(buyMineLevel(s, c, mine.id, m)),
      bulk: (s, c, m, budget) => {
        const ctx = { job: 'mining' as const, producer: mine.id, resource: mine.resource };
        const max = curveMaxAffordable(mine.level.cost, mineLevel(s, mine.id), budget, m, ctx);
        if (max.count < 1) return null;
        const r = okState(buyMineLevels(s, c, mine.id, max.count, m));
        return r && { state: r, count: max.count };
      },
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
    const rise = now > 0 ? (next - now) / now : 1;
    out.push({
      id: `tree:${tree.id}`,
      kind: 'economy',
      prices: [price],
      gain:
        PRODUCTION_VALUE * (now > 0 ? rise * share : 1) +
        rise * trainingFeed(state, content, tree.resource, modifiers),
      buy: (s, c, m) => okState(buyTreeLevel(s, c, tree.id, m)),
      bulk: (s, c, m, budget) => {
        const ctx = { job: 'logging' as const, producer: tree.id, resource: tree.resource };
        const max = curveMaxAffordable(tree.level.cost, treeLevel(s, tree.id), budget, m, ctx);
        if (max.count < 1) return null;
        const r = okState(buyTreeLevels(s, c, tree.id, max.count, m));
        return r && { state: r, count: max.count };
      },
    });
  }
  // Training (DESIGN.md §6): the repeatable fighting upgrades, valued by what they raise.
  for (const t of trainingLines(state, content, 1, modifiers)) {
    const rise = t.now.gt(0) ? t.after.div(t.now).toNumber() - 1 : 0;
    out.push({
      id: `train:${t.line.id}`,
      kind: 'economy',
      prices: [t.offer.price],
      gain: trainingValue(state, content, t.line.stat, modifiers) * rise,
      buy: (s, c, m) => okState(buyTraining(s, c, t.line.id, 1, m)),
    });
  }
  // Tool lines (DESIGN.md §4): each by how much it raises its job's output (`toolGain`).
  for (const job of PRODUCTION_JOBS) {
    const jobShare =
      totalProduction > 0
        ? weightedProduction(
            state,
            content,
            modifiers,
            producersOf(content, job).map((p) => p.resource),
          ) / totalProduction
        : 0.5;
    for (const t of toolLines(state, content, job, 1, modifiers)) {
      const gain =
        PRODUCTION_VALUE * jobShare * toolGain(t.line.stat, t.now, t.after, job, modifiers);
      out.push({
        id: `tool:${t.line.id}`,
        kind: 'economy',
        prices: [t.offer.price],
        gain,
        buy: (s, c, m) => okState(buyTool(s, c, t.line.id, 1, m)),
      });
    }
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
  // Account tree: the node worth the most per point (`nextSkill`; no resource price).
  const skill = skillPoints(state, content).available > 0 ? nextSkill(state, content) : null;
  if (skill) {
    out.push({
      id: `skill:${skill}`,
      kind: 'skill',
      prices: [],
      buy: (s, c) => okState(buySkill(s, c, skill)),
    });
  }
  // Starlight shop: the cheapest level of the useful items.
  const offers = starlightShop(state, content, modifiers)
    .filter((o) => o.price && !o.locked && !STARLIGHT_SKIP.has(o.item.id))
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
    // The Legacy Gate's skins are looks only: the sim player leaves them (and their pity and
    // rarity milestones) alone, as it does the cosmetics' looks it cannot value.
    if (portal.kind === 'skins') continue;
    // Scrolls (DESIGN.md §7): single pulls only while a team or worker slot waits for a card;
    // otherwise the scrolls are saved for 10-pulls (the Rare guarantee at the same price a pull).
    const counts = portal.kind === 'cards' && wantsCardsNow(state, content) ? [10, 1] : [10];
    for (const count of counts as (1 | 10)[]) {
      const price = pullPrice(portal, count, modifiers);
      // The Card Portal's scrolls may go to the Focus Portal instead (`focusChoice`), looked at
      // only when a pull is affordable.
      const focus =
        portal.kind === 'cards' && have(state, price.resource).gte(price.amount)
          ? focusChoice(state, content, new Set(buildOrder(state, content))).kind
          : null;
      const id = focus === null ? portal.id : `${FOCUS_PORTAL_ID}:${focus}`;
      out.push({
        id: count === 10 ? `summon:${id}:10` : `summon:${id}`,
        kind: 'summon',
        prices: [price],
        buy: (s, c, m, rng) => {
          if (focus === null) return okState(pull(s, c, portal.id, count, rng, m));
          const aimed = setFocusKind(s, c, focus);
          return aimed.ok ? okState(pull(aimed.state, c, FOCUS_PORTAL_ID, count, rng, m)) : null;
        },
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

/** Marks a line in `bought` whose bulk buy hit MAX_BULK_LEVELS. */
const MAXED = ':max';

/** Levels of one economy line bought in a row before the buyer ranks everything again. */
export const ECONOMY_RUN = 25;

/**
 * After an economy purchase the buyer takes more levels of the same line, up to ECONOMY_RUN, while
 * what is held stays above what it reserves for card upgrades. When those levels were still cheap
 * (each under 1/ECONOMY_RUN of what is left to spend), a mine or tree then takes as many levels
 * as 1/ECONOMY_RUN of what is left pays for, through the game's bulk buy. A speed-up: the gain of
 * one more level of the best line barely moves between two levels, and ranking every candidate
 * again after each level made the passes after a big Ascension, which buy millions of mine levels
 * once Money runs away, take hours. A bulk buy that hits the game's cap (MAX_BULK_LEVELS) ends
 * that line for the pass, like a player who clicks Max once per look: when level prices stop
 * growing, the levels on offer never run out.
 */
export function buyAgain(
  state: GameState,
  content: Content,
  candidate: Candidate,
  modifiers: Modifier[],
  rng: Rng,
  reserved: Map<string, Decimal>,
  bought: string[],
): GameState {
  const left = (s: GameState, resource: string): Decimal =>
    have(s, resource).sub(reserved.get(resource) ?? 0);
  let current = state;
  let cheap = false;
  for (let i = 1; i < ECONOMY_RUN; i++) {
    const next = candidate.buy(current, content, modifiers, rng);
    if (!next) return current;
    if (candidate.prices.some((p) => left(next, p.resource).lt(0))) return current;
    bought.push(candidate.id);
    cheap = candidate.prices.every((p) =>
      have(current, p.resource)
        .sub(have(next, p.resource))
        .mul(ECONOMY_RUN)
        .lte(left(next, p.resource)),
    );
    current = next;
  }
  const price = candidate.prices[0];
  if (!cheap || !candidate.bulk || !price || candidate.prices.length !== 1) return current;
  const many = candidate.bulk(
    current,
    content,
    modifiers,
    left(current, price.resource).div(ECONOMY_RUN),
  );
  if (!many) return current;
  // A Max that hits the game's bulk cap: this line is done for the pass (see greedyBuy).
  bought.push(many.count >= MAX_BULK_LEVELS ? `${candidate.id}${MAXED}` : candidate.id);
  return many.state;
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
): { state: GameState; bought: string[]; dustSpent: number } {
  let current = chooseRespec(state, content);
  const bought: string[] = [];
  let candidates: Candidate[] = [];
  const maxed = new Set<string>();
  for (let i = 0; i < MAX_BUYS_PER_PASS; i++) {
    const modifiers = collectModifiers(current, content);
    let next: GameState | null = null;
    candidates = buyerCandidates(current, content, modifiers);
    for (const candidate of pickPurchase(current, content, candidates)) {
      if (maxed.has(candidate.id)) continue;
      next = candidate.buy(current, content, modifiers, rng);
      if (next) {
        bought.push(candidate.id);
        if (candidate.kind === 'economy') {
          next = buyAgain(
            next,
            content,
            candidate,
            modifiers,
            rng,
            reservations(current, candidates),
            bought,
          );
          if (bought[bought.length - 1] === `${candidate.id}${MAXED}`) maxed.add(candidate.id);
        }
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
  const dust = spendStarDust(current, content);
  const shards = spendShards(dust.state, content);
  current = shards === current ? current : optimizeLoadouts(shards, content);
  current = fillEnhancements(current, content);
  current = equipSets(current, content);
  current = markWishlist(current, content);
  current = chooseAutomation(current, content, candidates);
  return { state: current, bought, dustSpent: dust.spent };
}

/** The value the buyer gives an enhancement option. */
function optionWeight(option: { modifiers: readonly { stat: string }[] }): number {
  return ENHANCEMENT_WEIGHT[option.modifiers[0]?.stat ?? ''] ?? 0.5;
}

/**
 * Gives each card the enhancement set with the most weight its budget allows (among the options
 * it has the level for), rebuilt with a free respec whenever a better set fits.
 */
export function fillEnhancements(state: GameState, content: Content): GameState {
  let current = state;
  for (const cardId of Object.keys(state.cards.owned)) {
    const info = cardEnhancements(current, content, cardId);
    if (!info?.unlocked) continue;
    // 0/1 knapsack over the options the card has reached the level of
    const options = info.options.filter((o) => o.open).map((o) => o.option);
    const table: { weight: number; ids: string[] }[] = Array.from(
      { length: info.budget + 1 },
      () => ({
        weight: 0,
        ids: [],
      }),
    );
    for (const o of options) {
      const w = optionWeight(o);
      for (let b = info.budget; b >= o.cost; b--) {
        const from = table[b - o.cost]!;
        if (from.weight + w > table[b]!.weight) {
          table[b] = { weight: from.weight + w, ids: [...from.ids, o.id] };
        }
      }
    }
    const best = table[info.budget]!.ids;
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

/**
 * The cards the player is building, most important first (DESIGN.md §5 Stars): the fighting lead,
 * its supports in slot order, then the cards at work by worker power. Every one of them gains from
 * copies and star dust; a card at ★6 gains nothing until its tier-up, so `needsStars` leaves it out.
 * A lead at its rarity's top tier can grow no further, so its heir (`heir`) comes right after it.
 */
export function buildOrder(state: GameState, content: Content): string[] {
  const loadout = state.cards.loadouts.fighting;
  const out: string[] = [];
  const add = (id: string | null | undefined): void => {
    if (id && state.cards.owned[id] && !out.includes(id)) out.push(id);
  };
  add(loadout.main);
  add(heir(state, content));
  for (const id of loadout.supports) add(id);
  const working = [
    ...Object.values(activeWorkers(state, content)).flat(),
    ...(forgeWorker(state, content) ? [forgeWorker(state, content)!] : []),
  ].sort(
    (a, b) =>
      workerPower(content, b, state.cards.owned[b]!) -
      workerPower(content, a, state.cards.owned[a]!),
  );
  for (const id of working) add(id);
  return out;
}

/**
 * The card that takes over from a lead at its rarity's top tier (`buildOrder`): the rarest owned
 * fighting card above the lead's rarity, the strongest of them; null while the lead can still tier
 * up or nothing rarer is owned.
 */
export function heir(state: GameState, content: Content): string | null {
  const main = state.cards.loadouts.fighting.main;
  const lead = main ? content.cardById.get(main) : undefined;
  if (!main || !lead) return null;
  if (tierUpCheck(state, content, main)?.available) return null;
  const rank = (id: string): number => RARITIES.indexOf(content.cardById.get(id)!.rarity);
  const rarer = content.cards
    .filter((c) => c.job === 'fighting' && state.cards.owned[c.id] && rank(c.id) > rank(main))
    .map((c) => c.id)
    .sort(
      (a, b) =>
        rank(b) - rank(a) ||
        cardStatPower(content, state.cards.owned[b]!) -
          cardStatPower(content, state.cards.owned[a]!),
    );
  return rarer[0] ?? null;
}

/** Whether another star is open to the card now: below ★6 (copies past it become shards). */
const needsStars = (state: GameState, id: string): boolean =>
  (state.cards.owned[id]?.stars ?? 6) < 6;

/**
 * Star dust (DESIGN.md §5 Star dust): it is rare, so it goes to the first card of the build order
 * that still needs stars, the fighting lead first, and is saved for that card while it is short.
 * Dust pays only what the star bar lacks, so a top-up never wastes a copy already in the bar.
 */
export function spendStarDust(
  state: GameState,
  content: Content,
): { state: GameState; spent: number } {
  let current = state;
  let spent = 0;
  const target = buildOrder(current, content).find((id) => needsStars(current, id));
  if (!target) return { state: current, spent };
  for (let i = 0; i < 6 && needsStars(current, target); i++) {
    const cost = starDustCost(current, content, target);
    if (cost === null || cost === 0) break; // the bar pays it: the buyer's star-up takes it
    const result = starUpWithDust(current, content, target);
    if (!result.ok) break;
    current = result.state;
    spent += cost;
  }
  return { state: current, spent };
}

/**
 * Card shards buy copies (DESIGN.md §10 Shard shop): the player buys copies of the first card of
 * the build order that still needs stars, so shards from maxed duplicates star the card being built.
 */
export function spendShards(state: GameState, content: Content): GameState {
  let current = state;
  const target = buildOrder(current, content).find((id) => needsStars(current, id));
  const offer = target
    ? content.shardShop.find((i) => i.reward.kind === 'card' && i.reward.card === target)
    : undefined;
  if (!target || !offer) return current;
  for (
    let i = 0;
    i < 50 && current.cards.shards >= offer.price && needsStars(current, target);
    i++
  ) {
    const result = buyShardItem(current, content, offer.id);
    if (!result.ok) break;
    current = result.state;
    // the copy fills the bar: take the stars it pays for
    for (let s = 0; s < 6; s++) {
      const up = starUp(current, content, target);
      if (!up.ok) break;
      current = up.state;
    }
  }
  return current;
}

/**
 * Marks the cards the sim hunts on the Card Portal's wishlist (DESIGN.md §7). Per rarity: the first
 * card it is building of that rarity that still needs stars, alone (the build order, so the
 * fighting lead first: every pull of its rarity becomes a copy of it); with none, up to the limit
 * of cards it does not own yet, fighting cards first. A card that reaches ★6 or that it comes to
 * own leaves the list.
 */
export function markWishlist(state: GameState, content: Content): GameState {
  const portal = content.portals.find((p) => p.kind === 'cards' && p.wishlistPerRarity > 0);
  if (!portal) return state;
  const want = new Set<string>();
  const inPool = new Set(portal.pool.map((e) => e.itemId));
  const building = buildOrder(state, content).filter(
    (id) => inPool.has(id) && needsStars(state, id),
  );
  for (const rarity of RARITIES) {
    const built = building.filter((id) => content.cardById.get(id)!.rarity === rarity);
    const missing = portal.pool
      .filter((e) => e.rarity === rarity && !state.cards.owned[e.itemId])
      .map((e) => content.cardById.get(e.itemId)!)
      .sort((a, b) => Number(b.job === 'fighting') - Number(a.job === 'fighting'))
      .map((c) => c.id);
    // A card it builds takes every pull of its rarity: a second mark would halve its copies.
    const marks = built.length > 0 ? built.slice(0, 1) : missing;
    for (const id of marks.slice(0, portal.wishlistPerRarity)) want.add(id);
  }
  const now = state.cards.wishlist;
  if (now.length === want.size && now.every((id) => want.has(id))) return state;
  let current = state;
  for (const id of now) {
    if (want.has(id)) continue;
    const result = setWishlisted(current, content, id, false, portal.id);
    if (result.ok) current = result.state;
  }
  for (const id of want) {
    const result = setWishlisted(current, content, id, true, portal.id);
    if (result.ok) current = result.state;
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

/** A new lead must hit this much harder than the one leading now (a player does not swap for 1%). */
export const LEAD_SWAP_MARGIN = 1.1;

/**
 * The fighting lead (DESIGN.md §5 Base stats by rarity): the card that hits hardest now, its base
 * damage at its rarity, tier, stars and level, within the cost cap. A rarer card at Wood ★1 can
 * hit less hard than a starred card of a lower rarity, so rarity alone does not decide; the lead
 * leading now is kept unless another beats it by LEAD_SWAP_MARGIN.
 */
export function chooseLead(state: GameState, content: Content, cap: number): string | null {
  const damage = (id: string): number => num(cardBaseDamage(content, id, state.cards.owned[id]!));
  // Under Common Folk only Commons count (DESIGN.md §15); a card away on a trip cannot fight.
  const commonsOnly = isRestricted(state, content, 'commons_only');
  const usable = (id: string): boolean =>
    !!state.cards.owned[id] &&
    !isOnTrip(state, id) &&
    (!commonsOnly || content.cardById.get(id)?.rarity === 'common');
  let best: string | null = null;
  for (const card of content.cards) {
    if (card.job !== 'fighting' || !usable(card.id)) continue;
    if (cardCost(content, card.id) > cap) continue;
    if (best === null || damage(card.id) > damage(best)) best = card.id;
  }
  const now = state.cards.loadouts.fighting.main;
  if (
    best !== null &&
    now !== null &&
    now !== best &&
    usable(now) &&
    cardCost(content, now) <= cap &&
    damage(best) < damage(now) * LEAD_SWAP_MARGIN
  )
    return now;
  return best;
}

/**
 * Puts the hardest-hitting card in the lead (`chooseLead`) and the strongest others (rarity, then
 * power) in the supports within the cost cap; when that team loses the next Challenge, tries other
 * supports for one that wins it (`teamForChallenge`: guards, healers, bonds, element); and puts
 * the strongest workers on the best trees and mines (`placeBestWorkers`). Cards away on a trip
 * and, under Common Folk, cards that are not Commons are left out.
 */
export function optimizeLoadouts(state: GameState, content: Content): GameState {
  let current = state;
  const job = 'fighting' as const;
  const cap = loadoutCostCap(current, content, job);
  const commonsOnly = isRestricted(current, content, 'commons_only');
  const ranked = content.cards
    .filter(
      (c) =>
        c.job === job &&
        current.cards.owned[c.id] &&
        !isOnTrip(current, c.id) &&
        (!commonsOnly || c.rarity === 'common'),
    )
    .sort(
      (a, b) =>
        RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) ||
        cardPower(content, current.cards.owned[b.id]!) -
          cardPower(content, current.cards.owned[a.id]!),
    );
  const loadout: CardLoadout = emptyCardLoadout();
  loadout.main = chooseLead(current, content, cap);
  let cost = loadout.main ? cardCost(content, loadout.main) : 0;
  let support = 0;
  for (const card of ranked) {
    if (card.id === loadout.main) continue;
    const c = cardCost(content, card.id);
    if (cost + c > cap) continue;
    if (loadout.main === null) loadout.main = card.id;
    else if (support < loadout.supports.length) loadout.supports[support++] = card.id;
    else break;
    cost += c;
  }
  const now = current.cards.loadouts.fighting;
  if (now.main !== loadout.main || !now.supports.every((id, i) => id === loadout.supports[i])) {
    const result = setLoadout(current, content, job, loadout);
    if (result.ok) current = result.state;
  }
  current = teamForChallenge(current, content);
  return placeBestWorkers(current, content);
}

/** One worker the sim would place: a slot of a tree or mine, the card, and what it brings in. */
interface WorkerPick {
  place: string;
  card: string;
  /** Weighted output the card makes there: the place's value × the card's power. */
  value: number;
}

/**
 * What a tree or mine is worth to the player per unit of worker power: its level rate × the yield
 * of the layer or age it has reached × the Starlight tier weight of its gem (the weight the buyer
 * values production by, so a Moonwillow gem counts for a hundred Oak gems).
 */
function placeValue(
  state: GameState,
  content: Content,
  job: (typeof PRODUCTION_JOBS)[number],
  producer: ReturnType<typeof producersOf>[number],
): number {
  const weights = content.prestige.gain.tierWeights;
  const tier = content.resourceById.get(producer.resource)?.tier ?? 1;
  const weight = num(weights[Math.min(tier, weights.length) - 1]!);
  const rate = producerRate(producer, job, [], producerLevel(state, job, producer.id));
  return num(rate) * num(depthYield(state, content, producer.id)) * weight;
}

/**
 * The workers the sim wants (DESIGN.md §4 Workers, Worker slots), richest first. Per job, every
 * open slot (a place's second slot from the Starlight shop counts as a slot of its own) is ranked
 * by its place's value and paired with the job's cards by worker power, best with best, which is
 * what puts the most output to work. The shared slots then go to the pairs worth the most, of
 * either job.
 */
export function workerPicks(state: GameState, content: Content): WorkerPick[] {
  const pairs: WorkerPick[] = [];
  for (const job of PRODUCTION_JOBS) {
    const cards = content.cards
      .filter((c) => c.job === job && state.cards.owned[c.id] && !isOnTrip(state, c.id))
      .map((c) => ({ id: c.id, power: workerPower(content, c.id, state.cards.owned[c.id]!) }))
      .sort((a, b) => b.power - a.power);
    const slots = producersOf(content, job)
      .filter((p) => isProducerUnlocked(state, content, job, p.id))
      .flatMap((p) => {
        const value = placeValue(state, content, job, p);
        return Array.from({ length: workersPerPlace(state, content, p.id) }, () => ({
          id: p.id,
          value,
        }));
      })
      .sort((a, b) => b.value - a.value);
    slots.slice(0, cards.length).forEach((slot, i) => {
      pairs.push({ place: slot.id, card: cards[i]!.id, value: slot.value * cards[i]!.power });
    });
  }
  return pairs.sort((a, b) => b.value - a.value).slice(0, workerSlots(state, content));
}

/** The workers the sim wants as place id -> card ids (`workerPicks`). */
export function bestWorkers(state: GameState, content: Content): Record<string, string[]> {
  return toAssignment(workerPicks(state, content));
}

function toAssignment(picks: readonly WorkerPick[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of picks) (out[p.place] ??= []).push(p.card);
  return out;
}

/**
 * A worker in the forge beats a worker on a tree or mine when the weakest place worker brings in
 * less than this share of what all the places bring in (the forge's star dust is the only way to
 * star a card besides copies, DESIGN.md §4 The forge).
 */
export const FORGE_SWAP_SHARE = 0.05;

/**
 * Puts the sim's chosen workers to work (`workerPicks`) and runs the forge (`forgePlan`): the forge
 * takes a slot left over, or the slot of the weakest place worker when that worker adds little.
 */
export function placeBestWorkers(state: GameState, content: Content): GameState {
  let picks = workerPicks(state, content);
  const plan = forgePlan(state, content);
  let forgeCard: string | null = null;
  if (plan.run) {
    const total = picks.reduce((a, p) => a + p.value, 0);
    const weakest = picks[picks.length - 1];
    const busy = new Set(picks.map((p) => p.card));
    const idle = content.cards
      .filter(
        (c) =>
          c.job !== 'fighting' &&
          state.cards.owned[c.id] &&
          !busy.has(c.id) &&
          !isOnTrip(state, c.id),
      )
      .sort(
        (a, b) =>
          workerPower(content, b.id, state.cards.owned[b.id]!) -
          workerPower(content, a.id, state.cards.owned[a.id]!),
      )[0];
    if (picks.length < workerSlots(state, content) && idle) forgeCard = idle.id;
    else if (weakest && weakest.value < total * FORGE_SWAP_SHARE) {
      forgeCard = weakest.card;
      picks = picks.slice(0, -1);
    }
  }
  return placeForge(
    placePlaceWorkers(state, content, toAssignment(picks)),
    content,
    plan,
    forgeCard,
  );
}

/** What the forge should do: the recipe to make, and whether to run it now. */
export interface ForgePlan {
  recipe: string | null;
  run: boolean;
}

/**
 * The forge (DESIGN.md §4 The forge). The recipe is the first one whose output a card is waiting
 * for (star dust while a card being built needs stars), else the first recipe. It runs only while
 * its gems are coming in and spare: the gems of a craft are in hand over and above what the
 * fighting lead's next tier-up asks of them, so the forge never eats a tier-up.
 */
export function forgePlan(state: GameState, content: Content): ForgePlan {
  const recipes = content.production.forge.recipes;
  if (recipes.length === 0) return { recipe: null, run: false };
  const wantsDust = buildOrder(state, content).some((id) => needsStars(state, id));
  const recipe = recipes.find((r) => wantsDust && r.output.resource === 'star_dust') ?? recipes[0]!;
  const lead = state.cards.loadouts.fighting.main;
  const tierNeeds = lead ? (tierUpCheck(state, content, lead)?.requirements ?? []) : [];
  const spare = recipe.inputs.every((input) => {
    const kept = tierNeeds.find((r) => r.kind === 'resource' && r.resource === input.resource);
    return have(state, input.resource)
      .sub(kept?.need ?? 0)
      .gte(input.amount);
  });
  const produced = recipe.inputs.every((input) =>
    PRODUCTION_JOBS.some((job) =>
      producersOf(content, job).some(
        (p) => p.resource === input.resource && isProducerUnlocked(state, content, job, p.id),
      ),
    ),
  );
  return { recipe: recipe.id, run: wantsDust && produced && spare };
}

/** Sets the forge's recipe and puts `card` in it (or sends its worker away when it should not run). */
function placeForge(
  state: GameState,
  content: Content,
  plan: ForgePlan,
  card: string | null,
): GameState {
  let current = state;
  if (plan.recipe !== null && forgeRecipe(current, content)?.id !== plan.recipe) {
    const set = setForgeRecipe(current, content, plan.recipe);
    if (set.ok) current = set.state;
  }
  const want = plan.run ? card : null;
  if (current.production.forge.worker === want) return current;
  if (
    want === null &&
    forgeWorker(current, content) === null &&
    current.production.forge.worker === null
  )
    return current;
  const hired = assignForgeWorker(current, content, want);
  return hired.ok ? hired.state : current;
}

/** Puts the wanted workers on the trees and mines, when they differ from today's. */
function placePlaceWorkers(
  state: GameState,
  content: Content,
  want: Record<string, string[]>,
): GameState {
  const now = activeWorkers(state, content);
  const same = (a: Record<string, string[]>, b: Record<string, string[]>): boolean =>
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([place, ids]) => b[place]?.join() === ids.join());
  if (same(want, now)) return state;
  let current = state;
  for (const place of Object.keys(now)) {
    const result = assignWorker(current, content, place, null);
    if (result.ok) current = result.state;
  }
  for (const [place, ids] of Object.entries(want)) {
    for (const id of ids) {
      const result = assignWorker(current, content, place, id);
      if (result.ok) current = result.state;
    }
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

/**
 * A run is cashed in once its gain reaches this many times all the Starlight earned so far, even
 * while its Starlight per hour still rises: with enemies that no longer grow (DESIGN.md §6) the
 * economy can keep speeding up for a whole day, and an Ascension also opens a worker slot and a
 * ring of the skill tree (§9).
 */
export const ASCEND_MULTIPLE = 3;

/** Share of the peak rate below which the run is past its peak. */
const PAST_PEAK = 0.98;

/**
 * The ascension rule: the first one is taken as soon as the gain reaches the minimum (the
 * player wants the first Starlight shop levels, and the Starlight formula makes the minimum the
 * pacing lever, DESIGN.md §9). After that the gain must at least match all the Starlight earned
 * so far, and either the run's Starlight per second has dropped to 98% of its peak or less (more
 * run time no longer pays) or the gain is ASCEND_MULTIPLE times all the Starlight earned.
 */
export function ascendNow(
  now: { gain: number; minimum: number; runSeconds: number; earned?: number },
  tracker: AscendTracker,
): boolean {
  if (now.gain < now.minimum || now.runSeconds <= 0) return false;
  if (now.earned === 0) return true;
  // Each later Ascension must be worth at least all the Starlight earned so far (a doubling).
  if (now.earned !== undefined && now.gain < now.earned) return false;
  if (now.earned !== undefined && now.gain >= now.earned * ASCEND_MULTIPLE) return true;
  const rate = now.gain / now.runSeconds;
  if (rate > tracker.peakRate) {
    tracker.peakRate = rate;
    return false;
  }
  return rate <= tracker.peakRate * PAST_PEAK;
}

/**
 * Ascends (DESIGN.md §9), as a challenge run when one looks quick (DESIGN.md §15 Ascension
 * challenges): every challenge that can start, fewest completions first, is tried as the
 * Ascension it is, and the first whose target its starting team already wins as a Challenge
 * (`challengeLooksQuick`, the rule in force) is taken; its reward is permanent and the run goes
 * on as a normal one once the target is reached. Otherwise a plain Ascension.
 */
export function ascendOrChallenge(
  state: GameState,
  content: Content,
): { ok: true; state: GameState } | { ok: false } {
  if (challengesOpen(state)) {
    for (const id of challengeOrder(state, content)) {
      const started = startChallenge(state, content, id);
      if (!started.ok) continue;
      const team = optimizeLoadouts(started.state, content);
      if (challengeLooksQuick(team, content)) return { ok: true, state: team };
    }
  }
  const result = ascend(state, content);
  return result.ok ? { ok: true, state: result.state } : { ok: false };
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
  // A challenge run (DESIGN.md §15 Ascension challenges) climbs its target first: the rule holds
  // the run back until the target floor is reached.
  const challenge = state.ascensionChallenges.active
    ? challengeById(content, state.ascensionChallenges.active)
    : undefined;
  const target = challenge ? challengeTarget(state, challenge) : null;
  if (target && isDungeonUnlocked(state, content, target.dungeon)) {
    return { id: target.dungeon, difficulty: target.difficulty };
  }
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
  // The lead card's missing Core first, where it comes fastest (`fastestFarm`).
  for (const resource of wantedList) {
    const farm = fastestFarm(state, content, resource, modifiers);
    if (farm) return farm;
  }
  // A stage a few minutes from its next star level: its chest, star dust and skill point.
  const stars = starFarm(state, content, modifiers);
  if (stars) return stars;
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

/** The tiers the player can fight in a dungeon now: unlocked and holding their current floor. */
function heldTiers(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[],
): Difficulty[] {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon || !isDungeonUnlocked(state, content, dungeonId)) return [];
  return DIFFICULTIES.filter(
    (d) =>
      isDifficultyUnlocked(state, dungeon, d) && holds(state, content, dungeonId, modifiers, d),
  );
}

/**
 * Where a wanted dungeon material comes fastest (DESIGN.md §6 Harder modes pay more): every tier of
 * every dungeon the loadout holds is priced with the game's own income per second at the floor it
 * would fight there, so a harder tier that is killed as fast wins with its bigger drops, and the
 * Normal floors win while they are the only ones killed quickly. Null when no fight drops it.
 */
export function fastestFarm(
  state: GameState,
  content: Content,
  resource: string,
  modifiers: Modifier[] = collectModifiers(state, content),
): FightChoice | null {
  if (!content.dungeons.some((d) => dropsResource(d, resource))) return null;
  let best: (FightChoice & { rate: number }) | null = null;
  for (const dungeon of content.dungeons) {
    if (!dropsResource(dungeon, resource)) continue;
    for (const difficulty of heldTiers(state, content, dungeon.id, modifiers)) {
      const at = setActiveDungeon(state, content, dungeon.id);
      if (!at.ok) continue;
      const tier = setDifficulty(at.state, content, dungeon.id, difficulty);
      if (!tier.ok) continue;
      const rate = num(incomePerSecond(tier.state, content, resource, modifiers));
      if (rate > 0 && (!best || rate > best.rate)) best = { id: dungeon.id, difficulty, rate };
    }
  }
  return best && { id: best.id, difficulty: best.difficulty };
}

const dropsResource = (d: Content['dungeons'][number], resource: string): boolean =>
  d.drops.material.resource === resource ||
  d.drops.extraMaterials.some((e) => e.resource === resource);

/** A stage is farmed for its next star level when that takes at most this long, in seconds. */
export const STAR_FARM_SECONDS = 900;

/**
 * Stage stars (DESIGN.md §6): a stage whose next star level is at most STAR_FARM_SECONDS of kills
 * away is worth a detour (a chest, star dust from Gold up, a skill point, more damage and loot
 * there). The player cannot pick a floor, so only the last-floor boss of a tier it stands on the
 * last floor of is farmed; the quickest one wins.
 */
export function starFarm(
  state: GameState,
  content: Content,
  modifiers: Modifier[] = collectModifiers(state, content),
): FightChoice | null {
  let best: (FightChoice & { seconds: number }) | null = null;
  for (const dungeon of content.dungeons) {
    for (const difficulty of heldTiers(state, content, dungeon.id, modifiers)) {
      if (difficulty === 'endless') continue;
      const position = floorPosition(state, dungeon, difficulty);
      if (position.floor !== position.floors) continue;
      const info = stageStars(state, content, stageKey(dungeon.id, difficulty, position.floor));
      if (!info || info.nextKills === null) continue;
      const spk = secondsPerKill(state, content, dungeon.id, modifiers, position.floor, difficulty);
      if (spk === null || !Number.isFinite(spk)) continue;
      const seconds = (info.nextKills - info.kills) * spk;
      if (seconds <= STAR_FARM_SECONDS && (!best || seconds < best.seconds)) {
        best = { id: dungeon.id, difficulty, seconds };
      }
    }
  }
  return best && { id: best.id, difficulty: best.difficulty };
}

/** The dungeon or special dungeon `chooseFight` picks. */
export function chooseDungeon(
  state: GameState,
  content: Content,
  options: { trialShare?: number } = {},
): string | null {
  return chooseFight(state, content, options).id;
}

/** The sim player pushes on only when the next Challenge leaves this much room (`challengeMargin`). */
export const PUSH_MARGIN = 1.2;

/**
 * Whether the next Challenge of a dungeon (on its chosen difficulty, or on `difficulty`) is one
 * the team wins with room to spare: it clears the floor inside the Challenge's timer and before it
 * falls, healers counted (`challengeMargin`).
 */
function winsNextFloor(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[],
  difficulty?: Difficulty,
): boolean {
  return (challengeMargin(state, content, dungeonId, modifiers, difficulty) ?? 0) >= PUSH_MARGIN;
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
  if (!hasDeeperFloor(position) || (chosen && position.autoChallenge)) return true;
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

/** A lost Challenge floor counts as won again once the margin has grown this much past its loss. */
export const CHALLENGE_REGROWTH = 1.1;

/** A Challenge lost: which one (`nextChallengeKey`) and the margin it was lost at. */
export interface ChallengeLoss {
  key: string;
  margin: number;
}

/** The next Challenge of the active dungeon as "dungeon:difficulty:floor", or null. */
export function nextChallengeKey(state: GameState, content: Content): string | null {
  const dungeon = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
  if (!dungeon) return null;
  const position = floorPosition(state, dungeon);
  return position.challengeFloor === null
    ? null
    : `${dungeon.id}:${position.difficulty}:${position.challengeFloor}`;
}

/** A lost Challenge the estimate calls hopeless is tried again by hand at most this often (s). */
export const CHALLENGE_RETRY_SECONDS = 900;

/**
 * Auto-challenge and the Challenge button (DESIGN.md §6 Farming and Challenge, Auto-challenge). A
 * lost Challenge costs farming time (its timer, then a 60 s wait before the next try), so the
 * player leaves auto-challenge on only while the next Challenge is one it wins
 * (`challengeMargin` at least CHALLENGE_WIN) and turns it off when it is not. With it off, it
 * presses the Challenge button itself once every CHALLENGE_RETRY_SECONDS while the Challenge is
 * close (margin at least CHALLENGE_TRY_MARGIN), since the estimate leaves out what the real fight
 * may still give (crits, level-ups); `lastTry` is when it last pressed it (sim seconds, or null).
 * A floor it has lost (`lost`: the Challenge's key and the margin it was lost at) does not count
 * as won again until the margin has grown CHALLENGE_REGROWTH past that: the player believes the
 * defeat over the estimate.
 */
export function chooseAutoChallenge(
  state: GameState,
  content: Content,
  now = 0,
  lastTry: number | null = null,
  lost: ChallengeLoss | null = null,
): { state: GameState; tried: boolean } {
  const dungeon = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
  if (!dungeon) return { state, tried: false };
  const margin = challengeMargin(state, content, dungeon.id, collectModifiers(state, content));
  if (margin === null) return { state, tried: false };
  const beaten =
    lost !== null &&
    lost.key === nextChallengeKey(state, content) &&
    margin < lost.margin * CHALLENGE_REGROWTH;
  const on = margin >= CHALLENGE_WIN && !beaten;
  const set = setAutoChallenge(state, content, dungeon.id, on);
  const next = set.ok ? set.state : state;
  if (on || margin < CHALLENGE_TRY_MARGIN) return { state: next, tried: false };
  if (lastTry !== null && now - lastTry < CHALLENGE_RETRY_SECONDS) {
    return { state: next, tried: false };
  }
  const tried = startFloorChallenge(next, content);
  return tried.ok ? { state: tried.state, tried: true } : { state: next, tried: false };
}

/**
 * Overflow (DESIGN.md §6): the player turns on every stage's overflow switch as soon as the stage
 * reaches the star level that opens it, so no damage is wasted. (Package 10 teaches the rest.)
 */
export function chooseOverflow(state: GameState, content: Content): GameState {
  let next = state;
  for (const key of Object.keys(state.combat.stageKills)) {
    const info = stageStars(next, content, key);
    if (!info || !info.overflowUnlocked || info.overflowOn) continue;
    const result = setOverflow(next, content, key, true);
    if (result.ok) next = result.state;
  }
  return next;
}

/**
 * Autobuyers (DESIGN.md §15, §9): the player switches on every autobuyer it owns. They buy the
 * cheapest tree or mine level between the player's own visits, so while the player saves Money for
 * a tier-up the reserve is 100% (they buy nothing) and otherwise 0%.
 */
export function chooseAutomation(
  state: GameState,
  content: Content,
  /** The buyer's last candidates (they say what it saves for); computed when not given. */
  candidates?: readonly Candidate[],
): GameState {
  const owned = {
    treeLevels: autobuyerOwned(state, content, 'treeLevels'),
    mineLevels: autobuyerOwned(state, content, 'mineLevels'),
  };
  if (!owned.treeLevels && !owned.mineLevels) return state;
  const reserved = reservations(state, candidates ?? buyerCandidates(state, content));
  const reservePercent = (reserved.get('money') ?? new Decimal(0)).gt(0) ? 100 : 0;
  const a = state.automation;
  if (
    a.treeLevels === owned.treeLevels &&
    a.mineLevels === owned.mineLevels &&
    a.reservePercent === reservePercent
  )
    return state;
  return setAutomation(state, { ...owned, reservePercent });
}

// ---- running -----------------------------------------------------------------------------------

export interface SimOptions {
  hours: number;
  seed?: number;
  /** Seconds of play per step (the buyer acts between steps) during the opening. */
  stepSeconds?: number;
  /** Seconds per step after the opening (LATE_FROM_HOURS); default LATE_STEP_SECONDS. The game
   *  itself gives the same totals for any split of time, so only how often the player acts changes. */
  lateStepSeconds?: number;
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
  /** What the balance run reads beside the milestones, once an hour (`progressOf`). */
  progress: ProgressSample[];
  /** Sim seconds when a weapon was fully maxed (`maxedWeapon`), or null. */
  maxedWeaponAt: number | null;
  /** How long fights take (DESIGN.md §6 Fight pace, Floors pace): see `FightSample`. */
  fights: FightSample[];
}

/**
 * One fight timed by the game's own readouts (`secondsPerKill`, `survivalSeconds`): `first` is the
 * first win of a floor (a Challenge won on a floor never beaten before), `farm` the floor farmed,
 * read every quarter hour, and `loss` a Challenge lost (the team was too weak).
 */
export interface FightSample {
  at: 'first' | 'farm' | 'loss';
  kind: 'wave' | 'miniboss' | 'boss';
  dungeonId: string;
  difficulty: Difficulty;
  floor: number;
  /** Sim seconds. */
  t: number;
  /** Seconds the team takes to clear the floor from full HP. */
  kill: number | null;
  /** Seconds the team's full health lasts against the floor. */
  survive: number | null;
  /** A first win that came after the floor was lost at least once: the team matched it. */
  held?: boolean;
}

/** One hourly reading of the systems the balance run tunes (DESIGN.md §14 The balance update's sim). */
export interface ProgressSample {
  /** Sim seconds. */
  t: number;
  /** Stage star levels reached over every stage and tier, and chests paid. */
  starLevels: number;
  chests: number;
  /** Skill points earned and spent. */
  skillEarned: number;
  skillSpent: number;
  /** Star dust earned (held plus spent) and spent. */
  dustEarned: number;
  dustSpent: number;
  /** Workers at work (trees, mines and the forge) and the slots there are. */
  workers: number;
  slots: number;
  /** What it fights: "dungeon difficulty floor" (or the trial), and the best weapon so far. */
  fight: string;
  bestWeapon: string;
  /** The table update's systems (`TableLog` so far): the team's roles, Challenges won and lost,
   *  Summon Scrolls earned and spent, the trips' share of Cores and gems (0..1), Ascension
   *  challenge completions, the longest stretch without a new best floor (seconds). */
  team?: string;
  challengesWon?: number;
  challengesLost?: number;
  scrollsEarned?: number;
  scrollsSpent?: number;
  tripMaterialShare?: number;
  tripGemShare?: number;
  challengeCompletions?: number;
  stuckLongest?: number;
  focusPulls?: number;
  /** Levels (DESIGN.md §4 Levels): the mean tree and mine level, the gem output a second weighted
   *  as Starlight weighs it, and the seconds of Money income the cheapest next level costs. */
  meanLevel?: number;
  gemOutput?: number;
  levelWait?: number;
}

/** The top of the weapon ladder (DESIGN.md §14 A maxed weapon): a Mythic or Void Heirloom at ★6. */
export function maxedWeapon(state: GameState, content: Content): boolean {
  return Object.entries(state.cards.owned).some(([id, c]) => {
    const rarity = content.cardById.get(id)?.rarity;
    return (rarity === 'mythic' || rarity === 'void') && c.tier === 'heirloom' && c.stars >= 6;
  });
}

/** How far the best fighting weapon got, as "Name tier ★n" (the highest tier, then stars). */
export function bestWeapon(state: GameState, content: Content): string {
  let best: { id: string; rank: number } | null = null;
  for (const [id, c] of Object.entries(state.cards.owned)) {
    if (content.cardById.get(id)?.job !== 'fighting') continue;
    const rank = RANK_TIERS.indexOf(c.tier) * 10 + c.stars;
    if (!best || rank > best.rank) best = { id, rank };
  }
  if (!best) return '-';
  const c = state.cards.owned[best.id]!;
  return `${content.cardById.get(best.id)?.name ?? best.id} ${c.tier} ★${c.stars}`;
}

/** The reading of `ProgressSample` for a state. */
export function progressOf(
  state: GameState,
  content: Content,
  t: number,
  dustSpent: number,
  table?: TableLog,
): ProgressSample {
  let starLevels = 0;
  let chests = 0;
  for (const key of Object.keys(state.combat.stageKills)) {
    const info = stageStars(state, content, key);
    if (!info) continue;
    starLevels += info.level;
    chests += info.chestsPaid;
  }
  const points = skillPoints(state, content);
  const dungeon = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
  const at = dungeon ? floorPosition(state, dungeon) : null;
  return {
    t,
    starLevels,
    chests,
    skillEarned: points.total,
    skillSpent: points.spent,
    dustEarned: num(have(state, 'star_dust')) + dustSpent,
    dustSpent,
    workers: workersUsed(state, content),
    slots: workerSlots(state, content),
    fight: at ? `${dungeon!.id} ${at.difficulty} ${at.floor}` : (state.activeDungeonId ?? '-'),
    bestWeapon: bestWeapon(state, content),
    ...(table ? tableProgress(state, content, t, table) : {}),
    ...levelProgress(state, content),
  };
}

/** Weighted gems harvested over the whole game (`mastery.harvested` × Starlight tier weight). */
/** The Levels reading of `ProgressSample` (DESIGN.md §4 Levels). */
function levelProgress(
  state: GameState,
  content: Content,
): Pick<ProgressSample, 'meanLevel' | 'gemOutput' | 'levelWait'> {
  const modifiers = collectModifiers(state, content);
  const trees = content.trees.filter((x) => isProducerUnlocked(state, content, 'logging', x.id));
  const mines = content.mines.filter((x) => isProducerUnlocked(state, content, 'mining', x.id));
  const levels = [
    ...trees.map((x) => treeLevel(state, x.id)),
    ...mines.map((x) => mineLevel(state, x.id)),
  ];
  const prices = [
    ...trees.map((x) => treeLevelCost(state, content, x.id, modifiers)),
    ...mines.map((x) => mineLevelCost(state, content, x.id, modifiers)),
  ]
    .filter((x) => x !== null && x.resource === 'money')
    .map((x) => x!.amount);
  const money = num(incomeOf(state, content, 'money', modifiers));
  const cheapest = prices.length > 0 ? Math.min(...prices.map(num)) : Infinity;
  return {
    meanLevel: levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0,
    gemOutput: weightedProduction(state, content, modifiers),
    levelWait: money > 0 ? cheapest / money : Infinity,
  };
}

function gemsHarvested(state: GameState, content: Content): number {
  let total = 0;
  for (const [id, amount] of Object.entries(state.mastery.harvested)) {
    total += num(amount) * gemWeight(content, id);
  }
  return total;
}

/** The table update's part of a `ProgressSample`. */
function tableProgress(
  state: GameState,
  content: Content,
  t: number,
  table: TableLog,
): Partial<ProgressSample> {
  const gems = gemsHarvested(state, content);
  const share = (trip: number, other: number): number =>
    trip + other > 0 ? trip / (trip + other) : 0;
  return {
    team: teamRoles(state, content),
    challengesWon: table.challengesWon,
    challengesLost: table.challengesLost,
    scrollsEarned: num(have(state, 'summon_scroll')) + table.summonSpent,
    scrollsSpent: table.summonSpent,
    tripMaterialShare: share(table.tripMaterials, table.fightMaterials),
    tripGemShare: share(table.tripGems, gems),
    challengeCompletions: table.completions.length,
    focusPulls: table.focusPulls,
    stuckLongest: Math.max(table.stuckLongest, t - table.lastRiseAt),
  };
}

/** The sum of the best floors of every dungeon tier: it rises with every won Challenge. */
export function bestFloorSum(state: GameState): number {
  let total = 0;
  for (const progress of Object.values(state.combat.floors)) {
    for (const tier of Object.values(progress.tiers)) total += tier?.best ?? 0;
  }
  return total;
}

/** Where the player fights: dungeon, tier and floor (or the trial), as one text. */
function whereFighting(state: GameState, content: Content): string {
  const dungeon = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
  if (!dungeon) return state.activeDungeonId ?? '-';
  const at = floorPosition(state, dungeon);
  return `${dungeon.id}:${at.difficulty}:${at.floor}`;
}

/** How often the fight target is re-chosen without a move, in seconds. */
const RECHOOSE_SECONDS = 300;
/** How often the ascension rule is checked, in seconds. */
const ASCEND_CHECK_SECONDS = 60;
/** The opening, played in short steps: its milestones are minutes apart. */
export const LATE_FROM_HOURS = 2;
/** Seconds per step after the opening: the player acts every 15 s (a cheap 2-3x speed-up). */
export const LATE_STEP_SECONDS = 15;
/** How often the progress of the tuned systems is read, in seconds. */
const PROGRESS_SAMPLE_SECONDS = 3600;
/** How often the fighting DPS is sampled for the report, in seconds. */
const DPS_SAMPLE_SECONDS = 900;

export function runSim(bundled: Content, options: SimOptions): SimResult {
  // The sim plays the game as it ships: portals waiting for their screen (the Legacy Gate) stay
  // closed unless asked for.
  const content: Content = options.openAllPortals
    ? { ...bundled, portals: bundled.allPortals }
    : bundled;
  const rng: Rng = createSeededRng(options.seed ?? 1);
  const early = options.stepSeconds ?? 5;
  const late = options.lateStepSeconds ?? Math.max(early, LATE_STEP_SECONDS);
  const total = Math.round(options.hours * 3600);
  const table = emptyTableLog();
  const log: SimLog = {
    summons: 0,
    levelAt: {},
    ascensions: [],
    fought: {},
    dustSpent: 0,
    table,
  };
  // The dungeon materials (Cores, Sigils): the trips' share of them is measured against the fights'.
  const cores = new Set(
    content.dungeons.flatMap((d) => [
      d.drops.material.resource,
      ...d.drops.extraMaterials.map((e) => e.resource),
    ]),
  );
  let lastTry: number | null = null;
  let lost: ChallengeLoss | null = null;
  let challengeStartedAt = 0;
  let completionsSeen: Record<string, number> = {};
  const progress: ProgressSample[] = [];
  let maxedWeaponAt: number | null = null;
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
  const fights: FightSample[] = [];
  const firstWins = new Set<string>();
  const lostFloors = new Set<string>();
  /** Times a floor of a dungeon and tier with the team as it stands (DESIGN.md §6 Fight pace). */
  const timeFight = (
    at: FightSample['at'],
    dungeonId: string,
    difficulty: Difficulty,
    floor: number,
    modifiers: Modifier[],
    held = false,
  ): void => {
    const stage = fightStage(state, content, dungeonId, modifiers, floor, difficulty);
    if (!stage) return;
    fights.push({
      at,
      kind: stage.kind,
      dungeonId,
      difficulty,
      floor: stage.floor,
      t,
      kill: secondsPerKill(state, content, dungeonId, modifiers, stage.floor, difficulty),
      survive: survivalSeconds(state, content, dungeonId, modifiers, stage.floor, difficulty),
      ...(at === 'first' ? { held } : {}),
    });
  };
  let t = 0;
  const countSummons = (buys: { bought: string[]; dustSpent: number }): void => {
    for (const id of buys.bought) {
      if (!id.startsWith('summon:')) continue;
      log.summons++;
      const pulls = id.endsWith(':10') ? 10 : 1;
      const portalId = id.split(':')[1]!;
      const portal = content.portals.find((x) => x.id === portalId);
      if (portalId === FOCUS_PORTAL_ID) table.focusPulls += pulls;
      if (portalId === FOCUS_PORTAL_ID || portal?.cost.resource === 'summon_scroll') {
        table.summonSpent += pulls;
      } else if (portal?.cost.resource === 'glamour_scroll') {
        table.glamourSpent += pulls;
      }
    }
    log.dustSpent = (log.dustSpent ?? 0) + buys.dustSpent;
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
    // The daily scroll reward, claimed at the first check-in of each simulated day (DESIGN.md §3).
    if (acting) {
      const daily = claimDaily(state, content, `day-${Math.floor(t / DAY_SECONDS)}`);
      if (daily.ok) state = daily.state;
    }
    if (acting) {
      const buys = greedyBuy(state, content, rng);
      state = buys.state;
      countSummons(buys);
      // Expeditions (DESIGN.md §15): the idle cards travel; an hour at a time while the player
      // is at the game, longer when it only checks in (8 h before the night).
      const night = idle && IDLE_AWAKE_SECONDS - (t % DAY_SECONDS) <= IDLE_CHECKIN_SECONDS;
      const trips = runExpeditions(state, content, idle ? (night ? 8 : 4) : 1);
      state = trips.state;
      table.trips += trips.income.trips;
      table.tripMaterials += trips.income.materials;
      table.tripGems += trips.income.gems;
      // A challenge run that has not reached its target in a long while is given up.
      if (
        state.ascensionChallenges.active !== null &&
        t - challengeStartedAt >= CHALLENGE_GIVE_UP_SECONDS
      ) {
        state = leaveChallenge(state);
        table.challengesLeft++;
      }
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
        const result = ascendOrChallenge(state, content);
        if (result.ok) {
          if (result.state.ascensionChallenges.active !== null) {
            table.challengeRuns++;
            challengeStartedAt = t;
          }
          const after = greedyBuy(result.state, content, rng);
          state = after.state;
          countSummons(after);
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
        // Through the dungeon's loadout preset (DESIGN.md §15 Loadout presets): the team left in
        // a dungeon comes back with it; the team is then chosen again for the new fight.
        const result = pickDungeon(state, content, fight.id);
        if (result.ok) state = result.state;
      }
      if (fight.id !== null && content.dungeonById.has(fight.id)) {
        const tier = setDifficulty(state, content, fight.id, fight.difficulty);
        if (tier.ok) state = tier.state;
      }
      state = optimizeLoadouts(state, content);
      const challenge = chooseAutoChallenge(state, content, t, lastTry, lost);
      state = challenge.state;
      if (challenge.tried) {
        lastTry = t;
        table.manualTries++;
      }
      state = chooseOverflow(state, content);
      sinceChoose = 0;
    }
    const dt = idle
      ? Math.min(
          IDLE_STEP_SECONDS,
          total - t,
          IDLE_CHECKIN_SECONDS - sinceCheckin,
          IDLE_AWAKE_SECONDS - (t % DAY_SECONDS),
        )
      : Math.min(t < LATE_FROM_HOURS * 3600 ? early : late, total - t);
    const before = whereFighting(state, content);
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
    // A kill that moves the player (a floor pushed) is a new place to choose from; a boss farmed
    // again and again is not, or a farm with overflow would re-choose every step.
    const challengeMods = report.challenges.length > 0 ? collectModifiers(state, content) : [];
    for (const c of report.challenges) {
      const firstKey = `${c.dungeonId}:${c.difficulty}:${c.floor}`;
      if (c.won && !firstWins.has(firstKey)) {
        firstWins.add(firstKey);
        timeFight(
          'first',
          c.dungeonId,
          c.difficulty,
          c.floor,
          challengeMods,
          lostFloors.has(firstKey),
        );
      } else if (!c.won) {
        lostFloors.add(firstKey);
        timeFight('loss', c.dungeonId, c.difficulty, c.floor, challengeMods);
      }
      if (c.won) table.challengesWon++;
      else {
        table.challengesLost++;
        const key = `${c.dungeonId}:${c.difficulty}:${c.floor}`;
        const margin =
          challengeMargin(state, content, c.dungeonId, collectModifiers(state, content)) ?? 0;
        // The same floor lost again: the bar stays where it was first lost, or higher.
        const prev = lost as ChallengeLoss | null;
        lost = { key, margin: prev?.key === key ? Math.max(prev.margin, margin) : margin };
      }
    }
    for (const [id, amount] of Object.entries(report.materials)) {
      if (cores.has(id)) table.fightMaterials += amount;
    }
    if (
      whereFighting(state, content) !== before ||
      report.knockouts > 0 ||
      report.challenges.some((c) => !c.won) ||
      report.trialAttempts > 0 ||
      report.cleared.length > 0
    ) {
      sinceChoose = RECHOOSE_SECONDS;
    }
    if (report.cardDrops.length > 0) state = optimizeLoadouts(state, content);
    if (t % DPS_SAMPLE_SECONDS < dt) {
      const here = state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : null;
      if (here && state.combat.challenge === null) {
        const position = floorPosition(state, here);
        timeFight(
          'farm',
          here.id,
          position.difficulty,
          position.floor,
          collectModifiers(state, content),
        );
      }
      const first = content.dungeons[0]!.id;
      dpsSamples.push([t - (t % DPS_SAMPLE_SECONDS), num(averageDps(state, content, first))]);
      pullSamples.push([
        t - (t % DPS_SAMPLE_SECONDS),
        state.portals['card_portal']?.pulls ?? 0,
        state.portals['wardrobe_gate']?.pulls ?? 0,
      ]);
    }
    if (t % PROGRESS_SAMPLE_SECONDS < dt) {
      progress.push(
        progressOf(state, content, t - (t % PROGRESS_SAMPLE_SECONDS), log.dustSpent ?? 0, table),
      );
    }
    if (options.probe && options.probeSeconds && t % options.probeSeconds < dt) {
      options.probe(state, t - (t % options.probeSeconds));
    }
    recordProgress();
  }
  return {
    hits,
    simSeconds: t,
    state,
    log,
    dpsSamples,
    pullSamples,
    runs,
    progress,
    maxedWeaponAt,
    fights,
  };

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
    if (maxedWeaponAt === null && maxedWeapon(state, content)) maxedWeaponAt = t;
    // A new best floor anywhere ends a stretch stuck (DESIGN.md §6 Farming and Challenge).
    const best = bestFloorSum(state);
    if (best > table.bestSum) {
      if (t - table.lastRiseAt > table.stuckLongest) {
        table.stuckLongest = t - table.lastRiseAt;
        table.stuckWhere = whereFighting(state, content);
      }
      table.bestSum = best;
      table.lastRiseAt = t;
    } else if (best < table.bestSum) {
      table.bestSum = best; // a challenge run put a tier back on floor 1
    }
    for (const c of content.challenges) {
      const done = state.ascensionChallenges.completions[c.id] ?? 0;
      if (done > (completionsSeen[c.id] ?? 0)) table.completions.push([c.id, t]);
    }
    completionsSeen = { ...state.ascensionChallenges.completions };
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

/** The hours at which the progress table reads the runs: a few early, then every 50 h. */
export function progressHours(hours: number): number[] {
  const early = [1, 2, 5, 10, 20, 30, 40];
  const late =
    hours > 40 ? Array.from({ length: Math.floor(hours / 50) }, (_, i) => (i + 1) * 50) : [];
  return [...early, ...late].filter((h, i, all) => h <= hours && all.indexOf(h) === i);
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * What the balance run needs beside the milestones (DESIGN.md §14 The balance update's sim), over
 * every seed: the hours to a fully maxed weapon (or the best weapon each seed got), then the
 * medians of stage star levels and chests, skill points earned and spent, star dust earned and
 * spent and workers at work at each reading hour.
 */
export function formatProgress(
  runs: ReadonlyArray<{
    seed: number;
    progress: readonly ProgressSample[];
    maxedWeaponAt: number | null;
  }>,
  hours: number,
): string {
  const maxed = runs.map((r) => r.maxedWeaponAt).filter((x): x is number => x !== null);
  const lines = [
    `Fully maxed weapon (Mythic or Void Heirloom ★6, at most 200 h): ${
      maxed.length === 0
        ? `no seed in ${hours} h`
        : `${maxed.length}/${runs.length} seeds, median of those ${hoursText(median(maxed))}`
    }`,
    `Best weapon at the end: ${runs
      .map((r) => `seed ${r.seed} ${r.progress[r.progress.length - 1]?.bestWeapon ?? '-'}`)
      .join('; ')}`,
    '',
    '| Hour | Stage star levels | Chests paid | Skill points earned / spent | Star dust earned / spent | Workers / slots |',
    '|---|---|---|---|---|---|',
  ];
  for (const h of progressHours(hours)) {
    const at = runs
      .map((r) => r.progress.find((p) => p.t === h * 3600))
      .filter((p): p is ProgressSample => p !== undefined);
    if (at.length === 0) continue;
    const m = (f: (p: ProgressSample) => number): string => String(Math.round(median(at.map(f))));
    lines.push(
      `| ${h} | ${m((p) => p.starLevels)} | ${m((p) => p.chests)} | ${m((p) => p.skillEarned)} / ${m((p) => p.skillSpent)} | ${m((p) => p.dustEarned)} / ${m((p) => p.dustSpent)} | ${m((p) => p.workers)} / ${m((p) => p.slots)} |`,
    );
  }
  lines.push('', '(medians over the seeds)');
  return lines.join('\n');
}

/** The most common value of a list (the first of equals), or '-'. */
function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: [string, number] | null = null;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best ? `${best[0]} (${best[1]}/${values.length})` : '-';
}

/**
 * The table update's systems over every seed (DESIGN.md §14 The sim player's choices), at each
 * reading hour: floor Challenges won and lost (and the win rate), the longest stretch so far
 * without a new best floor, the most common team (its roles), Summon Scrolls earned (the starting
 * one included) and spent, Focus Portal pulls, the expeditions' share of the Cores and of the
 * tier-weighted gems, and Ascension challenge completions. Medians over the seeds.
 */
export function formatTableUpdate(
  runs: ReadonlyArray<{ seed: number; progress: readonly ProgressSample[] }>,
  hours: number,
): string {
  const lines = [
    '| Hour | Challenges won / lost (win rate) | Longest stuck | Team (most common) | Summon Scrolls earned / spent | Focus pulls | Trips: share of Cores / gems | Ascension challenges done |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const h of progressHours(hours)) {
    const at = runs
      .map((r) => r.progress.find((p) => p.t === h * 3600))
      .filter((p): p is ProgressSample => p !== undefined && p.team !== undefined);
    if (at.length === 0) continue;
    const m = (f: (p: ProgressSample) => number): number => median(at.map(f));
    const won = m((p) => p.challengesWon ?? 0);
    const lost = m((p) => p.challengesLost ?? 0);
    const rate = median(
      at.map((p) => {
        const all = (p.challengesWon ?? 0) + (p.challengesLost ?? 0);
        return all > 0 ? (p.challengesWon ?? 0) / all : 0;
      }),
    );
    const pct = (x: number): string => `${Math.round(x * 100)}%`;
    lines.push(
      `| ${h} | ${won} / ${lost} (${pct(rate)}) | ${hoursText(m((p) => p.stuckLongest ?? 0))} | ${mostCommon(at.map((p) => p.team ?? '-'))} | ${Math.round(m((p) => p.scrollsEarned ?? 0))} / ${Math.round(m((p) => p.scrollsSpent ?? 0))} | ${m((p) => p.focusPulls ?? 0)} | ${pct(m((p) => p.tripMaterialShare ?? 0))} / ${pct(m((p) => p.tripGemShare ?? 0))} | ${m((p) => p.challengeCompletions ?? 0)} |`,
    );
  }
  lines.push(
    '',
    '(medians over the seeds; "Longest stuck" is the longest stretch without a new best floor on any dungeon tier)',
  );
  return lines.join('\n');
}

/** Where one run fought, and its best weapon, at each reading hour. */
export function formatFightTimeline(progress: readonly ProgressSample[], hours: number): string {
  return progressHours(hours)
    .map((h) => progress.find((p) => p.t === h * 3600))
    .filter((p): p is ProgressSample => p !== undefined)
    .map((p) => `${p.t / 3600} h: ${p.fight} (${p.bestWeapon})`)
    .join('; ');
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
      return `${d.id} ${at.difficulty} ${where} (best ${at.best}, ${at.autoChallenge ? 'auto' : 'farm'}) ${spk === null ? '-' : `${spk.toFixed(0)} s/floor`} (survives ${survive.toFixed(0)} s)`;
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
    `Boss and mini-boss kills: ${s.stats.bossKills} (stages: ${Object.entries(s.combat.stageKills)
      .map(([d, k]) => `${d} ${k}`)
      .join(', ')})`,
    `DPS vs Mossy Cellar: ${result.dpsSamples
      .filter(([t]) => [1, 2, 4, 8, 12, 16, 20, 30, 40].includes(t / 3600))
      .map(([t, d]) => `${t / 3600} h ${formatShort(d)}`)
      .join(', ')}`,
    `Time fought: ${fought || 'none'}`,
    `Summons: ${result.log.summons} pulls; Money in hand ${formatShort(s.resources['money'] ?? 0)}, scrolls ${num(s.resources['summon_scroll'] ?? new Decimal(0)).toFixed(0)} summon / ${num(s.resources['glamour_scroll'] ?? new Decimal(0)).toFixed(0)} glamour`,
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
    `Fought over time: ${formatFightTimeline(result.progress, result.simSeconds / 3600)}`,
    `Workers: ${Object.entries(activeWorkers(s, content))
      .map(([place, ids]) => `${place} ${ids.join(' + ')}`)
      .join(
        ', ',
      )}; forge ${forgeWorker(s, content) ?? 'idle'} (${s.production.forge.recipe ?? 'no recipe'}); tools ${
      Object.entries(s.production.tools)
        .map(([id, l]) => `${id} ${l}`)
        .join(', ') || 'none'
    }`,
    `Wishlist: ${s.cards.wishlist.join(', ') || 'empty'}; star dust ${num(have(s, 'star_dust')).toFixed(0)} held, ${(result.log.dustSpent ?? 0).toFixed(0)} spent`,
    ...(result.log.table ? [formatTableLog(result.log.table, s, content, result.simSeconds)] : []),
  ].join('\n');
}

/** The table update's counters of one run, as a few lines (`formatSummary`). */
export function formatTableLog(
  table: TableLog,
  state: GameState,
  content: Content,
  simSeconds: number,
): string {
  const all = table.challengesWon + table.challengesLost;
  const open = simSeconds - table.lastRiseAt;
  const stuck =
    open > table.stuckLongest
      ? `${hoursText(open)} at ${whereFighting(state, content)} (still)`
      : `${hoursText(table.stuckLongest)} before a new best floor at ${table.stuckWhere}`;
  return [
    `Floor Challenges: ${table.challengesWon} won, ${table.challengesLost} lost (${all > 0 ? Math.round((table.challengesWon / all) * 100) : 0}%), ${table.manualTries} started by hand; longest stuck ${stuck}`,
    `Team: ${teamRoles(state, content)} (${[state.cards.loadouts.fighting.main, ...state.cards.loadouts.fighting.supports].filter(Boolean).join(', ')})`,
    `Scrolls spent: ${table.summonSpent} Summon (${table.focusPulls} at the Focus Portal), ${table.glamourSpent} Glamour; held ${num(have(state, 'summon_scroll')).toFixed(2)} / ${num(have(state, 'glamour_scroll')).toFixed(2)}`,
    `Expeditions: ${table.trips} trips, ${table.tripMaterials} Core units (fights ${table.fightMaterials}), ${formatShort(table.tripGems)} weighted gems`,
    `Ascension challenges: ${table.challengeRuns} runs, ${table.challengesLeft} left, completed ${table.completions.map(([id, at]) => `${id} at ${hoursText(at)}`).join(', ') || 'none'}`,
  ].join('\n');
}

/** Seconds as the fight-pace table prints them. */
const secondsText = (s: number | null): string =>
  s === null ? '-' : s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;

/** Share of the values inside [lo, hi], as a percent. */
const shareIn = (values: readonly number[], lo: number, hi: number): string =>
  values.length === 0
    ? '-'
    : `${Math.round((values.filter((v) => v >= lo && v <= hi).length / values.length) * 100)}%`;

/** The fight pace bands of DESIGN.md §6: boss and mini-boss 15 to 30 s, a wave a few seconds. */
export const FIGHT_BAND = { killLo: 15, killHi: 30, fallLo: 10, fallHi: 20, waveHi: 6 } as const;

/**
 * How long fights take (DESIGN.md §6 Fight pace, Floors pace), over every seed: per dungeon and
 * tier, the median time to kill at the first win of the last-floor boss, the mini-bosses and the
 * waves (with how long the team would last there), the floor farmed (read every quarter hour) and
 * how long a team that lost a Challenge lasted. Then the share of every first win inside its band.
 */
export function formatFightPace(
  runs: ReadonlyArray<{ fights: readonly FightSample[] }>,
  content: Content,
): string {
  const all = runs.flatMap((r) => r.fights);
  const kills = (xs: readonly FightSample[]): number[] =>
    xs.map((f) => f.kill).filter((v): v is number => v !== null && Number.isFinite(v));
  const lasts = (xs: readonly FightSample[]): number[] =>
    xs.map((f) => f.survive).filter((v): v is number => v !== null && Number.isFinite(v));
  const cell = (xs: readonly FightSample[], withLast = true): string => {
    if (xs.length === 0) return '-';
    const k = kills(xs);
    const l = lasts(xs);
    const last = withLast && l.length > 0 ? ` (lasts ${secondsText(median(l))})` : '';
    return `${secondsText(k.length > 0 ? median(k) : null)}${last} n=${xs.length}`;
  };
  const lines = [
    '| Dungeon | Tier | Boss, first win | Mini-bosses, first wins | Waves, first wins | Farmed floor | Lost Challenges: team lasts |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const d of content.dungeons) {
    for (const tier of DIFFICULTIES) {
      const here = all.filter((f) => f.dungeonId === d.id && f.difficulty === tier);
      if (here.length === 0) continue;
      const of = (at: FightSample['at'], kind?: FightSample['kind']): FightSample[] =>
        here.filter((f) => f.at === at && (kind === undefined || f.kind === kind));
      const loss = of('loss');
      lines.push(
        `| ${d.name} | ${tier} | ${cell(of('first', 'boss'))} | ${cell(of('first', 'miniboss'))} | ${cell(of('first', 'wave'))} | ${cell(of('farm'), false)} | ${loss.length > 0 ? `${secondsText(median(lasts(loss)))} n=${loss.length}` : '-'} |`,
      );
    }
  }
  const first = all.filter((f) => f.at === 'first');
  const b = FIGHT_BAND;
  const band = (label: string, xs: readonly FightSample[], lo: number, hi: number): string => {
    const k = kills(xs);
    return `${label} ${shareIn(k, lo, hi)} in ${lo}-${hi} s (median ${secondsText(median(k))}, n=${k.length})`;
  };
  const fell = lasts(all.filter((f) => f.at === 'loss'));
  const fellBoss = lasts(all.filter((f) => f.at === 'loss' && f.kind !== 'wave'));
  const held = first.filter((f) => f.held === true);
  lines.push(
    '',
    `Every first win: ${band(
      'bosses',
      first.filter((f) => f.kind === 'boss'),
      b.killLo,
      b.killHi,
    )}; ${band(
      'mini-bosses',
      first.filter((f) => f.kind === 'miniboss'),
      b.killLo,
      b.killHi,
    )}; ${band(
      'waves',
      first.filter((f) => f.kind === 'wave'),
      0,
      b.waveHi,
    )}.`,
    `First wins after a loss (a matching team): ${band(
      'bosses',
      held.filter((f) => f.kind === 'boss'),
      b.killLo,
      b.killHi,
    )}; ${band(
      'mini-bosses',
      held.filter((f) => f.kind === 'miniboss'),
      b.killLo,
      b.killHi,
    )}; ${band(
      'waves',
      held.filter((f) => f.kind === 'wave'),
      0,
      b.waveHi,
    )}.`,
    `A losing team falls: ${shareIn(fell, b.fallLo, b.fallHi)} in ${b.fallLo}-${b.fallHi} s (median ${secondsText(median(fell))}, n=${fell.length}); on a boss or mini-boss ${shareIn(fellBoss, b.fallLo, b.fallHi)} (median ${secondsText(median(fellBoss))}, n=${fellBoss.length}).`,
    '(times from the game\'s own readouts, `secondsPerKill` and `survivalSeconds`, with the team as it stood; "lasts" is how long its full health holds there)',
  );
  return lines.join('\n');
}

/**
 * Levels (DESIGN.md §4 Levels), medians over the seeds at the reading hours: the mean tree and
 * mine level, the gem output a second (weighted as Starlight weighs the tiers) and how many
 * seconds of Money income the cheapest next level costs. Production runs away when the output
 * grows faster than the prices: the wait would fall toward nothing while the output explodes.
 */
export function formatLevels(
  runs: ReadonlyArray<{ progress: readonly ProgressSample[] }>,
  hours: number,
): string {
  const lines = [
    '| Hour | Mean level | Gem output /s (weighted) | Next level costs (s of Money income) |',
    '|---|---|---|---|',
  ];
  for (const h of progressHours(hours)) {
    const at = runs
      .map((r) => r.progress.find((p) => p.t === h * 3600))
      .filter((p): p is ProgressSample => p !== undefined && p.meanLevel !== undefined);
    if (at.length === 0) continue;
    const m = (f: (p: ProgressSample) => number): number => median(at.map(f));
    lines.push(
      `| ${h} | ${Math.round(m((p) => p.meanLevel ?? 0))} | ${formatShort(m((p) => p.gemOutput ?? 0))} | ${secondsText(m((p) => p.levelWait ?? 0))} |`,
    );
  }
  return lines.join('\n');
}
