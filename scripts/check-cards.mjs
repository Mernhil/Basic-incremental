// Clicks through the Cards page in the running dev app (start it as described in shoot-app.mjs):
// filters, sort, selecting cards, loadout buttons and the Loadouts tab, with screenshots.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.reload();
await page.waitForSelector('.shell-rail__item', { timeout: 20000 });
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('.shell-rail__item[data-page="cards"]');
await page.waitForSelector('.cp-tile');
await page.waitForTimeout(500);
await page.screenshot({ path: 'design/app-screens/cards.png' });
const out = {};
out.tiles = await page.locator('.cp-tile').count();
await page.click('[data-key="job-mining"]');
out.mining = await page.locator('.cp-tile').count();
await page.click('[data-key="job-all"]');
await page.selectOption('[data-key="sort"]', 'name');
out.firstByName = await page.locator('.cp-tile').first().getAttribute('aria-label');
// an unowned card shows the locked detail
const locked = page.locator('.cp-tile:has(.cp-fit--locked)').first();
await locked.click();
out.lockedDetail = (await page.textContent('.cp-detail'))?.includes('Not found yet');
// an owned main: move it to a support slot and back
await page.click('[data-key="tile-cave_digger"]');
await page.click('[data-key="add-support"]');
await page.waitForTimeout(200);
out.afterSupport = await page.textContent('.cp-detail .frame__note');
await page.click('[data-key="set-main"]');
await page.waitForTimeout(200);
out.afterMain = await page.textContent('.cp-detail .frame__note');
out.focus = await page.evaluate(() => document.activeElement?.dataset.key);
await page.screenshot({ path: 'design/app-screens/cards-detail.png' });
await page.click('#cards-tab-loadouts');
await page.waitForTimeout(300);
await page.screenshot({ path: 'design/app-screens/cards-loadouts.png' });
out.slots = await page.locator('.cp-slot').count();
await page.locator('.cp-empty').first().click();
out.backTo = await page.getAttribute('#cards-tab-collection', 'aria-selected');
out.filter = await page.getAttribute('.cp-chip[aria-pressed="true"]', 'data-key');
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
