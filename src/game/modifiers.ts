import type { Content, ModifierData, ModifierKind, ModifierScope, Stat } from '../data';
import { Decimal, type DecimalSource } from './num';
import type { GameState } from './state';
import { detectSets } from './theme';
import { cardModifiers } from './cards';
import { masteryModifiers } from './mastery';
import { prestigeModifiers } from './prestige';
import { accountModifiers } from './account';
import { upgradeModifiers } from './upgrades';
import { trainingModifiers } from './training';

/**
 * The shared modifier pipeline (DESIGN.md §14). Every tunable number goes through
 * `computeStat`, fed by modifiers from skill trees, owned items, sets, cards and prestige,
 * so balancing means editing data.
 */

export const MODIFIER_SOURCE_KINDS = [
  'cosmetic',
  'set',
  'skill',
  'enhancement',
  'card',
  'prestige',
  'achievement',
  /** Gem mastery and boss medals (DESIGN.md §4, §6). */
  'mastery',
  /** Account level rewards: the reward track's cost cap bumps (DESIGN.md §10). */
  'account',
  /** Upgrade shelf purchases (DESIGN.md §4). */
  'upgrade',
] as const;
export type ModifierSourceKind = (typeof MODIFIER_SOURCE_KINDS)[number];

export interface ModifierSource {
  kind: ModifierSourceKind;
  /** Id of the item, set, skill node, card, ... that grants it. */
  id: string;
}

export interface Modifier extends ModifierData {
  source: ModifierSource;
}

/** Where a stat is being read: the job, producer, dungeon, ... it applies to. */
export type StatContext = ModifierScope;

export interface StatResult {
  base: Decimal;
  value: Decimal;
  /** Modifiers that matched, in the order they were applied. For tooltip breakdowns. */
  applied: Modifier[];
}

/** A modifier applies when every key of its scope equals the same key of the context. */
export function scopeMatches(scope: ModifierScope | undefined, context: StatContext): boolean {
  if (!scope) return true;
  for (const key of Object.keys(scope) as (keyof ModifierScope)[]) {
    const wanted = scope[key];
    if (wanted !== undefined && context[key] !== wanted) return false;
  }
  return true;
}

const ORDER: readonly ModifierKind[] = ['flat', 'percent', 'mult', 'set', 'min', 'max'];

/** The modifiers of one stat, in their original order, split by kind. */
type ByKind = Partial<Record<ModifierKind, Modifier[]>>;

interface StatIndex {
  /** Length of the list when it was indexed: a list that grew since is indexed again. */
  length: number;
  byStat: Map<Stat, Modifier[]>;
}

/**
 * Modifier lists by stat, remembered per list. One list (the result of `collectModifiers`) is
 * read for many stats in a row, so each read looks only at its own stat's modifiers instead of
 * the whole list. The order inside a stat is the list's order, so results do not change.
 */
const indexes = new WeakMap<readonly Modifier[], StatIndex>();

function modifiersOf(stat: Stat, modifiers: readonly Modifier[]): readonly Modifier[] {
  let index = indexes.get(modifiers);
  if (!index || index.length !== modifiers.length) {
    const byStat = new Map<Stat, Modifier[]>();
    for (const m of modifiers) {
      const list = byStat.get(m.stat);
      if (list) list.push(m);
      else byStat.set(m.stat, [m]);
    }
    index = { length: modifiers.length, byStat };
    indexes.set(modifiers, index);
  }
  return index.byStat.get(stat) ?? NONE;
}
const NONE: readonly Modifier[] = [];

/** The modifiers of `stat` that apply in `context`, split by kind in one pass. */
function matchingByKind(
  stat: Stat,
  modifiers: readonly Modifier[],
  context: StatContext,
): ByKind | null {
  let out: ByKind | null = null;
  for (const m of modifiersOf(stat, modifiers)) {
    if (!scopeMatches(m.scope, context)) continue;
    out ??= {};
    const list = out[m.kind];
    if (list) list.push(m);
    else out[m.kind] = [m];
  }
  return out;
}

/** Applies the kinds in their fixed order (see computeStat). */
function applyKinds(start: Decimal, kinds: ByKind): Decimal {
  let value = start;
  const flat = kinds.flat;
  if (flat) value = value.add(sum(flat));

  const percent = kinds.percent;
  if (percent) value = value.mul(sum(percent).div(100).add(1));

  const mult = kinds.mult;
  if (mult) for (const m of mult) value = value.mul(m.value);

  const set = kinds.set;
  if (set) value = set[set.length - 1]!.value;

  const floors = kinds.min;
  if (floors) value = Decimal.max(value, floors.map((m) => m.value).reduce(maxOf));

  const caps = kinds.max;
  if (caps) value = Decimal.min(value, caps.map((m) => m.value).reduce(minOf));

  return value;
}

/**
 * Applies modifiers to `base` in a fixed order:
 * base -> + flat (summed) -> x (1 + percent sum / 100) -> x each mult -> set (last wins)
 * -> min (floor: the highest one) -> max (cap: the lowest one). A cap beats a floor.
 */
export function computeStat(
  stat: Stat,
  base: DecimalSource,
  modifiers: readonly Modifier[],
  context: StatContext = {},
): StatResult {
  const start = new Decimal(base);
  const kinds = matchingByKind(stat, modifiers, context);
  if (!kinds) return { base: start, value: start, applied: [] };
  const applied = ORDER.flatMap((kind) => kinds[kind] ?? []);
  return { base: start, value: applyKinds(start, kinds), applied };
}

function sum(mods: Modifier[]): Decimal {
  return mods.reduce((acc, m) => acc.add(m.value), new Decimal(0));
}
const maxOf = (a: Decimal, b: Decimal): Decimal => Decimal.max(a, b);
const minOf = (a: Decimal, b: Decimal): Decimal => Decimal.min(a, b);

/** Shorthand when only the number is needed (it skips the breakdown list). */
export function statValue(
  stat: Stat,
  base: DecimalSource,
  modifiers: readonly Modifier[],
  context: StatContext = {},
): Decimal {
  const start = new Decimal(base);
  const kinds = matchingByKind(stat, modifiers, context);
  return kinds ? applyKinds(start, kinds) : start;
}

const withSource =
  (source: ModifierSource) =>
  (data: ModifierData): Modifier => ({ ...data, source });

/**
 * Every modifier currently active for this state. Later systems (skill trees, cards, prestige,
 * achievements) add their sources here, so callers never need to know where a bonus comes from.
 */
export function collectModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];

  // Owning a cosmetic grants its buff whether or not it is worn.
  for (const id of Object.keys(state.cosmetics.owned)) {
    const cosmetic = content.cosmeticById.get(id);
    if (!cosmetic) continue;
    out.push(...cosmetic.ownedModifiers.map(withSource({ kind: 'cosmetic', id })));
  }

  // Fully equipped sets grant their set bonus.
  for (const status of detectSets(content, state.cosmetics.loadout)) {
    if (!status.complete) continue;
    const set = content.setById.get(status.set);
    if (set) out.push(...set.modifiers.map(withSource({ kind: 'set', id: set.id })));
  }

  // Cards in the loadouts: main abilities (with main growth) and support effects.
  out.push(...cardModifiers(state, content));

  // Settled gem mastery tiers and boss medals.
  out.push(...masteryModifiers(state, content));

  // Starlight shop levels (Ascension).
  out.push(...prestigeModifiers(state, content));

  // Account tree ranks, reward track cost cap bumps, card enhancements.
  out.push(...accountModifiers(state, content));

  // Upgrade shelf purchases.
  out.push(...upgradeModifiers(state, content));
  out.push(...trainingModifiers(state, content));

  return out;
}
