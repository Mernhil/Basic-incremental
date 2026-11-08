import type { Content } from '../../../data';
import { resolveGlobal, type GameState } from '../../../game';
import {
  STAR_CHART_VIEWBOX,
  skillNode,
  starChart,
  type ChartStar,
  type NodeState,
  type SkillBranch,
  type SkinStyle,
} from '../art/cosmetics';
import { spriteImage } from '../art/pixel/sprites';
import './skillArt.css';

/**
 * Art for the account tree and the enhancement star chart (DESIGN.md §8 "UI-skin slots", 17): the
 * pixel gems and chart of the equipped `nodes` item (recipe `ui-nodes-<a..e>`), drawn by
 * `art/cosmetics.ts`. This module resolves the style and wraps the sprites in SVG; only the
 * centre star is still vector (it has no pixel version).
 */

const INK = '#1a1020';

/** The style letter of the equipped nodes item (the starter, `a`, when nothing else is worn). */
export function nodeStyle(content: Content, state: GameState): SkinStyle {
  const recipe = resolveGlobal(content, state.cosmetics.loadout).nodes.visual.recipes.find((r) =>
    r.startsWith('ui-nodes-'),
  );
  return (recipe?.slice('ui-nodes-'.length) ?? 'a') as SkinStyle;
}

/** A pixel gem node (24 px native, keystones 32 px) as a ready-to-place SVG. */
export function skillGem(
  style: SkinStyle,
  branch: SkillBranch,
  state: NodeState,
  keystone = false,
): string {
  const n = keystone ? 32 : 24;
  return `<svg class="sg${keystone ? ' sg--key' : ''}" viewBox="0 0 ${n} ${n}" aria-hidden="true">${skillNode(style, branch, state, keystone)}</svg>`;
}

/** The enhancement chart (200 x 120 pixel grid): sky, dotted links and a pixel star per option. */
export function chartSky(
  style: SkinStyle,
  stars: readonly ChartStar[],
  links: readonly (readonly [number, number])[],
): string {
  return `<svg class="cst-sky" viewBox="${STAR_CHART_VIEWBOX}" aria-hidden="true">${starChart(style, stars, links)}</svg>`;
}

/** One chart star (18 px native) for the option key. */
export function chartStar(style: SkinStyle, state: NodeState): string {
  return `<svg class="cst" viewBox="0 0 18 18" aria-hidden="true">${spriteImage(`cos-chart-${style}-${state}`, 0, 0, 18, 18)}</svg>`;
}

/** The centre star of the constellation (eight points). */
export function centreStar(): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? (i % 4 === 0 ? 30 : 20) : 9;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  return `<svg class="sg-star" viewBox="-34 -34 68 68" aria-hidden="true">
  <polygon class="sg-star__body" points="${pts.join(' ')}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" />
</svg>`;
}
