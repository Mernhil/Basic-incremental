// Screenshots the cosmetics cleanup (DESIGN.md §5 The base frame, §8): Legendary cards at Gold and
// Prismatic wearing three different borders in the Cards panel, a duel hand and the Wardrobe
// preview, at 100% and 150%, plus the Wardrobe with its empty categories. It replaces the save of
// the profile it runs against, so use a profile of its own:
// `BI_PROFILE=cleanup npx electron-vite dev -- --remote-debugging-port=9444`, then
// `node scripts/shoot-border-replace.mjs [port] [outDir]`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ONLY = process.env.ONLY === 'previews'; // only the Wardrobe preview cards
const port = process.argv[2] ?? '9444';
const out = process.argv[3] ?? 'design/options/cosmetics-cleanup';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;

const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.waitForSelector('.shell');

const BORDERS = ['gt_border', 'verdant_border', 'blossom_border'];
const GOLD = ['dawnblade_regent', 'prism_paladin', 'shard_strider'];
const PRISM = ['mirror_cavalier', 'whisper_assassin', 'facet_crusher'];

/** Writes a save whose fighting team is `team` (a Gold row or a Prismatic row). */
async function writeSave(team) {
  await page.evaluate(
    async ({ data, game, borders, gold, prism, team }) => {
      const d = await import(data);
      const g = await import(game);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      const own = (id, tier, stars) => {
        s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level: 60 };
      };
      gold.forEach((id) => own(id, 'gold', 3));
      prism.forEach((id) => own(id, 'prismatic', 3));
      for (const b of borders) g.grantCosmetic(s, b);
      [...gold, ...prism].forEach((id, i) => {
        const r = g.equipCosmetic(s, content, borders[i % 3], id);
        if (r.ok) s = r.state;
      });
      s.cards.loadouts.fighting = { main: team[0], supports: [team[1], team[2], null] };
      s.cards.loadouts.fighting.supports = [team[1], team[2], null];
      s.resources['glamour_scroll'] = new g.Decimal(20);
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    {
      data: fsUrl('src/data/index.ts'),
      game: fsUrl('src/game/index.ts'),
      borders: BORDERS,
      gold: GOLD,
      prism: PRISM,
      team,
    },
  );
}

const cdp = await page.context().newCDPSession(page);
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
};
const click = async (sel, wait = 600) => {
  const el = await page.$(sel);
  if (!el) return console.log('missing', sel);
  await el.click().catch(() => console.log('click failed', sel));
  await page.waitForTimeout(wait);
};

async function boot(scale) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await page.reload();
  await page.waitForSelector('.tbl-pile');
  await page.waitForTimeout(1500);
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);
}

for (const scale of [1, 1.5]) {
  const tag = scale === 1 ? '100' : '150';
  for (const [name, team] of [
    ['gold', GOLD],
    ['prismatic', PRISM],
  ]) {
    await writeSave(team);
    await boot(scale);
    // the duel hand: the team on the table
    await page.waitForTimeout(2500);
    if (!ONLY) await shot(`hand-${name}-${tag}`);
    // the Cards panel (every owned card, each with its own border)
    if (!ONLY) {
      await click('[data-open="cards"]', 1600);
      await shot(`cards-${name}-${tag}`);
    }
    await boot(scale); // back to the table
    // the Wardrobe preview, one card per border
    await click('[data-open="wardrobe"]', 1500);
    for (const id of team) {
      await page.selectOption('[data-key="preview"]', id).catch(() => undefined);
      await page.waitForTimeout(900);
      const el = await page.$('.wd-card');
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const box = await el.boundingBox();
        const pad = 28;
        const { data } = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
            scale: 1,
          },
        });
        writeFileSync(`${out}/preview-${name}-${id}-${tag}.png`, Buffer.from(data, 'base64'));
      }
    }
    await shot(`wardrobe-${name}-${tag}`);
  }
  // the empty categories: the Effects chip and the Card frames chip
  const chip = async (label) => {
    const el = page.locator('.wd-chip, .chip, button', { hasText: label }).first();
    if ((await el.count()) === 0) return console.log('missing chip', label);
    await el.click().catch(() => undefined);
    await page.waitForTimeout(700);
  };
  if (ONLY) continue;
  await chip('Effects');
  await shot(`wardrobe-effects-${tag}`);
  await chip('All');
  await shot(`wardrobe-all-${tag}`);
}
console.log('errors:', errors.length, errors.slice(0, 5));
await browser.close();
