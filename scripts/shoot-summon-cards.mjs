// Screenshots the summon screens that show cards (a pull, the reveal, the last hand, the Heirloom Gate)
// with T6 and Heirloom cards in the save, at 1280x720. Replaces the dev save, so use a profile.
// Start: `BI_PROFILE=gridov npx electron-vite dev -- --remote-debugging-port=9512 --mute-audio`
// Run: `node scripts/shoot-summon-cards.mjs [port] [outDir]`.
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
    s.resources['summon_scroll'] = new g.Decimal(200);
    s.resources['heirloom_scroll'] = new g.Decimal(200);
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
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
const mute = page.locator('.snd-mute');
if ((await mute.count()) > 0 && (await mute.getAttribute('aria-pressed')) !== 'true')
  await mute.click();
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const pullAndReveal = async (tag) => {
  await page.locator('.sm-pull--ten:visible').first().click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  await shot(`${tag}-reveal-dealt`);
  for (let i = 0; i < 6; i++) {
    await page
      .locator('.rv__row')
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(700);
  }
  await shot(`${tag}-reveal`);
  await page
    .getByRole('button', { name: 'Done' })
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(1000);
  await page
    .locator('.sm-hand')
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await shot(`${tag}-hand`);
};
await page.click('[data-open="summon"]');
await page.waitForTimeout(1500);
await pullAndReveal('1-card-portal');
await page.getByText('Heirloom Gate').first().click();
await page.waitForTimeout(900);
await pullAndReveal('2-heirloom-gate');
await browser.close();
