// Screenshots the Cards page (new tier names) and the Wardrobe "Weapon skins" tab (legacy skins) in
// the running dev app. Replaces the dev save (use a BI_PROFILE).
// Start: `BI_PROFILE=x npx electron-vite dev -- --remote-debugging-port=9333`
// Run: `node scripts/shoot-weapon-skins.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9333';
const out = process.argv[3] ?? 'design/app-screens/weapon-base';
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined);
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
    own('storm_duelist', 'silver', 3, 50);
    own('dawnblade_regent', 'prismatic', 2, 90);
    own('moonwood_dryad', 'mythic', 1, 110);
    own('core_titan', 'mythic', 4, 115);
    own('grove_keeper', 'bronze', 1, 30);
    s.legacySkins = ['legacy-sword-01', 'legacy-scythe-01', 'legacy-scythe-02', 'legacy-bow-56'];
    s.weaponSkins = { sword: 'legacy-sword-01' };
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.click('[data-open="cards"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/cards.png` });
await page.click('[data-open="wardrobe"]');
await page.click('[data-key="tab-skins"]');
await page.waitForSelector('.ws-card .bi-card');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/wardrobe-weapon-skins.png` });
await browser.close();
