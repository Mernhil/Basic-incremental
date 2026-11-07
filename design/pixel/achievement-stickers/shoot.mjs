// Screenshots the real sticker book with a mix of unlocked and locked stickers, in each sticker
// style. It replaces the dev save, so run the app on its own profile:
// `BI_PROFILE=ach npx electron-vite dev -- --remote-debugging-port=9335`, then
// `node design/pixel/achievement-stickers/shoot.mjs [port] [outDir] [styles]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9335';
const out = process.argv[3] ?? 'design/pixel/achievement-stickers/screens';
const styles = (process.argv[4] ?? 'a').split(',');
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined);
await page.waitForSelector('.shell');

const UNLOCKED = [
  'first_harvest',
  'first_kill',
  'lumberjack_1',
  'prospector_1',
  'prospector_2',
  'tree_hugger',
  'giant_slayer_1',
  'giant_slayer_2',
  'glimmer_seeker',
  'first_summon',
  'ten_pulls',
  'silver_lining',
  'golden_hour',
  'six_stars',
  'full_loadout',
  'dressed_up',
  'skilled',
  'night_owl',
  'first_milestone',
  'medalist',
];

for (const style of styles) {
  await page.evaluate(
    async ({ data, game, style, unlocked }) => {
      const d = await import(data);
      const g = await import(game);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      unlocked.forEach((id, i) => (s.achievements[id] = 60_000 * (i + 1)));
      const id = `sticker_${style}`;
      g.grantCosmetic(s, id);
      const r = g.equipCosmetic(s, content, id);
      if (r.ok) s = r.state;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    {
      data: fsUrl('src/data/index.ts'),
      game: fsUrl('src/game/index.ts'),
      style,
      unlocked: UNLOCKED,
    },
  );
  await page.reload();
  await page.waitForSelector('.shell');
  await page.evaluate(() => document.querySelector('.away button')?.click());
  await page.click('.shell-rail__item[data-page="achievements"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/book-${style}.png` });
}
await browser.close();
