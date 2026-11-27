// Types only (no DOM), so view models and their tests can use them without the card widget.

/** What a full-art card shows besides its name (DESIGN.md §5): the level chip and the progress bar. */
export interface CardFace {
  /** Level and cap; null on a card the player does not own. */
  level: { value: number; cap: number } | null;
  /** Progress to the next level, 0..1. */
  progress: number;
}
