// Screenshots the wired beta-batch cosmetic art in the running dev app: header Starlight coin,
// sticker book, shard shop, Ascension, the Wardrobe in each of its five styles, pixel numbers and
// ticks, and max-level cards. It replaces the dev save (use BI_PROFILE).
// `BI_PROFILE=uicos npx electron-vite dev -- --remote-debugging-port=9334`, then
// `node scripts/shoot-cosmetic-art.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9334';
const out = process.argv[3] ?? 'design/cosmetic-art-wiring';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined);
await page.waitForSelector('.shell');

/** Writes a demo save wearing the given global items, then reloads the app. */
async function setup(globals, extra = {}) {
  await page.evaluate(
    async ({ data, game, globals, extra }) => {
      const d = await import(data);
      const g = await import(game);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      const own = (id, tier, stars) => {
        s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level: 40 };
      };
      own('dawnblade_regent', 'prismatic', 6);
      own('storm_duelist', 'gold', 3);
      own('moonwood_dryad', 'prismatic', 6);
      own('core_titan', 'prismatic', 6);
      s.cards.loadouts.fighting.main = 'dawnblade_regent';
      for (const id of [...globals, ...(extra.cards ?? []).map((c) => c[0])]) {
        g.grantCosmetic(s, id);
        const c = content.cosmeticById.get(id);
        if (c) s.cosmetics.owned[id].level = g.cosmeticMaxLevel(content, c);
      }
      for (const id of globals) {
        const r = g.equipCosmetic(s, content, id);
        if (r.ok) s = r.state;
      }
      for (const [id, card] of extra.cards ?? []) {
        const r = g.equipCosmetic(s, content, id, card);
        if (r.ok) s = r.state;
      }
      for (const id of Object.keys(s.resources)) void id;
      s.resources['starlight'] = new g.Decimal(1234);
      s.resources['glimmer_dust'] = new g.Decimal(5000);
      s.resources['facet_shard'] = new g.Decimal(1200);
      s.cards.shards = 321;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), globals, extra },
  );
  await page.reload();
  await page.waitForSelector('.shell');
  await page.evaluate(() => document.querySelector('.away button')?.click());
}
const go = async (id) => {
  await page.click(`[data-open="${id}"]`);
  await page.waitForTimeout(700);
};

const set1 = [
  'starlight_c',
  'sticker_c',
  'wardrobe_b',
  'verdant_number',
  'verdant_tick',
  'verdant_attack',
  'verdant_table',
];
await setup(set1, {
  cards: [
    ['vine_border', 'dawnblade_regent'],
    ['power_veins', 'dawnblade_regent'],
  ],
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/home-header.png` });
await go('achievements');
await page.screenshot({ path: `${out}/stickers.png` });
await page.click('#ac-tab-shop, .ac-tabs button:nth-child(2)').catch(() => undefined);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/shard-shop.png` });
await go('shop');
await page.screenshot({ path: `${out}/ascension.png` });
await go('dungeons');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/arena.png` });
const counts = await page.evaluate(() => ({
  pxTicks: document.querySelectorAll('.st-num--px canvas').length,
  pxNums: document.querySelectorAll('.bi-pxnum').length,
  slashes: document.querySelectorAll('.bi-fx [style*="cos-px"], .bi-fx div').length,
}));
console.log(JSON.stringify(counts));

// the Wardrobe in each style
for (const style of ['a', 'b', 'c', 'd', 'e']) {
  await setup([...set1.filter((x) => !x.startsWith('wardrobe_')), `wardrobe_${style}`], {
    cards: [['vine_border', 'dawnblade_regent']],
  });
  await go('wardrobe');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/wardrobe-${style}.png` });
}

// each Starlight and sticker style, header + book
for (const style of ['b', 'd', 'e']) {
  await setup([`starlight_${style}`, `sticker_${style}`]);
  await go('achievements');
  await page.screenshot({
    path: `${out}/skins-${style}.png`,
    clip: { x: 0, y: 0, width: 1440, height: 700 },
  });
}

// max-level border / finish cards on the preview stage
await setup(['wardrobe_a'], {
  cards: [
    ['heartwood_halo', 'moonwood_dryad'],
    ['core_pulse', 'core_titan'],
  ],
});
await go('wardrobe');
for (const [card, name] of [
  ['moonwood_dryad', 'dryad'],
  ['core_titan', 'titan'],
]) {
  await page.selectOption('[data-key="preview"]', card);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/wardrobe-max-${name}.png` });
  const el = await page.$('.wd-card');
  const box = await el.boundingBox();
  await page.screenshot({
    path: `${out}/max-${name}.png`,
    clip: { x: box.x - 24, y: box.y - 24, width: box.width + 48, height: box.height + 48 },
  });
}
await browser.close();
