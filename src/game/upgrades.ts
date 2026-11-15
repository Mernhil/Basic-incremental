import type { Content, PerkLine, PerkMilestone, PerkOption } from '../data';
import { statValue, type Modifier } from './modifiers';
import { Decimal } from './num';
import { mineLevel, treeLevel } from './production';
import { cloneState, type GameState } from './state';
import { toolLevel } from './toolLines';
import { trainingLevel } from './training';

/**
 * Milestone picks (DESIGN.md §4 Milestone picks): every repeatable line (a tree's or mine's level,
 * a tool line, a Training line) has milestone levels in `perks.json` where the player picks one of
 * two perks. A pick is stored for good (`upgrades.picks`, kept through an ascension); its perk's
 * effects are ordinary modifiers (source `upgrade`) and apply only while the line is at or above the
 * milestone's level, so after an ascension the perk comes back when the line reaches it again. A
 * milestone reached with no pick waits; it never blocks buying.
 *
 * This file also counts the lifetime Money earned (DESIGN.md §9, kept through an ascension).
 *
 * `upgrades.ts` is imported by `modifiers.ts`, so it reads modifiers only through arguments.
 */

/** Money earned from dungeons over every run. */
export function lifetimeMoney(state: GameState): Decimal {
  return state.upgrades.moneyEarned;
}

/** Adds the Money gained since `before` to the lifetime total (mutates `state`). */
export function countMoneyEarned(
  state: GameState,
  content: Content,
  before: Decimal | undefined,
): void {
  const now = state.resources[content.perks.currency];
  if (!now || !before) return;
  const gained = now.sub(before);
  if (gained.gt(0)) state.upgrades.moneyEarned = state.upgrades.moneyEarned.add(gained);
}

/** The level a line stands at this run. */
export function lineLevel(state: GameState, line: PerkLine): number {
  switch (line.kind) {
    case 'tree':
      return treeLevel(state, line.id);
    case 'mine':
      return mineLevel(state, line.id);
    case 'tool':
      return toolLevel(state, line.id);
    case 'training':
      return trainingLevel(state, line.id);
  }
}

const sameLine = (a: PerkLine, b: PerkLine): boolean => a.kind === b.kind && a.id === b.id;

/** The milestones of one line, lowest level first. */
export function lineMilestones(content: Content, line: PerkLine): PerkMilestone[] {
  return content.perks.milestones
    .filter((m) => sameLine(m.line, line))
    .sort((a, b) => a.level - b.level);
}

/** The option picked at a milestone, or null. */
export function pickedOption(state: GameState, milestone: PerkMilestone): PerkOption | null {
  const id = state.upgrades.picks[milestone.id];
  return milestone.options.find((o) => o.id === id) ?? null;
}

/** A perk's effects as modifiers (source `upgrade`, id `perk:<option>`). */
export function perkEffects(option: PerkOption): Modifier[] {
  return option.effects.map((m) => ({
    ...m,
    source: { kind: 'upgrade', id: `perk:${option.id}` },
  }));
}

/** The modifiers of every perk picked whose line stands at or above its level. Read by `collectModifiers`. */
export function perkModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const m of content.perks.milestones) {
    const option = pickedOption(state, m);
    if (option && lineLevel(state, m.line) >= m.level) out.push(...perkEffects(option));
  }
  return out;
}

/** How much stronger a job's worker abilities are (1 = normal), from `card.supportPower`. */
export function supportPower(
  state: GameState,
  content: Content,
  job: 'mining' | 'logging' | 'fighting',
): Decimal {
  const perks = perkModifiers(state, content);
  return perks.length === 0 ? new Decimal(1) : statValue('card.supportPower', 1, perks, { job });
}

/**
 * Where a milestone stands: `waiting` (reached, nothing picked), `active` (picked and reached),
 * `kept` (picked in an earlier run, the line not back at the level yet) or `ahead` (never picked,
 * not reached).
 */
export type MilestoneStatus = 'waiting' | 'active' | 'kept' | 'ahead';

export function milestoneStatus(state: GameState, milestone: PerkMilestone): MilestoneStatus {
  const reached = lineLevel(state, milestone.line) >= milestone.level;
  const picked = pickedOption(state, milestone) !== null;
  if (picked) return reached ? 'active' : 'kept';
  return reached ? 'waiting' : 'ahead';
}

/** Milestones reached with no pick yet, in content order. */
export function waitingPicks(state: GameState, content: Content): PerkMilestone[] {
  return content.perks.milestones.filter((m) => milestoneStatus(state, m) === 'waiting');
}

export type PickResult =
  { ok: true; state: GameState } | { ok: false; reason: 'unknown' | 'not-reached' | 'picked' };

/** Picks one perk of a waiting milestone. A pick is final. */
export function pickPerk(
  state: GameState,
  content: Content,
  milestoneId: string,
  optionId: string,
): PickResult {
  const milestone = content.perkMilestoneById.get(milestoneId);
  if (!milestone || !milestone.options.some((o) => o.id === optionId)) {
    return { ok: false, reason: 'unknown' };
  }
  if (state.upgrades.picks[milestoneId]) return { ok: false, reason: 'picked' };
  if (lineLevel(state, milestone.line) < milestone.level) {
    return { ok: false, reason: 'not-reached' };
  }
  const next = cloneState(state);
  next.upgrades.picks = { ...next.upgrades.picks, [milestoneId]: optionId };
  return { ok: true, state: next };
}

/** What an ascension keeps: every pick and the lifetime Money (DESIGN.md §9). */
export function keepUpgrades(state: GameState): GameState['upgrades'] {
  return { picks: { ...state.upgrades.picks }, moneyEarned: state.upgrades.moneyEarned };
}
