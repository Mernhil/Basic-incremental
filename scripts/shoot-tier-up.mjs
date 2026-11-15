// Screenshots the tier-up stage: a Wood card at its level cap and 6 stars with every resource, then its
// tier-up button, at 1280x720. Replaces the dev save, so use a profile.
// Start: `BI_PROFILE=gridov npx electron-vite dev -- --remote-debugging-port=9512 --mute-audio`
// Run: `node scripts/shoot-tier-up.mjs [port] [outDir]`.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9512';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    s.cards.owned['dawnblade_regent'] = { ...g.newOwnedCard(), tier: 'wood', stars: 6, level: 20 };
    for (const r of content.resources) s.resources[r.id] = new g.Decimal('1e9');
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
const mute = page.locator('.snd-mute');
if ((await mute.count()) > 0 && (await mute.getAttribute('aria-pressed')) !== 'true')
  await mute.click();
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(1500);
await page.click('[data-open="cards"]');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.cp-tile')].find((x) =>
    x.textContent?.includes('Dawnblade'),
  );
  t?.click();
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/tier-up-0-card.png` });
console.log(
  await page.evaluate(() =>
    [...document.querySelectorAll('.wp-go, [data-key="wp-tier"]')].map(
      (e) => `${e.textContent}|${e.getAttribute('aria-disabled')}`,
    ),
  ),
);
await page.evaluate(() => document.querySelector('.wp-go')?.click());
for (const [i, ms] of [200, 400, 700, 1200].entries()) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `${out}/tier-up-${i + 1}.png` });
}
await browser.close();
