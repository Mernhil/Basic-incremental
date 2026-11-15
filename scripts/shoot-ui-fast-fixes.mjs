// Screenshots and measures the Dungeon view's hand against the bottom edge, the Dungeons / Weapon /
// Training buttons and the Dev button, with 1 to 4 cards, at three window sizes. It replaces the
// dev save, so use a profile: `BI_PROFILE=fastfix BI_DEV_BUILD=1 npx electron-vite dev --
// --remote-debugging-port=9431 --mute-audio`, then
// `node scripts/shoot-ui-fast-fixes.mjs <before|after> [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const label = process.argv[2] ?? 'after';
const port = process.argv[3] ?? '9431';
const out = process.argv[4] ?? 'design/options/ui-fast-fixes';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell');
const cdp = await page.context().newCDPSession(page);
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};

const setup = async (count) => {
  await page.evaluate(
    async ({ data, game, dev, count }) => {
      const d = await import(data);
      const g = await import(game);
      const cheats = await import(dev);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      s.activeDungeonId = 'mossy_cellar';
      const placed = cheats.devSetFloor(s, content, 'mossy_cellar', 6);
      if (placed.ok) s = placed.state;
      s.combat.floors.mossy_cellar.autoChallenge = false;
      const team = ['quarry_smasher', 'ember_squire', 'hedge_acolyte', 'hex_warlock'].slice(
        0,
        count,
      );
      for (const id of team) s.cards.owned[id] ??= g.newOwnedCard();
      for (const o of Object.values(s.cards.owned)) o.level = 10;
      s.cards.loadouts.fighting = { main: team[0], supports: team.slice(1) };
      s = g.checkAchievements(s, content).state;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    {
      data: fsUrl('src/data/index.ts'),
      game: fsUrl('src/game/index.ts'),
      dev: fsUrl('src/game/dev.ts'),
      count,
    },
  );
  await page.reload();
  await page.waitForSelector('.tbl-pile');
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};

const sizes = [
  [1284, 814],
  [1280, 720],
  [1920, 1010],
  [1024, 640],
];
const rows = [];
for (const count of [1, 2, 3, 4]) {
  for (const [w, h] of sizes) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await setup(count);
    await page.click('[data-open="dungeon"]');
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const r = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return {
          l: Math.round(b.left),
          t: Math.round(b.top),
          r: Math.round(b.right),
          b: Math.round(b.bottom),
        };
      };
      const cards = [...document.querySelectorAll('.du-card')].map(r);
      return {
        vh: innerHeight,
        hand: r(document.querySelector('.du-hand')),
        cardsBottom: Math.max(...cards.map((c) => c.b)),
        cardsLeft: Math.min(...cards.map((c) => c.l)),
        cardsRight: Math.max(...cards.map((c) => c.r)),
        buttons: r(document.querySelector('.dv-buttons')),
        dev: r(document.querySelector('.dev-toggle')),
        foe: r(document.querySelector('.du-foe')),
      };
    });
    const hit = (b) =>
      b && m.cardsRight > b.l && m.cardsLeft < b.r && m.cardsBottom > b.t && m.hand.t < b.b;
    const hitsButtons = hit(m.buttons) || hit(m.dev);
    rows.push({
      count,
      size: `${w}x${h}`,
      gapToEdge: m.vh - m.cardsBottom,
      hitsButtons: !!hitsButtons,
      ...m,
    });
    if ((count === 1 || count === 4) && w !== 1024)
      await shot(`${out}/dungeon-${label}-${w}x${h}-${count}card${count > 1 ? 's' : ''}.png`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
writeFileSync(`${out}/measure-${label}.json`, JSON.stringify(rows, null, 1));
for (const r of rows)
  console.log(
    r.count,
    r.size,
    'gap',
    r.gapToEdge,
    'hitsButtons',
    r.hitsButtons,
    'foe',
    JSON.stringify(r.foe),
    'hand',
    JSON.stringify(r.hand),
  );
await browser.close();
