import {
  Decimal,
  type HarvestEvent,
  type ProductionJob,
  type ProductionStageView,
} from '../../../game';
import type { HarvestPattern } from '../../../data';

/**
 * View model of the Production stage (DESIGN.md §4, §11): turns the report's harvest events into
 * the "moments" the stage plays (one strike per kind, one burst), and the strike pattern into
 * how the main card moves. Pure, no DOM, unit tested.
 */

/** One strike on one tree kind or mine type, after merging the events of a step. */
export interface StrikeMoment {
  kind: number;
  resource: string;
  amount: Decimal;
  /** Strikes folded into this moment (>1 when a long step was merged). */
  strikes: number;
  crit: boolean;
  /** Support card ids to pulse. */
  supports: string[];
}

/** The harvest burst: a wave over the kinds in order, one big total per resource. */
export interface BurstMoment {
  kinds: Array<{ kind: number; resource: string; amount: Decimal }>;
  totals: Array<{ resource: string; amount: Decimal }>;
  supports: string[];
}

export interface HarvestMoments {
  strikes: StrikeMoment[];
  burst: BurstMoment | null;
}

/** Strike moments played per report at most (the rest fold into the kinds already shown). */
export const MAX_STRIKE_MOMENTS = 12;

const addUnique = (into: string[], more: readonly string[]): void => {
  for (const id of more) if (!into.includes(id)) into.push(id);
};

/**
 * Events -> moments for one job: other jobs are dropped, strikes on the same kind merge (amounts
 * add, any crit makes the moment a crit), burst events become one wave. Strikes keep the order
 * of their first event; beyond `cap` the smallest are dropped (their gain is still in the
 * header counters, only the show is trimmed).
 */
export function harvestMoments(
  events: readonly HarvestEvent[],
  job: ProductionJob,
  cap = MAX_STRIKE_MOMENTS,
): HarvestMoments {
  const strikes = new Map<number, StrikeMoment>();
  const wave = new Map<number, { kind: number; resource: string; amount: Decimal }>();
  const supports: string[] = [];
  const burstSupports: string[] = [];
  for (const e of events) {
    if (e.job !== job || e.amount.lte(0)) continue;
    if (e.burst) {
      const open = wave.get(e.kind);
      if (open) open.amount = open.amount.add(e.amount);
      else wave.set(e.kind, { kind: e.kind, resource: e.resource, amount: e.amount });
      addUnique(burstSupports, e.supports);
      continue;
    }
    const open = strikes.get(e.kind);
    if (open) {
      open.amount = open.amount.add(e.amount);
      open.strikes += e.strikes;
      open.crit ||= e.crits > 0;
      addUnique(open.supports, e.supports);
    } else {
      strikes.set(e.kind, {
        kind: e.kind,
        resource: e.resource,
        amount: e.amount,
        strikes: e.strikes,
        crit: e.crits > 0,
        supports: [...e.supports],
      });
    }
    addUnique(supports, e.supports);
  }
  let list = [...strikes.values()];
  if (list.length > cap) {
    const keep = new Set(
      [...list]
        .sort((a, b) => (b.amount.gt(a.amount) ? 1 : b.amount.lt(a.amount) ? -1 : 0))
        .slice(0, Math.max(0, cap)),
    );
    list = list.filter((s) => keep.has(s));
  }
  const kinds = [...wave.values()].sort((a, b) => a.kind - b.kind);
  let burst: BurstMoment | null = null;
  if (kinds.length > 0) {
    const totals = new Map<string, Decimal>();
    for (const p of kinds)
      totals.set(p.resource, (totals.get(p.resource) ?? new Decimal(0)).add(p.amount));
    burst = {
      kinds,
      totals: [...totals].map(([resource, amount]) => ({ resource, amount })),
      supports: burstSupports,
    };
  }
  return { strikes: list, burst };
}

/** How the main card and its popups move for a pattern style (all values are CSS-facing). */
export interface StrikeLook {
  style: HarvestPattern['style'];
  /** Class on the card slot while it lunges. */
  lungeClass: string;
  /** How far the card travels toward the tile, 0..1 of the way. */
  reach: number;
  /** Lunge animation length in ms. */
  ms: number;
  /** The stage shakes on this strike (big slow chops). */
  shake: boolean;
  /** Number size relative to the tile's usual popup. */
  numberScale: number;
  /** Delay in ms between the tiles of one report, so strikes read one after another. */
  staggerMs: number;
}

const LOOKS: Record<HarvestPattern['style'], StrikeLook> = {
  steady: {
    style: 'steady',
    lungeClass: 'is-strike-steady',
    reach: 0.18,
    ms: 300,
    shake: false,
    numberScale: 1,
    staggerMs: 90,
  },
  chop: {
    style: 'chop',
    lungeClass: 'is-strike-chop',
    reach: 0.34,
    ms: 620,
    shake: true,
    numberScale: 1.35,
    staggerMs: 140,
  },
  flurry: {
    style: 'flurry',
    lungeClass: 'is-strike-flurry',
    reach: 0.14,
    ms: 220,
    shake: false,
    numberScale: 0.85,
    staggerMs: 55,
  },
  volley: {
    style: 'volley',
    lungeClass: 'is-strike-volley',
    reach: 0.1,
    ms: 420,
    shake: false,
    numberScale: 0.95,
    staggerMs: 35,
  },
};

export function strikeLook(pattern: Pick<HarvestPattern, 'style'>): StrikeLook {
  return LOOKS[pattern.style];
}

/** Popup kind of a strike: crits get the crit number look (starburst), the rest the gain look. */
export function strikeNumberKind(m: Pick<StrikeMoment, 'crit'>): 'crit' | 'gain' {
  return m.crit ? 'crit' : 'gain';
}

/** Where to aim: a vector from the card centre to the tile centre, scaled by the look's reach. */
export function lungeVector(
  from: { x: number; y: number },
  to: { x: number; y: number },
  look: Pick<StrikeLook, 'reach'>,
  maxPx = 90,
): { dx: number; dy: number } {
  let dx = (to.x - from.x) * look.reach;
  let dy = (to.y - from.y) * look.reach;
  const len = Math.hypot(dx, dy);
  if (len > maxPx) {
    dx = (dx / len) * maxPx;
    dy = (dy / len) * maxPx;
  }
  return { dx: Math.round(dx), dy: Math.round(dy) };
}

/** Gauge as a whole percent for the meter, clamped. */
export const gaugePercent = (gauge: number): number =>
  Math.round(Math.min(1, Math.max(0, gauge)) * 100);

/** Key that changes when the cards on the stage (ids, rank, level) or the pattern change. */
export function stageKey(view: ProductionStageView): string {
  const c = (
    x: { cardId: string; rank: { tier: string; stars: number }; level: number } | null | undefined,
  ) => (x ? [x.cardId, x.rank.tier, x.rank.stars, x.level] : null);
  return JSON.stringify([c(view.main), view.supports.map(c), view.pattern.style]);
}
