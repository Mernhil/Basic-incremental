import { describe, expect, it } from 'vitest';
import {
  centroid,
  effectStrength,
  outward,
  resample,
  zigzag,
} from '../src/renderer/src/art/fxGeometry';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('element effect geometry (DESIGN.md 13)', () => {
  it('plays effects only from Gold, stronger at Prismatic', () => {
    expect(['bronze', 'silver', 'gold', 'prismatic'].map(effectStrength)).toEqual([0, 0, 1, 2]);
  });

  it('spaces points evenly along the item outline', () => {
    const pts = resample(square, 8);
    expect(pts).toHaveLength(8);
    expect(pts[1]).toEqual({ x: 5, y: 0 });
    expect(pts[4]).toEqual({ x: 10, y: 10 });
  });

  it('points normals away from the item so flames and arcs leave the shape', () => {
    const pts = resample(square, 8);
    const c = centroid(pts);
    expect(c).toEqual({ x: 5, y: 5 });
    const top = outward(pts, 1, c);
    expect(top.y).toBeLessThan(0);
    const right = outward(pts, 3, c);
    expect(right.x).toBeGreaterThan(0);
  });

  it('draws jagged bolts that start and end on the given points', () => {
    let k = 0;
    const rnd = () => [0.9, 0.1][k++ % 2]!;
    const bolt = zigzag({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, 8, rnd);
    expect(bolt).toHaveLength(6);
    expect(bolt[0]).toEqual({ x: 0, y: 0 });
    expect(bolt[5]).toEqual({ x: 100, y: 0 });
    expect(bolt.slice(1, -1).every((p) => Math.abs(p.y) <= 8 && p.y !== 0)).toBe(true);
  });
});
