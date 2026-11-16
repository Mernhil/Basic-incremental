// Screenshots where a card is named (the table's hand, the Collection, its big detail card, a loadout
// picker, the Dungeon view with the Weapon panel, a Summon reveal) with a T1, a T5, a T6 and an Heirloom
// card in the save. Replaces the profile's save, so use a profile.
// Start (hidden, muted): `BI_HIDDEN_WINDOW=1 BI_PROFILE=onename npx electron-vite dev -- --remote-debugging-port=9531 --mute-audio`
// Run: `node scripts/shoot-one-name.mjs <port> <outDir> <width> <height>`.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9531';
const out = process.argv[3] ?? 'design/options/one-card-name';
const width = Number(process.argv[4] ?? 1280);
const height = Number(process.argv[5] ?? 720);
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
    own('ember_squire', 'wood', 1, 8);
    own('storm_duelist', 'silver', 3, 30);
    own('dawnblade_regent', 'prismatic', 2, 70);
    own('silver_cavalier', 'gold', 2, 60);
    own('jade_vanguard', 'mythic', 2, 110);
    own('moon_reaver', 'mythic', 1, 110);
    own('solaris', 'heirloom', 3, 120);
    own('grimhowl', 'heirloom', 6, 120);
    s.cards.loadouts.fighting.slots = [
      'ember_squire',
      'dawnblade_regent',
      'jade_vanguard',
      'solaris',
    ];
    s.resources['summon_scroll'] = new g.Decimal(200);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
const mute = page.locator('.snd-mute');
if ((await mute.count()) > 0 && (await mute.getAttribute('aria-pressed')) !== 'true')
  await mute.click();
await page.setViewportSize({ width, height });
await page.waitForTimeout(1500);

const shot = (name) => page.screenshot({ path: `${out}/${name}-${width}.png` });
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
const tile = async (i) => {
  await page.evaluate((n) => document.querySelectorAll('.cp-tile')[n]?.click(), i);
  await page.waitForTimeout(700);
};

await shot('1-table-hand');
await click('[data-open="dungeon"]', 2500);
await click('[data-key="panel-weapon"]', 1200);
await shot('2-dungeon-weapon-panel');
await back();
await back();
await click('[data-open="cards"]', 1500);
await shot('3-collection');
// the big detail card: a Wood card, then a Prismatic card, a Mythic card and an Heirloom card
const names = await page.$$eval('.cp-tile', (els) => els.map((e) => e.textContent ?? ''));
for (const [file, want] of [
  ['4a-detail-t1', 'Wooden'],
  ['4b-detail-t5', 'Prismatic'],
  ['4c-detail-t6', 'Mythic'],
  ['4d-detail-heirloom', 'Solaris'],
]) {
  const i = names.findIndex((n) => n.includes(want));
  if (i < 0) {
    console.log('no tile', want, names.slice(0, 12));
    continue;
  }
  await tile(i);
  await shot(file);
}
await text('.cp-tab, button', 'Loadouts');
await shot('5-loadouts');
if (await click('[data-key="slot-fighting-1"]', 900)) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('6-loadout-picker');
}
await text('.cp-tab, button', 'Heirlooms');
await shot('8-heirlooms');
await back();
await back();
await click('[data-open="summon"]', 1500);
if (await click('.sm-pull--ten:visible', 2500)) {
  for (let i = 0; i < 5; i++) {
    await page.click('.rv__row').catch(() => {});
    await page.waitForTimeout(700);
  }
  await shot('7-summon-reveal');
}
await browser.close();
