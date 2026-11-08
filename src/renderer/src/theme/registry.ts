/**
 * Names of the visual building blocks the renderer implements. Cosmetic data may only refer to
 * these; `missingVisuals` checks it at startup and in tests.
 *
 * Recipes are CSS classes (`.r-<id>`) in recipes.css. Effects are animations spawned by
 * effects.ts. The beta-batch pixel cosmetics add their generated ids (art/cosmeticIds.ts).
 */
import { PIXEL_EFFECTS, PIXEL_RECIPES } from '../art/cosmeticIds';

export const BASE_RECIPES = [
  // border
  'knight-plate',
  'filigree-1',
  'filigree-2',
  'filigree-3',
  'inner-gilt',
  'frame-tradition',
  'crown',
  // finish (full-card holo)
  'holo-hex',
  'holo-diamond',
  'holo-waves',
  'holo-aurora',
  'holo-aurora-flow',
  'holo-sparkle',
  // max level (DESIGN.md §8): edge-breaking corner flourishes and ambient animations. Cards at
  // their max level also get these themed by their own recipe (data-max-* in recipes.css).
  'flourish-corners',
  'ambient-motes',
  'ambient-embers',
  'ambient-glints',
  'ambient-stars',
  'ambient-bubbles',
  // rarity
  'neon',
  'chrome',
  // cursor
  'cursor-gilded',
  'cursor-crimson',
  'cursor-prism',
] as const;

export const BASE_EFFECTS = ['slash-sparks', 'slash-chips', 'heavy-hit', 'rise'] as const;

export const RECIPES: readonly string[] = [...BASE_RECIPES, ...PIXEL_RECIPES];
export const EFFECTS: readonly string[] = [...BASE_EFFECTS, ...PIXEL_EFFECTS];

export const KNOWN_VISUALS = {
  recipes: new Set<string>(RECIPES),
  effects: new Set<string>(EFFECTS),
};
