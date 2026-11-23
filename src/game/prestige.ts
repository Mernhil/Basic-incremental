import type { Content, StarlightItem } from '../data';
import { grantCard } from './cards';
import { DIFFICULTIES, type Difficulty } from './state';
import { floorCount, floorPosition } from './floors';
import { isProductionGem } from './mastery';
import { collectModifiers, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { canAfford, finalPrice, pay, resetProduction, type Price } from './production';
import { initialBursts, startingAmount, type GameState } from './state';
import { keepUpgrades } from './upgrades';
import { grantCosmetic } from './wardrobe';
import { grantAccountXp } from './account';
import { ascensionStartFloor } from './floors';
import { isDungeonCleared } from './combat';
import { heirloomScrollsForAscension } from './heirlooms';

/**
 * Prestige, Ascension (DESIGN.md §9). An ascension resets the run (tree and mine
 * levels, resources, tile stages) and keeps everything else (cards, cosmetics,
 * unlocks, mastery, medals, portal pity, crystals). It grants Starlight from the gems harvested this run,
 * spent in the Starlight shop on permanent bonuses (modifier source `prestige`), and the n-th
 * ascension grants the prestige cosmetics listed for it. Boss HP and attack grow with the
 * prestige count (combat.ts). All numbers are in prestige.json.
 */

/** What an ascension resets, as ids for the UI to label (DESIGN.md §9, §12). */
export const ASCENSION_RESETS = ['resources'] as const;
/** What an ascension keeps. */
export const ASCENSION_PERSISTS = [
  'cards',
  'cosmetics',
  'unlocks',
  'mastery',
  'medals',
  'portal_pity',
  'crystals',
  'starlight',
  'camp',
  'forge',
  'star_dust',
  'stage_stars',
  'wishlist',
  'skill_tree',
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

/** Where the Starlight of an Ascension comes from. */
export interface StarlightBreakdown {
  /** From the materials farmed this run (`runPoints`). */
  materials: Decimal;
  /** From the floors climbed and the bosses beaten this run. */
  progress: Decimal;
  /** Floors climbed this run, summed over dungeons and difficulties. */
  floors: number;
  /** Dungeon bosses beaten this run. */
  bosses: number;
}

/** The floor a tier counts as beaten up to: the farmed floor, 0 while nothing is beaten. */
function beatenFloor(state: GameState, content: Content, dungeonId: string, d: Difficulty) {
  const dungeon = content.dungeons.find((x) => x.id === dungeonId);
  if (!dungeon) return { beaten: 0, floors: 0 };
  const position = floorPosition(state, dungeon, d);
  return { beaten: position.best > 0 ? position.floor : 0, floors: floorCount(dungeon, d) };
}

/** Floors climbed and bosses beaten this run: what each tier stands on now, past where the run began. */
export function runProgress(
  state: GameState,
  content: Content,
): { points: Decimal; floors: number; bosses: number } {
  const p = content.prestige.gain.progress;
  let points = new Decimal(0);
  let floors = 0;
  let bosses = 0;
  content.dungeons.forEach((dungeon, order) => {
    const dungeonWeight = 1 + order * p.dungeonStep;
    for (const difficulty of DIFFICULTIES) {
      const { beaten, floors: last } = beatenFloor(state, content, dungeon.id, difficulty);
      const start = state.prestige.runFloors[`${dungeon.id}:${difficulty}`] ?? 0;
      const climbed = Math.max(0, beaten - start);
      if (climbed === 0) continue;
      const boss = Number.isFinite(last) && start < last && beaten >= last ? 1 : 0;
      floors += climbed;
      bosses += boss;
      const worth = new Decimal(climbed + boss * p.bossFloors);
      points = points.add(
        worth.mul(p.perFloor).mul(dungeonWeight).mul(p.difficultyWeights[difficulty]),
      );
    }
  });
  return { points, floors, bosses };
}

/** Starlight an ascension would grant now: the materials part plus the progress part, through
 *  `prestige.gain`. */
export function starlightBreakdown(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): StarlightBreakdown {
  const { divisor, exponent } = content.prestige.gain;
  const points = runPoints(state, content);
  const rawMaterials = points.lte(0) ? new Decimal(0) : points.div(divisor).pow(exponent);
  const run = runProgress(state, content);
  // The same stat scales both parts, so each part is shown with its share of any bonus.
  const raw = rawMaterials.add(run.points);
  const total = statValue('prestige.gain', raw, modifiers);
  const scale = raw.gt(0) ? total.div(raw) : new Decimal(1);
  return {
    materials: rawMaterials.mul(scale),
    progress: run.points.mul(scale),
    floors: run.floors,
    bosses: run.bosses,
  };
}

export function starlightGain(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): Decimal {
  const b = starlightBreakdown(state, content, modifiers);
  return Decimal.max(b.materials.add(b.progress).floor(), 0);
}

/** The permanent multiplier on damage and yields after `ascensions` Ascensions: 1 + step n + growth n(n-1)/2. */
export function ascensionMultiplier(content: Content, ascensions: number): Decimal {
  const n = Math.max(0, Math.floor(ascensions));
  const { step, growth } = content.prestige.multiplier;
  return new Decimal(1).add(step.mul(n)).add(growth.mul((n * (n - 1)) / 2));
}

/** What every Ascension pays for sure, for the preview and for `ascend`. */
export interface AscensionPrizes {
  summonScrolls: Decimal;
  heirloomScrolls: Decimal;
  /** Of each Core. */
  cores: Decimal;
  /** A guaranteed card of this tier, or null. */
  pull: 'mythic' | 'heirloom' | null;
}

export function ascensionPrizes(content: Content, ascension: number): AscensionPrizes {
  const prizes = content.prestige.prizes;
  return {
    summonScrolls: prizes.summonScrolls,
    heirloomScrolls: heirloomScrollsForAscension(content, ascension),
    cores: prizes.cores,
    pull: prizes.pulls.find((p) => p.ascension === ascension)?.tier ?? null,
  };
}

/** The card a guaranteed pull gives: the first one of the tier not owned yet, rotating with the
 *  Ascension so a full collection still varies; an owned one pays a duplicate or shards. */
export function guaranteedPullCard(
  state: GameState,
  content: Content,
  tier: 'mythic' | 'heirloom',
  ascension: number,
): string | null {
  const pool = content.cards.filter((c) =>
    tier === 'heirloom' ? c.heirloom : c.tier === 'mythic' && !c.heirloom,
  );
  if (pool.length === 0) return null;
  const offset = ascension % pool.length;
  const ordered = [...pool.slice(offset), ...pool.slice(0, offset)];
  return (ordered.find((c) => !state.cards.owned[c.id]) ?? ordered[0]!).id;
}

/** The first Ascension waits for this dungeon's clear on Normal; later ones are free. */
export function firstAscensionOpen(state: GameState, content: Content): boolean {
  return (
    state.prestigeCount > 0 || isDungeonCleared(state, content.prestige.firstAscension.dungeon)
  );
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
  /** Where the Starlight comes from, and the floors and bosses behind the progress part. */
  breakdown: StarlightBreakdown;
  /** The multiplier on damage and yields now and after this Ascension. */
  multiplierNow: Decimal;
  multiplierAfter: Decimal;
  /** What it pays for sure. */
  prizes: AscensionPrizes;
  /** The first Ascension is still locked behind the dungeon clear. */
  locked: boolean;
  /** The floor the faster estimate speaks of: the dungeon being fought, at its best floor. */
  landmark: { dungeonId: string; name: string; difficulty: Difficulty; floor: number } | null;
  /** The next run is about this many times faster (the multiplier's ratio; see `fasterEstimate`). */
  faster: number;
  resets: readonly AscensionResetPart[];
  persists: readonly AscensionPersistPart[];
}

/** Everything the Ascension gate shows before confirming. */
export function ascensionPreview(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): AscensionPreview {
  const breakdown = starlightBreakdown(state, content, modifiers);
  const gain = Decimal.max(breakdown.materials.add(breakdown.progress).floor(), 0);
  const minimum = content.prestige.gain.minimum;
  const ascension = state.prestigeCount + 1;
  const open = firstAscensionOpen(state, content);
  const multiplierNow = ascensionMultiplier(content, state.prestigeCount);
  const multiplierAfter = ascensionMultiplier(content, ascension);
  return {
    gain,
    points: runPoints(state, content),
    minimum,
    canAscend: open && gain.gte(minimum),
    locked: !open,
    breakdown,
    multiplierNow,
    multiplierAfter,
    prizes: ascensionPrizes(content, ascension),
    faster: fasterEstimate(multiplierNow, multiplierAfter),
    landmark: landmarkOf(state, content),
    ascension,
    rewards: ascensionRewards(content, ascension),
    resets: ASCENSION_RESETS,
    persists: ASCENSION_PERSISTS,
  };
}

/** The dungeon being fought (else the deepest one opened) at the best floor of its chosen difficulty. */
function landmarkOf(state: GameState, content: Content): AscensionPreview['landmark'] {
  const open = content.dungeons.filter(
    (d) =>
      state.clearedDungeons.includes(d.id) ||
      d.unlockedBy === null ||
      state.clearedDungeons.includes(d.unlockedBy ?? ''),
  );
  const dungeon =
    (state.activeDungeonId ? content.dungeonById.get(state.activeDungeonId) : undefined) ??
    open[open.length - 1];
  if (!dungeon) return null;
  const position = floorPosition(state, dungeon);
  if (position.best <= 0) return null;
  return {
    dungeonId: dungeon.id,
    name: dungeon.name,
    difficulty: position.difficulty,
    floor: position.best,
  };
}

/**
 * How much faster the next run reaches the same landmark (a floor of the dungeon being fought):
 * damage and yields both grow by the ratio of the new multiplier to the one now, and a landmark's
 * time is its health over the damage, so it comes about `after / now` times sooner. Training,
 * cards and the camp are kept, so nothing else slows it; the head start only adds to it.
 */
export function fasterEstimate(now: Decimal, after: Decimal): number {
  return after.div(now).toNumber();
}

export type AscendResult =
  | { ok: true; state: GameState; gained: Decimal; cosmetics: string[] }
  | { ok: false; reason: 'too-early' | 'locked' };

/** Ascends: grants the Starlight and rewards, resets the run and starts a new one. */
export function ascend(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): AscendResult {
  const preview = ascensionPreview(state, content, modifiers);
  if (preview.locked) return { ok: false, reason: 'locked' };
  if (!preview.canAscend) return { ok: false, reason: 'too-early' };
  const next = resetProduction(state);
  const currency = content.prestige.currency;
  // Gems, Money, Cores and the rest start over; Starlight and the premium crystals are kept
  // (DESIGN.md §3), like the pity counters that go with them.
  for (const resource of content.resources) {
    if (resource.kind === 'prestige' || resource.kind === 'scroll' || resource.keptOnAscend)
      continue;
    next.resources[resource.id] = startingAmount(content, resource.id);
  }
  next.resources[currency] = (state.resources[currency] ?? new Decimal(0)).add(preview.gain);
  // An Ascension ends a challenge run that was not completed; `startChallenge` sets it again.
  next.ascensionChallenges.active = null;
  next.bursts = initialBursts();
  next.bossHp = null;
  // Floors (DESIGN.md §6): the best floor of every dungeon tier is kept and the run farms from half
  // of it, with auto-challenge on, so it climbs back one Challenge at a time.
  const headStart = headStartPercent(state, content);
  const runFloors: Record<string, number> = {};
  for (const [dungeonId, progress] of Object.entries(next.combat.floors)) {
    progress.autoChallenge = autoPushOwned(state, content);
    for (const [difficulty, tier] of Object.entries(progress.tiers)) {
      tier.floor = ascensionStartFloor(tier.best, headStart);
      runFloors[`${dungeonId}:${difficulty}`] = tier.best > 0 ? tier.floor : 0;
    }
  }
  next.combat = {
    ...next.combat,
    // Training is bought again each run, unless Lasting Training is owned (DESIGN.md §6 Training).
    training: keepsTraining(state, content) ? { ...state.combat.training } : {},
    trialAttempt: { elapsedSeconds: 0, dealt: new Decimal(0) },
    cardDamage: {},
    cardsOut: [],
    knockoutSeconds: 0,
    enemyIndex: 0,
    challenge: null,
    challengeWaitSeconds: 0,
  };
  next.prestigeCount = preview.ascension;
  // Heirloom Scrolls from the third Ascension on (DESIGN.md §3 Where Heirloom Scrolls come from).
  const scrolls = heirloomScrollsForAscension(content, preview.ascension);
  if (scrolls.gt(0)) {
    next.resources['heirloom_scroll'] = (next.resources['heirloom_scroll'] ?? new Decimal(0)).add(
      scrolls,
    );
  }
  // The guaranteed prizes: scrolls, Cores of every kind and one card at set counts.
  const prizes = preview.prizes;
  next.resources['summon_scroll'] = (next.resources['summon_scroll'] ?? new Decimal(0)).add(
    prizes.summonScrolls,
  );
  for (const resource of content.resources) {
    if (resource.id.endsWith('_core')) {
      next.resources[resource.id] = (next.resources[resource.id] ?? new Decimal(0)).add(
        prizes.cores,
      );
    }
  }
  if (prizes.pull) {
    const cardId = guaranteedPullCard(state, content, prizes.pull, preview.ascension);
    const card = cardId ? content.cardById.get(cardId) : undefined;
    if (card) grantCard(next.cards, content, card);
  }
  next.prestige = {
    ...next.prestige,
    runStart: { ...state.mastery.harvested },
    runFloors,
    starlightEarned: state.prestige.starlightEarned.add(preview.gain),
  };
  for (const id of preview.rewards) grantCosmetic(next, id);
  // The account tree's free respec comes back with every ascension (DESIGN.md §10).
  next.account = { ...next.account, freeRespecsUsed: 0 };
  // Milestone picks and the lifetime Money stay; a pick's perk comes back with its line (DESIGN.md §4).
  next.upgrades = keepUpgrades(state);
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

/** Every Starlight shop bonus owned, and the permanent Ascension multiplier. Read by `collectModifiers`. */
export function prestigeModifiers(state: GameState, content: Content): Modifier[] {
  const out = content.prestige.shop.flatMap((item) =>
    starlightItemModifiers(item, starlightLevel(state, item.id)),
  );
  if (state.prestigeCount > 0) {
    const value = ascensionMultiplier(content, state.prestigeCount);
    const source = { kind: 'prestige', id: 'ascension' } as const;
    out.push(
      { stat: 'combat.damage', kind: 'mult', value, source },
      { stat: 'production.rate', kind: 'mult', value, source },
    );
  }
  return out;
}

/** The level of the shop item granting `rule` (0 when not owned or not in the data). */
export function grantLevel(
  state: GameState,
  content: Content,
  rule: StarlightItem['grants'],
): number {
  const item = content.prestige.shop.find((i) => i.grants === rule);
  return item ? Math.min(starlightLevel(state, item.id), item.maxLevel) : 0;
}

/** Auto-push is bought: Challenges may start by themselves. */
export const autoPushOwned = (state: GameState, content: Content): boolean =>
  grantLevel(state, content, 'auto_push') > 0;

/** Lasting Training is bought: an Ascension keeps the training levels. */
export const keepsTraining = (state: GameState, content: Content): boolean =>
  grantLevel(state, content, 'keep_training') > 0;

/** Percent of the best floor a run starts on: 50 and Head Start's levels, at most 100. */
export function headStartPercent(state: GameState, content: Content): number {
  const item = content.prestige.shop.find((i) => i.grants === 'head_start');
  const per = item?.percent ?? 0;
  return Math.min(100, 50 + per * grantLevel(state, content, 'head_start'));
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
  /** Not buyable yet (nothing waits for anything now). */
  locked: boolean;
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
      locked: false,
      current: starlightItemModifiers(item, level),
      next: level < item.maxLevel ? starlightItemModifiers(item, level + 1) : [],
    };
  });
}

export type StarlightBuyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'unknown' | 'maxed' | 'locked' | 'unaffordable' };

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
