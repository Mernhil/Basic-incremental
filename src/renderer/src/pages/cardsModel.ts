import type { JOBS, Rank, Rarity, CardElement } from '../../../data';
import type { GameState, TierUp } from '../../../game';
import type { CardFace } from '../ui/cardFace';
import type { StarChartView } from './skillsModel';
export type Job = (typeof JOBS)[number];

/**
 * What the Cards page needs from the card logic, as plain display data. The page only talks to
 * this interface; `createCardsModel` (cardsAdapter.ts) maps the game's card API onto it, so the
 * page does not change when card rules or numbers are retuned.
 */

export interface Requirement {
  label: string;
  met: boolean;
  /** "3 of 7", "Lv 28 / 28", "done" ... */
  value: string;
}

export interface UpgradeStep {
  kind: 'star' | 'tier';
  /** "Next star: ★4", "Tier-up to Silver ★3" */
  title: string;
  /** What it gives, e.g. "Adds power and raises the level cap to 32." */
  note: string;
  requirements: Requirement[];
  /** Button text, e.g. "Add star · 2 copies", "Tier up · 150,000 Money, 6 Moss Core" */
  action: string;
  ready: boolean;
}

/** One price of a tier-up, as the weapon panel's cost tag shows it. */
export interface CostChip {
  /** Resource id (the icon and name come from it). */
  id: string;
  name: string;
  have: string;
  need: string;
  met: boolean;
}

/**
 * The weapon panel's view of an owned card (DESIGN.md §5, §11): level and XP, the star bar and
 * the next tier-up with its price. Built by `weaponView` (weaponModel.ts); the panel draws it in
 * the dungeon drawer and on the Cards detail.
 */
export interface WeaponView {
  /** The weapon's name at its tier (items.json; the Heirloom's own name at the Heirloom tier). */
  weapon: string;
  tier: Rank['tier'];
  tierName: string;
  level: number;
  cap: number;
  atCap: boolean;
  /** Progress to the next level, 0..1 (1 at the cap). */
  xp: number;
  /** XP held and XP the next level takes, as numbers to show ("121", "190"); empty at the cap. */
  xpNow: string;
  xpNeed: string;
  stars: number;
  /** The star bar towards the next star; null at ★6. */
  starBar: {
    fill: number;
    need: number;
    /** fill / need, 0..1. */
    gauge: number;
    ready: boolean;
    /** "4 / 7 copies to ★4" */
    text: string;
    /** "×1.6 → ×2" */
    impact: string;
  } | null;
  /** The next tier-up, or null at the weapon's top tier. */
  tierUp: {
    toTier: Rank['tier'];
    toName: string;
    /** The step to the Heirloom (button "Reveal <name>"). */
    heirloom: boolean;
    /** leveling: below the cap; ready: at the cap and paid for; short: at the cap, missing prices. */
    phase: 'leveling' | 'ready' | 'short';
    /** "Reach Lv 40 to tier up. It costs:" below the cap, "It costs:" at it. */
    lead: string;
    costs: CostChip[];
    /** The button text. */
    action: string;
    ready: boolean;
    /** What is missing, for the tag's hint ("Missing Frost Sigil."), empty when nothing is. */
    missing: string;
    /** The level cap is reached. */
    levelMet: boolean;
    /** The card is at ★6, which a tier-up needs (DESIGN.md §5). */
    starsMet: boolean;
    /** Why the tier-up cannot be taken, as the dark button says it ("Needs ★6", "Needs Lv 40",
     *  "Missing Money"); empty when it can. */
    blocker: string;
  } | null;
  /** Why there is no tier-up (top tier, or the Heirloom is not drawn yet); null otherwise. */
  endNote: string | null;
}

export interface LoadoutRole {
  job: Job;
  slot: 'main' | 'support';
}

export interface CardEntry {
  id: string;
  name: string;
  job: Job;
  rarity: Rarity;
  emblem: string;
  /** Signature item markup (art/items.ts). */
  item: string;
  element: CardElement;
  owned: boolean;
  /** Owned cards only; unowned cards show their starting rank greyed out. */
  rank: Rank;
  level: number;
  cap: number;
  /** Progress to the next level, 0..1. */
  xp: number;
  /** The star bar's fill (copies waiting for the next star). */
  duplicates: number;
  cost: number;
  mainAbility: string;
  supportEffect: string;
  /** The bottom plate of the card face (ability, speed, level, progress). */
  face: CardFace;
  role: LoadoutRole | null;
  /** The next star-up (the star bar), or null at ★6. */
  next: UpgradeStep | null;
  /** The next tier-up (level cap, Money, materials), or null at the card's top tier. */
  tier: UpgradeStep | null;
  /** The weapon panel's data (level ring, star bar, tier-up cost); null when not owned. */
  weapon: WeaponView | null;
}

export interface JobLoadout {
  job: Job;
  /** Card ids: index 0 is the main card, 1..3 the supports (null = empty). */
  slots: Array<string | null>;
  cost: number;
  cap: number;
}

/** A card action's result; tier-ups (DESIGN.md §12) play their moment. */
export type ModelResult =
  { ok: true; state: GameState; tierUps?: TierUp[] } | { ok: false; reason: string };

export interface CardsModel {
  entries(state: GameState): CardEntry[];
  /** One card's entry (cheaper than `entries` when a panel follows a single card), or null. */
  entry(state: GameState, id: string): CardEntry | null;
  loadout(state: GameState, job: Job): JobLoadout;
  shards(state: GameState): string;
  /** Changes in what the page shows structurally (not per-tick numbers). */
  signature(state: GameState): string;
  setMain(state: GameState, id: string): ModelResult;
  addSupport(state: GameState, id: string): ModelResult;
  remove(state: GameState, id: string): ModelResult;
  /** Takes the card's next star (from the star bar) or its next tier. */
  upgrade(state: GameState, id: string, kind: 'star' | 'tier'): ModelResult;
  /** The card's enhancement star chart (DESIGN.md §10b), or null when not owned. */
  chart(state: GameState, id: string): StarChartView | null;
  /** Picks one enhancement option within the card's budget. */
  enhance(state: GameState, id: string, optionId: string): ModelResult;
  /** Clears the card's enhancements (free). */
  resetEnhancements(state: GameState, id: string): ModelResult;
}
