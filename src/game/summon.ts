import { RARITIES, type Content, type Rarity } from '../data';
import { floorKind } from './floors';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { cloneState, DIFFICULTIES, type Difficulty, type GameState } from './state';

/**
 * Scroll sources and the Focus Portal's choice (DESIGN.md §3 Crystal wage / scrolls, §7 Focus
 * Portal), and the plan of the reveal show (§7 Reveal). Scrolls come in lumps and are saved up:
 * the first win of a floor, a dungeon's first clear and the stage chests (those two are paid by
 * their own code), goals and achievements (their data) and a daily reward. Nothing ticks in per
 * second. The pull itself, the pity and the Focus Portal's pool are in `portals.ts`.
 */

const SUMMON_SCROLL = 'summon_scroll';
const GLAMOUR_SCROLL = 'glamour_scroll';

/** Scrolls paid at once: resource id -> amount. */
export interface ScrollLump {
  resource: string;
  amount: Decimal;
}

function addResource(state: GameState, resource: string, amount: Decimal): void {
  state.resources[resource] = (state.resources[resource] ?? new Decimal(0)).add(amount);
}

// ---- the first win of a floor -----------------------------------------------------------------

/**
 * What winning `floor` of a dungeon difficulty for the first time pays: both scrolls by the floor's
 * kind (wave, mini-boss, boss), times the difficulty, times `drops.crystalMultiplier` (the shelf's
 * Crystal Lure and the Starlight shop's Constellation Crystals).
 */
export function floorFirstWinScrolls(
  content: Content,
  dungeonId: string,
  difficulty: Difficulty,
  floor: number,
  modifiers: readonly Modifier[] = [],
): ScrollLump[] {
  const dungeon = content.dungeonById.get(dungeonId);
  const config = content.scrolls.floorFirstWin;
  if (!dungeon || !DIFFICULTIES.includes(difficulty)) return [];
  const factor = config.difficulty[difficulty];
  const lump = config[floorKind(content, dungeon, floor, difficulty)];
  return (
    [
      [SUMMON_SCROLL, lump.summon],
      [GLAMOUR_SCROLL, lump.glamour],
    ] as const
  ).map(([resource, base]) => ({
    resource,
    amount: statValue('drops.crystalMultiplier', base.mul(factor), modifiers, {
      dungeon: dungeonId,
      resource,
    }),
  }));
}

/** Pays the first win of a floor (mutates `state`) and returns what was paid. */
export function payFloorFirstWin(
  state: GameState,
  content: Content,
  dungeonId: string,
  difficulty: Difficulty,
  floor: number,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ScrollLump[] {
  const lumps = floorFirstWinScrolls(content, dungeonId, difficulty, floor, modifiers);
  for (const lump of lumps) addResource(state, lump.resource, lump.amount);
  return lumps;
}

// ---- the daily reward -------------------------------------------------------------------------

/** A date as the local "YYYY-MM-DD" the save keeps. */
export function localDay(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The daily reward can be claimed: it was not claimed on `today`. */
export function dailyAvailable(state: GameState, today: string): boolean {
  return state.summon.dailyClaimedDay !== today;
}

/** Claims the daily scrolls for `today` (a local "YYYY-MM-DD"); once a day. */
export function claimDaily(
  state: GameState,
  content: Content,
  today: string,
): { ok: true; state: GameState; lumps: ScrollLump[] } | { ok: false } {
  if (!dailyAvailable(state, today)) return { ok: false };
  const next = cloneState(state);
  const { daily } = content.scrolls;
  const lumps: ScrollLump[] = [
    { resource: SUMMON_SCROLL, amount: daily.summon },
    { resource: GLAMOUR_SCROLL, amount: daily.glamour },
  ];
  for (const lump of lumps) addResource(next, lump.resource, lump.amount);
  next.summon.dailyClaimedDay = today;
  return { ok: true, state: next, lumps };
}

// ---- the Focus Portal's item type ------------------------------------------------------------

/** The item types the Focus Portal can aim at: the 11 of `items.json`, in its order. */
export function focusKinds(content: Content): { kind: string; name: string }[] {
  return content.items.types.map((t) => ({ kind: t.kind, name: t.noun }));
}

/** Chooses the Focus Portal's item type (null = none); any time. An unknown type changes nothing. */
export function setFocusKind(
  state: GameState,
  content: Content,
  kind: string | null,
): { ok: true; state: GameState } | { ok: false } {
  if (kind !== null && !content.items.types.some((t) => t.kind === kind)) return { ok: false };
  if (state.summon.focusKind === kind) return { ok: true, state };
  const next = cloneState(state);
  next.summon.focusKind = kind;
  return { ok: true, state: next };
}

// ---- the reveal show --------------------------------------------------------------------------

/**
 * How a pull is shown (DESIGN.md §7 Reveal): all cards out face down at once; those of
 * `glowFrom` rarity or better glow in their rarity colour before they flip; the best card of a
 * pull of several gets the full-screen entrance (from `entranceFrom`) and flips last.
 */
export interface RevealPlan {
  /** The glow colour of each card, in pull order; null = no glow. */
  glow: (Rarity | null)[];
  /** Index of the card with the full-screen entrance, or null (a single pull, or nothing good). */
  best: number | null;
  /** The order the cards flip in: every card but the best in pull order, then the best. */
  order: number[];
}

const rank = (r: Rarity): number => RARITIES.indexOf(r);

/** Plans the reveal of a pull from the rarity of each card. The first of equal best cards wins. */
export function revealPlan(
  rarities: readonly Rarity[],
  config: Content['scrolls']['reveal'],
): RevealPlan {
  const glow = rarities.map((r) => (rank(r) >= rank(config.glowFrom) ? r : null));
  let best: number | null = null;
  if (rarities.length > 1) {
    rarities.forEach((r, i) => {
      if (best === null || rank(r) > rank(rarities[best]!)) best = i;
    });
    if (best !== null && rank(rarities[best]!) < rank(config.entranceFrom)) best = null;
  }
  const order = rarities.map((_, i) => i).filter((i) => i !== best);
  if (best !== null) order.push(best);
  return { glow, best, order };
}
