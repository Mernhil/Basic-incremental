import type { CardElement, Content } from '../data';
import { Decimal } from './num';
import type { Modifier } from './modifiers';
import type { GameState } from './state';

/**
 * Elements in combat (DESIGN.md §6): each fighting card's element against a boss gives that card's
 * own damage a bonus or a malus, and a worker on a tree or mine of its own element a lighter one. Elements are a bonus, never a wall; every number is in `combat.json` `elements`.
 */

export type ElementRelation = 'weak' | 'resist' | 'neutral';

/** How an element meets a dungeon's boss. Anything that is not one of the six bosses is neutral. */
export function elementRelation(
  content: Content,
  dungeonId: string,
  element: CardElement,
): ElementRelation {
  const boss = content.dungeonById.get(dungeonId)?.boss;
  if (!boss) return 'neutral';
  if (boss.weakness === element) return 'weak';
  if (boss.resistance === element) return 'resist';
  return 'neutral';
}

/** The percent a card's element adds to its own damage against a dungeon (can be negative). */
export function elementDamagePercent(
  content: Content,
  dungeonId: string,
  element: CardElement,
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
  if (!place || content.cardById.get(cardId)?.element !== place.element) return [];
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
