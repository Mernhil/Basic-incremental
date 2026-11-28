import type { Content, Quest, QuestCondition, QuestGroup } from '../data';
import { cardGrade } from '../data';
import { measure } from './achievements';
import { floorPosition, stageKey } from './floors';
import { Decimal } from './num';
import { cloneState, type GameState } from './state';

/**
 * Quests (DESIGN.md §10 Quests): the Goals button's list. Each quest in quests.json has a
 * condition read from the state, a progress bar and a reward. A quest is done once (the play time
 * is kept, and it stays done after an Ascension resets what it read) and its reward is paid by a
 * click, once. The game tick settles what became done on the whole-second grid (tick.ts), offline
 * progress and reading a save settle it too; nothing is ever claimed on its own.
 */

/** Where a condition stands: the value read from the state and the target to reach. */
export function measureQuest(
  state: GameState,
  content: Content,
  condition: QuestCondition,
): { value: number; target: number } {
  switch (condition.kind) {
    case 'stage_kills': {
      const dungeon = content.dungeonById.get(condition.dungeon);
      if (!dungeon) return { value: 0, target: condition.count };
      const floor = condition.floor === 'last' ? dungeon.floors : condition.floor;
      const key = stageKey(dungeon.id, condition.difficulty, floor);
      return { value: state.combat.stageKills[key] ?? 0, target: condition.count };
    }
    case 'floor_reached': {
      const dungeon = content.dungeonById.get(condition.dungeon);
      const best = dungeon ? floorPosition(state, dungeon, condition.difficulty).record : 0;
      return { value: best, target: condition.floor };
    }
    case 'cards_owned':
      return { value: Object.keys(state.cards.owned).length, target: condition.amount };
    case 'grade_owned': {
      const has = Object.keys(state.cards.owned).some((id) => {
        const card = content.cardById.get(id);
        return card !== undefined && cardGrade(card) === condition.grade;
      });
      return { value: has ? 1 : 0, target: 1 };
    }
    case 'card_level':
      return {
        value: Math.max(0, ...Object.values(state.cards.owned).map((c) => c.level)),
        target: condition.level,
      };
    case 'account_level':
      return { value: state.account.level, target: condition.level };
    case 'training_levels':
      return {
        value: Object.values(state.combat.training).reduce((n, level) => n + level, 0),
        target: condition.amount,
      };
    default:
      return measure(state, content, condition);
  }
}

const isDone = (state: GameState, quest: Quest): boolean => quest.id in state.quests;

/** Whether a quest's condition holds now (done or not). */
function met(state: GameState, content: Content, quest: Quest): boolean {
  const { value, target } = measureQuest(state, content, quest.condition);
  return value >= target;
}

/** Whether any quest not yet done meets its condition (a settle would mark it done). */
export function questsDue(state: GameState, content: Content): boolean {
  return content.quests.some((q) => !isDone(state, q) && met(state, content, q));
}

/**
 * Marks every quest whose condition holds as done (mutates `state`; call it on a copy). It pays
 * nothing: the reward waits for `claimQuest`. Returns the ids that became done.
 */
export function settleQuests(state: GameState, content: Content): string[] {
  const fresh: string[] = [];
  for (const q of content.quests) {
    if (isDone(state, q) || !met(state, content, q)) continue;
    state.quests[q.id] = { doneAt: state.stats.playTimeMs, claimed: false };
    fresh.push(q.id);
  }
  return fresh;
}

export interface QuestEntry {
  quest: Quest;
  /** The condition was met once. */
  done: boolean;
  /** The reward was paid. */
  claimed: boolean;
  /** The value read from the state and the target (3 / 10 kills). Both are the target once done. */
  value: number;
  target: number;
  /** 0..1 (1 once done). */
  progress: number;
}

function entryOf(state: GameState, content: Content, quest: Quest): QuestEntry {
  const saved = state.quests[quest.id];
  const { value, target } = measureQuest(state, content, quest.condition);
  const done = saved !== undefined;
  const shown = done ? target : Math.min(value, target);
  const progress = done ? 1 : target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  return { quest, done, claimed: saved?.claimed ?? false, value: shown, target, progress };
}

/** Every quest in data order with its progress. */
export function questList(state: GameState, content: Content): QuestEntry[] {
  return content.quests.map((q) => entryOf(state, content, q));
}

/** How many quests wait to be claimed (the number on the Goals button). */
export function claimableQuests(state: GameState): number {
  let n = 0;
  for (const q of Object.values(state.quests)) if (!q.claimed) n++;
  return n;
}

export interface QuestPopup {
  /** Done and not claimed, in data order (the first `maxRows` of them). */
  claimable: QuestEntry[];
  /** The nearest unfinished quests (highest progress first, data order on a tie). */
  next: QuestEntry[];
}

/** The popup's rows: the claimable quests first, then the unfinished ones nearest to done. */
export function questPopup(state: GameState, content: Content, maxRows = 6): QuestPopup {
  const entries = questList(state, content);
  const waiting = entries.filter((e) => e.done && !e.claimed);
  // more than the popup holds wait behind "Claim all"; the count is `claimableQuests`
  const claimable = waiting.slice(0, maxRows);
  const room = Math.max(0, maxRows - claimable.length);
  const next = entries
    .filter((e) => !e.done)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.progress - a.e.progress || a.i - b.i)
    .slice(0, room)
    .map((x) => x.e);
  return { claimable, next };
}

/** The quests of one group in data order, for the full list. */
export function questsByGroup(state: GameState, content: Content): Map<QuestGroup, QuestEntry[]> {
  const groups = new Map<QuestGroup, QuestEntry[]>();
  for (const e of questList(state, content)) {
    const list = groups.get(e.quest.group) ?? [];
    list.push(e);
    groups.set(e.quest.group, list);
  }
  return groups;
}

export type QuestClaimResult =
  | { ok: true; state: GameState; quests: Quest[] }
  | { ok: false; reason: 'unknown' | 'not-done' | 'claimed' };

function pay(state: GameState, quest: Quest): void {
  for (const r of quest.reward) {
    state.resources[r.resource] = (state.resources[r.resource] ?? new Decimal(0)).add(r.amount);
  }
  const saved = state.quests[quest.id];
  if (saved) saved.claimed = true;
}

/** Pays one done quest once. */
export function claimQuest(state: GameState, content: Content, id: string): QuestClaimResult {
  const quest = content.questById.get(id);
  if (!quest) return { ok: false, reason: 'unknown' };
  const saved = state.quests[id];
  if (!saved) return { ok: false, reason: 'not-done' };
  if (saved.claimed) return { ok: false, reason: 'claimed' };
  const next = cloneState(state);
  pay(next, quest);
  // The reward can meet more quests (scrolls and materials count towards some conditions).
  settleQuests(next, content);
  return { ok: true, state: next, quests: [quest] };
}

/** Pays every quest waiting to be claimed. */
export function claimAllQuests(state: GameState, content: Content): QuestClaimResult {
  const waiting = content.quests.filter((q) => state.quests[q.id]?.claimed === false);
  if (waiting.length === 0) return { ok: false, reason: 'not-done' };
  const next = cloneState(state);
  for (const q of waiting) pay(next, q);
  settleQuests(next, content);
  return { ok: true, state: next, quests: waiting };
}

/** The reward of a quest as an amount of each scroll, for the sim and the tests. */
export function questScrolls(quest: Quest): { summon: number; glamour: number } {
  let summon = 0;
  let glamour = 0;
  for (const r of quest.reward) {
    if (r.resource === 'summon_scroll') summon += new Decimal(r.amount).toNumber();
    if (r.resource === 'glamour_scroll') glamour += new Decimal(r.amount).toNumber();
  }
  return { summon, glamour };
}
