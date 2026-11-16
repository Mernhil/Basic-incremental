// Screenshots the Carved Oak table (hidden table item, dev switch) for the PR: the table and the Dungeon
// view with the Weapon panel, at 1920x1010 and 1280x720, optionally at a device scale.
// Start the game hidden and muted on its own profile (it writes that profile's save, never the player's):
//   BI_HIDDEN_WINDOW=1 BI_PROFILE=oak npx electron-vite dev -- --remote-debugging-port=9492 --mute-audio
// then: node scripts/shoot-oak.mjs <outDir> [port] [default|oak|plum] [scale]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'design/options/ui-style-built';
const port = process.argv[3] ?? '9492';
const table = process.argv[4] ?? 'oak';
const scale = Number(process.argv[5] ?? 1);
mkdirSync(out, { recursive: true });
const fs = (p) => '/@fs/' + resolve(p).split(String.fromCharCode(92)).join('/');
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell', { timeout: 60000 });
const mute = () =>
  page.evaluate(() => document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)));
await mute();
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    s.clearedDungeons.push('mossy_cellar');
    s.production.unlockedTrees = ['oak', 'ironbark', 'moonwillow'];
    s.production.treeLevels = { oak: 28, ironbark: 14, moonwillow: 4 };
    s.production.mineLevels = { copper_quarry: 24, iron_deeps: 9 };
    s.resources.money = new g.Decimal(6420);
    const order = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    const fight = content.cards
      .filter((c) => c.job === 'fighting' && order.includes(c.rarity))
      .sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
    const seen = new Set();
    const pick = [];
    for (const c of fight) {
      const k = c.item ?? c.weapon ?? c.id;
      if (seen.has(k)) continue;
      seen.add(k);
      pick.push(c);
      if (pick.length === 4) break;
    }
    const tiers = ['silver', 'gold', 'bronze', 'wood'];
    pick.forEach((c, i) => {
      s.cards.owned[c.id] = {
        tier: tiers[i],
        stars: 2 + i,
        level: 12 + i * 3,
        xp: new g.Decimal(0),
        starFill: 0,
        enhancements: [],
      };
      s.cards.loadouts.fighting.slots[i] = c.id;
    });
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fs('src/data/index.ts'), game: fs('src/game/index.ts') },
);
await page.evaluate(
  (t) =>
    t === 'default'
      ? localStorage.removeItem('bi-dev-table')
      : localStorage.setItem('bi-dev-table', t === 'plum' ? 'gn_table' : 'oak_table'),
  table,
);
await page.reload();
await page.waitForTimeout(5000);
await mute();
const cdp = await page.context().newCDPSession(page);
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
};
const viewOpen = async () =>
  (await page.locator('.vh-back').count()) > 0 &&
  (await page.locator('.vh-back').first().isVisible());
for (const [w, h] of [
  [1920, 1010],
  [1280, 720],
]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await page.waitForTimeout(800);
  if (await page.locator('.wb__collect').count()) {
    await page.click('.wb__collect');
    await page.waitForTimeout(1200);
  }
  for (let i = 0; i < 4 && (await viewOpen()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  await page.mouse.move(w * 0.33, 30);
  await page.waitForTimeout(500);
  await shot(`${table}-table-${w}${scale === 1 ? '' : '@' + scale}`);
  await page.click('.tbl-window .tbl-open');
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    [...document.querySelectorAll('.dv-button')]
      .find((b) => /^Weapon/.test(b.textContent.trim()))
      ?.click(),
  );
  await page.mouse.move(w * 0.33, 30);
  await page.waitForTimeout(1300);
  await shot(`${table}-view-${w}${scale === 1 ? '' : '@' + scale}`);
  console.log('shot', w);
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
for (let i = 0; i < 4 && (await viewOpen()); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
await browser.close();
process.exit(0);
