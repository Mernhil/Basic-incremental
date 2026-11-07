import type { Content, StarlightItem } from '../data';
import { isProductionGem } from './mastery';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, finalPrice, pay, resetProduction, type Price } from './production';
import { initialBursts, startingAmount, type GameState } from './state';
import { grantCosmetic } from './wardrobe';
import { grantAccountXp } from './account';

/**
 * Prestige, Ascension (DESIGN.md 3, 11.6, 16). An ascension resets the run (plots, slots, mine
 * levels, resources, tile stages) and keeps everything else (damage lines, cards, cosmetics,
 * unlocks, mastery, medals, portal pity, crystals). It grants Starlight from the gems harvested this run,
 * spent in the Starlight shop on permanent bonuses (modifier source `prestige`), and the n-th
 * ascension grants the prestige cosmetics listed for it. Boss HP and attack grow with the
 * prestige count (combat.ts). All numbers are in prestige.json.
 */

/** What an ascension resets, as ids for the UI to label (DESIGN.md 3, 16 E4). */
export const ASCENSION_RESETS = [
  'plots',
  'slots',
  'mine_levels',
  'resources',
  'tile_stages',
] as const;
/** What an ascension keeps. */
export const ASCENSION_PERSISTS = [
  'damage_lines',
  'cards',
  'cosmetics',
  'unlocks',
  'mastery',
  'medals',
  'portal_pity',
  'crystals',
  'starlight',
] as const;
export type AscensionResetPart = (typeof ASCENSION_RESETS)[number];
export type AscensionPersistPart = (typeof ASCENSION_PERSISTS)[number];

/** Weighted gems harvested this run: Σ (lifetime total − total at the run start) × tier weight. */
export function runPoints(state: GameState, content: Content): Decimal {
  const weights = content.prestige.gain.tierWeights;
  let points = new Decimal(0);
  for (const [id, total] of Object.entries(state.mastery.harvested)) {
    const resource = content.resourceById.get(id);
    if (!resource || !isProductionGem(content, id)) continue;
    const run = total.sub(state.prestige.runStart[id] ?? 0);
    if (run.lte(0)) continue;
    const weight = weights[Math.min(resource.tier, weights.length) - 1]!;
    points = points.add(run.mul(weight));
  }
  return points;
}

/** Starlight an ascension would grant now: floor(((points / divisor) ^ exponent) through
 *  `prestige.gain`). */
export function starlightGain(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Decimal {
  const { divisor, exponent } = content.prestige.gain;
  const points = runPoints(state, content);
  if (points.lte(0)) return new Decimal(0);
  const raw = points.div(divisor).pow(exponent);
  return Decimal.max(statValue('prestige.gain', raw, modifiers).floor(), 0);
}

/** Prestige cosmetics the n-th ascension grants. */
export function ascensionRewards(content: Content, ascension: number): string[] {
  return content.prestige.rewards
    .filter((r) => r.ascension === ascension)
    .flatMap((r) => r.cosmetics);
}

export interface AscensionPreview {
  /** Starlight the ascension grants. */
  gain: Decimal;
  /** Weighted gems harvested this run (what the gain grows with). */
  points: Decimal;
  /** Gain needed to ascend. */
  minimum: number;
  canAscend: boolean;
  /** The ascension this would be (prestige count + 1). */
  ascension: number;
  /** Cosmetic ids it grants. */
  rewards: string[];
  resets: readonly AscensionResetPart[];
  persists: readonly AscensionPersistPart[];
}

/** Everything the Ascension gate shows before confirming. */
export function ascensionPreview(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): AscensionPreview {
  const gain = starlightGain(state, content, modifiers);
  const minimum = content.prestige.gain.minimum;
  const ascension = state.prestigeCount + 1;
  return {
    gain,
    points: runPoints(state, content),
    minimum,
    canAscend: gain.gte(minimum),
    ascension,
    rewards: ascensionRewards(content, ascension),
    resets: ASCENSION_RESETS,
    persists: ASCENSION_PERSISTS,
  };
}

export type AscendResult =
  | { ok: true; state: GameState; gained: Decimal; cosmetics: string[] }
  | { ok: false; reason: 'too-early' };

/** Ascends: grants the Starlight and rewards, resets the run and starts a new one. */
export function ascend(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): AscendResult {
  const preview = ascensionPreview(state, content, modifiers);
  if (!preview.canAscend) return { ok: false, reason: 'too-early' };
  const next = resetProduction(state, content);
  const currency = content.prestige.currency;
  // Gems, Money, Cores and the rest start over; Starlight and the premium crystals are kept
  // (DESIGN.md 11.13), like the pity counters that go with them.
  for (const resource of content.resources) {
    if (resource.kind === 'prestige' || resource.kind === 'crystal') continue;
    next.resources[resource.id] = startingAmount(content, resource.id);
  }
  next.resources[currency] = (state.resources[currency] ?? new Decimal(0)).add(preview.gain);
  next.bursts = initialBursts();
  next.bossHp = null;
  next.combat = {
    ...next.combat,
    trialAttempt: { elapsedSeconds: 0, dealt: new Decimal(0) },
    loadoutDamage: new Decimal(0),
    knockoutSeconds: 0,
  };
  next.prestigeCount = preview.ascension;
  next.prestige = {
    ...next.prestige,
    runStart: { ...state.mastery.harvested },
    starlightEarned: state.prestige.starlightEarned.add(preview.gain),
  };
  for (const id of preview.rewards) grantCosmetic(next, id);
  // The account tree's free respec comes back with every ascension (DESIGN.md 12.1).
  next.account = { ...next.account, freeRespecsUsed: 0 };
  grantAccountXp(next, content, content.account.xp.perAscension, modifiers);
  return { ok: true, state: next, gained: preview.gain, cosmetics: preview.rewards };
}

// ---- Starlight shop ----------------------------------------------------------------------------

export function starlightLevel(state: GameState, itemId: string): number {
  return state.prestige.shop[itemId] ?? 0;
}

/** An item's bonus at a level: each perLevel modifier × level, source `prestige`. */
export function starlightItemModifiers(item: StarlightItem, level: number): Modifier[] {
  if (level <= 0) return [];
  return item.perLevel.map((m) => ({
    ...m,
    value: m.value.mul(level),
    source: { kind: 'prestige', id: item.id },
  }));
}

/** Every Starlight shop bonus owned. Read by `collectModifiers`. */
export function prestigeModifiers(state: GameState, content: Content): Modifier[] {
  return content.prestige.shop.flatMap((item) =>
    starlightItemModifiers(item, starlightLevel(state, item.id)),
  );
}

/** Starlight price of the next level (through `cost.multiplier`), or null at the max level. */
export function starlightPrice(
  state: GameState,
  content: Content,
  item: StarlightItem,
  modifiers: readonly Modifier[] = [],
): Price | null {
  const level = starlightLevel(state, item.id);
  if (level >= item.maxLevel) return null;
  const amount = item.cost.base.mul(item.cost.growth.pow(level));
  return finalPrice(content.prestige.currency, amount, modifiers, {});
}

export interface StarlightOffer {
  item: StarlightItem;
  level: number;
  maxLevel: number;
  /** Null at the max level. */
  price: Price | null;
  affordable: boolean;
  /** The bonus now and with one more level (for "+15% → +30%" tooltips). */
  current: Modifier[];
  next: Modifier[];
}

/** The Starlight shop, in data order. */
export function starlightShop(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): StarlightOffer[] {
  return content.prestige.shop.map((item) => {
    const level = starlightLevel(state, item.id);
    const price = starlightPrice(state, content, item, modifiers);
    return {
      item,
      level,
      maxLevel: item.maxLevel,
      price,
      affordable: price !== null && canAfford(state, [price]),
      current: starlightItemModifiers(item, level),
      next: level < item.maxLevel ? starlightItemModifiers(item, level + 1) : [],
    };
  });
}

export type StarlightBuyResult =
  { ok: true; state: GameState } | { ok: false; reason: 'unknown' | 'maxed' | 'unaffordable' };

/** Buys the next level of a Starlight shop item. Kept forever. */
export function buyStarlightItem(
  state: GameState,
  content: Content,
  itemId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): StarlightBuyResult {
  const item = content.prestige.shop.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: 'unknown' };
  const price = starlightPrice(state, content, item, modifiers);
  if (!price) return { ok: false, reason: 'maxed' };
  if (!canAfford(state, [price])) return { ok: false, reason: 'unaffordable' };
  const next = pay(state, [price]);
  next.prestige.shop[itemId] = starlightLevel(state, itemId) + 1;
  return { ok: true, state: next };
}
