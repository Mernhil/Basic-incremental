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
export * from './hpBars';
export * from './cards';
export * from './milestones';
export * from './bulk';
export * from './previews';
export * from './mastery';
export { METALS, type Metal } from '../data';

// ---- Progression layer (DESIGN.md 16): the contract with the UI, one line each ---------------

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
  /** One tier-up moment for anything with tiers (mastery, medals, milestones, stages, cards). */
  type TierUp,
  /** What tiered up. */
  type TierUpKind,
} from './report';

// ---- Juice pass (DESIGN.md 11.11, 11.12, 14): the contract with the UI, one line each ----------

export {
  /** Crit chance (0..1) and damage multiplier after modifiers, for a dungeon. */
  critStats,
  /** Average damage factor from crits, 1 + chance x (damage - 1); what the simulation deals. */
  critFactor,
  /** Rolls whether one shown hit crits (stage only, never changes the state). */
  rollCritForShow,
  /** One shown hit: rolls a crit and gives the number to float. */
  rollHitForShow,
  /** Damage per second one damage line adds at a level, milestones included. */
  damageLineDps,
  /** A damage line's milestone info by id ("Lv 25: x2"). */
  damageLineMilestone,
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
  /** Visual growth stage 0..4 of a tile or edge (one step per milestone). */
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
  /** Buy offer of a damage line for x1 / x10 / x100 / Max. */
  damageLineOffer,
  /** Buys damage line levels (xN exactly or fails; Max as many as affordable). */
  buyDamageLevels,
  /** Buy offer of a mine type's levels. */
  mineLevelOffer,
  /** Buys mine levels in bulk. */
  buyMineLevels,
  /** Buy offer of plots / slots. */
  expansionOffer,
  /** Buys plots / slots in bulk. */
  buyExpansions,
  type BuyCount,
  type BuyOffer,
  type BulkBuyResult,
} from './bulk';
export {
  /** Damage line purchase preview: average DPS and time-to-kill before / after. */
  previewDamageLine,
  /** Mine level purchase preview: gem per second before / after (total and per slot). */
  previewMineLevel,
  /** Plot / slot purchase preview: capacity and output with the best producer before / after. */
  previewExpansion,
  type DamagePreview,
  type MinePreview,
  type ExpansionPreview,
} from './previews';
