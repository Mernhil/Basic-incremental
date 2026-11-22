// Screenshots the three attacks per card (DESIGN.md §2 Three attacks per card) in the running dev
// app: the weapon panel's attacks and the skill unlock in the Cards detail (a Wood, a Gold, a
// Mythic, a Void and an Heirloom card), the Gold card's skill after opening it, the dungeon's
// Weapon tab, and the effect words in the duel. It replaces the dev save, so use a profile:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=moves npx electron-vite dev -- --remote-debugging-port=9473 --mute-audio`,
// then `node scripts/shoot-moves.mjs [port] [outDir]`.
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
await page.waitForSelector('.shell');

const CARDS = {
  wood: 'ember_squire',
  gold: 'gilded_knight',
  mythic: 'runemoss',
  void: 'moon_reaver',
  heirloom: 'solaris',
};
await page.evaluate(
  async ({ data, game, cards }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    const open = [cards.mythic, cards.void];
    for (const id of Object.values(cards)) {
      const card = content.cardById.get(id);
      s.cards.owned[id] = { ...g.newOwnedCard(card.tier), skillOpen: open.includes(id), level: 20 };
    }
    s.resources['frost_core'] = new g.Decimal(9);
    s.cards.loadouts.fighting = {
      slots: [cards.gold, cards.mythic, cards.void, cards.heirloom],
    };
    const r = g.setActiveDungeon(s, content, 'mossy_cellar');
    if (r.ok) s = r.state;
    s.stats.playTimeMs = 24_300;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), cards: CARDS },
);
await page.reload();
await page.waitForSelector('.shell');
for (let i = 0; i < 20; i++) {
  const btn = await page.$('.wb button, .away button');
  if (!btn) break;
  await btn.click().catch(() => {});
  await page.waitForTimeout(300);
}
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => {
    m.muted = true;
  }),
);
const mute = page.locator('.snd-mute');
if ((await mute.count()) > 0 && (await mute.getAttribute('aria-pressed')) !== 'true')
  await mute.click();
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(1000);

const detail = async (name) => {
  const el = (await page.$('.cp-detail .wp-attacks')) ?? (await page.$('.cp-detail'));
  if (el) await el.screenshot({ path: `${out}/${name}.png` });
  else await page.screenshot({ path: `${out}/${name}.png` });
};

await page.click('[data-open="cards"]').catch(() => console.log('no cards button'));
await page.waitForTimeout(1500);
for (const [kind, id] of Object.entries(CARDS)) {
  const tile = await page.$(`[data-key="tile-${id}"]`);
  if (!tile) {
    console.log('missing tile', kind, id);
    continue;
  }
  await tile.click();
  await page.waitForTimeout(900);
  await detail(`cards-${kind}`);
  if (kind === 'gold') {
    const open = await page.$('[data-key="wp-skill"]');
    if (open) {
      await open.click();
      await page.waitForTimeout(900);
      await detail('cards-gold-opened');
    } else console.log('no open button');
  }
}
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// the dungeon's Weapon tab
await page.click('[data-open="dungeon"]').catch(() => undefined);
await page.waitForTimeout(1200);
const weaponTab = page.getByRole('button', { name: 'Weapon', exact: true }).first();
if ((await weaponTab.count()) > 0) {
  await weaponTab.click().catch(() => undefined);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/dungeon-weapon.png` });
  // the Heirloom: its attacks show in the Weapon tab (the Heirloom detail in Cards is its tree)
  const tab = page.getByRole('tab', { name: /Solaris/ }).first();
  if ((await tab.count()) > 0) {
    await tab.click().catch(() => undefined);
    await page.waitForTimeout(900);
    const panel = await page.$('.wp--drawer');
    if (panel) await panel.screenshot({ path: `${out}/weapon-heirloom.png` });
  } else console.log('no Solaris tab');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}
await page.screenshot({ path: `${out}/duel-effects.png` });
const words = await page.evaluate(() => ({
  cards: [...document.querySelectorAll('.du-card__effects')].map((e) => e.textContent),
  enemy: document.querySelector('.du-foe__effects')?.textContent ?? null,
}));
console.log(JSON.stringify(words));
await browser.close();
