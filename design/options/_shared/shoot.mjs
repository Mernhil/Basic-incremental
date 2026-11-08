// Screenshots the option mockups: node design/options/_shared/shoot.mjs <summon|shop|all> [id prefix]
// Each option html is shot at 1x and 2x ("game scale"), idle and in its motion state
// (?state=play shows the showpiece moment of the motion; ?frozen=1 stops every animation).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ?? 'all';
const arg = process.argv[3];
const browser = await chromium.launch();
for (const dir of ['summon', 'shop']) {
  if (only !== 'all' && only !== dir) continue;
  const files = fs.readdirSync(path.join(root, dir)).filter((f) => /^[sh]\d\.html$/.test(f));
  for (const f of files) {
    if (arg && !f.startsWith(arg)) continue;
    const id = f.replace('.html', '');
    for (const dpr of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 1264, height: 781 }, deviceScaleFactor: dpr });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const state of ['idle', 'play']) {
        await page.goto(pathToFileURL(path.join(root, dir, f)).href + `?state=${state}&frozen=1`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(root, dir, `${id}-${state}${dpr === 2 ? '@2x' : ''}.png`) });
      }
      if (errors.length) console.log('ERRORS', id, errors);
      await page.close();
    }
    console.log('shot', dir, id);
  }
}
await browser.close();
