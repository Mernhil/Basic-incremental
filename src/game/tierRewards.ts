import type { Content, Rarity } from '../data';
import { CARD_GRADES, MAX_STARS, gradeStyle, type CardGrade } from '../data/schemas';
import { Decimal } from './num';
import type { Modifier } from './modifiers';
import type { GameState } from './state';

/**
 * Tier completion (DESIGN.md §2 Summoning, Tier completion reward). A tier is complete once every
 * card of it that the Card Portal can pull is at six stars; at T6 the two sides are two tiers
 * (Mythic and Void), as in the wishlist and the odds. Completing a tier pays Summon Scrolls once
 * and gives a small permanent damage bonus for as long as the save lives. The portal's chances
 * read the same fact: a complete tier leaves the pool (`portals.ts`, Portal level).
 */

/** The portal whose pool defines which cards a tier holds. */
const CARD_PORTAL_ID = 'card_portal';

/** The cards of a tier (its colour step on the portal ladder) the Card Portal can pull. */
export function tierCardIds(content: Content, rarity: Rarity): string[] {
  const portal = content.portals.find((p) => p.id === CARD_PORTAL_ID);
  return portal ? portal.pool.filter((e) => e.rarity === rarity).map((e) => e.itemId) : [];
}

/** Every card of the tier is at six stars (false for a tier with no cards). */
export function tierComplete(state: GameState, content: Content, rarity: Rarity): boolean {
  const ids = tierCardIds(content, rarity);
  return ids.length > 0 && ids.every((id) => (state.cards.owned[id]?.stars ?? 0) >= MAX_STARS);
}

/** One tier of the collection: how far it is and what completing it pays. */
export interface TierCompletion {
  grade: CardGrade;
  /** The step of the portal ladder the tier colours with. */
  rarity: Rarity;
  /** Cards of the tier at six stars, and cards in the tier. */
  done: number;
  total: number;
  complete: boolean;
  /** The reward was paid (the check box is ticked). */
  claimed: boolean;
  scrolls: Decimal;
}

/** Every tier lowest first, for the collection's check boxes. */
export function tierProgress(state: GameState, content: Content): TierCompletion[] {
  return CARD_GRADES.map((grade) => {
    const rarity = gradeStyle(grade);
    const ids = tierCardIds(content, rarity);
    const done = ids.filter((id) => (state.cards.owned[id]?.stars ?? 0) >= MAX_STARS).length;
    const complete = ids.length > 0 && done === ids.length;
    return {
      grade,
      rarity,
      done,
      total: ids.length,
      complete,
      claimed: state.summon.tierRewardsClaimed.includes(grade),
      scrolls: content.cardRules.tierReward.scrolls[grade],
    };
  });
}

/**
 * Pays the reward of every tier that is complete and not yet paid (mutates `state`): the scrolls go
 * to the Summon Scroll stock and the tier is remembered. Returns the grades paid now. Called as
 * time passes, after a pull and when a save loads, so a save that had completed a tier is paid.
 */
export function settleTierRewards(state: GameState, content: Content): CardGrade[] {
  const paid: CardGrade[] = [];
  for (const grade of CARD_GRADES) {
    if (state.summon.tierRewardsClaimed.includes(grade)) continue;
    if (!tierComplete(state, content, gradeStyle(grade))) continue;
    state.summon.tierRewardsClaimed.push(grade);
    state.resources['summon_scroll'] = (state.resources['summon_scroll'] ?? new Decimal(0)).add(
      content.cardRules.tierReward.scrolls[grade],
    );
    paid.push(grade);
  }
  return paid;
}

/** The permanent bonus of the tiers paid: damage percent per tier, through the pipeline. */
export function tierRewardModifiers(state: GameState, content: Content): Modifier[] {
  return state.summon.tierRewardsClaimed
    .filter((g) => (CARD_GRADES as readonly string[]).includes(g))
    .map((grade) => ({
      stat: 'combat.damage' as const,
      kind: 'percent' as const,
      value: content.cardRules.tierReward.damagePercent,
      source: { kind: 'upgrade' as const, id: `tier:${grade}` },
    }));
}
