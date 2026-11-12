// Screenshots the Cards page in the running dev app with one card of each of the eight concept-sheet
// weapon types at four tier and star steps. It replaces the dev save of the profile you run it against.
// Start: `BI_PROFILE=weaponlooks npx electron-vite dev -- --remote-debugging-port=9433`, then
// `node scripts/shoot-weapon-looks.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
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
await page.evaluate(
  async ({ data, game, CARDS, STEPS }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    for (const ids of Object.values(CARDS))
      ids.forEach((id, i) => {
        s.cards.owned[id] = {
          ...g.newOwnedCard(),
          tier: STEPS[i][0],
          stars: STEPS[i][1],
          level: 20,
        };
      });
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), CARDS, STEPS },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="cards"]');
await page.addStyleTag({ content: '.st-toast, .st-toasts { display: none !important; }' });
await page.waitForSelector('.cp-tile');
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(800);
let n = 0;
for (const [type, ids] of Object.entries(CARDS)) {
  const tile = page.locator(`[data-key="tile-${ids[3]}"]`);
  await tile.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/cards-${++n}-${type}.png` });
}
// the Next tier preview of a Silver card (it must show Gold BASE)
await page.click(`[data-key="tile-${CARDS.sword[2]}"]`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/detail-sword-silver.png` });
console.log('done');
process.exit(0);
