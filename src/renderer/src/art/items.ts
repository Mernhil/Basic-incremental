/**
 * The signature item inside a card (DESIGN.md §12), as approved pixel art: a 100 x 120 sprite with
 * the black one-pixel ink, light extra shading, plus sparkles and a light rim (treatment 'E+'),
 * baked from the approved vector drawings in `vector/items.ts`. Rarity sets how intricate it is.
 *
 * The markup keeps the 200 x 240 item box, so `ITEM_VIEWBOX` and every caller stay the same. A
 * hidden copy of the item's outline rides along so the element effects (`fx.ts`) can still trace
 * the real shape.
 */
import type { ItemKind, Rarity, RankTier } from '../../../data';
import { animatedSpriteImage, sprite } from './pixel/sprites';
import { ITEM_KINDS_DRAWN, ITEM_VIEWBOX, makeBlade, type ArtRarity } from './vector/items';

export { ITEM_KINDS_DRAWN, ITEM_VIEWBOX, makeBlade };

/** The item box every card item is drawn in (200 x 240 units; one pixel is 2 units). */
export const ITEM_BOX = { w: 200, h: 240 } as const;

/** The hidden outline the element effects trace (not drawn). */
export const outlinePath = (d: string | undefined): string =>
  d ? `<path class="bi-item__outline" d="${d}" fill="none" stroke="none"/>` : '';

/** Markup for a baked item-box sprite (card items and weapon skins), with its traced outline; a sprite with a palette-cycling strip plays it (art/pixel/animate.ts). */
export function itemBoxSprite(name: string, cls = ''): string {
  const s = sprite(name);
  if (!s) return '';
  return `<g class="bi-item${cls ? ` ${cls}` : ''}">${outlinePath(s.outline)}${animatedSpriteImage(name, 0, 0, ITEM_BOX.w, ITEM_BOX.h)}</g>`;
}

/**
 * Interim looks (DESIGN.md §5, "Weapon looks, for now"): until a type's new art is approved, it
 * shows the nearest old ladder; null = a plain labelled placeholder. Old art is deleted type by
 * type as the new art lands.
 */
const INTERIM_KIND: Record<ItemKind, string | null> = {
  sword: 'sword',
  greatsword: 'greatsword',
  staff: 'staff',
  hammer: 'maul',
  bow: 'bow',
  pickaxe: 'pickaxe',
  logging_axe: 'hatchet',
  dagger: 'twin_blades',
  spear: null,
  lance: null,
  scythe: null,
};
/** The old art ladder has no Uncommon: it shows the Common look. */
const INTERIM_RARITY: Record<Rarity, ArtRarity> = {
  common: 'common',
  uncommon: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legendary',
  mythic: 'mythic',
  void: 'void',
};

/** The tiers whose pictures are drawn for every item type (art suffix per tier). */
const TIER_ART: Partial<Record<RankTier, string>> = { wood: 't1', bronze: 't2' };

/** A plain labelled placeholder for a type with no pictures yet, in the 200 x 240 item box. */
function placeholder(kind: ItemKind): string {
  const label = kind.replace('_', ' ').toUpperCase();
  return `<g class="bi-item bi-item--placeholder"><rect x="40" y="70" width="120" height="100" fill="#2a303c" stroke="#0d0f14" stroke-width="4"/><text x="100" y="128" text-anchor="middle" font-family="monospace" font-size="16" font-weight="700" fill="#cfd5df">${label}</text></g>`;
}

/**
 * The item's pixel sprite for a card art window, in the 200 x 240 item box. At the tiers drawn so
 * far (Wood T1, Bronze T2) every type has its own approved picture (`item-<type>-t1`, `-t2`,
 * hand-made); higher tiers still show the interim look until their tier is drawn.
 */
export function itemArt(kind: ItemKind, rarity: Rarity, tier?: RankTier): string {
  const drawn = tier ? TIER_ART[tier] : undefined;
  if (drawn) return itemBoxSprite(`item-${kind}-${drawn}`);
  const art = INTERIM_KIND[kind];
  if (!art) return placeholder(kind);
  return itemBoxSprite(`item-${art}-${INTERIM_RARITY[rarity]}`);
}
