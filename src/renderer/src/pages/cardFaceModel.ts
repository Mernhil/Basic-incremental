import type { Content } from '../../../data';
import {
  burstStats,
  cardInfo,
  itemName,
  lookTier,
  type CardInfo,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import type { CardFace } from '../ui/cardFace';

/**
 * What the full-art card face shows (DESIGN.md §5 "Full-art layout"): the ability line, the hit
 * speed, the level and the progress to the next one. Pure view-model code; the numbers come from
 * the game's own exports.
 */

/** Seconds as short text: 1 -> "1s", 0.5 -> "0.5s", 1.333 -> "1.33s". */
export const secondsText = (s: number): string => `${Number(s.toFixed(2))}s`;

/**
 * Seconds between one hit of the card's main ability: the fight tick for a fighting card, the
 * gap between two strikes of a worker's (logging or mining card's) harvest pattern.
 */
export function hitSeconds(content: Content, info: CardInfo, mods?: readonly Modifier[]): number {
  const { card } = info;
  if (card.job === 'fighting') {
    // the live modifiers only describe the card that leads; any other card shows its own speed
    const live = mods?.length && info.slot?.slot === 'main' ? mods : info.mainModifiers;
    return burstStats(content, 'fighting', live).interval;
  }
  return card.worker.harvest.intervalSeconds / card.worker.harvest.strikes;
}

/** The face of one card. `mods` lets a loadout card use the live modifiers for its speed. */
export function cardFaceOf(content: Content, info: CardInfo, mods?: readonly Modifier[]): CardFace {
  const { card, owned } = info;
  const cap = info.levelCap;
  let progress = 0;
  if (owned && cap !== null) {
    if (info.xpToNext && info.xpToNext.gt(0))
      progress = Math.min(1, Math.max(0, owned.xp.div(info.xpToNext).toNumber()));
    else progress = 1; // at the level cap
  }
  return {
    // The weapon's name stands in for the ability name until the card data has one.
    ability: itemName(
      content,
      card.item.kind,
      lookTier(card.rarity, info.rank?.tier ?? 'wood'),
      card.rarity,
    ),
    speed: COPY.card.hitsEvery(secondsText(hitSeconds(content, info, mods))),
    level: owned && cap !== null ? { value: owned.level, cap } : null,
    progress,
  };
}

/** The face of a card by id, or null when the id is unknown. */
export function cardFaceFor(
  content: Content,
  state: GameState,
  cardId: string,
  mods?: readonly Modifier[],
): CardFace | null {
  const info = cardInfo(state, content, cardId, mods);
  return info ? cardFaceOf(content, info, mods) : null;
}
