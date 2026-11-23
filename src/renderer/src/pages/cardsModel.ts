import type { JOBS, Rank, Rarity, CardElement } from '../../../data';
import type { SkinPickerView } from './cardSkinsModel';
import {
  MAX_LOADOUT_HEIRLOOMS,
  MAX_LOADOUT_STARTERS,
  type GameState,
  type TierUp,
} from '../../../game';
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
  /** The exact numbers behind a shortened value (the star bar's percent). */
  title?: string;
}

export interface UpgradeStep {
  kind: 'star';
  /** "Next star: ★4", "Tier-up to Silver ★3" */
  title: string;
  /** What it gives, e.g. "Adds power and raises the level cap to 32." */
  note: string;
  requirements: Requirement[];
  /** Button text, e.g. "Add star · 2 copies", "Tier up · 150,000 Money, 6 Moss Core" */
  action: string;
  ready: boolean;
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
  /** What the next star changes: damage per second and health now → after; empty at ★6. */
  starStats: StatChange[];
  /** The star bar towards the next star; null at ★6. */
  starBar: {
    fill: number;
    need: number;
    /** fill / need, 0..1. */
    gauge: number;
    ready: boolean;
    /** "40% to ★4" */
    text: string;
    /** The exact numbers for the tooltip: "0.05 / 0.125 copies to ★2". */
    title: string;
    /** "×1.6 → ×2" */
    impact: string;
    /** Star dust that tops up the next star (DESIGN.md §5); null when the bar is full or there is no dust to spend. */
    dust: { cost: number; have: number; affordable: boolean; label: string } | null;
  } | null;
  /** "Breakthrough levels: ..." while the card's next level is one of the levels that carry it
   *  onto the next tier's power step (they need much more XP); null otherwise. */
  breakthrough: string | null;
  /** The note under the stars: the card's tier is its own for good (DESIGN.md §5 No tier-ups), or
   *  where an Heirloom's stars come from. */
  endNote: string;
}

/** One stat an upgrade changes for the chosen card: real numbers now and after, and the gain. */
export interface StatChange {
  label: string;
  now: string;
  after: string;
  /** "+21%" for a number that grows; empty for a word or when nothing changes. */
  gain: string;
}

/** One number of the weapon panel's stat list. */
export type DetailStatKey =
  | 'hit'
  | 'speed'
  | 'dps'
  | 'crit'
  | 'critdmg'
  | 'health'
  | 'role'
  | 'position'
  | 'element'
  | 'cost'
  | 'output'
  | 'works';

export interface DetailStat {
  /** Which stat it is (the panel picks its icon chip and colour by it). */
  key: DetailStatKey;
  label: string;
  value: string;
  title?: string;
  /** What the next level and the next star add to this stat, "+12%" (absent when it does not change). */
  up?: { level?: string; star?: string };
}

/**
 * One thing a card does, for the weapon panel's "What it does" list: its three attacks (hit, skill,
 * ultimate), an ability, the team bonus, a bond.
 */
export interface DetailEntry {
  kind: 'hit' | 'skill' | 'ult' | 'ability' | 'team' | 'bond';
  /** The kind's label ("Ultimate"). */
  kindLabel: string;
  /** The entry's own name ("Cleave", "Oath of Dawn"); empty when the kind says it all. */
  name: string;
  /** Plain words with the current values filled in. */
  text: string;
  /** The key numbers, short ("Active", "needs Golden Axe at work"). */
  values: string[];
  /** What an attack's effects do, one line each. */
  effects?: string[];
  /** Why an attack does not fire yet. */
  note?: string | null;
  /** An attack's state: open, locked (Cores open it) or none (no slot at this tier). */
  state?: 'open' | 'locked' | 'none';
  /** The exact source text, for a tooltip. */
  title?: string;
  active?: boolean;
}

/** What the next level or the next star adds, as numbers; `text` is plain when there is no next. */
export interface DetailNext {
  label: string;
  text: string;
  /** The extra line: what the star still needs. */
  note: string;
  /** There is a next one (false at the level cap or at six stars). */
  available: boolean;
}

/** The weapon panel's read-only detail of an owned card (stats, what it does, what comes next). */
/** One corner of the stat graph: the stat as a 0 to 1 share of the strongest card's, now and after. */
export interface GraphAxis {
  key: DetailStatKey;
  now: number;
  /** After the next level / the next star (null when there is none). */
  level: number | null;
  star: number | null;
}

/** The power number (a display sum, see `powerOf`) now and what the next star and level make of it. */
export interface PowerView {
  now: string;
  /** Power with the next star (null at six stars). */
  withStar: string | null;
  /** What the next level adds (null at the level cap). */
  levelGain: string | null;
}

export interface WeaponDetail {
  stats: DetailStat[];
  power: PowerView;
  /** The six-corner stat graph of a fighting card (null for a worker). */
  graph: GraphAxis[] | null;
  does: DetailEntry[];
  nextLevel: DetailNext;
  nextStar: DetailNext;
}

/** The four stat tiles of a card and the line comparing it with the weakest other loadout card. */
export interface StatTiles {
  tiles: Array<{ label: string; value: string; title: string }>;
  /** "vs Wooden Sword: +12% damage, −8% health"; the card's own note when there is nothing to compare. */
  compare: string;
}

export interface LoadoutRole {
  job: Job;
  /** The loadout slot, 0 to 3, left to right: the four cards are equal. */
  slot: number;
}

export interface CardEntry {
  id: string;
  /** An Heirloom card (at most two in a loadout). */
  heirloom: boolean;
  /** One of the five starter weapons (at most one in a loadout). */
  starter?: boolean;
  name: string;
  job: Job;
  rarity: Rarity;
  emblem: string;
  /** The item type the card carries (`items.json`) and its name, for the collection groups. */
  itemKind: string;
  itemType: string;
  /** Signature item markup (art/items.ts). */
  item: string;
  element?: CardElement;
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
  /** A fighting card's main ability, or a worker's ability. */
  /** A fighting card's role: Tank, DPS or Support (DESIGN.md §5 Roles); null for a worker. */
  combatRole: 'tank' | 'dps' | 'support' | null;
  /** A fighting card's Ability (a worker's one ability). */
  ability: string;
  /** A fighting card's support effect; empty for a worker (it has one ability). */
  /** A fighting card's Team bonus; empty for a worker. */
  teamBonus: string;
  /** A worker's workplace name ("Oak"), or null when it works nowhere or is a fighting card. */
  workplace: string | null;
  /** The bottom plate of the card face (ability, speed, level, progress). */
  face: CardFace;
  role: LoadoutRole | null;
  /** The next star-up (the star bar), or null at ★6. */
  next: UpgradeStep | null;
  /** The weapon panel's data (level ring, star bar, tier-up cost); null when not owned. */
  weapon: WeaponView | null;
  /** The stat tiles with their compare line (DESIGN.md §5 Show the stats). */
  stats: StatTiles;
  /** The weapon panel's stats, what it does and what comes next; null when not owned. */
  detail: WeaponDetail | null;
}

/** The fighting loadout (the only job with one, DESIGN.md §5 Loadouts). */
export interface JobLoadout {
  job: 'fighting';
  /** Card ids: index 0 is the main card, 1..3 the supports (null = empty). */
  slots: Array<string | null>;
  cost: number;
  cap: number;
  /** The next rise of the cap (how much, at which account level); null at the top. */
  nextRise: { by: number; level: number } | null;
}

/** One card a loadout slot could take (UI_RULES §2 Loadouts). */
export interface SlotChoice {
  id: string;
  cost: number;
  /** The slot the card sits in now (0 = main, 1..3 supports), or null. Picking it swaps. */
  from: number | null;
  /** It is the card already in the slot being filled. */
  current: boolean;
  /** The loadout's cost with this card in the slot, and whether that fits the cap. */
  costAfter: number;
  fits: boolean;
  /** A third Heirloom would go in (DESIGN.md §5 Cost): the picker says why it cannot. */
  heirloomBlocked: boolean;
  /** A second starter weapon would go in (DESIGN.md §2 Starter weapon). */
  starterBlocked: boolean;
}

/**
 * What a slot of a job's loadout could take: every owned card of the job with what picking it
 * would cost. A card already in another slot swaps places with the slot's card, so the cost
 * stays; any other card replaces the slot's card. Cards that fit come first, cheapest last, so
 * the strongest (costliest) cards lead.
 */
export function slotChoices(
  entries: readonly CardEntry[],
  loadout: JobLoadout,
  slot: number,
): SlotChoice[] {
  const costOf = new Map(entries.map((e) => [e.id, e.cost]));
  const heirloomIds = new Set(entries.filter((e) => e.heirloom).map((e) => e.id));
  const starterIds = new Set(entries.filter((e) => e.starter).map((e) => e.id));
  const occupant = loadout.slots[slot] ?? null;
  const occupantCost = occupant ? (costOf.get(occupant) ?? 0) : 0;
  return entries
    .filter((e) => e.owned && e.job === loadout.job)
    .map((e): SlotChoice => {
      const at = loadout.slots.indexOf(e.id);
      const from = at >= 0 ? at : null;
      const costAfter = from !== null ? loadout.cost : loadout.cost - occupantCost + e.cost;
      const others = loadout.slots.filter((s) => s !== null && s !== occupant && s !== e.id);
      const heirlooms = others.filter((s) => heirloomIds.has(s as string)).length;
      const heirloomBlocked = e.heirloom && heirlooms + 1 > MAX_LOADOUT_HEIRLOOMS;
      const starters = others.filter((s) => starterIds.has(s as string)).length;
      const starterBlocked = Boolean(e.starter) && starters + 1 > MAX_LOADOUT_STARTERS;
      return {
        id: e.id,
        cost: e.cost,
        from,
        current: from === slot,
        costAfter,
        fits: costAfter <= loadout.cap && !heirloomBlocked && !starterBlocked,
        heirloomBlocked,
        starterBlocked,
      };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || b.cost - a.cost);
}

/** A card action's result; tier-ups (DESIGN.md §12) play their moment. */
export type ModelResult =
  { ok: true; state: GameState; tierUps?: TierUp[] } | { ok: false; reason: string };

export interface CardsModel {
  entries(state: GameState): CardEntry[];
  /** One card's entry (cheaper than `entries` when a panel follows a single card), or null. */
  entry(state: GameState, id: string): CardEntry | null;
  loadout(state: GameState, job: 'fighting'): JobLoadout;
  shards(state: GameState): string;
  /** Changes in what the page shows structurally (not per-tick numbers). */
  signature(state: GameState): string;
  /** Puts a fighting card in the first free loadout slot. */
  addToLoadout(state: GameState, id: string): ModelResult;
  remove(state: GameState, id: string): ModelResult;
  /** Puts a card in a slot (0 to 3, left to right) of its job's loadout; a card already in
   *  another slot swaps with the slot's card. */
  place(state: GameState, slot: number, id: string): ModelResult;
  /** Takes the card's next star (from the star bar) or its next tier. */
  /** Adds a star (from copies or dust), or opens the card's skill with Cores (DESIGN.md §2). */
  upgrade(state: GameState, id: string, kind: 'star' | 'dust' | 'skill'): ModelResult;
  /** The card's enhancement star chart (DESIGN.md §10b), or null when not owned. */
  chart(state: GameState, id: string): StarChartView | null;
  /** Picks one enhancement option within the card's budget. */
  enhance(state: GameState, id: string, optionId: string): ModelResult;
  /** Clears the card's enhancements (free). */
  resetEnhancements(state: GameState, id: string): ModelResult;
  /** The card's weapon skin picker (DESIGN.md §8 Card skins), or null when it has none to offer. */
  skins(state: GameState, id: string): SkinPickerView | null;
  /** Makes the card wear a skin, or null for its Original (art only). */
  setSkin(state: GameState, id: string, skinId: string | null): ModelResult;
}
