// Opens every pile view of the table under a table (oak or plum), screenshots it and sweeps its contrast.
// Start the game hidden and muted on its own profile:
//   BI_HIDDEN_WINDOW=1 BI_PROFILE=oakbuild npx electron-vite dev -- --remote-debugging-port=9492 --mute-audio
// then: node scripts/oak-tour.mjs <outDir> [port] [default|oak|plum] [width] [height] [view,view...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { sweep } from './lib/contrast.mjs';

const out = process.argv[2] ?? 'scratch-shots';
const port = process.argv[3] ?? '9492';
const table = process.argv[4] ?? 'oak';
const w = Number(process.argv[5] ?? 1920);
const h = Number(process.argv[6] ?? 1010);
const only = process.argv[7]?.split(',');
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
await page.waitForSelector('.tbl-pile', { timeout: 60000 });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: w,
  height: h,
  deviceScaleFactor: 1,
  mobile: false,
});
const mute = () =>
  page.evaluate(() => document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)));
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${table}-${name}-${w}.png`, Buffer.from(data, 'base64'));
};
const ids = await page.$$eval('[data-open]', (els) => [
  ...new Set(els.map((e) => e.getAttribute('data-open'))),
]);
const closeView = async () => {
  for (let i = 0; i < 5; i++) {
    const inert = await page.evaluate(
      () => !!document.querySelector('[data-open]')?.closest('[inert]'),
    );
    if (!inert) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
};
await mute();
await page.mouse.move(w * 0.33, 30);
await shot('table');
const report = {};
for (const id of ids) {
  if (only && !only.includes(id)) continue;
  await closeView();
  await page.click(`[data-open="${id}"]`);
  await page.waitForTimeout(1500);
  await mute();
  await page.mouse.move(w * 0.5, 4);
  await page.waitForTimeout(300);
  await shot(id);
  const r = await sweep(page);
  report[id] = r.bad.filter((b) => !/bi-card__name|bi-info/.test(b.cls));
  console.log(id, r.total, 'text,', report[id].length, 'under AA');
  const seen = new Set();
  for (const b of report[id]) {
    const k = b.cls || b.chain;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log('  ', b.r, b.fg, 'on', b.bg, b.text, '|', b.chain);
  }
}
await closeView();
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
process.exit(0);
