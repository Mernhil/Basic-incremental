import type { ArenaRank, Card, Content } from '../../../../data';
import {
  arenaLadder,
  arenaOpen,
  arenaRank,
  arenaShop,
  arenaTriesLeft,
  currentRival,
  rankForPlace,
  rowPower,
  seasonEndsIn,
  type ArenaRow,
  type GameState,
} from '../../../../game';

/**
 * What the Arena view shows (DESIGN.md Arena and raids): the season line, the two teams on the duel
 * floor, the ladder around the player, the season chest track and the frame of a finished season.
 * Display logic only: no DOM, unit tested.
 */

/** "3d 14h", "5h 12m", "9m": the time left in a season. */
export function durationText(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export interface TeamSlot {
  id: string;
  card: Card;
}

/** The cards of a team in slot order (empty slots left out). */
export function teamSlots(content: Content, ids: readonly (string | null)[]): TeamSlot[] {
  const out: TeamSlot[] = [];
  for (const id of ids) {
    const card = id === null ? undefined : content.cardById.get(id);
    if (id !== null && card) out.push({ id, card });
  }
  return out;
}

export interface LadderLine {
  rank: number;
  name: string;
  points: number;
  you: boolean;
  /** Card ids of the AI row's team; null for the player's row. */
  cards: string[] | null;
  /** The row's team power, 0 for the player's row (shown from the player's own team). */
  power: number;
}

/** The rows around the player (or the first ones with the whole ladder asked for). */
export function ladderWindow(
  rows: readonly ArenaRow[],
  whole: boolean,
  content: Content,
  playerPower = 0,
  count = 7,
): LadderLine[] {
  const me = rows.findIndex((r) => r.you);
  let from = Math.max(0, me - 4);
  from = Math.min(from, Math.max(0, rows.length - count));
  const part = whole ? rows : rows.slice(from, from + count);
  return part.map((r) => ({
    rank: r.rank,
    name: r.name,
    points: r.points,
    you: r.you,
    cards: r.archetype ? [...r.archetype.cards] : null,
    power: r.you ? 0 : whole ? 0 : rowPower(content, r, playerPower),
  }));
}

export interface ChestStep {
  rank: ArenaRank;
  /** "Top 100", "Champion #1" ... */
  label: string;
  /** What the chest holds, in words. */
  rewards: string;
  /** The band the player is in now. */
  current: boolean;
  frame: boolean;
}

/** The season chest track: best rank first, as the mock shows it. */
export function chestTrack(
  content: Content,
  place: number,
  resourceName: (id: string) => string,
  coin: 'arena' | 'raid',
): ChestStep[] {
  const now = rankForPlace(content, place).id;
  return [...content.arena.ranks].reverse().map((rank) => {
    const parts = rank.chest.rewards.map(
      (r) => `${r.amount.toString()} ${resourceName(r.resource)}`,
    );
    const coins = coin === 'arena' ? rank.chest.arenaCoins : rank.chest.raidCoins;
    if (coins > 0)
      parts.push(`${coins} ${coin === 'arena' ? 'arena coins' : 'raid coins of each boss'}`);
    return {
      rank,
      label: rank.name,
      rewards: parts.join(', '),
      current: rank.id === now,
      frame: rank.frame,
    };
  });
}

/** The text a rank frame carries: its top number and the season (the medallion's 8 px font). */
export function frameText(
  content: Content,
  rankId: string,
  season: number,
): { number: string; season: string } {
  const rank = content.arena.ranks.find((r) => r.id === rankId)!;
  return { number: String(rank.top ?? 0), season: `S${season}` };
}

/**
 * The best title the player has earned: "S<season> <Rank>" for the best frame rank of any past season
 * (a tie goes to the later season), or "Contender" with none (a Default, DESIGN.md section 3).
 */
export function bestTitle(
  state: GameState,
  content: Content,
  mode: 'arena' | 'raid' = 'arena',
): string {
  let best: { top: number; season: number; name: string } | null = null;
  for (const f of state.arena.frames) {
    if (f.mode !== mode) continue;
    const rank = content.arena.ranks.find((r) => r.id === f.rank);
    if (!rank || rank.top === null) continue;
    if (!best || rank.top < best.top || (rank.top === best.top && f.season > best.season))
      best = { top: rank.top, season: f.season, name: rank.name };
  }
  return best ? `S${best.season} ${best.name}` : 'Contender';
}

export interface ArenaScreen {
  open: boolean;
  season: number;
  endsIn: string;
  rank: number;
  /** The best title earned (`bestTitle`). */
  title: string;
  points: number;
  triesLeft: number;
  triesMax: number;
  coins: number;
  you: TeamSlot[];
  yourPower: number;
  rival: { row: ArenaRow; slots: TeamSlot[]; power: number } | null;
  ladder: LadderLine[];
  chests: number;
}

export function arenaScreen(
  state: GameState,
  content: Content,
  now: number,
  today: string,
  whole: boolean,
  yourPower: number,
  /** The rival of the fight now playing: its floor keeps showing them after the next rival is drawn. */
  fought?: ArenaRow,
): ArenaScreen {
  const season = state.arena.season;
  const rows = arenaLadder(content, season, now, state.arena.points);
  const rank = arenaRank(state, content, now);
  const rival = fought ?? currentRival(state, content, now);
  return {
    open: arenaOpen(state, content),
    season,
    endsIn: durationText(seasonEndsIn(content, season, now)),
    rank,
    title: bestTitle(state, content),
    points: state.arena.points,
    triesLeft: arenaTriesLeft(state, content, today),
    triesMax: content.arena.fights.perDay,
    coins: state.arena.coins,
    you: teamSlots(content, state.cards.loadouts.fighting.slots),
    yourPower,
    rival: rival
      ? {
          row: rival,
          slots: teamSlots(content, rival.archetype?.cards ?? []),
          power: rowPower(content, rival, yourPower),
        }
      : null,
    ladder: ladderWindow(rows, whole, content, yourPower),
    chests: state.arena.chests.length,
  };
}

/** The arena Heirlooms on sale (the last two seasons). */
export { arenaShop };
