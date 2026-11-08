import type { Content } from '../../../data';
import {
  Decimal,
  PRODUCTION_JOBS,
  isProducerUnlocked,
  jobProductionPerSecond,
  producerLevel,
  producerRate,
  producersOf,
  tileStage,
  treeUnlockCost,
  type BuyCount,
  type GameState,
  type Modifier,
  type Price,
  type Producer,
  type ProductionJob,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { mineLevelViews, treeLevelViews, type BuyLineView } from './buyModel';
import type { ShelfChip } from './shelfModel';

/**
 * View models of the Production screen (DESIGN.md §4, §11): one row per tree kind or mine type
 * for the rows column, and the one-line summary of the upgrade shelf drawer. Display logic only;
 * levels, rates, prices, previews, unlocks and milestones all come from the game.
 */

export type RowKind = 'active' | 'locked-tree' | 'locked-mine';

export interface ProductionRow {
  /** `${job}-${id}`, stable across renders. */
  key: string;
  job: ProductionJob;
  id: string;
  /** Index among all the job's kinds (the strike target index of the harvest events). */
  kindIndex: number;
  name: string;
  kind: RowKind;
  /** Growth stage of the tile (0 for a locked kind). */
  stage: number;
  /** Active rows: "Lv 56". Locked rows: "Locked". */
  levelText: string;
  /** Active rows: "52.8 Oak Gem/s". Empty when locked. */
  output: string;
  /** Next milestone: "Lv 75: ×2", "19 to go" and the bar fill 0..1. Null when locked. */
  milestone: { label: string; toGo: string; progress: number } | null;
  /** Locked rows: what the middle column says ("Starts at 0.25/s at level 0", "Clear X to unlock"). */
  note: string;
  /** Active rows: the level buy line the shared buy button shows. */
  buy: BuyLineView | null;
  /** Locked trees: the unlock price and whether it is affordable now. */
  unlock: { price: string; have: string; affordable: boolean } | null;
  /** Locked mines: the dungeon that opens it ("Clear X"), empty for a locked tree. */
  dungeon: string;
}

const resName = (content: Content, id: string): string => content.resourceById.get(id)?.name ?? id;

const priceText = (content: Content, p: Price): string =>
  `${fmt(p.amount)} ${resName(content, p.resource)}`;

/** The rows of one job, in content order: unlocked kinds first-class, locked ones greyed. */
export function productionRows(
  state: GameState,
  content: Content,
  job: ProductionJob,
  count: BuyCount,
  mods: readonly Modifier[],
): ProductionRow[] {
  const all = producersOf(content, job);
  const views = new Map<string, BuyLineView>(
    (job === 'logging'
      ? treeLevelViews(state, content, count, mods)
      : mineLevelViews(state, content, count, mods)
    ).map((v) => [v.id, v]),
  );
  return all.map((p: Producer, kindIndex) => {
    const base = { key: `${job}-${p.id}`, job, id: p.id, kindIndex, name: p.name };
    if (isProducerUnlocked(state, content, job, p.id)) {
      const level = producerLevel(state, job, p.id);
      const buy = views.get(p.id) ?? null;
      const m = buy?.milestoneInfo ?? null;
      return {
        ...base,
        kind: 'active' as const,
        stage: tileStage(state, content, job, p.id),
        levelText: COPY.production.levelShort(level),
        output: COPY.production.perSecond(
          fmt(producerRate(p, job, mods, level)),
          resName(content, p.resource),
        ),
        milestone: m
          ? {
              label: buy!.milestone,
              toGo: COPY.production.toGo(m.levelsToNext),
              progress: Math.min(1, Math.max(0, m.progress)),
            }
          : null,
        note: '',
        buy,
        unlock: null,
        dungeon: '',
      };
    }
    if (job === 'logging') {
      const prices = treeUnlockCost(content, p.id, mods);
      const first = prices[0];
      const owned = first ? (state.resources[first.resource] ?? new Decimal(0)) : new Decimal(0);
      return {
        ...base,
        kind: 'locked-tree' as const,
        stage: 0,
        levelText: COPY.production.locked,
        output: '',
        milestone: null,
        note: COPY.production.startsAt(fmt(producerRate(p, job, mods, 0))),
        buy: null,
        unlock: {
          price: prices.map((x) => priceText(content, x)).join(', '),
          have: COPY.production.youHave(fmt(owned)),
          affordable: prices.every((x) =>
            (state.resources[x.resource] ?? new Decimal(0)).gte(x.amount),
          ),
        },
        dungeon: '',
      };
    }
    const dungeon =
      'unlockedByDungeon' in p && p.unlockedByDungeon
        ? (content.dungeonById.get(p.unlockedByDungeon)?.name ?? '')
        : '';
    return {
      ...base,
      kind: 'locked-mine' as const,
      stage: 0,
      levelText: COPY.production.locked,
      output: '',
      milestone: null,
      note: dungeon ? COPY.production.clearToUnlock(dungeon) : COPY.production.locked,
      buy: null,
      unlock: null,
      dungeon,
    };
  });
}

/** Gems per second of one job as the panel head shows it ("60.2 gems/s"). */
export function jobRateText(
  state: GameState,
  content: Content,
  job: ProductionJob,
  mods: readonly Modifier[],
): string {
  return COPY.production.gemsPerSecond(fmt(totalPerSecond(state, content, job, mods)));
}

/** Gems per second over both jobs, for the page title. */
export function allRateText(state: GameState, content: Content, mods: readonly Modifier[]): string {
  const sum = PRODUCTION_JOBS.reduce(
    (acc, job) => acc.add(totalPerSecond(state, content, job, mods)),
    new Decimal(0),
  );
  return COPY.production.gemsPerSecond(fmt(sum));
}

function totalPerSecond(
  state: GameState,
  content: Content,
  job: ProductionJob,
  mods: readonly Modifier[],
): Decimal {
  return Object.values(jobProductionPerSecond(state, content, job, mods)).reduce(
    (acc, v) => acc.add(v),
    new Decimal(0),
  );
}

export interface ShelfSummary {
  /** Upgrades that can be bought right now. */
  ready: number;
  /** Upgrades on the shelf that are not bought yet. */
  waiting: number;
  owned: number;
  /** The closed drawer's one line: "3 ready to buy · 5 owned". */
  text: string;
}

/** What the closed shelf drawer says: how many upgrades are ready, waiting and owned. */
export function shelfSummary(chips: readonly ShelfChip[]): ShelfSummary {
  const owned = chips.filter((c) => c.status === 'owned').length;
  const open = chips.filter((c) => c.status === 'available');
  const ready = open.filter((c) => c.affordable).length;
  return {
    ready,
    waiting: open.length - ready,
    owned,
    text: COPY.production.shelfLine(ready, owned),
  };
}
