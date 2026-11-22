// Screenshots the three-attack labels (DESIGN.md §2 Three attacks per card) in the running dev app:
// the effect words on the team's cards and on the enemy. It replaces the dev save, so use a profile:
// `BI_PROFILE=moves npx electron-vite dev -- --remote-debugging-port=9473 --mute-audio`, then
// `node scripts/shoot-moves.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9473';
const out = process.argv[3] ?? 'design/moves';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1240, height: 900 }).catch(() => undefined);
await page.waitForSelector('.shell');
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => {
    m.muted = true;
  }),
);
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    const team = ['silver_cavalier', 'bronze_forgehand', 'moon_reaver', 'hedge_acolyte'];
    for (const id of team) {
      const card = content.cardById.get(id);
      s.cards.owned[id] = { ...g.newOwnedCard(card.tier), skillOpen: true, level: 20 };
    }
    s.cards.loadouts.fighting = { slots: team };
    const r = g.setActiveDungeon(s, content, 'mossy_cellar');
    if (r.ok) s = r.state;
    s.stats.playTimeMs = 24_300;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.click('[data-open="dungeon"]').catch(() => undefined);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/duel-effects.png` });
const words = await page.evaluate(() => ({
  cards: [...document.querySelectorAll('.du-card__effects')].map((e) => e.textContent),
  enemy: document.querySelector('.du-foe__effects')?.textContent ?? null,
}));
console.log(JSON.stringify(words));
await browser.close();
