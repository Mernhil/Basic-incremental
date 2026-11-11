import type { AscensionChallenge, ChallengeRestriction, Content } from '../data';
import { ascend, type AscendResult } from './prestige';
import { isDungeonUnlocked } from './combat';
import { cardHealth } from './cards';
import { Decimal } from './num';
import { MAX_CHALLENGE_COMPLETIONS, cloneState, type Difficulty, type GameState } from './state';
import type { Modifier } from './modifiers';

/**
 * Ascension challenges (DESIGN.md §15). Not the floor "Challenge" fights of §6: those are timed
 * fights for the next floor; an Ascension challenge is an Ascension run under a rule.
 *
 * After the first Ascension a player can start a challenge, which is an Ascension (it needs the
 * same Starlight and grants it) whose run follows the challenge's rule until its target is
 * reached or the run is left. The rule is applied through the modifier pipeline
 * (`restrictedView`, `challengeModifiers`, `restrictModifiers`, read by `collectModifiers`), so
 * combat is not touched. A target is reached when the run stands on its floor (`floor` of the
 * dungeon tier), which only a push can raise, so nothing depends on how time is split. Each
 * completion (up to three, with harder targets) gives a permanent reward modifier, source
 * `challenge`. Every challenge done once opens Auto-Ascend.
 */

/** The challenges are open after this many Ascensions. */
export const CHALLENGES_OPEN_AT_ASCENSION = 1;

/** Whether challenges can be started yet (after the first Ascension). */
export function challengesOpen(state: GameState): boolean {
  return state.prestigeCount >= CHALLENGES_OPEN_AT_ASCENSION;
}

export function challengeById(content: Content, id: string): AscensionChallenge | undefined {
  return content.challenges.find((c) => c.id === id);
}

/** The challenge the run is under, or null for a normal run. */
export function activeChallenge(state: GameState, content: Content): AscensionChallenge | null {
  const id = state.ascensionChallenges.active;
  return id === null ? null : (challengeById(content, id) ?? null);
}

/** Completions of a challenge, 0..3. */
export function challengeCompletions(state: GameState, id: string): number {
  return Math.min(
    MAX_CHALLENGE_COMPLETIONS,
    Math.max(0, Math.floor(state.ascensionChallenges.completions[id] ?? 0)),
  );
}

export interface ChallengeTarget {
  dungeon: string;
  difficulty: Difficulty;
  floor: number;
}

/** The target of the next completion, or null once all three are done. */
export function challengeTarget(
  state: GameState,
  challenge: AscensionChallenge,
): ChallengeTarget | null {
  const done = challengeCompletions(state, challenge.id);
  return done >= MAX_CHALLENGE_COMPLETIONS ? null : (challenge.targets[done] ?? null);
}

/** The floor the run stands on in a dungeon tier (1 when the state has none). */
function runFloor(state: GameState, dungeon: string, difficulty: Difficulty): number {
  return state.combat.floors[dungeon]?.tiers[difficulty]?.floor ?? 1;
}

/** The active run's floor and target, for the progress line; null in a normal run. */
export function challengeProgress(
  state: GameState,
  content: Content,
): { challenge: AscensionChallenge; target: ChallengeTarget; floor: number } | null {
  const challenge = activeChallenge(state, content);
  if (!challenge) return null;
  const target = challengeTarget(state, challenge);
  if (!target) return null;
  return { challenge, target, floor: runFloor(state, target.dungeon, target.difficulty) };
}

// ---- the rule, through modifiers ---------------------------------------------------------------

const NONE: ReadonlySet<ChallengeRestriction> = new Set();

/** The restrictions the run is under now. */
export function activeRestrictions(
  state: GameState,
  content: Content,
): ReadonlySet<ChallengeRestriction> {
  const challenge = activeChallenge(state, content);
  return challenge && challenge.restrictions.length > 0 ? new Set(challenge.restrictions) : NONE;
}

/** Whether the run is under this restriction. */
export function isRestricted(
  state: GameState,
  content: Content,
  restriction: ChallengeRestriction,
): boolean {
  return activeRestrictions(state, content).has(restriction);
}

/**
 * Fighting loadout cards that count for nothing in the run: the supports under Lone Wolf, every
 * card but Commons under Common Folk. Their effect, health and (for the main) damage are gone.
 */
export function challengeExcludedCards(state: GameState, content: Content): string[] {
  const restrictions = activeRestrictions(state, content);
  if (restrictions.size === 0) return [];
  const l = state.cards.loadouts.fighting;
  const out: string[] = [];
  const common = (id: string): boolean => content.cardById.get(id)?.rarity === 'common';
  if (l.main !== null && restrictions.has('commons_only') && !common(l.main)) out.push(l.main);
  for (const id of l.supports) {
    if (id === null) continue;
    if (restrictions.has('no_supports') || (restrictions.has('commons_only') && !common(id))) {
      out.push(id);
    }
  }
  return out;
}

/**
 * The state as the modifier collectors should see it: the fighting loadout without the excluded
 * cards (a shallow copy; the same object when nothing is excluded).
 */
export function restrictedView(state: GameState, content: Content): GameState {
  const excluded = challengeExcludedCards(state, content);
  if (excluded.length === 0) return state;
  const l = state.cards.loadouts.fighting;
  const drop = new Set(excluded);
  return {
    ...state,
    cards: {
      ...state.cards,
      loadouts: {
        ...state.cards.loadouts,
        fighting: {
          ...l,
          main: l.main !== null && drop.has(l.main) ? null : l.main,
          supports: l.supports.map((id) => (id !== null && drop.has(id) ? null : id)),
        },
      },
    },
  };
}

/** The permanent rewards of every completion so far, source `challenge`. */
export function challengeRewardModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const challenge of content.challenges) {
    const done = challengeCompletions(state, challenge.id);
    for (let i = 0; i < done; i++) {
      for (const m of challenge.rewards[i] ?? []) {
        out.push({ ...m, source: { kind: 'challenge', id: challenge.id } });
      }
    }
  }
  return out;
}

/**
 * Modifiers of the challenge: the rewards earned (always) and, in a challenge run, its penalties
 * plus what the excluded cards take with them (their health, and the main's damage).
 */
export function challengeModifiers(state: GameState, content: Content): Modifier[] {
  const out = challengeRewardModifiers(state, content);
  const challenge = activeChallenge(state, content);
  if (!challenge) return out;
  const source = { kind: 'challenge' as const, id: challenge.id };
  for (const m of challenge.penalties) out.push({ ...m, source });
  const excluded = challengeExcludedCards(state, content);
  if (excluded.length > 0) {
    let health = new Decimal(0);
    for (const id of excluded) {
      const owned = state.cards.owned[id];
      if (owned) health = health.add(cardHealth(content, id, owned));
    }
    if (health.gt(0))
      out.push({ stat: 'combat.health', kind: 'flat', value: health.neg(), source });
    // The main's own damage is the base of all fighting damage: without it there is none.
    if (excluded.includes(state.cards.loadouts.fighting.main ?? '')) {
      out.push({ stat: 'combat.damage', kind: 'mult', value: new Decimal(0), source });
    }
  }
  return out;
}

/** Takes away what the rule removes from a finished modifier list (Training under Untrained). */
export function restrictModifiers(
  state: GameState,
  content: Content,
  list: Modifier[],
): Modifier[] {
  if (!isRestricted(state, content, 'no_training')) return list;
  return list.filter((m) => !(m.source.kind === 'upgrade' && m.source.id.startsWith('training:')));
}

/** The most workers that work under the rule, or null for no limit (Single Post: one). */
export function challengeWorkerLimit(state: GameState, content: Content): number | null {
  return isRestricted(state, content, 'one_worker') ? 1 : null;
}

// ---- starting, leaving, completing -------------------------------------------------------------

export type StartChallengeFailure =
  | 'unknown'
  /** No Ascension yet. */
  | 'locked'
  /** All three completions are done. */
  | 'maxed'
  /** The target dungeon is not open. */
  | 'dungeon-locked'
  /** Not enough Starlight to ascend. */
  | 'too-early';

export type StartChallengeResult =
  Extract<AscendResult, { ok: true }> | { ok: false; reason: StartChallengeFailure };

/** Why a challenge cannot be started now, or null when it can. */
export function startChallengeProblem(
  state: GameState,
  content: Content,
  id: string,
): StartChallengeFailure | null {
  const challenge = challengeById(content, id);
  if (!challenge) return 'unknown';
  if (!challengesOpen(state)) return 'locked';
  const target = challengeTarget(state, challenge);
  if (!target) return 'maxed';
  if (!isDungeonUnlocked(state, content, target.dungeon)) return 'dungeon-locked';
  return null;
}

/**
 * Starts a challenge run: an Ascension (its Starlight and rewards come as usual) whose run is
 * under the challenge's rule, standing on floor 1 of the target's dungeon tier so the half-start
 * cannot finish it.
 */
export function startChallenge(
  state: GameState,
  content: Content,
  id: string,
  modifiers?: readonly Modifier[],
): StartChallengeResult {
  const problem = startChallengeProblem(state, content, id);
  if (problem) return { ok: false, reason: problem };
  const result = ascend(state, content, modifiers);
  if (!result.ok) return { ok: false, reason: 'too-early' };
  const next = result.state;
  const target = challengeTarget(state, challengeById(content, id)!)!;
  next.ascensionChallenges.active = id;
  const tier = next.combat.floors[target.dungeon]?.tiers[target.difficulty];
  if (tier) tier.floor = 1;
  return { ...result, state: next };
}

/** Leaves the challenge: the rule ends at once, the run goes on as a normal one, nothing is earned. */
export function leaveChallenge(state: GameState): GameState {
  if (state.ascensionChallenges.active === null) return state;
  const next = cloneState(state);
  next.ascensionChallenges.active = null;
  return next;
}

/**
 * Completes the active challenge when the run has reached its target (mutates the state): the
 * completion is counted, the rule ends and the run goes on as a normal one. Returns the id of the
 * challenge completed, or null. The check reads the state only, so it gives the same answer
 * however time was split.
 */
export function settleChallenges(state: GameState, content: Content): string | null {
  const progress = challengeProgress(state, content);
  if (!progress || progress.floor < progress.target.floor) return null;
  const id = progress.challenge.id;
  state.ascensionChallenges.completions[id] = challengeCompletions(state, id) + 1;
  state.ascensionChallenges.active = null;
  return id;
}

/** Total completions over all challenges (the Challenger achievement reads it). */
export function totalChallengeCompletions(state: GameState, content: Content): number {
  return content.challenges.reduce((sum, c) => sum + challengeCompletions(state, c.id), 0);
}

/** Auto-Ascend opens once every challenge has been completed at least once (DESIGN.md §15). */
export function autoAscendUnlocked(state: GameState, content: Content): boolean {
  return (
    content.challenges.length > 0 &&
    content.challenges.every((c) => challengeCompletions(state, c.id) >= 1)
  );
}

// ---- what the Ascension screen shows -----------------------------------------------------------

export type ChallengeStatus = 'locked' | 'available' | 'active' | 'done';

export interface ChallengeView {
  id: string;
  name: string;
  rule: string;
  status: ChallengeStatus;
  completions: number;
  max: number;
  /** The next target, or null when done. */
  target: (ChallengeTarget & { dungeonName: string }) | null;
  /** The floor of the run on the target tier (the active challenge only). */
  floor: number | null;
  /** The reward of the next completion. */
  nextReward: Modifier[];
  /** Rewards earned so far. */
  earned: Modifier[];
  /** Why it cannot be started now (null when it can, or when it is active or done). */
  problem: StartChallengeFailure | null;
}

export function challengeViews(state: GameState, content: Content): ChallengeView[] {
  const active = state.ascensionChallenges.active;
  return content.challenges.map((challenge) => {
    const completions = challengeCompletions(state, challenge.id);
    const target = challengeTarget(state, challenge);
    const problem = startChallengeProblem(state, content, challenge.id);
    const status: ChallengeStatus =
      challenge.id === active
        ? 'active'
        : target === null
          ? 'done'
          : problem === null
            ? 'available'
            : 'locked';
    const source = { kind: 'challenge' as const, id: challenge.id };
    const asModifiers = (list: AscensionChallenge['rewards'][number]): Modifier[] =>
      list.map((m) => ({ ...m, source }));
    return {
      id: challenge.id,
      name: challenge.name,
      rule: challenge.rule,
      status,
      completions,
      max: MAX_CHALLENGE_COMPLETIONS,
      target: target
        ? {
            ...target,
            dungeonName: content.dungeonById.get(target.dungeon)?.name ?? target.dungeon,
          }
        : null,
      floor:
        status === 'active' && target ? runFloor(state, target.dungeon, target.difficulty) : null,
      nextReward: target ? asModifiers(challenge.rewards[completions] ?? []) : [],
      earned: challenge.rewards.slice(0, completions).flatMap(asModifiers),
      problem: status === 'available' || status === 'locked' ? problem : null,
    };
  });
}
