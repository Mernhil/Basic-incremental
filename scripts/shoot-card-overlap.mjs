// Screenshots the Cards grids with T6 and Heirloom cards at 1280x720: Heirlooms tab and Collection.
// Replaces the dev save, so use a profile.
// Start: `BI_PROFILE=gridov npx electron-vite dev -- --remote-debugging-port=9512`
// Run: `node scripts/shoot-card-overlap.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9512';
const out = process.argv[3] ?? '.';
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
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
    const own = (id, tier, stars, level) => {
      s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level };
    };
    for (const id of ['solaris', 'grimhowl', 'skypiercer', 'auroratusk', 'maelfang', 'pearlrider'])
      own(id, 'heirloom', 3, 120);
    for (const id of [
      'jade_vanguard',
      'violet_herald',
      'moon_reaver',
      'pearl_duelist',
      'brine_corsair',
      'surf_crusader',
      'silver_minnow',
      'reef_assassin',
    ])
      own(id, 'mythic', 2, 110);
    own('ember_squire', 'wood', 1, 4);
    own('storm_duelist', 'silver', 3, 30);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.setViewportSize({ width: 1280, height: 720 });
await page.click('[data-open="cards"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/collection.png` });
await page.getByText('Heirlooms', { exact: true }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/heirlooms.png` });
await browser.close();
