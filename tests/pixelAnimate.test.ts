import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../src/renderer/src/art/pixel/manifest';
import {
  FRAME_MS,
  animatedHtml,
  animatedImage,
  framesIn,
  loopMs,
  stripStyle,
  wholeScale,
  type StripInfo,
} from '../src/renderer/src/art/pixel/animate';

const strip: StripInfo = { name: 'demo', url: '/demo-anim.png', w: 100, h: 120, frames: 8 };

describe('palette-cycling strips', () => {
  it('counts whole frames only', () => {
    expect(framesIn(800, 100)).toBe(8);
    expect(framesIn(100, 100)).toBe(0);
    expect(framesIn(850, 100)).toBe(0);
    expect(framesIn(0, 100)).toBe(0);
  });

  it('plays the strip at the frame time on its own grid', () => {
    expect(loopMs(8)).toBe(8 * FRAME_MS);
    const css = stripStyle(strip);
    expect(css).toContain('background-size:800% 100%');
    expect(css).toContain('image-rendering:pixelated');
    expect(css).toContain('--bi-anim-steps:8');
    expect(css).toContain('animation-duration:880ms');
  });

  it('rounds the scale to a whole number, never below 1x', () => {
    expect([0.4, 1, 1.5, 2.4, NaN].map(wholeScale)).toEqual([1, 1, 2, 2, 1]);
    expect(animatedHtml(strip, 1.6)).toContain('width:200px;height:240px');
    expect(animatedHtml(strip, 0.3)).toContain('width:100px;height:120px');
  });

  it('places SVG markup in the caller box', () => {
    const svg = animatedImage(strip, 0, 0, 200, 240, 'x');
    expect(svg).toContain('<foreignObject x="0" y="0" width="200" height="240"');
    expect(svg).toContain('class="bi-px-anim x"');
  });

  it('registers every strip in the manifest with whole frames of its sprite', () => {
    const names = Object.keys(MANIFEST).filter((n) => n.endsWith('-anim'));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const base = MANIFEST[n.slice(0, -5)];
      expect(base?.animated, n).toBeDefined();
      expect(MANIFEST[n]!.h).toBe(base!.h);
      expect(framesIn(MANIFEST[n]!.w, base!.w)).toBe(base!.animated!.frames);
    }
  });
});
