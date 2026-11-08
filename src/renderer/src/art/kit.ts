/**
 * Small SVG kit for the cel / faceted art (DESIGN.md §12). Every function returns SVG markup as a
 * string so tiles can be rebuilt cheaply. Shapes are drawn in a 100 x 100 box.
 */

export type Tones = readonly [string, string, string, string];
export type Pt = readonly [number, number];

/** The one ink colour used for every outline. */
export const INK = '#1a1020';

let next = 0;
/** A document-unique id for clip paths. */
export const uid = (): string => `bi-art-${next++}`;

export const f = (n: number): string => (Math.round(n * 10) / 10).toString();
export const P = (pts: readonly Pt[]): string =>
  'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + 'Z';
export const ink = (w = 3): string =>
  `stroke="${INK}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
export const circ = (cx: number, cy: number, r: number): string =>
  `M${f(cx - r)} ${f(cy)} a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

/** Deterministic pseudo-random numbers in [0, 1) from a seed. */
export function rnd(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** A filled outline cut into flat faces, clipped to its silhouette and inked. */
export function facet(
  sil: string,
  faces: readonly (readonly [readonly Pt[], string])[],
  base: string,
  w = 2.6,
): string {
  const id = uid();
  const fill = faces
    .map(
      ([pts, c]) =>
        `<path d="${P(pts)}" fill="${c}" stroke="${c}" stroke-width=".7" stroke-linejoin="round"/>`,
    )
    .join('');
  return `<clipPath id="${id}"><path d="${sil}"/></clipPath><g clip-path="url(#${id})"><rect x="-20" y="-20" width="160" height="160" fill="${base}"/>${fill}</g><path d="${sil}" fill="none" ${ink(w)}/>`;
}

/** Facets any outline like a cut gem: a crown of faces lit from the top-left around a table. */
export function facetPoly(
  o: readonly Pt[],
  cx: number,
  cy: number,
  k: number,
  p: Tones,
  w = 2.4,
): string {
  const inner = o.map(([a, b]) => [cx + (a - cx) * k, cy + (b - cy) * k] as const);
  const faces = o.map((pt, i) => {
    const n = (i + 1) % o.length;
    const mx = (pt[0] + o[n]![0]) / 2 - cx;
    const my = (pt[1] + o[n]![1]) / 2 - cy;
    const d = (-mx - my) / Math.hypot(mx, my) / Math.SQRT2;
    const tone = d > 0.45 ? p[0] : d > -0.1 ? p[1] : d > -0.6 ? p[2] : p[3];
    return [[pt, o[n]!, inner[n]!, inner[i]!], tone] as const;
  });
  return facet(P(o), [...faces, [inner, p[1]] as const], p[2], w);
}

/** An irregular polygon around an ellipse, for faceted canopies. */
export function jitterPoly(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  seed: number,
  j = 0.12,
): Pt[] {
  const r = rnd(seed);
  return Array.from({ length: n }, (_, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const q = 1 - j + r() * j * 2;
    return [cx + rx * q * Math.cos(a), cy + ry * q * Math.sin(a)] as const;
  });
}

/** A cel part: base, shadow and deep shadow by shifting the shape inside itself, plus a highlight. */
export function part(d: string, c: Tones, hi = '', w = 2.6): string {
  const id = uid();
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})"><rect x="-20" y="-20" width="160" height="160" fill="${c[2]}"/><path d="${d}" transform="translate(-2 -2)" fill="${c[1]}"/><path d="${d}" transform="translate(-4.5 -4.5)" fill="${c[0]}"/>${hi ? `<path d="${hi}" fill="none" stroke="${c[3]}" stroke-width="2.4" stroke-linecap="round"/>` : ''}</g><path d="${d}" fill="none" ${ink(w)}/>`;
}

/** A four-point twinkle. Kept outside sticker outlines (see `sticker`). */
export const twinkle = (x: number, y: number, r: number, delay = 0, c = '#ffffff'): string =>
  `<path class="bi-art-tw" style="animation-delay:${delay}s" d="M${f(x)} ${f(y - r)} L${f(x + r * 0.28)} ${f(y - r * 0.28)} L${f(x + r)} ${f(y)} L${f(x + r * 0.28)} ${f(y + r * 0.28)} L${f(x)} ${f(y + r)} L${f(x - r * 0.28)} ${f(y + r * 0.28)} L${f(x - r)} ${f(y)} L${f(x - r * 0.28)} ${f(y - r * 0.28)}Z" fill="${c}"/>`;

/** A soft coloured glow (needs the shared blur filter from `installArtDefs`). */
export const halo = (x: number, y: number, r: number, col: string, delay = 0): string =>
  `<g class="bi-art-glow" style="animation-delay:${delay}s"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${col}" opacity=".45" filter="url(#bi-art-blur)"/></g>`;

export const shadow = (cx: number, cy: number, rx: number): string =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(rx * 0.2)}" fill="#000" opacity=".35"/>`;
