// Checks that the header's Goals popup is on top and clickable from the table and from every full
// view (the bug of 2026-11-15: the popup hid behind the open view). It needs the running dev app:
// `BI_PROFILE=<name> npx electron-vite dev -- --remote-debugging-port=9461 --mute-audio`, then
// `node scripts/check-goals-popup.mjs [port]`. Exits 1 when the popup is covered in any view.
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9461';
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => {
    m.muted = true;
  }),
);

const views = [
  null,
  'dungeon',
  'logging',
  'mining',
  'cards',
  'summon',
  'wardrobe',
  'skills',
  'achievements',
  'shop',
  'forge',
  'upgrades',
  'settings',
];

/** True when the popup's centre and every corner-ish probe point hit the popup itself. */
const probe = () =>
  page.evaluate(() => {
    const list = document.querySelector('.shell-goals__list');
    if (!list || list.hidden) return { ok: false, why: 'popup not shown' };
    const r = list.getBoundingClientRect();
    const pts = [
      [r.left + r.width / 2, r.top + 12],
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 12, r.bottom - 8],
    ];
    for (const [x, y] of pts) {
      const el = document.elementFromPoint(x, y);
      if (!el || !list.contains(el)) {
        return {
          ok: false,
          why: `covered at ${Math.round(x)},${Math.round(y)} by ${el?.className}`,
        };
      }
    }
    return { ok: true, why: '' };
  });

let failed = 0;
for (const id of views) {
  // back to the table, then open the view
  await page.evaluate(() => {
    if (document.querySelector('.shell-goals__list:not([hidden])'))
      document.querySelector('.shell-goals__btn')?.click();
    document.querySelector('.vh-back')?.click();
  });
  await page.waitForTimeout(500);
  if (id) {
    await page.evaluate((v) => document.querySelector(`[data-open="${v}"]`)?.click(), id);
    await page.waitForTimeout(600);
  }
  await page.click('.shell-goals__btn');
  await page.waitForTimeout(250);
  const res = await probe();
  console.log(`${res.ok ? 'ok  ' : 'FAIL'} ${id ?? 'table'}${res.why ? ` (${res.why})` : ''}`);
  if (!res.ok) failed++;
}
await browser.close();
process.exit(failed ? 1 : 0);
