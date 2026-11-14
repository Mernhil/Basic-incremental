// Screenshots the card skin picker (Cards panel), the Wardrobe "Weapon skins" tab and the loadout in
// the running dev app, at 1920x1010 and 1280x720. Replaces the dev save (use a BI_PROFILE).
// Start: `BI_PROFILE=x npx electron-vite dev -- --remote-debugging-port=9333`
// Run: `node scripts/shoot-card-skins.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9333';
const out = process.argv[3] ?? 'design/options/card-skins/built';
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
    const own = (id, tier, stars, level) => {
      s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level };
    };
    own('ember_squire', 'bronze', 2, 30);
    own('brass_vanguard', 'silver', 3, 50);
    own('silver_cavalier', 'gold', 2, 70);
    own('jade_vanguard', 'mythic', 1, 110);
    own('violet_herald', 'mythic', 1, 110);
    s.legacySkins = ['legacy-sword-01'];
    s.cardSkins = {
      ember_squire: 'card:jade_vanguard',
      brass_vanguard: 'card:violet_herald',
      silver_cavalier: 'legacy-sword-01',
    };
    s.cards.loadouts.fighting = {
      main: 'ember_squire',
      supports: ['brass_vanguard', 'silver_cavalier', null],
    };
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });

for (const [w, h] of [
  [1920, 1010],
  [1280, 720],
]) {
  await page.setViewportSize({ width: w, height: h });
  const tag = `${w}x${h}`;
  // the dungeon view: the loadout cards with their skins
  await page.click('[data-open="dungeons"]').catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/loadout-${tag}.png` });
  // the card panel with the picker open
  await page.click('[data-open="cards"]');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.shell-page--cards [data-card-id], .cp-tile')];
    const t = tiles.find((x) => /Ember Squire/.test(x.textContent ?? ''));
    (t?.querySelector('button') ?? t)?.click?.();
  });
  await page.waitForTimeout(600);
  const toggle = page.locator('[data-key="skins-toggle"]');
  if ((await toggle.count()) === 0) throw new Error('no skin toggle; select the card first');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.waitForTimeout(600);
  await page.locator('.cp-skins').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/card-panel-picker-${tag}.png` });
  // the Wardrobe tab
  await page.locator('.vh-back:visible').first().click();
  await page.waitForTimeout(800);
  await page.click('[data-open="wardrobe"]');
  await page.click('[data-key="filter-skins"]');
  await page.waitForSelector('.ws-card .bi-card');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/wardrobe-weapon-skins-${tag}.png` });
  await page.locator('.vh-back:visible').first().click();
  await page.waitForTimeout(800);
}
await browser.close();
