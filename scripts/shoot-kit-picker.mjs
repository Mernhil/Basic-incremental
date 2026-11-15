// Screenshots the Loadouts card picker with cards at every tier, and reports which cards hide their kit.
// Replaces the dev save, so use a profile.
// Start: `BI_PROFILE=kitfix npx electron-vite dev -- --remote-debugging-port=9533 --mute-audio`
// Run: `node scripts/shoot-kit-picker.mjs [port] [outDir] [name] [borderId|none] [WxH]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [port = '9533', out = '.', name = 'picker', border = 'none', size = '1280x720'] =
  process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
page.setDefaultTimeout(180000);
await page.waitForSelector('.shell');
await page.evaluate(
  async ({ data, game, border }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    const own = (id, tier, stars, level) => {
      s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level };
    };
    for (const id of ['seraph_lancer', 'gleam_phantom', 'dawnblade_regent', 'whisper_assassin'])
      own(id, 'prismatic', 6, 100);
    own('prism_paladin', 'wood', 1, 1);
    own('halfmoon_reaper', 'wood', 1, 1);
    own('ember_squire', 'bronze', 2, 10);
    own('storm_duelist', 'silver', 3, 30);
    own('jade_vanguard', 'gold', 4, 60);
    own('violet_herald', 'mythic', 2, 110);
    own('solaris', 'heirloom', 3, 120);
    if (border !== 'none') {
      s.cosmetics.owned ??= {};
      s.cosmetics.loadout.slots.border = { id: border, level: 1 };
    }
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), border },
);
await page.reload();
await page.waitForSelector('.shell');
await page.getByRole('button', { name: 'Collect' }).click({ timeout: 8000 }).catch(() => {});
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.setViewportSize({ width: W, height: H });
await page.click('[data-open="cards"]');
await page.waitForTimeout(800);
await page.getByText('Loadouts', { exact: true }).first().click();
await page.waitForTimeout(800);
await page.locator('[data-key^="slot-"]').first().click();
await page.waitForTimeout(1200);
const info = await page.evaluate(() =>
  [...document.querySelectorAll('.cp-pick__card .bi-card')].map((c) => ({
    name: c.querySelector('.bi-card__name')?.textContent,
    kit: c.classList.contains('bi-card--kit'),
    worn: c.hasAttribute('data-border-worn'),
    frameDisplay: getComputedStyle(c.querySelector('.bi-card__frame') ?? c).display,
    cls: c.className,
  })),
);
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: `${out}/${name}.png` });
await browser.close();
