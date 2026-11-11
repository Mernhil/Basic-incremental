// Screenshots the Production page (DESIGN.md §4 Workers, UI_RULES.md §2) with a seeded save: two
// tree kinds and two mines unlocked, a worker on most of them, one place left empty, and the
// worker picker open under a row. It replaces the dev save, so use a profile:
// `BI_PROFILE=bu4 npx electron-vite dev -- --remote-debugging-port=9401`, then
// `node scripts/shoot-production.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9401';
const out = process.argv[3] ?? 'design/shots/workers';
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
    s.prestigeCount = 1; // three worker slots
    const base = Object.values(s.cards.owned)[0];
    for (const id of ['grove_keeper', 'moonwood_dryad', 'gem_cutter', 'geode_golem']) {
      s.cards.owned[id] = { ...base, level: 12 };
    }
    const trees = content.trees.slice(0, 2);
    s.production.unlockedTrees = trees.map((t) => t.id);
    for (const t of trees) s.production.treeLevels[t.id] = 20;
    for (const m of content.mines.slice(0, 2)) s.production.mineLevels[m.id] = 14;
    s.production.workers = {};
    for (const [place, card] of [
      ['oak', 'moonwood_dryad'],
      ['ironbark', 'grove_keeper'],
      ['copper_quarry', 'geode_golem'],
    ]) {
      const r = g.assignWorker(s, content, place, card);
      if (r.ok) s = r.state;
    }
    s.production.harvestGauges = {
      oak: { gauge: 18, timer: 0 },
      copper_quarry: { gauge: 7, timer: 0 },
    };
    s.resources.money = s.resources.money.mul(0).add(5e6);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="logging"]');
await page.waitForSelector('.pp-w__btn');
for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h }).catch(() => undefined);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/production-${w}x${h}.png` });
}
// the picker under the empty mine row
await page.click('[data-key="worker-iron_deeps"] .pp-w__btn');
await page.waitForSelector('.pp-pick__opt');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/production-picker-1920x1080.png` });
console.log('errors', errors);
await browser.close();
