import { z } from 'zod';
import type { Content } from '../data';
import { JOBS, MAX_STARS, RANK_TIERS } from '../data/schemas';
import { MIGRATIONS, migrateState, type MigrationTable } from './migrations';
import { Decimal, decimalToString, isDecimalString } from './num';
import { SaveError } from './saveError';
import { isDungeonUnlocked } from './combat';
import {
  cloneBursts,
  cloneCards,
  emptyCardLoadout,
  SUPPORT_SLOTS,
  type CardState,
  cloneProduction,
  cloneState,
  createInitialState,
  type GameState,
} from './state';
import { cosmeticMaxLevel, sanitizeLoadout, type CosmeticLoadout } from './theme';
import { levelCap } from './cards';
import { isWeaponSkinAvailable } from './wardrobe';
import { isProductionGem, MAX_MASTERY_TIER, settleMastery } from './mastery';

export { SaveError } from './saveError';

/** Bump this (and add a migration) whenever the saved format changes. */
export const CURRENT_SAVE_VERSION = 21;

const decimalText = z.string().refine(isDecimalString, { message: 'not a valid number' });
const counts = z.record(z.string(), z.number().int().min(0));
const equippedSchema = z.object({ id: z.string(), level: z.number().int().min(1) });
const cardLoadoutSchema = z.object({
  main: z.string().nullable(),
  supports: z.array(z.string().nullable()),
});
const gaugeSchema = z.object({ gauge: z.number().min(0), timer: z.number().min(0) });

/** The on-disk shape of GameState: Decimals as strings, nothing else special. */
export const serializedStateSchema = z.object({
  resources: z.record(z.string(), decimalText),
  production: z.object({
    unlockedTrees: z.array(z.string()),
    mineLevels: counts,
    /** v15. */
    treeLevels: counts,
  }),
  clearedDungeons: z.array(z.string()),
  combat: z.object({
    kills: counts,
    trialAttempt: z.object({ elapsedSeconds: z.number().min(0), dealt: decimalText }),
    trialBest: z.record(z.string(), z.number().min(0).max(1)),
    loadoutDamage: decimalText,
    knockoutSeconds: z.number().min(0),
  }),
  bursts: z.object({ fighting: gaugeSchema, logging: gaugeSchema, mining: gaugeSchema }),
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
    loadouts: z.object({
      mining: cardLoadoutSchema,
      logging: cardLoadoutSchema,
      fighting: cardLoadoutSchema,
    }),
    shards: z.number().int().min(0),
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
    production: cloneProduction(state.production),
    clearedDungeons: [...state.clearedDungeons],
    combat: {
      kills: { ...state.combat.kills },
      trialAttempt: {
        elapsedSeconds: state.combat.trialAttempt.elapsedSeconds,
        dealt: decimalToString(state.combat.trialAttempt.dealt),
      },
      trialBest: { ...state.combat.trialBest },
      loadoutDamage: decimalToString(state.combat.loadoutDamage),
      knockoutSeconds: state.combat.knockoutSeconds,
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
  for (const [id, text] of Object.entries(saved.resources)) state.resources[id] = new Decimal(text);
  // Unknown ids (removed from the game) are dropped.
  state.clearedDungeons = saved.clearedDungeons.filter(
    (id) => content.dungeonById.has(id) || content.trialById.has(id),
  );
  state.production = {
    unlockedTrees: saved.production.unlockedTrees.filter((id) => content.treeById.has(id)),
    mineLevels: Object.fromEntries(
      Object.entries(saved.production.mineLevels).filter(([id]) => content.mineById.has(id)),
    ),
    treeLevels: Object.fromEntries(
      Object.entries(saved.production.treeLevels).filter(([id]) => content.treeById.has(id)),
    ),
  };
  state.combat = {
    kills: { ...saved.combat.kills },
    trialAttempt: {
      elapsedSeconds: saved.combat.trialAttempt.elapsedSeconds,
      dealt: new Decimal(saved.combat.trialAttempt.dealt),
    },
    trialBest: { ...saved.combat.trialBest },
    loadoutDamage: new Decimal(saved.combat.loadoutDamage),
    knockoutSeconds: saved.combat.knockoutSeconds,
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
  // Unknown tree nodes are dropped; ranks stay within the node's max; the level within the max.
  const skills: Record<string, number> = {};
  for (const [id, rank] of Object.entries(saved.account.skills)) {
    const node = content.account.tree.find((n) => n.id === id);
    if (node && rank > 0) skills[id] = Math.min(rank, node.maxRank);
  }
  state.account = {
    xp: new Decimal(saved.account.xp),
    level: Math.min(saved.account.level, content.account.levels.maxLevel),
    skills,
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
  state.cards = deserializeCards(saved.cards, content);
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
  const keep = (tiers: Record<string, number>, known: (id: string) => boolean) =>
    Object.fromEntries(
      Object.entries(tiers)
        .filter(([id, tier]) => known(id) && tier > 0)
        .map(([id, tier]) => [id, Math.min(tier, MAX_MASTERY_TIER)]),
    );
  state.mastery = {
    harvested,
    gemTiers: keep(saved.gemTiers ?? {}, (id) => isProductionGem(content, id)),
    bossTiers: keep(
      saved.bossTiers ?? {},
      (id) => content.dungeonById.has(id) || content.trialById.has(id),
    ),
  };
  if (!saved.gemTiers || !saved.bossTiers) settleMastery(state, content);
}

/**
 * Rebuilds the card collection: unknown cards are dropped, levels are kept within the rank's
 * cap, and loadout slots holding an unknown, unowned, other-job or repeated card are emptied.
 */
function deserializeCards(saved: SerializedState['cards'], content: Content): CardState {
  const owned: CardState['owned'] = {};
  for (const [id, c] of Object.entries(saved.owned)) {
    if (!content.cardById.has(id)) continue;
    // Unique is open only to cards with a unique version.
    const tier = c.tier === 'unique' && !content.cardById.get(id)?.evolution ? 'prismatic' : c.tier;
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
  const loadouts = {} as CardState['loadouts'];
  for (const job of JOBS) {
    const seen = new Set<string>();
    const keep = (id: string | null | undefined): string | null => {
      if (!id || !owned[id] || content.cardById.get(id)?.job !== job || seen.has(id)) return null;
      seen.add(id);
      return id;
    };
    const loadout = emptyCardLoadout();
    loadout.main = keep(saved.loadouts[job].main);
    for (let i = 0; i < SUPPORT_SLOTS; i++)
      loadout.supports[i] = keep(saved.loadouts[job].supports[i]);
    loadouts[job] = loadout;
  }
  return { owned, loadouts, shards: saved.shards };
}
