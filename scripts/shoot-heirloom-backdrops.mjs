// Screenshots an Heirloom card of each backdrop (hero, villain, Leviathan sea) at 1280 x 720 from the running dev app. Start: `BI_PROFILE=x npx electron-vite dev -- --remote-debugging-port=9333`
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
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/cards.png` });
await browser.close();
