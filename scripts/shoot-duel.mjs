// Screenshots the card duel's rules in today's arena (DESIGN.md §6 card duel): a team of four
// (a sword, a hammer that guards, a healing staff and a debuffing staff), each with its own health
// under the party health, one card already hurt. It replaces the dev save, so use a profile:
// `BI_PROFILE=duel npx electron-vite dev -- --remote-debugging-port=9413`, then
// `node scripts/shoot-duel.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9413';
const out = process.argv[3] ?? 'design/shots/duel';
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

await page.evaluate(
  async ({ data, game, dev }) => {
    const d = await import(data);
    const g = await import(game);
    const cheats = await import(dev);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.activeDungeonId = 'ember_crypt';
    s.clearedDungeons.push('mossy_cellar');
    const placed = cheats.devSetFloor(s, content, 'ember_crypt', 4);
    if (placed.ok) s = placed.state;
    s.combat.floors['ember_crypt'].autoChallenge = false;
    const team = ['ember_squire', 'quarry_smasher', 'hedge_acolyte', 'hex_warlock'];
    for (const id of team) s.cards.owned[id] ??= g.newOwnedCard();
    for (const owned of Object.values(s.cards.owned)) owned.level = 18;
    s.cards.loadouts.fighting = { main: team[0], supports: team.slice(1) };
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
await page.waitForSelector('.ar__team');
await page.setViewportSize({ width: 1280, height: 720 }).catch(() => undefined);
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/duel-1280x720.png` });
await page.waitForTimeout(12000);
await page.screenshot({ path: `${out}/duel-later-1280x720.png` });
console.log('errors', errors);
await browser.close();
