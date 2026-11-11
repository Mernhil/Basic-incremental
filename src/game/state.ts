import type { BurstJob, Content, Job, RankTier } from '../data';
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
  /** Damage upgrades, kills per dungeon and the Glimmer Trial attempt. See combat.ts. */
  combat: CombatState;
  /** Burst gauges: fighting (signature attack) and harvest bursts for logging and mining. */
  bursts: Record<BurstJob, BurstGauge>;
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
  /** The autobuyers for tree and mine levels (DESIGN.md §9, §15). Save format 26; not read yet. */
  automation: AutomationState;
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

/** Push moves down a floor on a win; farm stays on the floor (DESIGN.md §6 Dungeon floors). */
export type FloorMode = 'push' | 'farm';

/** Where the player is on one difficulty of a dungeon. */
export interface TierProgress {
  /** The floor being fought (1-based). Reset by Ascension to half of `best`. */
  floor: number;
  /** The deepest floor beaten (0 = none). Kept through Ascension. */
  best: number;
}

/** A dungeon's floors: the difficulty chosen, push or farm, and the progress on each difficulty. */
export interface DungeonProgress {
  difficulty: Difficulty;
  mode: FloorMode;
  /** Missing = floor 1, nothing beaten. */
  tiers: Partial<Record<Difficulty, TierProgress>>;
}

export interface CombatState {
  /** Dungeon id -> kills of its last-floor boss, ever (the boss medals count them). */
  kills: Record<string, number>;
  /** Dungeon id -> its floors (DESIGN.md §6). Missing = a dungeon never fought. */
  floors: Record<string, DungeonProgress>;
  /** Training line id -> levels bought this run (DESIGN.md §6 Training). Reset on Ascension. */
  training: Record<string, number>;
  /** The running special-dungeon attempt (only meaningful while a trial is active). */
  trialAttempt: TrialAttempt;
  /** Special dungeon id -> best score, 0..1. */
  trialBest: Record<string, number>;
  /** Damage the fighting loadout's health pool has taken (0 = full health; DESIGN.md §6). */
  loadoutDamage: Decimal;
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
    kills: {},
    floors: {},
    training: {},
    trialAttempt: { elapsedSeconds: 0, dealt: new Decimal(0) },
    trialBest: {},
    loadoutDamage: new Decimal(0),
    knockoutSeconds: 0,
    stageKills: {},
    stageChests: {},
    overflow: {},
  };
}

export function initialBursts(): Record<BurstJob, BurstGauge> {
  return {
    fighting: { gauge: 0, timer: 0 },
    logging: { gauge: 0, timer: 0 },
    mining: { gauge: 0, timer: 0 },
  };
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
    kills: { ...c.kills },
    floors: cloneFloors(c.floors),
    training: { ...c.training },
    trialAttempt: { ...c.trialAttempt },
    trialBest: { ...c.trialBest },
    loadoutDamage: c.loadoutDamage,
    knockoutSeconds: c.knockoutSeconds,
    stageKills: { ...c.stageKills },
    stageChests: { ...c.stageChests },
    overflow: { ...c.overflow },
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

export function cloneBursts(b: Record<BurstJob, BurstGauge>): Record<BurstJob, BurstGauge> {
  return { fighting: { ...b.fighting }, logging: { ...b.logging }, mining: { ...b.mining } };
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

/** One job's loadout: 1 main card and 3 support slots (null = empty). */
export interface CardLoadout {
  main: string | null;
  /** Always 3 entries. */
  supports: (string | null)[];
}

export interface CardState {
  /** Card id -> the owned card. */
  owned: Record<string, OwnedCard>;
  loadouts: Record<Job, CardLoadout>;
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

/** A new game owns the start cards (cardRules.startCards), each leading its job. */
export function initialCards(content: Content): CardState {
  const cards: CardState = {
    owned: {},
    loadouts: {
      mining: emptyCardLoadout(),
      logging: emptyCardLoadout(),
      fighting: emptyCardLoadout(),
    },
    shards: 0,
    wishlist: [],
  };
  for (const id of content.cardRules.startCards) {
    const card = content.cardById.get(id);
    if (!card) continue;
    cards.owned[id] = newOwnedCard();
    cards.loadouts[card.job].main = id;
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
    loadouts: {
      mining: loadout(c.loadouts.mining),
      logging: loadout(c.loadouts.logging),
      fighting: loadout(c.loadouts.fighting),
    },
    shards: c.shards,
    wishlist: [...c.wishlist],
  };
}
