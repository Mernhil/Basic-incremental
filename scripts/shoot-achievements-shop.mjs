// Screenshots Achievements and the Shop (UI_RULES.md §2) with a seeded save: some stickers earned,
// Starlight and shards to spend, a Starlight line at max, an Ascension ready. It replaces the dev
// save, so use a profile:
// `BI_PROFILE=rework3c npx electron-vite dev -- --remote-debugging-port=9413`, then
// `node scripts/shoot-achievements-shop.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9413';
const out = process.argv[3] ?? 'design/shots/ui-rework-3';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

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
    content.achievements.slice(0, 12).forEach((a, i) => {
      if (i % 3 !== 2) s.achievements[a.id] = 3600000 * (i + 1);
    });
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
// the unlock toasts of the seeded stickers would cover the page
const clearToasts = () =>
  page.evaluate(() => document.querySelectorAll('.st-toast').forEach((t) => t.remove()));

for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h }).catch(() => undefined);
  await page.click('.shell-rail__item[data-page="achievements"]');
  await page.waitForSelector('.ac-cover');
  await page.waitForTimeout(1500);
  await clearToasts();
  await page.mouse.move(640, 5);
  await page.screenshot({ path: `${out}/achievements-${w}x${h}.png` });
  await page.click('.shell-rail__item[data-page="shop"]');
  await page.waitForSelector('.shop-table');
  await page.waitForTimeout(1500);
  await clearToasts();
  await page.screenshot({ path: `${out}/shop-${w}x${h}.png` });
}
// buy a Starlight level: the BOUGHT stamp slams on; then the confirm step
await page.click('.shop-stall--starlight .shop-it:first-child .shop-price');
await page.waitForTimeout(280);
await page.screenshot({ path: `${out}/shop-bought.png` });
// keyboard focus on a price chip
await page.focus('.shop-stall--starlight .shop-it:nth-child(2) .shop-price');
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
await page.screenshot({ path: `${out}/shop-focus.png` });
await page.waitForTimeout(1300);
await page.click('.shop-ascend');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/shop-confirm.png` });
console.log('errors', errors);
await browser.close();
