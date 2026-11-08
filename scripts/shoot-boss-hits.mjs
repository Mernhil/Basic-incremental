// Screenshots the boss-hit visuals (DESIGN.md §6, screen edge pulse) in the running dev app: the
// wind-up pulse, the slam flash, a light hit's chunk drop and the "You fall in" banner. It
// replaces the dev save, so use a profile:
// `BI_PROFILE=uiboss npx electron-vite dev -- --remote-debugging-port=9411`, then
// `node scripts/shoot-boss-hits.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9411';
const out = process.argv[3] ?? 'design/boss-hits';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1240, height: 900 }).catch(() => undefined);
await page.waitForSelector('.shell');

/** Writes a save fighting `dungeon` with the play-time clock at `playMs`, then reloads. */
async function setup(dungeon, playMs, { strong = false } = {}) {
  await page.evaluate(
    async ({ data, game, dungeon, playMs, strong }) => {
      const d = await import(data);
      const g = await import(game);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      s.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
      if (strong) {
        for (const id of Object.keys(s.cards.owned)) {
          const c = s.cards.owned[id];
          c.tier = 'gold';
          c.stars = 3;
          c.level = 60;
        }
      }
      const r = g.setActiveDungeon(s, content, dungeon);
      if (r.ok) s = r.state;
      s.stats.playTimeMs = playMs;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), dungeon, playMs, strong },
  );
  await page.reload();
  await page.waitForSelector('.shell');
  await page.evaluate(() => document.querySelector('.away button')?.click());
  await page.click('.shell-rail__item[data-page="dungeons"]');
}

const state = () =>
  page.evaluate(() => ({
    edge: document.querySelector('.ar__edge')?.style.opacity,
    banner: document.querySelector('.ar__fall:not([hidden])')?.textContent ?? null,
    chunks: document.querySelectorAll('.ar-chunk').length,
  }));

async function burst(name, count, every) {
  for (let i = 0; i < count; i++) {
    const t0 = Date.now();
    const info = await state();
    await page.screenshot({ path: `${out}/${name}-${i}.png` });
    // the health bar up close, where the chunk drops
    const box = await page.locator('.ar__health').boundingBox();
    if (box) {
      await page.screenshot({
        path: `${out}/${name}-${i}-bar.png`,
        clip: { x: box.x, y: box.y - 4, width: box.width, height: box.height + 50 },
      });
    }
    console.log(name, i, JSON.stringify(info));
    const wait = every - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
  }
}

// Root Warden: slam is attack 6, at 60 s of play time (a hit every 10 s)
await setup('mossy_cellar', 56800);
await page.waitForTimeout(600);
await burst('rw-slam', 14, 300);
// the instant the slam lands: the flash is on, the chunk is still pale on the bar
await setup('mossy_cellar', 57800);
await page.waitForSelector('.ar__slam-flash.is-hit', { state: 'attached', timeout: 8000 });
await page.screenshot({ path: `${out}/rw-slam-flash.png` });
// a light hit and its chunk
await setup('mossy_cellar', 19700);
await page.waitForTimeout(300);
await burst('rw-light', 8, 150);
// Glacier Colossus with a strong loadout: you survive, so the banner stays hidden
await setup('frostspire_vault', 33600, { strong: true });
await page.waitForTimeout(600);
await burst('gc-slam', 12, 300);
await browser.close();
