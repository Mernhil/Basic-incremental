/**
 * The summoning circle of the reveal show (DESIGN.md §7 Reveal, mockup r3 "Fan Deck"): two small
 * canvases drawn in art pixels (an outer ring of runes, an inner star), shown at a whole scale and
 * turned against each other by CSS (`stage/reveal.css`). Code-drawn: no sprite is needed.
 */

const N = 120;
/** Ring, dashes, runes, star-and-centre, fill (the colours of the circle). */
const PALETTE = ['#ffd66b', '#5ad1ff', '#b67bff', '#fff6dc', '#3ec6ff'] as const;

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The six edges of the star (two triangles). */
const EDGES: Array<[number, number, number, number]> = [];
for (const off of [-90, -30]) {
  for (let k = 0; k < 3; k++) {
    const a = ((off + k * 120) * Math.PI) / 180;
    const b = ((off + (k + 1) * 120) * Math.PI) / 180;
    EDGES.push([Math.cos(a) * 41, Math.sin(a) * 41, Math.cos(b) * 41, Math.sin(b) * 41]);
  }
}

function distToEdge(px: number, py: number, e: [number, number, number, number]): number {
  const [x1, y1, x2, y2] = e;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

function draw(canvas: HTMLCanvasElement, layer: 'outer' | 'inner'): void {
  canvas.width = N;
  canvas.height = N;
  const g = canvas.getContext('2d');
  if (!g) return;
  const img = g.createImageData(N, N);
  const put = (x: number, y: number, hex: string, alpha = 255): void => {
    const o = (y * N + x) * 4;
    const [r, gr, b] = rgb(hex);
    img.data[o] = r;
    img.data[o + 1] = gr;
    img.data[o + 2] = b;
    img.data[o + 3] = alpha;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - N / 2;
      const dy = y + 0.5 - N / 2;
      const r = Math.hypot(dx, dy);
      const a = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
      if (layer === 'outer') {
        if (r >= 56 && r < 58.5) put(x, y, PALETTE[0]);
        else if (r >= 52 && r < 54 && Math.floor(a * 48) % 2 === 0) put(x, y, PALETTE[1]);
        else if (r >= 44 && r < 49.5 && (a * 24) % 1 < 0.3) put(x, y, PALETTE[2]);
        else if (r >= 44 && r < 45) put(x, y, PALETTE[0], 120);
      } else {
        if (r < 56) put(x, y, PALETTE[4], 38);
        if (EDGES.some((e) => distToEdge(dx, dy, e) < 0.95)) put(x, y, PALETTE[0]);
        else if (r >= 19 && r < 21) put(x, y, PALETTE[1]);
        else if (r < 5) put(x, y, PALETTE[3]);
        else if (r >= 9 && r < 10.5 && Math.floor(a * 18) % 2) put(x, y, PALETTE[2]);
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** A summoning circle: an element of two turning canvases, sized and flattened by the CSS. */
export function createCircle(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'rv__circle';
  el.setAttribute('aria-hidden', 'true');
  for (const layer of ['outer', 'inner'] as const) {
    const c = document.createElement('canvas');
    c.className = `rv__circle-${layer}`;
    draw(c, layer);
    el.append(c);
  }
  return el;
}
