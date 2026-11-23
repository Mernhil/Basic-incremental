// Screenshots the weapon panel's stats and abilities (a Gold, a Mythic, an Heirloom and a starter)
// in the dungeon's Weapon tab and the Cards detail, at 1280 x 720 and 1920 x 1080. It replaces the
// dev save, so use a profile:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=stats npx electron-vite dev -- --remote-debugging-port=9474 --mute-audio`,
// then `node scripts/shoot-stats-look.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9474';
const out = process.argv[3] ?? 'design/stats-look';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('[data-open="cards"]', { state: 'attached' });

const CARDS = {
  gold: 'gilded_knight',
  mythic: 'runemoss',
  heirloom: 'solaris',
  starter: 'geodefall',
};
await page.evaluate(
  async ({ data, game, cards }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    for (const id of Object.values(cards)) {
      const card = content.cardById.get(id);
      s.cards.owned[id] = {
        ...g.newOwnedCard(card.tier),
        skillOpen: id === cards.mythic,
        level: 20,
      };
    }
    s.resources['cinder_core'] = new g.Decimal(9);
    s.resources['frost_core'] = new g.Decimal(9);
    s.cards.loadouts.fighting = {
      slots: [cards.gold, cards.mythic, cards.heirloom, cards.starter],
    };
    const r = g.setActiveDungeon(s, content, 'mossy_cellar');
    if (r.ok) s = r.state;
    s.stats.playTimeMs = 24_300;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), cards: CARDS },
);
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
await page.reload();
await page.waitForSelector('[data-open="cards"]', { state: 'attached' });
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button, .away button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => {
    m.muted = true;
  }),
);
const mute = page.locator('.snd-mute');
if ((await mute.count()) > 0 && (await mute.getAttribute('aria-pressed')) !== 'true')
  await mute.click();
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });

// scrolls the panel's stats, then its abilities, to the top of their scroller and shoots each
const scrolled = async (base, scope) => {
  // the top of the panel first (every scroller above the stats back to 0)
  await page.evaluate((q) => {
    for (let n = document.querySelector(q); n; n = n.parentElement) n.scrollTop = 0;
  }, `${scope} .wp-detail--stats`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${base}.png` });
  for (const [name, sel] of [
    ['stats', `${scope} .wp-detail--stats`],
    ['abilities', `${scope} .wp-detail--rest`],
  ]) {
    await page.evaluate((q) => {
      const el = document.querySelector(q);
      let p = el?.parentElement;
      while (
        p &&
        !(p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(p).overflowY))
      )
        p = p.parentElement;
      if (el && p)
        p.scrollTop += el.getBoundingClientRect().top - p.getBoundingClientRect().top - 4;
    }, sel);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${base}-${name}.png` });
  }
};

for (const [w, h] of [
  [1274, 815],
  [1280, 720],
  [1600, 900],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-open="dungeon"]')?.click());
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelector('[data-key="panel-weapon"]')?.click());
  await page.waitForTimeout(700);
  const names = { gold: /Golden/, mythic: /Runemoss/, heirloom: /Solaris/, starter: /Geodefall/ };
  for (const [kind, re] of Object.entries(names)) {
    const tab = page.getByRole('tab', { name: re }).first();
    if ((await tab.count()) > 0) await tab.click().catch(() => undefined);
    await page.waitForTimeout(700);
    await scrolled(`${out}/${w}-dungeon-${kind}`, '.dp-weapon');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-open="cards"]')?.click());
  await page.waitForTimeout(1200);
  for (const [kind, id] of Object.entries(CARDS)) {
    const tile = await page.$(`[data-key="tile-${id}"]`);
    if (!tile) {
      console.log('missing tile', kind);
      continue;
    }
    await tile.click();
    await page.waitForTimeout(800);
    await scrolled(`${out}/${w}-cards-${kind}`, '.cp-detail');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}
console.log('done');
process.exit(0);
