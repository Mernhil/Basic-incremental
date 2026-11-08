import type { JOBS, Rank, Rarity, CardElement } from '../../../data';
import type { GameState, TierUp } from '../../../game';
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
  /** Short stat lines for the card face. */
  stats: [{ label: string; value: string }, { label: string; value: string }];
  role: LoadoutRole | null;
  /** The next star-up (the star bar), or null at ★6. */
  next: UpgradeStep | null;
  /** The next tier-up (level cap, Money, materials), or null at the card's top tier. */
  tier: UpgradeStep | null;
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
