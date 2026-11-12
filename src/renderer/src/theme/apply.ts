import type { Content } from '../../../data';
import {
  cosmeticMaxLevel,
  globalVars,
  missingVisuals,
  resolveGlobal,
  type CosmeticLoadout,
  type ResolvedCard,
} from '../../../game';
import { KNOWN_VISUALS } from './registry';
import './base.css';
import './rank.css';
import './recipes.css';
import './frames.css';

const RECIPE_PREFIX = 'r-';

/** Throws if cosmetic data names a recipe or effect the renderer does not implement. */
export function assertVisualsImplemented(content: Content): void {
  const problems = missingVisuals(content, KNOWN_VISUALS);
  if (problems.length > 0) {
    throw new Error(
      `Cosmetic data refers to visuals that do not exist:\n  - ${problems.join('\n  - ')}`,
    );
  }
}

/** Replaces the element's r-* classes and the given CSS variables. */
function setVisuals(
  el: HTMLElement,
  vars: Record<string, string>,
  recipes: string[],
  previousVars: string[],
): string[] {
  for (const name of previousVars) if (!(name in vars)) el.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  for (const cls of [...el.classList]) if (cls.startsWith(RECIPE_PREFIX)) el.classList.remove(cls);
  for (const recipe of recipes) el.classList.add(RECIPE_PREFIX + recipe);
  return Object.keys(vars);
}

const applied = new WeakMap<HTMLElement, string[]>();

/** Applies the global slots (table, numbers, ticks, attack, cursor) to <html>. Instant, no reload. */
export function applyGlobalTheme(
  content: Content,
  loadout: CosmeticLoadout,
  root = document.documentElement,
): void {
  const { vars, recipes } = globalVars(resolveGlobal(content, loadout));
  applied.set(root, setVisuals(root, vars, recipes, applied.get(root) ?? []));
}

let levelContent: Content | null = null;

/**
 * Lets card themes mark upgrade levels: with content known, a card wearing a border or finish
 * at its max level gets `data-max-<slot>` (DESIGN.md §8: the ambient animation and, for borders,
 * the edge-breaking corner flourishes in recipes.css) and `data-lv-<slot>` with its level.
 */
export function configureCardLevels(content: Content): void {
  levelContent = content;
}

function markLevels(el: HTMLElement, resolved: ResolvedCard): void {
  for (const slot of ['border', 'finish'] as const) {
    const r = resolved.slots[slot];
    if (!r) continue; // a slot with no items yet
    const max = levelContent ? cosmeticMaxLevel(levelContent, r.cosmetic) : Infinity;
    const top = r.worn && !r.cosmetic.starter && r.level >= max;
    el.toggleAttribute(`data-max-${slot}`, top);
    if (r.cosmetic.starter) delete el.dataset[`lv${slot === 'border' ? 'Border' : 'Finish'}`];
    else el.dataset[`lv${slot === 'border' ? 'Border' : 'Finish'}`] = String(r.level);
  }
  // a worn border replaces the base frame (DESIGN.md §5 The base frame, §8): the frame picture is
  // hidden by CSS while the card wears one it can show
  const border = resolved.slots.border;
  el.toggleAttribute('data-border-worn', border.worn && !border.cosmetic.starter);
  if (el.hasAttribute('data-max-border') || el.hasAttribute('data-max-finish')) watchAmbient(el);
}

// Ambient animations pause while their card is off screen (DESIGN.md §8).
let observer: IntersectionObserver | null = null;
function watchAmbient(el: HTMLElement): void {
  if (typeof IntersectionObserver === 'undefined') return;
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) e.target.toggleAttribute('data-offscreen', !e.isIntersecting);
  });
  observer.observe(el);
}

/** Applies one card's resolved cosmetics (card slots, exclusives, rarity) to its element. */
export function applyCardTheme(el: HTMLElement, resolved: ResolvedCard): void {
  applied.set(el, setVisuals(el, resolved.vars, resolved.recipes, applied.get(el) ?? []));
  markLevels(el, resolved);
}

/** Applies a loadout's global slots to one element only (the Wardrobe preview stage). */
export function applyScopedGlobalTheme(
  content: Content,
  loadout: CosmeticLoadout,
  el: HTMLElement,
): void {
  const { vars, recipes } = globalVars(resolveGlobal(content, loadout));
  applied.set(el, setVisuals(el, vars, recipes, applied.get(el) ?? []));
}
