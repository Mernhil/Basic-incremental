// Screenshots the running Electron app through its DevTools port.
// Start the app with: npx electron-vite dev -- --remote-debugging-port=9222
// Usage: node scripts/shoot-app.mjs [outFile] [port]
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'design/app-screens/main.png';
const port = process.argv[3] ?? '9222';

const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts().flatMap((c) => c.pages())[0];
if (!page) throw new Error('No app window found');
await page.waitForSelector('.bi-card');
await page.waitForTimeout(1400); // let a hit and its tick numbers appear
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({
  title: document.querySelector('.shell-brand__name')?.textContent,
  page: document.querySelector('.vh-view:not([hidden])')?.dataset.view ?? 'table',
  bars: document.querySelector('.bi-hpstack__count')?.textContent,
  hp: document.querySelector('.bi-hpstack__text')?.textContent,
  away: document.querySelector('.away') !== null,
  cards: document.querySelectorAll('.table__loadout .bi-card').length,
  empty: document.querySelectorAll('.slot-empty').length,
}));
console.log(JSON.stringify(info));
await browser.close();
