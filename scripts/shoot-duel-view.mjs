// Screenshots the duel's look (table update 9a; UI_RULES.md §2 The duel's layout, The dungeon full
// view) at 1280 × 720 CSS px, at 100% and 150% (DevTools emulation): the table with the duel in its
// window, the full view mid-fight, a skill plate, a knocked-out card, the boss, and the Dungeons and
// Training panels, with a team of four. It replaces the dev save, so use a profile:
// `BI_PROFILE=duel9a npx electron-vite dev -- --remote-debugging-port=9431`, then
// `node scripts/shoot-duel-view.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9431';
const out = process.argv[3] ?? 'design/options/ui-layouts-built/9a';
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

/** Writes a save: a team of four in `dungeon` on `floor`; `out` cards knocked out; `level` cards. */
const setup = async (opts) => {
  await page.evaluate(
    async ({ data, game, dev, opts }) => {
      const d = await import(data);
      const g = await import(game);
      const cheats = await import(dev);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      s.activeDungeonId = opts.dungeon;
      s.clearedDungeons.push('mossy_cellar');
      const placed = cheats.devSetFloor(s, content, opts.dungeon, opts.floor);
      if (placed.ok) s = placed.state;
      s.combat.floors[opts.dungeon].autoChallenge = false;
      const team = ['quarry_smasher', 'ember_squire', 'hedge_acolyte', 'hex_warlock'];
      for (const id of team) s.cards.owned[id] ??= g.newOwnedCard();
      for (const owned of Object.values(s.cards.owned)) owned.level = opts.level ?? 18;
      s.cards.loadouts.fighting = { main: team[0], supports: team.slice(1) };
      s.combat.cardsOut = opts.out ?? [];
      // earn what the setup earns now, so no achievement toast covers the view
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

const cdp = await page.context().newCDPSession(page);
const shot = async (path) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
// waits until the enemy card is not being dealt (a wave dies fast)
const settle = async () => {
  await page
    .waitForFunction(() => document.querySelector('.du-foe')?.getAnimations().length === 0, null, {
      timeout: 4000,
      polling: 50,
    })
    .catch(() => undefined);
};
const openView = async () => {
  await page.click('[data-open="dungeon"]');
  await page.waitForTimeout(1200);
};

for (const scale of [1, 1.5]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: scale,
    mobile: false,
  });
  const tag = scale === 1 ? '100' : '150';

  // a wave on the Ember Crypt
  await setup({ dungeon: 'ember_crypt', floor: 4 });
  await page.waitForTimeout(3500);
  await settle();
  await shot(`${out}/table-${tag}.png`);
  await openView();
  await page.waitForTimeout(2500);
  await settle();
  await shot(`${out}/view-${tag}.png`);
  // a skill plate: wait for one to show (signatures fill in about 20 hits)
  try {
    await page.waitForSelector('.du-skill', { timeout: 40000 });
    await page.waitForTimeout(250);
    await shot(`${out}/skill-${tag}.png`);
  } catch {
    console.log('no skill plate within 40 s');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // a knocked-out card, and the boss: the Mossy Cellar's last floor
  await setup({ dungeon: 'mossy_cellar', floor: 10, out: ['hex_warlock'], level: 12 });
  await openView();
  await page.waitForTimeout(2500);
  await shot(`${out}/boss-ko-${tag}.png`);
  // the boss in the table's window too
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  await shot(`${out}/table-boss-${tag}.png`);
  await openView();

  // the panels
  await page.click('[data-key="panel-dungeons"]');
  await page.waitForTimeout(900);
  await shot(`${out}/dungeons-${tag}.png`);
  await page.click('[data-key="panel-training"]');
  await page.waitForTimeout(900);
  await shot(`${out}/training-${tag}.png`);
  await page.click('[data-key="panel-weapon"]');
  await page.waitForTimeout(900);
  await shot(`${out}/weapon-${tag}.png`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const still = await page.evaluate(
    () => document.querySelector('.vh-view:not([hidden])')?.dataset.view ?? null,
  );
  console.log(tag, 'after Esc on a panel the view is', still);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
