import type { Content } from '../data';
import type { Dungeon, TutorialRole } from '../data/schemas';
import { floorPosition } from './floors';
import { isStarterCard } from './cards';
import { cloneState, newOwnedCard, type GameState } from './state';

/**
 * The tutorial area (DESIGN.md section 2, A tutorial area before Mossy Cellar): a short first area
 * that hands out one Wood card at each milestone floor, each teaching a role the starter does not
 * cover, so the player leaves with a team of four. Pure rules; the screen shows the reveal.
 */

/** True for the tutorial area (it has no Hard, Nightmare, endless depths or farming post). */
export function isTutorialArea(dungeon: Dungeon): boolean {
  return dungeon.tutorial !== undefined;
}

/** The weapon type of the starter the player took, or null before the pick (or for a save with none). */
function starterKind(state: GameState, content: Content): string | null {
  for (const id of Object.keys(state.cards.owned)) {
    if (isStarterCard(content, id)) return content.cardById.get(id)?.item.kind ?? null;
  }
  return null;
}

/** The roles handed out, in order, for a starter of weapon type `kind` (null: none taken). */
export function tutorialPlan(content: Content, kind: string | null): TutorialRole[] {
  const t = content.tutorialArea?.tutorial;
  if (!t) return [];
  const covered = kind === null ? undefined : t.starterRoles[kind];
  return t.roleOrder.filter((r) => r !== covered).slice(0, t.milestones.length);
}

export interface TutorialHandout {
  /** 0-based milestone number. */
  index: number;
  floor: number;
  role: TutorialRole;
  /** The new Wood card, or null when every candidate of the role is already owned. */
  card: string | null;
}

/** The handout due now (the best floor has reached the next milestone), or null. */
export function pendingTutorialHandout(state: GameState, content: Content): TutorialHandout | null {
  const area = content.tutorialArea;
  const t = area?.tutorial;
  if (!area || !t) return null;
  const index = state.tutorial.given;
  const floor = t.milestones[index];
  if (floor === undefined) return null;
  if (floorPosition(state, area, 'normal').best < floor) return null;
  const kind = starterKind(state, content);
  // The plan depends on the starter, so the handouts wait for the pick.
  if (kind === null && !state.starter.done) return null;
  const role = tutorialPlan(content, kind)[index];
  if (!role) return null;
  const card = (t.roleCards[role] ?? []).find((id) => !state.cards.owned[id]) ?? null;
  return { index, floor, role, card };
}

export type TutorialResult =
  { ok: true; state: GameState; handout: TutorialHandout } | { ok: false; reason: 'not-due' };

/** Takes the due handout: the card is owned (Wood, star 1, level 1) and joins the first free slot. */
export function claimTutorialHandout(state: GameState, content: Content): TutorialResult {
  const handout = pendingTutorialHandout(state, content);
  if (!handout) return { ok: false, reason: 'not-due' };
  const next = cloneState(state);
  next.tutorial.given = handout.index + 1;
  if (handout.card) {
    next.cards.owned[handout.card] = newOwnedCard('wood');
    const slots = next.cards.loadouts.fighting.slots;
    const free = slots.indexOf(null);
    if (free >= 0) slots[free] = handout.card;
  }
  return { ok: true, state: next, handout };
}
