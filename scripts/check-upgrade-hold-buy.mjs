// Holds a tool line's Buy button and expects steady repeat buying that stops on release, while a
// short click still buys exactly once. Run against the app seeded by shoot-upgrades.mjs:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=upgtab npx electron-vite dev -- --remote-debugging-port=9531 --mute-audio`,
// `node scripts/shoot-upgrades.mjs 9531 design/options/upgrades-tab seed`, then
// `node scripts/check-upgrade-hold-buy.mjs [port]`. Exit code 1 on a failure.
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9531';
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell');
await page.click('[data-open="logging"]');
await page.waitForSelector('.vh-view:not([hidden]) .ur__row');
await page.click('.vh-view:not([hidden]) .buy-toggle button:nth-child(1)');
await page.waitForTimeout(600);
const level = () =>
  page.evaluate(() =>
    Number(
      document
        .querySelector('.vh-view:not([hidden]) .ur__row .ur__level')
        .textContent.replace(/\D/g, ''),
    ),
  );
const box = await (await page.$('.vh-view:not([hidden]) .ur__row .ur__buy')).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
let failed = false;
const check = (name, ok, info) => {
  if (!ok) failed = true;
  console.log(ok ? 'PASS' : 'FAIL', name, info);
};
const a = await level();
await page.mouse.down();
await page.waitForTimeout(100);
await page.mouse.up();
await page.waitForTimeout(300);
const b = await level();
check('short click buys once', b === a + 1, `${a}->${b}`);
await page.mouse.down();
await page.waitForTimeout(1500);
const during = await level();
await page.mouse.up();
await page.waitForTimeout(400);
const after = await level();
await page.waitForTimeout(600);
const later = await level();
check('hold buys steadily', during - b >= 5, `${b}->${during}`);
check(
  'release stops it (one click swallowed)',
  later === after && after - during <= 1,
  `${during}->${after}->${later}`,
);
await browser.close();
process.exit(failed ? 1 : 0);
