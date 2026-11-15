// Screenshots the quest popup (DESIGN.md §10 Quests) in the running dev app: with a claimable quest
// opened in the Summon view and in the Dungeon view, right after a claim, and the "see all" list,
// each at 1920x1010 and 1280x720. It replaces the dev save of the profile you run it against.
// Start: `BI_PROFILE=quests npx electron-vite dev -- --remote-debugging-port=9461 --mute-audio`,
// then `node scripts/shoot-quests.mjs [port] [outDir]`.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9461';
const out = process.argv[3] ?? 'design/options/quests';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const mute = () =>
  page.evaluate(() =>
    document.querySelectorAll('audio,video').forEach((m) => {
      m.muted = true;
    }),
  );

async function load() {
  await page.evaluate(
    async ({ data, game }) => {
      const d = await import(data);
      const g = await import(game);
      const content = d.loadContent();
      const s = g.createInitialState(content);
      s.portals['card_portal'] = { pulls: 3, pity: 3, pityHits: 0 };
      s.stats.bossKills = 4;
      s.combat.stageKills['mossy_cellar:normal:10'] = 2;
      s.combat.floors['mossy_cellar'] = {
        difficulty: 'normal',
        autoChallenge: true,
        tiers: { normal: { floor: 5, best: 5 } },
      };
      s.account.level = 2;
      for (const id of ['ember_squire', 'apprentice_feller', 'cave_digger', 'stable_squire'])
        s.cards.owned[id] ??= g.newOwnedCard();
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
  );
  await page.reload();
  await page.waitForSelector('.shell');
  await page.evaluate(() => document.querySelector('.away button')?.click());
  await mute();
  await page.waitForTimeout(2500);
}

async function shoot(name, size, view, step) {
  await page.setViewportSize(size).catch(() => undefined);
  await page.evaluate(() => {
    if (!document.querySelector('.shell-goals__list')?.hidden)
      document.querySelector('.shell-goals__btn')?.click();
    document.querySelector('.vh-back')?.click();
  });
  await page.waitForTimeout(500);
  if (view) {
    await page.evaluate((v) => document.querySelector(`[data-open="${v}"]`)?.click(), view);
    await page.waitForTimeout(700);
  }
  await page.click('.shell-goals__btn');
  await page.waitForTimeout(400);
  if (step) await step();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-${size.width}x${size.height}.png` });
}

const sizes = [
  { width: 1920, height: 1010 },
  { width: 1280, height: 720 },
];
for (const size of sizes) {
  await load();
  await shoot('popup-summon', size, 'summon');
  await shoot('popup-dungeon', size, 'dungeon');
  await shoot('see-all', size, 'summon', async () => {
    await page.click('.shell-quest__see');
    await page.waitForTimeout(300);
  });
  await shoot('after-claim', size, 'summon', async () => {
    await page.click('.shell-quest__claim');
    await page.waitForTimeout(300);
  });
}
console.log('shot');
await browser.close();
