// Shoots the hub at 1274x815 and 1500x1000 with the map panned to both ends (drag + wheel), and
// reports for each size which of the 13 places can be brought fully on screen. Needs the dev app
// hidden + muted (see shoot-ui-scale.mjs): `node scripts/shoot-hub-pan.mjs [port] [outDir]`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9488';
const out = process.argv[3] ?? 'design/options/ui-scale/hub-pan';
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell', { state: 'attached' });
const cdp = await page.context().newCDPSession(page);
for (let i = 0; i < 20; i++) {
  // the welcome-back plate covers the hub until it is collected
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
};
const cuts = () =>
  page.evaluate(() => {
    const hub = document.querySelector('.hub__view').getBoundingClientRect();
    return [...document.querySelectorAll('[data-building]')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return (
          r.left < hub.left - 1 ||
          r.right > hub.right + 1 ||
          r.top < hub.top - 1 ||
          r.bottom > hub.bottom + 1
        );
      })
      .map((b) => b.dataset.building);
  });
for (const [w, h] of [
  [1274, 815],
  [1500, 1000],
]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.evaluate(() => document.querySelector('.vh-back')?.click());
  await page.evaluate(() => document.querySelector('[data-open="hub"]')?.click());
  await page.waitForTimeout(1000);
  const view = await page.evaluate(() => {
    const r = document.querySelector('.hub__view').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  });
  const reached = new Set();
  const seen = async () => {
    const cut = new Set(await cuts());
    const all = await page.evaluate(() =>
      [...document.querySelectorAll('[data-building]')].map((b) => b.dataset.building),
    );
    for (const b of all) if (!cut.has(b)) reached.add(b);
    return all.length;
  };
  let total = await seen('centre');
  await shot(`hub-${w}x${h}-centred`);
  await page.mouse.move(view.x, view.y);
  for (const [name, dx] of [
    ['panned-left-end', 4000],
    ['panned-right-end', -8000],
  ]) {
    // a drag along x, then the wheel along y (whichever axis the cover cut)
    await page.mouse.move(view.x, view.y);
    await page.mouse.down();
    await page.mouse.move(view.x + Math.sign(dx) * 300, view.y, { steps: 5 });
    await page.mouse.move(view.x + Math.sign(dx) * 600, view.y, { steps: 5 });
    await page.mouse.up();
    await page.mouse.move(view.x, view.y);
    await page.mouse.wheel(0, dx > 0 ? -4000 : 4000);
    await page.waitForTimeout(300);
    console.log(
      name,
      w,
      h,
      'cut:',
      (await cuts()).join(','),
      'stage left',
      await page.evaluate(() => document.querySelector('.hub__stage').style.left),
    );
    await seen(name);
    await shot(`hub-${w}x${h}-${name}`);
  }
  console.log(w, h, `places fully on screen at some pan: ${reached.size} / ${total}`);
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
