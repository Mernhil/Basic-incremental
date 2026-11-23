// Screenshots the dungeon fights on their painted backgrounds at four window sizes. Needs the dev
// app running hidden and muted on a profile:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=stagebgs npx electron-vite dev -- --remote-debugging-port=9477 --mute-audio`, then
// `node scripts/shoot-stage-bgs.mjs [port] [outDir] [dungeon,dungeon,...]`. It replaces that profile's save.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9477';
const out = process.argv[3] ?? 'design/options/stage-bgs/built';
const dungeons = (process.argv[4] ?? 'mossy_cellar,frostspire_vault,void_hollow').split(',');
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell', { state: 'attached' });
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => {
    m.muted = true;
  }),
);

const setup = async (dungeon, floor) => {
  await page.evaluate(
    async ({ data, game, dev, dungeon, floor }) => {
      const d = await import(data);
      const g = await import(game);
      const cheats = await import(dev);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      s.activeDungeonId = dungeon;
      s.starter.done = true;
      for (const dg of content.dungeons) s.clearedDungeons.push(dg.id);
      const placed = cheats.devSetFloor(s, content, dungeon, floor);
      if (placed.ok) s = placed.state;
      s.combat.floors[dungeon].autoChallenge = false;
      const team = ['quarry_smasher', 'ember_squire', 'hedge_acolyte', 'hex_warlock'];
      for (const id of team) s.cards.owned[id] ??= g.newOwnedCard();
      for (const owned of Object.values(s.cards.owned)) owned.level = 18;
      s.cards.loadouts.fighting.slots = [...team];
      s = g.checkAchievements(s, content).state;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    {
      data: fsUrl('src/data/index.ts'),
      game: fsUrl('src/game/index.ts'),
      dev: fsUrl('src/game/dev.ts'),
      dungeon,
      floor,
    },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell', { state: 'attached' });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};
const cdp = await page.context().newCDPSession(page);
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
const sizes = [
  [1274, 815],
  [1280, 720],
  [1600, 900],
  [1920, 1080],
];
for (const dg of dungeons) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await setup(dg, 4);
  await page.evaluate(() => document.querySelector('[data-open="hub"]')?.click());
  await page.waitForTimeout(800);
  const opened = await page.evaluate(() => {
    const b = document.querySelector('[data-building="dungeon_arch"]');
    b?.click();
    return Boolean(b);
  });
  if (!opened) console.log('no dungeon building found');
  await page.waitForTimeout(1500);
  for (const [w, h] of sizes) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() =>
      document.querySelectorAll('audio,video').forEach((m) => {
        m.muted = true;
      }),
    );
    await shot(`${out}/${dg}-${w}x${h}.png`);
  }
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
