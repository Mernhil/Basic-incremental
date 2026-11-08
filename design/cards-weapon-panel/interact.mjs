// Clicks the weapon panel's buttons in the running dev app (after shoot.mjs loaded the `ok` save):
// tier-up in the dungeon drawer, then the star-up on the Cards detail. Prints what changed.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(`http://localhost:${process.env.BI_PORT ?? '9444'}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const read = () =>
  page.evaluate(() => ({
    tier: document.querySelector('.wp-plate')?.textContent,
    badge: document.querySelector('.wp-badge')?.textContent,
    stars: document.querySelector('.wp-stars')?.textContent,
    go: document.querySelector('.wp-go')?.textContent,
    goDisabled: document.querySelector('.wp-go')?.getAttribute('aria-disabled'),
    add: document.querySelector('.wp-add')?.textContent ?? null,
  }));
await page.click('.shell-rail__item[data-page="dungeons"]');
await page.waitForTimeout(600);
console.log('before', JSON.stringify(await read()));
if ((await page.getAttribute('[data-key="wp-tier"]', 'aria-disabled')) === 'false') await page.click('[data-key="wp-tier"]');
await page.waitForTimeout(1500);
console.log('after tier-up', JSON.stringify(await read()));
await page.click('.shell-rail__item[data-page="cards"]');
await page.waitForTimeout(600);
const add = page.locator('.cp-detail [data-key="wp-star"]');
console.log('star button on cards', await add.count());
if (await add.count()) {
  await add.click();
  await page.waitForTimeout(800);
  console.log('after star-up', await page.textContent('.cp-detail .wp-stars'));
  console.log('focus', await page.evaluate(() => document.activeElement?.className));
}
console.log('errors', JSON.stringify(errors));
await browser.close();
