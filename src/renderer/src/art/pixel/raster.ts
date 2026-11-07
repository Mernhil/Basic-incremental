/**
 * The pixel treatment (DESIGN.md 13), as pure functions on a hard pixel grid. The build step
 * (`bake.ts`, run by `scripts/art/bake-pixels.mjs`) rasterises the approved drawings with hard
 * edges and then runs these passes, so every sprite in the game comes out of one pipeline:
 *
 * 1. snap every pixel to the drawing's own palette (no anti-aliased in-between colours),
 * 2. clean lone stray pixels,
 * 3. light extra shading: a two-step lit band on the top-left of every part and a darker step on
 *    the bottom-right (the approved card-item treatment), with the highlight leaning warm and the
 *    shadow leaning purple (Brave Frontier ramps),
 * 4. close a one-pixel ink outline around the silhouette,
 * 5. stamp plus-shaped sparkles, then an optional sticker ring or light rim outside the ink.
 *
 * Pixels are '#rrggbb' strings or null (transparent).
 */

export const INK = '#1a1020';
export const WHITE = '#ffffff';
/** Lit-edge target: a warm white, so highlights lean yellow-white (Brave Frontier ramp). */
export const WARM = '#fff4d6';
/** Shadow-edge target: a deep purple, so shadows lean purple. */
export const DEEP = '#140a1c';

export type Px = string | null;
export interface Grid {
  w: number;
  h: number;
  px: Px[];
}

const N4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const hex = (c: string): string => {
  const s = c.toLowerCase();
  return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
};
export const rgbOf = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];
export const toHex = (a: readonly number[]): string =>
  '#' +
  a
    .slice(0, 3)
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
export const mix = (a: string, b: string, t: number): string => {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
};

/** Every colour literal in a piece of SVG markup, plus white and the ink. */
export function paletteOf(markup: string): string[] {
  const found = markup.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
  return [...new Set([...found.map(hex), WHITE, INK])];
}

const get = (g: Grid, a: Px[], i: number, j: number): Px =>
  i < 0 || j < 0 || i >= g.w || j >= g.h ? null : a[j * g.w + i]!;

/** Hard alpha and nearest palette colour (luma-weighted), from raw RGBA. */
export function quantize(rgba: ArrayLike<number>, w: number, h: number, palette: string[]): Grid {
  const pal = palette.map(rgbOf);
  const px: Px[] = new Array<Px>(w * h).fill(null);
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3]! < 128) continue;
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < pal.length; j++) {
      const p = pal[j]!;
      const e =
        (p[0] - rgba[i * 4]!) ** 2 * 0.3 +
        (p[1] - rgba[i * 4 + 1]!) ** 2 * 0.59 +
        (p[2] - rgba[i * 4 + 2]!) ** 2 * 0.11;
      if (e < bd) {
        bd = e;
        best = j;
      }
    }
    px[i] = palette[best]!;
  }
  return { w, h, px };
}

/** Lone pixels take the colour of their four neighbours when those all agree (two passes). */
export function cleanOrphans(g: Grid, passes = 2): Grid {
  let px = g.px;
  for (let pass = 0; pass < passes; pass++) {
    const nx = px.slice();
    for (let j = 0; j < g.h; j++)
      for (let i = 0; i < g.w; i++) {
        const nb = N4.map(([a, b]) => get(g, px, i + a, j + b));
        if (nb.every((q) => q === nb[0]) && nb[0] !== px[j * g.w + i]) nx[j * g.w + i] = nb[0]!;
      }
    px = nx;
  }
  return { ...g, px };
}

/**
 * Light extra shading (DESIGN.md 13, card items): inside each flat part the lit edge gets a lighter
 * step (30% then 12% toward a warm white) and the shadow edge a darker one (24% toward deep purple).
 */
export function bevel(g: Grid): Grid {
  const { w, h, px } = g;
  const out = px.slice();
  const same = (i: number, j: number, c: string): boolean => get(g, px, i, j) === c;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = px[j * w + i];
      if (!c || c === INK || c === WHITE) continue;
      const thickV = same(i, j - 1, c) || same(i, j + 1, c);
      const thickH = same(i - 1, j, c) || same(i + 1, j, c);
      const up1 = !same(i, j - 1, c);
      const lf1 = !same(i - 1, j, c);
      const up2 = !up1 && !same(i, j - 2, c);
      const lf2 = !lf1 && !same(i - 2, j, c);
      const dn1 = !same(i, j + 1, c);
      const rt1 = !same(i + 1, j, c);
      const deep = (k: number): boolean => same(i, j + k, c) || same(i + k, j, c);
      if ((up1 || lf1) && deep(1) && deep(2) && thickV && thickH)
        out[j * w + i] = mix(c, WARM, 0.3);
      else if ((up2 || lf2) && deep(1) && deep(2)) out[j * w + i] = mix(c, WARM, 0.12);
      else if ((dn1 || rt1) && (same(i, j - 2, c) || same(i - 2, j, c)))
        out[j * w + i] = mix(c, DEEP, 0.24);
    }
  return { ...g, px: out };
}

/** Every filled pixel on the outside edge becomes ink: the silhouette always has a closed line. */
export function outline(g: Grid, ink = INK): Grid {
  const out = g.px.slice();
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const p = g.px[j * g.w + i];
      if (!p || p === ink) continue;
      if (N4.some(([a, b]) => !get(g, g.px, i + a, j + b))) out[j * g.w + i] = ink;
    }
  return { ...g, px: out };
}

/**
 * Lines between parts (DESIGN.md 13): ink stays on the silhouette, while ink inside the shape (where
 * one part overlaps another) becomes a dark tone of the part it borders, so parts separate without
 * a colouring-book look. The line takes the darker neighbour's colour pulled toward deep purple.
 */
export function partLines(g: Grid, ink = INK): Grid {
  const out = g.px.slice();
  const lum = (c: string): number => {
    const [r, gg, b] = rgbOf(c);
    return r * 0.3 + gg * 0.59 + b * 0.11;
  };
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      if (g.px[j * g.w + i] !== ink) continue;
      // anything touching the outside (8 neighbours) is silhouette ink and stays
      let edge = false;
      const seen = new Map<string, number>();
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const q = get(g, g.px, i + di, j + dj);
          if (!q) edge = true;
          else if (q !== ink && q !== WHITE) seen.set(q, (seen.get(q) ?? 0) + 1);
        }
      if (edge || !seen.size) continue;
      // the part this line belongs to: the most common neighbour, darker on a tie
      const [c] = [...seen.entries()].sort((a, b) => b[1] - a[1] || lum(a[0]) - lum(b[0]))[0]!;
      out[j * g.w + i] = mix(c, DEEP, 0.62);
    }
  return { ...g, px: out };
}

/**
 * Final orphan sweep: a pixel whose colour appears in none of its eight neighbours (left behind by
 * the shading passes on diagonal edges) takes the most common colour of its four neighbours. Ink,
 * white glints and clear pixels are never touched, so outlines and sparkles stay.
 */
export function sweepOrphans(g: Grid, ink = INK): Grid {
  const out = g.px.slice();
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const c = g.px[j * g.w + i];
      if (!c || c === ink || c === WHITE) continue;
      let alone = true;
      for (let dj = -1; dj <= 1 && alone; dj++)
        for (let di = -1; di <= 1; di++)
          if ((di || dj) && get(g, g.px, i + di, j + dj) === c) {
            alone = false;
            break;
          }
      if (!alone) continue;
      const count = new Map<string, number>();
      for (const [a, b] of N4) {
        const q = get(g, g.px, i + a, j + b);
        if (q && q !== WHITE) count.set(q, (count.get(q) ?? 0) + 1);
      }
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 2) out[j * g.w + i] = best[0];
    }
  return { ...g, px: out };
}

/** White plus-shaped sparkles at grid points, `arm` pixels long. */
export function sparkles(g: Grid, at: readonly (readonly [number, number])[], arm: number): Grid {
  const out = g.px.slice();
  for (const [ci, cj] of at)
    for (let a = -arm; a <= arm; a++)
      for (const [i, j] of [
        [ci + a, cj],
        [ci, cj + a],
      ] as const)
        if (i >= 0 && j >= 0 && i < g.w && j < g.h) out[j * g.w + i] = WHITE;
  return { ...g, px: out };
}

/**
 * A ring of `color` outside the silhouette, `width` pixels thick. Sticker assets (tiles, coins,
 * medals) use a white one outside the ink; card items use a light rim that skips sparkles.
 */
export function ring(g: Grid, color: string, width = 1, skipWhite = false): Grid {
  let px = g.px;
  for (let pass = 0; pass < width; pass++) {
    const out = px.slice();
    for (let j = 0; j < g.h; j++)
      for (let i = 0; i < g.w; i++) {
        if (px[j * g.w + i]) continue;
        const touch = N4.some(([a, b]) => {
          const q = get(g, px, i + a, j + b);
          if (!q) return false;
          if (pass) return q === color;
          return skipWhite ? q !== WHITE : true;
        });
        if (touch) out[j * g.w + i] = color;
      }
    px = out;
  }
  return { ...g, px };
}

/** RGBA bytes for a grid (for canvas `ImageData` or PNG encoding). */
export function toRGBA(g: Grid): Uint8ClampedArray {
  const d = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0; i < g.px.length; i++) {
    const p = g.px[i];
    if (!p) continue;
    const [r, gg, b] = rgbOf(p);
    d[i * 4] = r;
    d[i * 4 + 1] = gg;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = 255;
  }
  return d;
}

/** A grid back from RGBA bytes (alpha below half is transparent). */
export function fromRGBA(d: ArrayLike<number>, w: number, h: number): Grid {
  const px: Px[] = new Array<Px>(w * h).fill(null);
  for (let i = 0; i < w * h; i++)
    if (d[i * 4 + 3]! >= 128) px[i] = toHex([d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!]);
  return { w, h, px };
}

/** Distinct colours in a grid. */
export const colours = (g: Grid): Set<string> => new Set(g.px.filter((p): p is string => !!p));

/**
 * Prepares approved SVG markup for hard rasterising at `scale` pixels per unit: twinkle paths come
 * out as sparkle points, glows, blur filters and drop shadows go, and every stroke snaps to whole
 * pixels (ink lines to exactly one pixel).
 */
export function prepSvg(
  markup: string,
  scale: number,
): { svg: string; sparks: [number, number][] } {
  const sparks: [number, number][] = [];
  let s = markup.replace(/<path class="(?:tw|bi-art-tw)"[^>]*\/>/g, (m) => {
    const d = / d="([^"]+)"/.exec(m)?.[1] ?? '';
    const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    let sx = 0;
    let sy = 0;
    let k = 0;
    for (let i = 0; i + 1 < n.length; i += 2) {
      sx += n[i]!;
      sy += n[i + 1]!;
      k++;
    }
    if (k) sparks.push([sx / k, sy / k]);
    return '';
  });
  s = s
    .replace(/<g class="(?:bi-art-glow|glow)"[^>]*>[\s\S]*?<\/g>/g, '')
    .replace(/<circle class="halo"[^>]*\/>/g, '')
    .replace(/ filter="url\([^)]*\)"/g, '')
    .replace(/<ellipse[^>]*fill="#000"[^>]*\/>/g, '');
  s = s.replace(
    new RegExp(`stroke="${INK}" stroke-width="[\\d.]+"`, 'g'),
    `stroke="${INK}" data-ink="1"`,
  );
  s = s
    .replace(/stroke-width="([\d.]+)"/g, (_m, w: string) => {
      const px = Number(w) * scale;
      return `stroke-width="${px < 1.6 ? 1 : Math.round(px)}" vector-effect="non-scaling-stroke"`;
    })
    .replace(/data-ink="1"/g, 'stroke-width="1" vector-effect="non-scaling-stroke"');
  return { svg: s, sparks };
}
