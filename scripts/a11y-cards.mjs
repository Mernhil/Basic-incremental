// Accessibility audit of the Cards page in the running app (UI rework 2.2): text contrast of the
// panel text, tabs, chips and buttons (worst case behind each), the tab and keyboard behaviour,
// and the names of the tiles and meters. Needs the demo collection of scripts/shoot-cards.mjs.
// Usage: node scripts/a11y-cards.mjs [port]
import { chromium } from 'playwright';
import { measure } from './a11y-measure.mjs';

const port = process.argv[2] ?? '9402';
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell');
await page.click('[data-open="cards"]');
await page.click('#cards-tab-collection');
await page.waitForSelector('.cp-tile');
await page.click('[data-key="tile-storm_duelist"]');
await page.waitForTimeout(300);
const CHECKS = [
  '.cp-tab[aria-selected="true"]',
  '.cp-tab[aria-selected="false"]',
  '.cp-chip[aria-pressed="true"]',
  '.cp-chip[aria-pressed="false"]',
  '.cp-count',
  '.cp-shards',
  '.cp-sort',
  '.cp-select',
  '.cp-lv',
  '.cp-ready',
  '.frame__heading',
  '.frame__note',
  '.wp-tile__label',
  '.wp-tile__value',
  '.wp-stars b',
  '.wp-lead',
  '.wp-cost__name',
  '.wp-go',
  '.cp-fact dt',
  '.cp-fact dd',
  '.cp-actions .button',
  '.wp-over .wp-badge b',
];
const report = await page.evaluate(`(${measure.toString()})(${JSON.stringify(CHECKS)})`);
let bad = 0;
for (const [sel, r] of Object.entries(report)) {
  const ok = r === null || r.ratio >= (r.large ? 3 : 4.5);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${sel}`, r ? `${r.ratio.toFixed(2)}:1` : 'not on screen');
}
const names = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.cp-tab')].map((t) => [
    t.textContent,
    t.getAttribute('aria-selected'),
  ]),
  unnamedTiles: [...document.querySelectorAll('.cp-tile')].filter(
    (t) => !t.getAttribute('aria-label'),
  ).length,
  meters: [...document.querySelectorAll('[role=meter]')].map(
    (m) => m.getAttribute('aria-label') + ' | ' + m.getAttribute('aria-valuetext'),
  ),
  pressed: document.querySelectorAll('.cp-tile[aria-pressed="true"]').length,
  tierBtn: (() => {
    const b = document.querySelector('.wp-go');
    return (
      b && [b.textContent, b.getAttribute('aria-disabled'), b.getAttribute('aria-describedby')]
    );
  })(),
}));
console.log(JSON.stringify(names, null, 1));
// keyboard: arrow keys move between the tabs, Tab reaches the chips, the grid and the buttons
await page.focus('#cards-tab-collection');
await page.keyboard.press('ArrowRight');
console.log(
  'after ArrowRight:',
  await page.evaluate(() => [
    document.activeElement?.id,
    document.querySelector('#cards-tab-loadouts')?.getAttribute('aria-selected'),
  ]),
);
await page.keyboard.press('ArrowLeft');
const stops = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  stops.push(
    await page.evaluate(() => {
      const e = document.activeElement;
      const cs = e ? getComputedStyle(e) : null;
      return `${e?.className?.toString().split(' ')[0]}${e?.dataset?.key ? '[' + e.dataset.key + ']' : ''} outline:${cs?.outlineStyle}`;
    }),
  );
}
console.log('Tab stops:', stops);
console.log(bad ? `${bad} contrast failures` : 'contrast ok');
await browser.close();
process.exit(bad ? 1 : 0);
