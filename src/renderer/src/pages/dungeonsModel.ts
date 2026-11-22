/**
 * Display logic of the dungeon full view (DESIGN.md §6; UI_RULES.md §2 The dungeon full view): the
 * small counts of the duel, the Challenge button and verdict, and the cells of the stage map in the
 * Dungeons panel. Pure: the views turn game state into these inputs; no game rules here.
 */
import { resistsElement, weakToElement } from '../../../game';
import type { CardElement } from '../../../data';

/** Bars of a boss already gone: "2 of 5" is `{ gone: 2, total: 5 }`. */
export function barsGone(total: number, remaining: number): { gone: number; total: number } {
  const all = Math.max(1, Math.floor(total));
  return { gone: Math.min(all, Math.max(0, all - Math.max(0, Math.floor(remaining)))), total: all };
}

/** A health fraction as a whole percent for the party bar ("86%"); a sliver shows as 1%. */
export function healthPercent(fraction: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(100, Math.max(1, Math.round(fraction * 100)));
}

/** The overflow switch of a stage: locked before its star level opens it, then off or on. */
export type OverflowSwitch = 'locked' | 'off' | 'on';

export function overflowSwitch(info: {
  overflowUnlocked: boolean;
  overflowOn: boolean;
}): OverflowSwitch {
  if (!info.overflowUnlocked) return 'locked';
  return info.overflowOn ? 'on' : 'off';
}

/** The stars of a dungeon on the map as "earned of the most it can have". */
export function starTotal(levels: number, maxLevels: number): { levels: number; max: number } {
  return { levels: Math.max(0, Math.min(levels, maxLevels)), max: Math.max(0, maxLevels) };
}

/** What the Challenge button can do right now (DESIGN.md §6 Farming and Challenge). */
export type ChallengeButton =
  /** Press to start the next Challenge. */
  | 'ready'
  /** A Challenge is being fought. */
  | 'running'
  /** The loadout is knocked out: wait. */
  | 'knocked'
  /** The last floor of the tier: nothing to challenge. */
  | 'none';

/** The Challenge button's state from what the game says (no rules here). */
export function challengeButton(input: {
  running: boolean;
  hasNext: boolean;
  knockoutSeconds: number;
}): ChallengeButton {
  if (input.running) return 'running';
  if (!input.hasNext) return 'none';
  if (input.knockoutSeconds > 0) return 'knocked';
  return 'ready';
}

/** The banner a finished Challenge shows: Victory, or Defeat with why it was lost. */
export interface ChallengeVerdict {
  kind: 'victory' | 'defeat';
  /** Why it was lost (null for a Victory). */
  reason: 'timer' | 'health' | null;
  /** Enemy HP left when it was lost, shown only when some was left. */
  showHpLeft: boolean;
}

export function challengeVerdict(event: {
  won: boolean;
  reason: 'timer' | 'health' | null;
  hpLeftPositive: boolean;
}): ChallengeVerdict {
  if (event.won) return { kind: 'victory', reason: null, showHpLeft: false };
  return { kind: 'defeat', reason: event.reason, showHpLeft: event.hpLeftPositive };
}

/** One cell of the stage map (UI_RULES §2 The duel in detail): a stage on one tier. */
export interface StageCell {
  /** The tier is not open yet in this dungeon. */
  locked: boolean;
  /** Star level 0..6 (the pips lit). */
  level: number;
  kills: number;
  /** Kills left to the next level, null at the top. */
  toNext: number | null;
  overflow: OverflowSwitch;
}

export function stageCell(
  info: {
    level: number;
    kills: number;
    nextKills: number | null;
    overflowUnlocked: boolean;
    overflowOn: boolean;
  },
  tierOpen: boolean,
): StageCell {
  return {
    locked: !tierOpen,
    level: Math.max(0, Math.min(6, info.level)),
    kills: info.kills,
    toNext: info.nextKills === null ? null : Math.max(0, info.nextKills - info.kills),
    overflow: overflowSwitch(info),
  };
}

/** One element a boss is weak to or resists, with the percent it changes a card's damage by. */
export interface BossElement {
  element: string;
  percent: number;
}

/**
 * What the dungeon panel says about a boss's elements (DESIGN.md §2 Fights): its own element, the
 * one it is weak to and, unless it is light or dark, the one it resists (the circle). `sizes` are
 * the percents from `combat.json`.
 */
export function bossElements(
  boss: { element: CardElement },
  sizes: { weakness: number; resistance: number },
): { own: string; weak: BossElement; resist?: BossElement } {
  const resisted = resistsElement(boss.element);
  return {
    own: boss.element,
    weak: { element: weakToElement(boss.element), percent: sizes.weakness },
    ...(resisted ? { resist: { element: resisted, percent: sizes.resistance } } : {}),
  };
}
