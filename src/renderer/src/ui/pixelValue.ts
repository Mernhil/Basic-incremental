import { mask } from '../art/pixelFont';
import { h } from '../shell/shell';
import { screenDpr } from './pixelFit';

/**
 * A number in the game's own 5 x 7 pixel numerals (art/pixelFont.ts), as a crisp SVG at a whole
 * device scale (`art` = CSS px per numeral pixel, snapped to whole device pixels). The colour is
 * the text colour. Pixelify's 5 reads as an S, so big values never use it. The real text stays in
 * the label for screen readers; characters the font lacks are dropped (a "/ s" unit belongs in the
 * label next to the value, "×" is drawn as the font's "x").
 */
export function pixelValue(text: string, art: number, cls = ''): HTMLElement {
  const spoken = text.replace(/\s*\/\s*s$/, '').replace(/×/g, 'x');
  const cols = mask(spoken, false);
  // big screens draw the stat side larger (--wzoom, weaponStats.css), still in whole device pixels
  const zoom =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wzoom')) || 1;
  const dpr = screenDpr();
  const scale = Math.max(1, Math.round(art * zoom * dpr)) / dpr;
  const rects: string[] = [];
  cols.forEach((col, x) => {
    let y = 0;
    while (y < 7) {
      if (!col[y]) {
        y++;
        continue;
      }
      let end = y;
      while (end < 7 && col[end]) end++;
      rects.push(`M${x} ${y}h1v${end - y}h-1z`);
      y = end;
    }
  });
  const w = Math.max(1, cols.length);
  const box = h('span', `pxv ${cls}`.trim());
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', text);
  box.innerHTML = `<svg viewBox="0 0 ${w} 7" width="${w * scale}" height="${7 * scale}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="currentColor" d="${rects.join('')}"/></svg>`;
  return box;
}
