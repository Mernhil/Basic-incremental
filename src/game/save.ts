import { z } from 'zod';
import { depthDef } from './depth';
import type { Content } from '../data';
import { MAX_STARS, RANK_TIERS, type Job } from '../data/schemas';
import { MIGRATIONS, migrateState, type MigrationTable } from './migrations';
import { Decimal, decimalToString, isDecimalString } from './num';
import { SaveError } from './saveError';
import { isDungeonUnlocked } from './combat';
import { parseStageKey } from './floors';
import {
  cloneBursts,
  cloneCards,
  cloneFloors,
  cloneHeirlooms,
  DIFFICULTIES,
  emptyCardLoadout,
  SUPPORT_SLOTS,
  type CardState,
  cloneProduction,
  clonePresets,
  cloneState,
  createInitialState,
  initialPresets,
  MAX_CHALLENGE_COMPLETIONS,
  PRESET_JOBS,
  PRESETS_PER_JOB,
  type GameState,
} from './state';
import { cosmeticMaxLevel, sanitizeLoadout, type CosmeticLoadout } from './theme';
import { cardTopTier, levelCap } from './cards';
import { addHeirloomShards, buyHeirloomNode } from './heirlooms';
import { isWeaponSkinAvailable } from './wardrobe';
import { fitSkillsToPoints } from './account';
import { isProductionGem, MAX_MASTERY_TIER, settleMastery } from './mastery';

export { SaveError } from './saveError';

/** Bump this (and add a migration) whenever the saved format changes. */
export const CURRENT_SAVE_VERSION = 31;

const decimalText = z.string().refine(isDecimalString, { message: 'not a valid number' });
const counts = z.record(z.string(), z.number().int().min(0));
const equippedSchema = z.object({ id: z.string(), level: z.number().int().min(1) });
const cardLoadoutSchema = z.object({
  main: z.string().nullable(),
  supports: z.array(z.string().nullable()),
});
const gaugeSchema = z.object({ gauge: z.number().min(0), timer: z.number().min(0) });
/** v26: stage key -> a count (kills, or chests paid). */
const stageCounts = z.record(z.string(), z.number().int().min(0));
/** v27: a production preset (DESIGN.md §15 Loadout presets). */
const productionPresetSchema = z.object({
  name: z.string(),
  workers: z.record(z.string(), z.array(z.string())),
});

/** The on-disk shape of GameState: Decimals as strings, nothing else special. */
export const serializedStateSchema = z.object({
  resources: z.record(z.string(), decimalText),
  production: z.object({
    unlockedTrees: z.array(z.string()),
    mineLevels: counts,
    /** v15. */
    treeLevels: counts,
    /** v26: workers, their harvest gauges, tool lines, depth and the forge (DESIGN.md §4). */
    workers: z.record(z.string(), z.array(z.string())),
    harvestGauges: z.record(z.string(), gaugeSchema),
    tools: counts,
    depth: z.record(
      z.string(),
      z.object({ layer: z.number().int().min(1), progress: decimalText }),
    ),
    forge: z.object({
      recipe: z.string().nullable(),
      progress: decimalText,
      worker: z.string().nullable(),
    }),
  }),
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
  /** v20: weapon kind -> chosen skin id. */
  weaponSkins: z.record(z.string(), z.string()),
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
      z.object({
        tier: z.enum(RANK_TIERS),
        stars: z.number().int().min(1).max(MAX_STARS),
        level: z.number().int().min(1),
        xp: decimalText,
        /** v18: the star bar fill (v17 and earlier held duplicates, spent on star-ups). */
        starFill: z.number().min(0),
        /** v13. */
        enhancements: z.array(z.string()),
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
  shardShop: counts,
  /** v13: account XP, level, account tree and respecs (DESIGN.md §10a). */
  account: z.object({
    xp: decimalText,
    level: z.number().int().min(1),
    skills: counts,
    freeRespecsUsed: z.number().int().min(0),
  }),
  /** v15: the upgrade shelf (DESIGN.md §4). */
  upgrades: z.object({ owned: z.array(z.string()), moneyEarned: decimalText }),
  /** v26: the autobuyer switches (DESIGN.md §15). */
  automation: z.object({
    treeLevels: z.boolean(),
    mineLevels: z.boolean(),
    reservePercent: z.number().min(0).max(100),
  }),
  /** v27: the table update (DESIGN.md §3, §7, §15). */
  summon: z.object({
    focusKind: z.string().nullable(),
    dailyClaimedDay: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  }),
  presets: z.object({
    dungeons: z.record(z.string(), cardLoadoutSchema),
    production: z.object({
      logging: z.array(productionPresetSchema.nullable()),
      mining: z.array(productionPresetSchema.nullable()),
    }),
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
    weaponSkins: { ...state.weaponSkins },
    legacySkins: [...state.legacySkins],
    stats: { ...state.stats },
    achievements: { ...state.achievements },
    shardShop: { ...state.shardShop },
    upgrades: {
      owned: [...state.upgrades.owned],
      moneyEarned: decimalToString(state.upgrades.moneyEarned),
    },
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
    heirlooms: cloneHeirlooms(state.heirlooms),
    account: {
      xp: decimalToString(state.account.xp),
      level: state.account.level,
      skills: { ...state.account.skills },
      freeRespecsUsed: state.account.freeRespecsUsed,
    },
    cards: {
      owned: Object.fromEntries(
        Object.entries(state.cards.owned).map(([id, c]) => [
          id,
          { ...c, xp: decimalToString(c.xp), enhancements: [...c.enhancements] },
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
  // The format 26 fields are rebuilt by deserializeWorkers once the cards are known.
  state.production = {
    ...base.production,
    unlockedTrees: saved.production.unlockedTrees.filter((id) => content.treeById.has(id)),
    mineLevels: Object.fromEntries(
      Object.entries(saved.production.mineLevels).filter(([id]) => content.mineById.has(id)),
    ),
    treeLevels: Object.fromEntries(
      Object.entries(saved.production.treeLevels).filter(([id]) => content.treeById.has(id)),
    ),
  };
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
  // Unknown legacy skins and repeats are dropped; then worn skins that no longer exist or are
  // no longer available (including legacy ones not owned) are dropped.
  state.legacySkins = [...new Set(saved.legacySkins)].filter((id) =>
    content.legacySkinById.has(id),
  );
  state.weaponSkins = Object.fromEntries(
    Object.entries(saved.weaponSkins).filter(([weapon, skin]) =>
      isWeaponSkinAvailable(state, content, weapon, skin),
    ),
  );
  state.stats = { ...saved.stats };
  // Unknown achievements and shop items (removed from the game) are dropped.
  const achievementIds = new Set(content.achievements.map((a) => a.id));
  state.achievements = Object.fromEntries(
    Object.entries(saved.achievements).filter(([id]) => achievementIds.has(id)),
  );
  // The ranks are fitted to the tree and the points earned at the end of loading (they need the
  // cards, the Ascension count and the achievements); there is no level cap.
  state.account = {
    xp: new Decimal(saved.account.xp),
    level: saved.account.level,
    skills: { ...saved.account.skills },
    freeRespecsUsed: saved.account.freeRespecsUsed,
  };
  const shopIds = new Set(content.shardShop.map((i) => i.id));
  state.shardShop = Object.fromEntries(
    Object.entries(saved.shardShop).filter(([id]) => shopIds.has(id)),
  );
  // Upgrades removed from the game are dropped.
  state.upgrades = {
    owned: saved.upgrades.owned.filter((id) => content.upgradeById.has(id)),
    moneyEarned: new Decimal(saved.upgrades.moneyEarned),
  };
  refundClampedTiers(state, saved.cards, content);
  state.cards = deserializeCards(saved.cards, content);
  deserializeWorkers(state, saved.production, content);
  state.automation = { ...saved.automation };
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
  return { state: deserializeState(parsed.data, content), savedAt: envelope.data.savedAt };
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
 * A card saved above its rarity's cap (the rarity caps came with the weapon base, save format 22)
 * is clamped by deserializeCards; the base price of every tier-up step it had paid beyond the cap
 * is paid back so nothing is lost. The Wood step was never paid (cards used to start at Bronze).
 */
function refundClampedTiers(
  state: GameState,
  saved: SerializedState['cards'],
  content: Content,
): void {
  for (const [id, c] of Object.entries(saved.owned)) {
    const card = content.cardById.get(id);
    if (!card) continue;
    const top = RANK_TIERS.indexOf(cardTopTier(content, id));
    const at = RANK_TIERS.indexOf(c.tier);
    for (let k = Math.max(top, 1); k < at; k++) {
      const step = RANK_TIERS[k]!;
      if (step === 'mythic' || step === 'heirloom') continue;
      for (const cost of content.cardRules.tierUp[step][card.job]) {
        state.resources[cost.resource] = (state.resources[cost.resource] ?? new Decimal(0)).add(
          cost.amount,
        );
      }
    }
  }
}

/**
 * Rebuilds the card collection: unknown cards are dropped, levels are kept within the rank's
 * cap, free stars are taken, and loadout slots holding an unknown, unowned, other-job or repeated card are emptied.
 */
function deserializeCards(saved: SerializedState['cards'], content: Content): CardState {
  const owned: CardState['owned'] = {};
  for (const [id, c] of Object.entries(saved.owned)) {
    if (!content.cardById.has(id)) continue;
    // A card above its rarity's cap (or at a closed Heirloom) is clamped to its top tier; its stars
    // and level stay (the tier-up costs of the removed steps are paid back in refundClampedTiers).
    const top = RANK_TIERS.indexOf(cardTopTier(content, id));
    const tier = RANK_TIERS.indexOf(c.tier) > top ? RANK_TIERS[top]! : c.tier;
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
  fighting.main = keep(saved.loadouts.fighting.main);
  for (let i = 0; i < SUPPORT_SLOTS; i++) {
    fighting.supports[i] = keep(saved.loadouts.fighting.supports[i]);
  }
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
      (c) => c.heirloom && c.item.kind === from.item.kind && c.rarity === from.rarity,
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
  state.summon = {
    focusKind: focusKind !== null && content.itemTypeByKind.has(focusKind) ? focusKind : null,
    dailyClaimedDay: saved.summon.dailyClaimedDay,
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
    fixed.main = keep(loadout.main);
    for (let i = 0; i < SUPPORT_SLOTS; i++) fixed.supports[i] = keep(loadout.supports[i]);
    dungeons[id] = fixed;
  }
  const production = initialPresets().production;
  for (const job of PRESET_JOBS) {
    const places = job === 'logging' ? content.treeById : content.mineById;
    for (let i = 0; i < PRESETS_PER_JOB; i++) {
      const preset = saved.presets.production[job][i];
      if (!preset) continue;
      const workers: Record<string, string[]> = {};
      for (const [place, cards] of Object.entries(preset.workers)) {
        if (!places.has(place)) continue;
        const kept = cards.filter((c) => owned(c) && content.cardById.get(c)?.job === job);
        if (kept.length > 0) workers[place] = kept;
      }
      production[job][i] = { name: preset.name, workers };
    }
  }
  state.presets = { dungeons, production };
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
 * Rebuilds the format 26 production fields (DESIGN.md §4 Workers): trees and mines that left the
 * game are dropped, and so is a worker that is unknown, not owned, of the wrong job (a mining
 * card on a tree, a logging card on a mine) or already working somewhere else (the first place
 * in save order keeps it, then the forge). Needs `state.cards` already rebuilt.
 */
function deserializeWorkers(
  state: GameState,
  saved: SerializedState['production'],
  content: Content,
): void {
  const jobOf = (producerId: string): Job | null =>
    content.treeById.has(producerId)
      ? 'logging'
      : content.mineById.has(producerId)
        ? 'mining'
        : null;
  const known = <T>(entries: Record<string, T>): [string, T][] =>
    Object.entries(entries).filter(([id]) => jobOf(id) !== null);
  const working = new Set<string>();
  const workers: Record<string, string[]> = {};
  for (const [producerId, cardIds] of Object.entries(saved.workers)) {
    const job = jobOf(producerId);
    if (!job) continue;
    const kept = cardIds.filter((id) => {
      if (!state.cards.owned[id] || content.cardById.get(id)?.job !== job || working.has(id))
        return false;
      working.add(id);
      return true;
    });
    if (kept.length > 0) workers[producerId] = kept;
  }
  const forgeWorker = saved.forge.worker;
  state.production.workers = workers;
  state.production.harvestGauges = Object.fromEntries(
    known(saved.harvestGauges).map(([id, g]) => [id, { ...g }]),
  );
  // Tool lines the content no longer has are dropped.
  state.production.tools = Object.fromEntries(
    Object.entries(saved.tools).filter(([id]) => content.production.tools.some((t) => t.id === id)),
  );
  state.production.depth = Object.fromEntries(
    known(saved.depth).map(([id, d]) => [
      id,
      {
        // a layer past the deepest one (a retuned tree) comes back to the deepest
        layer: Math.max(1, Math.min(d.layer, depthDef(content, id)?.names.length ?? 1)),
        progress: Decimal.max(new Decimal(d.progress), 0),
      },
    ]),
  );
  // A recipe that left the game is dropped with its progress; a forge worker is a production card.
  const recipe = content.production.forge.recipes.some((r) => r.id === saved.forge.recipe)
    ? saved.forge.recipe
    : null;
  state.production.forge = {
    recipe,
    progress: recipe ? new Decimal(saved.forge.progress) : new Decimal(0),
    worker:
      forgeWorker &&
      state.cards.owned[forgeWorker] &&
      content.cardById.get(forgeWorker)?.job !== 'fighting' &&
      !working.has(forgeWorker)
        ? forgeWorker
        : null,
  };
}

/** The on-disk shape of the production state: Decimals as strings. */
function serializeProduction(p: GameState['production']): SerializedState['production'] {
  const copy = cloneProduction(p);
  return {
    ...copy,
    depth: Object.fromEntries(
      Object.entries(copy.depth).map(([id, d]) => [
        id,
        { layer: d.layer, progress: decimalToString(d.progress) },
      ]),
    ),
    forge: { ...copy.forge, progress: decimalToString(copy.forge.progress) },
  };
}
