import { z } from 'zod';
import { Decimal, isDecimalString } from '../game/num';

/** A number written as a string in data files ("500", "1e12"), parsed to a Decimal. */
const decimal = z
  .string()
  .refine(isDecimalString, { message: 'must be a number string such as "100" or "1.5e12"' })
  .transform((s) => new Decimal(s));

const positiveDecimal = decimal.refine((d) => d.gt(0), { message: 'must be greater than 0' });

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lowercase snake_case, e.g. "oak_gem"');
const name = z.string().min(1);
const tier = z.number().int().min(1);

/**
 * Resource kinds (DESIGN.md §4, §7). Three loops: `tree_gem` / `mine_gem` / `material` come from
 * production and dungeon cores and pay for card upgrades; `currency` (Money) comes from boss kills
 * and pays for tree and mine levels, the upgrade shelf and tier-ups; `crystal` (Summon / Glamour Crystal)
 * is the premium tier that pays for summons and is kept through an ascension; `prestige`
 * (Starlight) is the prestige currency, kept too.
 */
export const RESOURCE_KINDS = [
  'tree_gem',
  'mine_gem',
  'material',
  'currency',
  'crystal',
  'prestige',
] as const;

/** A colour as #rrggbb. */
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/, 'colours are #rrggbb in lowercase');
/** Four tones, light to dark (DESIGN.md §12, cel and facet shading). */
const tones = z.tuple([hexColor, hexColor, hexColor, hexColor]);

export const GEM_SHAPES = ['round', 'pentagon', 'star', 'square', 'hexagon', 'drop'] as const;
export const GEM_PATTERNS = ['grain', 'rings', 'swirl', 'veins'] as const;
/** How a production gem is drawn: its outline says which one, its carving where it comes from. */
export const gemArtSchema = z.strictObject({
  shape: z.enum(GEM_SHAPES),
  pattern: z.enum(GEM_PATTERNS),
  colors: tones,
});

export const resourceSchema = z.strictObject({
  id,
  name,
  kind: z.enum(RESOURCE_KINDS),
  tier,
  /** Art for tree and mine gems (required for those kinds, not allowed for others). */
  gem: gemArtSchema.optional(),
  /** Amount a brand-new game starts with (default 0). Money starts with enough for the first
   *  damage levels (DESIGN.md §3). */
  startAmount: decimal.optional(),
});

const costSchema = z.strictObject({ resource: id, amount: positiveDecimal });

/**
 * An exponential price: the n-th purchase (0-based) costs base * growth^n of `resource`.
 * Read through the modifier pipeline: growth via `cost.growth`, the result via `cost.multiplier`.
 */
export const costCurveSchema = z.strictObject({
  resource: id,
  base: positiveDecimal,
  growth: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
});

/** Shared by trees (logging) and mines (mining). Each unlocked one produces once. */
const producerFields = {
  id,
  name,
  tier,
  /** Resource id this producer yields. */
  resource: id,
  /** Output per second at level 0. */
  baseRate: positiveDecimal,
};

/**
 * Level milestones (DESIGN.md §4): every `every` levels the line's output is multiplied by
 * `multiplier` (x2 every 25 levels to start). Per line, so milestones can differ later.
 */
export const milestoneSchema = z.strictObject({
  every: z.number().int().min(1),
  multiplier: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
});
export type Milestones = z.output<typeof milestoneSchema>;

/**
 * Levels of a tree kind or mine type, bought with Money and reset on prestige. Each level adds
 * `ratePercent`% output and every `milestones.every` levels multiplies it (DESIGN.md §4).
 */
export const producerLevelSchema = z.strictObject({
  cost: costCurveSchema,
  /** Percent output per level, read through `production.levelBonus`. */
  ratePercent: decimal.refine((d) => d.gte(0), { message: 'must not be negative' }),
  /** Output multiplier every N levels. */
  milestones: milestoneSchema,
});

export const treeSchema = z.strictObject({
  ...producerFields,
  /** Gems paid once to unlock this tree kind (kept through prestige). Empty = unlocked from the start. */
  unlockCost: z.array(costSchema),
  /** Tree levels (DESIGN.md §4), bought with Money and reset on prestige. */
  level: producerLevelSchema,
  /** Tree colours, themed to its gem: canopy and bark, light to dark. */
  art: z.strictObject({ leaf: tones, bark: tones }),
});

export const mineSchema = z.strictObject({
  ...producerFields,
  /** Dungeon whose clear unlocks this mine type; null = available from the start. */
  unlockedByDungeon: id.nullable(),
  /** Mine levels, bought with Money and reset on prestige. */
  level: producerLevelSchema,
});

/** How a production main card strikes (DESIGN.md §4): a look and a rhythm, never extra output. */
export const HARVEST_STYLES = ['steady', 'chop', 'flurry', 'volley'] as const;
export type HarvestStyle = (typeof HARVEST_STYLES)[number];
/** Which unlocked kinds a strike lands on: the next one in turn, a random one, or every one. */
export const HARVEST_TARGETING = ['sweep', 'random', 'all'] as const;
export type HarvestTargeting = (typeof HARVEST_TARGETING)[number];

export const harvestPatternSchema = z.strictObject({
  /** Name of the strike's look, for the stage to pick an animation. */
  style: z.enum(HARVEST_STYLES),
  /** Seconds in one cycle. */
  intervalSeconds: z.number().positive(),
  /** Strikes in one cycle, spread evenly over it. */
  strikes: z.number().int().min(1).max(8),
  targeting: z.enum(HARVEST_TARGETING),
});
export type HarvestPattern = z.output<typeof harvestPatternSchema>;

export const productionSchema = z.strictObject({
  harvest: z.strictObject({
    /** Pattern of a job with no main card. */
    default: z.strictObject({ logging: harvestPatternSchema, mining: harvestPatternSchema }),
    /** Base harvest crit (the `harvest.*` stats change it). 0 keeps the output exactly as before. */
    crit: z.strictObject({
      chance: z.number().min(0).max(1),
      damage: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
    }),
  }),
});

export const JOBS = ['mining', 'logging', 'fighting'] as const;
export const RARITIES = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'exotic',
  'void',
] as const;
export type Rarity = (typeof RARITIES)[number];
export type Job = (typeof JOBS)[number];

// ---- modifiers ---------------------------------------------------------------------------------

/**
 * Every tunable number in the game. Each one is computed by the modifier pipeline
 * (src/game/modifiers.ts) from a base value plus modifiers from skill trees, owned items, sets,
 * cards and prestige. Add a stat here before data can target it.
 */
export const STATS = [
  /** Output per second of one plot/slot. Scope: job, producer, resource. */
  'production.rate',
  /** Damage per second dealt to bosses. Scope: dungeon. */
  'combat.damage',
  /** Boss max HP. Scope: dungeon. */
  'combat.bossHp',
  /** Chance per kill of the rare drop (clamped to 0..1). Scope: dungeon. */
  'drops.rareChance',
  /** Kills without the rare drop before it is guaranteed (rounded, at least 1). Scope: dungeon. */
  'drops.pityThreshold',
  /** Units per kill of one currency a dungeon drops (Money or a crystal). Scope: dungeon,
   *  resource. */
  'drops.currencyAmount',
  /** Offline progress cap in hours. */
  'offline.capHours',
  /** Account XP gained. Scope: job. */
  'xp.account',
  /** Card XP gained. Scope: job. */
  'xp.card',
  /** Loadout cost cap. Scope: job. */
  'loadout.costCap',
  /** Summons without the pity rarity before it is guaranteed. Scope: portal. */
  'summon.pityThreshold',
  /** Multiplier on resource costs (1 = normal price). Scope: job, producer, resource. */
  'cost.multiplier',
  /** Growth factor of exponential prices (tree and mine levels; at least 1).
   *  Scope: job, producer, resource. */
  'cost.growth',
  /** Percent output each mine level adds. Scope: job, producer, resource. */
  'production.levelBonus',
  /** Chance per kill of the material (Core) drop (clamped to 0..1). Scope: dungeon, resource. */
  'drops.materialChance',
  /** Material units per material drop (floored, at least 0). Scope: dungeon, resource. */
  'drops.materialAmount',
  /** Seconds between hits (fighting) or harvest ticks (logging, mining), above 0. Scope: job. */
  'burst.interval',
  /** Gauge points needed to fire a burst (at least 1). Scope: job. */
  'burst.size',
  /** Gauge points each hit / tick adds (at least 0). Supports raise it. Scope: job. */
  'burst.fill',
  /** Burst strength: fighting = damage as a multiple of one hit; logging / mining = seconds of
   *  the job's output harvested at once. Scope: job. */
  'burst.power',
  /** Chance a logging / mining harvest strike crits (clamped to 0..1, base 0). Scope: job. */
  'harvest.critChance',
  /** Output multiplier of a harvest crit (at least 1). Scope: job. */
  'harvest.critDamage',
  /** Special dungeon reward units per score tier reached (floored). Scope: dungeon, resource. */
  'trial.reward',
  /** Fighting loadout health pool (DESIGN.md §6): the sum of the cards' health. Scope: dungeon. */
  'combat.health',
  /** Percent of boss damage blocked (0 by default, clamped to 0..90). Scope: dungeon. */
  'combat.defence',
  /** Chance a hit or signature attack crits (clamped to 0..1). Scope: dungeon. */
  'combat.critChance',
  /** Damage multiplier of a crit (at least 1). Scope: dungeon. */
  'combat.critDamage',
  /** Multiplier on the crystals (Summon and Glamour) of each kill, base 1; a fraction is rounded
   *  up with that chance, so the average is exact (DESIGN.md §6). Scope: dungeon, resource. */
  'drops.crystalMultiplier',
  /** Multiplier on the Money of each kill, base 1 (fraction rounded like the crystals).
   *  Scope: dungeon, resource. */
  'drops.moneyMultiplier',
  /** Starlight an ascension grants, before rounding down (DESIGN.md §9). */
  'prestige.gain',
  /** Strength of the support effects of a job's cards, base 1 (+25% = 1.25): scales the values of
   *  their modifiers (DESIGN.md §4). Only read from upgrades. Scope: job. */
  'card.supportPower',
] as const;
export type Stat = (typeof STATS)[number];

/**
 * How a modifier combines. Applied in this fixed order:
 * base -> flat (summed) -> percent (summed, then applied once) -> mult (multiplied together)
 * -> set (last one wins, replaces the value) -> min / max (floors and caps).
 */
export const MODIFIER_KINDS = ['flat', 'percent', 'mult', 'set', 'min', 'max'] as const;
export type ModifierKind = (typeof MODIFIER_KINDS)[number];

/** Narrows a modifier to part of the game. Every key given must match; none = applies everywhere. */
export const modifierScopeSchema = z.strictObject({
  job: z.enum(JOBS).optional(),
  producer: z.string().optional(),
  resource: z.string().optional(),
  dungeon: z.string().optional(),
  portal: z.string().optional(),
});
export type ModifierScope = z.output<typeof modifierScopeSchema>;

export const modifierSchema = z.strictObject({
  stat: z.enum(STATS),
  kind: z.enum(MODIFIER_KINDS),
  /** "5" with kind percent = +5%; "2" with kind mult = x2; "-1" with kind flat = -1. */
  value: decimal,
  scope: modifierScopeSchema.optional(),
});
export type ModifierData = z.output<typeof modifierSchema>;

/** Card tiers, lowest first. Unique is open only to cards with a unique version (DESIGN.md §5). */
export const RANK_TIERS = ['bronze', 'silver', 'gold', 'prismatic', 'unique'] as const;
export const MAX_STARS = 6;
export const rankSchema = z.strictObject({
  tier: z.enum(RANK_TIERS),
  stars: z.number().int().min(1).max(MAX_STARS),
});
export type Rank = z.output<typeof rankSchema>;

/**
 * A card modifier: a normal modifier plus how it grows with the card's power (level, stars and
 * tier, see cardRules.json). `full` multiplies the bonus by the power (flat and percent values;
 * for mult, the part above 1); `none` keeps it fixed. Default: `full` for flat and percent,
 * `none` for the rest (mult, set, min, max).
 */
export const CARD_SCALES = ['full', 'none'] as const;
export type CardScale = (typeof CARD_SCALES)[number];
export const cardModifierSchema = modifierSchema
  .extend({ scale: z.enum(CARD_SCALES).optional() })
  .transform((m) => ({
    ...m,
    scale: m.scale ?? (m.kind === 'flat' || m.kind === 'percent' ? 'full' : 'none'),
  }));
export type CardModifierData = z.output<typeof cardModifierSchema>;

const cardEffectSchema = z.strictObject({
  /** Player-facing summary, e.g. "Fast hits every 0.5 s". */
  description: z.string().min(1),
  modifiers: z.array(cardModifierSchema).default([]),
});
export type CardEffect = z.output<typeof cardEffectSchema>;

/**
 * A collectible card (DESIGN.md §5). Every card can lead its job (`main`) or sit in one of
 * its 3 support slots (`support`); only the effect of the slot it is in applies.
 */
/** Card elements (DESIGN.md §12): each picks the card's element effect. */
export const ELEMENTS = ['fire', 'storm', 'light', 'nature', 'earth', 'crystal', 'void'] as const;
export type CardElement = (typeof ELEMENTS)[number];
/** The signature item drawn inside a card (DESIGN.md §12); its detail grows with the card's rarity. */
export const ITEM_KINDS = [
  'sword',
  'twin_blades',
  'greatsword',
  'hatchet',
  'staff',
  'maul',
  'bow',
  'pickaxe',
  'chisel',
  'geode_hammer',
  'gauntlet',
] as const;

/** Unique items (DESIGN.md §12, §5): drawn in place of a card's generic item at the Unique tier. */
export const UNIQUE_ITEM_KINDS = ['flameblade', 'rootbloom_staff', 'soul_reaper'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export type UniqueItemKind = (typeof UNIQUE_ITEM_KINDS)[number];

export const cardSchema = z.strictObject({
  id,
  name,
  job: z.enum(JOBS),
  rarity: z.enum(RARITIES),
  element: z.enum(ELEMENTS),
  item: z.strictObject({ kind: z.enum(ITEM_KINDS), name }),
  /** Unique item that replaces `item` at the Unique tier (progression.json). Having one is what
   *  opens the Unique tier for the card; none = the card stops at Prismatic. */
  evolution: z.enum(UNIQUE_ITEM_KINDS).optional(),
  /** Used when the card leads its job's loadout. Logging and mining mains also set how it
   *  strikes (`harvest`, DESIGN.md §4). */
  main: cardEffectSchema.extend({ harvest: harvestPatternSchema.optional() }),
  /** Used when the card is in one of the 3 support slots. */
  support: cardEffectSchema,
});

const count = z.number().int().min(0);
const atLeastOne = decimal.refine((d) => d.gte(1), { message: 'must be at least 1' });
const perTier = <T extends z.ZodType>(schema: T) =>
  z.strictObject({
    bronze: schema,
    silver: schema,
    gold: schema,
    prismatic: schema,
    unique: schema,
  });
const perRarity = <T extends z.ZodType>(schema: T) =>
  z.strictObject({
    common: schema,
    rare: schema,
    epic: schema,
    legendary: schema,
    mythic: schema,
    exotic: schema,
    void: schema,
  });
const perJob = <T extends z.ZodType>(schema: T) =>
  z.strictObject({ mining: schema, logging: schema, fighting: schema });

/** Card progression numbers (cardRules.json; DESIGN.md §5). All tunable. */
export const cardRulesSchema = z.strictObject({
  /** Cards a new game owns at Bronze ★1 Lv 1, each leading its job (at most one per job). */
  startCards: z.array(id),
  /** Loadout cost of a card, by rarity (11.4). */
  cost: perRarity(count),
  /** Each job's cost cap before `loadout.costCap` modifiers: base + perLevel × (account level − 1). */
  costCap: z.strictObject({ base: count, perLevel: count }),
  /** Level cap of each tier (Unique 100); stars do not change it (DESIGN.md §5). */
  levelCaps: perTier(z.number().int().min(1)),
  /** XP from level L to L + 1 = base × growth^(L − 1). */
  xpCurve: z.strictObject({ base: positiveDecimal, growth: atLeastOne }),
  /**
   * Fighting cards (DESIGN.md §5): XP per second fought (not while knocked out) = perSecond ×
   * tierGrowth^(dungeon tier − 1), plus XP per boss kill = perKill × tierGrowth^(dungeon tier −
   * 1). The special dungeon pays the tier 1 per-second rate. Production cards: XP per unit
   * harvested, per job. All go through `xp.card` (scope: job).
   */
  xp: z.strictObject({
    perSecond: positiveDecimal,
    perKill: positiveDecimal,
    tierGrowth: atLeastOne,
    perUnit: z.strictObject({ logging: decimal, mining: decimal }),
  }),
  /**
   * Card power, which scales `full` card modifiers and the main growth:
   * (1 + perLevel × (level − 1)) × (1 + perStar × (stars − 1), + star6Bonus at ★6) × tier.
   * Base damage and health use the star multiplier instead of the perStar part:
   * (1 + perLevel × (level − 1)) × starMultiplier[stars − 2] (1 at ★1) × tier.
   */
  power: z.strictObject({
    perLevel: z.number().min(0),
    perStar: z.number().min(0),
    star6Bonus: z.number().min(0),
    /** Multiplier of base damage and health at ★2 … ★6 (DESIGN.md §5 star impact). */
    starMultiplier: z.array(z.number().positive()).length(MAX_STARS - 1),
    tier: perTier(z.number().positive()),
  }),
  /**
   * What a main card adds to its job as it grows (11.2: base power, gauge speed). Each value is
   * multiplied by (power − 1): a Bronze ★1 Lv 1 main adds nothing; every level, star and tier
   * adds more.
   */
  mainGrowth: perJob(z.array(modifierSchema)),
  /**
   * The star bar (DESIGN.md §5): each duplicate adds `fillPerDuplicate` (by rarity) to the card's
   * saved fill, and star n → n + 1 takes `needs[n - 1]` of it (5 steps, ★1→2 … ★5→6; 0 = free).
   * A star-up costs only the fill.
   */
  starBar: z.strictObject({
    fillPerDuplicate: perRarity(z.number().positive()),
    needs: perRarity(z.array(z.number().min(0)).length(MAX_STARS - 1)),
  }),
  /** Tier-up (to the next tier, stars kept), keyed by the tier being left, per job: Money plus
   *  the tier's Core, tree and mine gems (and Frost Sigils at Gold and Prismatic). The card must
   *  be at its level cap. Prismatic → Unique exists only for cards with a unique version. */
  tierUp: z.strictObject({
    bronze: perJob(z.array(costSchema).min(1)),
    silver: perJob(z.array(costSchema).min(1)),
    gold: perJob(z.array(costSchema).min(1)),
    prismatic: perJob(z.array(costSchema).min(1)),
  }),
  /** Base health of a card by rarity, multiplied by its power (DESIGN.md §6). The fighting
   *  loadout's health pool sums its cards. */
  health: perRarity(positiveDecimal),
  /**
   * Base damage per second of a card by rarity (DESIGN.md §5), with the same ratios as health.
   * Fighting damage is the main card's base damage × its power, then the modifiers.
   */
  baseDamage: perRarity(positiveDecimal),
  /** Shards for a duplicate gained past ★6, by rarity. */
  shards: perRarity(count),
});

/** Boss drawings (DESIGN.md §12: sticker style, a distinct body shape each). */
export const BOSS_ARTS = [
  'root_warden',
  'cinder_lich',
  'glacier_colossus',
  'crystal_sentinel',
] as const;

export const dungeonSchema = z.strictObject({
  id,
  name,
  tier,
  /** Dungeon whose clear unlocks this one; null = open from the start. */
  unlockedBy: id.nullable(),
  /** Boss kills needed to clear the dungeon (DESIGN.md §6: the first kill). */
  killsToClear: z.number().int().min(1).default(1),
  boss: z.strictObject({
    id,
    name,
    /** Which boss drawing to use. */
    art: z.enum(BOSS_ARTS),
    hp: positiveDecimal,
    /** Boss HP is multiplied by (1 + this) for every prestige. Keep it small. */
    hpScalingPerPrestige: z.number().min(0).max(1),
    /** The HP is shown as this many stacked bars ("x N" lives). */
    hpBars: z.number().int().min(1).max(100).default(10),
    /** The boss hits the fighting loadout back (DESIGN.md §6). Damage grows with prestige
     *  like the HP (hpScalingPerPrestige). */
    attack: z.strictObject({
      damage: positiveDecimal,
      intervalSeconds: z.number().gt(0),
    }),
  }),
  drops: z.strictObject({
    /** Rare item (card, cosmetic, ...) dropped on boss kills. */
    rare: z.strictObject({
      itemId: id,
      /** Chance per kill, 0..1 (0.005 = 0.5%). */
      chance: z.number().gt(0).max(1),
      /** Guaranteed after this many consecutive kills without the item. */
      pityThreshold: z.number().int().min(1),
    }),
    /** Currencies granted on every kill, each a range (inclusive): Money and both crystals
     *  (DESIGN.md §7, §3). Deeper dungeons pay more. */
    currencies: z
      .array(
        z
          .strictObject({
            resource: id,
            min: z.number().int().min(0),
            max: z.number().int().min(0),
          })
          .refine((p) => p.min <= p.max, { message: 'min must not exceed max' }),
      )
      .min(1),
    /** Money paid for every second of fighting this dungeon's boss (not while knocked out), so
     *  the very first levels can be bought before the first kill (DESIGN.md §3). Only the
     *  first dungeon has one: later dungeons pay by the kill, so a wall cannot be farmed idle. */
    wage: z.strictObject({ resource: id, perSecond: positiveDecimal }).optional(),
    /** Further materials dropped on every kill, each a range like the currencies (the Frostspire
     *  Vault drops Frost Sigils for the Prismatic card upgrades; DESIGN.md §5). */
    extraMaterials: z
      .array(
        z
          .strictObject({
            resource: id,
            min: z.number().int().min(0),
            max: z.number().int().min(0),
          })
          .refine((p) => p.min <= p.max, { message: 'min must not exceed max' }),
      )
      .default([]),
    /** Tier-up material (Core) dropped with `chance` per kill, no pity. */
    material: z.strictObject({
      resource: id,
      chance: z.number().gt(0).max(1),
      amount: z.number().int().min(1),
    }),
  }),
});

/**
 * A special dungeon (DESIGN.md §6): a strength test. Each attempt lasts `durationSeconds`
 * against a target with a fixed HP; the score is the share of that HP dealt (capped at 1).
 * Every tier whose `score` was reached pays its rewards; a score of 1 clears it.
 */
export const trialSchema = z
  .strictObject({
    id,
    name,
    /** Dungeon whose clear unlocks this trial; null = open from the start. */
    unlockedBy: id.nullable(),
    durationSeconds: z.number().positive(),
    target: z.strictObject({ id, name, art: z.enum(BOSS_ARTS), hp: positiveDecimal }),
    tiers: z
      .array(
        z.strictObject({
          /** Share of the target HP, 0..1 (0.25 = 25%). */
          score: z.number().gt(0).max(1),
          rewards: z.array(costSchema).min(1),
        }),
      )
      .min(1),
  })
  .refine((t) => t.tiers.every((entry, i) => i === 0 || entry.score > t.tiers[i - 1]!.score), {
    message: 'tiers must be in increasing score order',
    path: ['tiers'],
  });

// ---- Progression (DESIGN.md §4, §6, §10, §12) ----------------------------------------------------------------

/** The metal ladder (E1): tier 0..4 of anything with tiers. */
export const METALS = ['stone', 'bronze', 'silver', 'gold', 'prismatic'] as const;
export type Metal = (typeof METALS)[number];
/** Tiers above stone: one threshold each (bronze, silver, gold, prismatic). */
const MASTERY_TIERS = METALS.length - 1;

/** A mastery bonus per tier reached: `value` is multiplied by the tier. The scope is filled in
 *  by the game (the gem's resource, or the boss's dungeon). */
const masteryBonusSchema = z.strictObject({
  stat: z.enum(STATS),
  kind: z.enum(['flat', 'percent']),
  value: decimal,
});

const increasing = (list: (number | Decimal)[]): boolean =>
  list.every((v, i) => i === 0 || new Decimal(v).gt(list[i - 1]!));

/** Pages a goal can jump to (the renderer's page ids). */
export const GOAL_PAGES = ['home', 'cards', 'production', 'dungeons', 'summon', 'shop'] as const;
export type GoalPage = (typeof GOAL_PAGES)[number];
/**
 * Goal rules (E8). Each kind finds its candidates in the state:
 * - `clear_dungeon`: unlocked dungeons not cleared yet (with what the clear opens);
 * - `clear_trial`: unlocked special dungeons not cleared yet;
 * - `unlock_tree`: tree kinds not bought yet;
 * - `mine_milestone`: the next level milestone of each mine type;
 * - `gem_mastery` / `boss_mastery`: the next mastery tier of each gem / boss;
 * - `star_up`: owned cards with the duplicate for their next star, missing level or materials.
 */
export const GOAL_KINDS = [
  'clear_dungeon',
  'clear_trial',
  'unlock_tree',
  'mine_milestone',
  'gem_mastery',
  'boss_mastery',
  /** A card's star bar is part full (DESIGN.md §5). */
  'star_up',
  /** A card at its level cap is short of Money or materials for its tier-up. */
  'tier_up',
  /** The next ascension: progress = Starlight gain / the minimum (DESIGN.md §9). */
  'ascension',
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const progressionSchema = z.strictObject({
  /** E2: tier from the lifetime total harvested of each production gem, kept through prestige. */
  gemMastery: z.strictObject({
    thresholds: z
      .array(positiveDecimal)
      .length(MASTERY_TIERS)
      .refine(increasing, { message: 'thresholds must increase' }),
    perTier: z.array(masteryBonusSchema),
  }),
  /** E3: medal tier from kills per dungeon (boss), kept through prestige. */
  bossMastery: z.strictObject({
    thresholds: z
      .array(z.number().int().min(1))
      .length(MASTERY_TIERS)
      .refine(increasing, { message: 'thresholds must increase' }),
    perTier: z.array(masteryBonusSchema),
  }),
  /** E3: special dungeons take their medal tier from their best score (0..1) instead. */
  trialMastery: z.strictObject({
    thresholds: z
      .array(z.number().gt(0).max(1))
      .length(MASTERY_TIERS)
      .refine(increasing, { message: 'thresholds must increase' }),
    perTier: z.array(masteryBonusSchema),
  }),
  /**
   * E4: what grows each job's tiles: `level`, the tree kind's or mine type's level milestones
   * (11.12). Both reset on prestige with the levels.
   */
  tileStages: z.strictObject({
    logging: z.strictObject({ source: z.literal('level') }),
    mining: z.strictObject({ source: z.literal('level') }),
  }),
  /** E6: unique items. Cards name theirs in cards.json; shown at the Unique tier. */
  evolutions: z.strictObject({
    items: z.array(z.strictObject({ kind: z.enum(UNIQUE_ITEM_KINDS), name })).min(1),
  }),
  /** E8: the goal tracker's rules, in no particular order (goals are sorted by time left). */
  goals: z
    .array(
      z.strictObject({
        kind: z.enum(GOAL_KINDS),
        /** Page the goal jumps to when clicked. */
        page: z.enum(GOAL_PAGES),
        /** Only show candidates at least this far along (0..1). */
        minProgress: z.number().min(0).max(1).default(0),
      }),
    )
    .min(1),
});
export type Progression = z.output<typeof progressionSchema>;
export type MasteryBonus = z.output<typeof masteryBonusSchema>;
export type GoalRule = Progression['goals'][number];

/** One job's burst gauge (DESIGN.md §6). Each value is read through its `burst.*` stat. */
const burstConfigSchema = z.strictObject({
  /** Seconds between hits (fighting) or ticks (production). */
  intervalSeconds: z.number().positive(),
  /** Gauge points needed to fire. */
  gaugeSize: z.number().positive(),
  /** Gauge points per hit / tick. */
  fill: z.number().min(0),
  /** Fighting: damage as a multiple of one hit. Production: seconds of the job's output. */
  power: positiveDecimal,
});

/** Global combat numbers (combat.json). */
export const combatSchema = z.strictObject({
  /**
   * Damage per second with no fighting main card (bare hands, DESIGN.md §5). Fighting damage
   * comes from the main card's base damage (`cardRules.baseDamage`); this only keeps a loadout
   * with no leader from dealing nothing.
   */
  unarmedDamage: positiveDecimal,
  bursts: z.strictObject({
    fighting: burstConfigSchema,
    logging: burstConfigSchema,
    mining: burstConfigSchema,
  }),
  /** How long a knocked-out loadout sits out before the fight restarts (DESIGN.md §6). */
  knockoutSeconds: z.number().gt(0),
  /**
   * How a boss's attacks are shaped (DESIGN.md §6). In every `attacksPerCycle` attacks all but
   * the last are light (`lightMultiplier` of an attack's damage) and the last is a slam
   * (`slamMultiplier`). A cycle must add up to `attacksPerCycle` normal attacks, so the damage
   * per minute in dungeons.json holds.
   */
  bossPattern: z
    .strictObject({
      attacksPerCycle: z.number().int().min(2),
      lightMultiplier: z.number().gt(0),
      slamMultiplier: z.number().gt(0),
    })
    .refine(
      (p) =>
        Math.abs(
          (p.attacksPerCycle - 1) * p.lightMultiplier + p.slamMultiplier - p.attacksPerCycle,
        ) < 1e-9,
      { message: 'one cycle of attacks must add up to attacksPerCycle normal attacks' },
    ),
  /** Crits (DESIGN.md §6): base chance (0..1) and damage multiplier of a critical hit. */
  crit: z.strictObject({
    chance: z.number().min(0).max(1),
    damage: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
  }),
});

// ---- Cosmetics ----------------------------------------------------------------------------
// The visual language of a cosmetic is data: CSS custom property values ("tokens"), named CSS
// recipes for things a token cannot express (decorations, patterns), and named animation
// effects. See docs/COSMETICS.md for the naming rules.

export const COSMETIC_SLOTS = [
  'border',
  'finish',
  'attack',
  'tick',
  'number',
  'table',
  'cursor',
  /* UI-skin slots (DESIGN.md §8): art-driven, so they set no tokens; the item's `ui-<slot>-<style>`
     recipe names the style the pages draw. */
  'starlight',
  'sticker',
  'nodes',
  'wardrobe',
] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

/** Slots drawn per card. Wearing them requires a minimum card rank (see wearRules). */
export const CARD_SLOTS = ['border', 'finish'] as const satisfies readonly CosmeticSlot[];
export type CardSlot = (typeof CARD_SLOTS)[number];

/** Token keys each slot may set. Each becomes the CSS variable `--bi-<key>`. */
export const SLOT_TOKENS = {
  border: [
    'border-color',
    'border-width',
    'radius',
    'plate-bg',
    'plate-line',
    'plate-ink',
    'plate-ink-muted',
    'art-line',
    'panel-bg',
    'panel-line',
    'panel-ink',
    'panel-ink-muted',
  ],
  finish: ['finish-a', 'finish-b', 'finish-c', 'finish-opacity', 'finish-speed'],
  attack: ['attack-edge', 'attack-glow', 'attack-particle'],
  /* tick-outline: the sticker numerals' white ring; tick-hurt: boss hits on the cards;
     tick-gain: "+n" gains rising off plots and slots. */
  tick: [
    'tick-color',
    'tick-stroke',
    'tick-crit',
    'tick-size',
    'tick-outline',
    'tick-hurt',
    'tick-gain',
  ],
  number: ['num-font', 'num-weight', 'num-color'],
  /* The table item also skins the screen shell around it (DESIGN.md §11): header and sidebar
     (chrome-*), framed panels (frame-*) and tooltips (tip-*). */
  table: [
    'table-bg',
    'table-glow',
    'on-table',
    'on-table-muted',
    'chrome-bg',
    'chrome-rail-bg',
    'chrome-line',
    'chrome-ink',
    'chrome-ink-muted',
    'chrome-accent',
    'chrome-active-bg',
    'frame-bg',
    'frame-radius',
    'frame-line',
    'frame-title-bg',
    'frame-title-line',
    'frame-title-ink',
    'frame-ink',
    'frame-ink-muted',
    'tip-bg',
    'tip-line',
    'tip-ink',
    'tip-ink-muted',
  ],
  cursor: [],
  starlight: [],
  sticker: [],
  nodes: [],
  wardrobe: [],
} as const satisfies Record<CosmeticSlot, readonly string[]>;

/** Token keys a rarity may set. Each becomes `--bi-rarity-<key>`. */
export const RARITY_TOKENS = ['body', 'body-accent', 'neon', 'neon-soft'] as const;

const tokenValue = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[^;{}<>\\]*$/, 'must not contain ; { } < > or a backslash');
const recipeId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'recipe ids are lowercase kebab-case, e.g. "filigree-2"');
const effectId = recipeId;

const cosmeticLevelSchema = z.strictObject({
  tokens: z.record(z.string(), tokenValue).default({}),
  recipes: z.array(recipeId).default([]),
  /** Attack slot: the animation used for each job. */
  effects: z.strictObject({ fighting: effectId, mining: effectId, logging: effectId }).optional(),
  /** Tick slot: the floating-number animation. */
  effect: effectId.optional(),
});

export const cosmeticSchema = z
  .strictObject({
    id,
    name,
    slot: z.enum(COSMETIC_SLOTS),
    rarity: z.enum(RARITIES),
    /** Matching-set bonus applies when every item of the set is equipped. */
    set: id.nullable(),
    /** Rare cosmetics tied to a single card; null = usable with any card. */
    exclusiveCard: id.nullable(),
    /** The one item per slot a new game starts with and falls back to. */
    starter: z.boolean().default(false),
    /** Small permanent buffs granted just for owning it (worn or not). */
    ownedModifiers: z.array(modifierSchema).default([]),
    /**
     * Upgrade levels, lowest first. Level N shows everything from levels 1..N merged, so each
     * level only lists what it adds or changes.
     */
    levels: z.array(cosmeticLevelSchema).min(1).max(10),
  })
  .superRefine((c, ctx) => {
    const allowed = new Set<string>(SLOT_TOKENS[c.slot]);
    c.levels.forEach((level, i) => {
      for (const key of Object.keys(level.tokens)) {
        if (!allowed.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['levels', i, 'tokens', key],
            message: `"${key}" is not a ${c.slot} token (allowed: ${[...allowed].join(', ') || 'none'})`,
          });
        }
      }
    });
    const first = c.levels[0]!;
    if (c.slot === 'attack' && !first.effects) {
      ctx.addIssue({
        code: 'custom',
        path: ['levels', 0, 'effects'],
        message: 'attack items need an effect per job',
      });
    }
    if (c.slot === 'tick' && !first.effect) {
      ctx.addIssue({
        code: 'custom',
        path: ['levels', 0, 'effect'],
        message: 'tick items need an effect',
      });
    }
    if (c.exclusiveCard && !(CARD_SLOTS as readonly string[]).includes(c.slot)) {
      ctx.addIssue({
        code: 'custom',
        path: ['exclusiveCard'],
        message: `only card slots (${CARD_SLOTS.join(', ')}) can be exclusive to a card`,
      });
    }
    if (c.starter && (c.exclusiveCard || c.levels.length > 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['starter'],
        message: 'a starter item cannot be card-exclusive or have upgrade levels',
      });
    }
  });

/** Rarity colours the card body. One entry per rarity. */
export const rarityStyleSchema = z
  .strictObject({
    id: z.enum(RARITIES),
    name,
    tokens: z.record(z.string(), tokenValue).default({}),
    recipes: z.array(recipeId).default([]),
  })
  .superRefine((r, ctx) => {
    const allowed = new Set<string>(RARITY_TOKENS);
    for (const key of Object.keys(r.tokens)) {
      if (!allowed.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tokens', key],
          message: `"${key}" is not a rarity token (allowed: ${RARITY_TOKENS.join(', ')})`,
        });
      }
    }
  });

/**
 * Minimum card rank needed to WEAR an item in a card slot (owning it is always allowed).
 * `exclusive` applies to card-exclusive items.
 */
export const wearRulesSchema = z.strictObject({
  border: rankSchema,
  finish: rankSchema,
  exclusive: rankSchema,
});

/** What a portal's pool holds: cards, cosmetics, or legacy weapon skins (the Legacy Gate). */
/** Skin pools list skin ids, which may use hyphens (a plain snake_case id is a valid one too). */
const skinArtId = z
  .string()
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'ids are lowercase letters, digits, "-" or "_"');
export const PORTAL_KINDS = ['cards', 'cosmetics', 'skins'] as const;

/**
 * A summon portal (DESIGN.md §7, "Beta portals"). Every portal offers a single pull and a
 * 10-pull; prices go through `cost.multiplier` (scope: portal, resource).
 */
export const portalSchema = z.strictObject({
  id,
  name,
  kind: z.enum(PORTAL_KINDS),
  /** Portal resource (from specific dungeons) spent on a single pull and on a 10-pull. */
  cost: z.strictObject({ resource: id, single: positiveDecimal, ten: positiveDecimal }),
  /** The pool: one entry per item, picked by weight. Items must match the portal kind. */
  pool: z
    .array(
      z.strictObject({
        itemId: skinArtId,
        rarity: z.enum(RARITIES),
        weight: z.number().positive(),
      }),
    )
    .min(1),
  /** Hard pity: after `threshold - 1` pulls without this rarity or better, the next one is it
   *  (`summon.pityThreshold`, scope: portal). Counted per portal, kept through prestige. */
  pity: z.strictObject({ rarity: z.enum(RARITIES), threshold: z.number().int().min(1) }),
  /** Every 10-pull holds at least one item of this rarity or better. */
  tenPullGuarantee: z.enum(RARITIES),
  /** Reveal: chance that a result above the lowest rarity shows an orb one rarity lower first,
   *  then flashes up to its own colour. */
  reveal: z.strictObject({ upgradeFlashChance: z.number().min(0).max(1) }),
  /** False while the portal waits for its screen (the Wardrobe Gate ships with the Wardrobe):
   *  it is left out of `content.portals` (still in `content.allPortals`). */
  enabled: z.boolean().default(true),
  /** Skin portals: a skin you already own pays back this fraction of a single pull's price (in the
   *  portal resource). Ignored by other kinds. */
  duplicatePayback: z.number().min(0).max(1).default(0.2),
});

/**
 * Prestige, Ascension (DESIGN.md §9; prestige.json). Starlight gained =
 * floor(((Σ gems harvested this run × the weight of the gem's tier) / divisor) ^ exponent),
 * through `prestige.gain`. An ascension needs at least `minimum`.
 */
export const prestigeSchema = z.strictObject({
  /** The prestige resource (kind `prestige`): Starlight. */
  currency: id,
  gain: z.strictObject({
    /** Weight of one gem by its resource tier (index 0 = tier 1). */
    tierWeights: z.array(positiveDecimal).min(1),
    divisor: positiveDecimal,
    exponent: z.number().gt(0).max(1),
    minimum: z.number().int().min(1),
  }),
  /** Starlight shop: permanent levels, each adding `perLevel` once more (source `prestige`). */
  shop: z.array(
    z.strictObject({
      id,
      name,
      description: z.string().min(1),
      maxLevel: z.number().int().min(1),
      /** Starlight price of level n + 1 (0-based n): base × growth^n. */
      cost: z.strictObject({ base: positiveDecimal, growth: atLeastOne }),
      perLevel: z.array(modifierSchema).min(1),
    }),
  ),
  /** Cosmetics granted by the n-th ascension (a duplicate becomes a copy). */
  rewards: z.array(
    z.strictObject({ ascension: z.number().int().min(1), cosmetics: z.array(id).min(1) }),
  ),
});

/**
 * What unlocks an achievement (DESIGN.md §10). Each kind reads one thing from the state:
 * lifetime gems harvested (optionally one job), total boss kills, every producer of a job
 * unlocked (or `count` of them), a dungeon / trial cleared, portal pulls, pity hits, any card at
 * a tier or star count, a full loadout, a full non-starter set equipped, non-starter cosmetics
 * owned, skill points spent, ascensions, the longest offline session, any gem mastery / boss
 * medal tier, any mine level, any cosmetic at its max level.
 */
export const achievementConditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('harvested'),
    job: z.enum(['logging', 'mining']).optional(),
    amount: positiveDecimal,
  }),
  z.strictObject({ kind: z.literal('kills'), amount: z.number().int().min(1) }),
  z.strictObject({
    kind: z.literal('producers'),
    job: z.enum(['logging', 'mining']),
    count: z.number().int().min(1).optional(),
  }),
  z.strictObject({ kind: z.literal('cleared'), dungeon: id }),
  z.strictObject({ kind: z.literal('pulls'), amount: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('pity_hits'), amount: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('card_tier'), tier: z.enum(RANK_TIERS) }),
  z.strictObject({ kind: z.literal('card_stars'), stars: z.number().int().min(1).max(MAX_STARS) }),
  z.strictObject({ kind: z.literal('full_loadout') }),
  z.strictObject({ kind: z.literal('full_set') }),
  z.strictObject({ kind: z.literal('cosmetics_owned'), amount: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('skill_points_spent'), amount: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('ascensions'), amount: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('offline_hours'), hours: z.number().positive() }),
  z.strictObject({ kind: z.literal('gem_mastery'), tier: z.number().int().min(1).max(4) }),
  z.strictObject({ kind: z.literal('boss_mastery'), tier: z.number().int().min(1).max(4) }),
  z.strictObject({ kind: z.literal('milestone'), level: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('max_cosmetic') }),
]);
export type AchievementCondition = z.output<typeof achievementConditionSchema>;

export const achievementSchema = z.strictObject({
  id,
  name,
  description: z.string().min(1),
  condition: achievementConditionSchema,
  /** Granted on unlock: cosmetics (a copy when owned) and resources. */
  reward: z.strictObject({
    cosmetics: z.array(id).default([]),
    resources: z.array(costSchema).default([]),
  }),
});
export type Achievement = z.output<typeof achievementSchema>;

/** One shard shop item (DESIGN.md §5: duplicates past max rank become shards for a shop). */
export const shardShopItemSchema = z.strictObject({
  id,
  reward: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('card'), card: id }),
    z.strictObject({ kind: z.literal('resource'), resource: id, amount: positiveDecimal }),
    z.strictObject({ kind: z.literal('cosmetic'), cosmetic: id }),
  ]),
  /** Card shards per purchase. */
  price: z.number().int().min(1),
  /** Purchases allowed ever; null = unlimited. */
  stock: z.number().int().min(1).nullable(),
});
export type ShardShopItem = z.output<typeof shardShopItemSchema>;

export const achievementsFileSchema = z.strictObject({
  achievements: z.array(achievementSchema),
  shardShop: z.array(shardShopItemSchema),
});

// ---- Account (DESIGN.md §10) -------------------------------------------------------------

export const SKILL_BRANCHES = [
  'logging',
  'mining',
  'combat',
  'luck',
  'collection',
  'automation',
] as const;
export type SkillBranch = (typeof SKILL_BRANCHES)[number];

/**
 * Account XP, levels, the reward track, the account tree and its respec (account.json).
 * XP (through `xp.account`, scope job): per unit harvested by job × the gem tier's weight, per
 * boss kill × killTierGrowth^(dungeon tier − 1), per pull, per Glimmer Trial attempt, per
 * ascension. Level L → L + 1 costs xpBase × xpGrowth^(L − 1); each level gives skill points.
 */
export const accountSchema = z.strictObject({
  xp: z.strictObject({
    perUnit: z.strictObject({ logging: decimal, mining: decimal }),
    tierWeights: z.array(positiveDecimal).min(1),
    perKill: decimal,
    killTierGrowth: atLeastOne,
    perPull: decimal,
    perTrialAttempt: decimal,
    perAscension: decimal,
  }),
  levels: z.strictObject({
    maxLevel: z.number().int().min(1),
    xpBase: positiveDecimal,
    xpGrowth: atLeastOne,
    skillPointsPerLevel: z.number().int().min(0),
  }),
  /** What reaching a level gives besides its skill points (E7). */
  rewardTrack: z.array(
    z.strictObject({
      level: z.number().int().min(2),
      resources: z.array(costSchema).default([]),
      cosmetics: z.array(id).default([]),
      /** Extra loadout cost cap for every job, kept from then on (`loadout.costCap`). */
      costCap: z.number().int().min(0).default(0),
    }),
  ),
  /** The account tree: ranks bought with skill points; each rank adds `perRank` once more. */
  tree: z.array(
    z.strictObject({
      id,
      name,
      branch: z.enum(SKILL_BRANCHES),
      /** Skill points per rank. */
      cost: z.number().int().min(1),
      maxRank: z.number().int().min(1),
      /** Nodes that need at least one rank first. */
      requires: z.array(id),
      perRank: z.array(modifierSchema).min(1),
    }),
  ),
  /** Respec (DESIGN.md §10): `freePerAscension` free ones each run, then `cost` Starlight. */
  respec: z.strictObject({ cost: positiveDecimal, freePerAscension: z.number().int().min(0) }),
});
export type AccountConfig = z.output<typeof accountSchema>;
export type SkillNode = AccountConfig['tree'][number];
export type RewardTrackEntry = AccountConfig['rewardTrack'][number];

/**
 * Card enhancements (DESIGN.md §10b, 12.2, 12.3; enhancements.json): from `unlockRank`, each card
 * picks options from its own list within its tier's point budget. An option's modifiers apply
 * while the card is in a loadout (source `enhancement`). Respec is free.
 */
export const enhancementsSchema = z.strictObject({
  unlockRank: rankSchema,
  budget: perTier(z.number().int().min(0)),
  cards: z.record(
    id,
    z
      .array(
        z.strictObject({
          id,
          name,
          cost: z.number().int().min(1),
          modifiers: z.array(modifierSchema).min(1),
        }),
      )
      .min(1),
  ),
});
export type EnhancementsConfig = z.output<typeof enhancementsSchema>;
export type EnhancementOption = EnhancementsConfig['cards'][string][number];

/** The steps of the cosmetic upgrade ladder, in order (DESIGN.md §8). */
export const LADDER_STEPS = ['shape', 'accent', 'gems', 'glow', 'ambient'] as const;
export type LadderStep = (typeof LADDER_STEPS)[number];

/**
 * Cosmetic upgrade levels (cosmeticRules.json; DESIGN.md §8). A non-starter item's max
 * level comes from its rarity; `ladders[max]` says what each level adds (level 1 first, which
 * owning the item gives). Level L + 1 costs `copiesPerLevel` duplicates and the step's material
 * × the rarity's cost factor (through `cost.multiplier`, scope: resource).
 */
export const cosmeticRulesSchema = z
  .strictObject({
    maxLevel: perRarity(z.number().int().min(1).max(10)),
    /** Max level of every non-starter item of a slot, replacing the rarity rule (UI skins: 1). */
    slotMaxLevel: z
      .partialRecord(z.enum(COSMETIC_SLOTS), z.number().int().min(1).max(10))
      .default({}),
    ladders: z.record(z.string().regex(/^\d+$/), z.array(z.enum(LADDER_STEPS)).min(1)),
    copiesPerLevel: z.number().int().min(0),
    materials: z.strictObject({
      shape: costSchema,
      accent: costSchema,
      gems: costSchema,
      glow: costSchema,
      ambient: costSchema,
    }),
    rarityCost: perRarity(positiveDecimal),
  })
  .superRefine((r, ctx) => {
    for (const [key, steps] of Object.entries(r.ladders)) {
      const order = steps.map((s) => LADDER_STEPS.indexOf(s));
      if (steps.length !== Number(key)) {
        ctx.addIssue({ code: 'custom', path: ['ladders', key], message: `needs ${key} steps` });
      }
      if (order.some((v, i) => i > 0 && v < order[i - 1]!)) {
        ctx.addIssue({ code: 'custom', path: ['ladders', key], message: 'never goes back a step' });
      }
      if (steps.length > 1 && steps[steps.length - 1] !== 'ambient') {
        ctx.addIssue({ code: 'custom', path: ['ladders', key], message: 'must end on ambient' });
      }
    }
    for (const max of new Set([...Object.values(r.maxLevel), ...Object.values(r.slotMaxLevel)])) {
      if (!r.ladders[String(max)]) {
        ctx.addIssue({
          code: 'custom',
          path: ['ladders'],
          message: `no ladder for max level ${max}`,
        });
      }
    }
  });

/** Bonus for equipping every item of a cosmetic set. */
export const cosmeticSetSchema = z.strictObject({
  id,
  name,
  modifiers: z.array(modifierSchema).default([]),
});

/**
 * The upgrade shelf (DESIGN.md §4): one-time multipliers bought with Money that appear when
 * their unlock condition is met. `permanent` ones are kept through an ascension, the rest are
 * bought again each run. Effects are ordinary modifiers (source `upgrade`).
 */
export const UPGRADE_UNLOCK_KINDS = [
  'treeLevel',
  'mineLevel',
  'gemMastery',
  'bossKills',
  'lifetimeMoney',
] as const;
export const upgradeUnlockSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('treeLevel'), tree: id, level: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('mineLevel'), mine: id, level: z.number().int().min(1) }),
  z.strictObject({
    kind: z.literal('gemMastery'),
    gem: id,
    tier: z.number().int().min(1).max(MASTERY_TIERS),
  }),
  z.strictObject({ kind: z.literal('bossKills'), dungeon: id, kills: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('lifetimeMoney'), amount: positiveDecimal }),
]);
export const upgradeSchema = z.strictObject({
  id,
  name,
  /** The effect as shown to the player, e.g. "Oak output x2". */
  description: z.string().min(1),
  unlock: upgradeUnlockSchema,
  cost: costSchema,
  /** Kept through an ascension (its unlock must be lasting progress). */
  permanent: z.boolean(),
  effects: z.array(modifierSchema).min(1),
});
export const upgradesFileSchema = z.strictObject({
  /** The resource every upgrade is paid in (Money). */
  currency: id,
  upgrades: z.array(upgradeSchema),
});

/**
 * Weapon skins (weaponSkins.json): alternate art for a weapon, chosen per weapon kind (not per
 * card). `weapon` is a generic item kind or a unique item kind; `baseArt` is the unskinned art.
 */
export const weaponSkinSchema = z.strictObject({
  id: skinArtId,
  name,
  /** Art id the renderer draws for this skin (e.g. `skin-scythe-01`). */
  art: skinArtId,
  /** Price in the skin's own currency later; 0 = free (all skins are free in the test). */
  cost: z.number().int().min(0),
  /** A legacy skin (DESIGN.md §8): worn by the whole generic weapon kind, owned only after it is
   *  pulled from the Legacy Gate. Needs a `rarity`; other skins must not have one. */
  legacy: z.boolean().optional(),
  /** Rarity of a legacy skin: the Legacy Gate rolls it at this rarity. */
  rarity: z.enum(RARITIES).optional(),
});
export const weaponSkinSetSchema = z.strictObject({
  weapon: z.enum([...ITEM_KINDS, ...UNIQUE_ITEM_KINDS]),
  /** The unskinned art. Absent for a generic kind (its art varies by rarity): unskinned = no art id. */
  baseArt: skinArtId.optional(),
  skins: z.array(weaponSkinSchema).min(1),
});

export const contentSchemas = {
  resources: z.array(resourceSchema),
  trees: z.array(treeSchema),
  mines: z.array(mineSchema),
  production: productionSchema,
  cards: z.array(cardSchema),
  cardRules: cardRulesSchema,
  dungeons: z.array(dungeonSchema),
  trials: z.array(trialSchema),
  combat: combatSchema,
  cosmetics: z.array(cosmeticSchema),
  portals: z.array(portalSchema),
  rarities: z.array(rarityStyleSchema),
  wearRules: wearRulesSchema,
  sets: z.array(cosmeticSetSchema),
  progression: progressionSchema,
  prestige: prestigeSchema,
  cosmeticRules: cosmeticRulesSchema,
  achievements: achievementsFileSchema,
  account: accountSchema,
  enhancements: enhancementsSchema,
  upgrades: upgradesFileSchema,
  weaponSkins: z.array(weaponSkinSetSchema),
} as const;

export type WeaponSkin = z.output<typeof weaponSkinSchema>;
export type WeaponSkinSet = z.output<typeof weaponSkinSetSchema>;
export type Upgrade = z.output<typeof upgradeSchema>;
export type UpgradeUnlock = z.output<typeof upgradeUnlockSchema>;
export type UpgradesConfig = z.output<typeof upgradesFileSchema>;
export type Resource = z.output<typeof resourceSchema>;
export type GemArt = z.output<typeof gemArtSchema>;
export type Tree = z.output<typeof treeSchema>;
export type Mine = z.output<typeof mineSchema>;
export type CostCurve = z.output<typeof costCurveSchema>;
export type ProductionConfig = z.output<typeof productionSchema>;
export type ProductionJob = 'logging' | 'mining';
export type Card = z.output<typeof cardSchema>;
export type CardRules = z.output<typeof cardRulesSchema>;
export type RankTier = (typeof RANK_TIERS)[number];
export type Dungeon = z.output<typeof dungeonSchema>;
export type Trial = z.output<typeof trialSchema>;
export type CombatConfig = z.output<typeof combatSchema>;
export type BurstConfig = z.output<typeof burstConfigSchema>;
export type BurstJob = keyof CombatConfig['bursts'];
export type Cosmetic = z.output<typeof cosmeticSchema>;
export type Portal = z.output<typeof portalSchema>;
export type CosmeticLevel = z.output<typeof cosmeticLevelSchema>;
export type RarityStyle = z.output<typeof rarityStyleSchema>;
export type WearRules = z.output<typeof wearRulesSchema>;
export type CosmeticSet = z.output<typeof cosmeticSetSchema>;
export type PrestigeConfig = z.output<typeof prestigeSchema>;
export type CosmeticRules = z.output<typeof cosmeticRulesSchema>;
export type StarlightItem = PrestigeConfig['shop'][number];
