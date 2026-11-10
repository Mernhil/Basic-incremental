// Screenshots the Dungeons arena (UI rework 2.3) at several window sizes. It replaces the dev
// save, so run the app on its own profile:
// `BI_PROFILE=rework2dun npx electron-vite dev -- --remote-debugging-port=9403`, then
// `node scripts/shoot-dungeon-arena.mjs [port] [outDir] [WxH,WxH,...] [dungeonId]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9403';
const out = process.argv[3] ?? 'design/shots/ui-rework-2';
const sizes = (process.argv[4] ?? '1280x720,1920x1080,1000x640')
  .split(',')
  .map((s) => s.split('x').map(Number));
const dungeon = process.argv[5] ?? 'mossy_cellar';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setViewportSize({ width: sizes[0][0], height: sizes[0][1] }).catch(() => undefined);
await page.waitForSelector('.shell');

await page.evaluate(
  async ({ data, game, dungeon }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.clearedDungeons = ['mossy_cellar', 'ember_crypt'];
    const fighters = content.cards.filter((c) => c.job === 'fighting').slice(0, 4);
    const base = Object.values(s.cards.owned)[0];
    for (const c of fighters) s.cards.owned[c.id] ??= { ...base };
    s.cards.loadouts.fighting = {
      main: fighters[0].id,
      supports: fighters.slice(1).map((c) => c.id),
    };
    const r = g.setActiveDungeon(s, content, dungeon);
    if (r.ok) s = r.state;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), dungeon },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('.shell-rail__item[data-page="dungeons"]');
await page.waitForSelector('.ar__fan .lf-slot--main .bi-card');
if (await page.evaluate(() => document.querySelector('.dp-drawer')?.classList.contains('is-open')))
  await page.click('.dp-handle');

for (const [w, h] of sizes) {
  await page.setViewportSize({ width: w, height: h }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/dungeons-${w}x${h}.png` });
  const info = await page.evaluate(() => {
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const r = (b) => b && [b.left, b.top, b.right, b.bottom].map(Math.round);
    return {
      inner: [innerWidth, innerHeight],
      cardN: document.querySelector('.ar__fan')?.style.getPropertyValue('--card-n'),
      fan: r(box('.ar__fan')),
      boss: r(box('.ar-boss')),
      hp: r(box('.ar__hp')),
      chips: r(box('.ar__readouts')),
      party: r(box('.ar__party')),
      arena: r(box('.ar')),
    };
  });
  console.log(w, h, JSON.stringify(info));
}
await page.click('.dp-handle');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/dungeons-drawer-${sizes[0][0]}x${sizes[0][1]}.png` });
console.log('errors', errors);
await browser.close();
