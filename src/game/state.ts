import type { BurstJob, Content, Job, ProductionJob, RankTier } from '../data';
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
  /** Plots, slots, unlocked tree kinds and mine levels. See production.ts. */
  production: ProductionState;
  /** Dungeons cleared at least once. Kept through prestige; clearing one unlocks mine types. */
  clearedDungeons: string[];
  /** Damage upgrades, kills per dungeon and the Glimmer Trial attempt. See combat.ts. */
  combat: CombatState;
  /** Burst gauges: fighting (signature attack) and harvest bursts for logging and mining. */
  bursts: Record<BurstJob, BurstGauge>;
  /** Dungeon (or special dungeon) being auto-fought, or null. */
  activeDungeonId: string | null;
  /** Current boss HP; null means "spawn a fresh boss on the next tick". */
  bossHp: Decimal | null;
  /** Boss id -> consecutive kills without the rare drop (pity counter). */
  pity: Record<string, number>;
  /** Rare item id -> count owned. */
  inventory: Record<string, number>;
  prestigeCount: number;
  stats: GameStats;
  cosmetics: CosmeticState;
  /** Owned cards, the loadout of each job and shards. See cards.ts. */
  cards: CardState;
  /** Gem mastery totals and settled mastery tiers (DESIGN.md 16). Kept through prestige. */
  mastery: MasteryState;
  /** Portal id -> pull counters (DESIGN.md 6). Kept through prestige; missing = no pulls yet. */
  portals: Record<string, PortalCounters>;
  /** Ascension (DESIGN.md 3): the run's start, Starlight shop levels and Starlight earned. */
  prestige: PrestigeState;
  /** Achievement id -> play time (ms) when it unlocked. Kept through prestige. */
  achievements: Record<string, number>;
  /** Shard shop item id -> purchases made. */
  shardShop: Record<string, number>;
  /** Account XP, level, account tree and respecs. */
  account: AccountState;
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
 * Mastery (DESIGN.md 16, E2 and E3). Tiers are settled on the same 1 s play-time grid as card
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

/** One production job (logging plots or mining slots). */
export interface JobProductionState {
  /** Plots/slots bought on top of the job's start count. Reset on prestige. */
  expansions: number;
  /** What runs in each plot/slot, by index; null = empty. May be shorter than the capacity
   *  (missing entries are empty); entries at or past the capacity are idle. */
  plots: (string | null)[];
}

export interface ProductionState {
  logging: JobProductionState;
  mining: JobProductionState;
  /** Tree kinds bought with wood (start kinds are always unlocked). Kept through prestige. */
  unlockedTrees: string[];
  /** Mine id -> level bought with ore. Reset on prestige. */
  mineLevels: Record<string, number>;
}

export interface CombatState {
  /** Damage upgrade line id -> level bought with ore. Kept through prestige. */
  damageLevels: Record<string, number>;
  /** Dungeon id -> boss kills, ever. */
  kills: Record<string, number>;
  /** The running special-dungeon attempt (only meaningful while a trial is active). */
  trialAttempt: TrialAttempt;
  /** Special dungeon id -> best score, 0..1. */
  trialBest: Record<string, number>;
  /** Damage the fighting loadout's health pool has taken (0 = full health; DESIGN.md 11.10). */
  loadoutDamage: Decimal;
  /** Seconds left of a knockout; while above 0 the loadout does not fight. */
  knockoutSeconds: number;
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
    damageLevels: {},
    kills: {},
    trialAttempt: { elapsedSeconds: 0, dealt: new Decimal(0) },
    trialBest: {},
    loadoutDamage: new Decimal(0),
    knockoutSeconds: 0,
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
export function initialProduction(content: Content): ProductionState {
  const job = (key: ProductionJob): JobProductionState => {
    const config = content.production[key];
    return {
      expansions: 0,
      plots: Array<string | null>(config.startPlots).fill(config.startProducer),
    };
  };
  return { logging: job('logging'), mining: job('mining'), unlockedTrees: [], mineLevels: {} };
}

/** What a resource holds at the start of a game or of a run (Money starts with a little; DESIGN.md 11.13). */
export function startingAmount(content: Content, resourceId: string): Decimal {
  return content.resourceById.get(resourceId)?.startAmount ?? new Decimal(0);
}

export function createInitialState(content: Content): GameState {
  const resources: Record<string, Decimal> = {};
  for (const resource of content.resources)
    resources[resource.id] = startingAmount(content, resource.id);

  return {
    resources,
    production: initialProduction(content),
    clearedDungeons: [],
    combat: initialCombat(),
    bursts: initialBursts(),
    activeDungeonId: content.dungeons[0]?.id ?? null,
    bossHp: null,
    pity: {},
    inventory: {},
    prestigeCount: 0,
    stats: { playTimeMs: 0, bossKills: 0, longestOfflineMs: 0 },
    achievements: {},
    shardShop: {},
    account: initialAccount(),
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
    cards: cloneCards(state.cards),
    mastery: cloneMastery(state.mastery),
    portals: Object.fromEntries(Object.entries(state.portals).map(([id, p]) => [id, { ...p }])),
    achievements: { ...state.achievements },
    shardShop: { ...state.shardShop },
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
    logging: { expansions: p.logging.expansions, plots: [...p.logging.plots] },
    mining: { expansions: p.mining.expansions, plots: [...p.mining.plots] },
    unlockedTrees: [...p.unlockedTrees],
    mineLevels: { ...p.mineLevels },
  };
}

export function cloneCombat(c: CombatState): CombatState {
  return {
    damageLevels: { ...c.damageLevels },
    kills: { ...c.kills },
    trialAttempt: { ...c.trialAttempt },
    trialBest: { ...c.trialBest },
    loadoutDamage: c.loadoutDamage,
    knockoutSeconds: c.knockoutSeconds,
  };
}

export function cloneBursts(b: Record<BurstJob, BurstGauge>): Record<BurstJob, BurstGauge> {
  return { fighting: { ...b.fighting }, logging: { ...b.logging }, mining: { ...b.mining } };
}

/** One owned card (DESIGN.md 11.9). Each card is owned once; further copies are duplicates. */
export interface OwnedCard {
  tier: RankTier;
  /** 1..6 within the tier. */
  stars: number;
  /** 1 up to the level cap of the rank. */
  level: number;
  /** XP towards the next level (0 at the level cap). */
  xp: Decimal;
  /** Extra copies held, spent on star-ups. */
  duplicates: number;
  /** Chosen card enhancement option ids (DESIGN.md 10b). */
  enhancements: string[];
}

/** The account (DESIGN.md 10a, 16 E7). Kept through prestige. */
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
  /** From duplicates gained once a card is Prismatic ★6 (11.9). */
  shards: number;
}

export const SUPPORT_SLOTS = 3;

export function emptyCardLoadout(): CardLoadout {
  return { main: null, supports: Array<string | null>(SUPPORT_SLOTS).fill(null) };
}

/** A card as first obtained: Bronze ★1, Lv 1, no XP or duplicates. */
export function newOwnedCard(): OwnedCard {
  return {
    tier: 'bronze',
    stars: 1,
    level: 1,
    xp: new Decimal(0),
    duplicates: 0,
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
  };
}
