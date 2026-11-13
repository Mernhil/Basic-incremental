import type { Content, RankTier } from '../data';
import { Decimal } from './num';
import type { CosmeticLoadout } from './theme';

export interface GameStats {
  playTimeMs: number;
  bossKills: number;
  /** Longest offline progress collected at once (for Night Owl). */
  longestOfflineMs: number;
}

export interface GameState {
  /** Every resource id in the content has an entry. */
  resources: Record<string, Decimal>;
  /** Unlocked tree kinds, tree and mine levels. See production.ts. */
  production: ProductionState;
  /** Dungeons cleared at least once. Kept through prestige; clearing one unlocks mine types. */
  clearedDungeons: string[];
  /** Floors, stage kills and the Glimmer Trial attempt. See combat.ts. */
  combat: CombatState;
  /** The fighting burst gauge (signature attack). Harvest gauges are per worker, in
   *  `production.harvestGauges`. */
  bursts: FightingBursts;
  /** Dungeon (or special dungeon) being auto-fought, or null. */
  activeDungeonId: string | null;
  /** HP left of the floor being fought, all its enemies together (our damage reaches them in
   *  order); null means "the floor starts fresh on the next tick". */
  bossHp: Decimal | null;
  /** Boss id -> consecutive kills without the rare drop (pity counter). */
  pity: Record<string, number>;
  /** Rare item id -> count owned. */
  inventory: Record<string, number>;
  prestigeCount: number;
  stats: GameStats;
  cosmetics: CosmeticState;
  /** Weapon kind -> the chosen skin id (weaponSkins.json). Missing = the unskinned weapon. Kept through
   *  prestige. Not a cosmetic slot. */
  weaponSkins: Record<string, string>;
  /** Owned legacy weapon skin ids (weaponSkins.json), earned from the Legacy Gate. Kept through prestige. */
  legacySkins: string[];
  /** Owned cards, the loadout of each job and shards. See cards.ts. */
  cards: CardState;
  /** Gem mastery totals and settled mastery tiers (DESIGN.md §4, §6). Kept through prestige. */
  mastery: MasteryState;
  /** Portal id -> pull counters (DESIGN.md §7). Kept through prestige; missing = no pulls yet. */
  portals: Record<string, PortalCounters>;
  /** Ascension (DESIGN.md §9): the run's start, Starlight shop levels and Starlight earned. */
  prestige: PrestigeState;
  /** Achievement id -> play time (ms) when it unlocked. Kept through prestige. */
  achievements: Record<string, number>;
  /** Shard shop item id -> purchases made. */
  shardShop: Record<string, number>;
  /** Account XP, level, account tree and respecs. */
  account: AccountState;
  /** The upgrade shelf (DESIGN.md §4): owned upgrades and the lifetime Money earned. */
  upgrades: UpgradeState;
  /** The autobuyers for tree and mine levels (DESIGN.md §9, §15). Save format 26. */
  automation: AutomationState;
  /** Summoning choices of the table update (DESIGN.md §3 scrolls, §7 Focus Portal). Save format 27;
   *  not read yet. Kept through prestige. */
  summon: SummonState;
  /** Loadout presets (DESIGN.md §15). Save format 27; not read yet. Kept through prestige. */
  presets: PresetState;
  /** Bond ids (`bonds.json`) triggered at least once (DESIGN.md §15 Bonds), in discovery order.
   *  Save format 27; not read yet. Kept through prestige. */
  discoveredBonds: string[];
  /** Expeditions under way (DESIGN.md §15). Save format 27; not read yet. Kept through prestige. */
  expeditions: ExpeditionState;
  /** Ascension challenges (DESIGN.md §15). Save format 27; not read yet. Kept through prestige. */
  ascensionChallenges: AscensionChallengeState;
}

/** Summoning state of the table update (DESIGN.md §3 Crystal wage / scrolls, §7 Focus Portal). The
 *  scrolls themselves are resources (`summon_scroll`, `glamour_scroll`). */
export interface SummonState {
  /** The item type (`items.json` type kind, e.g. "sword") the Focus Portal pulls; null = none
   *  chosen yet. Its pity is the Card Portal's counter (`portals.card_portal`). */
  focusKind: string | null;
  /** The local calendar day ("YYYY-MM-DD") the daily scroll reward was last claimed; null = never. */
  dailyClaimedDay: string | null;
}

export function initialSummon(): SummonState {
  return { focusKind: null, dailyClaimedDay: null };
}

/** The production jobs that have named presets (DESIGN.md §15 Loadout presets). */
export const PRESET_JOBS = ['logging', 'mining'] as const;
export type PresetJob = (typeof PRESET_JOBS)[number];
/** Named presets per production job ([Default] three). */
export const PRESETS_PER_JOB = 3;

/** A named production preset: which cards work which tree or mine of that job. */
export interface ProductionPreset {
  name: string;
  /** Tree or mine id -> card ids in slot order, as `production.workers`. */
  workers: Record<string, string[]>;
}

export interface PresetState {
  /** Dungeon (or special dungeon) id -> the fighting loadout remembered for it; missing = none
   *  saved, picking the dungeon keeps the current loadout. */
  dungeons: Record<string, CardLoadout>;
  /** Job -> always `PRESETS_PER_JOB` entries, null = an empty preset slot. */
  production: Record<PresetJob, (ProductionPreset | null)[]>;
}

export function initialPresets(): PresetState {
  const empty = (): (ProductionPreset | null)[] => Array<null>(PRESETS_PER_JOB).fill(null);
  return { dungeons: {}, production: { logging: empty(), mining: empty() } };
}

/** One card's trip (DESIGN.md §15 Expeditions). A card on a trip cannot be equipped or work. */
export interface ExpeditionTrip {
  cardId: string;
  /** A place id of `expeditions.json`. */
  placeId: string;
  /** The trip length chosen, one of `expeditions.json` `durationsHours`. */
  hours: number;
  /** Seconds the trip has run. Advanced by play time and by all of the time away (trips are
   *  outside the offline cap); done when it reaches hours × 3600. */
  elapsedSeconds: number;
}

export interface ExpeditionState {
  /** Trips under way, one per slot in use (the slot count is derived). */
  trips: ExpeditionTrip[];
  /** Trips collected so far (the First Expedition achievement). Kept through prestige. */
  completed: number;
}

export function initialExpeditions(): ExpeditionState {
  return { trips: [], completed: 0 };
}

/** Whether a card is away on an expedition: it cannot be equipped or work (DESIGN.md §15). */
export function isOnTrip(state: Pick<GameState, 'expeditions'>, cardId: string): boolean {
  return state.expeditions.trips.some((t) => t.cardId === cardId);
}

/** A challenge is completed up to three times, with harder targets (DESIGN.md §15). */
export const MAX_CHALLENGE_COMPLETIONS = 3;

export interface AscensionChallengeState {
  /** The challenge id (`challenges.json`) the current run is under; null = a normal run. */
  active: string | null;
  /** Challenge id -> completions, 0..3 (missing = 0). */
  completions: Record<string, number>;
}

export function initialAscensionChallenges(): AscensionChallengeState {
  return { active: null, completions: {} };
}

/**
 * The autobuyers for tree and mine levels (DESIGN.md §15), bought in the Starlight shop (§9).
 * Only the player's switches live here: whether an autobuyer is owned comes from the shop.
 */
export interface AutomationState {
  /** The tree-level autobuyer is switched on. */
  treeLevels: boolean;
  /** The mine-level autobuyer is switched on. */
  mineLevels: boolean;
  /** Percent of the Money held (0..100) the autobuyers leave unspent. */
  reservePercent: number;
}

export function initialAutomation(): AutomationState {
  return { treeLevels: false, mineLevels: false, reservePercent: 0 };
}

/** The upgrade shelf's state. */
export interface UpgradeState {
  /** Ids of the upgrades bought. Non-permanent ones are dropped by an ascension. */
  owned: string[];
  /** Money earned from dungeons (wage and purses) over every run; kept through prestige. */
  moneyEarned: Decimal;
}

export function initialUpgrades(): UpgradeState {
  return { owned: [], moneyEarned: new Decimal(0) };
}

/** Ascension progress. Kept through prestige (the run start moves forward on each ascension). */
export interface PrestigeState {
  /** Production gem id -> lifetime total harvested when this run began (missing = 0). Starlight
   *  comes from what was harvested since. */
  runStart: Record<string, Decimal>;
  /** Starlight shop item id -> level bought. */
  shop: Record<string, number>;
  /** Starlight gained over every ascension. */
  starlightEarned: Decimal;
}

export function initialPrestige(): PrestigeState {
  return { runStart: {}, shop: {}, starlightEarned: new Decimal(0) };
}

/** One portal's pull counters. */
export interface PortalCounters {
  /** Pulls since the last one of the pity rarity or better (hard pity counter). */
  pity: number;
  /** Pulls ever made. */
  pulls: number;
  /** Pulls that were given by hard pity. */
  pityHits: number;
}

/**
 * Mastery (DESIGN.md §4, §6). Tiers are settled on the same 1 s play-time grid as card
 * levels (see tick.ts), so the bonuses they give change at the same moments however time is
 * split; the totals themselves grow continuously.
 */
export interface MasteryState {
  /** Production gem id -> lifetime total harvested (normal output, bursts and offline). */
  harvested: Record<string, Decimal>;
  /** Gem id -> settled mastery tier 1..4 (missing = 0, stone). */
  gemTiers: Record<string, number>;
  /** Dungeon or special dungeon id -> settled medal tier 1..4 (missing = 0). */
  bossTiers: Record<string, number>;
}

export function initialMastery(): MasteryState {
  return { harvested: {}, gemTiers: {}, bossTiers: {} };
}

export function cloneMastery(m: MasteryState): MasteryState {
  return {
    harvested: { ...m.harvested },
    gemTiers: { ...m.gemTiers },
    bossTiers: { ...m.bossTiers },
  };
}

export interface OwnedCosmetic {
  /** Highest unlocked upgrade level (1-based). */
  level: number;
  /** Duplicate copies held, used to unlock levels. */
  copies: number;
}

export interface CosmeticState {
  loadout: CosmeticLoadout;
  /** Cosmetic id -> ownership. Owning grants the item's buff whether or not it is worn. */
  owned: Record<string, OwnedCosmetic>;
}

/** Production (DESIGN.md §4): every unlocked tree kind and mine type produces once, at its level. */
export interface ProductionState {
  /** Tree kinds bought with wood (start kinds are always unlocked). Kept through prestige. */
  unlockedTrees: string[];
  /** Mine id -> level bought with Money. Reset on prestige. */
  mineLevels: Record<string, number>;
  /** Tree id -> level bought with Money (DESIGN.md §4). Reset on prestige. */
  treeLevels: Record<string, number>;
  /** Tree or mine id -> the ids of the cards working it, in slot order (DESIGN.md §4 Workers).
   *  A card works one place at a time; missing or [] = no worker. Kept through prestige. */
  workers: Record<string, string[]>;
  /** Tree or mine id -> its worker's harvest gauge (DESIGN.md §4 Harvest burst); missing = empty.
   *  Reset on prestige, as the burst gauges are. */
  harvestGauges: Record<string, BurstGauge>;
  /** Tool line id -> level bought with Money (DESIGN.md §4 Tool lines). Reset on prestige. */
  tools: Record<string, number>;
  /** Tree or mine id -> its age or layer (DESIGN.md §4 Depth and growth); missing = layer 1 with
   *  nothing broken. Reset on prestige. */
  depth: Record<string, DepthProgress>;
  /** The forge (DESIGN.md §4 The forge). Kept through prestige. */
  forge: ForgeState;
}

/** How deep a mine is dug or how old a tree has grown (DESIGN.md §4 Depth and growth). */
export interface DepthProgress {
  /** The layer (mine) or age (tree) being broken through, 1-based. */
  layer: number;
  /** Hardness of that layer broken so far (the worker's damage), 0 up to the layer's hardness. */
  progress: Decimal;
}

/** The forge (DESIGN.md §4 The forge): one recipe at a time, run by one worker card. */
export interface ForgeState {
  /** The recipe id being made (`production.json`), or null when idle. */
  recipe: string | null;
  /** Progress toward the next craft of that recipe. */
  progress: Decimal;
  /** The card working the forge, or null. A card works one place at a time. */
  worker: string | null;
}

export function initialForge(): ForgeState {
  return { recipe: null, progress: new Decimal(0), worker: null };
}

/**
 * The difficulty tiers of a dungeon (DESIGN.md §6 Difficulty tiers), then its endless depths.
 * Each has its own floors; `endless` counts depths below the Nightmare boss.
 */
export const DIFFICULTIES = ['normal', 'hard', 'nightmare', 'endless'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Where the player is on one difficulty of a dungeon. */
export interface TierProgress {
  /** The floor being farmed (1-based; DESIGN.md §6 Farming and Challenge). Never above `best`
   *  once a floor is beaten (floors.ts `floorPosition` reads it so). Reset by Ascension to half of
   *  `best`. */
  floor: number;
  /** The deepest floor beaten (0 = none). Kept through Ascension. */
  best: number;
}

/** A dungeon's floors: the difficulty chosen, auto-challenge, and the progress on each difficulty. */
export interface DungeonProgress {
  difficulty: Difficulty;
  /** Auto-challenge is on (DESIGN.md §6 Auto-challenge): the next Challenge starts by itself after a
   *  win and, after a loss, once the wait is over. Save format 27. */
  autoChallenge: boolean;
  /** Missing = floor 1, nothing beaten. */
  tiers: Partial<Record<Difficulty, TierProgress>>;
}

export interface CombatState {
  /** Dungeon id -> its floors (DESIGN.md §6). Missing = a dungeon never fought. */
  floors: Record<string, DungeonProgress>;
  /** Training line id -> levels bought this run (DESIGN.md §6 Training). Reset on Ascension. */
  training: Record<string, number>;
  /** The running special-dungeon attempt (only meaningful while a trial is active). */
  trialAttempt: TrialAttempt;
  /** Special dungeon id -> best score: the share of the target's HP dealt, 1 = 100%, no cap. */
  trialBest: Record<string, number>;
  /** Seconds left of a knockout; while above 0 the loadout does not fight. */
  knockoutSeconds: number;
  /** Stage key (`stageKey` in floors.ts) -> kills on that stage, ever (DESIGN.md §6 Stage stars).
   *  Kept through prestige. */
  stageKills: Record<string, number>;
  /** Stage key -> star levels whose one-time chest is paid, 0..6 (missing = 0). Kept through
   *  prestige. */
  stageChests: Record<string, number>;
  /** Stage key -> the overflow switch is on (DESIGN.md §6 Overflow); missing = off. Kept through
   *  prestige. */
  overflow: Record<string, boolean>;
  /** Index in the floor's wave of the enemy being fought (0-based; the ones before it are dead),
   *  for "each enemy has its own HP" (DESIGN.md §6); `bossHp` is then that enemy's HP. Save format
   *  27. */
  enemyIndex: number;
  /** The Challenge being fought (DESIGN.md §6 Farming and Challenge), or null while farming. Its
   *  floor is derived: the floor after the farmed one (floors.ts `challengeFloor`). Save format 27. */
  challenge: ChallengeRun | null;
  /** Seconds left before auto-challenge tries again after a loss (0 = no wait). Save format 27. */
  challengeWaitSeconds: number;
  /** Card id -> damage that team card's own health has taken (DESIGN.md §6 card duel); missing =
   *  full health; at or above the card's max health it is knocked out. The team is derived (the
   *  fighting loadout, main then supports; duel.ts). Save format 27; it replaced the shared
   *  `loadoutDamage` pool. */
  cardDamage: Record<string, Decimal>;
  /** Team card ids knocked out on the floor being fought (DESIGN.md §6 card duel): they stay out
   *  until the floor is won, even when their max health rises meanwhile. Save format 27. */
  cardsOut: string[];
}

/** A running Challenge (DESIGN.md §6 Farming and Challenge). */
export interface ChallengeRun {
  dungeonId: string;
  difficulty: Difficulty;
  /** Seconds the Challenge has run; it is lost when this reaches its timer. */
  elapsedSeconds: number;
}

export interface TrialAttempt {
  elapsedSeconds: number;
  /** Damage dealt to the target so far in this attempt. */
  dealt: Decimal;
}

export interface BurstGauge {
  /** Gauge points, 0 up to the burst size (exclusive). */
  gauge: number;
  /** Seconds since the last hit / tick, 0 up to the interval (exclusive). */
  timer: number;
}

export function initialCombat(): CombatState {
  return {
    floors: {},
    training: {},
    trialAttempt: { elapsedSeconds: 0, dealt: new Decimal(0) },
    trialBest: {},
    knockoutSeconds: 0,
    stageKills: {},
    stageChests: {},
    overflow: {},
    enemyIndex: 0,
    challenge: null,
    challengeWaitSeconds: 0,
    cardDamage: {},
    cardsOut: [],
  };
}

/** The burst gauges kept on the state: fighting only (DESIGN.md §6). */
export interface FightingBursts {
  fighting: BurstGauge;
}

export function initialBursts(): FightingBursts {
  return { fighting: { gauge: 0, timer: 0 } };
}

/** Production as in a brand-new game (or right after a prestige, minus the kept unlocks). */
export function initialProduction(): ProductionState {
  return {
    unlockedTrees: [],
    mineLevels: {},
    treeLevels: {},
    workers: {},
    harvestGauges: {},
    tools: {},
    depth: {},
    forge: initialForge(),
  };
}

/** What a resource holds at the start of a game or of a run (Money starts with a little; DESIGN.md §3). */
export function startingAmount(content: Content, resourceId: string): Decimal {
  return content.resourceById.get(resourceId)?.startAmount ?? new Decimal(0);
}

/**
 * A new game's workers (DESIGN.md §4 Workers): each logging and mining start card
 * (cardRules.startCards) works its job's first tree kind or mine type, as an old save's main
 * cards do after the format 26 migration.
 */
export function initialWorkers(content: Content): Record<string, string[]> {
  const first = { logging: content.trees[0]?.id, mining: content.mines[0]?.id };
  const workers: Record<string, string[]> = {};
  for (const id of content.cardRules.startCards) {
    const job = content.cardById.get(id)?.job;
    const producer = job === 'logging' || job === 'mining' ? first[job] : undefined;
    if (producer && !workers[producer]) workers[producer] = [id];
  }
  return workers;
}

export function createInitialState(content: Content): GameState {
  const resources: Record<string, Decimal> = {};
  for (const resource of content.resources)
    resources[resource.id] = startingAmount(content, resource.id);

  return {
    resources,
    production: { ...initialProduction(), workers: initialWorkers(content) },
    clearedDungeons: [],
    combat: initialCombat(),
    bursts: initialBursts(),
    activeDungeonId: content.dungeons[0]?.id ?? null,
    bossHp: null,
    pity: {},
    inventory: {},
    prestigeCount: 0,
    weaponSkins: {},
    legacySkins: [],
    stats: { playTimeMs: 0, bossKills: 0, longestOfflineMs: 0 },
    achievements: {},
    shardShop: {},
    account: initialAccount(),
    upgrades: initialUpgrades(),
    automation: initialAutomation(),
    summon: initialSummon(),
    presets: initialPresets(),
    discoveredBonds: [],
    expeditions: initialExpeditions(),
    ascensionChallenges: initialAscensionChallenges(),
    cards: initialCards(content),
    mastery: initialMastery(),
    portals: {},
    prestige: initialPrestige(),
    cosmetics: {
      loadout: { slots: {}, cards: {} },
      owned: Object.fromEntries(
        Object.values(content.starterBySlot).map((c) => [c.id, { level: 1, copies: 1 }]),
      ),
    },
  };
}

/** Copy with fresh containers so callers never mutate a previous state. Decimals are immutable. */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    resources: { ...state.resources },
    production: cloneProduction(state.production),
    clearedDungeons: [...state.clearedDungeons],
    combat: cloneCombat(state.combat),
    bursts: cloneBursts(state.bursts),
    pity: { ...state.pity },
    inventory: { ...state.inventory },
    stats: { ...state.stats },
    weaponSkins: { ...state.weaponSkins },
    legacySkins: [...state.legacySkins],
    cards: cloneCards(state.cards),
    mastery: cloneMastery(state.mastery),
    portals: Object.fromEntries(Object.entries(state.portals).map(([id, p]) => [id, { ...p }])),
    achievements: { ...state.achievements },
    shardShop: { ...state.shardShop },
    upgrades: { owned: [...state.upgrades.owned], moneyEarned: state.upgrades.moneyEarned },
    automation: { ...state.automation },
    summon: { ...state.summon },
    presets: clonePresets(state.presets),
    discoveredBonds: [...state.discoveredBonds],
    expeditions: {
      trips: state.expeditions.trips.map((t) => ({ ...t })),
      completed: state.expeditions.completed,
    },
    ascensionChallenges: {
      active: state.ascensionChallenges.active,
      completions: { ...state.ascensionChallenges.completions },
    },
    account: { ...state.account, skills: { ...state.account.skills } },
    prestige: {
      runStart: { ...state.prestige.runStart },
      shop: { ...state.prestige.shop },
      starlightEarned: state.prestige.starlightEarned,
    },
    cosmetics: {
      loadout: {
        slots: { ...state.cosmetics.loadout.slots },
        cards: { ...state.cosmetics.loadout.cards },
      },
      owned: { ...state.cosmetics.owned },
    },
  };
}

export function cloneProduction(p: ProductionState): ProductionState {
  return {
    unlockedTrees: [...p.unlockedTrees],
    mineLevels: { ...p.mineLevels },
    treeLevels: { ...p.treeLevels },
    workers: Object.fromEntries(Object.entries(p.workers).map(([id, w]) => [id, [...w]])),
    harvestGauges: Object.fromEntries(
      Object.entries(p.harvestGauges).map(([id, g]) => [id, { ...g }]),
    ),
    tools: { ...p.tools },
    depth: Object.fromEntries(Object.entries(p.depth).map(([id, d]) => [id, { ...d }])),
    forge: { ...p.forge },
  };
}

export function cloneCombat(c: CombatState): CombatState {
  return {
    floors: cloneFloors(c.floors),
    training: { ...c.training },
    trialAttempt: { ...c.trialAttempt },
    trialBest: { ...c.trialBest },
    knockoutSeconds: c.knockoutSeconds,
    stageKills: { ...c.stageKills },
    stageChests: { ...c.stageChests },
    overflow: { ...c.overflow },
    enemyIndex: c.enemyIndex,
    challenge: c.challenge ? { ...c.challenge } : null,
    challengeWaitSeconds: c.challengeWaitSeconds,
    cardDamage: { ...c.cardDamage },
    cardsOut: [...c.cardsOut],
  };
}

export function clonePresets(p: PresetState): PresetState {
  const copyWorkers = (w: Record<string, string[]>): Record<string, string[]> =>
    Object.fromEntries(Object.entries(w).map(([id, cards]) => [id, [...cards]]));
  const job = (list: (ProductionPreset | null)[]): (ProductionPreset | null)[] =>
    list.map((x) => (x ? { name: x.name, workers: copyWorkers(x.workers) } : null));
  return {
    dungeons: Object.fromEntries(
      Object.entries(p.dungeons).map(([id, l]) => [
        id,
        { main: l.main, supports: [...l.supports] },
      ]),
    ),
    production: { logging: job(p.production.logging), mining: job(p.production.mining) },
  };
}

export function cloneFloors(
  floors: Record<string, DungeonProgress>,
): Record<string, DungeonProgress> {
  return Object.fromEntries(
    Object.entries(floors).map(([id, p]) => [
      id,
      {
        ...p,
        tiers: Object.fromEntries(Object.entries(p.tiers).map(([d, t]) => [d, { ...t }])),
      },
    ]),
  );
}

export function cloneBursts(b: FightingBursts): FightingBursts {
  return { fighting: { ...b.fighting } };
}

/** One owned card (DESIGN.md §5). Each card is owned once; further copies are duplicates. */
export interface OwnedCard {
  tier: RankTier;
  /** 1..6 within the tier. */
  stars: number;
  /** 1 up to the level cap of the rank. */
  level: number;
  /** XP towards the next level (0 at the level cap). */
  xp: Decimal;
  /** The star bar (DESIGN.md §5): fill from duplicates, spent on star-ups. */
  starFill: number;
  /** Chosen card enhancement option ids (DESIGN.md §10b). */
  enhancements: string[];
}

/** The account (DESIGN.md §10a, 16 E7). Kept through prestige. */
export interface AccountState {
  /** XP toward the next level (0 at the max level). */
  xp: Decimal;
  level: number;
  /** Account tree node id -> rank bought. */
  skills: Record<string, number>;
  /** Free respecs used this run (reset on ascension). */
  freeRespecsUsed: number;
}

export function initialAccount(): AccountState {
  return { xp: new Decimal(0), level: 1, skills: {}, freeRespecsUsed: 0 };
}

/** The fighting loadout: 1 main card and 3 support slots (null = empty). Logging and mining
 *  cards are workers instead (`production.workers`, DESIGN.md §4). */
export interface CardLoadout {
  main: string | null;
  /** Always 3 entries. */
  supports: (string | null)[];
}

export interface CardState {
  /** Card id -> the owned card. */
  owned: Record<string, OwnedCard>;
  /** Only fighting has a loadout (DESIGN.md §5 Loadouts). */
  loadouts: { fighting: CardLoadout };
  /** From duplicates gained past ★6 (DESIGN.md §5). */
  shards: number;
  /** Card ids marked to hunt in the Card Portal (DESIGN.md §7 Wishlist), in the order marked.
   *  Owned or not. Kept through prestige. */
  wishlist: string[];
}

export const SUPPORT_SLOTS = 3;

export function emptyCardLoadout(): CardLoadout {
  return { main: null, supports: Array<string | null>(SUPPORT_SLOTS).fill(null) };
}

/** A card as first obtained: Wood ★1, Lv 1, no XP, an empty star bar. */
export function newOwnedCard(): OwnedCard {
  return {
    tier: 'wood',
    stars: 1,
    level: 1,
    xp: new Decimal(0),
    starFill: 0,
    enhancements: [],
  };
}

/** A new game owns the start cards (cardRules.startCards); the fighting one leads the loadout
 *  and the others work (`initialWorkers`). */
export function initialCards(content: Content): CardState {
  const cards: CardState = {
    owned: {},
    loadouts: { fighting: emptyCardLoadout() },
    shards: 0,
    wishlist: [],
  };
  for (const id of content.cardRules.startCards) {
    const card = content.cardById.get(id);
    if (!card) continue;
    cards.owned[id] = newOwnedCard();
    if (card.job === 'fighting') cards.loadouts.fighting.main = id;
  }
  return cards;
}

export function cloneCards(c: CardState): CardState {
  const loadout = (l: CardLoadout): CardLoadout => ({ main: l.main, supports: [...l.supports] });
  return {
    owned: Object.fromEntries(
      Object.entries(c.owned).map(([id, card]) => [
        id,
        { ...card, enhancements: [...card.enhancements] },
      ]),
    ),
    loadouts: { fighting: loadout(c.loadouts.fighting) },
    shards: c.shards,
    wishlist: [...c.wishlist],
  };
}
