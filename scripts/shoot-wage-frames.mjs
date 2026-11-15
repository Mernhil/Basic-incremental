// Records the header Money counter across two kills: 6 frames ending just after the second kill's
// payout, with the shown text of each, so the number can be seen flat between kills and stepping at
// each one. Use a throwaway profile: `BI_PROFILE=wage BI_DEV_BUILD=1 npx electron-vite dev --
// --remote-debugging-port=9431 --mute-audio`, then `node scripts/shoot-wage-frames.mjs [port] [outDir]`.
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
const box = await page.evaluate(() => {
  const b = document.querySelector('.shell-currency--money').getBoundingClientRect();
  return {
    x: Math.max(0, b.left - 12),
    y: Math.max(0, b.top - 8),
    width: b.width + 24,
    height: b.height + 16,
  };
});
const caps = [];
const stepAt = [];
for (let i = 0; i < 600 && stepAt.length < 2; i++) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 },
  });
  const shown = await page.evaluate(() => {
    const chip = document.querySelector('.shell-currency--money');
    return `${chip.querySelector('.shell-currency__value').textContent} ${chip.querySelector('.shell-currency__name')?.textContent ?? ''}`;
  });
  if (caps.length && caps.at(-1).shown !== shown) stepAt.push(caps.length);
  caps.push({ data, shown, at: Date.now() });
  await page.waitForTimeout(100);
}
// before and after each kill's step, and the number flat between the two kills
const [s1, s2] = stepAt;
const pick = [s1 - 1, s1, Math.floor((s1 + s2) / 2), s2 - 1, s2, s2];
const frames = pick.map((i, k) => caps[k === 5 ? Math.min(caps.length - 1, i) : i]);
frames.forEach((f, i) => writeFileSync(`${out}/wage-${i + 1}.png`, Buffer.from(f.data, 'base64')));
console.log(
  JSON.stringify(
    frames.map((f, i) => ({ frame: i + 1, shown: f.shown, ms: f.at - caps[0].at })),
    null,
    1,
  ),
);
await browser.close();
