// Clicks through the Dungeons page in the running dev app (see shoot-app.mjs for how to start it):
// fight another dungeon, check Home follows, switch back.
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const homeTitle = () =>
  page.evaluate(() => document.querySelector('.table__boss .frame__heading')?.textContent);
await page.click('[data-open="dungeon"]');
const dps0 = await page.textContent('.dp-dps');
await page.click('[data-key="up-copper_edge"]');
await page.waitForTimeout(300);
const dps1 = await page.textContent('.dp-dps');
const focused = await page.evaluate(() => document.activeElement?.dataset.key);
await page.click('[data-key="fight-ember_crypt"]');
await page.waitForTimeout(300);
const active = await page.evaluate(
  () => document.querySelector('.dp-floor--active .dp-floor__name')?.firstChild?.textContent,
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const home = await homeTitle();
await page.screenshot({ path: 'design/app-screens/dungeons-home-ember.png' });
await page.click('[data-open="dungeon"]');
await page.click('[data-key="fight-mossy_cellar"]');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
const back = await homeTitle();
console.log(JSON.stringify({ dps0, dps1, focused, active, home, back, errors }));
await browser.close();
