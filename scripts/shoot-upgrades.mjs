// Screenshots the upgrade rows (Logging and Mining tool lines, Forge) at x1, x10 and max; was: Logging, Mining and Forge views (UI_RULES.md §2; package 9b) at 1280 × 720 CSS px
// at 100% and 150% scale, from a seeded mid-game save: two trees and two mines unlocked, workers on
// most places, the forge running, and the worker picker open. It replaces the dev save, so use a
// profile: `BI_PROFILE=bi9b npx electron-vite dev -- --remote-debugging-port=9531`, then
// `node scripts/shoot-gathering.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9531';
const out = process.argv[3] ?? 'design/options/upgrades-tab';
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
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.clearedDungeons = ['mossy_cellar'];
    s.prestigeCount = 2;
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
    const recipe = content.production.forge.recipes[0];
    const fr = g.setForgeRecipe(s, content, recipe.id);
    if (fr.ok) s = fr.state;
    const fw = g.assignForgeWorker(s, content, 'gem_cutter');
    if (fw.ok) s = fw.state;
    s.production.forge.progress = recipe.work.mul(0.6);
    s.resources.money = s.resources.money.mul(0).add(5e6);
    for (const i of recipe.inputs) s.resources[i.resource] = i.amount.mul(5);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);

const cdp = await page.context().newCDPSession(page);
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
const collect = async () => {
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button, .away button');
    if (!btn) return;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.reload();
await page.waitForSelector('.tbl-pile');
await page.waitForTimeout(800);
await collect();
const tag = process.argv[4] ?? 'now';
for (const id of ['logging', 'mining', 'forge']) {
  await page.click(`[data-open="${id}"]`);
  await page.waitForTimeout(1500);
  for (const [i, name] of [
    [1, 'x1'],
    [2, 'x10'],
    [4, 'max'],
  ]) {
    if (id !== 'logging' && name !== 'x1') continue;
    await page.click(`.vh-view:not([hidden]) .buy-toggle button:nth-child(${i})`).catch(() => {});
    await page.waitForTimeout(500);
    await shot(`${out}/${tag}-${id}-${name}.png`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
console.log(
  errors.length ? ['page errors:', ...errors].join(String.fromCharCode(10)) : 'no page errors',
);
await browser.close();
