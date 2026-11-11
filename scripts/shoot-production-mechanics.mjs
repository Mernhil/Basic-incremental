// Screenshots the Production page with the balance update's mechanics (DESIGN.md §4 Tool lines,
// Depth and growth, The forge, Lucky strikes) from a seeded save: tools bought, trees and mines
// part-way down their layers, a forge with a recipe and worker, and a lucky strike on show. It
// replaces the dev save, so use a profile:
// `BI_PROFILE=bu6 npx electron-vite dev -- --remote-debugging-port=9406`, then
// `node scripts/shoot-production-mechanics.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9406';
const out = process.argv[3] ?? 'design/shots/production-mechanics';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
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
    s.prestigeCount = 2; // four worker slots
    const base = Object.values(s.cards.owned)[0];
    for (const id of ['grove_keeper', 'moonwood_dryad', 'geode_golem', 'gem_cutter']) {
      s.cards.owned[id] = { ...base, level: 12 };
    }
    s.production.unlockedTrees = ['oak', 'ironbark'];
    s.production.treeLevels = { oak: 30, ironbark: 12 };
    s.production.mineLevels = { copper_quarry: 22, iron_deeps: 8 };
    s.production.workers = {};
    for (const [place, card] of [
      ['oak', 'moonwood_dryad'],
      ['ironbark', 'grove_keeper'],
      ['copper_quarry', 'geode_golem'],
    ]) {
      const r = g.assignWorker(s, content, place, card);
      if (r.ok) s = r.state;
    }
    s.production.depth = {
      oak: { layer: 3, progress: g.layerHardness(content.treeById.get('oak').depth, 3).mul(0.4) },
      copper_quarry: {
        layer: 2,
        progress: g.layerHardness(content.mineById.get('copper_quarry').depth, 2).mul(0.7),
      },
    };
    s.production.tools = {
      logging_yield: 14,
      logging_speed: 6,
      logging_crit_chance: 9,
      mining_yield: 5,
    };
    s.resources.moonwillow_gem = s.resources.moonwillow_gem.mul(0).add(150000);
    s.resources.grotto_gem = s.resources.grotto_gem.mul(0).add(90000);
    let r = g.setForgeRecipe(s, content, 'star_dust');
    if (r.ok) s = r.state;
    r = g.assignForgeWorker(s, content, 'gem_cutter');
    if (r.ok) s = r.state;
    s.production.forge.progress = new g.Decimal(1900);
    s.resources.money = s.resources.money.mul(0).add(5e6);
    // a moment inside oak's lucky strike
    let t = 600000;
    while (!g.luckyWindow(content, s, 'oak', t)) t += 500;
    s.stats.playTimeMs = t + 500;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="logging"]');
await page.waitForSelector('.pp-r');
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/rows-depth-lucky.png` });
for (const [name, sel] of [
  ['tools-logging', '.pp-band--logging .pp-tools'],
  ['forge', '.pp-forge'],
]) {
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.locator(sel).screenshot({ path: `${out}/${name}.png` });
}
console.log('errors', errors);
await browser.close();
