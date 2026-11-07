// Screenshots one page of the running Electron app (art checks on the real screen).
// Start the app with: npx electron-vite dev -- --remote-debugging-port=9333
// Usage: node scripts/art/shoot-page.mjs <page> <outFile> [port]
// <page> is a sidebar entry's data-page (home, cards, production, dungeons, ...).
import { chromium } from 'playwright';

const [name = 'home', out = 'design/pixel/page.png', port = '9333'] = process.argv.slice(2);
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts().flatMap((c) => c.pages())[0];
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell-rail__item');
const away = page.locator('.away button');
if (await away.count()) await away.first().click();
await page.click(`.shell-rail__item[data-page="${name}"]`);
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
console.log(`saved ${name} to ${out}`);
