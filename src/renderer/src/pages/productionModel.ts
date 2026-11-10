import type { Content } from '../../../data';
import {
  Decimal,
  isProducerUnlocked,
  jobProductionPerSecond,
  outputGainMultiplier,
  previewMineLevel,
  previewTreeLevel,
  producerLevel,
  producerRate,
  producersOf,
  tileStage,
  timeToAfford,
  treeUnlockCost,
  type BuyCount,
  type GameState,
  type MinePreview,
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
 * View models of the Production screen, the pixel ledger (DESIGN.md §4, §11): one row per tree
 * kind or mine type, the band's gems per second, the "next buy" wait and gain, and the one-line
 * summary of the upgrade shelf drawer. Display logic only; levels, rates, prices, previews,
 * unlocks, milestones and the wait to afford all come from the game.
 */

export type RowKind = 'active' | 'locked-tree' | 'locked-mine';

/** The "Next buy" cell: the wait to afford the next level, or "ready" with the output gain. */
export interface NextBuyView {
  ready: boolean;
  /** "9d 3h", "1h 49m", "40 s", or "ready". */
  text: string;
  /** "to afford", or "×1.03 output" when ready (empty when the gain is unknown). */
  sub: string;
}

/** The segmented bar to the next ×2 milestone: `filled` of `total` segments. */
export interface MilestoneSegments {
  total: number;
  filled: number;
}

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
  /** Active rows: "Level 56". Locked rows: "Locked". */
  levelText: string;
  /** Active rows: "52.8 Oak Gem/s". Empty when locked. */
  output: string;
  /** Active rows: the number ("52.8") and its unit ("Oak Gem/s") apart, for the big figure. */
  outputValue: string;
  outputUnit: string;
  /** Next milestone: "Lv 75: ×2", "×2 in 19", the bar fill 0..1 and its segments. Null when locked. */
  milestone: { label: string; toGo: string; progress: number; segments: MilestoneSegments } | null;
  /** Active rows: the wait or "ready" for the chosen buy amount. Null when locked. */
  nextBuy: NextBuyView | null;
  /** Locked rows: what the middle column says ("Unlock for 2,000 Ironbark Gem", "Clear X to unlock"). */
  note: string;
  /** Active rows: the level buy line the shared buy button shows. */
  buy: BuyLineView | null;
  /** Active rows: what the buy does to the output, "180.47 → 183.21 /s". */
  previewText: string;
  /** Locked trees: the unlock price (amounts, then the gems' names) and whether it is affordable now. */
  unlock: {
    price: string;
    amount: string;
    resources: string;
    have: string;
    affordable: boolean;
  } | null;
  /** Locked mines: the dungeon that opens it ("Clear X"), empty for a locked tree. */
  dungeon: string;
}

const resName = (content: Content, id: string): string => content.resourceById.get(id)?.name ?? id;

const priceText = (content: Content, p: Price): string =>
  `${fmt(p.amount)} ${resName(content, p.resource)}`;

/**
 * A wait in seconds as the Next buy column shows it (DESIGN.md §4): days and hours, hours and
 * minutes, minutes and seconds, or seconds. No income, and absurdly long waits, show a dash.
 */
export function formatWait(seconds: number | null): string {
  const t = COPY.production;
  if (seconds === null || !Number.isFinite(seconds)) return t.waitNever;
  const total = Math.max(1, Math.ceil(seconds));
  const days = Math.floor(total / 86_400);
  if (days > 999) return t.waitNever;
  if (days > 0) return t.waitDays(days, Math.floor((total % 86_400) / 3600));
  const hours = Math.floor(total / 3600);
  if (hours > 0) return t.waitHours(hours, Math.floor((total % 3600) / 60));
  const minutes = Math.floor(total / 60);
  if (minutes > 0) return t.waitMinutes(minutes, total % 60);
  return t.waitSeconds(total);
}

/** An output gain as the number after the ×: "1.03", "12.3", "480". */
export function gainText(gain: number): string {
  if (gain >= 1000) return fmt(new Decimal(gain));
  if (gain >= 100) return String(Math.round(gain));
  if (gain >= 10) return gain.toFixed(1);
  return gain.toFixed(2);
}

/** Segments of the bar to the next milestone: how many levels it spans and how many are done. */
export function milestoneSegments(levelsToNext: number, progress: number): MilestoneSegments {
  const p = Math.min(1, Math.max(0, progress));
  const span = p < 1 ? levelsToNext / (1 - p) : levelsToNext;
  const total = Math.min(25, Math.max(1, Math.round(span)));
  return { total, filled: Math.min(total, Math.round(p * total)) };
}

function nextBuyOf(
  state: GameState,
  content: Content,
  buy: BuyLineView,
  preview: MinePreview | null,
  mods: readonly Modifier[],
): NextBuyView {
  const t = COPY.production;
  if (buy.offer.affordable) {
    const gain = preview ? outputGainMultiplier(preview) : null;
    return { ready: true, text: t.nextReady, sub: gain === null ? '' : t.nextGain(gainText(gain)) };
  }
  const wait = timeToAfford(state, content, buy.offer.price, mods);
  return {
    ready: false,
    text: formatWait(wait),
    sub: wait === null ? t.nextNoIncome : t.nextToAfford,
  };
}

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
      const preview =
        job === 'logging'
          ? previewTreeLevel(state, content, p.id, count, mods)
          : previewMineLevel(state, content, p.id, count, mods);
      const unit = `${resName(content, p.resource)}/s`;
      const value = fmt(producerRate(p, job, mods, level));
      return {
        ...base,
        kind: 'active' as const,
        stage: tileStage(state, content, job, p.id),
        levelText: COPY.production.level(level),
        output: `${value} ${unit}`,
        outputValue: value,
        outputUnit: unit,
        milestone: m
          ? {
              label: buy!.milestone,
              toGo: COPY.production.x2In(m.levelsToNext),
              progress: Math.min(1, Math.max(0, m.progress)),
              segments: milestoneSegments(m.levelsToNext, m.progress),
            }
          : null,
        nextBuy: buy ? nextBuyOf(state, content, buy, preview, mods) : null,
        note: '',
        buy,
        previewText: preview
          ? COPY.production.previewRate(fmt(preview.rateBefore), fmt(preview.rateAfter))
          : '',
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
        outputValue: '',
        outputUnit: '',
        milestone: null,
        nextBuy: null,
        note: COPY.production.unlockFor(prices.map((x) => priceText(content, x)).join(', ')),
        buy: null,
        previewText: '',
        unlock: {
          price: prices.map((x) => priceText(content, x)).join(', '),
          amount: prices.map((x) => fmt(x.amount)).join(' + '),
          resources: prices.map((x) => resName(content, x.resource)).join(' + '),
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
      outputValue: '',
      outputUnit: '',
      milestone: null,
      nextBuy: null,
      note: dungeon ? COPY.production.clearToUnlock(dungeon) : COPY.production.locked,
      buy: null,
      previewText: '',
      unlock: null,
      dungeon,
    };
  });
}

/** Gems per second of one job as the band head shows it ("204.66"); "/s" is a separate label. */
export function jobRateValue(
  state: GameState,
  content: Content,
  job: ProductionJob,
  mods: readonly Modifier[],
): string {
  return fmt(
    Object.values(jobProductionPerSecond(state, content, job, mods)).reduce(
      (acc, v) => acc.add(v),
      new Decimal(0),
    ),
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
