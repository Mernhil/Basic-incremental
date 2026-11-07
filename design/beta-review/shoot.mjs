// Screenshots each option set of the beta review page into screens/.
// Usage: npx vite build -c design/beta-review/vite.config.mts && node design/beta-review/shoot.mjs
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = import.meta.dirname;
const out = join(dir, 'screens');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(pathToFileURL(resolve(dir, 'index.html')).href);
await page.waitForTimeout(1500);
for (const id of await page.$$eval('section', (s) => s.map((x) => x.id))) {
  await page.locator(`#${id}`).screenshot({ path: join(out, `${id}.png`) });
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('ok');
