// Screenshots every place that draws stars (Dungeon fight HUD on a boss floor with stage stars, the
// Dungeons list and stage map, the Cards tier panel and star line, the Wardrobe and Achievements) at
// 1280x720 and 1920x1010, plus a zoomed crop of the HUD stage stars. Replaces the profile's save.
// Start: `BI_PROFILE=stars npx electron-vite dev -- --remote-debugging-port=9533 --mute-audio`
// Run: `node scripts/shoot-stars-everywhere.mjs [port] [outDir] [prefix]` (prefix: before | after).
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9533';
const out = process.argv[3] ?? '.';
const prefix = process.argv[4] ?? 'after';
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell', { state: 'attached' });
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    const dungeon = content.dungeons[0];
    const stages = g.stageFloors(content, dungeon);
    const kills = [1, 12, 130, 1500, 12000, 150000];
    for (const diff of ['normal', 'hard', 'nightmare'])
      stages.forEach((f, i) => {
        s.combat.stageKills[g.stageKey(dungeon.id, diff, f)] =
          kills[(i + (diff === 'normal' ? 2 : 0)) % 6];
      });
    s.combat.floors[dungeon.id] = {
      difficulty: 'normal',
      autoChallenge: true,
      tiers: { normal: { floor: stages[0], best: stages[0] } },
    };
    s.cards.owned.ember_squire = { ...g.newOwnedCard(), tier: 'silver', stars: 3, level: 30 };
    s.cards.owned.storm_duelist = { ...g.newOwnedCard(), tier: 'prismatic', stars: 4, level: 60 };
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell', { state: 'attached' });
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.addStyleTag({
  content: '.st-toasts{display:none!important}',
});
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => (m.muted = true)),
);
const sizes = [
  [1280, 720],
  [1920, 1010],
];
const shot = (tag, name) => page.screenshot({ path: `${out}/${tag}-${name}.png` });
const openDungeon = async () => {
  const hasWeapon = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button')].some(
        (x) => x.textContent.trim() === 'Weapon' && x.offsetParent && !x.closest('[inert]'),
      ),
    );
  if (!(await hasWeapon())) {
    await page.evaluate(() => document.querySelector('.tbl-open[data-open="dungeon"]')?.click());
    await page.waitForTimeout(1200);
  }
};
const clickText = async (text) => {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.textContent.trim() === t && x.offsetParent && !x.closest('[inert]'),
    );
    b?.click();
  }, text);
  await page.waitForTimeout(900);
};
for (const [w, hgt] of sizes) {
  await page.setViewportSize({ width: w, height: hgt });
  const tag = `${prefix}-${w}x${hgt}`;
  await openDungeon();
  await page.waitForTimeout(800);
  await shot(tag, 'dungeon-hud');
  const hud = await page.$('.du-stars');
  if (hud && w === 1280) {
    const b = await hud.boundingBox();
    await page.screenshot({
      path: `${out}/${prefix}-hud-stars-zoom.png`,
      clip: { x: Math.max(0, b.x - 20), y: Math.max(0, b.y - 10), width: 260, height: 40 },
    });
  }
  // Dungeons list and stage map
  await clickText('Dungeons');
  await shot(tag, 'dungeons-list');
  const cell = await page.$('.dp-cell');
  await page.evaluate(() =>
    document.querySelector('.dp-cell')?.scrollIntoView({ block: 'center' }),
  );
  await page.waitForTimeout(400);
  await shot(tag, 'stage-map');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // Weapon panel (tier panel, star line)
  await clickText('Weapon');
  await shot(tag, 'weapon-panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // Cards (tier panel and star line), Achievements, Wardrobe
  for (const view of ['cards', 'achievements', 'wardrobe']) {
    await page.evaluate(
      (v) => document.querySelector(`.tbl-pile[data-open="${v}"]`)?.click(),
      view,
    );
    await page.waitForTimeout(1500);
    if (view === 'cards') {
      await page.evaluate(() => document.querySelector('.cp-tile')?.click());
      await page.waitForTimeout(700);
    }
    await shot(tag, view);
    if (view === 'cards') {
      await page.evaluate(() =>
        document.querySelector('.wp--card')?.scrollIntoView({ block: 'center' }),
      );
      await page.waitForTimeout(500);
      await shot(tag, 'cards-tier-panel');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
  console.log(tag, 'hud', Boolean(hud), 'cell', Boolean(cell));
}
await browser.close();
