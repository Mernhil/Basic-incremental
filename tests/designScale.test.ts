import { describe, expect, it } from 'vitest';
import { DESIGN_H, DESIGN_W, designZoom } from '../src/renderer/src/ui/designZoom';

describe('design size zoom', () => {
  it('is 1 at 1920 x 1080 and 2/3 at 1280 x 720', () => {
    expect(designZoom(1920, 1080)).toBe(1);
    expect(designZoom(1280, 720)).toBeCloseTo(2 / 3, 3);
  });

  it('is limited by the tighter side, so the design size always fits and nothing is cut', () => {
    // wider than 16:9: the height decides; taller than 16:9: the width decides
    expect(designZoom(2400, 1080)).toBe(1);
    expect(designZoom(1920, 1500)).toBe(1);
    const z = designZoom(1274, 815);
    expect(1274 / z).toBeGreaterThanOrEqual(DESIGN_W - 1);
    expect(815 / z).toBeGreaterThanOrEqual(DESIGN_H - 1);
  });

  it('falls back to 1 on nonsense', () => {
    expect(designZoom(0, 0)).toBe(1);
    expect(designZoom(NaN, 100)).toBe(1);
  });
});
