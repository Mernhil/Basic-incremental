// Records the header Money counter across two kills: for each kill 3 frames (as the coins land, 150 ms
// and 600 ms later) with the shown text and the "+N" that popped, so the number can be seen stepping
// at each win. Use a profile (see shoot-ui-fast-fixes.mjs): `node scripts/shoot-money-anim.mjs [port] [outDir]`.
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
    const chip = document.querySelector('.shell-currency--money');
    const v = chip.querySelector('.shell-currency__value').textContent;
    const n = chip.querySelector('.shell-currency__name')?.textContent ?? '';
    return {
      shown: `${v} ${n}`,
      gain: chip.querySelector('.shell-currency__gain')?.textContent ?? null,
    };
  });
const box = await page.evaluate(() => {
  const b = document.querySelector('.shell-currency--money').getBoundingClientRect();
  return {
    x: Math.max(0, b.left - 12),
    y: Math.max(0, b.top - 8),
    width: b.width + 24,
    height: b.height + 44,
  };
});
const frames = [];
let n = 0;
for (let kill = 1; kill <= 2; kill++) {
  // wait for the pop of the next win
  for (let i = 0; i < 3000; i++) {
    if ((await read()).gain) break;
    await page.waitForTimeout(15);
  }
  const t0 = Date.now();
  for (const wait of [0, 150, 600]) {
    const left = wait - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...box, scale: 1 },
    });
    const s = await read();
    n++;
    writeFileSync(`${out}/money-anim-${n}.png`, Buffer.from(data, 'base64'));
    frames.push({ frame: n, kill, ms: Date.now() - t0, shown: s.shown, gain: s.gain });
  }
  // let the pop go before waiting for the next win
  await page.waitForTimeout(1200);
}
console.log(JSON.stringify(frames, null, 1));
await browser.close();
