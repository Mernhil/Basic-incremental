import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/renderer/src/pages/cards.css', 'utf8');
const fit = readFileSync('src/renderer/src/ui/pixelFit.ts', 'utf8');
const rule = (sel: string): string => {
  const at = css.indexOf(`\n${sel} {`);
  expect(at, sel).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('\n}', at));
};

describe('rooms for the card kit (UI_RULES: the kit hangs outside the card)', () => {
  it('reserves at least the kit overhang below a card (25 art pixels, 33.3 card units)', () => {
    const m = /--kit-bottom', `\$\{\(k \* ([\d.]+)\)/.exec(fit);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(33.3);
  });
  it('the picker and the grids leave the kit its room', () => {
    expect(rule('.cp-pick__list')).toMatch(/padding: var\(--kit-top\) var\(--kit-side\)/);
    expect(rule('.cp-pick__list')).toMatch(/gap: [^;]*var\(--kit-gutter\)/);
    expect(rule('.cp-grid')).toMatch(
      /gap: [^;]*--kit-top[^;]*--kit-bottom[^;]*var\(--kit-gutter\)/,
    );
    expect(rule('.cp-grid')).toMatch(/padding: [^;]*--kit-side/);
    expect(rule('.cp-grid--heirlooms')).toMatch(/gap: [^;]*--kit-top[^;]*--kit-bottom/);
    expect(rule('.cp-pick__note')).toMatch(/margin-top: var\(--kit-bottom\)/);
  });
});
