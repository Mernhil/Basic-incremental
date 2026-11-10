// Screenshots Wardrobe (both tabs) and Skill Tree at 1280x720 and 1920x1080 with a seeded save.
// It replaces the dev save, so use a profile:
// `BI_PROFILE=rework3b npx electron-vite dev -- --remote-debugging-port=9412`, then
// `node scripts/shoot-wardrobe-skills.mjs [port] [outDir]`.
import { resolve, sep } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9412';
const out = process.argv[3] ?? 'design/shots/ui-rework-3';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).split(sep).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.waitForSelector('.shell');

await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    const own = (id, tier, stars) => {
      s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level: 40 };
    };
    own('dawnblade_regent', 'gold', 1);
    own('storm_duelist', 'silver', 3);
    s.cards.loadouts.fighting.main = 'dawnblade_regent';
    for (const id of [
      'gilded_filigree',
      'aurora_veil',
      'holo_hex',
      'gilded_plate',
      'ember_crown',
      'gt_border',
      'gt_table',
      'gt_number',
      'prism_pointer',
    ])
      g.grantCosmetic(s, id);
    s.cosmetics.owned['gilded_filigree'].level = 4;
    s.cosmetics.owned['aurora_veil'].level = 2;
    s.resources['glimmer_dust'] = new g.Decimal(5000);
    s.resources['facet_shard'] = new g.Decimal(1200);
    s.account.level = 12;
    const eq = (id, card) => {
      const r = g.equipCosmetic(s, content, id, card);
      if (r.ok) s = r.state;
    };
    eq('gilded_filigree');
    eq('aurora_veil', 'dawnblade_regent');
    let bought = 0;
    for (const n of content.account.tree) {
      if (bought >= 4) break;
      const r = g.buySkill(s, content, n.id);
      if (r.ok) {
        s = r.state;
        bought++;
      }
    }
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });

for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.click('.shell-rail__item[data-page="wardrobe"]');
  await page.click('[data-key="tab-cosmetics"]');
  await page.waitForSelector('.wd-stage .bi-card');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/wardrobe-${w}.png` });
  await page.click('[data-key="tab-skins"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/wardrobe-skins-${w}.png` });
  await page.click('.shell-rail__item[data-page="skills"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/skills-${w}.png` });
}
console.log('errors', errors);
await browser.close();
