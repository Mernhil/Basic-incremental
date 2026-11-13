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
import './shellPictures.css';

const RECIPE_PREFIX = 'r-';

/** The table pictures (UI_RULES.md �2 Shell look): every file of art/shell/<dir>/, by path. */
const SHELL_URLS = import.meta.glob<string>('../art/shell/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const shellVarsOnRoot = new WeakMap<HTMLElement, string[]>();

/**
 * A table that wears a `shell-<id>` recipe and has pictures in the shell art data gets, per piece,
 * `--sh-<piece>-url` (the image), `--sh-<piece>-slice` (the 9-slice insets in art pixels, with
 * `fill` when the middle is drawn), `--sh-<piece>-t/-r/-b/-l` (the insets as numbers), `--sh-<piece>-bw` (the four border widths, whole
 * device pixels) and
 * `--sh-<piece>-w/-h` (the image size). shellPictures.css draws them at a whole number of device
 * pixels per art pixel. Other tables get none of it.
 */
function applyShellArt(content: Content, recipes: string[], root: HTMLElement): void {
  for (const name of shellVarsOnRoot.get(root) ?? []) root.style.removeProperty(name);
  const names: string[] = [];
  const recipe = recipes.find((r) => r.startsWith('shell-'));
  const table = recipe ? content.shellArt.find((t) => `shell-${t.id}` === recipe) : undefined;
  if (table) {
    root.style.setProperty('--shell-scale', String(table.scale));
    names.push('--shell-scale');
    for (const [piece, p] of Object.entries(table.pieces)) {
      const url = SHELL_URLS[`../art/shell/${table.dir}/${p.file}`];
      if (!url) continue;
      const vars: Record<string, string> = {
        [`--sh-${piece}-url`]: `url("${url}")`,
        [`--sh-${piece}-slice`]: `${p.slice.join(' ')}${p.fill ? ' fill' : ''}`,
        [`--sh-${piece}-t`]: String(p.slice[0]),
        [`--sh-${piece}-r`]: String(p.slice[1]),
        [`--sh-${piece}-b`]: String(p.slice[2]),
        [`--sh-${piece}-l`]: String(p.slice[3]),
        [`--sh-${piece}-bw`]: `calc(${p.slice[0]} * var(--as)) calc(${p.slice[1]} * var(--as)) calc(${p.slice[2]} * var(--as)) calc(${p.slice[3]} * var(--as))`,
        [`--sh-${piece}-w`]: String(p.width),
        [`--sh-${piece}-h`]: String(p.height),
      };
      for (const [k, v] of Object.entries(vars)) {
        root.style.setProperty(k, v);
        names.push(k);
      }
    }
  }
  shellVarsOnRoot.set(root, names);
}

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
  applyShellArt(content, recipes, root);
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
