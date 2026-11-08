// Screenshots the Cards page and the dungeon drawer in the running dev app, in the states of the
// weapon panel mockups. Start the app with
//   BI_PROFILE=uicards npx electron-vite dev -- --remote-debugging-port=9444
// build the saves with `npx tsx design/cards-weapon-panel/make-saves.ts > design/cards-weapon-panel/saves.json`
// then: node design/cards-weapon-panel/shoot.mjs <state> <page> <out.png> [width height dpr] [select]
//   state: collection | mid | ok | short | sigil | uniq | nouniq | done | fresh
//   page : cards | dungeons
//   select: a card id to click in the collection (default: the main card)
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [state, pageId, out, w = '1280', h = '820', dpr = '1', select = ''] = process.argv.slice(2);
const saves = JSON.parse(readFileSync(new URL('./saves.json', import.meta.url), 'utf8'));
const port = process.env.BI_PORT ?? '9444';
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function dismiss() {
  for (let i = 0; i < 6; i++) {
    const b = page.locator('.wb button').last();
    if (!(await b.count())) return;
    await b.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}
const cdp = await page.context().newCDPSession(page);
async function emulate() {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: Number(w),
    height: Number(h),
    deviceScaleFactor: Number(dpr),
    mobile: false,
  });
  // the emulation changes the ratio without a resize event (a real zoom fires one)
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
}
await emulate();

await dismiss();
if (state !== 'keep') {
  await page.click('.shell-rail__item[data-page="settings"]');
  await page.fill('textarea.set-text', saves[state]);
  await page.click('button:has-text("Import save")');
  await page.click('button:has-text("Replace my game")');
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('.shell-rail__item', { timeout: 20000 });
  await emulate();
  await dismiss();
}
await page.click(`.shell-rail__item[data-page="${pageId}"]`);
await page.waitForTimeout(700);
if (pageId === 'dungeons') {
  const open = await page.getAttribute('.dp-drawer__handle', 'aria-expanded');
  if (open !== 'true') await page.click('.dp-drawer__handle');
  await page.waitForTimeout(700);
}
if (pageId === 'cards' && select) {
  await page.click(`[data-key="tile-${select}"]`);
  await page.waitForTimeout(300);
}
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.mouse.move(2, 2);
// the CDP capture keeps the emulated pixel ratio (page.screenshot resets it)
const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(
  JSON.stringify({
    dpr: await page.evaluate(() => window.devicePixelRatio),
    viewport: await page.evaluate(() => [innerWidth, innerHeight]),
    errors,
  }),
);
await browser.close();
