import type { Content } from '../../../data';
import { cardInfo, type CardInfo, type GameState } from '../../../game';
import type { CardFace } from '../ui/cardFace';

/**
 * What the full-art card face shows (DESIGN.md §5 "Full-art layout"): the level and the progress to the next one. Pure view-model code; the numbers come from
 * the game's own exports.
 */

/** The face of one card. */
export function cardFaceOf(info: CardInfo): CardFace {
  const { owned } = info;
  const cap = info.levelCap;
  let progress = 0;
  if (owned && cap !== null) {
    if (info.xpToNext && info.xpToNext.gt(0))
      progress = Math.min(1, Math.max(0, owned.xp.div(info.xpToNext).toNumber()));
    else progress = 1; // at the level cap
  }
  return {
    level: owned && cap !== null ? { value: owned.level, cap } : null,
    progress,
  };
}

/** The face of a card by id, or null when the id is unknown. */
export function cardFaceFor(content: Content, state: GameState, cardId: string): CardFace | null {
  const info = cardInfo(state, content, cardId);
  return info ? cardFaceOf(info) : null;
}
