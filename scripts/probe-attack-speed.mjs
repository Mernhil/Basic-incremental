// Measures the attack animation on the Dungeons arena for a dagger and a hammer lead (DESIGN.md §6,
// "Attack animation follows hit speed"). It replaces the dev save, so run the app on its own profile:
// `BI_PROFILE=pacecheck npx electron-vite dev -- --remote-debugging-port=9433`, then
// `node scripts/probe-attack-speed.mjs [port] [outDir]`.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9433';
const out = process.argv[3] ?? 'design/shots/attack-speed';
mkdirSync(out, { recursive: true });
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1280, height: 720 }).catch(() => undefined);
await page.waitForSelector('.shell');

for (const lead of ['storm_duelist', 'grave_hammerer']) {
  await page.evaluate(
    async ({ data, game, lead }) => {
      const d = await import(data);
      const g = await import(game);
      const content = d.loadContent();
      let s = g.createInitialState(content);
      const base = Object.values(s.cards.owned)[0];
      s.cards.owned[lead] = { ...base };
      s.cards.loadouts.fighting = { main: lead, supports: [null, null, null] };
      // A boss that neither dies nor knocks the loadout out while we watch.
      const r = g.setActiveDungeon(s, content, 'mossy_cellar');
      if (r.ok) s = r.state;
      await window.api.writeSave(g.createSaveText(s, Date.now()));
    },
    { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), lead },
  );
  await page.reload();
  await page.waitForSelector('.shell');
  await page.evaluate(() => document.querySelector('.away button')?.click());
  await page.click('[data-open="dungeon"]');
  await page.waitForSelector('.ar__fan .lf-slot--main .bi-card');
  const result = await page.evaluate(
    () =>
      new Promise((done) => {
        const born = new Map();
        const lives = [];
        const starts = [];
        const obs = new MutationObserver((list) => {
          const now = performance.now();
          for (const m of list) {
            m.addedNodes.forEach((n) => {
              if (n instanceof HTMLElement && n.classList.contains('bi-fx')) {
                born.set(n, now);
                starts.push(now);
              }
            });
            m.removedNodes.forEach((n) => {
              if (born.has(n)) lives.push(now - born.get(n));
            });
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          obs.disconnect();
          const gaps = starts.slice(1).map((t, i) => t - starts[i]);
          const avg = (a) =>
            a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
          done({ hits: starts.length, animationMs: avg(lives), hitGapMs: avg(gaps) });
        }, 9000);
      }),
  );
  await page.screenshot({ path: `${out}/${lead}.png` });
  console.log(lead, JSON.stringify(result));
}
await browser.close();
