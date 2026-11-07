// Opens the built standalone page (no dev server) and checks it works on its own:
// no errors, no non-data asset loads, animations run, the still toggle and B10 tabs work, and
// no horizontal page scroll at phone width. Usage: node design/wardrobe-options/check.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(here, 'wardrobe-options.html')).href;
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('data:') && !u.startsWith('file:') && !u.includes('fonts.g')) errors.push(`load ${u}`);
});
await page.goto(url);
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const amb = document.querySelector('.lab-row[data-b8="c"] .bi-amb--border i');
  const before = getComputedStyle(amb).animationName;
  document.querySelector('.lab-toggle').click();
  const still = getComputedStyle(amb).animationName;
  document.querySelector('.lab-toggle').click();
  document.querySelector('.lab-tab[data-opt="d"]').click();
  return {
    anim: before,
    stillAnim: still,
    b10: document.querySelector('.lab-wd').dataset.b10,
    note: document.querySelector('.lab-tabnote').textContent.slice(0, 30),
    running: document.getAnimations().length,
    maxParticles: Math.max(
      ...[...document.querySelectorAll('.lab-row .bi-card')].map(
        (c) => [...c.querySelectorAll('.bi-amb i')].filter((i) => getComputedStyle(i).display !== 'none' && getComputedStyle(i.parentElement).display !== 'none').length,
      ),
    ),
  };
});
await page.screenshot({ path: join(here, 'screens', 'page-top.png') });
await page.setViewportSize({ width: 400, height: 900 });
await page.waitForTimeout(300);
const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: join(here, 'screens', 'page-phone.png') });
console.log(JSON.stringify({ ...r, phoneOverflowPx: scroll, errors }, null, 1));
await browser.close();
