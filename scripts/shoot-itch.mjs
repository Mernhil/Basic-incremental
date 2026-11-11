// Screenshots the itch asset packs in the game (docs/plans/itch-assets.md): the duel with a normal
// enemy, a mini-boss and the boss of each dungeon, the header coins, the Achievements book and
// Settings > Help > Credits, at 1280 x 720. It replaces the dev save, so use a profile:
// `BI_PROFILE=itchart npx electron-vite dev -- --remote-debugging-port=9440`, then
// `node scripts/shoot-itch.mjs [port] [outDir] [scale]`.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9440';
const out = process.argv[3] ?? 'design/options/ui-layouts-built/itch';
const scale = Number(process.argv[4] ?? 1);
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/[\\]/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.waitForSelector('.shell');
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: scale,
  mobile: false,
});
const tag = scale === 1 ? '100' : String(scale * 100);
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};

const setup = async (opts) => {
  await page.evaluate(
    async ({ data, game, dev, opts }) => {
      const d = await import(data);
      const g = await import(game);
      const cheats = await import(dev);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      s.activeDungeonId = opts.dungeon;
      for (const id of opts.cleared ?? []) s.clearedDungeons.push(id);
      const placed = cheats.devSetFloor(s, content, opts.dungeon, opts.floor);
      if (placed.ok) s = placed.state;
      s.combat.floors[opts.dungeon].autoChallenge = false;
      const team = ['quarry_smasher', 'ember_squire', 'hedge_acolyte', 'hex_warlock'];
      for (const id of team) s.cards.owned[id] ??= g.newOwnedCard();
      for (const owned of Object.values(s.cards.owned)) owned.level = 18;
      s.cards.loadouts.fighting = { main: team[0], supports: team.slice(1) };
      if (opts.money) s.resources.money = g.Decimal ? new g.Decimal(opts.money) : opts.money;
      if (opts.achievements) {
        content.achievements.slice(0, opts.achievements).forEach((a, i) => {
          if (i % 4 !== 3) s.achievements[a.id] = 3600000 * (i + 1);
        });
      }
      s = g.checkAchievements(s, content).state;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    {
      data: fsUrl('src/data/index.ts'),
      game: fsUrl('src/game/index.ts'),
      dev: fsUrl('src/game/dev.ts'),
      opts,
    },
  );
  await page.reload();
  await page.waitForSelector('.tbl-pile');
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button');
    if (!btn) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};

const settle = async () => {
  await page
    .waitForFunction(() => document.querySelector('.du-foe')?.getAnimations().length === 0, null, {
      timeout: 4000,
      polling: 50,
    })
    .catch(() => undefined);
};

const dungeons = [
  ['mossy_cellar', 10, []],
  ['ember_crypt', 20, ['mossy_cellar']],
  ['frostspire_vault', 30, ['mossy_cellar', 'ember_crypt']],
  ['thunderpeak_aerie', 40, ['mossy_cellar', 'ember_crypt', 'frostspire_vault']],
  ['sunken_sanctum', 50, ['mossy_cellar', 'ember_crypt', 'frostspire_vault', 'thunderpeak_aerie']],
  [
    'void_hollow',
    60,
    ['mossy_cellar', 'ember_crypt', 'frostspire_vault', 'thunderpeak_aerie', 'sunken_sanctum'],
  ],
];
for (const [id, last, cleared] of dungeons) {
  for (const [kind, floor] of [
    ['wave', 4],
    ['wave2', 7],
    ['mini', 10],
    ['boss', last],
  ]) {
    if (kind === 'mini' && last === 10) continue;
    await setup({ dungeon: id, floor, cleared, money: '123456789' });
    await page.waitForTimeout(2200);
    await settle();
    await shot(`${out}/duel-${id}-${kind}-${tag}.png`);
  }
}
// the full view of a boss and of a wave
await setup({ dungeon: 'thunderpeak_aerie', floor: 40, cleared: dungeons[3][2] });
await page.click('[data-open="dungeon"]');
await page.waitForTimeout(2200);
await shot(`${out}/view-boss-${tag}.png`);
await page.keyboard.press('Escape');

// the header: coins and crystals
await setup({ dungeon: 'mossy_cellar', floor: 4, money: '45000000000' });
await page.waitForTimeout(1500);
await page.screenshot({
  path: `${out}/header-${tag}.png`,
  clip: { x: 0, y: 0, width: 1280, height: 90 },
});

// the achievement book
await setup({ dungeon: 'mossy_cellar', floor: 2, achievements: 66 });
await page.click('[data-open="achievements"]');
await page.waitForSelector('.ac-cover');
await page.waitForTimeout(800);
const open = await page.$('.ac-cover');
await open?.click().catch(() => {});
await page.waitForTimeout(1500);
await shot(`${out}/achievements-${tag}.png`);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// Settings > Help > Credits
await page.click('[data-open="settings"]');
await page.waitForTimeout(800);
await page.click('.set-credits summary').catch(() => undefined);
await page.waitForTimeout(500);
await shot(`${out}/credits-${tag}.png`);
console.log(errors.length ? `errors: ${errors.join('\n')}` : 'no page errors');
await browser.close();
