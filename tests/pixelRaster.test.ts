import { describe, expect, it } from 'vitest';
import {
  INK,
  WHITE,
  bevel,
  cleanOrphans,
  colours,
  mix,
  outline,
  partLines,
  sweepOrphans,
  prepSvg,
  quantize,
  ring,
  sparkles,
  type Grid,
} from '../src/renderer/src/art/pixel/raster';

/** A grid from rows of single-letter colour keys ('.' is clear). */
function grid(rows: string[], keys: Record<string, string>): Grid {
  const w = rows[0]!.length;
  return {
    w,
    h: rows.length,
    px: rows
      .join('')
      .split('')
      .map((c) => (c === '.' ? null : keys[c]!)),
  };
}
const at = (g: Grid, x: number, y: number) => g.px[y * g.w + x];

describe('pixel treatment (DESIGN.md §12)', () => {
  it('snaps anti-aliased colours to the palette and makes alpha hard', () => {
    const rgba = [250, 10, 10, 255, 200, 200, 200, 100, 30, 20, 40, 200];
    const g = quantize(rgba, 3, 1, ['#ff0000', INK]);
    expect(g.px).toEqual(['#ff0000', null, INK]);
  });

  it('cleans lone pixels whose four neighbours agree', () => {
    const g = cleanOrphans(grid(['aaa', 'aba', 'aaa'], { a: '#336699', b: '#ff0000' }));
    expect(at(g, 1, 1)).toBe('#336699');
  });

  it('closes a one-pixel ink outline round the silhouette', () => {
    const g = outline(grid(['.....', '.aaa.', '.aaa.', '.aaa.', '.....'], { a: '#336699' }));
    expect(at(g, 1, 1)).toBe(INK);
    expect(at(g, 3, 2)).toBe(INK);
    expect(at(g, 2, 2)).toBe('#336699');
  });

  it('lights the top-left of a part warm and shades the bottom-right toward purple', () => {
    const rows = Array.from({ length: 8 }, () => 'aaaaaaaa');
    const g = bevel(grid(rows, { a: '#3366cc' }));
    const lit = at(g, 0, 0)!;
    const dark = at(g, 7, 7)!;
    expect(lit).not.toBe('#3366cc');
    expect(dark).not.toBe('#3366cc');
    // warm highlight: red rises more than blue; purple shadow: blue stays above green
    const [r, , b] = [1, 3, 5].map((i) => parseInt(lit.slice(i, i + 2), 16));
    expect(r! - 0x33).toBeGreaterThan(b! - 0xcc);
    expect(colours(g).size).toBeLessThanOrEqual(5);
  });

  it('stamps plus-shaped sparkles and rings stickers outside the ink', () => {
    let g = grid(['.......', '.......', '...a...', '.......', '.......'], { a: '#336699' });
    g = sparkles(g, [[3, 2]], 1);
    expect([at(g, 2, 2), at(g, 4, 2), at(g, 3, 1), at(g, 3, 3), at(g, 2, 1)]).toEqual([
      WHITE,
      WHITE,
      WHITE,
      WHITE,
      null,
    ]);
    const r = ring(grid(['...', '.a.', '...'], { a: INK }), WHITE);
    expect(at(r, 0, 1)).toBe(WHITE);
    expect(at(r, 0, 0)).toBeNull();
  });

  it('turns twinkles into sparkle points, drops glows and snaps strokes to whole pixels', () => {
    const { svg, sparks } = prepSvg(
      `<path class="bi-art-tw" d="M10 3 L12 10 L10 17 L8 10Z"/><g class="bi-art-glow"><circle r="4"/></g><path d="M0 0" stroke="${INK}" stroke-width="3.2"/><path d="M0 0" stroke="#fff" stroke-width="5"/>`,
      0.5,
    );
    expect(sparks).toEqual([[10, 10]]);
    expect(svg).not.toContain('bi-art-glow');
    expect(svg).toContain(`stroke="${INK}" stroke-width="1"`);
    expect(svg).toContain('stroke-width="3"');
  });

  it('mixes colours in RGB', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('part lines and orphan sweep (DESIGN.md §12, Brave Frontier)', () => {
  it('keeps ink on the silhouette and tints ink inside the shape toward the part', () => {
    const keys = { k: INK, a: '#3366cc', b: '#cc6633' };
    const g = partLines(grid(['kkkkk', 'kaaak', 'kkkkk', 'kbbbk', 'kkkkk'], keys));
    expect(at(g, 0, 2)).toBe(INK);
    expect(at(g, 2, 2)).not.toBe(INK);
  });

  it('sweeps pixels that match none of their eight neighbours, but never glints or ink', () => {
    const g = sweepOrphans(grid(['aaa', 'aba', 'aaa'], { a: '#336699', b: '#123456' }));
    expect(at(g, 1, 1)).toBe('#336699');
    const w = sweepOrphans(grid(['aaa', 'awa', 'aaa'], { a: '#336699', w: WHITE }));
    expect(at(w, 1, 1)).toBe(WHITE);
  });
});
