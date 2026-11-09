import type { Resource } from '../../../data';
import { spriteImage } from '../art/pixel/sprites';

/**
 * Resource icons, in ONE place (DESIGN.md §11). Every resource has a swappable icon id; the
 * markup behind an id is a placeholder the graphics pass replaces (pixel-art agent): change
 * `ICON_MARKUP` or point `ICON_BY_RESOURCE` at another id, nothing else needs to move.
 *
 * Colours are CSS variables with fallbacks (`--res-*`), so a restyle can also be done in CSS.
 */

export type ResourceIconId =
  'coin' | 'crystal-summon' | 'crystal-glamour' | 'starlight' | 'gem' | 'material';

/** Resources whose icon is not decided by their kind. */
export const ICON_BY_RESOURCE: Readonly<Record<string, ResourceIconId>> = {
  money: 'coin',
  summon_crystal: 'crystal-summon',
  glamour_crystal: 'crystal-glamour',
};

const ICON_BY_KIND: Readonly<Record<Resource['kind'], ResourceIconId>> = {
  tree_gem: 'gem',
  mine_gem: 'gem',
  material: 'material',
  currency: 'coin',
  crystal: 'crystal-summon',
  prestige: 'starlight',
};

export const resourceIconId = (r: Pick<Resource, 'id' | 'kind'>): ResourceIconId =>
  ICON_BY_RESOURCE[r.id] ?? ICON_BY_KIND[r.kind];

/** True for the three resources the header shows: Money and the two crystals. */
export const isHeaderResource = (r: Pick<Resource, 'kind'>): boolean =>
  r.kind === 'currency' || r.kind === 'crystal';

/** True for the crystals (a bigger moment on pickup, a glow in the header). */
export const isCrystal = (r: Pick<Resource, 'kind'> | undefined): boolean => r?.kind === 'crystal';

const px = (name: string): string =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${spriteImage(name, 0, 0, 32, 32, 'bi-res')}</svg>`;

const V = (name: string, fallback: string): string => `var(--res-${name},${fallback})`;

/**
 * Pixel icons (32 x 32, `hand/res-*.png`, user-approved 2026-11-09): Money is a coin stack, the Summon
 * Crystal a clean blue shard cluster, the Glamour Crystal a pink gem cluster. Starlight stays a
 * placeholder until its set is drawn.
 */
const ICON_MARKUP: Partial<Record<ResourceIconId, string>> = {
  coin: px('res-money'),
  'crystal-summon': px('res-summon'),
  'crystal-glamour': px('res-glamour'),
  starlight:
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3L2.5 12l7.3-2.2z" fill="${V('starlight', '#f3dc9a')}"/>` +
    `</svg>`,
};

/** The placeholder drawing for an icon id, or null when the id is drawn elsewhere (gems). */
export const iconMarkup = (id: ResourceIconId): string | null => ICON_MARKUP[id] ?? null;
