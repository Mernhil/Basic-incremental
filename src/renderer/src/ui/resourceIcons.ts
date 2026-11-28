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

const px = (name: string): string =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${spriteImage(name, 0, 0, 32, 32, 'bi-res')}</svg>`;

/**
 * Pixel icons (32 x 32, `hand/res-<resource id>.png`, kept by the user 2026-11-22): every resource
 * but Money has its own, the six gems, ten materials, three scrolls and Starlight. Adding one is
 * dropping `res-<id>.png` in `hand/`, baking, and listing the id in `KEPT_ICONS`. Money keeps its
 * coin ladder (`moneyCoinArt`). The ICON_MARKUP below is only the fallback for an id with no sprite.
 */
export const KEPT_ICONS: readonly string[] = [
  'oak_gem',
  'ironbark_gem',
  'moonwillow_gem',
  'copper_gem',
  'iron_gem',
  'grotto_gem',
  'summon_scroll',
  'glamour_scroll',
  'heirloom_scroll',
  'moss_core',
  'cinder_core',
  'frost_core',
  'frost_sigil',
  'storm_core',
  'sanctum_core',
  'void_core',
  'glimmer_dust',
  'facet_shard',
  'star_dust',
  'starlight',
  // Farming posts' own drops (user, 2026-11-27, approved): Heirloom shards are not a stored resource.
  'scroll_fragment',
  'herb_bundle',
  'heirloom_shard',
];

/** The sprite name of a resource's kept icon, or null when it has none (Money). */
export const keptIconSprite = (resourceId: string): string | null =>
  KEPT_ICONS.includes(resourceId) ? `res-${resourceId}` : null;

/** The kept icon as markup (an SVG holding the 32 x 32 sprite), or null. */
export const keptIconMarkup = (resourceId: string): string | null => {
  const name = keptIconSprite(resourceId);
  return name ? px(name) : null;
};

const ICON_MARKUP: Partial<Record<ResourceIconId, string>> = {
  coin: px('res-money'),
};

/**
 * A resource's icon markup: its kept icon, else the coin for Money, else null (the cost then shows
 * the name in words). Every place that draws a resource goes through here.
 */
export const resourceIconMarkup = (r: Pick<Resource, 'id' | 'kind'>): string | null =>
  keptIconMarkup(r.id) ?? iconMarkup(resourceIconId(r));

/** A coin of the ladder (`money-<id>`, 16 x 16 at 2x in the 32 box): its still, for the header. */
export const moneyCoinArt = (coinId: string): string =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${spriteImage(`money-${coinId}`, 0, 0, 32, 32, 'bi-res')}</svg>`;

/** The placeholder drawing for an icon id, or null when the id is drawn elsewhere (gems). */
export const iconMarkup = (id: ResourceIconId): string | null => ICON_MARKUP[id] ?? null;
