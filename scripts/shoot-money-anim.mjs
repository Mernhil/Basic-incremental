// Records the header Money counter right after a kill: 6 frames about 100 ms apart, with the shown
// text, and the settled (real) value once the glide is over. Use a profile (see
// shoot-ui-fast-fixes.mjs): `node scripts/shoot-money-anim.mjs [port] [outDir]`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9431';
const out = process.argv[3] ?? 'design/options/ui-fast-fixes';
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell-currency--money .shell-currency__value');
const cdp = await page.context().newCDPSession(page);
const read = () =>
  page.evaluate(() => {
    const v = document.querySelector('.shell-currency--money .shell-currency__value');
    const n = document.querySelector('.shell-currency--money .shell-currency__name');
    return { text: v.textContent, coin: n?.textContent ?? '', t: performance.now() };
  });
const box = await page.evaluate(() => {
  const b = document.querySelector('.shell-currency--money').getBoundingClientRect();
  return {
    x: Math.max(0, b.left - 12),
    y: Math.max(0, b.top - 8),
    width: b.width + 24,
    height: b.height + 16,
  };
});
// a payout makes the chip pulse (coins landed): that is the kill
await page.evaluate(() => {
  const chip = document.querySelector('.shell-currency--money');
  window.__pulse = 0;
  new MutationObserver(
    () => chip.classList.contains('is-pulsing') && (window.__pulse = performance.now()),
  ).observe(chip, { attributes: true, attributeFilter: ['class'] });
});
const before = await read();
let kill = false;
for (let i = 0; i < 1500 && !kill; i++) {
  await page.waitForTimeout(20);
  kill = (await page.evaluate(() => window.__pulse)) > 0;
}
const frames = [{ frame: 0, shown: `${before.text} ${before.coin} (before the payout)` }];
const t0 = Date.now();
for (let i = 0; i < 6; i++) {
  const wait = i * 100 - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 2 },
  });
  const s = await read();
  writeFileSync(`${out}/money-anim-${i + 1}.png`, Buffer.from(data, 'base64'));
  frames.push({ frame: i + 1, ms: Date.now() - t0, shown: `${s.text} ${s.coin}` });
}
await page.waitForTimeout(1500);
const settled = await read();
const result = { kill, frames, settled: `${settled.text} ${settled.coin}` };

// a bigger lump through the Dev panel's Grant (a kill's payout is too small to see): Money +300
const lump = process.argv[4] ?? '300';
if (!(await page.$('.dev-panel__button:visible'))) await page.click('.dev-toggle');
await page.selectOption('select[aria-label="Resource"]', { value: 'money' });
await page.fill('input[aria-label="Amount"]', lump);
await page.evaluate(() => {
  window.__series = [];
  const v = document.querySelector('.shell-currency--money .shell-currency__value');
  const loop = () => {
    window.__series.push([Math.round(performance.now()), v.textContent]);
    requestAnimationFrame(loop);
  };
  loop();
});
const lumpBefore = await read();
await page.click('.dev-panel__button:text-is("Grant")');
const l0 = Date.now();
const lumpFrames = [];
for (let i = 0; i < 6; i++) {
  const wait = i * 100 - (Date.now() - l0);
  if (wait > 0) await page.waitForTimeout(wait);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 2 },
  });
  const sh = await read();
  writeFileSync(`${out}/money-anim-lump-${i + 1}.png`, Buffer.from(data, 'base64'));
  lumpFrames.push({ frame: i + 1, ms: Date.now() - l0, shown: `${sh.text} ${sh.coin}` });
}
await page.waitForTimeout(1200);
const lumpSettled = await read();
const series = await page.evaluate(() => window.__series);
result.lump = {
  before: `${lumpBefore.text} ${lumpBefore.coin}`,
  frames: lumpFrames,
  settled: `${lumpSettled.text} ${lumpSettled.coin}`,
  distinctShown: new Set(series.map((x) => x[1])).size,
};
console.log(JSON.stringify(result, null, 1));
await browser.close();
