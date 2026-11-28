import type { ArenaArchetype, ArenaBand, ArenaRank, Card, Content, ShopItem } from '../data';
import { defencePercent } from './combat';
import { levelCap } from './cards';
import {
  buildTeam,
  cardRun,
  damageTaken,
  enemyTarget,
  healFromMoves,
  isStanding,
  knockOut,
  teamAverageDps,
  teamMaxHealth,
  weakenFactor,
  type TeamCard,
} from './duel';
import { elementMatchup } from './elements';
import { firstAscensionOpen } from './prestige';
import { collectModifiers, type Modifier } from './modifiers';
import { Decimal } from './num';
import {
  cloneState,
  createInitialState,
  newOwnedCard,
  type ArenaState,
  type GameState,
} from './state';
import { grantCard } from './cards';
import { ARENA_ID, shopPerkModifiers } from './shopPerks';

/**
 * The arena (DESIGN.md Arena and raids): the player's team of four fights AI rival teams in 4v4
 * auto-duels on the duel engine, both sides attacking, and climbs a ladder over seasons of four
 * weeks that the raids share. No server: the ladder is a field of AI rows whose points grow with the
 * season's clock, and the player's rank is the place their points take among them. Everything is
 * deterministic: the same teams always give the same result, and the rows, names and rivals are
 * drawn from the season number. All numbers are in `src/data/content/arena.json`.
 */

const DAY_MS = 86_400_000;
/** Seconds per step of a fight. */
const STEP = 0.25;
const EPSILON = 1e-9;
/** A clock set back by more than this before the season began starts the season check again
 *  (the same limit the game loop uses, `MAX_STEP_MS`). */
const CLOCK_BACK_MS = 8 * 3_600_000;

// ---- the season clock -----------------------------------------------------------------------------

/** When a season starts (epoch ms, 00:00 UTC). Season 1 starts on `season.startsOn`. */
export function seasonStartMs(content: Content, season: number): number {
  const [y, m, d] = content.arena.season.startsOn.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return Date.UTC(y, m - 1, d) + (season - 1) * content.arena.season.days * DAY_MS;
}

/** The season a moment belongs to: 0 before season 1, else 1, 2, 3 ... */
export function seasonAt(content: Content, now: number): number {
  const first = seasonStartMs(content, 1);
  if (now < first) return 0;
  return Math.floor((now - first) / (content.arena.season.days * DAY_MS)) + 1;
}

/** How far through its season a moment is, 0 to 1. */
export function seasonProgress(content: Content, season: number, now: number): number {
  const start = seasonStartMs(content, season);
  return Math.min(1, Math.max(0, (now - start) / (content.arena.season.days * DAY_MS)));
}

/** Milliseconds until the season ends (never negative). */
export function seasonEndsIn(content: Content, season: number, now: number): number {
  return Math.max(0, seasonStartMs(content, season + 1) - now);
}

/** The arena and the raid shops are open from the same milestone as Ascension. */
export function arenaOpen(state: GameState, content: Content): boolean {
  return firstAscensionOpen(state, content);
}

/**
 * Brings the season up to `now` and returns the new state (the same state when nothing changed).
 * The first look starts the current season. When a season ends the player's final places are made
 * into chests (and frames) waiting to be claimed and the season's figures start again; a clock
 * jumped far ahead pays only the season the player was in, once (`paidThrough`), and a clock set
 * back never goes to an earlier season unless it is more than 8 hours before the current season's
 * start, when the season check starts again without any reward (so nothing counts twice).
 */
export function syncSeason(state: GameState, content: Content, now: number): GameState {
  const current = seasonAt(content, now);
  const a = state.arena;
  if (current === 0) return state;
  const enter = (from: ArenaState): ArenaState => ({
    ...clearSeason(from),
    season: current,
    checkedAt: now,
    paidThrough: Math.max(from.paidThrough, current - 1),
  });
  if (a.season === 0) return withArena(state, enter(a));
  if (current === a.season) return state;
  if (current > a.season) {
    const next = cloneState(state);
    finalizeSeason(next, content);
    next.arena = enter(next.arena);
    return next;
  }
  // The clock is behind the stored season: a small step back changes nothing, a big one starts the
  // season check again (no reward: `paidThrough` already covers the seasons seen).
  if (now < seasonStartMs(content, a.season) - CLOCK_BACK_MS) return withArena(state, enter(a));
  return state;
}

function withArena(state: GameState, arena: ArenaState): GameState {
  return { ...state, arena };
}

/** The season's figures start again (coins, purchases, chests and frames stay). */
function clearSeason(a: ArenaState): ArenaState {
  return {
    ...a,
    points: 0,
    wins: 0,
    losses: 0,
    used: 0,
    rolls: 0,
    raidBest: {},
  };
}

// ---- hashing, names -----------------------------------------------------------------------------

/** A repeatable 32-bit hash of three numbers (the same inputs always give the same output). */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul((c | 0) + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A repeatable number in [-1, 1) from a hash. */
const unit = (h: number): number => (h / 0x100000000) * 2 - 1;

// ---- the ladder ---------------------------------------------------------------------------------

export interface ArenaRow {
  /** Place on the ladder, 1 = best. */
  rank: number;
  /** The AI row's index (0 = the best at the season's end); -1 for the player. */
  index: number;
  name: string;
  points: number;
  you: boolean;
  /** The archetype the AI row plays (null for the player). */
  archetype: ArenaArchetype | null;
  band: ArenaBand | null;
}

/** The band a place on the ladder belongs to: the one starting at the largest rank number not above it. */
export function bandForRank(content: Content, rank: number): ArenaBand {
  const bands = [...content.arena.bands].sort((a, b) => b.fromRank - a.fromRank);
  return bands.find((b) => b.fromRank <= rank) ?? bands[bands.length - 1]!;
}

/** The rank band (Contender ... Champion) a place on the ladder earns. */
export function rankForPlace(content: Content, place: number): ArenaRank {
  const ranks = content.arena.ranks;
  let best = ranks[0]!;
  for (const r of ranks) if (r.top !== null && place <= r.top) best = r;
  return best;
}

/** What an AI row has at a moment: its final points times how far the season has run. */
function aiPoints(final: number, startShare: number, progress: number): number {
  return Math.floor(final * (startShare + (1 - startShare) * progress));
}

interface AiRow {
  index: number;
  final: number;
}

/** The AI field of a season, best first: each row's final points (a smooth fall with rank, a seeded
 *  wobble) sorted so that the order never changes during the season. */
function aiField(
  size: number,
  top: number,
  curve: number,
  jitter: number,
  season: number,
  salt: number,
): AiRow[] {
  const rows: AiRow[] = [];
  for (let i = 0; i < size; i++) {
    const smooth = top * Math.pow(1 - i / size, curve);
    rows.push({ index: i, final: smooth * (1 + jitter * unit(hash3(season, i, salt))) });
  }
  rows.sort((a, b) => b.final - a.final || a.index - b.index);
  return rows;
}

function rowName(content: Content, season: number, index: number): string {
  const { first, second } = content.arena.ladder;
  return `${first[hash3(season, index, 11) % first.length]} ${second[hash3(season, index, 12) % second.length]}`;
}

/**
 * The arena ladder at a moment: the AI rows by their points then, with the player's row where their
 * points put it (a tie goes to the AI row). `points` is the player's; pass null to leave the player out.
 */
export function arenaLadder(
  content: Content,
  season: number,
  now: number,
  points: number | null,
): ArenaRow[] {
  const cfg = content.arena.ladder;
  const progress = seasonProgress(content, season, now);
  const field = aiField(cfg.size, cfg.topPoints, cfg.curve, cfg.jitter, season, 1);
  const rows: ArenaRow[] = field.map((r, i) => {
    const band = bandForRank(content, i + 1);
    const archetype = archetypeFor(content, band, season, r.index);
    return {
      rank: 0,
      index: r.index,
      name: rowName(content, season, r.index),
      points: aiPoints(r.final, cfg.startShare, progress),
      you: false,
      archetype,
      band,
    };
  });
  if (points !== null)
    rows.push({ rank: 0, index: -1, name: 'You', points, you: true, archetype: null, band: null });
  rows.sort((a, b) => b.points - a.points || Number(a.you) - Number(b.you));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function archetypeFor(
  content: Content,
  band: ArenaBand,
  season: number,
  index: number,
): ArenaArchetype {
  const id = band.archetypes[hash3(season, index, 21) % band.archetypes.length]!;
  return content.arena.archetypes.find((a) => a.id === id)!;
}

/** The player's place on the arena ladder now. */
export function arenaRank(state: GameState, content: Content, now: number): number {
  const rows = arenaLadder(content, state.arena.season, now, state.arena.points);
  return rows.find((r) => r.you)!.rank;
}

// ---- the rival's team ---------------------------------------------------------------------------

/** A scratch state that owns a band's version of an archetype's four cards and fights with them. */
export function rivalState(
  content: Content,
  archetype: ArenaArchetype,
  band: ArenaBand,
): GameState {
  const s = createInitialState(content);
  s.cards.owned = {};
  for (const id of archetype.cards) {
    const card = content.cardById.get(id)!;
    const owned = newOwnedCard(card.tier);
    owned.level = Math.min(band.level, levelCap(content, { tier: card.tier, stars: band.stars }));
    owned.stars = band.stars;
    owned.skillOpen = true;
    s.cards.owned[id] = owned;
  }
  s.cards.loadouts.fighting = { slots: [...archetype.cards] };
  return s;
}

/** The band's strength, through the modifier pipeline (source `shop`-free: a plain list). */
function bandModifiers(band: ArenaBand, factor = 1): Modifier[] {
  const source = { kind: 'account', id: `arena:${band.id}` } as const;
  return [
    { stat: 'combat.damage', kind: 'mult', value: new Decimal(band.damage * factor), source },
    { stat: 'combat.health', kind: 'mult', value: new Decimal(band.health * factor), source },
  ];
}

const rawPowerCache = new WeakMap<Content, Map<string, number>>();

/** An archetype's power at a band's own level, stars and strength, before it follows the player. */
function rawPower(content: Content, archetype: ArenaArchetype, band: ArenaBand): number {
  let cache = rawPowerCache.get(content);
  if (!cache) rawPowerCache.set(content, (cache = new Map()));
  const key = `${archetype.id}/${band.id}`;
  let p = cache.get(key);
  if (p === undefined) {
    p = teamPower(rivalTeam(content, archetype, band).team);
    cache.set(key, p);
  }
  return p;
}

/**
 * How much stronger (or weaker) a rival is made so that its power is the band's `ratio` times
 * `anchorPower` to the power `adapt` of the player's own: rivals follow the player's progress, but
 * only partly, so growing stronger still pays. 1 with no player power (the search and the checks).
 */
export function rivalFactor(
  content: Content,
  archetype: ArenaArchetype,
  band: ArenaBand,
  playerPower: number,
): number {
  if (!(playerPower > 0)) return 1;
  const { adapt, anchorPower } = content.arena.strength;
  const target = band.ratio * Math.pow(anchorPower, 1 - adapt) * Math.pow(playerPower, adapt);
  const raw = rawPower(content, archetype, band);
  return raw > 0 ? target / raw : 1;
}

/** A rival's team built and ready: its cards after the band's strength. */
export function rivalTeam(
  content: Content,
  archetype: ArenaArchetype,
  band: ArenaBand,
  /** The player's team power: the rival follows it (`rivalFactor`); without it the band's own. */
  playerPower?: number,
): { state: GameState; modifiers: Modifier[]; team: TeamCard[] } {
  const state = rivalState(content, archetype, band);
  const factor = playerPower === undefined ? 1 : rivalFactor(content, archetype, band, playerPower);
  const modifiers = [...collectModifiers(state, content), ...bandModifiers(band, factor)];
  return { state, modifiers, team: buildTeam(state, content, modifiers, ARENA_ID) };
}

/** A team's power: the square root of its damage per second times its health, for the ladder. */
export function teamPower(team: readonly TeamCard[]): number {
  return Math.sqrt(teamAverageDps(team).mul(teamMaxHealth(team)).toNumber());
}

/** A ladder row's power for a player of `playerPower` (the archetype at its band, following the player). */
export function rowPower(content: Content, row: ArenaRow, playerPower: number): number {
  if (!row.archetype || !row.band) return 0;
  return (
    rawPower(content, row.archetype, row.band) *
    rivalFactor(content, row.archetype, row.band, playerPower)
  );
}

// ---- rivals ------------------------------------------------------------------------------------

/** The rows the player can be matched with: a few above and below their place. */
export function rivalRows(state: GameState, content: Content, now: number): ArenaRow[] {
  const rows = arenaLadder(content, state.arena.season, now, state.arena.points);
  const me = rows.find((r) => r.you)!.rank;
  const { rivalsAbove, rivalsBelow } = content.arena.ladder;
  const lo = Math.max(1, me - rivalsAbove);
  const hi = me + rivalsBelow;
  return rows.filter((r) => !r.you && r.rank >= lo && r.rank <= hi);
}

/** The rival on offer now; `Other rival` raises `arena.rolls`. */
export function currentRival(state: GameState, content: Content, now: number): ArenaRow | null {
  const rows = rivalRows(state, content, now);
  if (rows.length === 0) return null;
  return rows[hash3(state.arena.season, state.arena.rolls, 31) % rows.length]!;
}

/** Offers another rival. */
export function otherRival(state: GameState): GameState {
  const next = cloneState(state);
  next.arena.rolls += 1;
  return next;
}

// ---- the fight ----------------------------------------------------------------------------------

export interface ArenaSample {
  t: number;
  /** Health left, as a share of each team's maximum. */
  you: number;
  rival: number;
  /** Cards knocked out so far on each side. */
  youDown: number;
  rivalDown: number;
}

export interface ArenaFight {
  won: boolean;
  seconds: number;
  /** The ids of the cards knocked out on each side. */
  youOut: string[];
  rivalOut: string[];
  youHealth: number;
  rivalHealth: number;
  samples: ArenaSample[];
  /** Damage dealt by each side's cards, for the screen's read-out. */
  youPower: number;
  rivalPower: number;
}

/** Share of a team's health left. */
function healthShare(state: GameState, team: readonly TeamCard[]): number {
  const hittable = team.filter((c) => c.maxHealth.gt(0));
  const max = teamMaxHealth(hittable);
  if (max.lte(0)) return 0;
  let left = new Decimal(0);
  for (const c of hittable)
    left = left.add(Decimal.max(c.maxHealth.sub(damageTaken(state, c.id)), 0));
  return left.div(max).toNumber();
}

function alive(state: GameState, team: readonly TeamCard[]): boolean {
  return team.some((c) => c.maxHealth.gt(0) && isStanding(state, c));
}

/** The damage factor that makes a mirror match last `targetSeconds` (the same for both sides). */
export function damageFactor(
  content: Content,
  a: readonly TeamCard[],
  b: readonly TeamCard[],
): Decimal {
  const health = teamMaxHealth(a).add(teamMaxHealth(b)).div(2);
  const dps = teamAverageDps(a).add(teamAverageDps(b)).div(2);
  if (dps.lte(0) || health.lte(0)) return new Decimal(1);
  return health.div(dps.mul(content.arena.fights.targetSeconds));
}

function elementOf(c: TeamCard): Parameters<typeof elementMatchup>[0] {
  return c.moves?.element ?? undefined;
}

/**
 * Fights two built teams: both sides attack at once, each card's hits and ultimates on the play-time
 * clock land on the other team's front-row standing card (the guard first), heals land with the
 * ultimates, the element circle and the defender's defence change each hit, and the fight ends when
 * a team is all down or at `maxSeconds`, when the team with more health left wins (a tie goes to the
 * rival). No state is changed and one pair of teams always gives one result.
 */
export function duelTeams(
  content: Content,
  you: { team: readonly TeamCard[]; modifiers: readonly Modifier[] },
  rival: { team: readonly TeamCard[]; modifiers: readonly Modifier[] },
): ArenaFight {
  const cfg = content.arena.fights;
  const weakness = content.combat.elements.weakness.toNumber();
  const resistance = content.combat.elements.resistance.toNumber();
  const factor = damageFactor(content, you.team, rival.team);
  const sy = cloneState(createInitialState(content));
  const sr = cloneState(sy);
  const defY = 1 - defencePercent(you.modifiers, ARENA_ID) / 100;
  const defR = 1 - defencePercent(rival.modifiers, ARENA_ID) / 100;
  const samples: ArenaSample[] = [{ t: 0, you: 1, rival: 1, youDown: 0, rivalDown: 0 }];
  let t = 0;
  let nextSample = 1;
  let step = 0;
  while (t < cfg.maxSeconds - EPSILON) {
    const t1 = Math.min(t + STEP, cfg.maxSeconds);
    // Each side's damage on the other, from the state at the start of the step.
    const hitsOn = (
      from: readonly TeamCard[],
      fromState: GameState,
      against: readonly TeamCard[],
      againstState: GameState,
      defence: number,
    ): Map<string, Decimal> => {
      const dealt = new Map<string, Decimal>();
      const weaken = weakenFactor(againstState, against);
      for (const card of from) {
        if (!isStanding(fromState, card)) continue;
        const run = cardRun(card, t, t1);
        if (run.hits <= 0) continue;
        againstState.combat.enemyIndex = step * 4 + card.slot;
        const target = enemyTarget(againstState, against);
        if (!target) continue;
        const relation = elementMatchup(elementOf(card), elementOf(target));
        const element =
          relation === 'weak'
            ? 1 + weakness / 100
            : relation === 'resist'
              ? 1 + resistance / 100
              : 1;
        let damage = card.hit.mul(run.hits);
        if (run.bursts > 0) damage = damage.add(card.signature.mul(run.bursts));
        damage = damage.mul(factor).mul(element).mul(defence).mul(weaken);
        dealt.set(target.id, (dealt.get(target.id) ?? new Decimal(0)).add(damage));
      }
      return dealt;
    };
    const onRival = hitsOn(you.team, sy, rival.team, sr, defR);
    const onYou = hitsOn(rival.team, sr, you.team, sy, defY);
    // Heals from ultimates fired in this step (before the blows land, on standing cards).
    for (const [team, st] of [
      [you.team, sy],
      [rival.team, sr],
    ] as const) {
      for (const card of team) {
        if (!isStanding(st, card) || card.heals.length === 0) continue;
        const run = cardRun(card, t, t1);
        if (run.bursts > 0) healFromMoves(st, team, card, run.bursts);
      }
    }
    for (const [dealt, team, st] of [
      [onRival, rival.team, sr],
      [onYou, you.team, sy],
    ] as const) {
      for (const [id, amount] of dealt) {
        const card = team.find((c) => c.id === id);
        if (!card) continue;
        const taken = damageTaken(st, id).add(amount);
        if (taken.gte(card.maxHealth)) knockOut(st, card);
        else st.combat.cardDamage[id] = taken;
      }
    }
    t = t1;
    step++;
    if (t + EPSILON >= nextSample) {
      samples.push({
        t: nextSample,
        you: healthShare(sy, you.team),
        rival: healthShare(sr, rival.team),
        youDown: sy.combat.cardsOut.length,
        rivalDown: sr.combat.cardsOut.length,
      });
      nextSample++;
    }
    if (!alive(sy, you.team) || !alive(sr, rival.team)) break;
  }
  const youHealth = healthShare(sy, you.team);
  const rivalHealth = healthShare(sr, rival.team);
  const youAlive = alive(sy, you.team);
  const rivalAlive = alive(sr, rival.team);
  const won = rivalAlive
    ? youAlive && youHealth > rivalHealth && t >= cfg.maxSeconds - EPSILON
    : youAlive;
  samples.push({
    t,
    you: youHealth,
    rival: rivalHealth,
    youDown: sy.combat.cardsOut.length,
    rivalDown: sr.combat.cardsOut.length,
  });
  return {
    won,
    seconds: t,
    youOut: [...sy.combat.cardsOut],
    rivalOut: [...sr.combat.cardsOut],
    youHealth,
    rivalHealth,
    samples,
    youPower: teamPower(you.team),
    rivalPower: teamPower(rival.team),
  };
}

/** The player's team and modifiers for an arena fight against a rival (perks that name a tag
 *  count when the rival carries it). */
export function youForArena(
  state: GameState,
  content: Content,
  rivalTags: readonly string[],
): { team: TeamCard[]; modifiers: Modifier[] } {
  const modifiers = [
    ...collectModifiers(state, content),
    ...shopPerkModifiers(state, content, rivalTags, 'vs'),
  ];
  return { team: buildTeam(state, content, modifiers, ARENA_ID), modifiers };
}

/** The player's team power (without any perk that names a tag). */
export function ownPower(state: GameState, content: Content): number {
  const team = youForArena(state, content, []).team;
  return team.some((c) => c.maxHealth.gt(0)) ? teamPower(team) : 0;
}

/** Fights a ladder row with the player's team; the state is not changed. */
export function fightArena(state: GameState, content: Content, row: ArenaRow): ArenaFight | null {
  if (!row.archetype || !row.band) return null;
  const you = youForArena(state, content, row.archetype.tags);
  const rival = rivalTeam(content, row.archetype, row.band, ownPower(state, content));
  return duelTeams(content, you, rival);
}

// ---- trying the arena --------------------------------------------------------------------------

export type ArenaFailure = 'locked' | 'no-season' | 'no-team' | 'no-tries' | 'no-rival';

export interface ArenaTry {
  fight: ArenaFight;
  rival: ArenaRow;
  pointsDelta: number;
  coins: number;
  rankBefore: number;
  rankAfter: number;
}

export type ArenaTryResult =
  { ok: true; state: GameState; result: ArenaTry } | { ok: false; reason: ArenaFailure };

/** Fights left today. */
export function arenaTriesLeft(state: GameState, content: Content, today: string): number {
  const used = state.arena.day === today ? state.arena.used : 0;
  return Math.max(0, content.arena.fights.perDay - used);
}

/** The player's team has a card that can fight. */
export function arenaHasTeam(state: GameState, content: Content): boolean {
  return buildTeam(state, content, [], ARENA_ID).some((c) => c.maxHealth.gt(0));
}

/**
 * Spends one of today's fights on the rival on offer (the state must be synced to `now`): a win
 * gives points (more against a rival ranked above) and coins, a loss a few of each, and a new rival
 * is drawn.
 */
export function tryArena(
  state: GameState,
  content: Content,
  now: number,
  today: string,
): ArenaTryResult {
  if (!arenaOpen(state, content)) return { ok: false, reason: 'locked' };
  if (state.arena.season === 0) return { ok: false, reason: 'no-season' };
  if (!arenaHasTeam(state, content)) return { ok: false, reason: 'no-team' };
  if (arenaTriesLeft(state, content, today) <= 0) return { ok: false, reason: 'no-tries' };
  const rival = currentRival(state, content, now);
  if (!rival) return { ok: false, reason: 'no-rival' };
  const fight = fightArena(state, content, rival)!;
  const cfg = content.arena;
  const rankBefore = arenaRank(state, content, now);
  const higher = rival.rank < rankBefore;
  const next = cloneState(state);
  if (next.arena.day !== today) {
    next.arena.day = today;
    next.arena.used = 0;
  }
  next.arena.used += 1;
  next.arena.rolls += 1;
  let pointsDelta: number;
  let coins: number;
  if (fight.won) {
    pointsDelta = Math.round(cfg.points.win * (1 + (higher ? cfg.points.higherBonus : 0)));
    coins = cfg.coins.win + (higher ? cfg.coins.higherBonus : 0);
    next.arena.wins += 1;
  } else {
    pointsDelta = -Math.min(cfg.points.loss, next.arena.points);
    coins = cfg.coins.loss;
    next.arena.losses += 1;
  }
  next.arena.points += pointsDelta;
  next.arena.coins += coins;
  const rankAfter = arenaRank(next, content, now);
  return {
    ok: true,
    state: next,
    result: { fight, rival, pointsDelta, coins, rankBefore, rankAfter },
  };
}

// ---- the raid season and coins ------------------------------------------------------------------

/** The player's raid season score: the sum of their best score shares on the bosses. */
export function raidSeasonScore(state: GameState): number {
  return Object.values(state.arena.raidBest).reduce((a, b) => a + b, 0);
}

/** The raid season ladder: AI rows with a season score each and the player's. */
export function raidSeasonLadder(
  content: Content,
  season: number,
  now: number,
  score: number | null,
): { rank: number; name: string; score: number; you: boolean }[] {
  const cfg = content.arena.raid.ladder;
  const progress = seasonProgress(content, season, now);
  const field = aiField(cfg.size, cfg.topScore, cfg.curve, cfg.jitter, season, 2);
  const rows = field.map((r) => ({
    rank: 0,
    name: rowName(content, season, r.index + 1000),
    score: r.final * (cfg.startShare + (1 - cfg.startShare) * progress),
    you: false,
  }));
  if (score !== null && score > 0) rows.push({ rank: 0, name: 'You', score, you: true });
  rows.sort((a, b) => b.score - a.score || Number(a.you) - Number(b.you));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** The player's place on the raid season ladder, or null with no score yet. */
export function raidSeasonRank(state: GameState, content: Content, now: number): number | null {
  const score = raidSeasonScore(state);
  if (score <= 0) return null;
  return raidSeasonLadder(content, state.arena.season, now, score).find((r) => r.you)!.rank;
}

/** Raid coins a try pays (`arena.json` `raid.coins`). */
export function raidCoinsFor(content: Content, share: number, killed: boolean): number {
  const c = content.arena.raid.coins;
  return Math.floor(share * c.perShare) + (killed ? c.perKill : 0);
}

// ---- season end ---------------------------------------------------------------------------------

/**
 * Makes the chests (and frames, on claiming) of the season that is ending (a state being built): the
 * arena's if the player fought, the raids' if they scored. Once per season.
 */
function finalizeSeason(next: GameState, content: Content): void {
  const a = next.arena;
  const season = a.season;
  if (season <= a.paidThrough) return;
  const end = seasonStartMs(content, season + 1);
  if (a.wins + a.losses > 0) {
    const rows = arenaLadder(content, season, end, a.points);
    const place = rows.find((r) => r.you)!.rank;
    a.chests.push({ mode: 'arena', season, rank: rankForPlace(content, place).id, place });
  }
  const score = raidSeasonScore(next);
  if (score > 0) {
    const rows = raidSeasonLadder(content, season, end, score);
    const place = rows.find((r) => r.you)!.rank;
    a.chests.push({ mode: 'raid', season, rank: rankForPlace(content, place).id, place });
  }
  a.paidThrough = season;
}

/** Opens the first waiting chest: pays its resources and coins and keeps the frame (Top 100 and
 *  better). Null when none waits. */
export function claimSeasonChest(
  state: GameState,
  content: Content,
): { state: GameState; chest: GameState['arena']['chests'][number]; rank: ArenaRank } | null {
  const first = state.arena.chests[0];
  if (!first) return null;
  const rank = content.arena.ranks.find((r) => r.id === first.rank)!;
  const next = cloneState(state);
  next.arena.chests.shift();
  for (const r of rank.chest.rewards)
    next.resources[r.resource] = (next.resources[r.resource] ?? new Decimal(0)).add(r.amount);
  if (first.mode === 'arena') next.arena.coins += rank.chest.arenaCoins;
  else
    for (const boss of content.raids.bosses)
      next.arena.raidCoins[boss.id] = (next.arena.raidCoins[boss.id] ?? 0) + rank.chest.raidCoins;
  if (rank.frame)
    next.arena.frames.push({
      mode: first.mode,
      season: first.season,
      rank: first.rank,
      place: first.place,
    });
  return { state: next, chest: first, rank };
}

// ---- the shops ---------------------------------------------------------------------------------

export interface ShopEntry {
  card: Card;
  price: number;
  /** The season of an arena Heirloom; the boss's id for a raid one. */
  season?: number;
  boss?: string;
  owned: boolean;
  /** Coins the player has of the right kind. */
  canAfford: boolean;
  perk: ShopItem['perk'];
}

/** The arena shop: the Heirlooms of the last `visibleSeasons` seasons that exist in data, up to the
 *  current season (oldest first). */
export function arenaShop(state: GameState, content: Content): ShopEntry[] {
  const now = state.arena.season;
  const from = now - content.arena.shop.visibleSeasons + 1;
  const out: ShopEntry[] = [];
  for (const s of content.arena.shop.seasons) {
    if (s.season > now || s.season < from) continue;
    for (const item of s.items) {
      const card = content.cardById.get(item.card)!;
      out.push({
        card,
        price: item.price,
        season: s.season,
        owned: state.arena.bought.includes(item.card),
        canAfford: state.arena.coins >= item.price,
        perk: item.perk,
      });
    }
  }
  return out;
}

/** One raid boss's shop: its four Heirlooms, always on sale, bought with that boss's coins. */
export function raidShop(state: GameState, content: Content, bossId: string): ShopEntry[] {
  const shop = content.arena.raid.shops[bossId];
  if (!shop) return [];
  const coins = state.arena.raidCoins[bossId] ?? 0;
  return shop.items.map((item) => ({
    card: content.cardById.get(item.card)!,
    price: item.price,
    boss: bossId,
    owned: state.arena.bought.includes(item.card),
    canAfford: coins >= item.price,
    perk: item.perk,
  }));
}

export type BuyFailure = 'not-on-sale' | 'owned' | 'too-poor';

export type BuyResult = { ok: true; state: GameState } | { ok: false; reason: BuyFailure };

/** Buys a shop Heirloom with the shop's coins (arena coins, or its boss's coins). */
export function buyShopHeirloom(state: GameState, content: Content, cardId: string): BuyResult {
  const entry = [
    ...arenaShop(state, content),
    ...content.raids.bosses.flatMap((b) => raidShop(state, content, b.id)),
  ].find((e) => e.card.id === cardId);
  if (!entry) return { ok: false, reason: 'not-on-sale' };
  if (entry.owned) return { ok: false, reason: 'owned' };
  if (!entry.canAfford) return { ok: false, reason: 'too-poor' };
  const next = cloneState(state);
  if (entry.boss)
    next.arena.raidCoins[entry.boss] = (next.arena.raidCoins[entry.boss] ?? 0) - entry.price;
  else next.arena.coins -= entry.price;
  next.arena.bought.push(cardId);
  grantCard(next.cards, content, entry.card);
  return { ok: true, state: next };
}
