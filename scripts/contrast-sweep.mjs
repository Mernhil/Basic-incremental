// Contrast sweep of the screen as it is drawn: for every visible text element it takes the computed text
// colour and the most common pixel colour behind it (from a screenshot) and lists the pairs under WCAG AA.
// Usage: node scripts/contrast-sweep.mjs [port] ; the game must already show the view.
import { chromium } from 'playwright';
import { sweep } from './lib/contrast.mjs';

const browser = await chromium.connectOverCDP(`http://localhost:${process.argv[2] ?? '9492'}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
const { total, bad } = await sweep(page);
console.log(`${total} text elements, ${bad.length} under AA`);
for (const b of bad) console.log(JSON.stringify(b));
await browser.close();
process.exit(0);
