// Screenshots a page of the running app (juice pass, DESIGN.md 14) through its DevTools port.
// Start the app with: npx electron-vite dev -- --remote-debugging-port=9333
// Usage: node scripts/shoot-juice.mjs <page> <outFile> [port] [--drawer] [--fight]
//   --fight   starts the first open dungeon when nothing is being fought
//   --drawer  opens the Dungeons drawer before the shot
//   --keep    leaves the welcome-back fan open
//   --reload  reloads the window first
import { chromium } from 'playwright';

const [pageId = 'home', out = 'design/app-screens/juice.png', port = '9333'] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
if (flags.has('--reload')) {
  await page.reload();
  await page.waitForTimeout(2500);
}
await page.bringToFront();
await page.waitForSelector('.shell');
if (!flags.has('--keep'))
  await page.evaluate(() => document.querySelector('.away button, .wb__collect')?.click());
await page.evaluate(
  (id) => document.querySelector(`.shell-rail__item[data-page="${id}"]`)?.click(),
  pageId,
);
if (flags.has('--fight')) {
  await page.evaluate(() => {
    if (document.querySelector('.dp-floor--active')) return;
    document.querySelector('.dp-floor__fight')?.click();
  });
}
await page.evaluate((open) => {
  const drawer = document.querySelector('.dp-drawer');
  if (drawer && drawer.classList.contains('is-open') !== open)
    document.querySelector('.dp-drawer__handle')?.click();
}, flags.has('--drawer'));
await page.waitForTimeout(Number(process.env.SHOOT_WAIT ?? 1500));
// Keep one-shot popups (numbers, coins) alive for the shot: the screenshot itself may wait ~1s.
if (process.env.SHOOT_FREEZE)
  await page.evaluate(() => {
    const keep = ['st-num', 'st-coin', 'st-toast', 'ar-beam'];
    const remove = Element.prototype.remove;
    Element.prototype.remove = function () {
      if (keep.some((c) => this.classList?.contains(c))) return;
      remove.call(this);
    };
  });
if (process.env.SHOOT_WAIT_FOR)
  await page.waitForSelector(process.env.SHOOT_WAIT_FOR, { timeout: 8000 }).catch(() => {});
if (process.env.SHOOT_AFTER) await page.waitForTimeout(Number(process.env.SHOOT_AFTER));
// Freeze the one-shot stage animations mid-way so a slow, occluded window still shows them.
if (process.env.SHOOT_FREEZE)
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      if (a.effect?.getTiming().iterations === Infinity) continue;
      a.pause();
      a.currentTime = Number(t);
    }
  }, process.env.SHOOT_FREEZE);
// An occluded window draws about one frame a second; forcing frames keeps the animations moving.
for (let i = 0; i < Number(process.env.SHOOT_FRAMES ?? 10); i++) {
  await page.screenshot();
  await page.waitForTimeout(60);
}
await page.screenshot({ path: out });
console.log(JSON.stringify({ page: pageId, errors }));
await browser.close();
