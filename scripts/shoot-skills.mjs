// Screenshots the Skill Tree page and the card star chart in the running dev app.
// `BI_PROFILE=ui8 npx electron-vite dev -- --remote-debugging-port=9334`, then
// `node scripts/shoot-skills.mjs [port] [outDir]`.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9334';
const out = process.argv[3] ?? 'design/app-screens/skills';
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined);
await page.waitForSelector('.shell');
await page.click('.shell-rail__item[data-page="skills"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/skills.png` });
const first = page.locator('.sk-node').first();
await first.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/skills-detail.png` });
await page.click('.shell-rail__item[data-page="cards"]');
await page.waitForTimeout(500);
await page
  .locator('.cp-card, .card')
  .first()
  .click()
  .catch(() => undefined);
await page.waitForTimeout(400);
await page
  .locator('.cp-enhance')
  .first()
  .screenshot({ path: `${out}/cards-chart.png` });
await browser.close();
