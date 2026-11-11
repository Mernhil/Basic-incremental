// Screenshots Home (UI_RULES.md §2) with a seeded save: a dungeon fight, two unlocked tree kinds,
// one mine cleared, the fighting loadout and a worker on the first tree and mine. It replaces the dev save, so use a profile:
// `BI_PROFILE=rework2home npx electron-vite dev -- --remote-debugging-port=9401`, then
// `node scripts/shoot-home.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9401';
const out = process.argv[3] ?? 'design/shots/ui-rework-2';
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
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.clearedDungeons = ['mossy_cellar'];
    const base = Object.values(s.cards.owned)[0];
    for (const job of ['fighting', 'logging', 'mining']) {
      const cards = content.cards.filter((c) => c.job === job).slice(0, 4);
      for (const c of cards) s.cards.owned[c.id] ??= { ...base };
      if (job === 'fighting') {
        s.cards.loadouts.fighting = {
          main: cards[0].id,
          supports: cards.slice(1).map((c) => c.id),
        };
      } else {
        s.production.workers[job === 'logging' ? 'oak' : 'copper_quarry'] = [cards[0].id];
      }
    }
    const trees = content.trees.slice(0, 2);
    s.production.unlockedTrees = trees.map((t) => t.id);
    for (const t of trees) s.production.treeLevels[t.id] = 20;
    for (const m of content.mines.slice(0, 2)) s.production.mineLevels[m.id] = 14;
    s.resources.money = s.resources.money.mul(0).add(5e6);
    const r = g.setActiveDungeon(s, content, 'mossy_cellar');
    if (r.ok) s = r.state;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('.shell-rail__item[data-page="home"]').catch(() => undefined);
await page.waitForSelector('.hm-panel');
for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/home-${w}x${h}.png` });
}
console.log('errors', errors);
await browser.close();
