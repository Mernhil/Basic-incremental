// Captures the decided unique evolution art (Flameblade, Soul Reaper, Rootbloom Staff) from the
// earlier "Item Rarity and Effects" page into evo/*.png, frames over time for a small animation.
// Usage: node design/beta-review/shoot-evos.mjs <path to the saved page>
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const src = process.argv[2];
const out = join(import.meta.dirname, 'evo');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(src).href);
await page.waitForTimeout(2500);
const names = ['flameblade', 'soul-reaper', 'rootbloom-staff'];
const wins = page.locator('#evos .win');
console.log('found', await wins.count());
for (let i = 0; i < 3; i++) {
  await wins.nth(i).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await wins.nth(i).screenshot({ path: join(out, `${names[i]}.png`) });
}
await browser.close();
