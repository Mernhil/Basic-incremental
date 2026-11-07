// Screenshots the real in-game art functions (not a mockup) from a running dev server.
// Usage: node scripts/art/shoot-art.mjs <outDir> [baseUrl] [--reduced]
// Loads the art modules through Vite, places their markup in plain SVG boxes at whole-number
// scales, waits for the live layers to tick and saves one PNG per panel.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'design/pixel/screens';
const base = process.argv[3] ?? 'http://localhost:5173/';
const reduced = process.argv.includes('--reduced');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 3000 },
  reducedMotion: reduced ? 'reduce' : 'no-preference',
});
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(base + 'art-review.html').catch(() => {});
await page.setContent(
  `<!doctype html><html><head><base href="${base}"><style>body{margin:0;background:#0e1219;color:#e9eef7;font:14px system-ui}section{display:flex;flex-wrap:wrap;gap:16px;padding:16px;align-items:flex-end}figure{margin:0;display:grid;gap:4px;justify-items:center}svg{overflow:visible}html,body{background:#0e1219}</style></head><body></body></html>`,
);

const panels = await page.evaluate(async () => {
  const load = (p) => import(/* @vite-ignore */ new URL(p, document.baseURI).href);
  const items = await load('src/art/items.ts');
  const frame = await load('src/art/frame.ts');
  const evo = await load('src/art/evolutions.ts');
  const fig = (svg, label) => `<figure>${svg}<figcaption>${label}</figcaption></figure>`;
  const rarities = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'void'];
  const sec = (id, html) => `<section id="${id}">${html}</section>`;
  document.body.innerHTML =
    sec(
      'items',
      ['sword', 'bow', 'pickaxe', 'staff', 'shield', 'gauntlet']
        .flatMap((k) =>
          rarities.map((r) =>
            fig(
              `<svg viewBox="0 0 200 240" width="100" height="120">${items.itemArt(k, r)}</svg>`,
              `${k} ${r}`,
            ),
          ),
        )
        .join(''),
    ) +
    sec(
      'frames',
      ['bronze', 'silver', 'gold', 'prismatic']
        .map((t) =>
          fig(
            `<svg viewBox="0 0 176 248" width="264" height="372" style="background:#3a2410;border-radius:18px">${frame.cardFrame(t)}</svg>`,
            t,
          ),
        )
        .join(''),
    ) +
    sec(
      'evolutions',
      evo.EVOLUTIONS.map((id) =>
        fig(
          `<svg viewBox="0 0 200 240" width="300" height="360" style="background:#2a1a0d">${evo.evolutionArt(id)}</svg>`,
          id,
        ),
      ).join(''),
    );
  return [...document.querySelectorAll('section')].map((s) => s.id);
});
await page.waitForTimeout(2500);
for (const id of panels)
  await page
    .locator(`#${id}`)
    .screenshot({ path: join(out, `${id}${reduced ? '-still' : ''}.png`) });

// native-resolution frames of every live layer, for pixel_check.py and sheet.py
if (process.argv.includes('--frames')) {
  const frames = await page.evaluate(async () => {
    const res = {};
    const boxes = [...document.querySelectorAll('.bi-px-live')];
    for (let f = 0; f < 10; f++) {
      await new Promise((r) => setTimeout(r, 120));
      boxes.forEach((box, k) => {
        const layers = [...box.querySelectorAll('canvas:not([class*="glow"]), img')];
        const w = layers.find((l) => l.width)?.width ?? 0;
        const first = box.querySelector('canvas');
        const c = document.createElement('canvas');
        c.width = first.width;
        c.height = first.height;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        for (const l of layers) ctx.drawImage(l, 0, 0, c.width, c.height);
        const name = `${box.dataset.live}-${k}`;
        (res[name] ??= []).push(c.toDataURL('image/png'));
        void w;
      });
    }
    return res;
  });
  for (const [name, list] of Object.entries(frames)) {
    const dir = join(out, 'frames', name);
    mkdirSync(dir, { recursive: true });
    list.forEach((d, i) =>
      writeFileSync(
        join(dir, `${String(i).padStart(2, '0')}.png`),
        Buffer.from(d.split(',')[1], 'base64'),
      ),
    );
  }
}
await browser.close();
console.log(`saved ${panels.length} panels to ${out}`);
