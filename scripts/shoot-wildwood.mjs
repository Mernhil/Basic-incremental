// Screenshots the Wildwood batch (batch 3) from the running real app: all 34 cards, a hero and a
// villain T6 up close, the two Heirloom daggers, the Heirloom board and a Summon reveal.
// Start: `BI_HIDDEN_WINDOW=1 BI_PROFILE=wildwood npx electron-vite dev -- --remote-debugging-port=9571 --mute-audio`
// Run: `node scripts/shoot-wildwood.mjs [port] [outDir]`. It replaces the profile's save.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9571';
const out = process.argv[3] ?? 'design/options/wildwood-shots';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const mods = {
  data: fsUrl('src/data/index.ts'),
  game: fsUrl('src/game/index.ts'),
  card: fsUrl('src/renderer/src/ui/card.ts'),
  face: fsUrl('src/renderer/src/pages/loadoutCards.ts'),
  reveal: fsUrl('src/renderer/src/stage/reveal.ts'),
};
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.waitForSelector('.shell');
await page.evaluate(async (m) => {
  document.querySelectorAll('audio,video').forEach((a) => (a.muted = true));
  const d = await import(m.data);
  const g = await import(m.game);
  const content = d.loadContent();
  const s = g.createInitialState(content);
  for (const c of content.cards.filter((x) => x.batch === 'wildwood')) {
    s.cards.owned[c.id] = { ...g.newOwnedCard(), tier: c.tier, stars: 3, level: 100 };
  }
  s.resources['summon_scroll'] = new g.Decimal(200);
  s.resources['heirloom_scroll'] = new g.Decimal(200);
  await window.api.writeSave(g.createSaveText(s, Date.now()));
}, mods);
await page.reload();
await page.waitForSelector('.shell');
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(200);
}
const shot = async (name) => {
  await page.waitForTimeout(700);
  writeFileSync(`${out}/${name}.png`, await page.screenshot());
};
// cards drawn with the app's own card component, on a plain board at a whole pixel scale
const board = (ids, scale, name, cols) =>
  page
    .evaluate(
      async ({ m, ids, scale, cols }) => {
        document.getElementById('ww-board')?.remove();
        const d = await import(m.data);
        const g = await import(m.game);
        const c = await import(m.card);
        const f = await import(m.face);
        const content = d.loadContent();
        const state = g.createInitialState(content);
        for (const id of ids) {
          const cd = content.cardById.get(id);
          state.cards.owned[id] = { ...g.newOwnedCard(), tier: cd.tier, stars: 3, level: 100 };
        }
        const host = document.createElement('div');
        host.id = 'ww-board';
        host.style.cssText = `position:fixed;inset:0;z-index:99999;background:#14111c;display:grid;grid-template-columns:repeat(${cols},max-content);gap:${44 * scale}px;align-content:center;justify-content:center;overflow:hidden`;
        for (const id of ids) {
          const props = f.cardFaceProps(content, state, id);
          const view = c.createCard(props);
          const wrap = document.createElement('div');
          wrap.style.cssText = `zoom:${scale}`;
          wrap.append(view.el);
          host.append(wrap);
        }
        document.body.append(host);
      },
      { m: mods, ids, scale, cols },
    )
    .then(() => shot(name));
const ids = await page.evaluate(async (m) => {
  const d = await import(m.data);
  const content = d.loadContent();
  const ww = content.cards.filter((c) => c.batch === 'wildwood');
  return {
    hero: ww.filter((c) => !c.heirloom && c.side === 'mythic').map((c) => c.id),
    villain: ww.filter((c) => !c.heirloom && c.side === 'void').map((c) => c.id),
    heirloom: ww.filter((c) => c.heirloom).map((c) => c.id),
  };
}, mods);
await page.setViewportSize({ width: 1920, height: 1800 });
await board([...ids.hero, ...ids.villain, ...ids.heirloom], 1, 'all-34-cards', 7);
await board(['runemoss', 'emberthorn', 'pearl_duelist'], 2, 'close-hero-and-villain-t6', 3);
await board(['phoenixquill', 'foxtail'], 2, 'two-heirloom-daggers', 2);
await page.evaluate(() => document.getElementById('ww-board')?.remove());
// the Heirloom board of the real Summon page
await page.click('[data-open="summon"]').catch(() => {});
await page.waitForTimeout(1500);
await shot('summon-page');
await page.click('text=Heirloom Gate').catch(() => {});
await page.waitForTimeout(1200);
const bd = await page.$('.sm-board');
if (bd) {
  await bd.scrollIntoViewIfNeeded();
  writeFileSync(`${out}/heirloom-board.png`, await bd.screenshot());
}
await page.keyboard.press('Escape');
// a Summon reveal with a Wildwood card
await page.evaluate(async (m) => {
  const d = await import(m.data);
  const g = await import(m.game);
  const f = await import(m.face);
  const r = await import(m.reveal);
  const content = d.loadContent();
  const state = g.createInitialState(content);
  const id = 'stonegrove';
  state.cards.owned[id] = { ...g.newOwnedCard(), tier: 'mythic', stars: 1, level: 1 };
  r.showReveal({
    portalName: 'Card Portal',
    kind: 'cards',
    views: [
      {
        itemId: id,
        name: 'Stonegrove',
        rarity: 'mythic',
        rarityName: 'Mythic',
        orb: 'mythic',
        upgrade: false,
        tags: ['New!'],
        gain: 'new',
      },
    ],
    face: (x) => f.cardFaceProps(content, state, x),
  });
}, mods);
await page.waitForTimeout(2500);
await page.click('.rv__row').catch(() => {});
await shot('summon-reveal');
console.log(errors.length ? errors : 'no page errors');
await browser.close();
