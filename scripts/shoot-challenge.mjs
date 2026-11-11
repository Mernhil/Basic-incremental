// Screenshots a Challenge (DESIGN.md §6 Farming and Challenge) in the Dungeons arena: the timer
// while it runs, the drawer's Challenge button and auto-challenge switch, then the Victory banner.
// It replaces the dev save, so use a profile:
// `BI_PROFILE=tu2 npx electron-vite dev -- --remote-debugging-port=9412`, then
// `node scripts/shoot-challenge.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9412';
const out = process.argv[3] ?? 'design/shots/challenge';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/[\\]/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// The Mossy Cellar farming floor 3, auto-challenge off, the starter card a little levelled.
await page.evaluate(
  async ({ data, game, dev }) => {
    const d = await import(data);
    const g = await import(game);
    const cheats = await import(dev);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.activeDungeonId = 'mossy_cellar';
    const placed = cheats.devSetFloor(s, content, 'mossy_cellar', 3);
    if (placed.ok) s = placed.state;
    s.combat.floors['mossy_cellar'].autoChallenge = false;
    for (const owned of Object.values(s.cards.owned)) owned.level = 15;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  {
    data: fsUrl('src/data/index.ts'),
    game: fsUrl('src/game/index.ts'),
    dev: fsUrl('src/game/dev.ts'),
  },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button, .wb button')?.click());
await page.click('[data-open="dungeon"]');
await page.waitForSelector('[data-key="arena-challenge"]');
await page.setViewportSize({ width: 1280, height: 720 }).catch(() => undefined);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/farming-1280x720.png` });
// Start the Challenge from the arena and catch its timer running.
await page.click('[data-key="arena-challenge"]');
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/challenge-1280x720.png` });
// The banner when it ends.
await page.waitForSelector('.ar__verdict:not([hidden])', { timeout: 70_000 });
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/verdict-1280x720.png` });
// The drawer: the Challenge button and the auto-challenge switch.
await page.click('.dp-handle');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/challenge-drawer-1280x720.png` });
console.log('errors', errors);
await browser.close();
