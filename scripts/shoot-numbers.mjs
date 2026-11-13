// Screenshots the screens whose numbers the readable-numbers rescale changed (DESIGN.md §14
// Readable numbers, UI_RULES §2 Readable numbers), at 1280 × 720 CSS px and 100%: the dungeon
// view, its Dungeons and Training panels, the Cards view with a card's stats, Logging, Mining and
// the Shop. It loads a save first ("new" keeps the new game of a fresh profile), so run it on a profile of its own:
// `BI_PROFILE=numbers npx electron-vite dev -- --remote-debugging-port=9420`, then
// `node scripts/shoot-numbers.mjs [port] [outDir] [save file | new] [tag]`.
// It prints any text on those screens that still looks like an exponent (1.2e9, 4e+12).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9420';
const out = process.argv[3] ?? 'design/options/readable-numbers';
const savePath = process.argv[4] ?? 'new';
const tag = process.argv[5] ?? 'after';
mkdirSync(out, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.bringToFront();
await page.waitForSelector('.shell');

// "new": a fresh profile already holds a new game, so nothing is written.
if (savePath !== 'new') {
  const save = readFileSync(savePath, 'utf8');
  await page.evaluate(async (text) => window.api.writeSave(text), save);
}

const cdp = await page.context().newCDPSession(page);
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${tag}-${name}.png`, Buffer.from(data, 'base64'));
};
const collect = async () => {
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) return;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};
const exponents = [];
const scan = async (name) => {
  const found = await page.evaluate(() => {
    const text = document.body.innerText;
    return [...new Set(text.match(/\b\d+(\.\d+)?e[+-]?\d+\b/gi) ?? [])];
  });
  if (found.length) exponents.push(`${name}: ${found.join(', ')}`);
};
const click = async (sel, wait = 900) => {
  const el = await page.$(sel);
  if (!el) return console.log('missing', sel);
  await el.click().catch((e) => console.log('click failed', sel, String(e).slice(0, 80)));
  await page.waitForTimeout(wait);
};
const view = async (id, name) => {
  await click(`[data-open="${id}"]`, 1400);
  await shot(name);
  await scan(name);
};
const back = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
};

await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.reload();
await page.waitForSelector('.tbl-pile');
await page.waitForTimeout(800);
await collect();
await page.waitForTimeout(4000);
await shot('table');
await scan('table');

await view('dungeon', 'dungeon');
await page.waitForTimeout(3000);
await shot('dungeon-later');
await click('[data-key="panel-dungeons"]');
await shot('dungeons-panel');
await scan('dungeons-panel');
await click('[data-key="panel-training"]');
await shot('training-panel');
await scan('training-panel');
await click('[data-key="panel-weapon"]');
await shot('weapon-panel');
await scan('weapon-panel');
await back();
await back();

await view('cards', 'cards');
await page.evaluate(() =>
  document
    .querySelector('.vh-view:not([hidden]) .cp-detail, .vh-view:not([hidden]) [class*="detail"]')
    ?.scrollIntoView(),
);
await page.waitForTimeout(400);
await shot('card-stats');
await back();

await view('logging', 'logging');
await back();
await view('mining', 'mining');
await back();
await view('shop', 'shop');
await back();

await cdp.send('Emulation.clearDeviceMetricsOverride');
console.log(exponents.length ? `exponents found:\n${exponents.join('\n')}` : 'no exponents found');
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
