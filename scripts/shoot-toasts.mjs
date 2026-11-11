// Toast placement (UI_RULES.md §2 Toasts) at 1280 x 720: three toasts on the table and three in
// the dungeon's full view, from the real 0.6.0 fixture save.
// `BI_PROFILE=toasts npx electron-vite dev -- --remote-debugging-port=9412`, then
// `node scripts/shoot-toasts.mjs [port] [outDir]`. It replaces the profile's save.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9412';
const out = process.argv[3] ?? 'design/options/ui-layouts-built/balance2';
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
await page.waitForSelector('.shell');
const cdp = await page.context().newCDPSession(page);
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
};
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
const collect = async () => {
  for (let i = 0; i < 10; i++) {
    const btn = await page.$('.wb button');
    if (!btn) return;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};
const toasts = async () => {
  await page.mouse.move(420, 40); // a blank stretch of the header: no tooltip in the shot
  await page.waitForTimeout(300);
  return page.evaluate(async () => {
    const { toast } = await import('/src/stage/toast.ts');
    toast('Deep Delver', 'Reach floor 20 of a dungeon', 'milestone', 'gold');
    toast('Account level 4', ['+1 cost cap', '0.5 Summon Scroll'], 'milestone', 'gold');
    toast('Rare drop', 'A Frost Core', 'rare');
  });
};
const fixture = readFileSync('tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8');
await page.evaluate(async (t) => window.api.writeSave(t), fixture);
await page.reload();
await page.waitForSelector('.tbl-pile');
await page.waitForTimeout(800);
await collect();
await page.waitForTimeout(8000);
await toasts();
await page.waitForTimeout(700);
await shot('toasts-table');
await page.waitForTimeout(5000);
await page.click('[data-open="dungeon"]');
await page.waitForTimeout(1500);
await toasts();
await page.waitForTimeout(700);
await shot('toasts-view-dungeon');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
