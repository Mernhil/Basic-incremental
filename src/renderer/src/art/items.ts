/**
 * The signature item inside a card (DESIGN.md §12), as approved pixel art: a 100 x 120 sprite with
 * the black one-pixel ink, light extra shading, plus sparkles and a light rim (treatment 'E+'),
 * baked from the approved vector drawings in `vector/items.ts`. Rarity sets how intricate it is.
 *
 * The markup keeps the 200 x 240 item box, so `ITEM_VIEWBOX` and every caller stay the same. A
 * hidden copy of the item's outline rides along so the element effects (`fx.ts`) can still trace
 * the real shape.
 */
import type { Card, ItemKind, Rarity, RankTier } from '../../../data';
import { animatedSpriteImage, sprite } from './pixel/sprites';
import { ITEM_KINDS_DRAWN, ITEM_VIEWBOX, makeBlade } from './vector/items';

export { ITEM_KINDS_DRAWN, ITEM_VIEWBOX, makeBlade };

/** The item box every card item is drawn in (200 x 240 units; one pixel is 2 units). */
export const ITEM_BOX = { w: 200, h: 240 } as const;

/** The hidden outline the element effects trace (not drawn). */
export const outlinePath = (d: string | undefined): string =>
  d ? `<path class="bi-item__outline" d="${d}" fill="none" stroke="none"/>` : '';

/**
 * The user's straight pictures (ASSET_RULES §5) are canvases of the card's own proportion (132 : 186),
 * far bigger than the 100 x 120 sprites, with the weapon centred on a transparent background. In
 * item-box units the canvas is drawn 177.4 x 250 around the box, which fits the art window of the
 * small views (shop, summon, skins); a card draws it over the whole card (full art) by taking
 * `FULL_ART_VIEWBOX`, the same rectangle, as its item view box.
 */
export const FULL_ART_BOX = { x: 11.29, y: -7, w: 177.42, h: 250 } as const;
export const FULL_ART_VIEWBOX = `${FULL_ART_BOX.x} ${FULL_ART_BOX.y} ${FULL_ART_BOX.w} ${FULL_ART_BOX.h}`;
/** A sprite this wide is a straight picture (the pixel sprites are 100 px wide). */
const STRAIGHT_MIN_W = 300;

/** Markup for a baked item-box sprite (card items and weapon skins), with its traced outline; a sprite with a palette-cycling strip plays it (art/pixel/animate.ts). */
export function itemBoxSprite(name: string, cls = ''): string {
  const s = sprite(name);
  if (!s) return '';
  if (s.w >= STRAIGHT_MIN_W) {
    // a straight picture: smooth scaling, full-art canvas, the silhouette traced from its alpha
    const { x, y, w, h } = FULL_ART_BOX;
    return `<g class="bi-item bi-item--full${cls ? ` ${cls}` : ''}">${outlinePath(s.outline)}<image href="${s.url}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" style="image-rendering:auto" data-sprite="${name}"/></g>`;
  }
  return `<g class="bi-item${cls ? ` ${cls}` : ''}">${outlinePath(s.outline)}${animatedSpriteImage(name, 0, 0, ITEM_BOX.w, ITEM_BOX.h)}</g>`;
}

/** The tiers whose pictures are drawn for every item type (art suffix per tier). */
const TIER_ART: Record<Exclude<RankTier, 'mythic' | 'heirloom'>, string> = {
  wood: 't1',
  bronze: 't2',
  silver: 't3',
  gold: 't4',
  prismatic: 't5',
};

/** Mythic (T6) is drawn in a heroic Mythic and a villainous Void version, by the card's side. */
const T6_ART = { mythic: 't6m', void: 't6v' } as const;

/**
 * The item's pixel sprite for a card art window, in the 200 x 240 item box. Every type has its own
 * picture at every tier (`item-<type>-t1` Wood, `-t2`, `-t3`, `-t4`, `-t5`, `-t6m` / `-t6v`, hand-made).
 * The Heirloom has its own picture per type and side (`item-<type>-hm` Mythic, `-hv` Void). `side`
 * is the card's own rarity, which picks the Mythic or Void version at T6 and the Heirloom. A caller
 * with no tier (the gallery) shows the Wood picture. The card's rarity no longer changes the
 * picture: the tier does (DESIGN.md §5, Item types). From Wood to Gold an item type with concept-sheet
 * pictures (`item-<type>-t<tier>-<step>`, ASSET_RULES §5) shows its `step` (0 BASE, 1 +1, 2 +2, 3 FINAL,
 * from `lookStep`); the other types have one picture per tier and ignore it.
 */
export function itemArt(
  kind: ItemKind,
  _rarity: Rarity,
  tier?: RankTier,
  side?: Rarity,
  heirloomArt?: string,
  step = 0,
): string {
  if (tier === 'heirloom') {
    const base = `item-${kind}-${side === 'void' ? 'hv' : 'hm'}`;
    // a card's own recoloured Heirloom (`item-<type>-<hm|hv>-<letter>`), else the type's original
    return itemBoxSprite(heirloomArt ? `${base}-${heirloomArt}` : base);
  }
  const drawn =
    tier === 'mythic' ? T6_ART[side === 'void' ? 'void' : 'mythic'] : TIER_ART[tier ?? 'wood'];
  const plain = `item-${kind}-${drawn}`;
  const stepped = `${plain}-${step}`;
  return itemBoxSprite(sprite(stepped) ? stepped : plain);
}

/**
 * The item picture of a card at a tier: the one call a card face, tile or preview makes. A card with
 * its own Heirloom (`heirloomArt` in cards.json, DESIGN.md §5 More weapons from the Heirloom
 * candidates) shows it at every tier, as the placeholder for its other upgrades in place of the
 * type's wooden to Mythic pictures (user, 2026-11-13); every card without one shows the type's
 * tier pictures and original Heirloom (`itemArt` with the card's rarity as its side). `step` is the
 * look inside the tier (`lookStep` from the card's stars); the Next tier preview leaves it at BASE.
 */
export function cardTierArt(
  card: Pick<Card, 'rarity' | 'heirloomArt'> & { item: { kind: ItemKind } },
  tier?: RankTier,
  step = 0,
): string {
  // a card's own weapon is its picture at every tier until its other upgrades are drawn
  const shown = card.heirloomArt ? 'heirloom' : tier;
  return itemArt(card.item.kind, card.rarity, shown, card.rarity, card.heirloomArt, step);
}
