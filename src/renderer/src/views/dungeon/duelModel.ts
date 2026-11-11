import { Decimal, type DuelFeedEntry, type SkillEvent } from '../../../../game';

/**
 * The duel's view model (DESIGN.md §6 What the duel shows; UI_RULES.md §2 The duel's layout, The
 * duel in detail). Pure helpers the duel's DOM (`stage/arena.ts`) reads: no DOM, no game rules.
 */

/** The colour of each place in the hand (UI_RULES §2 The duel in detail): gold, cyan, green, violet. */
export const SLOT_COLOURS = ['gold', 'cyan', 'green', 'violet'] as const;
export type SlotColour = (typeof SLOT_COLOURS)[number];

export function slotColour(slot: number): SlotColour {
  const n = SLOT_COLOURS.length;
  return SLOT_COLOURS[((slot % n) + n) % n]!;
}

// ---- the hand ---------------------------------------------------------------------------------

/** Art pixels of one card and of the hand's layout. */
export const HAND = {
  cardW: 132,
  cardH: 186,
  /** Art pixels two neighbours overlap. */
  overlap: 20,
  /** Art pixels the two outer cards sit lower. */
  drop: 8,
} as const;

/** Where card `i` of `count` sits in the hand, in art pixels from the hand's top left. */
export function handSlot(i: number, count: number): { x: number; y: number } {
  const outer = count > 2 && (i === 0 || i === count - 1);
  return { x: i * (HAND.cardW - HAND.overlap), y: outer ? HAND.drop : 0 };
}

/** The hand's size in art pixels. */
export function handSize(count: number): { w: number; h: number } {
  const n = Math.max(1, count);
  return {
    w: HAND.cardW + (n - 1) * (HAND.cardW - HAND.overlap),
    h: HAND.cardH + (n > 2 ? HAND.drop : 0),
  };
}

/**
 * CSS px wide a hand card wants to be in a duel `height` CSS px tall, and the most it may take:
 * the hand stands about 42% of the height (its bottom is cut by the edge) and never more than 55%.
 * The screen scale then rounds it to a whole scale (`fitCard`).
 */
export function handCardWant(height: number): { want: number; max: number } {
  const ratio = HAND.cardW / HAND.cardH;
  return { want: height * 0.42 * ratio, max: height * 0.55 * ratio };
}

/** The hop of a card that hits: 40% of its hit interval, clamped to 160..420 ms. */
export function hopMs(intervalSeconds: number): number {
  const ms = intervalSeconds * 1000 * 0.4;
  if (!Number.isFinite(ms)) return 420;
  return Math.round(Math.min(420, Math.max(160, ms)));
}

/** Art pixels a hop lifts a card. */
export const HOP_ART_PX = 6;

// ---- the floor's pips --------------------------------------------------------------------------

export type PipState = 'done' | 'now' | 'wait';
export interface Pip {
  state: PipState;
  /** The enemy behind the pip: a boss's pip is a gold diamond, a mini-boss's is red. */
  kind: 'enemy' | 'miniboss' | 'boss';
}

/** A pip per enemy of the floor: `index` (1-based) is the one being fought. */
export function floorPips(
  index: number,
  kinds: ReadonlyArray<'enemy' | 'miniboss' | 'boss'>,
): Pip[] {
  return kinds.map((kind, i) => ({
    kind,
    state: i + 1 < index ? 'done' : i + 1 === index ? 'now' : 'wait',
  }));
}

/** A floor enemy's kind as a pip kind. */
export function pipKind(kind: string): Pip['kind'] {
  return kind === 'boss' ? 'boss' : kind === 'miniboss' ? 'miniboss' : 'enemy';
}

// ---- the enemy card ----------------------------------------------------------------------------

/** What happened to the enemy card between two renders. */
export type EnemyMoment = 'same' | 'walk' | 'deal';

/**
 * `walk` when the next enemy of the same dungeon stands ahead (a kill, a floor won), `deal` when
 * the dungeon or the tier changed (no walk, the card is simply dealt), `same` otherwise.
 */
export function enemyMoment(
  before: { dungeon: string; difficulty: string; key: string } | null,
  now: { dungeon: string; difficulty: string; key: string } | null,
): EnemyMoment {
  if (!now) return 'same';
  if (!before) return 'deal';
  if (before.key === now.key) return 'same';
  if (before.dungeon !== now.dungeon || before.difficulty !== now.difficulty) return 'deal';
  return 'walk';
}

/** The enemy's damage tag: the damage dealt to this enemy so far. */
export function enemyDamage(hp: Decimal, maxHp: Decimal): Decimal {
  return Decimal.max(maxHp.sub(hp), 0);
}

/** Face-down backs drawn for the enemies still to come: one per enemy, at most five. */
export function deckBacks(waiting: number): number {
  return Math.max(0, Math.min(5, Math.floor(waiting)));
}

/** The pixel number style: the one the player wears, Stamped Numerals (`forge-1`) otherwise. */
export function numberStyle(worn: string | null | undefined): string {
  const s = (worn ?? '').trim();
  return s || 'forge-1';
}

// ---- the hit feed and the stat sheet -----------------------------------------------------------

export const FEED_LINES = 4;

export interface FeedLine {
  /** Where the card sits in the hand (its colour), -1 when the card left the team. */
  slot: number;
  damage: Decimal;
  hits: number;
  signature: boolean;
}

/** The newest feed lines, at most four, each with its card's place in the hand. */
export function feedLines(feed: readonly DuelFeedEntry[], order: readonly string[]): FeedLine[] {
  return feed.slice(0, FEED_LINES).map((e) => ({
    slot: order.indexOf(e.cardId),
    damage: e.damage,
    hits: e.hits,
    signature: e.signature,
  }));
}

export interface SheetRow {
  cardId: string;
  slot: number;
  damage: Decimal;
  /** The bar: the card's damage as a share of the top card's, 0..1. */
  bar: number;
}

/** A stat sheet row per team card in hand order, its bar against the card that dealt most. */
export function sheetRows(
  perCard: Readonly<Record<string, Decimal>>,
  order: readonly string[],
): SheetRow[] {
  const zero = new Decimal(0);
  const damages = order.map((id) => perCard[id] ?? zero);
  const top = damages.reduce((a, b) => Decimal.max(a, b), zero);
  return order.map((cardId, slot) => ({
    cardId,
    slot,
    damage: damages[slot]!,
    bar: top.gt(0) ? Math.min(1, damages[slot]!.div(top).toNumber()) : 0,
  }));
}

// ---- skill plates -------------------------------------------------------------------------------

export const PLATE_HOLD_MS = 1600;
export const PLATE_MAX = 2;

export interface Plate {
  id: number;
  cardId: string;
  skillId: string;
  kind: SkillEvent['kind'];
  count: number;
  /** When it went up, ms. */
  at: number;
}

/**
 * The skill plates after `events` fired at `now` (oldest first in `events`): new plates queue
 * behind the ones showing, plates older than the hold are dropped, at most two show at once (the
 * rest wait their turn).
 */
export function queuePlates(
  queue: readonly Plate[],
  events: readonly SkillEvent[],
  now: number,
  nextId: number,
): { queue: Plate[]; nextId: number } {
  let id = nextId;
  const fresh = events.map((e) => ({
    id: id++,
    cardId: e.cardId,
    skillId: e.skillId,
    kind: e.kind,
    count: e.count,
    at: now,
  }));
  return { queue: [...queue, ...fresh], nextId: id };
}

/**
 * The plates showing at `now` and the queue kept: a showing plate ends PLATE_HOLD_MS after it
 * showed; a waiting plate starts when a place frees up (its `at` moves to then).
 */
export function showPlates(
  queue: readonly Plate[],
  now: number,
): { showing: Plate[]; queue: Plate[] } {
  const q = queue.map((p) => ({ ...p }));
  for (let i = 0; i < Math.min(PLATE_MAX, q.length);) {
    const p = q[i]!;
    if (now - p.at < PLATE_HOLD_MS) {
      i += 1;
      continue;
    }
    // it ends; the first waiting plate takes its place from that moment on
    const end = p.at + PLATE_HOLD_MS;
    q.splice(i, 1);
    const promoted = q[PLATE_MAX - 1];
    if (promoted && promoted.at < end) promoted.at = end;
    i = 0;
  }
  return { showing: q.slice(0, PLATE_MAX), queue: q };
}

// ---- the left column ---------------------------------------------------------------------------

export type DuelDoing = 'farming' | 'challenge' | 'knockout' | 'trial';

export function duelDoing(input: {
  trial: boolean;
  challenge: boolean;
  knockoutSeconds: number;
}): DuelDoing {
  if (input.trial) return 'trial';
  if (input.knockoutSeconds > 0) return 'knockout';
  return input.challenge ? 'challenge' : 'farming';
}

/** "0:54": a Challenge's time left, whole seconds rounded up. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- the full view's panels --------------------------------------------------------------------

export type DuelPanel = 'dungeons' | 'weapon' | 'training';
export const DUEL_PANELS: readonly DuelPanel[] = ['dungeons', 'weapon', 'training'];

/** The panel open after a click on `clicked`'s button: it opens, or closes when it was open. */
export function togglePanel(open: DuelPanel | null, clicked: DuelPanel): DuelPanel | null {
  return open === clicked ? null : clicked;
}
