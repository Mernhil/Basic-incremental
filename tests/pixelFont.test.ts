import { describe, expect, it } from 'vitest';
import { formatShort, SUFFIXES } from '../src/game';
import { FONT } from '../src/renderer/src/art/pixelFont';

const chars = (text: string): string[] => [...text];

describe('the pixel numerals draw every character the number format writes', () => {
  it('has a glyph for every suffix letter ("20.4k" must not lose its k)', () => {
    const missing = new Set<string>();
    for (const suffix of SUFFIXES) for (const ch of chars(suffix)) if (!FONT[ch]) missing.add(ch);
    expect([...missing]).toEqual([]);
  });

  it('has the digits, the point, the comma, the signs and the infinity', () => {
    for (const ch of chars('0123456789.,-+%∞ ')) expect(FONT[ch], ch).toBeDefined();
  });

  it('draws every character of real formatted numbers', () => {
    const samples = [20_400, 1.25e6, 3e12, 5e15, 1e30, 1e60, 1e66, -4500, 0.75];
    for (const n of samples)
      for (const ch of chars(formatShort(n))) expect(FONT[ch], `${n}: ${ch}`).toBeDefined();
  });

  it('keeps every glyph rectangular and 7 rows tall', () => {
    for (const [ch, rows] of Object.entries(FONT)) {
      expect(rows, ch).toHaveLength(7);
      expect(new Set(rows.map((r) => r.length)).size, ch).toBe(1);
    }
  });
});
