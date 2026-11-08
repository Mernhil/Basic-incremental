// Screenshots the Wardrobe "Weapon skins" test tab and a card wearing a skin in the running dev app.
// Replaces the dev save (use a BI_PROFILE). Start: `BI_PROFILE=x npx electron-vite dev -- --remote-debugging-port=9333`
// Run: `node scripts/shoot-weapon-skins.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9333';
const out = process.argv[3] ?? 'design/app-screens/weapon-skins';
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined);
await page.waitForSelector('.shell');
const owned = process.argv[5] !== 'fresh';
await page.evaluate(
  async ({ data, game, owned }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    if (owned) {
      s.cards.owned['reaper_test'] = { ...g.newOwnedCard(), tier: 'unique', stars: 6, level: 40 };
      s.cards.loadouts.fighting.main = 'reaper_test';
    }
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), owned },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('.shell-rail__item[data-page="wardrobe"]');
await page.click('[data-key="tab-skins"]');
await page.waitForSelector('.ws-card .bi-card');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/tab-original${owned ? '' : '-fresh'}.png` });
if (owned) {
  await page.click('[data-key="skin-skin-04"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/tab-preview-04.png` });
  await page.click('[data-key="apply"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/tab-applied-04.png` });
  await page.click('[data-key="skin-skin-09"]');
  await page.click('[data-key="apply"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/tab-applied-09.png` });
  await page.locator('.ws-card').screenshot({ path: `${out}/card-skin-09.png` });
  for (const id of ['cards', 'production']) {
    await page.click(`.shell-rail__item[data-page="${id}"]`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${id}-skin-09.png` });
  }
}
await browser.close();
