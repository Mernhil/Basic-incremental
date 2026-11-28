import { z } from 'zod';
import type { Content } from '../data';
import { CARD_GRADES, MAX_STARS, type CardGrade, type Job } from '../data/schemas';
import { MIGRATIONS, migrateState, type MigrationTable } from './migrations';
import { Decimal, decimalToString, isDecimalString } from './num';
import { SaveError } from './saveError';
import { isDungeonUnlocked } from './combat';
import { parseStageKey } from './floors';
import {
  cloneBursts,
  cloneCards,
  cloneFloors,
  cloneFarming,
  cloneHeirlooms,
  cloneRaids,
  DIFFICULTIES,
  emptyCardLoadout,
  LOADOUT_SLOTS,
  type CardState,
  cloneCamp,
  clonePresets,
  cloneState,
  createInitialState,
  MAX_CHALLENGE_COMPLETIONS,
  type FarmingState,
  type FarmPost,
  type GameState,
} from './state';
import { cosmeticMaxLevel, sanitizeLoadout, type CosmeticLoadout } from './theme';
import { arrangeSavedFormations, isStarterCard, levelCap } from './cards';
import { addHeirloomShards, buyHeirloomNode } from './heirlooms';
import { postXpNeed } from './farming';
import { settleTierRewards } from './tierRewards';
import { pruneCardSkins } from './cardSkins';
import { fitSkillsToPoints, fitWebToPoints } from './account';
import { isProductionGem, MAX_MASTERY_TIER, settleMastery } from './mastery';

export { SaveError } from './saveError';

/** Bump this (and add a migration) whenever the saved format changes. */
export const CURRENT_SAVE_VERSION = 48;

const decimalText = z.string().refine(isDecimalString, { message: 'not a valid number' });
const counts = z.record(z.string(), z.number().int().min(0));
const equippedSchema = z.object({ id: z.string(), level: z.number().int().min(1) });
/** v34: four equal slots, left to right (they were a main card and three supports). */
const cardLoadoutSchema = z.object({
  slots: z.array(z.string().nullable()),
});
const gaugeSchema = z.object({ gauge: z.number().min(0), timer: z.number().min(0) });
const campSlotSchema = z.object({ material: z.string().nullable(), card: z.string().nullable() });
/** v26: stage key -> a count (kills, or chests paid). */
const stageCounts = z.record(z.string(), z.number().int().min(0));
/** The on-disk shape of GameState: Decimals as strings, nothing else special. */
export const serializedStateSchema = z.object({
  /** Set by the v33 -> v34 migration only (never written): the loadouts have no formation yet. */
  arrangeFormation: z.boolean().optional(),
  resources: z.record(z.string(), decimalText),
  /** v42: only the forge is left of production (the camp has its own part). */
  production: z.object({
    forge: z.object({
      recipe: z.string().nullable(),
      progress: decimalText,
      worker: z.string().nullable(),
    }),
  }),
  /** v42: the base camp (DESIGN.md section 2): the level and the farming slots. */
  camp: z.object({
    level: z.number().int().min(1),
    forest: z.array(campSlotSchema),
    cave: z.array(campSlotSchema),
  }),
  /** v42: the Training ground's dummy: its damage and the team on trial. */
  dummy: z.object({ damage: decimalText, team: z.array(z.string().nullable()) }),
  clearedDungeons: z.array(z.string()),
  combat: z.object({
    /** v24: floors per dungeon and difficulty (DESIGN.md §6). */
    floors: z.record(
      z.string(),
      z.object({
        difficulty: z.enum(DIFFICULTIES),
        /** v27: auto-challenge (DESIGN.md §6). */
        autoChallenge: z.boolean(),
        tiers: z.partialRecord(
          z.enum(DIFFICULTIES),
          z.object({ floor: z.number().int().min(1), best: z.number().int().min(0) }),
        ),
      }),
    ),
    /** v25: training levels (DESIGN.md §6 Training). */
    training: counts,
    trialAttempt: z.object({ elapsedSeconds: z.number().min(0), dealt: decimalText }),
    /** The best share of the target's HP dealt: 1 is 100%; the score has no cap (DESIGN.md §6). */
    trialBest: z.record(z.string(), z.number().min(0).finite()),
    knockoutSeconds: z.number().min(0),
    /** v26: stage stars and overflow, keyed by `stageKey` (DESIGN.md §6). */
    stageKills: stageCounts,
    stageChests: stageCounts,
    overflow: z.record(z.string(), z.boolean()),
    /** v27: the enemy being fought, the running Challenge, the auto-challenge wait and each team
     *  card's damage (DESIGN.md §6). */
    enemyIndex: z.number().int().min(0),
    challenge: z
      .object({
        dungeonId: z.string(),
        difficulty: z.enum(DIFFICULTIES),
        elapsedSeconds: z.number().min(0),
      })
      .nullable(),
    challengeWaitSeconds: z.number().min(0),
    cardDamage: z.record(z.string(), decimalText),
    /** Format 27 (package 7 fix): the team cards knocked out on this floor. */
    cardsOut: z.array(z.string()).default([]),
  }),
  /** The fighting gauge. Format 26 saves written before the workers kept the old logging and
   *  mining gauges here too; parsing strips them (they moved to `production.harvestGauges`). */
  bursts: z.object({ fighting: gaugeSchema }),
  activeDungeonId: z.string().nullable(),
  bossHp: decimalText.nullable(),
  pity: counts,
  inventory: counts,
  prestigeCount: z.number().int().min(0),
  /** v33: card id -> the skin it wears (was per weapon kind in v20 to v32). */
  cardSkins: z.record(z.string(), z.string()),
  /** v21: owned legacy weapon skin ids. */
  legacySkins: z.array(z.string()),
  cosmetics: z.object({
    loadout: z.object({
      slots: z.record(z.string(), equippedSchema),
      cards: z.record(z.string(), z.record(z.string(), equippedSchema)),
    }),
    owned: z.record(
      z.string(),
      z.object({ level: z.number().int().min(1), copies: z.number().int().min(0) }),
    ),
  }),
  cards: z.object({
    owned: z.record(
      z.string(),
      // v39: no tier. A card's tier is its own (DESIGN.md §5 No tier-ups) and is read from the card.
      z.object({
        stars: z.number().int().min(1).max(MAX_STARS),
        level: z.number().int().min(1),
        xp: decimalText,
        /** v18: the star bar fill (v17 and earlier held duplicates, spent on star-ups). */
        starFill: z.number().min(0),
        /** v13. */
        enhancements: z.array(z.string()),
        /** v41: the skill was opened with Cores (DESIGN.md §2 Three attacks per card). */
        skillOpen: z.boolean().default(false),
        /** v42: the starter weapon's seals broken (DESIGN.md §2 Starter weapon). */
        seal: z.number().int().min(0).optional(),
      }),
    ),
    /** Only fighting has a loadout; the old logging and mining ones are stripped on parse
     *  (their main cards became workers in the format 26 migration). */
    loadouts: z.object({ fighting: cardLoadoutSchema }),
    shards: z.number().int().min(0),
    /** v26: cards marked to hunt (DESIGN.md §7 Wishlist). */
    wishlist: z.array(z.string()),
  }),
  stats: z.object({
    playTimeMs: z.number().min(0),
    bossKills: z.number().int().min(0),
    /** v12. */
    longestOfflineMs: z.number().min(0),
  }),
  /** v12: achievement id -> play time when unlocked, and shard shop purchases. */
  achievements: z.record(z.string(), z.number().min(0)),
  /** v34: quest id -> when it was done and whether its reward was claimed (DESIGN.md §10 Quests). */
  quests: z.record(z.string(), z.object({ doneAt: z.number().min(0), claimed: z.boolean() })),
  shardShop: counts,
  /** v13: account XP, level, account tree and respecs (DESIGN.md §10a). */
  account: z.object({
    xp: decimalText,
    level: z.number().int().min(1),
    skills: counts,
    /** v38: the skill web's levels (DESIGN.md §10 The skill web). */
    web: counts,
    freeRespecsUsed: z.number().int().min(0),
  }),
  /** v34: milestone picks (DESIGN.md §4) and the lifetime Money (v15). */
  upgrades: z.object({ picks: z.record(z.string(), z.string()), moneyEarned: decimalText }),
  /** v27: the table update (DESIGN.md §3, §7, §15). */
  summon: z.object({
    focusKind: z.string().nullable(),
    dailyClaimedDay: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    /** v40: the first 10-pull's Gold is given, and the tier completion rewards paid. */
    firstTenPullDone: z.boolean(),
    tierRewardsClaimed: z.array(z.string()),
  }),
  /** v42: the starter weapon's pick (DESIGN.md §2 Starter weapon). */
  starter: z.object({ done: z.boolean(), skippable: z.boolean() }),
  /** v44: raid tries, best scores and the ladder rewards paid (DESIGN.md §2 Raid bosses). */
  raids: z
    .object({
      day: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      used: z.record(z.string(), z.number().int().min(0)),
      best: z.record(z.string(), z.number().min(0).finite()),
      paid: z.record(z.string(), z.number().int().min(1)),
      level: z.record(z.string(), z.number().int().min(0)).default({}),
    })
    .default({ day: null, used: {}, best: {}, paid: {}, level: {} }),
  presets: z.object({
    dungeons: z.record(z.string(), cardLoadoutSchema),
  }),
  discoveredBonds: z.array(z.string()),
  expeditions: z.object({
    trips: z.array(
      z.object({
        cardId: z.string(),
        placeId: z.string(),
        hours: z.number().positive(),
        elapsedSeconds: z.number().min(0),
      }),
    ),
    completed: z.number().int().min(0).default(0),
  }),
  ascensionChallenges: z.object({
    active: z.string().nullable(),
    completions: counts,
  }),
  /** v30: the Heirloom Gate, Heirloom shards and trees (DESIGN.md §7, §10). */
  heirlooms: z.object({
    shards: counts,
    pity: z.number().int().min(0),
    pulls: z.number().int().min(0),
    trees: z.record(z.string(), z.array(z.string())),
  }),
  /** v48: farming posts (DESIGN.md §2 A team farms a finished dungeon). */
  farming: z
    .object({
      posts: z.record(
        z.string(),
        z.object({
          team: z.array(z.string().nullable()),
          level: z.number().int().min(1),
          xp: z.number().min(0).finite(),
          traits: z.array(z.string()),
          rerolls: z.number().int().min(0),
          upgrade: z.number().int().min(0),
          carry: z.record(z.string(), z.number().min(0).finite()),
        }),
      ),
    })
    .default({ posts: {} }),
  /** v30 migration only: the Heirlooms the cards had at the Heirloom tier, made into cards on load. */
  heirloomMigration: z
    .array(z.object({ card: z.string(), stars: z.number().int(), level: z.number().int() }))
    .optional(),
  /** v8. Tiers are missing in saves migrated from v7; loading settles them from the totals. */
  mastery: z.object({
    harvested: z.record(z.string(), decimalText),
    gemTiers: counts.optional(),
    bossTiers: counts.optional(),
  }),
  /** v9: pull counters per portal (DESIGN.md §7). */
  portals: z.record(
    z.string(),
    z.object({
      pity: z.number().int().min(0),
      pulls: z.number().int().min(0),
      pityHits: z.number().int().min(0),
    }),
  ),
  /** v10: Ascension (DESIGN.md §9). */
  prestige: z.object({
    runStart: z.record(z.string(), decimalText),
    shop: counts,
    starlightEarned: decimalText,
    /** v46: the floor each tier's run started on (Starlight from progress). */
    runFloors: z.record(z.string(), z.number().int().min(0)).default({}),
  }),
});
export type SerializedState = z.infer<typeof serializedStateSchema>;

const envelopeSchema = z.object({
  version: z.number().int(),
  savedAt: z.number().finite(),
  state: z.unknown(),
});

export interface LoadedSave {
  state: GameState;
  /** Epoch ms of when the save was written; used for offline progress. */
  savedAt: number;
}

export function serializeState(state: GameState): SerializedState {
  const resources: Record<string, string> = {};
  for (const [id, value] of Object.entries(state.resources)) resources[id] = decimalToString(value);
  return {
    resources,
    production: serializeProduction(state.production),
    camp: cloneCamp(state.camp),
    dummy: { damage: decimalToString(state.dummy.damage), team: [...state.dummy.team] },
    clearedDungeons: [...state.clearedDungeons],
    combat: {
      floors: cloneFloors(state.combat.floors),
      training: { ...state.combat.training },
      trialAttempt: {
        elapsedSeconds: state.combat.trialAttempt.elapsedSeconds,
        dealt: decimalToString(state.combat.trialAttempt.dealt),
      },
      trialBest: { ...state.combat.trialBest },
      knockoutSeconds: state.combat.knockoutSeconds,
      stageKills: { ...state.combat.stageKills },
      stageChests: { ...state.combat.stageChests },
      overflow: { ...state.combat.overflow },
      enemyIndex: state.combat.enemyIndex,
      challenge: state.combat.challenge ? { ...state.combat.challenge } : null,
      challengeWaitSeconds: state.combat.challengeWaitSeconds,
      cardDamage: Object.fromEntries(
        Object.entries(state.combat.cardDamage).map(([id, d]) => [id, decimalToString(d)]),
      ),
      cardsOut: [...state.combat.cardsOut],
    },
    bursts: cloneBursts(state.bursts),
    activeDungeonId: state.activeDungeonId,
    bossHp: state.bossHp ? decimalToString(state.bossHp) : null,
    pity: { ...state.pity },
    inventory: { ...state.inventory },
    prestigeCount: state.prestigeCount,
    cardSkins: { ...state.cardSkins },
    legacySkins: [...state.legacySkins],
    stats: { ...state.stats },
    achievements: { ...state.achievements },
    quests: Object.fromEntries(Object.entries(state.quests).map(([id, q]) => [id, { ...q }])),
    shardShop: { ...state.shardShop },
    upgrades: {
      picks: { ...state.upgrades.picks },
      moneyEarned: decimalToString(state.upgrades.moneyEarned),
    },
    summon: { ...state.summon },
    starter: { ...state.starter },
    raids: cloneRaids(state.raids),
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
    farming: cloneFarming(state.farming),
    account: {
      xp: decimalToString(state.account.xp),
      level: state.account.level,
      skills: { ...state.account.skills },
      web: { ...state.account.web },
      freeRespecsUsed: state.account.freeRespecsUsed,
    },
    cards: {
      owned: Object.fromEntries(
        Object.entries(state.cards.owned).map(([id, c]) => [
          id,
          {
            stars: c.stars,
            level: c.level,
            xp: decimalToString(c.xp),
            starFill: c.starFill,
            enhancements: [...c.enhancements],
            skillOpen: c.skillOpen,
            ...(c.seal !== undefined ? { seal: c.seal } : {}),
          },
        ]),
      ),
      loadouts: cloneCards(state.cards).loadouts,
      shards: state.cards.shards,
      wishlist: [...state.cards.wishlist],
    },
    mastery: {
      harvested: Object.fromEntries(
        Object.entries(state.mastery.harvested).map(([id, v]) => [id, decimalToString(v)]),
      ),
      gemTiers: { ...state.mastery.gemTiers },
      bossTiers: { ...state.mastery.bossTiers },
    },
    portals: Object.fromEntries(Object.entries(state.portals).map(([id, p]) => [id, { ...p }])),
    prestige: {
      runStart: Object.fromEntries(
        Object.entries(state.prestige.runStart).map(([id, v]) => [id, decimalToString(v)]),
      ),
      shop: { ...state.prestige.shop },
      starlightEarned: decimalToString(state.prestige.starlightEarned),
      runFloors: { ...state.prestige.runFloors },
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

/** Rebuilds a GameState; resources added to the content since the save are filled in at 0. */
export function deserializeState(saved: SerializedState, content: Content): GameState {
  const base = createInitialState(content);
  const state = cloneState(base);
  for (const [id, text] of Object.entries(saved.resources)) {
    if (content.resourceById.has(id)) state.resources[id] = new Decimal(text);
  }
  // Unknown ids (removed from the game) are dropped.
  state.clearedDungeons = saved.clearedDungeons.filter(
    (id) => content.dungeonById.has(id) || content.trialById.has(id),
  );
  // The forge is rebuilt by deserializeForge once the cards are known; the camp by deserializeCamp.
  state.production = { ...base.production };
  state.combat = {
    // Dungeons that left the game are dropped; a floor past a dungeon's last is read back inside
    // its range (floors.ts `floorPosition`).
    floors: cloneFloors(
      Object.fromEntries(
        Object.entries(saved.combat.floors).filter(([id]) => content.dungeonById.has(id)),
      ),
    ),
    // Training lines that left the game are dropped.
    training: Object.fromEntries(
      Object.entries(saved.combat.training).filter(([id]) => content.trainingById.has(id)),
    ),
    trialAttempt: {
      elapsedSeconds: saved.combat.trialAttempt.elapsedSeconds,
      dealt: new Decimal(saved.combat.trialAttempt.dealt),
    },
    trialBest: { ...saved.combat.trialBest },
    knockoutSeconds: saved.combat.knockoutSeconds,
    // Stages of dungeons that left the game (and keys that are not stage keys) are dropped; a
    // chest count stays within the six star levels.
    stageKills: knownStages(saved.combat.stageKills, content),
    stageChests: Object.fromEntries(
      Object.entries(knownStages(saved.combat.stageChests, content)).map(([key, paid]) => [
        key,
        Math.min(paid, STAGE_STAR_LEVELS),
      ]),
    ),
    overflow: knownStages(saved.combat.overflow, content),
    enemyIndex: saved.combat.enemyIndex,
    // A Challenge in a dungeon that left the game is dropped (back to farming).
    challenge:
      saved.combat.challenge && content.dungeonById.has(saved.combat.challenge.dungeonId)
        ? { ...saved.combat.challenge }
        : null,
    challengeWaitSeconds: saved.combat.challengeWaitSeconds,
    // Damage is kept only for owned fighting cards (checked once the cards are rebuilt).
    cardDamage: Object.fromEntries(
      Object.entries(saved.combat.cardDamage).map(([id, d]) => [id, new Decimal(d)]),
    ),
    cardsOut: [...saved.combat.cardsOut],
  };
  state.bursts = cloneBursts(saved.bursts);
  const active = saved.activeDungeonId;
  state.activeDungeonId =
    active === null ||
    ((content.dungeonById.has(active) || content.trialById.has(active)) &&
      isDungeonUnlocked(state, content, active))
      ? active
      : base.activeDungeonId;
  state.bossHp = saved.bossHp ? new Decimal(saved.bossHp) : null;
  state.pity = { ...saved.pity };
  state.inventory = { ...saved.inventory };
  state.prestigeCount = saved.prestigeCount;
  // Unknown legacy skins and repeats are dropped; worn skins that are no longer wearable are
  // dropped once the cards are rebuilt.
  state.legacySkins = [...new Set(saved.legacySkins)].filter((id) =>
    content.legacySkinById.has(id),
  );
  state.cardSkins = { ...saved.cardSkins }; // pruned once the cards are rebuilt
  state.stats = { ...saved.stats };
  // Unknown achievements and shop items (removed from the game) are dropped.
  const achievementIds = new Set(content.achievements.map((a) => a.id));
  state.achievements = Object.fromEntries(
    Object.entries(saved.achievements).filter(([id]) => achievementIds.has(id)),
  );
  // Unknown quests (removed from the game) are dropped.
  state.quests = Object.fromEntries(
    Object.entries(saved.quests)
      .filter(([id]) => content.questById.has(id))
      .map(([id, q]) => [id, { ...q }]),
  );
  // The ranks are fitted to the tree and the points earned at the end of loading (they need the
  // cards, the Ascension count and the achievements); there is no level cap.
  state.account = {
    xp: new Decimal(saved.account.xp),
    level: saved.account.level,
    skills: { ...saved.account.skills },
    web: { ...saved.account.web },
    freeRespecsUsed: saved.account.freeRespecsUsed,
  };
  const shopIds = new Set(content.shardShop.map((i) => i.id));
  state.shardShop = Object.fromEntries(
    Object.entries(saved.shardShop).filter(([id]) => shopIds.has(id)),
  );
  // Picks of milestones or perks no longer in the game are dropped.
  state.upgrades = {
    picks: Object.fromEntries(
      Object.entries(saved.upgrades.picks).filter(
        ([m, o]) => content.perkOptionById.get(o)?.milestone.id === m,
      ),
    ),
    moneyEarned: new Decimal(saved.upgrades.moneyEarned),
  };
  state.cards = deserializeCards(saved.cards, content);
  pruneCardSkins(state, content);
  deserializeForge(state, saved.production, content);
  deserializeCamp(state, saved, content);
  deserializeTableUpdate(state, saved, content);
  deserializeHeirlooms(state, saved, content);
  deserializeMastery(state, saved.mastery, content);
  // Counters of portals removed from the game are dropped.
  const portalIds = new Set(content.portals.map((p) => p.id));
  state.portals = Object.fromEntries(
    Object.entries(saved.portals)
      .filter(([id]) => portalIds.has(id))
      .map(([id, p]) => [id, { ...p }]),
  );
  // Unknown gems and shop items are dropped; shop levels stay within the item's max.
  state.prestige = {
    runStart: Object.fromEntries(
      Object.entries(saved.prestige.runStart)
        .filter(([id]) => isProductionGem(content, id))
        .map(([id, v]) => [id, new Decimal(v)]),
    ),
    shop: Object.fromEntries(
      Object.entries(saved.prestige.shop).flatMap(([id, level]) => {
        const item = content.prestige.shop.find((i) => i.id === id);
        return item && level > 0 ? [[id, Math.min(level, item.maxLevel)]] : [];
      }),
    ),
    starlightEarned: new Decimal(saved.prestige.starlightEarned),
    runFloors: { ...saved.prestige.runFloors },
  };
  // Unknown ids (removed from the game) are dropped; starters are always owned.
  const owned: GameState['cosmetics']['owned'] = { ...base.cosmetics.owned };
  for (const [id, entry] of Object.entries(saved.cosmetics.owned)) {
    const cosmetic = content.cosmeticById.get(id);
    if (cosmetic)
      owned[id] = {
        level: Math.min(entry.level, cosmeticMaxLevel(content, cosmetic)),
        copies: entry.copies,
      };
  }
  state.cosmetics = {
    loadout: sanitizeLoadout(content, saved.cosmetics.loadout as CosmeticLoadout),
    owned,
  };
  // Last, because the points and the open rings and circles read the rest of the state.
  state.account.skills = fitSkillsToPoints(state, content, state.account.skills);
  state.account.web = fitWebToPoints(state, content);
  return state;
}

/** The text written to disk: a versioned envelope around the serialized state. */
export function createSaveText(state: GameState, savedAtMs: number): string {
  return JSON.stringify({
    version: CURRENT_SAVE_VERSION,
    savedAt: savedAtMs,
    state: serializeState(state),
  });
}

/** Parses, migrates and validates save text. Throws SaveError with a player-safe message. */
export function readSave(
  text: string,
  content: Content,
  migrations: MigrationTable = MIGRATIONS,
): LoadedSave {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SaveError('invalid-json', 'The save is not valid JSON (the file may be corrupted).');
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new SaveError('invalid-format', 'The save is missing its version or timestamp.');
  }

  const migrated = migrateState(
    envelope.data.state,
    envelope.data.version,
    CURRENT_SAVE_VERSION,
    migrations,
  );
  const parsed = serializedStateSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join('.') : 'state';
    throw new SaveError('invalid-format', `The save data is invalid at "${where}".`);
  }
  const state = deserializeState(parsed.data, content);
  // a save from before the formation had no positions: the strongest cards go to the front
  if (parsed.data.arrangeFormation) arrangeSavedFormations(state, content);
  // a save that had completed a tier before the reward existed is paid now
  settleTierRewards(state, content);
  return { state, savedAt: envelope.data.savedAt };
}

export interface BestSave {
  save: LoadedSave | null;
  source: 'primary' | 'backup' | 'none';
  /** One message per file that existed but could not be read. */
  errors: string[];
}

/** Tries the main save, then the backup. A missing file is not an error; a corrupt one is. */
export function loadBestSave(
  primary: string | null,
  backup: string | null,
  content: Content,
): BestSave {
  const errors: string[] = [];
  const attempts = [
    ['primary', primary],
    ['backup', backup],
  ] as const;
  for (const [source, text] of attempts) {
    if (text === null) continue;
    try {
      return { save: readSave(text, content), source, errors };
    } catch (error) {
      if (!(error instanceof SaveError)) throw error;
      errors.push(`${source === 'primary' ? 'Save' : 'Backup'}: ${error.message}`);
    }
  }
  return { save: null, source: 'none', errors };
}

// ---- Export / import as a text string ----

const EXPORT_PREFIX = 'BIv1:';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** A single copy-pasteable line containing the whole save. */
export function exportSaveString(state: GameState, savedAtMs: number): string {
  return EXPORT_PREFIX + toBase64(createSaveText(state, savedAtMs));
}

/** Decodes and fully validates an exported string. Throws SaveError if it is not a good save. */
export function importSaveString(
  input: string,
  content: Content,
  migrations: MigrationTable = MIGRATIONS,
): LoadedSave {
  const compact = input.replace(/\s+/g, '');
  if (!compact.startsWith(EXPORT_PREFIX)) {
    throw new SaveError('invalid-export', 'This is not an exported save string.');
  }
  let text: string;
  try {
    text = fromBase64(compact.slice(EXPORT_PREFIX.length));
  } catch {
    throw new SaveError('invalid-export', 'The save string is damaged or incomplete.');
  }
  return readSave(text, content, migrations);
}

/**
 * Rebuilds mastery: totals of unknown or non-gem resources are dropped, tiers are kept within
 * 0..4 for known gems and dungeons. A save without tiers (migrated from v7) settles them from
 * the totals and kills, silently.
 */
function deserializeMastery(
  state: GameState,
  saved: SerializedState['mastery'],
  content: Content,
): void {
  const harvested: GameState['mastery']['harvested'] = {};
  for (const [id, text] of Object.entries(saved.harvested)) {
    if (isProductionGem(content, id)) harvested[id] = new Decimal(text);
  }
  const keep = (tiers: Record<string, number>, known: (id: string) => boolean, top: number) =>
    Object.fromEntries(
      Object.entries(tiers)
        .filter(([id, tier]) => known(id) && tier > 0)
        .map(([id, tier]) => [id, Math.min(tier, top)]),
    );
  state.mastery = {
    harvested,
    gemTiers: keep(
      saved.gemTiers ?? {},
      (id) => isProductionGem(content, id),
      content.progression.gemMastery.thresholds.length,
    ),
    // Dungeons have stage stars instead of medals (DESIGN.md §6): only the special dungeons'
    // medals are kept.
    bossTiers: keep(saved.bossTiers ?? {}, (id) => content.trialById.has(id), MAX_MASTERY_TIER),
  };
  if (!saved.gemTiers || !saved.bossTiers) settleMastery(state, content);
}

/**
 * Rebuilds the card collection: unknown cards are dropped, levels are kept within the rank's
 * cap, free stars are taken, and loadout slots holding an unknown, unowned, other-job or repeated card are emptied.
 */
function deserializeCards(saved: SerializedState['cards'], content: Content): CardState {
  const owned: CardState['owned'] = {};
  for (const [id, c] of Object.entries(saved.owned)) {
    const card = content.cardById.get(id);
    if (!card) continue;
    // A card's tier is its own (DESIGN.md §5 No tier-ups): it is read from the card, never from
    // the save.
    const tier = card.tier;
    const cap = levelCap(content, { tier, stars: c.stars });
    const level = Math.min(c.level, cap);
    owned[id] = {
      tier,
      stars: c.stars,
      level,
      xp: level >= cap ? new Decimal(0) : new Decimal(c.xp),
      starFill: c.starFill,
      // Unknown options are dropped (the budget is checked when choosing, not on load).
      enhancements: c.enhancements.filter((o) =>
        content.enhancements.cards[id]?.some((x) => x.id === o),
      ),
      skillOpen: c.skillOpen,
      // A seal only holds a starter card, and no further than its last step.
      ...(c.seal !== undefined &&
      c.seal <= content.starters.seals.length &&
      isStarterCard(content, id)
        ? { seal: c.seal }
        : {}),
    };
  }
  const seen = new Set<string>();
  const keep = (id: string | null | undefined): string | null => {
    if (!id || !owned[id] || content.cardById.get(id)?.job !== 'fighting' || seen.has(id)) {
      return null;
    }
    seen.add(id);
    return id;
  };
  const fighting = emptyCardLoadout();
  for (let i = 0; i < LOADOUT_SLOTS; i++)
    fighting.slots[i] = keep(saved.loadouts.fighting.slots[i]);
  const loadouts: CardState['loadouts'] = { fighting };
  // Unknown cards and repeats are dropped from the wishlist; a marked card need not be owned.
  const wishlist = [...new Set(saved.wishlist)].filter((id) => content.cardById.has(id));
  return { owned, loadouts, shards: saved.shards, wishlist };
}

/**
 * Rebuilds the Heirlooms (save format 30): shards and trees of known Heirloom cards only, a tree
 * keeping the known nodes it can still pay for in the order bought. A save migrated from format 29
 * gets the Heirloom cards its Heirloom-tier cards had (DESIGN.md §5 How a save's Heirlooms move
 * over): the card of the same type and side, at the same stars and its level up to 140; when two
 * cards give one Heirloom, the one with more stars sets them and each star of the other becomes
 * the shards that star costs (its unlock and stars). Needs `state.cards` already rebuilt.
 */
function deserializeHeirlooms(state: GameState, saved: SerializedState, content: Content): void {
  const isHeirloom = (id: string): boolean => content.cardById.get(id)?.heirloom === true;
  const shards: Record<string, number> = {};
  for (const [id, n] of Object.entries(saved.heirlooms.shards)) {
    if (isHeirloom(id) && n > 0) shards[id] = n;
  }
  state.heirlooms = {
    shards,
    pity: saved.heirlooms.pity,
    pulls: saved.heirlooms.pulls,
    trees: {},
  };
  const gate = content.heirlooms.gate;
  const moved = [...(saved.heirloomMigration ?? [])].sort((a, b) => b.stars - a.stars);
  for (const entry of moved) {
    const from = content.cardById.get(entry.card);
    if (!from) continue;
    const target = content.cards.find(
      (c) => c.heirloom && !c.batch && c.item.kind === from.item.kind,
    );
    if (!target) continue;
    const stars = Math.max(1, Math.min(MAX_STARS, entry.stars));
    if (!state.cards.owned[target.id]) {
      const cap = levelCap(content, { tier: 'heirloom', stars });
      state.cards.owned[target.id] = {
        tier: 'heirloom',
        stars,
        level: Math.max(1, Math.min(entry.level, cap)),
        xp: new Decimal(0),
        starFill: 0,
        enhancements: [],
        skillOpen: false,
      };
    } else {
      const worth =
        gate.unlockShards + gate.starShards.slice(0, stars - 1).reduce((a, b) => a + b, 0);
      addHeirloomShards(state, content, target.id, worth);
    }
  }
  // Trees last: the points read the Heirloom cards' stars and levels.
  for (const [id, nodes] of Object.entries(saved.heirlooms.trees)) {
    const tree = content.heirloomTreeByCard.get(id);
    if (!tree || !state.cards.owned[id]) continue;
    for (const node of nodes) {
      const bought = buyHeirloomNode(state, content, id, node);
      if (bought.ok) state.heirlooms.trees[id] = bought.state.heirlooms.trees[id]!;
    }
  }
}

/**
 * Rebuilds the format 27 state of the table update. Unknown ids (cards, dungeons, item types,
 * bonds, places, challenges that left the game) are dropped, so a later package can rely on every
 * saved id existing. Needs `state.cards` and `state.production.workers` already rebuilt.
 */
function deserializeTableUpdate(state: GameState, saved: SerializedState, content: Content): void {
  const owned = (id: string | null): boolean => id !== null && state.cards.owned[id] !== undefined;
  const isFighting = (id: string): boolean =>
    owned(id) && content.cardById.get(id)?.job === 'fighting';
  state.combat.cardDamage = Object.fromEntries(
    Object.entries(state.combat.cardDamage).filter(([id]) => isFighting(id)),
  );
  state.combat.cardsOut = [...new Set(state.combat.cardsOut.filter(isFighting))];
  const focusKind = saved.summon.focusKind;
  state.starter = { ...saved.starter };
  state.raids = {
    day: saved.raids.day,
    used: { ...saved.raids.used },
    best: { ...saved.raids.best },
    paid: { ...saved.raids.paid },
    level: { ...saved.raids.level },
  };
  state.summon = {
    focusKind: focusKind !== null && content.itemTypeByKind.has(focusKind) ? focusKind : null,
    dailyClaimedDay: saved.summon.dailyClaimedDay,
    firstTenPullDone: saved.summon.firstTenPullDone,
    tierRewardsClaimed: [
      ...new Set(
        saved.summon.tierRewardsClaimed.filter((g) => CARD_GRADES.includes(g as CardGrade)),
      ),
    ],
  };
  // A remembered loadout keeps only owned fighting cards, each once, in the loadout's shape.
  const dungeons: GameState['presets']['dungeons'] = {};
  for (const [id, loadout] of Object.entries(saved.presets.dungeons)) {
    if (!content.dungeonById.has(id) && !content.trialById.has(id)) continue;
    const seen = new Set<string>();
    const keep = (card: string | null | undefined): string | null => {
      if (!card || !isFighting(card) || seen.has(card)) return null;
      seen.add(card);
      return card;
    };
    const fixed = emptyCardLoadout();
    for (let i = 0; i < LOADOUT_SLOTS; i++) fixed.slots[i] = keep(loadout.slots[i]);
    dungeons[id] = fixed;
  }
  state.presets = { dungeons };
  state.discoveredBonds = [...new Set(saved.discoveredBonds)].filter((id) =>
    content.bondById.has(id),
  );
  // A trip of an unknown or unowned card, to an unknown place or of an unknown length is dropped;
  // a card goes on one trip at a time.
  const travelling = new Set<string>();
  state.expeditions = {
    trips: saved.expeditions.trips
      .filter((t) => {
        const ok =
          owned(t.cardId) &&
          !travelling.has(t.cardId) &&
          content.expeditions.places.some((p) => p.id === t.placeId) &&
          content.expeditions.durationsHours.includes(t.hours);
        if (ok) travelling.add(t.cardId);
        return ok;
      })
      .map((t) => ({ ...t })),
    completed: saved.expeditions.completed,
  };
  state.farming = loadFarming(saved.farming, state, content);
  const challengeIds = new Set(content.challenges.map((c) => c.id));
  const active = saved.ascensionChallenges.active;
  state.ascensionChallenges = {
    active: active !== null && challengeIds.has(active) ? active : null,
    completions: Object.fromEntries(
      Object.entries(saved.ascensionChallenges.completions)
        .filter(([id, n]) => challengeIds.has(id) && n > 0)
        .map(([id, n]) => [id, Math.min(n, MAX_CHALLENGE_COMPLETIONS)]),
    ),
  };
}

/**
 * Farming posts of a save (DESIGN.md §2 A team farms a finished dungeon): posts of unknown
 * dungeons go; a team keeps only owned fighting cards that sit in one team only (the fighting
 * loadout wins) and are not away; level, traits and upgrade stay inside their ranges.
 */
function loadFarming(
  saved: { posts: Record<string, FarmPost> },
  state: GameState,
  content: Content,
): FarmingState {
  const config = content.farming;
  const used = new Set<string>(
    state.cards.loadouts.fighting.slots.filter((id): id is string => id !== null),
  );
  for (const trip of state.expeditions.trips) used.add(trip.cardId);
  const posts: Record<string, FarmPost> = {};
  for (const [dungeonId, p] of Object.entries(saved.posts)) {
    if (!content.dungeonById.has(dungeonId)) continue;
    const team = Array.from({ length: LOADOUT_SLOTS }, (_, i) => {
      const id = p.team[i] ?? null;
      const card = id === null ? undefined : content.cardById.get(id);
      if (id === null || !card || card.job !== 'fighting' || !state.cards.owned[id] || used.has(id))
        return null;
      used.add(id);
      return id;
    });
    const level = Math.min(config.level.max, Math.max(1, p.level));
    const traits: string[] = [];
    for (const id of p.traits) {
      if (config.traits.some((t) => t.id === id) && !traits.includes(id)) traits.push(id);
    }
    traits.length = Math.min(traits.length, Math.floor(level / config.level.traitEvery));
    posts[dungeonId] = {
      team,
      level,
      xp: level >= config.level.max ? 0 : Math.min(p.xp, postXpNeed(config, level)),
      traits,
      rerolls: p.rerolls,
      upgrade: Math.min(p.upgrade, config.upgrade.maxLevel),
      carry: Object.fromEntries(Object.entries(p.carry).map(([k, v]) => [k, Math.min(v, 1)])),
    };
  }
  return { posts };
}

/** Star levels a stage has (DESIGN.md §6 Stage stars): a chest count never goes past this. */
const STAGE_STAR_LEVELS = 6;

/** The entries whose key is a stage key of a dungeon in the game. */
function knownStages<T>(entries: Record<string, T>, content: Content): Record<string, T> {
  return Object.fromEntries(
    Object.entries(entries).filter(([key]) => {
      const stage = parseStageKey(key);
      return stage !== null && content.dungeonById.has(stage.dungeonId);
    }),
  );
}

/**
 * Rebuilds the forge: a recipe that left the game is dropped with its progress, and a forge worker
 * must be an owned production card (`deserializeCamp` then takes it from the forge if a camp slot
 * holds the same card).
 */
function deserializeForge(
  state: GameState,
  saved: SerializedState['production'],
  content: Content,
): void {
  const forgeWorker = saved.forge.worker;
  const recipe = content.production.forge.recipes.some((r) => r.id === saved.forge.recipe)
    ? saved.forge.recipe
    : null;
  state.production.forge = {
    recipe,
    progress: recipe ? new Decimal(saved.forge.progress) : new Decimal(0),
    worker:
      forgeWorker &&
      state.cards.owned[forgeWorker] &&
      content.cardById.get(forgeWorker)?.job !== 'fighting'
        ? forgeWorker
        : null,
  };
}

/**
 * Rebuilds the camp and the dummy: the level at least 1; a slot's material that left the game, or a
 * card that is unknown, not owned, of the wrong job or already on another slot (the first slot in
 * save order keeps it) is dropped, and the forge's worker leaves a slot it shares. Needs
 * `state.cards` and the forge already rebuilt.
 */
function deserializeCamp(state: GameState, saved: SerializedState, content: Content): void {
  const working = new Set<string>();
  const slots = (
    list: { material: string | null; card: string | null }[],
    job: Job,
  ): { material: string | null; card: string | null }[] => {
    const materials = job === 'logging' ? content.treeById : content.mineById;
    return list.map((slot) => {
      const card =
        slot.card &&
        state.cards.owned[slot.card] &&
        content.cardById.get(slot.card)?.job === job &&
        !working.has(slot.card)
          ? slot.card
          : null;
      if (card) working.add(card);
      return {
        material: slot.material && materials.has(slot.material) ? slot.material : null,
        card,
      };
    });
  };
  state.camp = {
    level: Math.max(1, saved.camp.level),
    forest: slots(saved.camp.forest, 'logging'),
    cave: slots(saved.camp.cave, 'mining'),
  };
  if (state.production.forge.worker && working.has(state.production.forge.worker)) {
    state.production.forge.worker = null;
  }
  const team: (string | null)[] = Array<string | null>(LOADOUT_SLOTS).fill(null);
  const seen = new Set<string>();
  saved.dummy.team.slice(0, LOADOUT_SLOTS).forEach((id, i) => {
    if (
      id &&
      state.cards.owned[id] &&
      content.cardById.get(id)?.job === 'fighting' &&
      !seen.has(id)
    ) {
      seen.add(id);
      team[i] = id;
    }
  });
  state.dummy = {
    damage: Decimal.min(Decimal.max(new Decimal(saved.dummy.damage), 0), content.dummy.maxDamage),
    team,
  };
}

/** The on-disk shape of the production state: Decimals as strings. */
function serializeProduction(p: GameState['production']): SerializedState['production'] {
  return { forge: { ...p.forge, progress: decimalToString(p.forge.progress) } };
}
