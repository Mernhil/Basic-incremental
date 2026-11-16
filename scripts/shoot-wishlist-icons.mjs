// Screenshots the Summon Wishlist at three window sizes for a before/after comparison.
// Start: `BI_HIDDEN_WINDOW=1 BI_PROFILE=wishicons npx electron-vite dev -- --remote-debugging-port=9431 --mute-audio`
// then `node scripts/shoot-wishlist-icons.mjs <port> <outDir> <prefix>`. It replaces the profile's save.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9431';
const out = process.argv[3] ?? 'design/options/wishlist-icons';
const prefix = process.argv[4] ?? 'after';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    const marked = {};
    content.cards.forEach((c, i) => {
      if (c.heirloom) return;
      if (i % 2 === 0) s.cards.owned[c.id] = { ...g.newOwnedCard() };
      const n = (marked[c.rarity] ??= []);
      if (c.rarity !== 'common' && c.rarity !== 'rare' && n.length < 2 && i % 3 === 0) {
        n.push(c.id);
      }
    });
    s.cards.wishlist = Object.values(marked).flat();
    s.resources['summon_scroll'] = new g.Decimal(1000);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toast, .st-toasts { display: none !important; }' });
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)),
);
await page.setViewportSize({ width: 1920, height: 1010 });
if (process.env.WISH_CSS) await page.addStyleTag({ content: process.env.WISH_CSS });
await page.click('[data-open="summon"]');
await page.waitForSelector('.sm-wish:not([hidden])');
for (const [w, h] of [
  [1920, 1010],
  [1284, 814],
  [1280, 720],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${prefix}-${w}x${h}.png` });
}
await page.setViewportSize({ width: 1920, height: 1010 });
await page.waitForTimeout(500);
const row = page.locator('.sm-wish__row[data-rarity="legendary"]');
await row.screenshot({ path: `${out}/${prefix}-row-zoom.png` });
const card = page.locator('.sm-wish__row[data-rarity="legendary"] .sm-wish__card').nth(2);
await card.hover();
await page.waitForTimeout(200);
await page.locator('.sm-wish').screenshot({ path: `${out}/${prefix}-hover.png` });
console.log(await page.evaluate(() => document.querySelector('.sm-wish__read')?.textContent));
await browser.close();
