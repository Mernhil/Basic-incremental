import type { Content } from '../../../data';
import type { GameState, TierUp } from '../../../game';
import type { NavGlyph } from '../art/gems';
import type { CardsModel } from '../pages/cardsModel';
import type { CoinTarget } from '../stage/arena';
import type { Director } from '../stage/director';

/**
 * The table's contract (UI_RULES.md §2 "The table";
 * "Table shell"). The shell (package 8) owns `src/renderer/src/table/` and `shell/`; each view
 * package owns one folder under `src/renderer/src/views/` and talks to the shell only through the
 * types below. A view package never edits a file outside its folder to add a view.
 */

export { VIEW_IDS, type ViewId } from './viewIds';
import type { ViewId } from './viewIds';

/** Everything the app hands the views and the table pieces. Built once by `app.ts`. */
export interface TableContext {
  content: Content;
  state: () => GameState;
  /** Applies a new state from a pure game function (achievements, level-ups, save). */
  apply: (state: GameState) => void;
  director: Director;
  /** Where flying coins land (the header chips and the Details button). */
  coins: CoinTarget;
  sound: (id: string) => void;
  /** Plays tier-up moments (milestones, star-ups, evolutions). */
  onTierUps: (list: TierUp[]) => void;
  /** The one card view model shared by Cards and the dungeon's weapon panel. */
  cards: CardsModel;
  /** Re-applies the equipped cosmetics' theme (after a Wardrobe change or an import). */
  applyTheme: () => void;
  version: string;
  /** What Settings needs from the app: the save text, an import, the last save time. */
  save: {
    exportText(): string;
    replace(state: GameState): void;
    lastSavedAt(): number | null;
  };
  /** Opens a full view (replaces the open one). */
  open(id: ViewId): void;
  /** Closes the open view, back to the table. */
  close(): void;
  /** The open view, or null while the table shows. */
  current(): ViewId | null;
}

/** What the view host gives one view when it is mounted. */
export interface ViewApi {
  /**
   * Puts `el` at the right end of the view's title bar while the view is open (for example the
   * ×1 / ×10 / ×100 / Max toggle); null empties it. Call it any time.
   */
  setTools(el: HTMLElement | null): void;
  /** True while this view is open and the window is visible. */
  visible(): boolean;
}

/** A mounted view. */
export interface ViewHandle {
  /** Called on every app tick (100 ms) while the view is open, and once right after it opens. */
  render(): void;
  /**
   * Called when the view opens, before it is dealt in: move shared elements into the host here.
   * `from` is the opener (pile, wing, window, goal) or null.
   */
  opened?(from: HTMLElement | null): void;
  /** Called after the view has closed and its exit animation ended. */
  closed?(): void;
}

/** A dock pile's hint line ("1 point to spend"); `ready` lights it green. */
export interface PileHint {
  text: string;
  ready?: boolean;
}

/** One full view, exported by a view package's `index.ts`. */
export interface ViewDef {
  id: ViewId;
  /** The name in the title bar and on the pile. */
  title: string;
  /** Present when the view is a dock pile: its plaque and its hint (read about once a second). */
  pile?: { glyph: NavGlyph; hint?: (ctx: TableContext) => PileHint | null };
  /**
   * Builds the view into `host` (a `.shell-page` element with a screen-reader `h1`, inside the
   * view's scrolling body). Called once at start; the view stays mounted while closed.
   */
  mount(host: HTMLElement, ctx: TableContext, api: ViewApi): ViewHandle;
}

/** A live piece of the table: the dungeon window in the centre or a wing. */
export interface TablePieceDef {
  slot: 'centre' | 'left' | 'right';
  /** The view a click on the piece (or its corner open button) opens. */
  view: ViewId;
  /** Accessible name of the piece's open button ("Open Logging"). */
  label: string;
  /** Builds the piece into `host`. `render` runs on every tick while no view covers the table. */
  mount(host: HTMLElement, ctx: TableContext): { render(): void };
}

/** What each view package exports from `views/<package>/index.ts`. */
export interface ViewPackage {
  views: ViewDef[];
  pieces?: TablePieceDef[];
}
