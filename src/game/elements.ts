import type { CardElement, Content } from '../data';
import { Decimal } from './num';
import type { Modifier } from './modifiers';
import type { GameState } from './state';

/**
 * Elements in combat (DESIGN.md §6): the main card's element against a boss gives a bonus or a
 * malus, each matching support a smaller bonus, and a worker on a tree or mine of its own element
 * a lighter one. Elements are a bonus, never a wall; every number is in `combat.json` `elements`.
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

/** The percent the fighting loadout's elements add to damage against a dungeon (can be negative). */
export function elementDamagePercent(
  state: GameState,
  content: Content,
  dungeonId: string,
): Decimal {
  const { weakness, resistance, supportBonus } = content.combat.elements;
  const boss = content.dungeonById.get(dungeonId)?.boss;
  if (!boss) return new Decimal(0);
  const loadout = state.cards.loadouts.fighting;
  const elementOf = (id: string | null): CardElement | null => {
    if (id === null || !state.cards.owned[id]) return null;
    const card = content.cardById.get(id);
    return card?.job === 'fighting' ? card.element : null;
  };
  let percent = new Decimal(0);
  const main = elementOf(loadout.main);
  if (main !== null) {
    const relation = elementRelation(content, dungeonId, main);
    if (relation === 'weak') percent = percent.add(weakness);
    else if (relation === 'resist') percent = percent.add(resistance);
  }
  for (const id of loadout.supports) {
    if (elementOf(id) === boss.weakness) percent = percent.add(supportBonus);
  }
  return percent;
}

/** One `combat.damage` modifier (source `element`) for each dungeon the loadout's elements change. */
export function elementModifiers(state: GameState, content: Content): Modifier[] {
  const out: Modifier[] = [];
  for (const dungeon of content.dungeons) {
    const value = elementDamagePercent(state, content, dungeon.id);
    if (value.eq(0)) continue;
    out.push({
      stat: 'combat.damage',
      kind: 'percent',
      value,
      scope: { dungeon: dungeon.id },
      source: { kind: 'element', id: dungeon.id },
    });
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
