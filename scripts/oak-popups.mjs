// Screenshots and sweeps the popups of the shell under a table: welcome back, Goals, Details, the account
// level track, a tooltip and toasts. Same setup as oak-tour.mjs.
// node scripts/oak-popups.mjs <outDir> [port] [default|oak|plum] [width] [height]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { sweep } from './lib/contrast.mjs';

const out = process.argv[2] ?? 'scratch-shots';
const port = process.argv[3] ?? '9492';
const table = process.argv[4] ?? 'oak';
const w = Number(process.argv[5] ?? 1920);
const h = Number(process.argv[6] ?? 1010);
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell', { timeout: 60000 });
const save = readFileSync('tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8');
await page.evaluate(async (t) => window.api.writeSave(t), save);
await page.evaluate(
  (t) =>
    t === 'default'
      ? localStorage.removeItem('bi-dev-table')
      : localStorage.setItem('bi-dev-table', t === 'plum' ? 'gn_table' : 'oak_table'),
  table,
);
await page.reload();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: w,
  height: h,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.waitForSelector('.wb', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
const mute = () =>
  page.evaluate(() => document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)));
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${table}-${name}-${w}.png`, Buffer.from(data, 'base64'));
  const r = await sweep(page);
  const bad = r.bad.filter((b) => !/bi-card__name|bi-info|dev-toggle/.test(b.cls));
  console.log(name, r.total, 'text,', bad.length, 'under AA');
  const seen = new Set();
  for (const b of bad) {
    const k = b.cls || b.chain;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log('  ', b.r, b.fg, 'on', b.bg, b.text, '|', b.chain);
  }
};
await mute();
await shot('welcome');
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
await page.waitForTimeout(2500);
await page.click('.shell-goals__btn').catch(() => {});
await page.waitForTimeout(600);
await shot('goals');
await page.keyboard.press('Escape');
await page.click('.shell-details').catch(() => {});
await page.waitForTimeout(600);
await shot('details');
await page.keyboard.press('Escape');
await page.click('.shell-details').catch(() => {});
await page.click('.shell-level').catch(() => {});
await page.waitForTimeout(600);
await shot('track');
await page.keyboard.press('Escape');
await page.mouse.move(1000, 30);
await page.waitForTimeout(1200);
await shot('tooltip');
await page.evaluate(async () => {
  const { toast } = await import('/src/stage/toast.ts');
  toast('Deep Delver', 'Reach floor 20 of a dungeon', 'milestone', 'gold');
  toast('Account level 4', ['+1 cost cap', '0.5 Summon Scroll'], 'milestone', 'gold');
  toast('Rare drop', 'A Frost Core', 'rare');
});
await page.mouse.move(420, 40);
await page.waitForTimeout(800);
await shot('toasts');
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
process.exit(0);
