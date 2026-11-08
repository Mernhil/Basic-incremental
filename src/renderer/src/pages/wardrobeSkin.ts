import { chromeCss, wardrobeChrome, type WardrobePart } from '../art/cosmetics';

/**
 * The Wardrobe style (DESIGN.md §8, UI-skin slot 11): the slot plates, item tiles and level ladder
 * of the page are drawn by the equipped style's baked chrome pieces (`wardrobeChrome`). This turns
 * the pieces into one stylesheet scoped to `.wd`; layout per style (paddings, the ladder shape)
 * lives in wardrobe.css under `.wd[data-skin='<style>']`.
 */

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'void'] as const;
/** Css pixels per baked pixel (the card frames and every other pixel piece use 2). */
const SCALE = 2;

/** Whether the style draws its plates and tiles per rarity (style E, rarity glass). */
function perRarity(style: string): boolean {
  return (
    wardrobeChrome(style, 'plate', 'common')?.url !== wardrobeChrome(style, 'plate', 'void')?.url
  );
}

/** The stylesheet of one Wardrobe style (empty when the style has no art). */
export function wardrobeSkinCss(style: string): string {
  if (!wardrobeChrome(style, 'plate')) return '';
  const per = perRarity(style);
  const out: string[] = [];
  const rule = (selector: string, part: WardrobePart, rarity?: string): void => {
    const piece = wardrobeChrome(style, part, rarity);
    if (piece) out.push(`${selector}{${chromeCss(piece, SCALE)}}`);
  };
  const sets: Array<[string, WardrobePart, string, WardrobePart]> = [
    ['.wd-slot', 'plate', '.wd-slot:hover,.wd-slot.is-on', 'plate-on'],
    ['.wd-tile', 'tile', ".wd-tile:hover,.wd-tile[aria-pressed='true']", 'tile-on'],
  ];
  for (const [base, part, hover, on] of sets) {
    if (per) {
      for (const r of RARITIES) {
        rule(`.wd[data-skin] ${base}[data-rarity='${r}']`, part, r);
        const hovers = hover
          .split(',')
          .map((h) => `.wd[data-skin] ${h}[data-rarity='${r}']`)
          .join(',');
        rule(hovers, on, r);
      }
    } else {
      rule(`.wd[data-skin] ${base}`, part);
      rule(
        hover
          .split(',')
          .map((h) => `.wd[data-skin] ${h}`)
          .join(','),
        on,
      );
    }
  }
  const flat = (selector: string, part: WardrobePart, rarity?: string): void => {
    const piece = wardrobeChrome(style, part, rarity);
    if (!piece) return;
    out.push(
      `${selector}{background:url('${piece.url}') 0 0/${piece.w * SCALE}px ${piece.h * SCALE}px no-repeat;` +
        `width:${piece.w * SCALE}px;height:${piece.h * SCALE}px;image-rendering:pixelated}`,
    );
  };
  // the level ladder: rungs of three states joined by links
  if (per) {
    for (const r of RARITIES) {
      const s = `.wd[data-skin] .wd-detail[data-rarity='${r}'] .wd-ladder`;
      flat(`${s} .wd-rung .wd-rung__lv`, 'rung-off', r);
      flat(`${s} .wd-rung.is-next .wd-rung__lv`, 'rung-next', r);
      flat(`${s} .wd-rung.is-done .wd-rung__lv`, 'rung-done', r);
    }
  } else {
    flat('.wd[data-skin] .wd-rung .wd-rung__lv', 'rung-off');
    flat('.wd[data-skin] .wd-rung.is-next .wd-rung__lv', 'rung-next');
    flat('.wd[data-skin] .wd-rung.is-done .wd-rung__lv', 'rung-done');
  }
  const link = wardrobeChrome(style, 'link');
  const done = wardrobeChrome(style, 'link-done');
  if (link) {
    out.push(
      `.wd[data-skin] .wd-rung:not(:first-child)::before{height:${link.h * SCALE}px;` +
        `background:url('${link.url}') 0 0/${link.w * SCALE}px ${link.h * SCALE}px repeat-x;image-rendering:pixelated}`,
    );
  }
  if (done) {
    out.push(
      `.wd[data-skin] .wd-rung.is-done:not(:first-child)::before{` +
        `background:url('${done.url}') 0 0/${done.w * SCALE}px ${done.h * SCALE}px repeat-x}`,
    );
  }
  const socket = wardrobeChrome(style, 'socket');
  if (socket) {
    out.push(
      `.wd[data-skin] .wd-slot>.cs::before{content:'';position:absolute;inset:-9px;z-index:-1;` +
        `background:url('${socket.url}') center/${socket.w * SCALE}px ${socket.h * SCALE}px no-repeat;image-rendering:pixelated}`,
    );
  }
  return out.join('\n');
}
