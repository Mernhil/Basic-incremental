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
  /** The forge. See forge.ts. */
  production: ProductionState;
  /** The base camp: its level and the farming slots of the forest and the cave. See camp.ts. */
  camp: CampState;
  /** The Training ground's test dummy: its damage and the team on trial. See dummy.ts. */
  dummy: DummyState;
  /** Dungeons cleared at least once. Kept through prestige; clearing one unlocks mine types. */
  clearedDungeons: string[];
  /** Floors, stage kills and the Glimmer Trial attempt. See combat.ts. */
  combat: CombatState;
  /** The fighting burst gauge (signature attack). */
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
  /** Card id -> the weapon skin it wears (a legacy skin id from weaponSkins.json, or `card:<cardId>`). Missing
   *  = the card's Original. Kept through prestige. Not a cosmetic slot (DESIGN.md §8 Card skins). */
  cardSkins: Record<string, string>;
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
  /** Quest id -> its state (DESIGN.md §10 Quests): present once done, `claimed` once paid. Kept through
   *  prestige. Save format 34. */
  quests: Record<string, QuestProgress>;
  /** Shard shop item id -> purchases made. */
  shardShop: Record<string, number>;
  /** Account XP, level, account tree and respecs. */
  account: AccountState;
  /** The upgrade shelf (DESIGN.md §4): owned upgrades and the lifetime Money earned. */
  upgrades: UpgradeState;
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
  /** The Heirloom Gate's counters, Heirloom shards and trees (DESIGN.md §7, §10). Save format 30.
   *  Kept through prestige. The Heirloom cards themselves are in `cards.owned`. */
  heirlooms: HeirloomState;
}

/** Heirlooms (DESIGN.md §5 Heirlooms, §7 Heirloom Gate, §10 Heirloom trees). */
export interface HeirloomState {
  /** Heirloom card id -> shards held toward its unlock or next star. Missing = none. */
  shards: Record<string, number>;
  /** Gate pulls since the last whole Heirloom. */
  pity: number;
  /** Gate pulls ever. */
  pulls: number;
  /** Heirloom card id -> the tree node ids bought, in order. */
  trees: Record<string, string[]>;
}

export function initialHeirlooms(): HeirloomState {
  return { shards: {}, pity: 0, pulls: 0, trees: {} };
}

export function cloneHeirlooms(h: HeirloomState): HeirloomState {
  return {
    shards: { ...h.shards },
    pity: h.pity,
    pulls: h.pulls,
    trees: Object.fromEntries(Object.entries(h.trees).map(([id, t]) => [id, [...t]])),
  };
}

/** Summoning state of the table update (DESIGN.md §3 Crystal wage / scrolls, §7 Focus Portal). The
 *  scrolls themselves are resources (`summon_scroll`, `glamour_scroll`). */
export interface SummonState {
  /** The item type (`items.json` type kind, e.g. "sword") the Focus Portal pulls; null = none
   *  chosen yet. Its pity is the Card Portal's counter (`portals.card_portal`). */
  focusKind: string | null;
  /** The local calendar day ("YYYY-MM-DD") the daily scroll reward was last claimed; null = never. */
  dailyClaimedDay: string | null;
  /** The first 10-pull of the Card Portal or the Focus Portal has been made (its guaranteed Gold
   *  is given once; DESIGN.md §2 Summoning). Save format 40. */
  firstTenPullDone: boolean;
  /** Card tiers (card grades, e.g. "wood", "mythic", "void") whose completion reward was paid, in
   *  the order paid (DESIGN.md §2 Summoning, Tier completion reward). Save format 40. */
  tierRewardsClaimed: string[];
}

export function initialSummon(): SummonState {
  return {
    focusKind: null,
    dailyClaimedDay: null,
    firstTenPullDone: false,
    tierRewardsClaimed: [],
  };
}

export interface PresetState {
  /** Dungeon (or special dungeon) id -> the fighting loadout remembered for it; missing = none
   *  saved, picking the dungeon keeps the current loadout. */
  dungeons: Record<string, CardLoadout>;
}

export function initialPresets(): PresetState {
  return { dungeons: {} };
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

/** Milestone picks and the lifetime Money (DESIGN.md §4 Milestone picks, §9). */
export interface UpgradeState {
  /** Milestone id -> the perk option picked there. Kept through prestige. */
  picks: Record<string, string>;
  /** Money earned from dungeons (wage and purses) over every run; kept through prestige. */
  moneyEarned: Decimal;
}

export function initialUpgrades(): UpgradeState {
  return { picks: {}, moneyEarned: new Decimal(0) };
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

/** Production: only the forge is left (the camp has its own state). */
export interface ProductionState {
  /** The forge (DESIGN.md §4 The forge). Kept through prestige. */
  forge: ForgeState;
}

/** One farming slot of the camp: the material it farms and the tool card on it (either may be empty). */
export interface CampSlot {
  /** A wood or an ore id (`trees.json`, `mines.json`), or null = the first open one. */
  material: string | null;
  /** An axe (forest) or pickaxe (cave) card id, or null = nothing farms. */
  card: string | null;
}

/** The base camp (DESIGN.md section 2 Base camp). Kept through prestige. */
export interface CampState {
  /** The one camp level, at least 1. */
  level: number;
  /** The forest's slots in order; slots past the open count stay empty. */
  forest: CampSlot[];
  /** The cave's slots in order. */
  cave: CampSlot[];
}

/** The Training ground's dummy (DESIGN.md section 2 Test dummies). */
export interface DummyState {
  /** Damage per second the dummy deals to the team on trial. */
  damage: Decimal;
  /** The fighting cards on trial, one per loadout slot (null = empty). */
  team: (string | null)[];
}

export function initialDummy(content: Content): DummyState {
  return {
    damage: content.dummy.defaultDamage,
    team: Array<string | null>(LOADOUT_SLOTS).fill(null),
  };
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
   *  fighting loadout, left to right; duel.ts). Save format 27; it replaced the shared
   *  `loadoutDamage` pool. */
  cardDamage: Record<string, Decimal>;
  /** Team card ids knocked out on the floor being fought (DESIGN.md §6 card duel): they stay out
   *  until the floor is won, even when their max health rises meanwhile. Save format 27. */
  cardsOut: string[];
  /** The fighting wage earned since the last kill, by resource: paid out in a lump when an enemy
   *  dies, so Money comes only when something is won (DESIGN.md §3). Runtime only, not saved: a save
   *  loses at most the seconds since the last kill. */
  wageOwed?: Record<string, Decimal>;
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

/** Production as in a brand-new game. */
export function initialProduction(): ProductionState {
  return { forge: initialForge() };
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
/** A new game's camp: the start level, the starter axe on the first forest slot and the starter pickaxe on the first cave slot. */
export function initialCamp(content: Content): CampState {
  const camp: CampState = { level: content.camp.startLevel, forest: [], cave: [] };
  for (const id of content.cardRules.startCards) {
    const job = content.cardById.get(id)?.job;
    if (job === 'logging' && camp.forest.length === 0)
      camp.forest.push({ material: null, card: id });
    if (job === 'mining' && camp.cave.length === 0) camp.cave.push({ material: null, card: id });
  }
  return camp;
}

export function createInitialState(content: Content): GameState {
  const resources: Record<string, Decimal> = {};
  for (const resource of content.resources)
    resources[resource.id] = startingAmount(content, resource.id);

  return {
    resources,
    production: initialProduction(),
    camp: initialCamp(content),
    dummy: initialDummy(content),
    clearedDungeons: [],
    combat: initialCombat(),
    bursts: initialBursts(),
    activeDungeonId: content.dungeons[0]?.id ?? null,
    bossHp: null,
    pity: {},
    inventory: {},
    prestigeCount: 0,
    cardSkins: {},
    legacySkins: [],
    stats: { playTimeMs: 0, bossKills: 0, longestOfflineMs: 0 },
    achievements: {},
    quests: {},
    shardShop: {},
    account: initialAccount(),
    upgrades: initialUpgrades(),
    summon: initialSummon(),
    presets: initialPresets(),
    discoveredBonds: [],
    expeditions: initialExpeditions(),
    ascensionChallenges: initialAscensionChallenges(),
    heirlooms: initialHeirlooms(),
    cards: initialCards(content),
    mastery: initialMastery(),
    portals: {},
    prestige: initialPrestige(),
    cosmetics: {
      loadout: { slots: {}, cards: {} },
      owned: Object.fromEntries(
        [
          ...Object.values(content.starterBySlot),
          ...content.cosmetics.filter((c) => c.ownedAtStart),
        ].map((c) => [c.id, { level: 1, copies: 1 }]),
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
    camp: cloneCamp(state.camp),
    dummy: { damage: state.dummy.damage, team: [...state.dummy.team] },
    clearedDungeons: [...state.clearedDungeons],
    combat: cloneCombat(state.combat),
    bursts: cloneBursts(state.bursts),
    pity: { ...state.pity },
    inventory: { ...state.inventory },
    stats: { ...state.stats },
    cardSkins: { ...state.cardSkins },
    legacySkins: [...state.legacySkins],
    cards: cloneCards(state.cards),
    mastery: cloneMastery(state.mastery),
    portals: Object.fromEntries(Object.entries(state.portals).map(([id, p]) => [id, { ...p }])),
    achievements: { ...state.achievements },
    quests: Object.fromEntries(Object.entries(state.quests).map(([id, q]) => [id, { ...q }])),
    shardShop: { ...state.shardShop },
    upgrades: { picks: { ...state.upgrades.picks }, moneyEarned: state.upgrades.moneyEarned },
    summon: { ...state.summon, tierRewardsClaimed: [...state.summon.tierRewardsClaimed] },
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
    heirlooms: cloneHeirlooms(state.heirlooms),
    account: {
      ...state.account,
      skills: { ...state.account.skills },
      web: { ...state.account.web },
    },
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
  return { forge: { ...p.forge } };
}

export function cloneCamp(c: CampState): CampState {
  return {
    level: c.level,
    forest: c.forest.map((slot) => ({ ...slot })),
    cave: c.cave.map((slot) => ({ ...slot })),
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
    ...(c.wageOwed ? { wageOwed: { ...c.wageOwed } } : {}),
  };
}

export function clonePresets(p: PresetState): PresetState {
  return {
    dungeons: Object.fromEntries(
      Object.entries(p.dungeons).map(([id, l]) => [id, { slots: [...l.slots] }]),
    ),
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
/** A quest that is done: the play time (ms) it was done at, and whether its reward was claimed. */
export interface QuestProgress {
  doneAt: number;
  claimed: boolean;
}

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
  /** Skill web node id -> level bought (DESIGN.md §10 The skill web). */
  web: Record<string, number>;
  /** Free respecs used this run (reset on ascension). */
  freeRespecsUsed: number;
}

export function initialAccount(): AccountState {
  return { xp: new Decimal(0), level: 1, skills: {}, web: {}, freeRespecsUsed: 0 };
}

/** The fighting loadout: four equal slots, left to right (null = empty). Logging and mining
 *  cards work camp slots or the forge instead (DESIGN.md §5 Loadouts). */
export interface CardLoadout {
  /** Always LOADOUT_SLOTS entries. */
  slots: (string | null)[];
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

/** The fighting loadout's slots (DESIGN.md §5 Loadouts): back left, front left, front right,
 *  back right. */
export const LOADOUT_SLOTS = 4;
/** The two central slots are the front row; the outer two are the back row. */
export const FRONT_SLOTS: readonly number[] = [1, 2];
export const isFrontSlot = (slot: number): boolean => FRONT_SLOTS.includes(slot);

export function emptyCardLoadout(): CardLoadout {
  return { slots: Array<string | null>(LOADOUT_SLOTS).fill(null) };
}

/** A card as first obtained: Wood ★1, Lv 1, no XP, an empty star bar. */
export function newOwnedCard(tier: RankTier = 'wood'): OwnedCard {
  return {
    tier,
    stars: 1,
    level: 1,
    xp: new Decimal(0),
    starFill: 0,
    enhancements: [],
  };
}

/** A new game owns the start cards (cardRules.startCards); the fighting one takes the first slot
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
    if (card.job === 'fighting') cards.loadouts.fighting.slots[0] = id;
  }
  return cards;
}

export function cloneCards(c: CardState): CardState {
  const loadout = (l: CardLoadout): CardLoadout => ({ slots: [...l.slots] });
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
