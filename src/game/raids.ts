import type { Content, RaidBoss } from '../data';
import { defencePercent } from './combat';
import {
  buildTeam,
  cardRun,
  damageTaken,
  enemyTarget,
  healFromMoves,
  isStanding,
  knockOut,
  reviveTeam,
  weakenFactor,
  type TeamCard,
} from './duel';
import { raidCoinsFor } from './arena';
import { collectModifiers, computeStat, statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { cloneState, type GameState } from './state';

/**
 * Raid bosses (DESIGN.md §2 Raid bosses): one timed fight with the team of four, scored by the
 * damage dealt, with a ladder of AI teams and rewards, no server. The fight reuses the duel's
 * engine: the same team (`buildTeam`, scoped to the boss so the element circle and the
 * modifiers apply), each card's hits and ultimates on the play-time clock, the boss's attacks on
 * one card at a time, and heals and shields landing with the ultimates. It is the same average
 * maths as the duel, so one team always gets one result. Each boss has one trick that asks for a
 * kind of team from the moveset (`bossTrick`).
 */

/** Seconds per step of the fight. */
const STEP = 0.25;
const EPSILON = 1e-9;

/** Raids are open once the player has ascended `unlockAscensions` times. */
export function raidsOpen(state: GameState, content: Content): boolean {
  return state.prestigeCount >= content.raids.unlockAscensions;
}

/** Tries left today on a boss (`today` is the local "YYYY-MM-DD"; a new day gives them all back,
 *  also after time offline). */
export function raidTriesLeft(
  state: GameState,
  content: Content,
  bossId: string,
  today: string,
): number {
  const used = state.raids.day === today ? (state.raids.used[bossId] ?? 0) : 0;
  const perDay = statValue(
    'raids.tries',
    content.raids.triesPerDay,
    collectModifiers(state, content),
  ).toNumber();
  return Math.max(0, Math.floor(perDay) - used);
}

// ---- what the team answers the tricks with -------------------------------------------------------

/** Share of the time an effect lasting `seconds` of every `period` is on (0 = always). */
function uptime(seconds: number | undefined, period: number): number {
  if (seconds === undefined) return 0;
  if (seconds === 0) return 1;
  return Math.min(1, seconds / period);
}

/** Seconds between a card's ultimates. */
const ultPeriod = (c: TeamCard): number => (c.fill > 0 ? (c.interval * c.size) / c.fill : Infinity);

/**
 * How much of an effect the team puts on the boss, as a share of the time (the same averages the
 * moveset deals): Expose and Rally keep the strongest (the same effect does not stack), Wounds
 * add up.
 */
export function teamEffectShare(
  team: readonly TeamCard[],
  kind: 'expose' | 'wound' | 'rally',
): number {
  let best = 0;
  let sum = 0;
  for (const c of team) {
    const m = c.moves;
    if (!m) continue;
    const events: { effects: typeof m.ult.effects; period: number }[] = [
      { effects: m.ult.effects, period: ultPeriod(c) },
    ];
    if (m.skill?.open && c.skillEvery > 0)
      events.push({ effects: m.skill.effects, period: c.skillEvery });
    for (const ev of events) {
      if (!Number.isFinite(ev.period) || ev.period <= 0) continue;
      for (const e of ev.effects) {
        if (e.kind !== kind || (kind !== 'rally' && e.on !== 'enemy')) continue;
        if (kind === 'wound') {
          const lasts = e.seconds === undefined || e.seconds === 0 ? ev.period : e.seconds;
          sum += (e.value * Math.min(lasts, ev.period)) / ev.period;
        } else best = Math.max(best, e.value * uptime(e.seconds, ev.period));
      }
    }
  }
  return kind === 'wound' ? sum : best;
}

/** How much of a trick is left after the team's answer to it (0..1). */
function unanswered(boss: RaidBoss, answer: number): number {
  const at = boss.trick.answerAt;
  if (at <= 0) return 1;
  return 1 - Math.min(1, Math.max(0, answer) / at);
}

/** What a boss's trick does to this team, for the screen and the fight. */
export interface TrickEffect {
  kind: RaidBoss['trick']['kind'];
  /** The share of the trick still working after the team's answer (1 = all of it). */
  left: number;
}

/** The boss's trick against the team (what the team's own effects leave of it). */
export function bossTrick(boss: RaidBoss, team: readonly TeamCard[]): TrickEffect {
  switch (boss.trick.kind) {
    case 'shield':
      return { kind: 'shield', left: unanswered(boss, teamEffectShare(team, 'expose')) };
    case 'mend':
      return { kind: 'mend', left: unanswered(boss, teamEffectShare(team, 'wound')) };
    case 'curse':
      return { kind: 'curse', left: unanswered(boss, teamEffectShare(team, 'rally')) };
    default:
      return { kind: boss.trick.kind, left: 1 };
  }
}

// ---- the fight -----------------------------------------------------------------------------------

/** One second of a fight, for the stage to play back. */
export interface RaidSample {
  t: number;
  /** HP taken off the boss so far, as a share of its HP. */
  dealt: number;
  /** Cards knocked out so far. */
  down: number;
}

export interface RaidFight {
  bossId: string;
  /** Boss HP after modifiers. */
  hp: Decimal;
  /** HP taken off the boss (a kill is all of it). */
  dealt: Decimal;
  killed: boolean;
  /** Seconds the fight lasted. */
  seconds: number;
  /** The score as a share of the boss's HP: the damage dealt, or on a kill 1 plus the time bonus. */
  share: number;
  score: Decimal;
  /** The ids of the cards that were knocked out. */
  out: string[];
  samples: RaidSample[];
  trick: TrickEffect;
  /** The boss's level in this fight (kills so far). */
  level: number;
}

/** A boss's level: one for each kill so far (0 = never killed). */
export function raidLevel(state: GameState, bossId: string): number {
  return state.raids.level[bossId] ?? 0;
}

/** The boss's HP at a level, after the `combat.bossHp` modifiers (scope: the boss id). */
export function raidBossHp(
  content: Content,
  boss: RaidBoss,
  modifiers: readonly Modifier[],
  level = 0,
): Decimal {
  const base = boss.hp.mul(Decimal.pow(content.raids.levelGrowth.hp, level));
  return Decimal.max(
    computeStat('combat.bossHp', base, modifiers, { job: 'fighting', dungeon: boss.id }).value,
    1,
  );
}

/**
 * Fights one raid with the player's fighting team (`modifiers`: collectModifiers) and returns the
 * result; the state is not changed. The fight ends at a kill, when the whole team is knocked out,
 * or at the timer.
 */
export function fightRaid(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
  bossId: string,
): RaidFight | null {
  const boss = content.raidById.get(bossId);
  if (!boss) return null;
  const cfg = content.raids;
  const team = buildTeam(state, content, modifiers, boss.id);
  const trick = bossTrick(boss, team);
  const level = raidLevel(state, boss.id);
  const hp = raidBossHp(content, boss, modifiers, level);
  const attack = boss.attack.damage
    .mul(Decimal.pow(cfg.levelGrowth.attack, level))
    .mul(1 - defencePercent(modifiers, boss.id) / 100);
  const scratch = cloneState(state);
  reviveTeam(scratch);
  const every = boss.attack.intervalSeconds;
  const judgement = boss.trick.kind === 'judgement' && boss.trick.every > 0;
  let left = hp;
  let t = 0;
  const samples: RaidSample[] = [{ t: 0, dealt: 0, down: 0 }];
  let killed = false;
  let nextSample = 1;
  while (t < cfg.durationSeconds - EPSILON) {
    const t1 = Math.min(t + STEP, cfg.durationSeconds);
    // The team's hits and ultimates in (t, t1].
    let dealt = new Decimal(0);
    for (const card of team) {
      if (!isStanding(scratch, card)) continue;
      const run = cardRun(card, t, t1);
      if (run.hits <= 0) continue;
      dealt = dealt.add(card.hit.mul(run.hits));
      if (run.bursts > 0) {
        dealt = dealt.add(card.signature.mul(run.bursts));
        if (card.heals.length > 0) healFromMoves(scratch, team, card, run.bursts);
      }
    }
    // The trick on our damage: a shield soaks it, a curse weakens it.
    if (boss.trick.kind === 'shield' || boss.trick.kind === 'curse')
      dealt = dealt.mul(1 - boss.trick.size * trick.left);
    left = left.sub(dealt);
    // A mend: the boss takes back a share of its HP every `every` seconds.
    if (boss.trick.kind === 'mend' && boss.trick.every > 0) {
      const mends =
        Math.floor(t1 / boss.trick.every + EPSILON) - Math.floor(t / boss.trick.every + EPSILON);
      if (mends > 0) left = Decimal.min(hp, left.add(hp.mul(boss.trick.size * trick.left * mends)));
    }
    if (left.lte(0)) {
      killed = true;
      t = t1;
      break;
    }
    // The boss's attacks in (t, t1]: one card at a time; a judgement hits every card.
    const before = Math.floor(t / every + EPSILON);
    const after = Math.floor(t1 / every + EPSILON);
    for (let k = before + 1; k <= after; k++) {
      const rage = boss.trick.kind === 'rage' ? 1 + (boss.trick.size * (k * every)) / 60 : 1;
      const base = attack.mul(rage).mul(weakenFactor(scratch, team));
      const isJudgement = judgement && k % boss.trick.every === 0;
      const targets = isJudgement
        ? team.filter((c) => c.maxHealth.gt(0) && isStanding(scratch, c))
        : [enemyTarget(scratch, team)].filter((c): c is TeamCard => c !== null);
      const hit = isJudgement ? base.mul(boss.trick.size) : base;
      for (const c of targets) {
        const taken = damageTaken(scratch, c.id).add(hit);
        if (taken.gte(c.maxHealth)) knockOut(scratch, c);
        else scratch.combat.cardDamage[c.id] = taken;
      }
    }
    t = t1;
    if (t + EPSILON >= nextSample) {
      samples.push({
        t: nextSample,
        dealt: hp.sub(Decimal.max(left, 0)).div(hp).toNumber(),
        down: scratch.combat.cardsOut.length,
      });
      nextSample++;
    }
    const hittable = team.filter((c) => c.maxHealth.gt(0));
    if (hittable.length > 0 && hittable.every((c) => !isStanding(scratch, c))) break;
  }
  const dealtTotal = killed ? hp : hp.sub(Decimal.max(left, 0));
  const share = killed
    ? 1 + cfg.killBonus * Math.max(0, (cfg.durationSeconds - t) / cfg.durationSeconds)
    : dealtTotal.div(hp).toNumber();
  samples.push({ t, dealt: killed ? 1 : share, down: scratch.combat.cardsOut.length });
  return {
    bossId,
    hp,
    dealt: dealtTotal,
    killed,
    seconds: t,
    share,
    score: hp.mul(share),
    out: [...scratch.combat.cardsOut],
    samples,
    trick,
    level,
  };
}

// ---- the ladder ----------------------------------------------------------------------------------

export interface LadderRow {
  /** Rank, 1 = best. */
  rank: number;
  name: string;
  /** Four card ids, or null for the player's own row. */
  cards: string[] | null;
  share: number;
  you: boolean;
}

/** The ladder of one boss: the AI teams and, with a score, the player, best first (a tie goes to
 *  the AI team). */
export function raidLadder(
  content: Content,
  bossId: string,
  playerShare: number | null,
): LadderRow[] {
  const rows: LadderRow[] = content.raids.ladder.teams.map((t) => ({
    rank: 0,
    name: t.name,
    cards: t.cards,
    share: t.scores[bossId] ?? 0,
    you: false,
  }));
  if (playerShare !== null && playerShare > 0)
    rows.push({ rank: 0, name: 'You', cards: null, share: playerShare, you: true });
  rows.sort((a, b) => b.share - a.share || Number(a.you) - Number(b.you));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** The player's rank on a boss with a best score, or null with none. */
export function raidRank(
  content: Content,
  bossId: string,
  playerShare: number | null,
): number | null {
  if (playerShare === null || playerShare <= 0) return null;
  return raidLadder(content, bossId, playerShare).find((r) => r.you)!.rank;
}

// ---- trying a raid -------------------------------------------------------------------------------

export type RaidFailure = 'locked' | 'unknown' | 'no-team' | 'no-tries';

export interface RaidTry {
  fight: RaidFight;
  /** The player's best rank on this boss after the try. */
  rank: number | null;
  newBest: boolean;
  /** The boss's new level when this try killed it, else null: its HP and attack grow and the
   *  best score starts again (the rank rewards already paid stay paid). */
  levelUp: number | null;
  /** Rewards this try paid (rank rewards, each paid once per boss). */
  rewards: { resource: string; amount: Decimal }[];
  /** Raid coins of this boss the try paid (the boss's shop, DESIGN.md Arena and raids). */
  coins: number;
}

export type RaidTryResult =
  { ok: true; state: GameState; result: RaidTry } | { ok: false; reason: RaidFailure };

/**
 * Spends one of today's tries on a boss and fights it. The best score is kept, and the rank
 * rewards it reaches for the first time are paid (`ladder.rewards`, once per boss).
 */
export function tryRaid(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
  bossId: string,
  today: string,
): RaidTryResult {
  if (!content.raidById.has(bossId)) return { ok: false, reason: 'unknown' };
  if (!raidsOpen(state, content)) return { ok: false, reason: 'locked' };
  if (!buildTeam(state, content, modifiers, bossId).some((c) => c.maxHealth.gt(0)))
    return { ok: false, reason: 'no-team' };
  if (raidTriesLeft(state, content, bossId, today) <= 0) return { ok: false, reason: 'no-tries' };
  const fight = fightRaid(state, content, modifiers, bossId)!;
  const next = cloneState(state);
  if (next.raids.day !== today) {
    next.raids.day = today;
    next.raids.used = {};
  }
  next.raids.used[bossId] = (next.raids.used[bossId] ?? 0) + 1;
  const coins = raidCoinsFor(content, fight.share, fight.killed);
  next.arena.raidCoins[bossId] = (next.arena.raidCoins[bossId] ?? 0) + coins;
  if (next.arena.season > 0 && fight.share > (next.arena.raidBest[bossId] ?? 0))
    next.arena.raidBest[bossId] = fight.share;
  const newBest = fight.share > (next.raids.best[bossId] ?? 0);
  if (newBest) next.raids.best[bossId] = fight.share;
  const rank = raidRank(content, bossId, next.raids.best[bossId] ?? null);
  const rewards: RaidTry['rewards'] = [];
  if (rank !== null) {
    const paid = next.raids.paid[bossId] ?? Infinity;
    for (const entry of content.raids.ladder.rewards) {
      if (rank > entry.rank || entry.rank >= paid) continue;
      for (const r of entry.rewards) {
        next.resources[r.resource] = (next.resources[r.resource] ?? new Decimal(0)).add(r.amount);
        rewards.push({ resource: r.resource, amount: r.amount });
      }
    }
    next.raids.paid[bossId] = Math.min(paid, rank);
  }
  let levelUp: number | null = null;
  if (fight.killed) {
    levelUp = raidLevel(next, bossId) + 1;
    next.raids.level[bossId] = levelUp;
    delete next.raids.best[bossId];
  }
  return { ok: true, state: next, result: { fight, rank, newBest, levelUp, rewards, coins } };
}
