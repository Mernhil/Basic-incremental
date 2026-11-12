// Screenshots the top-tier weapon looks in the running dev app (DESIGN.md §5 Weapon looks, ASSET_RULES.md
// §5 Top-tier looks): every Prismatic, Mythic, Void and Heirloom picture on its real card in the Cards
// panel (one element shot per card, named `<type>-<tier>-<step>[-<side>]`, for the contact sheets), the
// Cards panel grids, the Next tier previews and duel hands, at 100% and 150% (DevTools emulation,
// 1280 x 720). It replaces the dev save, so use a profile:
// `BI_PROFILE=toptier npx electron-vite dev -- --remote-debugging-port=9455`, then
// `node scripts/shoot-top-tier-looks.mjs [port] [outDir] [tiles|panel|preview|duel|all]`.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9455';
const out = process.argv[3] ?? 'design/shots/top-tier';
const what = process.argv[4] ?? 'all';
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

const TYPES = [
  'sword',
  'greatsword',
  'spear',
  'lance',
  'hammer',
  'scythe',
  'pickaxe',
  'logging_axe',
];
const ALL = [...TYPES, 'dagger', 'bow', 'staff'];
// one Mythic-side and one Void-side card per type (the look follows the card's side at T6)
const SIDE_CARD = {
  sword: ['dawn_champion', 'shadow_reaver'],
  greatsword: ['sunbreaker_titan', 'ruin_tyrant'],
  spear: ['valor_pikeman', 'wraith_impaler'],
  lance: ['seraph_lancer', 'dread_horseman'],
  hammer: ['thunder_smith', 'grave_hammerer'],
  scythe: ['mercy_harvester', 'grim_sovereign'],
  pickaxe: ['lodestone_seer', 'core_titan'],
  logging_axe: ['moonwood_dryad', 'rotwood_sovereign'],
  dagger: ['gleam_phantom', 'venom_stalker'],
  bow: ['seraph_archer', 'wither_huntress'],
  staff: ['sanctum_oracle', 'hex_warlock'],
};

/** Replaces the save: every card in `owned` ({ id: [tier, stars] }), and an optional duel team. */
const setup = async (owned, team, dungeon) => {
  await page.evaluate(
    async ({ data, game, dev, owned, team, dungeon }) => {
      const d = await import(data);
      const g = await import(game);
      const cheats = await import(dev);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      for (const [id, [tier, stars]] of Object.entries(owned))
        s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level: 20 };
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
      owned,
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

const openCards = async () => {
  await page.click('[data-open="cards"]');
  await page.addStyleTag({ content: '.st-toast, .st-toasts { display: none !important; }' });
  await page.waitForSelector('.cp-tile');
  await page.waitForTimeout(900);
};
const emulate = (scale) =>
  cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: scale,
    mobile: false,
  });
/** Screenshot of one card tile (the real card face in the Cards panel). */
const tileShot = async (id, path) => {
  const loc = page.locator(`[data-key="tile-${id}"]`);
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const box = await loc.boundingBox();
  await shot(path, { x: box.x, y: box.y, width: box.width, height: box.height });
};

// the rounds: [tier, stars, label]; every type's cards sit at that tier and those stars
const ROUNDS = [
  ...[1, 2, 3, 4, 5].map((s) => ['prismatic', s]),
  ...[1, 2, 3, 4, 5, 6].map((s) => ['mythic', s]),
  ['heirloom', 1],
];

for (const scale of what === 'tiles' ? [1.5] : [1, 1.5]) {
  const tag = scale === 1 ? '100' : '150';
  await emulate(scale);

  if (what === 'tiles' || what === 'all') {
    for (const [tier, stars] of ROUNDS) {
      const owned = {};
      for (const k of ALL) for (const id of SIDE_CARD[k]) owned[id] = [tier, stars];
      await setup(owned);
      await openCards();
      for (const k of ALL) {
        for (const [i, side] of ['m', 'v'].entries()) {
          const id = SIDE_CARD[k][i];
          const name = `${k}-${tier}-${stars - 1}-${side}`;
          await tileShot(id, `${out}/tiles-${tag}/${name}.png`);
        }
      }
      console.log('tiles', tier, stars, tag);
    }
  }
  if (what === 'preview' || what === 'all') {
    // the Next tier preview: Gold -> Prismatic, Prismatic -> Mythic (Mythic side) and Prismatic -> Void (Void side)
    for (const [tier, id, name] of [
      ['gold', 'dawn_champion', 'gold-to-prismatic'],
      ['prismatic', 'dawn_champion', 'prismatic-to-mythic'],
      ['prismatic', 'shadow_reaver', 'prismatic-to-void'],
    ]) {
      await setup({ [id]: [tier, 6] });
      await openCards();
      await page.click(`[data-key="tile-${id}"]`);
      await page.waitForTimeout(350);
      await page.getByText('Next tier', { exact: true }).click();
      await page.waitForTimeout(450);
      await shot(`${out}/preview-${tag}-${name}.png`);
    }
  }
  if (what === 'duel' || what === 'all') {
    for (const [n, team] of [
      ['mythic', ['dawn_champion', 'sunbreaker_titan', 'valor_pikeman', 'seraph_lancer']],
      ['void', ['shadow_reaver', 'ruin_tyrant', 'wraith_impaler', 'dread_horseman']],
      ['mythic2', ['thunder_smith', 'mercy_harvester', 'lodestone_seer', 'moonwood_dryad']],
      ['void2', ['grave_hammerer', 'grim_sovereign', 'core_titan', 'rotwood_sovereign']],
    ]) {
      const owned = {};
      for (const id of team) owned[id] = ['mythic', 6];
      await setup(owned, team, 'ember_crypt');
      await page.click('[data-open="dungeon"]');
      await page.waitForTimeout(3200);
      await shot(`${out}/duel-${tag}-${n}.png`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }
}
console.log('done');
process.exit(0);
