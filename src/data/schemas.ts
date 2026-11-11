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

/** Card elements (DESIGN.md §12): each picks the card's element effect. */
export const ELEMENTS = ['fire', 'storm', 'light', 'nature', 'earth', 'crystal', 'void'] as const;
export type CardElement = (typeof ELEMENTS)[number];

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
  /** Summon and Glamour Scrolls (DESIGN.md §3): one scroll pays one pull. Save format 27. */
  'scroll',
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
  /** Kept through an Ascension although its kind is reset by one (star dust belongs to the collection, DESIGN.md §5). */
  keptOnAscend: z.boolean().optional(),
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

/**
 * Depth and growth of a tree kind (ages) or mine type (layers) (DESIGN.md §4 Depth and growth).
 * Layer `n` (1-based) has hardness `hardness x hardnessGrowth^(n-1)` that the worker's digging
 * (`digRate` hardness per second at worker power 1) breaks; each layer below the first multiplies
 * the place's yield by `yieldGrowth`. There are as many layers as `names`; the last one is never
 * broken. Reset on Ascension.
 */
export const depthSchema = z.strictObject({
  /** The age or layer names, shallowest first (at least two). */
  names: z.array(name).min(2),
  hardness: positiveDecimal,
  hardnessGrowth: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
  yieldGrowth: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
  digRate: positiveDecimal,
});
export type DepthDef = z.output<typeof depthSchema>;

/** Shared by trees (logging) and mines (mining). Each unlocked one produces once. */
const producerFields = {
  depth: depthSchema,
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
  /** The tree's element: workers of this element on it give +15% (DESIGN.md §6 Elements in combat). */
  element: z.enum(ELEMENTS),
  /** Tree levels (DESIGN.md §4), bought with Money and reset on prestige. */
  level: producerLevelSchema,
  /** Tree colours, themed to its gem: canopy and bark, light to dark. */
  art: z.strictObject({ leaf: tones, bark: tones }),
});

export const mineSchema = z.strictObject({
  ...producerFields,
  /** Dungeon whose clear unlocks this mine type; null = available from the start. */
  unlockedByDungeon: id.nullable(),
  /** The mine's element: workers of this element on it give +15% (DESIGN.md §6 Elements in combat). */
  element: z.enum(ELEMENTS),
  /** Mine levels, bought with Money and reset on prestige. */
  level: producerLevelSchema,
});

/** How a worker strikes its place (DESIGN.md §4 Workers play the field): a look and a rhythm,
 *  never extra output. */
export const HARVEST_STYLES = ['steady', 'chop', 'flurry', 'volley'] as const;
export type HarvestStyle = (typeof HARVEST_STYLES)[number];

export const harvestPatternSchema = z.strictObject({
  /** Name of the strike's look, for the stage to pick an animation. */
  style: z.enum(HARVEST_STYLES),
  /** Seconds in one cycle. */
  intervalSeconds: z.number().positive(),
  /** Strikes in one cycle, spread evenly over it. */
  strikes: z.number().int().min(1).max(8),
});
export type HarvestPattern = z.output<typeof harvestPatternSchema>;

export const JOBS = ['mining', 'logging', 'fighting'] as const;
/** Mythic and Void are one top rarity with two sides, equal in power (DESIGN.md §5). */
export const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'void',
] as const;
export type Rarity = (typeof RARITIES)[number];
export type Job = (typeof JOBS)[number];

const positiveNumber = z.number().positive();

/** The stats a tool line can raise (DESIGN.md §4 Tool lines). */
export const TOOL_STATS = [
  'production.rate',
  'harvest.speed',
  'harvest.critChance',
  'harvest.critDamage',
] as const;

/**
 * A tool line of a production job (DESIGN.md §4 Tool lines): repeatable, bought with Money like a
 * Training line. Yield and strike speed multiply their stat by (1 + ratePercent% x level) x the
 * milestones (`milestones` required); crit chance adds ratePercent percentage points a level and
 * crit damage adds ratePercent/100 to the crit multiplier a level (no milestones). The job is the
 * scope. Reset on Ascension.
 */
export const toolLineSchema = z
  .strictObject({
    id,
    name,
    job: z.enum(['logging', 'mining']),
    /** What it raises, as the words after the amount ("yield"). */
    effect: z.string().min(1),
    stat: z.enum(TOOL_STATS),
    cost: costCurveSchema,
    ratePercent: decimal.refine((d) => d.gt(0), { message: 'must be above 0' }),
    milestones: milestoneSchema.optional(),
  })
  .refine(
    (t) =>
      (t.stat === 'production.rate' || t.stat === 'harvest.speed') === (t.milestones !== undefined),
    { message: 'yield and speed lines need milestones, crit lines have none' },
  );
export type ToolLine = z.output<typeof toolLineSchema>;

/**
 * A forge recipe (DESIGN.md §4 The forge): `inputs` are spent and `output` made each time the
 * worker has done `work` (progress per second is the forge's `speed` × the worker's power).
 */
export const forgeRecipeSchema = z.strictObject({
  id,
  name,
  inputs: z.array(costSchema).min(1),
  output: costSchema,
  work: positiveDecimal,
});
export type ForgeRecipe = z.output<typeof forgeRecipeSchema>;

/**
 * The lucky strike of a job (DESIGN.md §4 Lucky strikes): a worked place gets one every
 * `everySeconds` on average, visible for `windowSeconds`, paying `payoutSeconds` of its output. The
 * economy uses the average, 1 + payout / interval; 0 payout switches it off.
 */
export const luckySchema = z
  .strictObject({
    /** What appears: "Golden tree", "Rich vein". */
    name,
    everySeconds: z.number().positive(),
    windowSeconds: z.number().positive(),
    payoutSeconds: z.number().min(0),
  })
  .refine((l) => l.windowSeconds < l.everySeconds, {
    message: 'the window must be shorter than the interval',
  });
export type LuckyConfig = z.output<typeof luckySchema>;

export const productionSchema = z.strictObject({
  /** Lucky strikes of each job (DESIGN.md §4 Lucky strikes). */
  lucky: z.strictObject({ logging: luckySchema, mining: luckySchema }),
  /** The forge (DESIGN.md §4 The forge): its recipes and its progress per second at power 1. */
  forge: z.strictObject({
    speed: positiveDecimal,
    recipes: z.array(forgeRecipeSchema).min(1),
  }),
  /** The tool lines of both jobs (DESIGN.md §4 Tool lines), in the order the page shows them. */
  tools: z.array(toolLineSchema).min(1),
  harvest: z.strictObject({
    /** Base harvest crit; the `harvest.*` stats change it, read at a worker's place. A place
     *  with no worker has no crits. */
    crit: z.strictObject({
      chance: z.number().min(0).max(1),
      damage: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
    }),
  }),
  /** Workers (DESIGN.md §4 Workers, Worker slots). */
  workers: z.strictObject({
    /** Worker slots: `base` plus `perAscension` per Ascension, at most `perProducer` on one tree
     *  kind or mine type (so never more than that many times the trees and mines). */
    slots: z.strictObject({
      base: z.number().int().min(0),
      perAscension: z.number().int().min(0),
      perProducer: z.number().int().min(1),
    }),
    /** A worker's power by rarity; × the card's level, star and tier power (`cardStatPower`) it
     *  multiplies its place's output. */
    rarityPower: z.strictObject({
      common: positiveNumber,
      uncommon: positiveNumber,
      rare: positiveNumber,
      epic: positiveNumber,
      legendary: positiveNumber,
      mythic: positiveNumber,
      void: positiveNumber,
    }),
  }),
});

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
  /** Strike and harvest-gauge speed of a worked place, base 1 (at least 0). Scope: job, producer. */
  'harvest.speed',
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
  /** Power of the workers at a place (DESIGN.md §4), also its digging. Scope: job, producer. */
  'worker.power',
  /** Hardness a place's workers break per second (DESIGN.md §4 Depth), base 1. Scope: job, producer. */
  'depth.digRate',
  /** Yield multiplier of a place's layer or age, read on the layer's own multiplier. Scope: job, producer. */
  'depth.yield',
  /** Seconds of output a lucky strike pays (DESIGN.md §4 Lucky strikes). Scope: job, producer. */
  'lucky.payout',
  /** Progress per second of the forge (DESIGN.md §4 The forge), base 1. */
  'forge.speed',
  /** Output amount of each craft, base 1. */
  'forge.yield',
  /** Share of a craft's inputs given back, 0..0.9, base 0. */
  'forge.refund',
  /** Strength of the tool lines of a job: scales what their levels give, base 1. Scope: job. */
  'tool.strength',
  /** Strength of the elemental damage bonuses (weakness and matching supports), base 1. */
  'element.bonus',
  /** Strength of the elemental damage malus (a resisted element), base 1 (0 = no malus). */
  'element.resist',
  /** Strength of a worker's element bonus on its own tree or mine, base 1. */
  'element.production',
  /** Chest of each stage star level, base 1 (DESIGN.md §6 Stage stars). Scope: dungeon. */
  'stars.chest',
  /** The damage each star level adds on its stage, base 1 (= the +5% a level). Scope: dungeon. */
  'stars.damage',
  /** The loot each star level adds on its stage, base 1. Scope: dungeon. */
  'stars.loot',
  /** Expedition slots (DESIGN.md §15 Expeditions): base 1, the account tree and the Starlight shop add. */
  'expedition.slots',
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

/**
 * Card tiers, lowest first (DESIGN.md §5): T1 Wood, T2 Bronze, T3 Silver, T4 Gold, T5 Prismatic,
 * T6 `mythic` (shown as Mythic or Void by the card's side), then the Heirloom, which is open
 * only for an item type whose Heirloom art is approved (items.json).
 */
export const RANK_TIERS = [
  'wood',
  'bronze',
  'silver',
  'gold',
  'prismatic',
  'mythic',
  'heirloom',
] as const;
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

/** The 11 item types a card can carry (DESIGN.md §5 "Item types"). */
export const ITEM_KINDS = [
  'sword',
  'greatsword',
  'spear',
  'lance',
  'dagger',
  'hammer',
  'bow',
  'staff',
  'scythe',
  'pickaxe',
  'logging_axe',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
/** One item type's names and whether its Heirloom is open (items.json; DESIGN.md §5). */
export const itemTypeSchema = z.strictObject({
  kind: z.enum(ITEM_KINDS),
  job: z.enum(['fighting', 'mining', 'logging']),
  /** The type word in item names: "Sword", "Axe" for the logging axe. */
  noun: name,
  /** T5 name ("Prismatic Dancer Sword"). */
  prismatic: name,
  /** T6 names, by the card's side. */
  mythic: name,
  void: name,
  /** Heirloom names, by the card's side. */
  heirloom: z.strictObject({ mythic: name, void: name }),
  /** The Heirloom tier opens for the type only once its Heirloom art is approved. */
  heirloomOpen: z.boolean(),
});
export const itemsSchema = z.strictObject({
  /** Material words for T1 to T4 names: "Wooden Sword", "Bronze Sword", "Silver Sword", "Golden Sword". */
  materials: z.strictObject({ wood: name, bronze: name, silver: name, gold: name }),
  types: z.array(itemTypeSchema).length(ITEM_KINDS.length),
});
export type ItemType = z.output<typeof itemTypeSchema>;
export type ItemsData = z.output<typeof itemsSchema>;

const cardBase = {
  id,
  name,
  rarity: z.enum(RARITIES),
  element: z.enum(ELEMENTS),
  /** The item type the card carries (its names per tier come from items.json). */
  item: z.strictObject({ kind: z.enum(ITEM_KINDS) }),
};

/** A fighting card: it leads the loadout (`main`) or sits in a support slot (`support`). */
export const fightingCardSchema = z.strictObject({
  ...cardBase,
  job: z.literal('fighting'),
  /** Used when the card leads the fighting loadout. */
  main: cardEffectSchema,
  /** Used when the card is in one of the 3 support slots. */
  support: cardEffectSchema,
});

/**
 * A logging or mining card is a worker (DESIGN.md §4 Workers): it works one tree kind or mine
 * type, and its one ability acts on that place only (the game scopes its modifiers to it). The
 * modifiers apply as written: the card's power multiplies the place's output by itself.
 */
export const workerCardSchema = z.strictObject({
  ...cardBase,
  job: z.enum(['logging', 'mining']),
  worker: z.strictObject({
    /** Player-facing summary, e.g. "+10% output here". */
    description: z.string().min(1),
    /** How the card strikes its place. */
    harvest: harvestPatternSchema,
    modifiers: z.array(modifierSchema).default([]),
  }),
});

export const cardSchema = z.discriminatedUnion('job', [fightingCardSchema, workerCardSchema]);

const count = z.number().int().min(0);
const atLeastOne = decimal.refine((d) => d.gte(1), { message: 'must be at least 1' });
const perTier = <T extends z.ZodType>(schema: T) =>
  z.strictObject({
    wood: schema,
    bronze: schema,
    silver: schema,
    gold: schema,
    prismatic: schema,
    mythic: schema,
    heirloom: schema,
  });
/** One entry per tier that has a next tier: every tier but the Heirloom. */
const perTierUp = <T extends z.ZodType>(schema: T) =>
  z.strictObject({
    wood: schema,
    bronze: schema,
    silver: schema,
    gold: schema,
    prismatic: schema,
    mythic: schema,
  });
const perRarity = <T extends z.ZodType>(schema: T) =>
  z.strictObject({
    common: schema,
    uncommon: schema,
    rare: schema,
    epic: schema,
    legendary: schema,
    mythic: schema,
    void: schema,
  });
const perJob = <T extends z.ZodType>(schema: T) =>
  z.strictObject({ mining: schema, logging: schema, fighting: schema });

/** Card progression numbers (cardRules.json; DESIGN.md §5). All tunable. */
const weaponFactorSchema = z.strictObject({
  damage: z.number().positive(),
  health: z.number().positive(),
});

export const cardRulesSchema = z.strictObject({
  /** Cards a new game owns at Bronze ★1 Lv 1, each leading its job (at most one per job). */
  startCards: z.array(id),
  /** Loadout cost of a card, by rarity (11.4). */
  cost: perRarity(count),
  /** Each job's cost cap before `loadout.costCap` modifiers: base + perLevel × (account level − 1). */
  costCap: z.strictObject({ base: count, perLevel: count }),
  /** Level cap of each tier (Heirloom 140); stars do not change it (DESIGN.md §5). */
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
   * Base damage and health use the star multiplier instead of the perStar part and their own
   * tier step: (1 + perLevel × (level − 1)) × starMultiplier[stars − 2] (1 at ★1) × statTier.
   */
  power: z.strictObject({
    perLevel: z.number().min(0),
    perStar: z.number().min(0),
    star6Bonus: z.number().min(0),
    /** Multiplier of base damage and health at ★2 … ★6 (DESIGN.md §5 star impact). */
    starMultiplier: z.array(z.number().positive()).length(MAX_STARS - 1),
    tier: perTier(z.number().positive()),
    /**
     * Tier multiplier of base damage and health (and worker power), DESIGN.md §5 Tier: a step at
     * least as big as ★6 over ★1, so a tier-up that restarts the stars never weakens the card.
     */
    statTier: perTier(z.number().positive()),
  }),
  /**
   * What a main card adds to its job as it grows (11.2: base power, gauge speed). Each value is
   * multiplied by (power − 1): a Bronze ★1 Lv 1 main adds nothing; every level, star and tier
   * adds more.
   */
  mainGrowth: perJob(z.array(modifierSchema)),
  /**
   * The star bar (DESIGN.md §5): each duplicate adds `fillPerDuplicate` (by rarity) to the card's
   * saved fill. A star takes `needs[rarity][tier]` copies of it, the same for all five stars of
   * that tier: a fraction at low tiers, 1 at the rarity's top tier. Star dust pays for the missing
   * part: `dust[rarity][tier]` is the dust price of one whole copy.
   */
  starBar: z.strictObject({
    fillPerDuplicate: perRarity(z.number().positive()),
    needs: perRarity(perTier(z.number().positive())),
    dust: perRarity(perTier(z.number().positive())),
  }),
  /** Tier-up (to the next tier, stars kept), keyed by the tier being left, per job: Money plus
   *  the tier's Core, tree and mine gems (and Frost Sigils at Gold and Prismatic). The card must
   *  be at its level cap. Mythic → Heirloom exists only for item types whose Heirloom is open. */
  tierUp: perTierUp(perJob(z.array(costSchema).min(1))),
  /** Base health of a card by rarity, multiplied by its power (DESIGN.md §6). The fighting
   *  loadout's health pool sums its cards. */
  health: perRarity(positiveDecimal),
  /**
   * Base damage per second of a card by rarity (DESIGN.md §5), with the same ratios as health.
   * Fighting damage is the main card's base damage × its power, then the modifiers.
   */
  baseDamage: perRarity(positiveDecimal),
  /**
   * Weapon identities (DESIGN.md §5): each fighting type's factor on a card's base damage and
   * base health. The signature, gauge and crit parts of an identity are on the cards' main
   * abilities; these two keep the types' total power within about 10% of each other.
   */
  weapons: z.strictObject({
    sword: weaponFactorSchema,
    greatsword: weaponFactorSchema,
    spear: weaponFactorSchema,
    lance: weaponFactorSchema,
    dagger: weaponFactorSchema,
    hammer: weaponFactorSchema,
    bow: weaponFactorSchema,
    staff: weaponFactorSchema,
    scythe: weaponFactorSchema,
  }),
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
  /**
   * False keeps a dungeon out of the game until its theme is decided (DESIGN.md §6 Three new
   * dungeons): it is left out of `content.dungeons` (still in `content.allDungeons`), and its
   * names, enemies and drops are placeholders. Dev builds can open them (`loadContent`).
   */
  enabled: z.boolean().default(true),
  /** Dungeon whose clear unlocks this one; null = open from the start. */
  unlockedBy: id.nullable(),
  /**
   * How many floors the dungeon has (DESIGN.md §6 Dungeon floors). The last floor holds the boss
   * below; the others hold waves of the `enemies`, with a mini-boss on every 10th floor
   * (`combat.json` `floors`). The dungeon is cleared when its last-floor boss first dies.
   */
  floors: z.number().int().min(1),
  /**
   * The normal enemies of the dungeon's waves (DESIGN.md §6 Normal enemies). `hpWeight` sets how
   * a wave's HP is shared among its enemies, so each type has its own HP and purse.
   */
  enemies: z.array(z.strictObject({ id, name, hpWeight: z.number().gt(0).default(1) })).min(1),
  /**
   * Which arena background this dungeon fights in (DESIGN.md §6, Arena backgrounds). Optional: a
   * dungeon without one, or with an id the renderer has no art for yet, gets the default brick
   * room. The renderer maps ids to backgrounds (`stage/arenaBackground.ts`).
   */
  background: id.optional(),
  boss: z.strictObject({
    id,
    name,
    /** Which boss drawing to use; a boss without one shows a plain labelled placeholder. */
    art: z.enum(BOSS_ARTS).optional(),
    /** The boss's weak and resisted elements (DESIGN.md §6 Elements in combat). */
    weakness: z.enum(ELEMENTS),
    resistance: z.enum(ELEMENTS),
    hp: positiveDecimal,
    /** The HP is shown as this many stacked bars ("x N" lives). */
    hpBars: z.number().int().min(1).max(100).default(10),
    /** The boss hits the fighting loadout back (DESIGN.md §6). Enemies do not grow with
     *  Ascension. */
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
    /** Currencies granted on every kill, each a range (inclusive): Money (DESIGN.md §3).
     *  Deeper dungeons pay more. Crystals come as a wage instead. */
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
    /** Currencies paid for every second of fighting this dungeon's boss (not while knocked out;
     *  DESIGN.md §3): both crystals in every dungeon, so pulls do not grow with kill speed, and
     *  Money in the first dungeon, so the very first levels can be bought before the first kill. */
    wages: z.array(z.strictObject({ resource: id, perSecond: positiveDecimal })).default([]),
    /** Paid once, on the dungeon's first clear (the crystal purses, DESIGN.md §3). */
    firstClear: z.array(z.strictObject({ resource: id, amount: positiveDecimal })).default([]),
    /** Further materials dropped on every kill, each a range like the currencies (the Frostspire
     *  Vault drops Frost Sigils for the Prismatic card upgrades; DESIGN.md §5). */
    extraMaterials: z
      .array(
        z
          .strictObject({
            resource: id,
            min: z.number().int().min(0),
            max: z.number().int().min(0),
            /** Chance per kill (1 = every kill); the Ember Crypt's Frost drops are rare. */
            chance: z.number().gt(0).max(1).default(1),
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
 * against a target with a fixed HP; the score is the share of that HP dealt (not capped: tiers
 * above 1 are the extra levels). Every tier whose `score` was reached pays its rewards; a score
 * of 1 clears it.
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
          /** Share of the target HP (0.25 = 25%, 1 = all of it, 2 = twice its HP). */
          score: z.number().gt(0),
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
export const GOAL_PAGES = [
  'home',
  'cards',
  'production',
  'dungeons',
  'summon',
  'shop',
  'skills',
] as const;
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
  /** The first summon, while no card has been pulled (DESIGN.md §3). */
  'first_summon',
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
  /** The cheapest next level of a tool line (DESIGN.md §4 Tool lines). */
  'tool_line',
  /** A free worker slot and a production card that is not working (DESIGN.md §4 Workers). */
  'worker_slot',
  /** Skill points waiting to be spent (DESIGN.md §10). */
  'skill_points',
  /** A new game's wishlist is empty (DESIGN.md §7 Wishlist). */
  'wishlist',
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const progressionSchema = z.strictObject({
  /** E2: tier from the lifetime total harvested of each production gem, kept through prestige.
   *  The first four tiers are the metals; tiers above them (more thresholds) keep the prismatic
   *  coin and add the same bonus each. */
  gemMastery: z.strictObject({
    thresholds: z
      .array(positiveDecimal)
      .min(MASTERY_TIERS)
      .refine(increasing, { message: 'thresholds must increase' }),
    perTier: z.array(masteryBonusSchema),
  }),
  /** E3: a special dungeon's medal tier comes from its best score (0..1), kept through prestige.
   *  Dungeons have stage stars instead (`combat.json` `stageStars`, DESIGN.md §6). */
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
const difficultySchema = z.strictObject({
  hp: z.number().min(1),
  attack: z.number().min(1),
  purse: z.number().min(1),
  material: z.number().int().min(1),
  /** The fighting wage per second (crystals, and Money in the first dungeon; DESIGN.md §6 Harder
   *  modes pay more). */
  wage: z.number().min(1),
  /** Card XP, per second fought and per kill. */
  xp: z.number().min(1),
});

/** One value per stage star level (Wood .. Mythic, DESIGN.md §6 Stage stars). */
export const STAGE_STAR_LEVELS = 6;

const stageStarsSchema = z.strictObject({
  /** Kills on a stage (one tier of one dungeon) that reach each star level, increasing. */
  kills: z
    .array(z.number().int().min(1))
    .length(STAGE_STAR_LEVELS)
    .refine(increasing, { message: 'kill counts must increase' }),
  /** Damage on that stage per star level: 0.05 = +5% a level. */
  damagePerLevel: z.number().min(0),
  /** Loot on that stage per star level (Money purses and material chances): 0.1 = +10%. */
  lootPerLevel: z.number().min(0),
  /** The star level (1-based) from which the stage's overflow switch can be turned on. */
  overflowFromLevel: z.number().int().min(1).max(STAGE_STAR_LEVELS),
  /** The one-time chest of each level: amounts per resource per level, times the tier's factor. */
  chests: z.strictObject({
    rewards: z.array(
      z.strictObject({
        resource: id,
        amounts: z
          .array(decimal.refine((d) => d.gte(0), { message: 'must not be negative' }))
          .length(STAGE_STAR_LEVELS),
      }),
    ),
    difficulty: z.strictObject({
      normal: z.number().min(0),
      hard: z.number().min(0),
      nightmare: z.number().min(0),
    }),
  }),
});

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
   * The Challenge (DESIGN.md §6 Farming and Challenge, Auto-challenge): seconds on its timer by
   * what the floor holds, and how long auto-challenge waits after a loss before it tries again.
   */
  challenge: z.strictObject({
    timerSeconds: z.strictObject({
      wave: z.number().gt(0),
      miniboss: z.number().gt(0),
      boss: z.number().gt(0),
    }),
    autoWaitSeconds: z.number().min(0),
  }),
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
  /**
   * Floors (DESIGN.md §6 Dungeon floors, §3 Ladders). A floor's strength is measured against the
   * dungeon's boss: floor `f` of `n` is worth `hpGrowth^(f - n)` of the boss's HP and attack. A
   * normal floor is a wave of `waveSize` enemies sharing `waveHpShare` of that HP and attacking
   * for `waveAttackShare` of that attack; every `miniBossEvery`-th floor holds a mini-boss (one of
   * the dungeon's enemies, named with `miniBossPrefix`) with the mini-boss shares; the last floor
   * holds the boss itself. An enemy's drops are the boss's, scaled by its share of the boss's HP.
   */
  floors: z.strictObject({
    hpGrowth: z.number().min(1),
    waveHpShare: z.number().gt(0).max(1),
    waveAttackShare: z.number().gt(0),
    waveSize: z
      .strictObject({ min: z.number().int().min(1), max: z.number().int().min(1) })
      .refine((w) => w.min <= w.max, { message: 'min must not exceed max' }),
    miniBossEvery: z.number().int().min(2),
    miniBossHpShare: z.number().gt(0).max(1),
    miniBossAttackShare: z.number().gt(0),
    miniBossPrefix: z.string().min(1),
    /**
     * Deeper pays more (DESIGN.md §6): on top of following HP, an enemy's Money purse is
     * multiplied by this for every floor it stands below the first (the boss on floor `n` pays
     * this^(n - 1) of its purse in dungeons.json), and for every endless depth.
     */
    purseFloorBonus: z.number().min(1),
  }),
  /**
   * Difficulty tiers (DESIGN.md §6 Difficulty tiers): what Hard and Nightmare multiply on top of
   * Normal. `hp` and `attack` scale every enemy, `purse` every Money purse (purses follow HP,
   * §3 Ladders, and a harder tier pays half as much again for the same damage, §6 Deeper pays
   * more) and `material` the units of every material drop. The endless depths below
   * Nightmare use Nightmare's numbers and grow by `floors.hpGrowth` with every depth.
   */
  difficulties: z.strictObject({
    hard: difficultySchema,
    nightmare: difficultySchema,
  }),
  /**
   * Stage stars (DESIGN.md §6): every mini-boss floor and last-floor boss of Normal, Hard and
   * Nightmare is a stage with six star levels earned by kills there.
   */
  stageStars: stageStarsSchema,
  /**
   * Elements in combat (DESIGN.md §6), as percents added to damage or output: the main card on the
   * boss's weakness, on its resistance (negative), each support on the weakness, and a worker on a
   * matching tree or mine.
   */
  elements: z.strictObject({
    weakness: decimal,
    resistance: decimal.refine((d) => d.gte(-50), { message: 'a resistance is never a wall' }),
    supportBonus: decimal,
    production: decimal,
  }),
  /** Crits (DESIGN.md §6): base chance (0..1) and damage multiplier of a critical hit. */
  crit: z.strictObject({
    chance: z.number().min(0).max(1),
    damage: decimal.refine((d) => d.gte(1), { message: 'must be at least 1' }),
  }),
});

// ---- Cosmetics ----------------------------------------------------------------------------
// The visual language of a cosmetic is data: CSS custom property values ("tokens"), named CSS
// recipes for things a token cannot express (decorations, patterns), and named animation
// effects. See docs/ASSET_RULES.md §6 for the naming rules.

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
     (chrome-*), framed panels (frame-*, with the raised body and the pixel frame's edge, light top and dark bottom),
     the two fonts (font-ui for text, font-display for headings and big numbers) and tooltips
     (tip-*). chrome-accent-lo is the gold's shadow; chrome-xp, -logging, -mining and -burst are
     the XP bar and the job colours. */
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
    'chrome-accent-lo',
    'chrome-active-bg',
    'chrome-xp',
    'chrome-logging',
    'chrome-mining',
    'chrome-burst',
    'frame-bg',
    'frame-radius',
    'frame-line',
    'frame-title-bg',
    'frame-title-line',
    'frame-title-ink',
    'frame-ink',
    'frame-ink-muted',
    'frame-raised',
    'frame-edge',
    'frame-hi',
    'frame-lo',
    'font-ui',
    'font-display',
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
  /** Card portals: how many cards of each rarity can be marked on the wishlist (DESIGN.md §7).
   *  0 = no wishlist (the other kinds). */
  wishlistPerRarity: z.number().int().min(0).default(0),
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
      perLevel: z.array(modifierSchema).default([]),
      /** A rule a level opens instead of a modifier (DESIGN.md §9 More to buy with Starlight):
       *  `second_worker_slots` (each level gives the next tree or mine a second worker slot, only
       *  once every place has its first), `autobuyer_trees`, `autobuyer_mines` (§15), `expedition_slot` (each level one more expedition
       *  slot, §15). */
      grants: z
        .enum(['second_worker_slots', 'autobuyer_trees', 'autobuyer_mines', 'expedition_slot'])
        .optional(),
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
 * medal tier, any mine level, any cosmetic at its max level, stage stars, workers, tool lines, depth,
 * the forge, the wishlist and the skill tree (balance update).
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
  /** Ascension challenge completions in all (DESIGN.md §15). */
  z.strictObject({ kind: z.literal('challenge_completions'), amount: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('offline_hours'), hours: z.number().positive() }),
  z.strictObject({ kind: z.literal('gem_mastery'), tier: z.number().int().min(1).max(4) }),
  z.strictObject({ kind: z.literal('boss_mastery'), tier: z.number().int().min(1).max(4) }),
  z.strictObject({ kind: z.literal('milestone'), level: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal('max_cosmetic') }),
  /** `count` stages (default 1) at star level `level` or more (1 Wood .. 6 Mythic). */
  z.strictObject({
    kind: z.literal('stage_stars'),
    level: z.number().int().min(1).max(6),
    count: z.number().int().min(1).default(1),
  }),
  /** A dungeon with every stage of every star difficulty at `level` or more. */
  z.strictObject({ kind: z.literal('dungeon_starred'), level: z.number().int().min(1).max(6) }),
  /** Star levels earned over all stages. */
  z.strictObject({ kind: z.literal('star_total'), amount: z.number().int().min(1) }),
  /** Workers at work on trees and mines now. */
  z.strictObject({ kind: z.literal('workers'), count: z.number().int().min(1) }),
  /** Tool line levels bought this run, all lines together. */
  z.strictObject({ kind: z.literal('tool_levels'), amount: z.number().int().min(1) }),
  /** The deepest layer or age of any tree or mine (1-based). */
  z.strictObject({ kind: z.literal('depth'), layer: z.number().int().min(2) }),
  /** The forge has a worker and a recipe. */
  z.strictObject({ kind: z.literal('forge_working') }),
  /** Bonds discovered (DESIGN.md §15 Bonds). */
  z.strictObject({ kind: z.literal('bonds_found'), count: z.number().int().min(1) }),
  /** Expedition trips collected (DESIGN.md §15 Expeditions). */
  z.strictObject({ kind: z.literal('expeditions_done'), count: z.number().int().min(1) }),
  /** Cards marked on the wishlist. */
  z.strictObject({ kind: z.literal('wishlist'), count: z.number().int().min(1) }),
  /** Marked cards that are owned now. */
  z.strictObject({ kind: z.literal('wishlist_owned'), count: z.number().int().min(1) }),
  /** Skills of the account tree with at least one rank. */
  z.strictObject({ kind: z.literal('skills_learned'), amount: z.number().int().min(1) }),
  /** Keystones learned. */
  z.strictObject({ kind: z.literal('keystones'), amount: z.number().int().min(1) }),
  /** Weapon circles revealed (a card of the type reached Gold). */
  z.strictObject({ kind: z.literal('circles_open'), amount: z.number().int().min(1) }),
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
  'workers',
  'forge',
  'elements',
  'dungeons',
  'ascension',
] as const;
export type SkillBranch = (typeof SKILL_BRANCHES)[number];

export const SKILL_KINDS = ['small', 'large', 'keystone'] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
/** The steps of a hidden weapon circle, in order; each opens when a card reaches its tier. */
export const CIRCLE_STEPS = ['gold', 'prismatic', 'mythic', 'heirloom'] as const;
export type CircleStep = (typeof CIRCLE_STEPS)[number];

const skillEffectSchema = z.strictObject({ name, perRank: z.array(modifierSchema).min(1) });
const skillKindRuleSchema = z.strictObject({
  cost: z.number().int().min(1),
  maxRank: z.number().int().min(1),
  scale: positiveDecimal,
});

/**
 * Account XP, levels, the reward track, the account tree and its respec (account.json).
 * XP (through `xp.account`, scope job): per unit harvested by job × the gem tier's weight, per
 * boss kill × killTierGrowth^(dungeon tier − 1), per pull, per Glimmer Trial attempt, per
 * ascension. Level L → L + 1 costs xpBase × xpGrowth^(L − 1); each level gives skill points;
 * there is no level cap. The account tree is generated: every branch uses the same `skeleton`
 * (slots in rings) and the effects in its `branches` entry; the weapon circles are written out.
 */
const accountFileSchema = z.strictObject({
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
    xpBase: positiveDecimal,
    xpGrowth: atLeastOne,
    skillPointsPerLevel: z.number().int().min(0),
    /** Skill points per achievement unlocked. */
    pointsPerAchievement: z.number().int().min(0),
    /** Skill points per stage star level earned (DESIGN.md §6). */
    pointsPerStageStar: z.number().int().min(0),
  }),
  /** The cost cap of the fighting loadout never grows past this (DESIGN.md §10). */
  loadoutCostCapTop: z.number().int().min(1),
  /** What reaching a level gives besides its skill points (E7), for the levels listed. */
  rewardTrack: z.array(
    z.strictObject({
      level: z.number().int().min(2),
      resources: z.array(costSchema).default([]),
      cosmetics: z.array(id).default([]),
      /** Extra loadout cost cap for every job, kept from then on (`loadout.costCap`). */
      costCap: z.number().int().min(0).default(0),
    }),
  ),
  /** Past the last listed level, every `every` levels gives `resources` (and nothing else). */
  rewardRepeat: z.strictObject({
    every: z.number().int().min(1),
    resources: z.array(costSchema),
  }),
  /** What one kind of skill costs and how it scales: a skill's modifiers are × `scale`. */
  skillKinds: z.strictObject({
    small: skillKindRuleSchema,
    large: skillKindRuleSchema,
    keystone: skillKindRuleSchema,
  }),
  /** The shared shape of a branch: ring 0 is open from the start, ring N opens with Ascension N. */
  skeleton: z
    .array(
      z.strictObject({
        slot: id,
        ring: z.number().int().min(0),
        kind: z.enum(SKILL_KINDS),
        /** Slots of the same branch that need a rank first. */
        requires: z.array(id),
        /** Which of the branch's effects of this kind it carries (wraps around). */
        effect: z.number().int().min(0),
      }),
    )
    .min(1),
  /** Each branch's effects: small and large ones cycle over the skeleton, one keystone. */
  branches: z.array(
    z.strictObject({
      branch: z.enum(SKILL_BRANCHES),
      small: z.array(skillEffectSchema).min(1),
      large: z.array(skillEffectSchema).min(1),
      keystone: skillEffectSchema,
    }),
  ),
  /** Which card tier opens each step of a weapon circle. */
  circleSteps: z.array(z.strictObject({ step: z.enum(CIRCLE_STEPS), tier: z.enum(RANK_TIERS) })),
  /** Written-out weapon circles (one item type each), skills in order. */
  circles: z.array(
    z.strictObject({
      kind: z.enum(ITEM_KINDS),
      skills: z.array(
        z.strictObject({
          id,
          name,
          step: z.enum(CIRCLE_STEPS),
          kind: z.enum(SKILL_KINDS),
          requires: z.array(id),
          perRank: z.array(modifierSchema).min(1),
        }),
      ),
    }),
  ),
  /** Respec (DESIGN.md §10): `freePerAscension` free ones each run, then `cost` Starlight. */
  respec: z.strictObject({ cost: positiveDecimal, freePerAscension: z.number().int().min(0) }),
  /** Node ids from before the balance update → the node a bought rank moves to when a save loads. */
  legacySkills: z.record(id, id),
});

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** A skill of the account tree (generated from the skeleton, or written in a circle). */
export interface SkillNode {
  id: string;
  name: string;
  /** A circle skill uses the branch of its item type's job (colour and gem). */
  branch: SkillBranch;
  /** Skill points per rank. */
  cost: number;
  maxRank: number;
  /** Nodes that need at least one rank first. */
  requires: string[];
  perRank: ModifierData[];
  kind: SkillKind;
  /** Ring 0 is open from the start; ring N opens when the Ascension count reaches N. */
  ring: number;
  /** The weapon type of a circle skill. */
  circle?: ItemKind;
  /** The circle step that must be reached (a card of the type at that tier). */
  step?: CircleStep;
}

/** The pickaxe is a mining item, the logging axe a logging item, every other type a fighting one. */
const circleBranchOf = (kind: ItemKind): SkillBranch =>
  kind === 'pickaxe' ? 'mining' : kind === 'logging_axe' ? 'logging' : 'combat';

function generateTree(a: z.output<typeof accountFileSchema>): SkillNode[] {
  const out: SkillNode[] = [];
  for (const b of a.branches) {
    const seen = new Map<object, number>();
    for (const slot of a.skeleton) {
      const rule = a.skillKinds[slot.kind];
      const list = slot.kind === 'small' ? b.small : slot.kind === 'large' ? b.large : [b.keystone];
      const effect = list[slot.effect % list.length]!;
      const nth = seen.get(effect) ?? 0;
      seen.set(effect, nth + 1);
      out.push({
        id: `${b.branch}_${slot.slot}`,
        name: nth > 0 ? `${effect.name} ${ROMAN[nth] ?? nth + 1}` : effect.name,
        branch: b.branch,
        cost: rule.cost,
        maxRank: rule.maxRank,
        requires: slot.requires.map((r) => `${b.branch}_${r}`),
        perRank: effect.perRank.map((m) => ({ ...m, value: m.value.mul(rule.scale) })),
        kind: slot.kind,
        ring: slot.ring,
      });
    }
  }
  for (const c of a.circles) {
    for (const s of c.skills) {
      const rule = a.skillKinds[s.kind];
      out.push({
        id: s.id,
        name: s.name,
        branch: circleBranchOf(c.kind),
        cost: rule.cost,
        maxRank: rule.maxRank,
        requires: s.requires,
        perRank: s.perRank,
        kind: s.kind,
        ring: 0,
        circle: c.kind,
        step: s.step,
      });
    }
  }
  return out;
}

export const accountSchema = accountFileSchema.transform((a) => ({
  ...a,
  /** Every skill: the branches from the skeleton, then the circles. */
  tree: generateTree(a),
}));
export type AccountConfig = z.output<typeof accountSchema>;
export type RewardTrackEntry = AccountConfig['rewardTrack'][number];

/**
 * Card enhancements (DESIGN.md §10b, 12.2, 12.3; enhancements.json): from `unlockRank`, each card
 * picks options from its own list within its tier's point budget. An option's modifiers apply
 * while the card is in a loadout (source `enhancement`). Respec is free.
 */
export const enhancementsSchema = z.strictObject({
  unlockRank: rankSchema,
  /** Milestone levels (DESIGN.md §5 Level): an option of milestone `n` opens at card level
   *  `n × milestoneEvery`; milestone 0 is open from the unlock rank. */
  milestoneEvery: z.number().int().min(1),
  budget: perTier(z.number().int().min(0)),
  cards: z.record(
    id,
    z
      .array(
        z.strictObject({
          id,
          name,
          cost: z.number().int().min(1),
          /** 0 = open from the start; n = opens at card level n × `milestoneEvery`. */
          milestone: z.number().int().min(0).default(0),
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
    tier: z.number().int().min(1).max(16),
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
 * card). `weapon` is an item type; `baseArt` is the unskinned art.
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
  weapon: z.enum(ITEM_KINDS),
  /** The unskinned art. Absent for a generic kind (its art varies by rarity): unskinned = no art id. */
  baseArt: skinArtId.optional(),
  skins: z.array(weaponSkinSchema).min(1),
});

/**
 * A training line of the Dungeons drawer (DESIGN.md §6 Training): a fighting upgrade bought again
 * and again with Money, like a tree or mine level. Level `n` multiplies `stat` (for the fighting
 * job) by (1 + ratePercent% x n) x milestones.multiplier^(n / milestones.every, rounded down).
 * Reset on Ascension.
 */
export const trainingSchema = z.strictObject({
  id,
  name,
  /** What it raises, as the words after the amount ("+5% damage"). */
  effect: z.string().min(1),
  stat: z.enum(STATS),
  cost: costCurveSchema,
  ratePercent: decimal.refine((d) => d.gt(0), { message: 'must be above 0' }),
  milestones: milestoneSchema,
});
export type Training = z.output<typeof trainingSchema>;

/**
 * A coin of the Money display (DESIGN.md §3 Coins): Money is shown in the biggest coin it fills,
 * one coin being 10^power Money. The first coin has power 0 and the powers rise.
 */
export const coinSchema = z.strictObject({
  id,
  name,
  power: z.number().int().min(0),
});
export type Coin = z.output<typeof coinSchema>;

/**
 * A bond (DESIGN.md §15 Bonds): two specific cards in the same loadout unlock a small named bonus.
 * Content of the table update (save format 27); the rule is not built yet.
 */
export const bondSchema = z
  .strictObject({
    id,
    name,
    /** The two card ids, in the order the Codex shows them. */
    cards: z.tuple([id, id]),
    /** What it gives while both cards are in the same loadout. */
    modifiers: z.array(modifierSchema).min(1),
  })
  .refine((b) => b.cards[0] !== b.cards[1], { message: 'a bond pairs two different cards' });
export type Bond = z.output<typeof bondSchema>;

/** The fighting item types: the weapons a duel role leans on (DESIGN.md §6 card duel). */
export const WEAPON_KINDS = [
  'sword',
  'greatsword',
  'spear',
  'lance',
  'dagger',
  'hammer',
  'bow',
  'staff',
  'scythe',
] as const;

/** What a card's signature attack does in the duel (DESIGN.md §6 card duel). */
export const skillSignatureSchema = z.discriminatedUnion('kind', [
  /** Strikes the enemy for the weapon's signature power (the existing signature attack). */
  z.strictObject({ kind: z.literal('strike') }),
  /** Heals every standing team card by `share` of its own max health, instead of striking. */
  z.strictObject({ kind: z.literal('heal'), share: z.number().gt(0).max(1) }),
]);

/**
 * A duel skill (DESIGN.md §6 card duel, skills.json): the role a card fights in and what its
 * signature attack does. Every number is a multiplier on the card's own stats; 1 = unchanged.
 */
export const skillSchema = z.strictObject({
  id,
  name,
  /** The role, for the UI: fighter, striker, tank, healer, debuffer, glass_cannon. */
  role: z.enum(['fighter', 'striker', 'tank', 'healer', 'debuffer', 'glass_cannon']),
  description: z.string().min(1),
  /** Enemies hit a standing guard before the other cards. */
  guard: z.boolean().default(false),
  /** Multiplies the card's damage and its health. */
  damage: z.number().gt(0).default(1),
  health: z.number().gt(0).default(1),
  /** While the card stands, the enemy's attacks deal this share less (several multiply). */
  weaken: z.number().min(0).max(0.9).default(0),
  signature: skillSignatureSchema,
});
export type Skill = z.output<typeof skillSchema>;

/** skills.json: the skills, the one each weapon type leans to, and cards that break the leaning. */
export const skillsFileSchema = z.strictObject({
  skills: z.array(skillSchema).min(1),
  weapons: z.strictObject(
    Object.fromEntries(WEAPON_KINDS.map((k) => [k, id])) as Record<
      (typeof WEAPON_KINDS)[number],
      typeof id
    >,
  ),
  /** Card id -> its own skill (a unique may break its weapon's leaning). */
  cards: z.record(id, id).default({}),
});
export type SkillsConfig = z.output<typeof skillsFileSchema>;

/**
 * An expedition place (DESIGN.md §15 Expeditions), opened by clearing its dungeon. Its rewards
 * (that area's materials, some gems and card XP) are added by the package that builds the rule.
 */
export const expeditionPlaceSchema = z.strictObject({
  id,
  name,
  /** The dungeon whose first clear opens the place. */
  dungeon: id,
  /** Cards of this element bring back double. */
  element: z.enum(ELEMENTS),
  /** What a trip brings back, per hour of the trip (DESIGN.md §15 [Default]). */
  rewards: z.strictObject({
    /** The area's materials, whole units an hour. */
    materials: z.array(z.strictObject({ resource: id, perHour: z.number().positive() })).min(1),
    /** Gems: seconds of the gem's tree or mine output (at its current level) an hour. */
    gems: z
      .array(z.strictObject({ resource: id, secondsPerHour: z.number().positive() }))
      .default([]),
    /** Card XP an hour, as a share of the levels the card is on (0.1 = a tenth of a level). */
    cardXpLevels: z.number().min(0),
  }),
});
export type ExpeditionPlace = z.output<typeof expeditionPlaceSchema>;

export const expeditionsSchema = z.strictObject({
  /** The trip lengths a player can pick, in hours, shortest first. */
  durationsHours: z
    .array(z.number().positive())
    .min(1)
    .refine((list) => list.every((h, i) => i === 0 || h > list[i - 1]!), {
      message: 'durations go from shortest to longest, each once',
    }),
  places: z.array(expeditionPlaceSchema),
});
export type ExpeditionsConfig = z.output<typeof expeditionsSchema>;

/** What a challenge takes away (src/game/challenges.ts applies each through the modifier pipeline). */
export const CHALLENGE_RESTRICTIONS = [
  /** The fighting loadout's supports give no effect and no health. */
  'no_supports',
  /** Only Common cards count in the fighting loadout (effects, health, and the main's damage). */
  'commons_only',
  /** Training gives nothing. */
  'no_training',
  /** Only one worker works. */
  'one_worker',
] as const;
export type ChallengeRestriction = (typeof CHALLENGE_RESTRICTIONS)[number];

/**
 * An Ascension challenge (DESIGN.md §15): an Ascension run under a rule, completed by clearing a
 * target, up to three times with harder targets, each completion giving a permanent reward. The
 * rule is in words (`rule`), as named restrictions and as penalty modifiers.
 */
export const ascensionChallengeSchema = z.strictObject({
  id,
  name,
  /** The rule in words, as the side portal shows it. */
  rule: z.string().min(1),
  /** What the run loses, by name (see CHALLENGE_RESTRICTIONS). */
  restrictions: z.array(z.enum(CHALLENGE_RESTRICTIONS)).default([]),
  /** Modifiers that apply only while the challenge is the run's rule (source `challenge`). */
  penalties: z.array(modifierSchema).default([]),
  /** One target per completion, easiest first: the floor to reach in a dungeon tier under the rule. */
  targets: z
    .array(
      z.strictObject({
        dungeon: id,
        difficulty: z.enum(['normal', 'hard', 'nightmare']).default('normal'),
        floor: z.number().int().min(1),
      }),
    )
    .length(3),
  /** The permanent reward of each completion. */
  rewards: z.array(z.array(modifierSchema).min(1)).length(3),
});
export type AscensionChallenge = z.output<typeof ascensionChallengeSchema>;

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
  training: z.array(trainingSchema).min(1),
  coins: z
    .array(coinSchema)
    .min(1)
    .refine(
      (list) =>
        list[0]!.power === 0 && list.every((c, i) => i === 0 || c.power > list[i - 1]!.power),
      {
        message: 'the first coin has power 0 and each coin is worth more than the one before',
      },
    ),
  weaponSkins: z.array(weaponSkinSetSchema),
  items: itemsSchema,
  /** Save format 27 (the table update): content for rules not built yet. */
  bonds: z.array(bondSchema),
  expeditions: expeditionsSchema,
  challenges: z.array(ascensionChallengeSchema),
  skills: skillsFileSchema,
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
export type FightingCard = z.output<typeof fightingCardSchema>;
export type WorkerCard = z.output<typeof workerCardSchema>;
export type WorkerAbility = WorkerCard['worker'];
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
