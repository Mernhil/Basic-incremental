// Dev cheats are NOT exported here: they live in the separate `game/dev` entry, loaded only
// behind `import.meta.env.DEV` so release bundles never contain them (see dev.ts).
export { GAME_TITLE, formatVersionLabel } from './meta';
export * from './num';
export * from './format';
export * from './rng';
export * from './state';
export * from './drops';
export * from './report';
export * from './tick';
export * from './combat';
export * from './loop';
export * from './offline';
export * from './migrations';
export * from './save';
export * from './theme';
export * from './modifiers';
export * from './production';
// ---- Production cards in play (DESIGN.md §4): the contract with the UI ----------------------
export {
  /** The harvest pattern (style, interval, strikes, targeting) the job's main card strikes with. */
  mainHarvestPattern,
  /** Ids of a job's support cards whose effect helps its harvest. */
  harvestSupports,
} from './harvest';
export {
  /** Ready-to-show view of one production job's stage: cards, pattern, gauge 0..1, next strike, targets. */
  productionStageView,
  type ProductionStageView,
  type StageCard,
  type StageTarget,
} from './productionView';
export * from './hpBars';
export * from './cards';
export * from './milestones';
export * from './bulk';
export * from './previews';
export * from './mastery';
export * from './stages';
export * from './goals';
export * from './portals';
export * from './prestige';
export * from './wardrobe';
export * from './achievements';
export * from './account';
export * from './upgrades';
export { METALS, type Metal } from '../data';

// ---- Ascension (DESIGN.md §9): the contract with the UI, one line each ---------------------

export {
  /** The Ascension gate: Starlight gain, minimum, can ascend, rewards, what resets / persists. */
  ascensionPreview,
  /** Ascends: grants Starlight and prestige cosmetics, resets the run, starts a new one. */
  ascend,
  /** Starlight an ascension would grant now (after `prestige.gain`). */
  starlightGain,
  /** Weighted gems harvested this run (what the gain grows with). */
  runPoints,
  /** Prestige cosmetic ids the n-th ascension grants. */
  ascensionRewards,
  /** The Starlight shop: each item's level, price (null at max), affordable, bonus now / next. */
  starlightShop,
  /** Buys one level of a Starlight shop item. */
  buyStarlightItem,
  /** Ids of what an ascension resets / keeps, in display order. */
  ASCENSION_RESETS,
  ASCENSION_PERSISTS,
  type AscensionPreview,
  type AscendResult,
  type StarlightOffer,
  type StarlightBuyResult,
  type AscensionResetPart,
  type AscensionPersistPart,
} from './prestige';
// ---- Account, skill tree, card enhancements (DESIGN.md §10): the contract with the UI ----

export {
  /** Header: account level, XP toward the next level, bar 0..1, skill points (total/spent/free). */
  accountInfo,
  /** Account level of a state. */
  accountLevel,
  /** XP from one level to the next (quick early, slow later). */
  xpToNextAccountLevel,
  /** The reward track: every level 2..max with skill points, crystals, cosmetics, cost cap, reached. */
  rewardTrack,
  /** The account tree: each node's rank, max, requirements met, can buy, bonus now / next. */
  skillTree,
  /** Buys one rank of a tree node with skill points. */
  buySkill,
  /** Respec: free once per ascension, else its Starlight price; points refunded. */
  respecInfo,
  /** Refunds every skill point (free or for Starlight). */
  respecSkills,
  /** A card's enhancement chart: unlocked, budget, spent, options (chosen, can choose). */
  cardEnhancements,
  /** Picks one enhancement option for a card within its budget. */
  chooseEnhancement,
  /** Clears a card's enhancements (free). */
  resetEnhancements,
  type AccountInfo,
  type TrackLevel,
  type SkillNodeInfo,
  type SkillPoints,
  type SkillBuyResult,
  type RespecInfo,
  type RespecResult,
  type CardEnhancementInfo,
  type EnhanceResult,
} from './account';

// ---- Achievements and shard shop (DESIGN.md §10, §11): the contract with the UI ---------------

export {
  /** The sticker book: every achievement with unlocked, when, value / target and progress 0..1. */
  achievementList,
  /** Unlocks what an action just earned (rewards granted); call after pulls, upgrades, ... */
  checkAchievements,
  /** The shard shop: each item's price, affordable, bought, left (null = unlimited). */
  shardShop,
  /** Spends card shards on a shop item (card copy, resource bundle or cosmetic). */
  buyShardItem,
  type AchievementEntry,
  type ShardOffer,
  type ShardBuyResult,
} from './achievements';

// ---- Wardrobe (DESIGN.md §8): the contract with the UI, one line each --------------------

export {
  /** Adds one copy of a cosmetic: new at level 1, or a copy for its upgrade levels. */
  grantCosmetic,
  /** The item grid: owned, level / max, copies, next ladder step, upgrade check, source, worn. */
  wardrobeItems,
  /** Equips an owned item globally or on one card (exclusives only on their card). */
  equipCosmetic,
  /** Clears a slot: globally back to the starter, on a card back to the global choice. */
  unequipCosmetic,
  /** What an owned card shows after its rank's wear rules (for the mannequin card). */
  resolveCardFor,
  /** The next upgrade level's checklist: copies and Glimmer Dust / Facet Shards. */
  cosmeticUpgradeCheck,
  /** Material price of reaching a level (after modifiers). */
  cosmeticUpgradeCost,
  /** Spends copies and material and raises the level; worn copies follow. */
  upgradeCosmetic,
  /** What each level adds, level 1 first (shape, accent, gems, glow, ambient). */
  cosmeticLadder,
  /** Where an item comes from: starter, dungeon, prestige, achievement, reward track, shard shop or the Wardrobe Gate. */
  cosmeticSource,
  /** Each set's progress (equipped / total) and whether its bonus applies. */
  setBonuses,
  /** The skin id worn on a weapon kind (e.g. 'soul_reaper'), or null = unskinned. */
  weaponSkinFor,
  /** The art id to draw for a weapon kind: the worn skin's art, else its base art (null = no skins). */
  weaponSkinArt,
  /** Every skin of a weapon kind for the picker: name, art, cost, available, equipped. */
  weaponSkinChoices,
  /** Wears a skin on a weapon kind, or null for the unskinned weapon; does not touch cosmetic slots. */
  equipWeaponSkin,
  /** Whether a skin exists for that weapon and can be worn now (legacy skins need to be owned). */
  isWeaponSkinAvailable,
  /** Whether a legacy skin was pulled from the Legacy Gate. */
  ownsLegacySkin,
  /** The art a card's generic weapon kind draws with at a tier when a legacy skin is worn (null at the Heirloom tier or when none). */
  legacyWeaponArt,
  type WeaponSkinChoice,
  type EquipWeaponSkinResult,
  type WardrobeItem,
  type CosmeticUpgradeCheck,
  type CosmeticUpgradeResult,
  type CosmeticRequirement,
  type CosmeticSource,
  type EquipResult,
  type SetBonusInfo,
} from './wardrobe';
export {
  /** Highest upgrade level of an item: by rarity (DESIGN.md §8); starters keep theirs. */
  cosmeticMaxLevel,
} from './theme';

// ---- Summon portals (DESIGN.md §7): the contract with the UI, one line each --------------------

export {
  /** Pulls 1 or 10 times from a portal: pays, rolls with pity and the 10-pull guarantee, grants. */
  pull,
  /** A portal card on the shelf: prices, affordability, pity bar, guarantee, rates, pulls made. */
  portalInfo,
  /** Price of a single pull or a 10-pull after modifiers. */
  pullPrice,
  /** Pulls in a row without the pity rarity before it is guaranteed, after modifiers. */
  pityThreshold,
  type PullCount,
  type PullResult,
  type PullOutcome,
  type PullFailure,
  type PortalInfo,
  type CosmeticGain,
} from './portals';

// ---- Progression layer (DESIGN.md §4, §6, §10, §12): the contract with the UI, one line each ---------------

export {
  /** A production gem's mastery: settled tier 0..4, metal, lifetime total, next threshold, bar 0..1. */
  gemMastery,
  /** A dungeon's medal (kills) or a special dungeon's (best score): tier, metal, bar 0..1. */
  bossMastery,
  /** The metal of a tier 0..4 (stone .. prismatic). */
  metalOf,
  type GemMasteryInfo,
  type BossMasteryInfo,
  type MasteryInfo,
} from './mastery';
export {
  /** Growth stage 0..4 of a tree / mine tile (mine and tree level milestones). */
  tileStage,
} from './stages';
export {
  /** The item type to draw in a card. */
  cardItemKind,
  /** The item to draw with its name at the card's tier, whether it is an Heirloom and the look rarity. */
  cardItem,
  /** The name of an item type at a tier for a card's rarity (Wooden Sword ... Solaris). */
  itemName,
  /** The highest tier a card can reach: its rarity's cap, or the Heirloom when open. */
  cardTopTier,
  /** The highest tier before an Heirloom, by rarity. */
  RARITY_TIER_CAP,
  /** On-screen name of each tier. */
  TIER_LABELS,
  /** A tier's name for a card of a rarity: Mythic or Void at T6. */
  tierLabel,
  /** The side of a card's T6 and Heirloom: 'mythic' or 'void'. */
  cardSide,
  /** The item rarity to draw for a card's rarity and tier: one step up the rarity ladder per tier, capped at Void. */
  weaponLookRarity,
  /** Whether a rank is at least another (tier, then stars). */
  rankAtLeast,
  type CardItem,
  type CardUpgradeResult,
} from './cards';
export {
  /** The n (default 3) nearest goals by estimated time, for the header quest scroll. */
  nextGoals,
  /** Every goal the data's rules find, nearest first. */
  allGoals,
  /** Units of a resource earned per second (production with bursts, plus drops being fought). */
  incomePerSecond,
  type Goal,
} from './goals';
export {
  /** One tier-up moment for anything with tiers (mastery, medals, milestones, stages, cards). */
  type TierUp,
  /** What tiered up. */
  type TierUpKind,
} from './report';

// ---- Juice pass (DESIGN.md §6, §4, §11): the contract with the UI, one line each ----------

export {
  /** Crit chance (0..1) and damage multiplier after modifiers, for a dungeon. */
  critStats,
  /** Average damage factor from crits, 1 + chance x (damage - 1); what the simulation deals. */
  critFactor,
  /** Rolls whether one shown hit crits (stage only, never changes the state). */
  rollCritForShow,
  /** One shown hit: rolls a crit and gives the number to float. */
  rollHitForShow,
  /** Average DPS with signature attacks and crits (the stage's DPS readout). */
  averageDps,
  /** Boss kills per minute in a dungeon (60 / seconds per kill). */
  killsPerMinute,
  /** DPS, average DPS, kills per minute and time-to-kill for the active dungeon. */
  stageReadout,
  type CritStats,
  type StageReadout,
} from './combat';
export {
  /** A mine type's milestone info by id ("Lv 25: x2"). */
  mineLevelMilestone,
  /** A tree kind's milestone info by id ("Lv 25: x2"). */
  treeLevelMilestone,
  /** A tree kind's level (0 = none bought). Reset on ascension. */
  treeLevel,
  /** Level of a tree or mine in a job. */
  producerLevel,
  /** Money price of a tree kind's next level. */
  treeLevelCost,
  /** Buys one level of a tree kind (`buyTreeLevels` does x10 / x100 / Max). */
  buyTreeLevel,
} from './production';
export {
  /** Milestones reached at a level. */
  milestonesReached,
  /** Output multiplier at a level (multiplier ^ milestones reached). */
  milestoneMultiplier,
  /** The next milestone's level and the multiplier it adds. */
  nextMilestone,
  /** Milestone info ready to show: reached, multiplier, next level, levels to go, progress. */
  milestoneInfo,
  /** Milestone levels crossed by a purchase (for the celebration and toast). */
  milestonesCrossed,
  /** Visual growth stage 0..4 of a tile (one step per milestone). */
  growthStage,
  type MilestoneInfo,
} from './milestones';
export {
  /** Safety cap on levels priced or bought in one go. */
  MAX_BULK_LEVELS,
  /** Price of N levels from `owned` on an exponential curve. */
  curveBulkPrice,
  /** Most levels a budget buys on a curve, and their price. */
  curveMaxAffordable,
  /** A buy button's offer on a curve: count, price, affordable, fill-bar progress 0..1. */
  curveOffer,
  /** Buy offer of a mine type's levels. */
  mineLevelOffer,
  /** Buys mine levels in bulk. */
  buyMineLevels,
  /** Buy offer of a tree kind's levels (x1 / x10 / x100 / Max). */
  treeLevelOffer,
  /** Buys tree levels in bulk. */
  buyTreeLevels,
  type BuyCount,
  type BuyOffer,
  type BulkBuyResult,
} from './bulk';
export {
  /** Mine level purchase preview: gem per second before / after. */
  previewMineLevel,
  /** Tree level purchase preview: gem per second before / after. */
  previewTreeLevel,
  type MinePreview,
  type TreePreview,
} from './previews';

// ---- Boss hits in chunks (DESIGN.md §6): the contract with the UI, one line each ----------

export {
  /** Damage of attack number k (1, 2, 3 ...) as a multiple of a normal attack: 0.4, ..., 4 (the slam). */
  bossAttackMultiplier,
  /** Whether attack number k is a slam (every sixth attack). */
  isBossSlam,
  /** Number of the last attack landed by a play-time in seconds (attack k lands at k x interval). */
  bossAttacksBy,
  /** Number of the first slam after attack k. */
  nextBossSlam,
  type BossPattern,
} from './bossAttacks';
