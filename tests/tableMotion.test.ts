import { describe, expect, it } from 'vitest';
import { dealDelay } from '../src/renderer/src/table/stagger';
import { VIEW_IDS } from '../src/renderer/src/table/viewIds';

// Motion E (UI_RULES.md §2, "Motion E tokens and moments"): 90 ms before the second item, each
// later gap 10 ms shorter, never under 40 ms; items past the seventh start with the seventh.
const TOKENS = { step: 90, stepMin: 40, max: 7 };

describe('motion E stagger', () => {
  it('starts the first item at once and shortens each gap by 10 ms', () => {
    expect([0, 1, 2, 3].map((i) => dealDelay(i, TOKENS))).toEqual([0, 90, 170, 240]);
  });

  it('never lets a gap fall under the minimum', () => {
    const t = { step: 60, stepMin: 40, max: 10 };
    const gaps = Array.from({ length: 9 }, (_, i) => dealDelay(i + 1, t) - dealDelay(i, t));
    expect(Math.min(...gaps)).toBe(40);
  });

  it('deals at most seven items one by one; the rest arrive with the seventh', () => {
    const seventh = dealDelay(6, TOKENS);
    expect(seventh).toBe(90 + 80 + 70 + 60 + 50 + 40);
    expect(dealDelay(7, TOKENS)).toBe(seventh);
    expect(dealDelay(20, TOKENS)).toBe(seventh);
  });
});

describe('table views', () => {
  it('has one id per view of the table, the dungeon first', () => {
    expect(new Set(VIEW_IDS).size).toBe(VIEW_IDS.length);
    expect(VIEW_IDS[0]).toBe('dungeon');
  });
});
