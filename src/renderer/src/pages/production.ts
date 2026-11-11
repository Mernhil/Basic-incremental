import type { Content } from '../../../data';
import type { GameState } from '../../../game';

/**
 * The context every page of the older page layout takes (the Cards, Dungeons, Summon, Wardrobe,
 * Skill Tree, Achievements, Shop and Settings pages import this type). The Production ledger that
 * used to live here is gone: the Logging, Mining and Forge views are in `views/gathering/`.
 */
export interface PageContext {
  content: Content;
  state: () => GameState;
  /** Applies a new state produced by a pure game function. */
  apply: (state: GameState) => void;
}
