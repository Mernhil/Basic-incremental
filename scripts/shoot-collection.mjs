// Screenshots package 9c's views (Cards: collection, loadouts, bonds, expeditions; Summon: both
// portals, wishlist, a x10 reveal mid-show; Wardrobe: both tabs) at 1280 x 720 CSS px, at 100% and
// 150%, from the 0.6.0 fixture save with some scrolls added. It replaces the dev save, so use a profile:
// `BI_PROFILE=9c npx electron-vite dev -- --remote-debugging-port=9422`, then
// `SAVE=<save text file> node scripts/shoot-collection.mjs [port] [outDir]` (SAVE defaults to the fixture).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9422';
const out = process.argv[3] ?? 'design/options/ui-layouts-built/9c';
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

const save = readFileSync(process.env.SAVE ?? 'tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8');
await page.evaluate(async (text) => window.api.writeSave(text), save);

const cdp = await page.context().newCDPSession(page);
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
};
const click = async (sel, wait = 500) => {
  const el = await page.$(sel);
  if (!el) {
    console.log('missing', sel);
    return false;
  }
  await el.click().catch((e) => console.log('click failed', sel, String(e).slice(0, 80)));
  await page.waitForTimeout(wait);
  return true;
};
const text = async (sel, t, wait = 600) => {
  const el = page.locator(sel, { hasText: t }).first();
  if ((await el.count()) === 0) {
    console.log('missing', sel, t);
    return false;
  }
  await el.click().catch(() => console.log('click failed', sel, t));
  await page.waitForTimeout(wait);
  return true;
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
  await page.waitForTimeout(1500);
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2500);
  const tag = scale === 1 ? '100' : '150';

  // Cards
  await click('[data-open="cards"]', 1400);
  await shot(`cards-collection-${tag}`);
  await text('.cp-tab', 'Loadouts');
  await shot(`cards-loadouts-${tag}`);
  await page.evaluate(() =>
    document.querySelector('.vh-view:not([hidden]) .vh-body')?.scrollTo(0, 99999),
  );
  await page.waitForTimeout(300);
  await shot(`cards-teams-${tag}`);
  await page.evaluate(() =>
    document.querySelector('.vh-view:not([hidden]) .vh-body')?.scrollTo(0, 0),
  );
  await click('.cp-empty', 500);
  await shot(`cards-loadouts-pick-${tag}`);
  await text('.cp-tab', 'Bonds');
  await shot(`cards-bonds-${tag}`);
  await text('.cp-tab', 'Expeditions');
  await shot(`cards-expeditions-${tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Summon
  await click('[data-open="summon"]', 1400);
  await shot(`summon-portals-${tag}`);
  await page.evaluate(() =>
    document.querySelector('.vh-view:not([hidden]) .vh-body')?.scrollTo(0, 99999),
  );
  await page.waitForTimeout(300);
  await shot(`summon-wishlist-${tag}`);
  await page.evaluate(() =>
    document.querySelector('.vh-view:not([hidden]) .vh-body')?.scrollTo(0, 0),
  );
  if (await click('.sm-deck--left .sm-pull--ten', 2200)) {
    await shot(`summon-reveal-dealt-${tag}`);
    for (let i = 0; i < 4; i++) {
      await page.click('.rv__row').catch(() => {});
      await page.waitForTimeout(800);
    }
    await shot(`summon-reveal-${tag}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Wardrobe
  await click('[data-open="wardrobe"]', 1400);
  await shot(`wardrobe-inventory-${tag}`);
  await text('button', 'Weapon skins');
  await shot(`wardrobe-skins-${tag}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
