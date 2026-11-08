// Screenshots the Shop (Market Stalls) in the running dev app with a demo save: Starlight to
// spend, shards, an Ascension ready. It replaces the dev save of the profile you run it against.
// Start: `BI_PROFILE=shop npx electron-vite dev -- --remote-debugging-port=9444`, then
// `node scripts/shoot-shop.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9444';
const out = process.argv[3] ?? 'design/app-screens/shop';
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1264, height: 1000 }).catch(() => undefined);
await page.waitForSelector('.shell');
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    s.resources['starlight'] = new g.Decimal(23);
    s.cards.shards = 87;
    for (const id of ['dawnblade_regent', 'ember_squire', 'shield_warden'])
      s.cards.owned[id] = { ...g.newOwnedCard(), tier: 'bronze', stars: 1, level: 5 };
    s.cards.loadouts.fighting.main = 'ember_squire';
    s.prestigeCount = 1;
    s.mastery.harvested['oak_gem'] = 6e6 * 1e3;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('.shell-rail__item[data-page="shop"]');
await page.waitForSelector('.shop-table');
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('.shell-page, main')?.scrollTo?.(0, 0));
await page.screenshot({ path: `${out}/shop.png` });
// buy a Starlight level: the BOUGHT stamp slams on
await page.click('.shop-stall--starlight .shop-it:first-child .shop-price');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/shop-bought.png` });
await page.click('.shop-ascend');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/shop-confirm.png` });
console.log('shot');
await browser.close();
