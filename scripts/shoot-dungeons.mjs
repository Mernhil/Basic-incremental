import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.reload();
await page.waitForSelector('.bi-card', { timeout: 20000 });
await page.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="dungeon"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
console.log(
  await page.evaluate(() =>
    [...document.querySelectorAll('.dp-floor')]
      .map((f) => f.className + ' | ' + f.innerText.replace(/\n/g, ' / '))
      .join('\n'),
  ),
);
await browser.close();
