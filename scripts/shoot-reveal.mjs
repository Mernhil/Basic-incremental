// Screenshots the summon reveal show at 1280 x 720: a x10 pull (all out and glowing, mid-flip, the
// best card's entrance), a x1 pull and a Reduced-motion run, from the 0.6.0 fixture save.
// `BI_PROFILE=reveal npx electron-vite dev -- --remote-debugging-port=9433`, then
// `node scripts/shoot-reveal.mjs [port] [outDir]`. It replaces the profile's save.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9433';
const out = process.argv[3] ?? 'design/options/ui-layouts-built/reveal';
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.waitForSelector('.shell');
await page.evaluate(
  async (t) => window.api.writeSave(t),
  (() => {
    const s = JSON.parse(readFileSync('tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8'));
    s.state.resources.summon_crystal = '30000';
    s.state.resources.glamour_crystal = '30000';
    return JSON.stringify(s);
  })(),
);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.reload();
await page.waitForSelector('.tbl-pile');
await page.waitForTimeout(2500);
const shot = async (n) =>
  writeFileSync(
    `${out}/${n}.png`,
    Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
  );
const open = async () => {
  await page.click('[data-open="summon"]');
  await page.waitForTimeout(1400);
};
const close = async () => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
};

await open();
await page.click('.sm-deck--left .sm-pull--ten');
await page.waitForTimeout(2600);
await shot('x10-all-out-glowing');
let guard = 0;
while (!(await page.$('.rv-entrance')) && guard++ < 12) {
  await page.click('.rv__row');
  await page.waitForTimeout(900);
  if (guard === 2) await shot('x10-mid-flip');
}
await page.waitForTimeout(1800);
await shot('x10-entrance');
await page.click('.rv-entrance');
await page.waitForTimeout(900);
await shot('x10-after-entrance');
await page.click('.rv__skip').catch(() => {});
await page.waitForTimeout(900);
await shot('x10-done');
await close();
await open();
if (await page.$('.sm-deck--left .sm-pull:not(.sm-pull--ten)')) {
  await page.click('.sm-deck--left .sm-pull:not(.sm-pull--ten)');
  await page.waitForTimeout(2400);
  await shot('x1-face-down');
  await page.click('.rv__row');
  await page.waitForTimeout(1200);
  await shot('x1-flipped');
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
