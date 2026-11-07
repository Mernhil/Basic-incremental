// Screenshots each option board of options.html.
// Usage: node design/settings/shoot.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
await page.goto(pathToFileURL(join(here, 'options.html')).href);
await page.evaluate(() => document.fonts.ready);
const boards = page.locator('section.board');
const count = await boards.count();
for (let i = 0; i < count; i++) {
  await boards.nth(i).screenshot({ path: join(here, `option-${'ABCDE'[i]}.png`) });
}
await browser.close();
console.log(`${count} screenshots in`, here);
