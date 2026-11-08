// Types only (no DOM), so view models and their tests can use them without the card widget.

/** What the bottom plate of a full-art card shows (DESIGN.md §5); built by pages/cardFaceModel.ts. */
export interface CardFace {
  /** The ability line. */
  ability: string;
  /** Hit speed as text, e.g. "hits every 1s"; null shows nothing. */
  speed: string | null;
  /** Level and cap; null on a card the player does not own. */
  level: { value: number; cap: number } | null;
  /** Progress to the next level, 0..1. */
  progress: number;
}
