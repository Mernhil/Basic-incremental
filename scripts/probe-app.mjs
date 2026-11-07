// Evaluates an expression in the running app (debugging). Start the app with
// `npx electron-vite dev -- --remote-debugging-port=9333`.
// Usage: node scripts/probe-app.mjs "<expression>" [port]
import { chromium } from 'playwright';

const [code, port = '9333'] = process.argv.slice(2);
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
console.log(JSON.stringify(await page.evaluate(code), null, 1));
await browser.close();
