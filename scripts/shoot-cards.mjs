// Screenshots the Cards page in the running dev app with a demo collection (several tiers, a card
// ready to tier up, a few not found). It replaces the dev save of the profile you run it against.
// Start: `BI_PROFILE=cards npx electron-vite dev -- --remote-debugging-port=9402`, then
// `node scripts/shoot-cards.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9402';
const out = process.argv[3] ?? 'design/shots/cards';
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
    own('core_titan', { tier: 'gold', stars: 6, level: 115, starFill: 3 });
    own('moonwood_dryad', { tier: 'silver', stars: 6, level: 110 });
    own('dawnblade_regent', { tier: 'silver', stars: 6, level: 90 });
    own('storm_duelist', { tier: 'bronze', stars: 4, level: 50 });
    own('grove_keeper', { tier: 'bronze', stars: 2, level: 30 });
    own('ember_squire', { tier: 'wood', stars: 3, level: 12, starFill: 2 });
    own('apprentice_feller', { tier: 'bronze', stars: 1, level: 20 });
    own('cave_digger', { tier: 'wood', stars: 1, level: 14 });
    s.cards.loadouts.fighting.main = 'ember_squire';
    s.cards.loadouts.fighting.supports = ['storm_duelist'];
    s.cards.loadouts.mining.main = 'cave_digger';
    s.cards.shards = 87;
    s.resources['money'] = new g.Decimal(18000);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('.shell-rail__item[data-page="cards"]');
// the demo save unlocks achievements: their toasts would cover the detail panel
await page.addStyleTag({ content: '.st-toast, .st-toasts { display: none !important; }' });
await page.waitForSelector('.cp-tile');
for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(600);
  await page.click('[data-key="tile-ember_squire"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/cards-${w}.png` });
}
await page.setViewportSize({ width: 1280, height: 720 });
// a card still levelling, one ready to tier up, a Fighting filter and a card not found yet
for (const id of ['apprentice_feller', 'dawnblade_regent', 'storm_duelist']) {
  await page.click(`[data-key="tile-${id}"]`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/cards-${id}.png` });
}
await page.locator('.cp-tile:has(.cp-fit--locked)').first().click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/cards-locked.png` });
await page.click('#cards-tab-loadouts');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/loadouts-1280.png` });
console.log('shot');
await browser.close();
