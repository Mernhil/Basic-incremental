import type { Card, Content, HarvestPattern, ProductionJob, Rarity, Rank } from '../data';
import { cardRank } from './cards';
import { depthInfo, type DepthInfo } from './depth';
import { harvestBurstStats, harvestGauge, strikePeriodSeconds, workerPattern } from './harvest';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import { harvestCritFactor, producersOf, workSites, type WorkSite } from './production';
import type { GameState } from './state';
import { jobAttackEffect, resolveCard, jobNumberStyle, type ResolvedCard } from './theme';
import {
  producerJob,
  workerAt,
  workerPower,
  workerSlots,
  workersUsed,
  workplaceOf,
} from './workers';

/**
 * View models of the workers on the Production screen (DESIGN.md §4 Workers, Workers play the
 * field; §11): one entry per unlocked tree kind or mine type with the card working it, its strike
 * rhythm and its harvest gauge, and the cards a place can take. Ready to draw; no DOM.
 */

/** A worker card as the Production rows draw it. */
export interface StageCard {
  cardId: string;
  name: string;
  rarity: Rarity;
  element: Card['element'];
  item: Card['item'];
  rank: Rank;
  level: number;
  /** The worker ability text, from the card data. */
  abilityText: string;
  /** The worker's power: it multiplies its place's output. */
  power: number;
  /** Border, finish and rarity look of the card, resolved from the wardrobe. */
  look: ResolvedCard;
}

/** One unlocked tree kind / mine type at work, as its row draws it. */
export interface StageTarget {
  /** Position among the job's kinds in content order (matches `HarvestEvent.kind`). */
  kind: number;
  /** Tree / mine id. */
  producer: string;
  resource: string;
  /** The card working it, or null (the plain level rate, no strikes and no gauge). */
  worker: StageCard | null;
  /** How the worker strikes; null with no worker. */
  pattern: HarvestPattern | null;
  /** Output per second of this kind (crits included). */
  ratePerSecond: Decimal;
  /** Share of the job's output, 0..1. */
  share: number;
  /** What one strike yields without a crit (0 with no worker). */
  perStrike: Decimal;
  /** Harvest gauge, 0..1 (fires automatically when full); 0 with no worker. */
  gauge: number;
  /** Seconds of this place's output one full gauge harvests, and the gauge's size. */
  burst: { power: Decimal; fillPerTick: number; size: number };
  /** Progress to the next strike, 0..1, and the seconds left. Derived from play time. */
  nextStrike: { progress: number; inSeconds: number };
  /** Its layer or age, the bar to the next and the yield it gives (DESIGN.md §4 Depth). */
  depth: DepthInfo;
  /** Hardness broken per second by its workers (0 with none). */
  dig: Decimal;
  /** Harvest crit chance (0..1) and multiplier at this place. */
  crit: { chance: number; damage: Decimal };
}

/** Everything the Production screen shows for one job's workers (DESIGN.md §4). */
export interface ProductionStageView {
  job: ProductionJob;
  /** One entry per unlocked tree kind / mine type, in content order. */
  targets: StageTarget[];
  /** Worker slots in use and in all (both jobs share them). */
  slots: { used: number; total: number };
  /** Animation ids from the equipped cosmetics for this job's strikes and numbers. */
  attackEffect: string | null;
  tickEffect: string | null;
}

function stageCard(state: GameState, content: Content, cardId: string): StageCard | null {
  const def = content.cardById.get(cardId);
  const owned = state.cards.owned[cardId];
  if (!def || !owned || def.job === 'fighting') return null;
  const rank = cardRank(owned);
  return {
    cardId,
    name: def.name,
    rarity: def.rarity,
    element: def.element,
    item: def.item,
    rank,
    level: owned.level,
    abilityText: def.worker.description,
    power: workerPower(content, cardId, owned),
    look: resolveCard(content, state.cosmetics.loadout, { id: cardId, rank, rarity: def.rarity }),
  };
}

function targetView(
  state: GameState,
  content: Content,
  site: WorkSite,
  total: Decimal,
  modifiers: readonly Modifier[],
): StageTarget {
  const id = site.workers[0] ?? null;
  const pattern = id ? workerPattern(content, id) : null;
  const stats = harvestBurstStats(content, site, modifiers, site.speed);
  const periodMs =
    pattern && site.speed > 0 ? (strikePeriodSeconds(pattern) * 1000) / site.speed : 0;
  const into = periodMs > 0 ? state.stats.playTimeMs % periodMs : 0;
  const gauge = id ? Math.min(harvestGauge(state, site.producer.id).gauge, stats.size) : 0;
  return {
    kind: site.kind,
    producer: site.producer.id,
    resource: site.producer.resource,
    worker: id ? stageCard(state, content, id) : null,
    pattern,
    ratePerSecond: site.rate.mul(harvestCritFactor(site.crit)),
    share: total.gt(0) ? site.rate.div(total).toNumber() : 0,
    perStrike: site.rate.mul(periodMs / 1000),
    gauge: gauge / stats.size,
    burst: { power: stats.power, fillPerTick: stats.fill, size: stats.size },
    nextStrike:
      periodMs > 0
        ? { progress: into / periodMs, inSeconds: (periodMs - into) / 1000 }
        : { progress: 0, inSeconds: 0 },
    depth: depthInfo(state, content, site.producer.id)!,
    dig: site.dig,
    crit: { chance: site.crit.chance, damage: site.crit.damage },
  };
}

/** Ready-to-show view of one production job's workers: each place's card, rhythm, gauge. */
export function productionStageView(
  state: GameState,
  content: Content,
  job: ProductionJob,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): ProductionStageView {
  const sites = workSites(state, content, job, modifiers);
  const total = sites.reduce((a, t) => a.add(t.rate), new Decimal(0));
  return {
    job,
    targets: sites.map((site) => targetView(state, content, site, total, modifiers)),
    slots: { used: workersUsed(state, content), total: workerSlots(state, content) },
    attackEffect: jobAttackEffect(content, state.cosmetics.loadout, job),
    tickEffect: jobNumberStyle(content, state.cosmetics.loadout).tickEffect,
  };
}

/** One card the worker picker offers for a place. */
export interface WorkerChoice {
  cardId: string;
  name: string;
  rarity: Rarity;
  rank: Rank;
  level: number;
  /** Its worker power (what it would multiply the place's output by). */
  power: number;
  abilityText: string;
  /** Where it works now (a tree or mine id), or null. */
  workplace: string | null;
  /** Its workplace's name, for "works at Oak". */
  workplaceName: string | null;
  /** It works this place now. */
  here: boolean;
  /** Placing it here needs a free slot and there is none (it neither moves nor replaces). */
  needsSlot: boolean;
}

/**
 * The owned cards of a place's job, strongest first, for the worker picker (DESIGN.md §4
 * Workers): a click puts one to work there with `assignWorker`. Empty for an unknown place.
 */
export function workerChoices(
  state: GameState,
  content: Content,
  producerId: string,
): WorkerChoice[] {
  const job = producerJob(content, producerId);
  if (!job) return [];
  const freeSlot = workersUsed(state, content) < workerSlots(state, content);
  const placeTaken = workerAt(state, content, producerId) !== null;
  const names = new Map(producersOf(content, job).map((p) => [p.id, p.name]));
  const out: WorkerChoice[] = [];
  for (const card of content.cards) {
    const owned = state.cards.owned[card.id];
    if (card.job !== job || !owned) continue;
    const workplace = workplaceOf(state, content, card.id);
    out.push({
      cardId: card.id,
      name: card.name,
      rarity: card.rarity,
      rank: cardRank(owned),
      level: owned.level,
      power: workerPower(content, card.id, owned),
      abilityText: card.worker.description,
      workplace,
      workplaceName: workplace ? (names.get(workplace) ?? null) : null,
      here: workplace === producerId,
      needsSlot: workplace === null && !placeTaken && !freeSlot,
    });
  }
  return out.sort((a, b) => b.power - a.power);
}
