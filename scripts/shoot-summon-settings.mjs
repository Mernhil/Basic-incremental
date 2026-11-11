// Screenshots Summon (with a last hand) and Settings (UI_RULES.md §2) at 1280x720 and 1920x1080
// with a seeded save: crystals to pull with, pity part-way. It replaces the dev save, so use a
// profile: `BI_PROFILE=rework3a npx electron-vite dev -- --remote-debugging-port=9411`, then
// `node scripts/shoot-summon-settings.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9411';
const out = process.argv[3] ?? 'design/shots/ui-rework-3';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/[\\]/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    s.clearedDungeons = ['mossy_cellar'];
    s.resources.summon_scroll = s.resources.summon_scroll.mul(0).add(1000);
    s.resources.glamour_scroll = s.resources.glamour_scroll.mul(0).add(230);
    s.resources.money = s.resources.money.mul(0).add(5e6);
    s.portals.card_portal = { pity: 62, pulls: 62, pityHits: 0 };
    s.portals.wardrobe_gate = { pity: 21, pulls: 21, pityHits: 0 };
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="summon"]');
await page.waitForSelector('.sm-table');

const sizes = [
  [1280, 720],
  [1920, 1080],
];
const shoot = async (name) => {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h }).catch(() => undefined);
    await page.waitForTimeout(1200);
    await page.mouse.move(700, 5);
    // achievement toasts from the seeded save would cover the corner
    await page.evaluate(() => document.querySelectorAll('.st-toast').forEach((e) => e.remove()));
    await page.screenshot({ path: `${out}/${name}-${w}x${h}.png` });
  }
};
await page.setViewportSize({ width: 1280, height: 720 }).catch(() => undefined);
await page.waitForTimeout(800);
await shoot('summon-empty');

// a 10-pull from the Card Portal: the reveal half-way, skip, done, then the hand
await page.setViewportSize({ width: 1280, height: 720 }).catch(() => undefined);
await page.waitForTimeout(600);
await page.click('.sm-deck[data-portal="card_portal"] .sm-pull--ten');
await page.waitForSelector('.rv.is-ready', { timeout: 5000 });
await page.waitForTimeout(1800);
await page.click('.rv__row');
await page.waitForTimeout(250);
await page.click('.rv__row');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/summon-reveal-1280x720.png` });
await page.keyboard.press('Escape');
await page.waitForSelector('.rv__done:not([hidden])');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
console.log(
  'focus after the reveal:',
  await page.evaluate(() => document.activeElement?.className),
);
await shoot('summon');

// a single Wardrobe Gate pull: a cosmetic in the hand
await page.setViewportSize({ width: 1280, height: 720 }).catch(() => undefined);
await page.click('.sm-deck[data-portal="wardrobe_gate"] .sm-pull:not(.sm-pull--ten)');
await page.waitForSelector('.rv.is-ready', { timeout: 5000 });
await page.waitForTimeout(1200);
await page.click('.rv__row');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/summon-reveal-wardrobe-1280x720.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.mouse.move(700, 5);
await page.screenshot({ path: `${out}/summon-wardrobe-hand-1280x720.png` });

await page.click('[data-open="settings"]');
await page.waitForSelector('.set-grid');
await shoot('settings');
console.log('errors', errors);
await browser.close();
