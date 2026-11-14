// Screenshots an Heirloom card of each backdrop (hero, villain, Leviathan sea) and a frame sequence of
// the sea's fish, from the running dev app. Start: `BI_PROFILE=x npx electron-vite dev -- --remote-debugging-port=9333`
// Run: `node scripts/shoot-heirloom-backdrops.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9333';
const out = process.argv[3] ?? 'design/options/heirloom-backdrops';
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(
  async ({ data, game, card, items }) => {
    const d = await import(data);
    const g = await import(game);
    const c = await import(card);
    const it = await import(items);
    const content = d.loadContent();
    const state = g.createInitialState(content);
    const host = document.createElement('div');
    host.id = 'bd-shoot';
    host.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#14111c;display:flex;gap:40px;align-items:center;justify-content:center;transform:scale(1.5)';
    for (const id of ['solaris', 'grimhowl', 'auroratusk']) {
      const cd = content.cardById.get(id);
      const rank = { tier: 'heirloom', stars: 1 };
      const view = c.createCard({
        name: cd.name,
        label: cd.item.kind,
        job: cd.job,
        emblem: 'blade',
        item: it.cardTierArt(cd, 'heirloom'),
        rank,
        rarity: cd.rarity,
        theme: g.resolveCard(content, state.cosmetics.loadout, { id, rank, rarity: cd.rarity }),
      });
      host.append(view.el);
    }
    document.body.append(host);
  },
  {
    data: fsUrl('src/data/index.ts'),
    game: fsUrl('src/game/index.ts'),
    card: fsUrl('src/renderer/src/ui/card.ts'),
    items: fsUrl('src/renderer/src/art/items.ts'),
  },
);
await page.setViewportSize({ width: 1000, height: 640 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/cards.png` });
// the villain at two lava frames (stepped by hand so the frames differ for sure)
const villain = { x: 340, y: 80, width: 330, height: 470 };
for (const [n, frame] of [
  [0, 0],
  [1, 20],
]) {
  await page.evaluate((f) => {
    const el = document.querySelectorAll('#bd-shoot .bi-bd__strip')[0];
    el.style.animation = 'none';
    el.style.backgroundPosition = `${(f / 39) * 100}% 0`;
  }, frame);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/villain-lava-${n}.png`, clip: villain });
}
// the sea with three fish that were mirrored to face right (r15, r23, r47), placed by hand
await page.evaluate(() => {
  const stage = document.querySelectorAll('#bd-shoot .bi-bd__stage')[2];
  const base = stage.querySelector('img').src;
  [
    [15, 20, 10],
    [23, 60, 40],
    [47, 90, 70],
  ].forEach(([n, x, y]) => {
    const im = document.createElement('img');
    im.src = base.replace(/bg-sea[^/]*\.png|bg-sea-[a-f0-9]+\.png/, `bgfish-r${n}.png`);
    im.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:32px;z-index:2;image-rendering:pixelated`;
    stage.append(im);
  });
});
await page.waitForTimeout(100);
await page.screenshot({
  path: `${out}/sea-mirrored.png`,
  clip: { x: 640, y: 80, width: 330, height: 470 },
});
await browser.close();
