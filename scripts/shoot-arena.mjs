// Screenshots the Arena (Arena tab, Shop tab, a fight in progress, the season-end chest and frame) and
// a raid shop at 1920 x 1080 and 1280 x 720. Needs the dev app running hidden and muted on a profile:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=arenashots npx electron-vite dev -- --remote-debugging-port=9342 --mute-audio`, then
// `node scripts/shoot-arena.mjs [port] [outDir] [save]`. `save` is a sim save from `arenaCapture.ts`
// (its team is the player's); without it a plain mid-game team is made. It replaces that profile's save,
// uses dev cheats only to open the arena and give coins, and moves the page's clock into season 3.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9342';
const out = process.argv[3] ?? 'shots-010';
const saveFile = process.argv[4];
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell', { state: 'attached' });
const cdp = await page.context().newCDPSession(page);
const metrics = (w, h) =>
  cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
const shot = async (name) => {
  await page.waitForTimeout(400);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('wrote', name);
};

// the page's clock: season 3 of the arena (the second week), so the shop shows four Heirlooms
const SEASON3 = Date.UTC(2026, 10, 23) + 28 * 86400000 + 9 * 86400000;
await page.addInitScript((target) => {
  const real = Date.now.bind(Date);
  const offset = target - real();
  Date.now = () => real() + offset;
}, SEASON3);

const saveText = saveFile
  ? (() => {
      const raw = JSON.parse(readFileSync(saveFile, 'utf8'));
      raw.state.summon.dailyClaimedDay = null; // the sim's clock is not a calendar day
      return JSON.stringify(raw);
    })()
  : null;
await metrics(1920, 1080);
await page.evaluate(
  async ({ data, game, text }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s;
    if (text) s = g.readSave(text, content).state;
    else {
      s = g.createInitialState(content);
      for (const dg of content.dungeons) s.clearedDungeons.push(dg.id);
      const team = ['gilded_knight', 'golden_tilter', 'golden_sharpshot', 'golden_sage'];
      for (const id of team)
        s.cards.owned[id] = {
          ...g.newOwnedCard(content.cardById.get(id).tier),
          level: 70,
          stars: 3,
        };
      s.cards.loadouts.fighting.slots = team;
    }
    s.starter.done = true;
    if (!s.clearedDungeons.includes('frostspire_vault')) s.clearedDungeons.push('frostspire_vault');
    s.prestigeCount = Math.max(1, s.prestigeCount);
    // dev cheats: coins to buy with, a ladder position and a finished season waiting
    s.arena.coins = 1240;
    s.arena.raidCoins = { tide_queen: 860, ember_tyrant: 300 };
    s.arena.season = 2;
    s.arena.points = 1500;
    s.arena.wins = 12;
    s.arena.losses = 5;
    s.arena.raidBest = { tide_queen: 0.55 };
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), text: saveText },
);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.shell', { state: 'attached' });
await page.waitForTimeout(2500);
for (let i = 0; i < 10; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}

// a starter pick that waits (the sim player has cleared dungeons on Nightmare): take the first
const choose = page.getByRole('button', { name: 'Choose', exact: true });
for (let i = 0; i < 3 && (await choose.count()) > 0; i++) {
  await choose
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(800);
}
const open = async (building) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click(`[data-building="${building}"]`, { force: true });
  await page.waitForTimeout(900);
};
const tab = async (key) => {
  await page.click(`[data-key="${key}"]`);
  await page.waitForTimeout(500);
};

for (const [w, h, tag] of [
  [1920, 1080, '1920'],
  [1280, 720, '1280'],
]) {
  await metrics(w, h);
  await page.waitForTimeout(600);
  await open('arena');
  await shot(`arena-tab-${tag}`);
  await tab('arena-shop-tab');
  await shot(`arena-shop-${tag}`);
  if (tag === '1920') {
    await open('raid_gate');
    await tab('raid-shop-tab');
    await tab('raid-shop-tide_queen');
    await shot('raid-shop-tide-1920');
    await tab('raid-tab');
    await shot('raids-1920');
  }
}
// a fight in progress
await metrics(1920, 1080);
await open('arena');
await page.click('[data-key="arena-fight"]');
await page.waitForTimeout(3000);
await shot('arena-fight-1920');
await page.click('[data-key="arena-skip"]').catch(() => {});
await page.waitForTimeout(800);
await shot('arena-fight-result-1920');
// the end of a season: a chest waits, then the frame
await page.keyboard.press('Escape');
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const text = (await window.api.readSave()).primary;
    const s = g.readSave(text, content).state;
    s.arena.chests = [
      { mode: 'arena', season: 1, rank: 'top10', place: 7 },
      { mode: 'raid', season: 1, rank: 'top50', place: 31 },
    ];
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.shell', { state: 'attached' });
await page.waitForTimeout(2500);
await open('arena');
await shot('arena-season-end-1920');
await page.click('[data-key="arena-claim"]');
await page.waitForTimeout(600);
await shot('arena-frame-1920');
console.log('done');
await browser.close();
