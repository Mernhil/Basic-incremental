/**
 * Every recipe and effect id the beta-batch cosmetic art implements (DESIGN.md §8, "Every option is
 * kept"), derived from the generated art meta so data, CSS and sprites cannot drift apart. The
 * full list with slots and level counts is in docs/COSMETIC_ART_IDS.md.
 *
 * - `bd-<style>-<level>` border layer, `fn-<style>-<level>` finish layer (card slots)
 * - `tb-<style>-<level>` table, `cur-<style>-<level>` cursor, `tk-<style>-<level>` tick style,
 *   `num-<style>-<level>` number style (global slots)
 * - `ui-<skin>-<style>` UI-skin slots (Starlight coin, sticker style, skill nodes, Wardrobe style)
 * - `ambient-<motion>` / `ambient-<motion>-f` max-level particle motion for border / finish
 * - `corner-<shape>` max-level pixel corner flourishes
 * - effects: `px-slash-<style>-<level>` attack slashes
 */
import { COSMETIC_META } from './pixel/cosmetics.gen';

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
const each = (prefix: string, table: Record<string, { levels: number }>): string[] =>
  Object.entries(table).flatMap(([id, v]) => range(v.levels).map((lv) => `${prefix}-${id}-${lv}`));

/** B8 particle motions (registered for border particles and, with `-f`, finish particles). */
export const AMBIENT_MOTIONS = ['rail', 'pop', 'orbit', 'pair', 'fountain'] as const;
/** B9 pixel corner flourish shapes. */
export const CORNER_SHAPES = ['acanthus', 'pauldron', 'wings', 'shards', 'knot'] as const;

const meta = COSMETIC_META as unknown as {
  borders: Record<string, { levels: number }>;
  finishes: Record<string, { levels: number }>;
  tables: Record<string, { levels: number }>;
  cursors: Record<string, { levels: number }>;
  ticks: Record<string, { levels: number }>;
  numbers: Record<string, { levels: number }>;
  attacks: Record<string, { levels: number }>;
  skins: Record<string, readonly string[]>;
  corners?: readonly string[];
};

export const PIXEL_RECIPES: readonly string[] = [
  ...each('bd', meta.borders),
  ...each('fn', meta.finishes),
  ...each('tb', meta.tables),
  ...each('cur', meta.cursors),
  ...each('tk', meta.ticks),
  ...each('num', meta.numbers),
  ...Object.entries(meta.skins).flatMap(([slot, styles]) => styles.map((s) => `ui-${slot}-${s}`)),
  ...(meta.corners ? CORNER_SHAPES.map((s) => `corner-${s}`) : []),
  ...(meta.corners ? AMBIENT_MOTIONS.flatMap((m) => [`ambient-${m}`, `ambient-${m}-f`]) : []),
];

export const PIXEL_EFFECTS: readonly string[] = each('px-slash', meta.attacks);
