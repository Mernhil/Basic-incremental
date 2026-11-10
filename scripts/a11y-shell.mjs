// Accessibility audit of the screen shell in the running app.
// Start the app with: npx electron-vite dev -- --remote-debugging-port=9222
// - Text contrast on every page, for each table item (the table skins the shell)
// - Keyboard: sidebar, header and Home controls reachable by Tab, each with a visible focus ring
// - Tooltips open on focus and are linked with aria-describedby
// - Reduced motion: the shell itself runs no infinite animation
// Usage: node scripts/a11y-shell.mjs [port]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { measure } from './a11y-measure.mjs';

const port = process.argv[2] ?? '9222';
const cosmetics = JSON.parse(readFileSync('src/data/content/cosmetics.json', 'utf8'));
const TABLES = cosmetics.filter((c) => c.slot === 'table').map((c) => c.id);
const CHECKS = [
  '.shell-level__label',
  '.shell-level__xp',
  '.shell-currency__value',
  '.shell-currency__rate',
  '.shell-currency__name',
  '.shell-quest__title',
  '.shell-quest__text',
  '.shell-quest__eta',
  '.shell-page__title',
  '.frame__heading',
  '.frame__note',
  '.frame__lead',
  '.frame__muted',
  '.button',
  '.shell-details',
  '.hm-panel__title',
  '.hm-panel__where',
  '.hm-big__label',
  '.hm-stat__k',
  '.hm-line__name',
  '.hm-line__value',
  '.cp-tab',
  '.cp-chip',
  '.cp-status',
  '.pp-band__title',
  '.pp-row__name',
  '.pp-row__lv',
  '.set-row__label',
  '.set-row__hint',
  '.sk-points__label',
  '.sk-row',
  '.sm-deck__name',
  '.sm-odds__row',
];

const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
// the welcome-back card covers the page after offline progress
async function collectWelcome() {
  for (let i = 0; i < 3; i++) {
    const wb = await page.$('.wb__collect');
    if (!wb) return;
    await wb.click({ force: true });
    await page.waitForTimeout(1500);
  }
}
await page.reload();
await page.waitForSelector('.shell');
await page.waitForTimeout(1200);
await collectWelcome();
const pages = await page.$$eval('.shell-rail__item', (els) => els.map((e) => e.dataset.page));

const failures = [];
let checked = 0;
for (const table of TABLES) {
  const tokens = cosmetics.find((c) => c.id === table).levels[0].tokens;
  await page.evaluate((t) => {
    for (const [k, v] of Object.entries(t))
      document.documentElement.style.setProperty(`--bi-${k}`, v);
  }, tokens);
  for (const id of pages) {
    await page.click(`.shell-rail__item[data-page="${id}"]`);
    const result = await page.evaluate(measure, CHECKS);
    checked++;
    for (const [sel, { ratio, sample }] of Object.entries(result)) {
      if (ratio < 4.5) failures.push(`${table} / ${id}: ${sel} ${ratio}:1 (${sample})`);
    }
  }
}
// tooltip contrast (opened by focus)
await page.click('.shell-rail__item[data-page="home"]');
await page.focus('.shell-currency');
const tip = await page.evaluate(measure, [
  '.shell-tip__title',
  '.shell-tip__rows dt',
  '.shell-tip__rows dd',
]);
for (const [sel, { ratio, sample }] of Object.entries(tip)) {
  if (ratio < 4.5) failures.push(`tooltip: ${sel} ${ratio}:1 (${sample})`);
}
const described = await page.evaluate(
  () => document.activeElement?.getAttribute('aria-describedby') === 'shell-tip',
);
await page.reload();
await page.waitForSelector('.shell');
await page.waitForTimeout(1200);
await collectWelcome();

// keyboard
await page.evaluate(() => document.querySelector('.away .button')?.click());
await page.evaluate(() => document.activeElement?.blur());
const reached = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  reached.push(
    await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        what: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}${el.dataset.page ? ':' + el.dataset.page : ''}`,
        ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2,
      };
    }),
  );
}
const seen = new Map();
for (const r of reached.filter(Boolean)) seen.set(r.what, r.ring);
const railReached = [...seen.keys()].filter((k) => k.startsWith('button.shell-rail__item')).length;

// reduced motion
await page.emulateMedia({ reducedMotion: 'reduce' });
const looping = await page.evaluate(
  () =>
    document
      .getAnimations()
      .filter(
        (a) =>
          a.playState === 'running' &&
          a.effect?.getTiming().iterations === Infinity &&
          a.effect?.target?.closest?.('.shell-header, .shell-rail, .frame__title'),
      ).length,
);
await browser.close();

console.log(`Contrast: ${checked} table x page combinations, ${failures.length} failures`);
for (const f of failures.slice(0, 40)) console.log('  FAIL', f);
console.log(`Tooltip linked with aria-describedby on focus: ${described}`);
console.log(
  `Keyboard: ${seen.size} distinct controls reached, sidebar items ${railReached}/${pages.length}`,
);
console.log('  reached:', [...seen.keys()].join(', '));
console.log(
  '  without visible focus:',
  [...seen].filter(([, ring]) => !ring).map(([w]) => w),
);
console.log(`Infinite animations in the shell chrome: ${looping}`);
