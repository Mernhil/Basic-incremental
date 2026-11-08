import type { Content, ModifierData, ModifierKind, ModifierScope, Stat } from '../data';
import { Decimal, type DecimalSource } from './num';
import type { GameState } from './state';
import { detectSets } from './theme';
import { cardModifiers } from './cards';
import { masteryModifiers } from './mastery';
import { prestigeModifiers } from './prestige';
import { accountModifiers } from './account';
import { upgradeModifiers } from './upgrades';

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
  const matching = modifiers.filter((m) => m.stat === stat && scopeMatches(m.scope, context));
  const byKind = (kind: ModifierKind): Modifier[] => matching.filter((m) => m.kind === kind);

  let value = start;
  const flat = byKind('flat');
  if (flat.length) value = value.add(sum(flat));

  const percent = byKind('percent');
  if (percent.length) value = value.mul(sum(percent).div(100).add(1));

  for (const m of byKind('mult')) value = value.mul(m.value);

  const set = byKind('set');
  if (set.length) value = set[set.length - 1]!.value;

  const floors = byKind('min');
  if (floors.length) value = Decimal.max(value, floors.map((m) => m.value).reduce(maxOf));

  const caps = byKind('max');
  if (caps.length) value = Decimal.min(value, caps.map((m) => m.value).reduce(minOf));

  const applied = ORDER.flatMap(byKind);
  return { base: start, value, applied };
}

function sum(mods: Modifier[]): Decimal {
  return mods.reduce((acc, m) => acc.add(m.value), new Decimal(0));
}
const maxOf = (a: Decimal, b: Decimal): Decimal => Decimal.max(a, b);
const minOf = (a: Decimal, b: Decimal): Decimal => Decimal.min(a, b);

/** Shorthand when only the number is needed. */
export function statValue(
  stat: Stat,
  base: DecimalSource,
  modifiers: readonly Modifier[],
  context: StatContext = {},
): Decimal {
  return computeStat(stat, base, modifiers, context).value;
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

  return out;
}
