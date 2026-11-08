// Screenshots one region of the running app: node clip.mjs out.png x y w h
import { chromium } from 'playwright';

const [out, x, y, w, h] = process.argv.slice(2);
const browser = await chromium.connectOverCDP(`http://localhost:${process.env.BI_PORT ?? '9444'}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.mouse.move(2, 2);
await page.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h } });
await browser.close();
