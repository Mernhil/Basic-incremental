// Screenshots the tabs of the Cards view (five) and the Dungeon full view (Dungeons, Weapon, Training).
// node scripts/restyle-tabs.mjs <outDir> [port] [width] [height]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { sweep } from './lib/contrast.mjs';

const out = process.argv[2] ?? 'scratch-shots';
const port = process.argv[3] ?? '9333';
const w = Number(process.argv[4] ?? 1920);
const h = Number(process.argv[5] ?? 1080);
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell', { timeout: 60000 });
await page.evaluate(async (t) => window.api.writeSave(t), readFileSync('tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8'));
await page.evaluate(() => localStorage.removeItem('bi-dev-table'));
await page.reload();
await page.waitForSelector('.tbl-pile', { timeout: 60000 });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
const mute = () => page.evaluate(() => document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)));
const shot = async (name) => {
  await mute();
  await page.mouse.move(w * 0.5, 4);
  await page.waitForTimeout(500);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/default-${name}-${w}.png`, Buffer.from(data, 'base64'));
  const r = await sweep(page);
  const bad = r.bad.filter((b) => !/bi-card__name|bi-info/.test(b.cls));
  console.log(name, r.total, 'text,', bad.length, 'under AA');
  const seen = new Set();
  for (const b of bad) {
    const k = b.cls || b.chain;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log('  ', b.r, b.fg, 'on', b.bg, b.text, '|', b.chain);
  }
};
const back = async () => {
  for (let i = 0; i < 5; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('[data-open]')?.closest('[inert]')))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
};
const tabs = async (view, label, names) => {
  await back();
  await page.click(`[data-open="${view}"]`);
  await page.waitForTimeout(1500);
  for (const n of names) {
    const el = page.locator('button', { hasText: new RegExp(`^${n}`) }).first();
    if ((await el.count()) === 0) { console.log('no tab', n); continue; }
    await el.click();
    await page.waitForTimeout(900);
    await shot(`${label}-${n.toLowerCase()}`);
  }
};
await tabs('cards', 'cards', ['Collection', 'Heirlooms', 'Loadouts', 'Bonds', 'Expeditions']);
await tabs('dungeon', 'dungeon', ['Dungeons', 'Weapon', 'Training']);
await back();
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
process.exit(0);
