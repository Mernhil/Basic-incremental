import { ELEMENTS, type CardElement, type Content } from '../data';
import { Decimal } from './num';
import type { Modifier } from './modifiers';
import type { GameState } from './state';

/**
 * Elements in combat (DESIGN.md §2 Fights): water, fire, earth, light and dark. Each T6 or Heirloom
 * fighting card's element against a boss gives that card's own damage a bonus or a malus, and a worker on a tree
 * or mine of its own element a lighter one. A Wood to Prismatic card has no element: plain base damage,
 * never strong or weak. Nothing resists light or dark. Elements are a bonus, never a wall; every number is
 * in `combat.json` `elements`.
 */

export type ElementRelation = 'weak' | 'resist' | 'neutral';

/** The element each of water, fire and earth beats: water beats fire beats earth beats water. */
const BEATS: Partial<Record<CardElement, CardElement>> = {
  water: 'fire',
  fire: 'earth',
  earth: 'water',
};

/**
 * How an attacking element meets a defending one (the circle, DESIGN.md §2 "What beats what"):
 * 'weak' when the attacker beats the defender (light and dark beat each other), 'resist' when the
 * defender beats the attacker (water, fire and earth only: nothing ever resists light or dark),
 * otherwise 'neutral'. No element on either side is neutral.
 */
export function elementMatchup(
  attacker: CardElement | undefined,
  defender: CardElement | undefined,
): ElementRelation {
  if (!attacker || !defender) return 'neutral';
  if (attacker === 'light') return defender === 'dark' ? 'weak' : 'neutral';
  if (attacker === 'dark') return defender === 'light' ? 'weak' : 'neutral';
  if (BEATS[attacker] === defender) return 'weak';
  if (BEATS[defender] === attacker) return 'resist';
  return 'neutral';
}

/** The element that hits this one harder (the one that beats it). */
export function weakToElement(element: CardElement): CardElement {
  if (element === 'light') return 'dark';
  if (element === 'dark') return 'light';
  return ELEMENTS.find((e) => BEATS[e] === element) as CardElement;
}

/** The element that hits this one softer (the one it beats); none for light and dark. */
export function resistsElement(element: CardElement): CardElement | undefined {
  return BEATS[element];
}

/** How a card's element meets a dungeon's boss. No element, or anything that is not one of the six bosses, is neutral. */
export function elementRelation(
  content: Content,
  dungeonId: string,
  element: CardElement | undefined,
): ElementRelation {
  return elementMatchup(element, content.dungeonById.get(dungeonId)?.boss.element);
}

/** The percent a card's element adds to its own damage against a dungeon (can be negative). */
export function elementDamagePercent(
  content: Content,
  dungeonId: string,
  element: CardElement | undefined,
): Decimal {
  const { weakness, resistance } = content.combat.elements;
  const relation = elementRelation(content, dungeonId, element);
  if (relation === 'weak') return new Decimal(weakness);
  if (relation === 'resist') return new Decimal(resistance);
  return new Decimal(0);
}

/**
 * One `combat.damage` modifier (source `element`, id `<dungeon>:<card>`) for each loadout card
 * and dungeon its element changes. It is the card's own: the duel gives each card only its own
 * (duel.ts), so the cards are equal and no element counts for the team.
 */
export function elementModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const id of state.cards.loadouts.fighting.slots) {
    if (id === null || !state.cards.owned[id]) continue;
    const card = content.cardById.get(id);
    if (card?.job !== 'fighting') continue;
    for (const dungeon of content.dungeons) {
      const value = elementDamagePercent(content, dungeon.id, card.element);
      if (value.eq(0)) continue;
      out.push({
        stat: 'combat.damage',
        kind: 'percent',
        value,
        scope: { dungeon: dungeon.id },
        source: { kind: 'element', id: `${dungeon.id}:${id}` },
      });
    }
  }
  return out;
}

/**
 * The element bonus of a worker on its place (DESIGN.md §6): +15% output when the worker's element
 * is the tree's or mine's. Scoped like the worker's own ability (`scope`), source `element`.
 */
export function workerElementModifier(
  content: Content,
  cardId: string,
  placeId: string,
  scope: NonNullable<Modifier['scope']>,
): Modifier[] {
  const place = content.treeById.get(placeId) ?? content.mineById.get(placeId);
  const element = content.cardById.get(cardId)?.element;
  if (!place || !element || element !== place.element) return [];
  return [
    {
      stat: 'production.rate',
      kind: 'percent',
      value: content.combat.elements.production,
      scope,
      source: { kind: 'element', id: cardId },
    },
  ];
}
