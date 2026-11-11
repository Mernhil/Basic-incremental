// Screenshots for the table fix pass at 1280 x 720: the table a minute in from the real 0.6.0
// fixture save and from a new save, and the table and an open view with three toasts showing.
// `BI_PROFILE=fixpass npx electron-vite dev -- --remote-debugging-port=9411`, then
// `node scripts/shoot-fix.mjs [port] [outDir]`. It replaces the profile's save.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9411';
const out = process.argv[3] ?? 'design/options/ui-layouts-built/fix';
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
const toasts = () =>
  page.evaluate(async () => {
    const { toast } = await import('/src/stage/toast.ts');
    toast('Deep Delver', 'Reach floor 20 of a dungeon', 'milestone', 'gold');
    toast('Account level 4', ['+1 cost cap', '0.5 Summon Scroll'], 'milestone', 'gold');
    toast('Rare drop', 'A Frost Core', 'rare');
  });

const only = process.env.ONLY; // 'new' skips the fixture part
if (only !== 'new') {
  // 1. the real 0.6.0 save
  const fixture = readFileSync('tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8');
  await page.evaluate(async (t) => window.api.writeSave(t), fixture);
  await page.reload();
  await page.waitForSelector('.tbl-pile');
  await page.waitForTimeout(800);
  await collect();
  await page.waitForTimeout(60000);
  await shot('fixture-table-1min');
  await toasts();
  await page.waitForTimeout(700);
  await shot('toasts-table');
  await page.waitForTimeout(5000);
  await page.click('[data-open="cards"]');
  await page.waitForTimeout(1300);
  await toasts();
  await page.waitForTimeout(700);
  await shot('toasts-view-cards');
  await page.keyboard.press('Escape');
}

// 2. a new save
// made by `npx tsx scripts/make-new-save.ts <outDir>/new.save.txt`
execFileSync('npx', ['tsx', 'scripts/make-new-save.ts', `${out}/new.save.txt`], { shell: true });
const fresh = readFileSync(`${out}/new.save.txt`, 'utf8');
await page.evaluate(async (t) => window.api.writeSave(t), fresh);
await page.reload();
await page.waitForSelector('.tbl-pile');
await page.waitForTimeout(800);
await collect();
await page.waitForTimeout(60000);
await shot('new-save-table-1min');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
