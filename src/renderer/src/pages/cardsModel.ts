import type { JOBS, Rank, Rarity, CardElement } from '../../../data';
import type { GameState, TierUp } from '../../../game';
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
  /** "Next star: ★4", "Tier-up to Silver ★1" */
  title: string;
  /** What it gives, e.g. "Adds power and raises the level cap to 32." */
  note: string;
  requirements: Requirement[];
  /** Button text, e.g. "Add star · 1 duplicate, 3 Moss Core" */
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
  duplicates: number;
  cost: number;
  mainAbility: string;
  supportEffect: string;
  /** Short stat lines for the card face. */
  stats: [{ label: string; value: string }, { label: string; value: string }];
  role: LoadoutRole | null;
  /** The next star-up or tier-up, or null at Prismatic ★6. */
  next: UpgradeStep | null;
}

export interface JobLoadout {
  job: Job;
  /** Card ids: index 0 is the main card, 1..3 the supports (null = empty). */
  slots: Array<string | null>;
  cost: number;
  cap: number;
}

/** A card action's result; tier-ups (DESIGN.md 16, E1) play their moment. */
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
  upgrade(state: GameState, id: string): ModelResult;
}
