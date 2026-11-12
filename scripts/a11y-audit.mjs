// Accessibility audit of the dev gallery (needs `npm run dev` running).
// - Text contrast for every table x border x rarity combination (worst case over gradient stops)
// - Reduced motion: no infinite animation may keep running
// - Keyboard: every control reachable by Tab
// Usage: node scripts/a11y-audit.mjs [url]
import { chromium } from 'playwright';
import { measure } from './a11y-measure.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/#gallery';
const TABLES = ['gn_table', 'gt_table'];
const BORDERS = ['gn_border', 'gt_border', 'gilded_plate'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'void'];
const CHECKS = [
  '.bi-card__name',
  '.bi-card__job',
  '.bi-info__ability',
  '.bi-info__speed',
  '.bi-info__level',
  '.bi-info__rarity',
  '.gallery__h2',
  '.gallery__fig figcaption',
  '.gallery__field > span',
  '.gallery__note',
];

const browser = await chromium.launch();
const failures = [];
let checked = 0;

// ---- contrast ----
const page = await browser.newPage({ viewport: { width: 1320, height: 1000 } });
for (const table of TABLES) {
  for (const border of BORDERS) {
    for (const rarity of RARITIES) {
      await page.goto(url.replace('#', `?c=${table}-${border}-${rarity}#`));
      await page.waitForSelector('.bi-card');
      await page.selectOption('[data-testid="pick-table"]', table);
      await page.selectOption('[data-testid="pick-border"]', border);
      await page.selectOption('[data-testid="pick-rarity"]', rarity);
      const result = await page.evaluate(measure, CHECKS);
      checked++;
      for (const [sel, { ratio, sample }] of Object.entries(result)) {
        if (ratio < 4.5)
          failures.push(`${table} + ${border} + ${rarity}: ${sel} ${ratio}:1 (${sample})`);
      }
    }
  }
}
await page.close();

// ---- reduced motion ----
const rm = await browser.newContext({
  reducedMotion: 'reduce',
  viewport: { width: 1320, height: 1000 },
});
const rmPage = await rm.newPage();
await rmPage.goto(url.replace('#', '?rm=1#'));
await rmPage.waitForSelector('.bi-card');
await rmPage.selectOption('[data-testid="pick-border"]', 'gilded_filigree');
await rmPage.selectOption('[data-testid="level-border"]', '3');
await rmPage.waitForTimeout(1500);
const looping = await rmPage.evaluate(() =>
  document
    .getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
    .map((a) => a.animationName ?? 'unknown'),
);
const hits = await rmPage.evaluate(() => document.querySelectorAll('.bi-fx').length);

// ---- keyboard ----
const controls = await rmPage.evaluate(() => document.querySelectorAll('select, button').length);
const reached = new Set();
for (let i = 0; i < controls + 2; i++) {
  await rmPage.keyboard.press('Tab');
  const tag = await rmPage.evaluate(() => {
    const el = document.activeElement;
    const visible = el && getComputedStyle(el).outlineStyle !== 'none';
    return el
      ? `${el.tagName}:${el.dataset?.testid ?? el.textContent?.trim().slice(0, 20)}:${visible}`
      : '';
  });
  reached.add(tag);
}
await browser.close();

console.log(`Contrast: ${checked} combinations checked, ${failures.length} failures`);
for (const f of failures.slice(0, 40)) console.log('  FAIL', f);
console.log(`Reduced motion: ${looping.length} infinite animations running`, looping.slice(0, 10));
console.log(`Reduced motion: ${hits} hit effects spawned (expected 0)`);
console.log(
  `Keyboard: ${controls} controls, reached ${[...reached].filter(Boolean).length} by Tab`,
);
console.log(
  '  without visible focus:',
  [...reached].filter((t) => t.endsWith(':false')),
);
