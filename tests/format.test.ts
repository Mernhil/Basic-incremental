import { describe, expect, it } from 'vitest';
import { Decimal, formatShort, formatDuration } from '../src/game';

describe('formatDuration', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(450_000)).toBe('7m 30s');
    expect(formatDuration(7_500_000)).toBe('2h 5m');
    expect(formatDuration(8 * 3_600_000)).toBe('8h');
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('formatShort (DESIGN.md §11 Readable numbers)', () => {
  const f = (v: number | string): string => formatShort(new Decimal(v));

  it("writes the user's examples: 12B 3T 105B 18M 20k 2003", () => {
    expect([12e9, 3e12, 105e9, 18e6, 20_000, 2003].map(f)).toEqual([
      '12B',
      '3T',
      '105B',
      '18M',
      '20k',
      '2003',
    ]);
  });

  it('keeps whole digits below 10,000 and two decimals for small fractions', () => {
    expect(f(0)).toBe('0');
    expect(f(0.75)).toBe('0.75');
    expect(f(4.786)).toBe('4.78');
    expect(f(9.5)).toBe('9.5');
    expect(f(12.5)).toBe('12');
    expect(f(59.75)).toBe('59');
    expect(f(100.9)).toBe('100');
    expect(f(9999.9)).toBe('9999');
  });

  it('uses three significant digits, rounded down, without trailing zeros', () => {
    expect(f(10_000)).toBe('10k');
    expect(f(12_345)).toBe('12.3k');
    expect(f(999_999)).toBe('999k');
    expect(f(1_000_000)).toBe('1M');
    expect(f(1_250_000)).toBe('1.25M');
    expect(f(1_999_999)).toBe('1.99M');
    expect(f(-12_345)).toBe('-12.3k');
  });

  it('goes on with named suffixes past T and never writes an exponent', () => {
    expect(f(1.5e15)).toBe('1.5Qa');
    expect(f(4.2e17)).toBe('420Qa');
    expect(f(7e18)).toBe('7Qi');
    for (const v of [1e20, 1e33, 1e66, 1e70, '1e300', '1e5000']) expect(f(v)).not.toMatch(/e/i);
  });
});
