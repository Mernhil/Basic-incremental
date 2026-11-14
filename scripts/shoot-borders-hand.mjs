// Screenshots the dungeon hand with batch borders (DESIGN.md §5 The base frame): a Leviathan main, a
// Dragon card and two Heirlooms. It replaces the dev save, so use a profile:
// `BI_PROFILE=frames npx electron-vite dev -- --remote-debugging-port=9402`, then
// `node scripts/shoot-borders-hand.mjs [port] [outDir] [width]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9402';
const out = process.argv[3] ?? 'design/shots/borders';
const width = Number(process.argv[4] ?? 1400);
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width, height: Math.round(width * 0.5625) }).catch(() => undefined);
await page.waitForSelector('.shell');

await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.clearedDungeons = ['mossy_cellar'];
    const ids = ['pearl_duelist', 'storm_duelist', 'solaris', 'auroratusk'];
    const base = Object.values(s.cards.owned)[0];
    for (const id of ids)
      s.cards.owned[id] = {
        ...base,
        tier: id === 'storm_duelist' ? 'gold' : id === 'pearl_duelist' ? 'mythic' : 'heirloom',
      };
    s.cards.loadouts.fighting = { main: ids[0], supports: ids.slice(1) };
    const r = g.setActiveDungeon(s, content, 'mossy_cellar');
    if (r.ok) s = r.state;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="dungeon"]');
await page.waitForSelector('.du-hand .du-card .bi-card');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/hand.png` });
await browser.close();
