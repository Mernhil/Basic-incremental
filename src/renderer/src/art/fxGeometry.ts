/**
 * Pure geometry for the element effects (DESIGN.md §12): no DOM, so it can be unit tested.
 * Points are in canvas pixels.
 */

export type Pt = { x: number; y: number };

/** Evenly spaced points along a closed polyline. */
export function resample(points: readonly Pt[], n: number): Pt[] {
  if (points.length < 2 || n < 1) return points.slice();
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push(l);
    total += l;
  }
  const out: Pt[] = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (i < seg.length - 1 && acc + seg[i]! < target) acc += seg[i++]!;
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const u = seg[i]! ? (target - acc) / seg[i]! : 0;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

export function centroid(points: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n };
}

/** Outward unit normal at point i of a closed polyline (pointing away from the centroid). */
export function outward(points: readonly Pt[], i: number, c: Pt = centroid(points)): Pt {
  const a = points[(i - 1 + points.length) % points.length]!;
  const b = points[(i + 1) % points.length]!;
  let nx = b.y - a.y;
  let ny = -(b.x - a.x);
  const l = Math.hypot(nx, ny) || 1;
  nx /= l;
  ny /= l;
  const p = points[i]!;
  if (nx * (p.x - c.x) + ny * (p.y - c.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/** A jagged bolt from a to b: n segments, sideways jitter up to `amp`. */
export function zigzag(a: Pt, b: Pt, n: number, amp: number, rnd: () => number): Pt[] {
  const out: Pt[] = [a];
  const dx = b.y - a.y;
  const dy = a.x - b.x;
  const l = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const o = (rnd() * 2 - 1) * amp;
    out.push({ x: a.x + (b.x - a.x) * t + (dx / l) * o, y: a.y + (b.y - a.y) * t + (dy / l) * o });
  }
  out.push(b);
  return out;
}

/** How strong an element effect is for a rank tier: none below Gold (DESIGN.md §12). */
export function effectStrength(tier: string): 0 | 1 | 2 {
  return tier === 'prismatic' ? 2 : tier === 'gold' ? 1 : 0;
}
