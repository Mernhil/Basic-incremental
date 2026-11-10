/**
 * Arena backgrounds (DESIGN.md §6, "Arena backgrounds"): each dungeon names a background id in
 * `dungeons.json`; this table says how the arena draws it. Until a dungeon has its own art every
 * id draws the default: the dark brick room with two torches and a plank floor, made in CSS
 * (`stage/arena.css`, `.ar-bg--brick`).
 *
 * New art drops in as data plus one entry here: name the id in the dungeon's `background`, then add
 * `my_id: { cls: 'ar-bg--my-id' }` below and the CSS class that draws it. The arena layout never
 * changes.
 */

export interface ArenaBackground {
  /** The class the arena scene wears. */
  cls: string;
}

/** The default room, used for every id that has no entry below. */
export const DEFAULT_BACKGROUND: ArenaBackground = { cls: 'ar-bg--brick' };

/** Background id (the dungeon's `background`) -> how it is drawn. Empty until art exists. */
export const ARENA_BACKGROUNDS: Readonly<Record<string, ArenaBackground>> = {};

/** The background to draw for a dungeon's `background` id (undefined, unknown or empty: the default). */
export function backgroundFor(
  id: string | null | undefined,
  table: Readonly<Record<string, ArenaBackground>> = ARENA_BACKGROUNDS,
): ArenaBackground {
  if (!id) return DEFAULT_BACKGROUND;
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id]! : DEFAULT_BACKGROUND;
}
