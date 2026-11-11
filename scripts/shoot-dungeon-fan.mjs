// Screenshots the loadout fan on the Dungeons fight screen (DESIGN.md §11): at rest, one card
// popped out, and after putting it back. It replaces the dev save, so use a profile:
// `BI_PROFILE=uifan npx electron-vite dev -- --remote-debugging-port=9412`, then
// `node scripts/shoot-dungeon-fan.mjs [port] [outDir] [width]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9412';
const out = process.argv[3] ?? 'design/dungeon-fan';
const width = Number(process.argv[4] ?? 1400);
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width, height: 900 }).catch(() => undefined);
await page.waitForSelector('.shell');

await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.clearedDungeons = ['mossy_cellar'];
    const fighters = content.cards.filter((c) => c.job === 'fighting').slice(0, 4);
    const base = Object.values(s.cards.owned)[0];
    for (const c of fighters) s.cards.owned[c.id] ??= { ...base };
    s.cards.loadouts.fighting = {
      main: fighters[0].id,
      supports: fighters.slice(1).map((c) => c.id),
    };
    const r = g.setActiveDungeon(s, content, 'mossy_cellar');
    if (r.ok) s = r.state;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="dungeon"]');
await page.waitForSelector('.ar__fan .lf-slot--support .bi-card');
await page.waitForTimeout(800);
// a support's peek: its free edge (the right edge of s1, the left edge of s0), not its middle
async function clickPeek(which) {
  const box = await page.locator(`.ar__fan .lf-slot--${which}`).boundingBox();
  const x = which === 's0' ? box.x + 4 : box.x + box.width - 4;
  await page.mouse.click(x, box.y + box.height / 2);
}
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.screenshot({ path: `${out}/rest.png` });
await clickPeek('s1');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/popped.png` });
console.log(
  'popped:',
  await page.evaluate(
    () => document.querySelector('.ar__fan .lf-pop:not([hidden]) .lf-note')?.textContent,
  ),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log(
  'after Escape hidden:',
  await page.evaluate(() => document.querySelector('.ar__fan .lf-pop').hidden),
);
await clickPeek('s0');
await page.mouse.click(width / 2, 300);
await page.waitForTimeout(300);
console.log(
  'after outside click hidden:',
  await page.evaluate(() => document.querySelector('.ar__fan .lf-pop').hidden),
);
console.log('errors', errors);
await browser.close();
