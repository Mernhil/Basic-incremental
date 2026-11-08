// Screenshots the pixel-art Summon (s5-pixel-N) and Shop (h2-pixel-N) mockups at 1x and 2x ("game scale"),
// idle and in the motion state: node design/options/_shared/shoot-pixel.mjs [summon|shop|all] [n]
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ?? 'all';
const num = process.argv[3];
const browser = await chromium.launch();
for (const [dir, re] of [['summon', /^s5-pixel-(\d)\.html$/], ['shop', /^h2-pixel-(\d)\.html$/]]) {
  if (only !== 'all' && only !== dir) continue;
  for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => re.test(x))) {
    if (num && !f.includes(`-${num}.`)) continue;
    const id = f.replace('.html', '');
    for (const dpr of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 1264, height: 781 }, deviceScaleFactor: dpr });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('requestfailed', (r) => errors.push('FAILED ' + r.url()));
      for (const state of ['idle', 'play']) {
        await page.goto(pathToFileURL(path.join(root, dir, f)).href + `?state=${state}&frozen=1`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(root, dir, `${id}-${state}${dpr === 2 ? '@2x' : ''}.png`) });
      }
      if (errors.length) console.log('ERRORS', id, errors);
      await page.close();
    }
    console.log('shot', dir, id);
  }
}
await browser.close();
