// Screenshots the dungeon fight, the dungeon map, the hub and the forge at several window sizes, to
// show the whole UI scaling with the window (ui/designScale.ts). Needs the dev app running hidden and
// muted on a profile:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=uiscale npx electron-vite dev -- --remote-debugging-port=9488 --mute-audio`, then
// `node scripts/shoot-ui-scale.mjs [port] [outDir]`. It replaces that profile's save.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9488';
const out = process.argv[3] ?? 'design/options/ui-scale';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell', { state: 'attached' });
const mute = () =>
  page.evaluate(() => document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)));
await mute();
const cdp = await page.context().newCDPSession(page);
const metrics = (w, h) =>
  cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};

await metrics(1280, 720);
await page.evaluate(
  async ({ data, game, dev }) => {
    const d = await import(data);
    const g = await import(game);
    const cheats = await import(dev);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.activeDungeonId = 'ember_crypt';
    s.starter.done = true;
    for (const dg of content.dungeons) s.clearedDungeons.push(dg.id);
    const placed = cheats.devSetFloor(s, content, 'ember_crypt', 4);
    if (placed.ok) s = placed.state;
    s.combat.floors['ember_crypt'].autoChallenge = false;
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

const sizes = (process.env.SIZES ?? '1274x815,1280x720,1600x900,1920x1080,1500x1000')
  .split(',')
  .map((s) => s.split('x').map(Number));
const settle = async () => {
  await page.waitForTimeout(1200);
  await mute();
  await page
    .waitForFunction(
      () => {
        const f = document.querySelector('.du-foe');
        return !f || (f.getAnimations().length === 0 && !f.closest('[hidden]'));
      },
      null,
      { timeout: 6000, polling: 50 },
    )
    .catch(() => undefined);
};
const info = () =>
  page.evaluate(() => ({
    inner: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    header: Math.round(
      document.querySelector('.shell-header')?.getBoundingClientRect().top ?? -999,
    ),
    scroll: [document.scrollingElement?.scrollTop, document.querySelector('.shell')?.scrollTop],
  }));

const screens = [
  ['hub', async () => page.evaluate(() => document.querySelector('[data-open="hub"]')?.click())],
  [
    'dungeon-fight',
    async () => {
      await page.evaluate(() => document.querySelector('[data-open="hub"]')?.click());
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector('[data-building="dungeon_arch"]')?.click());
    },
  ],
  [
    'dungeon-map',
    async () => page.evaluate(() => document.querySelector('[data-key="panel-dungeons"]')?.click()),
  ],
  [
    'forge',
    async () => {
      await page.evaluate(() =>
        document.querySelector('[data-key="panel-dungeons"][aria-expanded="true"]')?.click(),
      );
      await page.evaluate(() => document.querySelector('[data-open="hub"]')?.click());
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector('[data-building="forge"]')?.click());
    },
  ],
];
for (const [name, go] of screens) {
  await metrics(1280, 720);
  await go();
  for (const [w, h] of sizes) {
    await metrics(w, h);
    await settle();
    console.log(name, w, h, JSON.stringify(await info()));
    await shot(`${out}/${name}-${w}x${h}.png`);
  }
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
