// Screenshots the weapon looks in the running dev app (DESIGN.md §5 Weapon looks, ASSET_RULES.md §5
// Straight pictures): the Cards panel with all eight concept-sheet types at Wood, Bronze, Silver and
// Gold, the Next tier preview of a Silver card of each type, and a duel hand, at 100% and 150% (DevTools
// emulation, 1280 x 720). It replaces the dev save, so use a profile:
// `BI_PROFILE=weaponlooks npx electron-vite dev -- --remote-debugging-port=9433`, then
// `node scripts/shoot-weapon-looks.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9433';
const out = process.argv[3] ?? 'design/shots/weapon-looks';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');
const cdp = await page.context().newCDPSession(page);
const shot = async (path, clip) => {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  });
  writeFileSync(path, Buffer.from(data, 'base64'));
};

// per type, four cards of rising rarity at Wood ★1, Bronze ★4, Silver ★5 and Gold ★6
const CARDS = {
  sword: ['brass_vanguard', 'silver_cavalier', 'gilded_knight', 'prism_paladin'],
  greatsword: ['bronze_warden', 'silver_executioner', 'gold_warlord', 'dawnblade_regent'],
  dagger: ['bronze_sneak', 'silver_shiv', 'storm_duelist', 'whisper_assassin'],
  hammer: ['bronze_forgehand', 'silver_sledger', 'golden_anvilmaster', 'facet_crusher'],
  lance: ['bronze_jouster', 'silver_rider', 'golden_tilter', 'mirror_cavalier'],
  bow: ['bronze_hunter', 'silver_ranger', 'golden_sharpshot', 'rainbow_sniper'],
  scythe: ['bronze_gleaner', 'reaper_test', 'golden_harvester', 'halfmoon_reaper'],
  logging_axe: ['moss_forager', 'grove_keeper', 'elder_treant', 'heartwood_warden'],
};
const STEPS = [
  ['wood', 1],
  ['bronze', 4],
  ['silver', 5],
  ['gold', 6],
];
const TEAMS = [
  ['prism_paladin', 'silver_executioner', 'bronze_sneak', 'brass_vanguard'],
  ['mirror_cavalier', 'rainbow_sniper', 'halfmoon_reaper', 'silver_sledger'],
];

const setup = async (team, dungeon) => {
  await page.evaluate(
    async ({ data, game, dev, CARDS, STEPS, team, dungeon }) => {
      const d = await import(data);
      const g = await import(game);
      const cheats = await import(dev);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      for (const ids of Object.values(CARDS))
        ids.forEach((id, i) => {
          s.cards.owned[id] = {
            ...g.newOwnedCard(),
            tier: STEPS[i][0],
            stars: STEPS[i][1],
            level: 20,
          };
        });
      if (team) {
        s.activeDungeonId = dungeon;
        const placed = cheats.devSetFloor(s, content, dungeon, 3);
        if (placed.ok) s = placed.state;
        s.cards.loadouts.fighting = { main: team[0], supports: team.slice(1) };
      }
      s = g.checkAchievements(s, content).state;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    {
      data: fsUrl('src/data/index.ts'),
      game: fsUrl('src/game/index.ts'),
      dev: fsUrl('src/game/dev.ts'),
      CARDS,
      STEPS,
      team,
      dungeon,
    },
  );
  await page.reload();
  await page.waitForSelector('.shell');
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('.wb button, .away button');
    if (!btn) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
};

const scrollGrid = (y) =>
  page.evaluate((y) => {
    let el = document.querySelector('.cp-tile')?.parentElement;
    while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement;
    if (el) el.scrollTop = y;
  }, y);

for (const scale of [1, 1.5]) {
  const tag = scale === 1 ? '100' : '150';
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: scale,
    mobile: false,
  });

  // the Cards panel: all 32 cards, five screens
  await setup(null);
  await page.click('[data-open="cards"]');
  await page.addStyleTag({ content: '.st-toast, .st-toasts { display: none !important; }' });
  await page.waitForSelector('.cp-tile');
  await page.waitForTimeout(900);
  for (let i = 0; i < 5; i++) {
    await scrollGrid(i * 330);
    await page.waitForTimeout(350);
    await shot(`${out}/cards-${tag}-${i + 1}.png`);
  }

  // the Next tier preview of a Silver card of each type (it shows the next tier's BASE)
  let n = 0;
  for (const [type, ids] of Object.entries(CARDS)) {
    await scrollGrid(0);
    await page.locator(`[data-key="tile-${ids[2]}"]`).scrollIntoViewIfNeeded();
    await page.click(`[data-key="tile-${ids[2]}"]`);
    await page.waitForTimeout(350);
    await page.getByText('Next tier', { exact: true }).click();
    await page.waitForTimeout(450);
    const box = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll('.bi-card')) {
        const r = c.getBoundingClientRect();
        if (!best || r.width > best.width)
          best = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
      return best;
    });
    await shot(`${out}/preview-${tag}-${++n}-${type}.png`, {
      x: Math.max(0, box.x - 8),
      y: Math.max(0, box.y - 8),
      width: box.width + 16,
      height: box.height + 16,
    });
  }

  // a duel hand with four of the types
  let t = 0;
  for (const team of TEAMS) {
    await setup(team, 'ember_crypt');
    await page.click('[data-open="dungeon"]');
    await page.waitForTimeout(3200);
    await shot(`${out}/duel-${tag}-${++t}.png`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}
console.log('done');
process.exit(0);
