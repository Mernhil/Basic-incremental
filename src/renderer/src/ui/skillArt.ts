import './skillArt.css';

/**
 * Placeholder art for the account tree gems and the enhancement star chart (DESIGN.md 17).
 *
 * PIXEL-ART REQUEST (skill nodes): the final look waits for the user's pick of B7 on the art
 * options page. When the pixel-art agent delivers it, swap the bodies of these two functions
 * only; the pages call nothing else. Wanted from the sprite set:
 * - `skillGem`: a faceted gem, ~40 px, tinted by the branch colour (`--gem`), in four states:
 *   locked (unlit stone), open (outline lit, empty facets), owned (lit facets), maxed (lit +
 *   a small ambient sparkle); plus the centre star (`centreStar`).
 * - `chartStar`: a small four-point star, ~28 px, in chosen / open / blocked / locked.
 *
 * Both draw simple cel-shaded shapes with the game's ink outline; colours come from CSS
 * (`skillArt.css`), so states only switch a class.
 */

const INK = '#1a1020';

/** A faceted gem in the branch colour (set `--gem` on an ancestor). */
export function skillGem(): string {
  return `<svg class="sg" viewBox="-20 -20 40 40" aria-hidden="true">
  <polygon class="sg__base" points="0,-17 15,0 0,17 -15,0" />
  <polygon class="sg__hi" points="0,-17 -15,0 -6,0 0,-7" />
  <polygon class="sg__mid" points="0,-17 15,0 6,0 0,-7" />
  <polygon class="sg__lo" points="-15,0 0,17 0,7 -6,0" />
  <polygon class="sg__deep" points="15,0 0,17 0,7 6,0" />
  <polygon class="sg__table" points="0,-7 6,0 0,7 -6,0" />
  <polygon points="0,-17 15,0 0,17 -15,0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" />
  <path class="sg__glint" d="M-7 -6 L-3 -10" />
</svg>`;
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

/** A four-point chart star for one enhancement option. */
export function chartStar(): string {
  return `<svg class="cst" viewBox="-16 -16 32 32" aria-hidden="true">
  <path class="cst__body" d="M0 -14 L3.5 -3.5 L14 0 L3.5 3.5 L0 14 L-3.5 3.5 L-14 0 L-3.5 -3.5 Z" stroke="${INK}" stroke-width="2" stroke-linejoin="round" />
  <path class="cst__hi" d="M0 -14 L3.5 -3.5 L0 0 L-3.5 -3.5 Z" />
</svg>`;
}
