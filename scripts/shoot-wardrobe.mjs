// Screenshots the Wardrobe (Phase 5b) in the running dev app with a demo wardrobe: max-level
// Gilded Filigree and Aurora Veil, the Ember Crown on a Prismatic ★6 Dawnblade Regent, copies
// and materials to upgrade. It replaces the dev save (back it up first if it matters).
// Start the app with `npx electron-vite dev -- --remote-debugging-port=9333`, then run
// `node scripts/shoot-wardrobe.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9333';
const out = process.argv[3] ?? 'design/app-screens/wardrobe';
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined);
await page.waitForSelector('.shell');

/** The preview card with room around it for corner flourishes. */
async function shootCard(path) {
  const el = await page.$('.wd-card');
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  const pad = 24;
  await page.screenshot({
    path,
    clip: {
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
    },
  });
}

await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    const own = (id, tier, stars) => {
      s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level: 40 };
    };
    own('dawnblade_regent', 'prismatic', 6);
    own('storm_duelist', 'gold', 3);
    s.cards.loadouts.fighting.main = 'dawnblade_regent';
    for (const id of [
      'gilded_filigree',
      'aurora_veil',
      'holo_hex',
      'holo_hex',
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
    s.cosmetics.owned['aurora_veil'].level = 4;
    s.cosmetics.owned['ember_crown'].level = 5;
    s.resources['glimmer_dust'] = new g.Decimal(5000);
    s.resources['facet_shard'] = new g.Decimal(1200);
    s.resources['glamour_scroll'] = new g.Decimal(240);
    const eq = (id, card) => {
      const r = g.equipCosmetic(s, content, id, card);
      if (r.ok) s = r.state;
    };
    eq('gilded_filigree');
    eq('aurora_veil', 'dawnblade_regent');
    eq('ember_crown', 'dawnblade_regent');
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('.shell-rail__item[data-page="wardrobe"]');
await page.waitForSelector('.wd-stage .bi-card');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/wardrobe.png` });

// select an item that is not equipped: the mannequin tries it on
await page.click('[data-key="tile-holo_hex"]');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/try-on.png` });

// a max-level border close up (corner flourishes, ambient)
const card = await page.$('.wd-card');
await page.click('[data-key="stop-try"]').catch(() => undefined);
await page.waitForTimeout(800);
await shootCard(`${out}/max-card.png`);
void card;
// a Gold card wearing the global max-level Gilded Filigree
await page.selectOption('[data-key="preview"]', 'storm_duelist');
await page.waitForTimeout(1200);
await shootCard(`${out}/max-filigree.png`);
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForTimeout(300);
await shootCard(`${out}/max-filigree-still.png`);
await page.emulateMedia({ reducedMotion: 'no-preference' });

// pull ten from the Wardrobe Gate and reveal all
await page.click('.shell-rail__item[data-page="summon"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/summon-shelf.png` });
const ten = page.locator('.sm-portal[data-portal="wardrobe_gate"] .sm-pull').nth(1);
await ten.click();
await page.waitForTimeout(1000);
await page.click('.rv__skip');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/gate-reveal.png` });
await page.click('.rv__done');

const info = await page.evaluate(() => ({
  maxBorder: document.querySelectorAll('.bi-card[data-max-border]').length,
  maxFinish: document.querySelectorAll('.bi-card[data-max-finish]').length,
}));
console.log(JSON.stringify(info));
await browser.close();
