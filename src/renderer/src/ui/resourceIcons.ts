import type { Resource } from '../../../data';

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
  summon_scroll: 'crystal-summon',
  glamour_scroll: 'crystal-glamour',
};

const ICON_BY_KIND: Readonly<Record<Resource['kind'], ResourceIconId>> = {
  tree_gem: 'gem',
  mine_gem: 'gem',
  material: 'material',
  currency: 'coin',
  scroll: 'crystal-summon',
  prestige: 'starlight',
};

export const resourceIconId = (r: Pick<Resource, 'id' | 'kind'>): ResourceIconId =>
  ICON_BY_RESOURCE[r.id] ?? ICON_BY_KIND[r.kind];

/** True for the three resources the header shows: Money and the two scrolls. */
export const isHeaderResource = (r: Pick<Resource, 'kind'>): boolean =>
  r.kind === 'currency' || r.kind === 'scroll';

/** True for the crystals (a bigger moment on pickup, a glow in the header). */
export const isCrystal = (r: Pick<Resource, 'kind'> | undefined): boolean => r?.kind === 'scroll';

const V = (name: string, fallback: string): string => `var(--res-${name},${fallback})`;

/**
 * Placeholder drawings (24 x 24). Money is a plain flat coin. Summon crystals stand tall as a
 * loose faceted shard; Glamour crystals are a wide cut diamond, so the two read apart by shape
 * as well as colour.
 */
const ICON_MARKUP: Partial<Record<ResourceIconId, string>> = {
  coin:
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<circle cx="12" cy="12" r="10" fill="${V('coin-rim', '#a8741a')}"/>` +
    `<circle cx="12" cy="12" r="8" fill="${V('coin-face', '#f2c14e')}"/>` +
    `<circle cx="12" cy="12" r="5.2" fill="none" stroke="${V('coin-rim', '#a8741a')}" stroke-width="1.2"/>` +
    `</svg>`,
  'crystal-summon':
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<polygon points="12,0.5 18,7.5 15.5,23.5 8.5,23.5 6,7.5" fill="${V('summon-2', '#5b7fe0')}"/>` +
    `<polygon points="12,0.5 18,7.5 12,10 6,7.5" fill="${V('summon-1', '#a9c4ff')}"/>` +
    `<polygon points="12,10 18,7.5 15.5,23.5 12,23.5" fill="${V('summon-3', '#3a54b0')}"/>` +
    `</svg>`,
  'crystal-glamour':
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<polygon points="12,3 22,10 12,22 2,10" fill="${V('glamour-2', '#e0609e')}"/>` +
    `<polygon points="12,3 22,10 2,10" fill="${V('glamour-1', '#ffb3d6')}"/>` +
    `<polygon points="12,10 22,10 12,22" fill="${V('glamour-3', '#a63a74')}"/>` +
    `</svg>`,
  starlight:
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3L2.5 12l7.3-2.2z" fill="${V('starlight', '#f3dc9a')}"/>` +
    `</svg>`,
};

/** The placeholder drawing for an icon id, or null when the id is drawn elsewhere (gems). */
export const iconMarkup = (id: ResourceIconId): string | null => ICON_MARKUP[id] ?? null;
