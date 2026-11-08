import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CARD_ART_W,
  CARD_BOX_W,
  cardBoxScale,
  cardCssSize,
  cardsPerRow,
  deviceScaleOf,
  isCleanScale,
  isWhole,
  pickCardScale,
  pickRowScale,
  pickSpriteScale,
  spriteCssSize,
} from '../src/renderer/src/ui/pixelScale';

const DPRS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];

describe('Clean pixels: the scale choice (DESIGN.md §12)', () => {
  it('detects whole and fractional scales', () => {
    expect(isWhole(2)).toBe(true);
    expect(isWhole(2.004)).toBe(true);
    expect(isWhole(1.33)).toBe(false);
    // today's card: 176 CSS px for 132 art pixels is 1.33 device pixels per art pixel at dpr 1
    expect(isCleanScale(176, CARD_ART_W, 1)).toBe(false);
    // ... and is clean at dpr 1.5 (264 device pixels = 2 per art pixel)
    expect(isCleanScale(176, CARD_ART_W, 1.5)).toBe(true);
    // shrinking is never clean, even by a whole fraction
    expect(isCleanScale(24, 48, 1)).toBe(false);
    expect(isCleanScale(24, 48, 2)).toBe(true);
  });

  it('always gives a whole scale of at least 1, on every screen', () => {
    for (const dpr of DPRS) {
      for (const want of [20, 48, 74, 105, 132, 176, 222, 264, 400, 900]) {
        for (const native of [18, 24, 48, 58, 64, 100, 132, 160]) {
          const n = pickSpriteScale(want, native, dpr);
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(isCleanScale(spriteCssSize(native, n, dpr), native, dpr)).toBe(true);
        }
      }
    }
  });

  it('picks the nearest whole scale to the wanted size', () => {
    expect(pickSpriteScale(176, 132, 1.5)).toBe(2); // exactly 176 CSS px
    expect(pickSpriteScale(176, 132, 2)).toBe(3); // 198 CSS px, nearer than 132
    expect(pickSpriteScale(176, 132, 1)).toBe(1);
    expect(pickSpriteScale(105.6, 132, 1.25)).toBe(1); // 0.6 of the card, the old collection size
    expect(pickSpriteScale(24, 48, 2)).toBe(1); // a 24 CSS px coin is its own size on a 2x screen
  });

  it('never shrinks art: a small ask still gets 1x', () => {
    expect(pickSpriteScale(24, 48, 1)).toBe(1);
    expect(pickSpriteScale(32, 64, 1.5)).toBe(1);
    expect(pickCardScale(50, 1)).toBe(1);
  });

  it('uses the largest scale that fits when a layout is narrow', () => {
    // wants 3x at dpr 2 (198 CSS px) but only 150 CSS px are free: 2x is 132, 3x does not fit
    expect(pickCardScale(198, 2, 150)).toBe(2);
    // nothing fits: stays 1x (the layout reflows or scrolls instead)
    expect(pickCardScale(198, 2, 40)).toBe(1);
    // a free layout keeps the wanted scale
    expect(pickCardScale(198, 2, 1000)).toBe(3);
  });

  it('card sizes are whole multiples of the 132 x 186 grid in device pixels', () => {
    for (const dpr of DPRS) {
      for (let n = 1; n <= 8; n++) {
        const { w, h } = cardCssSize(n, dpr);
        expect(w * dpr).toBeCloseTo(132 * n, 6);
        expect(h * dpr).toBeCloseTo(186 * n, 6);
      }
    }
  });

  it('the box scale turns the 176 x 248 layout box into exactly that size', () => {
    for (const dpr of DPRS) {
      for (let n = 1; n <= 8; n++) {
        const k = cardBoxScale(n, dpr);
        expect(CARD_BOX_W * k).toBeCloseTo(cardCssSize(n, dpr).w, 6);
        // one box unit is 3/4 of an art pixel, so a sprite placed on the box grid is whole too
        expect(deviceScaleOf(CARD_BOX_W * k, CARD_ART_W, dpr)).toBeCloseTo(n, 6);
      }
    }
    expect(cardBoxScale(2, 1.5)).toBeCloseTo(1, 9);
    expect(cardBoxScale(1, 1)).toBeCloseTo(0.75, 9);
  });

  it('scales cards only through the whole-pixel scale in the renderer CSS', () => {
    const root = join(__dirname, '..', 'src', 'renderer', 'src');
    const css: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.css')) css.push(p);
      }
    };
    walk(root);
    expect(css.length).toBeGreaterThan(10);
    // Known exception, to be replaced by drawn thumbnails: the wardrobe swatch shows a whole card
    // at 19 to 56 % (needs small pixel-art icons; see the Clean pixels PR).
    const allowed = new Set(['ui/cosmeticSwatch.css']);
    const offenders: string[] = [];
    for (const file of css) {
      if (allowed.has(relative(root, file).split(sep).join('/'))) continue;
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      if (/(^|[;{\s])zoom\s*:/.test(text)) offenders.push(`${file}: zoom`);
      for (const m of text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        const [, selector = '', body = ''] = m;
        if (
          !/\.bi-card\b(?!__)|\.cp-fit|\.ar-slot|\.wd-card|\.rv-slot|\.st-evo__stage/.test(selector)
        )
          continue;
        // a card (or the box that holds one) scaled by anything but the whole-pixel --card-k
        for (const t of body.matchAll(
          /(?:transform\s*:\s*scale|(?:^|[;\s])scale\s*:)\s*\(?([^;]*)/g,
        )) {
          if (!t[1]!.includes('--card-k'))
            offenders.push(`${file}: ${selector.trim()} scales by ${t[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('fits a row of cards: reflows to a smaller whole scale instead of squeezing', () => {
    // four cards of about 176 CSS px with 14 px gaps want 746 px; 700 px is free at dpr 2
    const n = pickRowScale(4, 198, 700, 14, 2);
    expect(n).toBe(2);
    expect(cardCssSize(n, 2).w * 4 + 14 * 3).toBeLessThanOrEqual(700);
    expect(cardsPerRow(700, 2, 2, 14)).toBe(4);
    expect(cardsPerRow(100, 2, 2, 14)).toBe(1);
  });
});
