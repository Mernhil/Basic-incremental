import type { Card, Content, HarvestPattern, ProductionJob, Rarity, Rank } from '../data';
import { cardRank } from './cards';
import { burstView } from './combat';
import { activeTargets, harvestSupports, mainHarvestPattern, strikePeriodSeconds } from './harvest';
import { collectModifiers } from './modifiers';
import { Decimal } from './num';
import { harvestCrit, harvestCritFactor } from './production';
import type { GameState } from './state';
import { jobAttackEffect, resolveCard, jobNumberStyle, type ResolvedCard } from './theme';

/** A card on the production stage. */
export interface StageCard {
  cardId: string;
  name: string;
  rarity: Rarity;
  element: Card['element'];
  item: Card['item'];
  rank: Rank;
  level: number;
  /** Main ability text (main card) or support effect text (supports), from the card data. */
  abilityText: string;
  /** Support only: its effect touches this job's harvest, so strikes list it as helping. */
  helpsHarvest: boolean;
  /** Border, finish and rarity look of the card, resolved from the wardrobe. */
  look: ResolvedCard;
}

/** One unlocked tree kind / mine type as the stage draws it. */
export interface StageTarget {
  /** Position among the job's kinds in content order (matches `HarvestEvent.kind`). */
  kind: number;
  /** Tree / mine id. */
  producer: string;
  resource: string;
  /** Output per second of this kind (crits included). */
  ratePerSecond: Decimal;
  /** Share of the job's output, 0..1. */
  share: number;
  /** What one strike on this kind yields without a crit. */
  perStrike: Decimal;
}

/** Everything the production stage shows for one job, ready to draw (DESIGN.md §4). */
export interface ProductionStageView {
  job: ProductionJob;
  main: StageCard | null;
  /** Always 3 entries; undefined = empty support slot. */
  supports: (StageCard | undefined)[];
  /** How the main card strikes (job default when there is none). */
  pattern: HarvestPattern;
  /** Harvest burst gauge, 0..1 (fires automatically when full). */
  gauge: number;
  /** Seconds of the job's output one full gauge harvests, and gauge points per tick. */
  burst: { power: Decimal; fillPerTick: number; size: number };
  /** Progress to the next strike, 0..1, and the seconds left. Derived from play time. */
  nextStrike: { progress: number; inSeconds: number };
  /** Harvest crit chance (0..1) and multiplier. */
  crit: { chance: number; damage: Decimal };
  /** One entry per unlocked tree kind / mine type, in content order. */
  targets: StageTarget[];
  /** Animation ids from the equipped cosmetics for this job's strikes and numbers. */
  attackEffect: string | null;
  tickEffect: string | null;
}

/** Ready-to-show view of one production job's stage: cards, pattern, gauge, targets. */
export function productionStageView(
  state: GameState,
  content: Content,
  job: ProductionJob,
): ProductionStageView {
  const modifiers = collectModifiers(state, content);
  const loadout = state.cards.loadouts[job];
  const loadoutCosmetics = state.cosmetics.loadout;
  const helps = new Set(harvestSupports(state, content, job));
  const card = (id: string | null, role: 'main' | 'support'): StageCard | undefined => {
    const def = id ? content.cardById.get(id) : undefined;
    const owned = id ? state.cards.owned[id] : undefined;
    if (!id || !def || !owned || def.job !== job) return undefined;
    const rank = cardRank(owned);
    return {
      cardId: id,
      name: def.name,
      rarity: def.rarity,
      element: def.element,
      item: def.item,
      rank,
      level: owned.level,
      abilityText: (role === 'main' ? def.main : def.support).description,
      helpsHarvest: role === 'support' && helps.has(id),
      look: resolveCard(content, loadoutCosmetics, { id, rank, rarity: def.rarity }),
    };
  };

  const pattern = mainHarvestPattern(state, content, job);
  const gaugeView = burstView(state, content, job, modifiers);
  const periodMs = strikePeriodSeconds(pattern) * 1000;
  const into = state.stats.playTimeMs % periodMs;
  const crit = harvestCrit(content, job, modifiers);
  const factor = harvestCritFactor(crit);

  const live = activeTargets(state, content, job, modifiers);
  const total = live.reduce((a, t) => a.add(t.rate), new Decimal(0));
  const reach = pattern.targeting === 'all' ? 1 : Math.max(1, live.length);
  const periodSeconds = periodMs / 1000;
  const targets = live.map((t): StageTarget => ({
    kind: t.kind,
    producer: t.producer.id,
    resource: t.producer.resource,
    ratePerSecond: t.rate.mul(factor),
    share: total.gt(0) ? t.rate.div(total).toNumber() : 0,
    perStrike: t.rate.mul(periodSeconds * reach),
  }));

  return {
    job,
    main: card(loadout.main, 'main') ?? null,
    supports: loadout.supports.map((id) => card(id, 'support')),
    pattern,
    gauge: gaugeView.fraction,
    burst: {
      power: gaugeView.stats.power,
      fillPerTick: gaugeView.stats.fill,
      size: gaugeView.stats.size,
    },
    nextStrike: { progress: into / periodMs, inSeconds: (periodMs - into) / 1000 },
    crit: { chance: crit.chance, damage: crit.damage },
    targets,
    attackEffect: jobAttackEffect(content, state.cosmetics.loadout, job),
    tickEffect: jobNumberStyle(content, state.cosmetics.loadout).tickEffect,
  };
}
