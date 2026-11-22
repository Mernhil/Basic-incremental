import type { CardElement, Content, RaidBoss } from '../../../../data';
import {
  Decimal,
  raidLadder,
  raidRank,
  raidTriesLeft,
  weakToElement,
  type GameState,
  type RaidFight,
} from '../../../../game';

/**
 * What the Raids view shows (DESIGN.md section 2 Raid bosses): one row per boss, the fight as the
 * stage plays it back, and the ladder. Display logic only: no DOM, unit tested.
 */

export interface BossRow {
  id: string;
  name: string;
  element: CardElement;
  weakTo: CardElement;
  art: string;
  trickKind: RaidBoss['trick']['kind'];
  trickLine: string;
  answer: string;
  triesLeft: number;
  triesMax: number;
  /** Best score as a share of the boss's HP, or null with none. */
  best: number | null;
  rank: number | null;
  /** Rows on the ladder (the AI teams and you). */
  of: number;
}

export function bossRows(state: GameState, content: Content, today: string): BossRow[] {
  return content.raids.bosses.map((b) => {
    const best = state.raids.best[b.id] ?? null;
    return {
      id: b.id,
      name: b.name,
      element: b.element,
      weakTo: weakToElement(b.element),
      art: b.art,
      trickKind: b.trick.kind,
      trickLine: b.trick.line,
      answer: b.trick.answer,
      triesLeft: raidTriesLeft(state, content, b.id, today),
      triesMax: content.raids.triesPerDay,
      best,
      rank: raidRank(content, b.id, best),
      of: content.raids.ladder.teams.length + (best === null ? 0 : 1),
    };
  });
}

/** A share of the boss's HP as a percent text ("104%"). */
export const shareText = (share: number): string => `${Math.round(share * 100)}%`;

/** A mm:ss clock ("1:30"). */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface Frame {
  /** Seconds into the fight shown, at most the fight's length. */
  t: number;
  /** HP taken off so far, as a share of the boss's HP (at most 1). */
  dealt: number;
  down: number;
  done: boolean;
}

/** The fight as it stands `t` seconds in: the saved one-second samples, interpolated. */
export function frameAt(fight: RaidFight, t: number): Frame {
  const end = fight.seconds;
  const at = Math.min(Math.max(0, t), end);
  const s = fight.samples;
  let i = 0;
  while (i + 1 < s.length && s[i + 1]!.t <= at) i++;
  const a = s[i]!;
  const b = s[i + 1];
  let dealt = a.dealt;
  if (b && b.t > a.t) dealt = a.dealt + ((b.dealt - a.dealt) * (at - a.t)) / (b.t - a.t);
  return {
    t: at,
    dealt: Math.min(1, dealt),
    down: a.down,
    done: at >= end - 1e-9,
  };
}

/** How a fight ended, for the result line. */
export type Ending = 'victory' | 'timeUp' | 'wiped';
export function ending(fight: RaidFight, durationSeconds: number): Ending {
  if (fight.killed) return 'victory';
  return fight.seconds < durationSeconds - 1e-9 ? 'wiped' : 'timeUp';
}

/** Damage dealt as a Decimal for a frame. */
export const damageAt = (fight: RaidFight, frame: Frame): Decimal => fight.hp.mul(frame.dealt);

export interface LadderLine {
  rank: number;
  name: string;
  cards: string[] | null;
  score: Decimal;
  share: number;
  you: boolean;
}

/** The ladder of one boss with the player's best, scores as damage. */
export function ladderLines(
  state: GameState,
  content: Content,
  bossId: string,
  hp: Decimal,
): LadderLine[] {
  return raidLadder(content, bossId, state.raids.best[bossId] ?? null).map((r) => ({
    rank: r.rank,
    name: r.name,
    cards: r.cards,
    score: hp.mul(r.share),
    share: r.share,
    you: r.you,
  }));
}

export interface RewardLine {
  rank: number;
  text: string;
  paid: boolean;
}

/** The rank rewards of a boss: which are already paid. */
export function rewardLines(
  state: GameState,
  content: Content,
  bossId: string,
  resourceName: (id: string) => string,
  fmt: (n: Decimal) => string,
): RewardLine[] {
  const paid = state.raids.paid[bossId] ?? Infinity;
  return [...content.raids.ladder.rewards]
    .sort((a, b) => b.rank - a.rank)
    .map((e) => ({
      rank: e.rank,
      text: e.rewards.map((r) => `${fmt(r.amount)} ${resourceName(r.resource)}`).join(', '),
      paid: paid <= e.rank,
    }));
}
