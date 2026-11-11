// Screenshots the table (UI_RULES.md §2, "The table") and its full views at 1280 × 720 CSS px, at
// 100% and 150% scale (DevTools device emulation), from the real 0.6.0 save in tests/fixtures.
// It replaces the dev save, so use a profile:
// `BI_PROFILE=table npx electron-vite dev -- --remote-debugging-port=9410`, then
// `node scripts/shoot-table.mjs [port] [outDir]`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9410';
const out = process.argv[3] ?? 'design/options/ui-layouts-built';
mkdirSync(out, { recursive: true });
const VIEWS = ['dungeon', 'logging', 'mining', 'cards', 'summon', 'skills', 'shop', 'upgrades'];

const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.waitForSelector('.shell');

const save = readFileSync('tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8');
await page.evaluate(async (text) => window.api.writeSave(text), save);

const collect = async () => {
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) return;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};

const cdp = await page.context().newCDPSession(page);
// Playwright's own screenshot resets the device emulation, so capture through DevTools
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
for (const scale of [1, 1.5]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await page.reload();
  await page.waitForSelector('.tbl-pile');
  await page.waitForTimeout(800);
  await collect();
  await page.waitForTimeout(2200);
  const tag = scale === 1 ? '100' : '150';
  await shot(`${out}/table-${tag}.png`);
  for (const id of VIEWS) {
    await page.click(`[data-open="${id}"]`);
    await page.waitForTimeout(1300);
    await shot(`${out}/${id}-${tag}.png`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  const state = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    open: document.querySelector('.vh-view:not([hidden])')?.dataset.view ?? null,
    focus: document.activeElement?.getAttribute('data-open') ?? document.activeElement?.className,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  }));
  console.log(tag, JSON.stringify(state));
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
