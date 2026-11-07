// Screenshots the beta-batch pixel cosmetics on the real Cards screen of the running app: the
// cards on screen are dressed with the new border / finish recipes (as data would), at max level,
// and the attack and tick effects are played in a card's art window.
// Start the app with: npx electron-vite dev -- --remote-debugging-port=9333
// Usage: node scripts/art/shoot-cosmetics.mjs <outDir> [port] [--reduced]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'design/pixel/screens';
const port = process.argv[3] ?? '9333';
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts().flatMap((c) => c.pages())[0];
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
await page.waitForSelector('.shell-rail__item');
const away = page.locator('.away button');
if (await away.count()) await away.first().click();
await page.click('.shell-rail__item[data-page="cards"]');
await page.waitForTimeout(1200);

/** Dress the visible cards: each entry is a list of recipes, plus which slots are at max. */
async function dress(looks, name) {
  await page.evaluate((looks) => {
    const cards = [...document.querySelectorAll('.bi-card')].slice(0, looks.length);
    cards.forEach((el, i) => {
      for (const c of [...el.classList]) if (c.startsWith('r-')) el.classList.remove(c);
      for (const r of looks[i].recipes) el.classList.add(`r-${r}`);
      el.toggleAttribute('data-max-border', !!looks[i].maxB);
      el.toggleAttribute('data-max-finish', !!looks[i].maxF);
    });
  }, looks);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, `${name}.png`) });
}
const up = (p, id, n) => Array.from({ length: n }, (_, i) => `${p}-${id}-${i + 1}`);
const sets =
  process.argv
    .find((a) => a.startsWith('--sets='))
    ?.slice(7)
    .split(';') ?? [];
for (const s of sets) {
  const [name, ...cards] = s.split('|');
  await dress(
    cards.map((c) => {
      const [bd, bl, fn, fl, ...extra] = c.split(',');
      return {
        recipes: [
          ...(bd ? up('bd', bd, Number(bl)) : []),
          ...(fn ? up('fn', fn, Number(fl)) : []),
          ...extra,
        ],
        maxB: !!bd && extra.includes('maxB'),
        maxF: !!fn && extra.includes('maxF'),
      };
    }),
    name,
  );
}

// effects: play a pixel slash and pixel ticks in the first card's art window
if (process.argv.includes('--fx')) {
  const fx = process.argv.find((a) => a.startsWith('--fx='))?.slice(5) ?? 'verdant-5';
  await page.evaluate(async (fx) => {
    const eff = await import('/src/theme/effects.ts');
    const stage = document.querySelector('.bi-card .bi-card__art');
    let seed = 7;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    document.documentElement.style.setProperty('--bi-tick-px', fx);
    eff.showTick(stage, '-482', { rng });
    await new Promise((r) => setTimeout(r, 300));
    eff.showTick(stage, '12.4K', { rng, crit: true });
    eff.playHit(`px-slash-${fx}`, stage, { rng });
  }, fx);
  await page.waitForTimeout(110);
  await page.screenshot({ path: join(out, `fx-${fx}.png`) });
}
await browser.close();
console.log(`saved cosmetics screens to ${out}`);
