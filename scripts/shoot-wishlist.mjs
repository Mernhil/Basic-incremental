// Screenshots the Summon wishlist and a card's enhancements with a locked milestone option in the
// running dev app. It replaces the dev save of the profile you run it against:
// `BI_PROFILE=wishlist npx electron-vite dev -- --remote-debugging-port=9418`, then
// `node scripts/shoot-wishlist.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9418';
const out = process.argv[3] ?? 'design/shots/wishlist';
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
    const own = (id, patch) => (s.cards.owned[id] = { ...g.newOwnedCard(), ...patch });
    own('storm_duelist', { tier: 'bronze', stars: 4, level: 50 });
    own('ember_squire', { tier: 'wood', stars: 3, level: 20 });
    own('dawnblade_regent', { tier: 'gold', stars: 2, level: 50 });
    s.cards.wishlist = ['dawnblade_regent', 'seraph_lancer', 'grave_hammerer'].filter((id) =>
      content.cardById.has(id),
    );
    s.cards.owned['dawnblade_regent'].enhancements = ['edge'];
    s.resources['summon_scroll'] = new g.Decimal(1000);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toast, .st-toasts { display: none !important; }' });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.click('.shell-rail__item[data-page="summon"]');
await page.waitForSelector('.sm-wish:not([hidden])');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/summon-wishlist.png` });
await page.click('.shell-rail__item[data-page="cards"]');
await page.waitForSelector('.cp-tile');
await page.click('[data-key="tile-dawnblade_regent"]');
await page.waitForTimeout(400);
await page.click('[data-key="enh-toggle"]');
await page.locator('#cp-enhance').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/cards-enhancements.png` });
console.log('done');
