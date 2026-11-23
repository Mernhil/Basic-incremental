// Proves the app frame never scrolls ("when clicking on some buttons the whole UI goes up"): a
// control that sits past the frame's edge is focused the old way (no preventScroll) and the frame is
// scrolled by script; the header must stay at the top. `--old` puts the old overflow:hidden frame
// back first, so the failure shows (the header goes up by the focused control's distance).
// Needs the dev app hidden + muted (see shoot-ui-scale.mjs): `node scripts/check-ui-no-jump.mjs [port] [--old]`.
// It reloads the page when it is done. Exits 1 when the header moved.
import { chromium } from 'playwright';

const port = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '9488';
const old = process.argv.includes('--old');
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.shell', { state: 'attached' });
await page.waitForTimeout(1500);
if (old)
  await page.addStyleTag({
    content:
      'html, body, #app { overflow: visible !important; height: auto !important; } .shell { overflow: hidden !important; }',
  });
const r = await page.evaluate(() => {
  const shell = document.querySelector('.shell');
  const top = () => Math.round(document.querySelector('.shell-header').getBoundingClientRect().top);
  const b = document.createElement('button');
  b.style.cssText = `position:absolute;left:10px;top:${innerHeight + 300}px`;
  shell.appendChild(b);
  const before = top();
  b.focus();
  const afterFocus = top();
  shell.scrollTop = 60;
  document.scrollingElement.scrollTop = 60;
  const afterScroll = top();
  b.remove();
  shell.scrollTop = 0;
  return { overflow: getComputedStyle(shell).overflow, before, afterFocus, afterScroll };
});
console.log(old ? 'old frame' : 'new frame', JSON.stringify(r));
await page.reload({ waitUntil: 'domcontentloaded' });
await browser.close();
process.exit(r.before === r.afterFocus && r.before === r.afterScroll ? 0 : 1);
