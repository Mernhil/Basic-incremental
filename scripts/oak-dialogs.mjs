// Screenshots and sweeps the dialogs under a table: Welcome back, the reveal show and the import confirm.
// node scripts/oak-dialogs.mjs <outDir> [port] [default|oak|plum] [width] [height]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { sweep } from './lib/contrast.mjs';

const out = process.argv[2] ?? 'scratch-shots';
const port = process.argv[3] ?? '9492';
const table = process.argv[4] ?? 'default';
const w = Number(process.argv[5] ?? 1920);
const h = Number(process.argv[6] ?? 1010);
mkdirSync(out, { recursive: true });
const fs = (p) => '/@fs/' + resolve(p).split(String.fromCharCode(92)).join('/');
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
const mute = () =>
  page.evaluate(() => document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)));
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${table}-${name}-${w}.png`, Buffer.from(data, 'base64'));
  const r = await sweep(page);
  const bad = r.bad.filter((b) => !/bi-card__name|bi-info|dev-toggle/.test(b.cls));
  console.log(name, r.total, 'text,', bad.length, 'under AA');
  for (const b of bad.slice(0, 8)) console.log('  ', b.r, b.fg, 'on', b.bg, b.text, '|', b.chain);
};
// the app reads the newest of its save and backup, so the dialog is shown from a simulated absence
await page.waitForSelector('.tbl-pile', { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const { showWelcomeBack } = await import('/src/stage/welcome.ts');
    const content = d.loadContent();
    const state = g.createInitialState(content);
    state.clearedDungeons.push('mossy_cellar');
    state.production.unlockedTrees = ['oak'];
    state.production.treeLevels = { oak: 28 };
    const now = Date.now();
    const r = g.simulateOffline(state, content, now - 3 * 3600 * 1000, now, g.defaultRng);
    showWelcomeBack(r.summary, content, {
      holdCurrency() {},
      currencyGlyph: () => null,
      pulseCurrency() {},
    });
  },
  { data: fs('src/data/index.ts'), game: fs('src/game/index.ts') },
);
await page.waitForSelector('.wb__dialog', { state: 'visible', timeout: 15000 });
await mute();
await page.waitForTimeout(3500);
await shot('welcome');
await page.locator('.wb button').first().click();
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
await page.waitForTimeout(1500);
// the reveal show
await page.click('[data-open="summon"]');
await page.waitForTimeout(1200);
await page.locator('.sm-pull:not(.sm-pull--ten)').first().click();
await page.waitForSelector('.rv__dialog', { state: 'visible', timeout: 15000 });
await page.waitForTimeout(2500);
await mute();
await shot('reveal');
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
// the import confirm
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.click('[data-open="settings"]');
await page.waitForTimeout(1200);
const exported = await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    return g.exportSaveString(g.createInitialState(d.loadContent()), Date.now());
  },
  { data: fs('src/data/index.ts'), game: fs('src/game/index.ts') },
);
await page.locator('textarea').first().fill(exported);
await page.locator('button', { hasText: 'Import save' }).first().click();
await page.waitForSelector('.set-confirm:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(500);
await shot('confirm');
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
process.exit(0);
