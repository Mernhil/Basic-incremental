// Screenshots the batch base borders (DESIGN.md §5 The base frame) in the running dev app: a Dragon
// card, a Leviathan card and an Heirloom in the Cards view. It replaces the dev save of the profile.
// Start: `BI_PROFILE=frames npx electron-vite dev -- --remote-debugging-port=9402`, then
// `node scripts/shoot-borders.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9402';
const out = process.argv[3] ?? 'design/shots/borders';
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
    own('ember_squire', { tier: 'wood', stars: 3, level: 12 });
    own('storm_duelist', { tier: 'gold', stars: 4, level: 50 });
    own('dawnblade_regent', { tier: 'silver', stars: 6, level: 90 });
    own('pearl_duelist', { tier: 'mythic', stars: 5, level: 100 });
    own('brine_corsair', { tier: 'mythic', stars: 3, level: 60 });
    own('surf_crusader', { tier: 'bronze', stars: 2, level: 20 });
    own('solaris', { tier: 'heirloom', stars: 3, level: 60 });
    own('auroratusk', { tier: 'heirloom', stars: 2, level: 40 });
    s.cards.loadouts.fighting.main = 'pearl_duelist';
    s.cards.loadouts.fighting.supports = ['storm_duelist', 'solaris', 'auroratusk'];
    s.cards.shards = 87;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="cards"]');
await page.addStyleTag({ content: '.st-toast, .st-toasts { display: none !important; }' });
await page.waitForSelector('.cp-tile');
await page.setViewportSize({ width: 1600, height: 900 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/cards.png` });
for (const id of ['storm_duelist', 'pearl_duelist', 'solaris']) {
  const t = page.locator(`[data-key="tile-${id}"]`);
  if (await t.count()) {
    await t.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/cards-${id}.png` });
  } else console.log('no tile', id);
}
// the Heirlooms tab
await page.click('text=Heirlooms >> nth=0').catch(() => undefined);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/heirlooms.png` });
await browser.close();
