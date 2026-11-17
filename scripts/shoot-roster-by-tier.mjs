// Screenshots for the roster by tier (DESIGN §5 Roster, No tier-ups): the Collection with one Wooden,
// Bronze, Silver, Golden and Prismatic sword side by side plus a T6 card and an Heirloom, a T6 and an
// Heirloom detail, a loadout picker, Summon with its Wishlist and odds panels, and the Weapon panel
// (no tier-up step). The same save is written on any version of the game, so the script also takes
// the "before" pictures on the release before this change. Replaces the profile's save: use a profile.
// Start (hidden, muted): `BI_HIDDEN_WINDOW=1 BI_PROFILE=roster npx electron-vite dev -- --remote-debugging-port=9541 --mute-audio`
// Run: `node scripts/shoot-roster-by-tier.mjs <port> <outDir> <prefix> <width> <height>`.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9541';
const out = process.argv[3] ?? 'design/options/roster-by-tier';
const prefix = process.argv[4] ?? 'after';
const width = Number(process.argv[5] ?? 1280);
const height = Number(process.argv[6] ?? 720);
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
const writeSave = (lead) =>
  page.evaluate(
    async ({ data, game, lead }) => {
      const d = await import(data);
      const g = await import(game);
      const content = d.loadContent();
      const s = g.createInitialState(content);
      // every card as it is when it has just been pulled: the five swords, a T6 sword, an Heirloom
      const own = (id, patch = {}) => {
        s.cards.owned[id] = { ...g.newOwnedCard(), ...patch };
      };
      own('ember_squire', { level: 8, stars: 2 });
      own('brass_vanguard', { level: 5 });
      own('silver_cavalier', { level: 12, stars: 3, starFill: 1 });
      own('gilded_knight', { level: 4 });
      // Lv 20: its next levels are breakthrough levels, so its detail shows that note
      own('prism_paladin', { level: 20 });
      own('dawn_champion', { level: 2 });
      own('solaris', { tier: 'heirloom', stars: 2, level: 20 });
      s.cards.loadouts.fighting.slots = [
        lead,
        'silver_cavalier',
        'gilded_knight',
        'brass_vanguard',
      ];
      s.account.level = 30;
      s.resources['summon_scroll'] = new g.Decimal(40);
      s.resources['money'] = new g.Decimal(5000000);
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), lead },
  );
const load = async (lead) => {
  await writeSave(lead);
  await page.reload();
  await page.waitForSelector('.shell');
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};
await load('ember_squire');
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
const mute = page.locator('.snd-mute');
if ((await mute.count()) > 0 && (await mute.getAttribute('aria-pressed')) !== 'true')
  await mute.click();
await page.setViewportSize({ width, height });
await page.waitForTimeout(1500);

const shot = (name) => page.screenshot({ path: `${out}/${prefix}-${name}-${width}.png` });
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

// the Dungeon view's Weapon panel: no tier-up step
await click('[data-open="dungeon"]', 2500);
await click('[data-key="panel-weapon"]', 1200);
await shot('1-weapon-panel');
await back();
await back();

// the Collection: the owned cards first, the five swords side by side
await click('[data-open="cards"]', 1500);
await shot('2-collection');
const names = await page.$$eval('.cp-tile', (els) => els.map((e) => e.textContent ?? ''));
const tiles = [
  ['3a-detail-silver-sword', 'Silver Sword'],
  ['3b-detail-prismatic-sword', 'Prismatic Sword'],
];
for (const [file, name] of tiles) {
  const i = names.findIndex((n) => n.includes(name));
  await tile(i >= 0 ? i : 0);
  await shot(file);
}

const t6 = names.findIndex((n) => n.includes('Mythic Light Sword') || n.includes('Mythic'));
if (t6 >= 0) {
  await tile(t6);
  await shot('3c-detail-t6');
}
await text('.cp-tab, button', 'Loadouts');
await shot('4-loadouts');
if (await click('[data-key="slot-fighting-1"]', 900)) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('5-loadout-picker');
}
await back();
// closing the picker can close the Cards view too: open it again
if ((await page.locator('.cp-tab, button', { hasText: 'Heirlooms' }).count()) === 0)
  await click('[data-open="cards"]', 1500);
await text('.cp-tab, button', 'Heirlooms');
await shot('6-heirlooms');
await back();
await back();

// Summon: the gates, the Wishlist and the odds panel
await click('[data-open="summon"]', 1500);
await shot('7-summon');
if (await click('.sm-pull--ten:visible', 2500)) {
  for (let i = 0; i < 12; i++) {
    await page.click('.rv__row').catch(() => {});
    await page.waitForTimeout(500);
  }
  await shot('8-summon-reveal');
  await back();
  await page.waitForTimeout(800);
  await shot('9-summon-last-hand');
}
// the Weapon panel of the Prismatic sword at Lv 20: the "Breakthrough levels" note
await back();
await back();
await load('prism_paladin');
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.waitForTimeout(1500);
await click('[data-open="dungeon"]', 2500);
await click('[data-key="panel-weapon"]', 1200);
await shot('10-weapon-panel-breakthrough');
console.log('tiles', names.slice(0, 10).join(' | '));
await browser.close();
