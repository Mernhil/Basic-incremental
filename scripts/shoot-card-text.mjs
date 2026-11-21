// Screenshots the kit cards' text layout at 1280x720: the collection grid (Wood, Silver, Gold, a T6 and
// an Heirloom card), the detail panel of a few cards, the loadout in the dungeon and the Heirlooms tab.
// Replaces the dev save, so use a profile.
// Start: `BI_PROFILE=cardtext npx electron-vite dev -- --remote-debugging-port=9511`
// Run: `node scripts/shoot-card-text.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9511';
const out = process.argv[3] ?? 'design/options/card-text';
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
    own('ember_squire', 'wood', 1, 4);
    own('dawnblade_regent', 'wood', 2, 12);
    own('storm_duelist', 'silver', 3, 30);
    own('brass_vanguard', 'silver', 4, 50);
    own('silver_cavalier', 'gold', 2, 70);
    own('jade_vanguard', 'mythic', 1, 110);
    own('violet_herald', 'mythic', 5, 110);
    own('solaris', 'heirloom', 3, 120);
    own('grimhowl', 'heirloom', 6, 120);
    s.cards.loadouts.fighting = {
      main: 'dawnblade_regent',
      supports: ['storm_duelist', 'solaris', 'jade_vanguard'],
    };
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.setViewportSize({ width: 1280, height: 720 });

const pick = async (name) => {
  await page.evaluate((n) => {
    const tiles = [...document.querySelectorAll('.cp-tile')];
    const t = tiles.find((x) => x.textContent?.includes(n));
    (t?.querySelector('button') ?? t)?.click?.();
  }, name);
  await page.waitForTimeout(700);
};
await page.click('[data-open="dungeons"]').catch(() => undefined);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/loadout.png` });
await page
  .locator('.vh-back:visible')
  .first()
  .click()
  .catch(() => undefined);
await page.waitForTimeout(800);
await page.click('[data-open="cards"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/grid.png` });
for (const [file, name] of [
  ['detail-wood', 'Dawnblade'],
  ['detail-silver', 'Storm Duelist'],
  ['detail-t6', 'Dune Vanguard'],
  ['detail-heirloom', 'Solaris'],
]) {
  await pick(name);
  await page.screenshot({ path: `${out}/${file}.png` });
}
await pick('Dune Vanguard');
await page.evaluate(() => {
  const d = document.querySelector('.cp-detail .frame__body, .cp-detail');
  const sc = [...document.querySelectorAll('.cp-detail, .cp-detail *')].find(
    (e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible',
  );
  (sc ?? d)?.scrollBy(0, 330);
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/detail-scrolled.png` });
await page.getByText('Heirlooms', { exact: true }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/heirlooms.png` });
await browser.close();
