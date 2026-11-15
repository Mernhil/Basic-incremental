// Screenshots every screen that shows cards, with T6 and Heirloom cards in the save, at 1280x720.
// Replaces the dev save, so use a profile.
// Start: `BI_PROFILE=gridov npx electron-vite dev -- --remote-debugging-port=9512`
// Run: `node scripts/shoot-card-screens.mjs [port] [outDir]`.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9512';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    const own = (id, tier, stars, level) => {
      s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level };
    };
    for (const id of ['solaris', 'grimhowl', 'skypiercer', 'auroratusk', 'maelfang', 'pearlrider'])
      own(id, 'heirloom', 3, 120);
    for (const id of [
      'jade_vanguard',
      'violet_herald',
      'moon_reaver',
      'pearl_duelist',
      'brine_corsair',
      'surf_crusader',
      'silver_minnow',
      'reef_assassin',
    ])
      own(id, 'mythic', 2, 110);
    own('ember_squire', 'wood', 1, 4);
    own('storm_duelist', 'silver', 3, 30);
    s.cards.loadouts.fighting = {
      main: 'jade_vanguard',
      supports: ['brine_corsair', 'solaris', 'maelfang'],
    };
    s.resources['summon_scroll'] = new g.Decimal(200);
    s.resources['heirloom_scroll'] = new g.Decimal(200);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(1200);

const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const click = async (sel, wait = 700) => {
  const el = await page.$(sel);
  if (!el) {
    console.log('missing', sel);
    return false;
  }
  await el.click().catch((e) => console.log('click failed', sel, String(e).slice(0, 60)));
  await page.waitForTimeout(wait);
  return true;
};
const text = async (sel, t, wait = 800) => {
  const el = page.locator(sel, { hasText: t }).first();
  if ((await el.count()) === 0) {
    console.log('missing', sel, t);
    return false;
  }
  await el.click().catch(() => console.log('click failed', sel, t));
  await page.waitForTimeout(wait);
  return true;
};
const back = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
};

// the dungeon fight
await click('[data-open="dungeons"]', 2500);
await shot('01-dungeon');
await back();
// Cards
await click('[data-open="cards"]', 1500);
await shot('02-collection');
await page.evaluate(() => document.querySelector('.cp-tile')?.click());
await page.waitForTimeout(500);
if (await click('[data-key="enhance-toggle"], .cp-enhance-toggle', 600)) await shot('03-enhance');
await text('.cp-tab, button', 'Heirlooms');
await shot('04-heirlooms');
await text('.cp-tab, button', 'Loadouts');
await shot('05-loadouts');
await click('.cp-empty', 600);
await shot('06-loadouts-pick');
await text('.cp-tab, button', 'Bonds');
await shot('07-bonds');
await text('.cp-tab, button', 'Expeditions');
await shot('08-expeditions');
await back();
// Summon
await click('[data-open="summon"]', 1500);
await shot('09-summon');
if (await click('.sm-pull--ten', 2500)) {
  await shot('10-reveal-ten-dealt');
  for (let i = 0; i < 5; i++) {
    await page.click('.rv__row').catch(() => {});
    await page.waitForTimeout(700);
  }
  await shot('11-reveal-ten');
  await back();
  await back();
}
await shot('12-summon-hand');
if (await text('.sm-gate__row', 'Heirloom Gate', 900)) {
  await shot('13-heirloom-gate');
  if (await click('.sm-pull--ten', 2500)) {
    await shot('14-heirloom-reveal-dealt');
    for (let i = 0; i < 5; i++) {
      await page.click('.rv__row').catch(() => {});
      await page.waitForTimeout(700);
    }
    await shot('15-heirloom-reveal');
    await back();
    await back();
  }
  await shot('16-heirloom-hand');
}
await back();
// Wardrobe
await click('[data-open="wardrobe"]', 1500);
await shot('17-wardrobe');
await text('button', 'Weapon skins');
await shot('18-wardrobe-skins');
await browser.close();
