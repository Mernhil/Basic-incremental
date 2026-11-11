// Screenshots the 9d views (Skill Tree, Achievements, Shop, Upgrades, Settings), the reward track and
// the Ascension challenges panel at 1280 × 720 CSS px, at 100% and 150% scale, from a save that has
// Ascended (`npx tsx scripts/make-meta-save.ts <save>`). It replaces the dev save, so use a profile:
// `BI_PROFILE=meta npx electron-vite dev -- --remote-debugging-port=9519`, then
// `node scripts/shoot-meta.mjs <save> [port] [outDir]`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const saveFile = process.argv[2];
const port = process.argv[3] ?? '9519';
const out = process.argv[4] ?? 'design/options/ui-layouts-built/9d';
mkdirSync(out, { recursive: true });
const VIEWS = ['skills', 'achievements', 'shop', 'upgrades', 'settings'];

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
await page.evaluate(async (text) => window.api.writeSave(text), readFileSync(saveFile, 'utf8'));

const collect = async () => {
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) return;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};
const cdp = await page.context().newCDPSession(page);
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
  for (const id of VIEWS) {
    await page.click(`[data-open="${id}"]`);
    await page.waitForTimeout(1300);
    await shot(`${out}/${id}-${tag}.png`);
    if (id === 'shop') {
      await page.evaluate(() => {
        const el = document.querySelector('.shop-challenges');
        el?.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(500);
      await shot(`${out}/shop-challenges-${tag}.png`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await page.click('.shell-level');
  await page.waitForTimeout(900);
  await shot(`${out}/reward-track-${tag}.png`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
