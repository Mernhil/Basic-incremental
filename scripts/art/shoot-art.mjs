// Screenshots the real in-game art functions (not a mockup) from a running dev server.
// Usage: node scripts/art/shoot-art.mjs <outDir> [baseUrl] [--reduced]
// Loads the art modules through Vite, places their markup in plain SVG boxes at whole-number
// scales, waits for the live layers to tick and saves one PNG per panel.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const resources = JSON.parse(
  readFileSync(new URL('../../src/data/content/resources.json', import.meta.url), 'utf8'),
);
const gemList = resources.filter((r) => r.gem).map((r) => r.gem);
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '')
  .slice(7)
  .split(',')
  .filter(Boolean);
const panels = await page.evaluate(
  async ({ gemList, only }) => {
    const load = (p) => import(/* @vite-ignore */ new URL(p, document.baseURI).href);
    const items = await load('src/art/items.ts');
    const frame = await load('src/art/frame.ts');
    const evo = await load('src/art/evolutions.ts');
    const gems = await load('src/art/gems.ts');
    const bosses = await load('src/art/bosses.ts');
    const fx = await load('src/theme/effects.ts');
    const box = (vb, w, h, inner, bg = '#1a2030') =>
      `<svg viewBox="${vb}" width="${w}" height="${h}" style="background:${bg}">${inner}</svg>`;
    const fig = (svg, label) => `<figure>${svg}<figcaption>${label}</figcaption></figure>`;
    const rarities = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'void'];
    const sec = (id, html) => `<section id="${id}">${html}</section>`;
    const html = [
      sec(
        'items',
        ['sword', 'bow', 'pickaxe', 'staff', 'gauntlet']
          .flatMap((k) =>
            rarities.map((r) =>
              fig(
                `<svg viewBox="0 0 200 240" width="100" height="120">${items.itemArt(k, r)}</svg>`,
                `${k} ${r}`,
              ),
            ),
          )
          .join(''),
      ),
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
      ),
      sec(
        'evolutions',
        evo.EVOLUTIONS.map((id) =>
          fig(
            `<svg viewBox="0 0 200 240" width="300" height="360" style="background:#2a1a0d">${evo.evolutionArt(id)}</svg>`,
            id,
          ),
        ).join(''),
      ),
      sec(
        'coins',
        gemList
          .flatMap((g) =>
            [0, 1, 2, 3, 4, -1].map((t) =>
              fig(
                box(gems.ICON_VIEWBOX, 112, 112, gems.gemCoin(g, Math.max(0, t), t < 0)),
                `${g.shape} ${t < 0 ? 'locked' : t}`,
              ),
            ),
          )
          .join(''),
      ),
      sec(
        'medals',
        [0, 1, 2, 3, 4]
          .map((t) => fig(box(gems.MEDAL_VIEWBOX, 144, 144, gems.masteryMedal(t)), `tier ${t}`))
          .join(''),
      ),
      sec(
        'plaques',
        Object.keys(gems.NAV_GLYPHS)
          .map((n) => fig(box(gems.PLAQUE_VIEWBOX, 128, 128, gems.navPlaque(n)), n))
          .join(''),
      ),
      sec(
        'edges',
        gemList
          .filter((g) => ['square', 'hexagon', 'drop'].includes(g.shape))
          .flatMap((g) =>
            [0, 1, 2, 3, 4].map((s) =>
              fig(box(gems.EDGE_VIEWBOX, 213, 183, gems.forgedEdge(g, s)), `${g.shape} ${s}`),
            ),
          )
          .join(''),
      ),
      sec(
        'tiles',
        gemList
          .flatMap((g) =>
            [0, 1, 2, 3, 4].map((s) =>
              fig(
                box(
                  gems.ICON_VIEWBOX,
                  168,
                  168,
                  ['round', 'pentagon', 'star'].includes(g.shape)
                    ? gems.treeTile({}, g, s)
                    : gems.mineTile(g, s),
                  'transparent',
                ),
                `${g.shape} ${s}`,
              ),
            ),
          )
          .join(''),
      ),
      sec(
        'bosses',
        ['root_warden', 'cinder_lich', 'glacier_colossus', 'crystal_sentinel']
          .map((b) => fig(box('-6 -8 112 112', 320, 320, bosses.bossArt(b, 3), '#141a26'), b))
          .join(''),
      ),
      sec(
        'hits',
        ['slash-sparks', 'slash-chips', 'heavy-hit']
          .map(
            (e) =>
              `<figure><div class="hitstage" data-effect="${e}" style="position:relative;width:240px;height:200px;background:#141a26;overflow:hidden"></div><figcaption>${e}</figcaption></figure>`,
          )
          .join(''),
      ),
    ];
    document.body.innerHTML = html
      .filter((h) => !only.length || only.some((o) => h.includes(`id="${o}"`)))
      .join('');
    // hits: play one on each stage; the screenshot lands on the held frame
    let seed = 7;
    const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (const st of document.querySelectorAll('.hitstage'))
      fx.playHit(st.dataset.effect, st, { rng });
    return [...document.querySelectorAll('section')].map((s) => s.id);
  },
  { gemList, only },
);
await page.waitForTimeout(2500);
const replayHits = (rngSeed) =>
  page.evaluate(async (s) => {
    const fx = await import(
      /* @vite-ignore */ new URL('src/theme/effects.ts', document.baseURI).href
    );
    let seed = s;
    const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (const st of document.querySelectorAll('.hitstage'))
      fx.playHit(st.dataset.effect, st, { rng });
  }, rngSeed);
for (const id of panels) {
  if (id === 'hits') {
    await replayHits(7);
    await page.waitForTimeout(140); // the held frame of the slash, the burst of the impact
  }
  await page
    .locator(`#${id}`)
    .screenshot({ path: join(out, `${id}${reduced ? '-still' : ''}.png`) });
}
// native frames of each hit over its life (hard-pixel layer only)
if (panels.includes('hits') && process.argv.includes('--frames')) {
  await replayHits(11);
  const shots = await page.evaluate(async () => {
    const res = {};
    for (let f = 0; f < 10; f++) {
      for (const st of document.querySelectorAll('.hitstage')) {
        const c = st.querySelector('.bi-fx--px canvas:last-child');
        if (c) (res[st.dataset.effect] ??= []).push(c.toDataURL('image/png'));
      }
      await new Promise((r) => setTimeout(r, 45));
    }
    return res;
  });
  for (const [name, list] of Object.entries(shots)) {
    const dir = join(out, 'frames', `hit-${name}`);
    mkdirSync(dir, { recursive: true });
    list.forEach((d, i) =>
      writeFileSync(
        join(dir, `${String(i).padStart(2, '0')}.png`),
        Buffer.from(d.split(',')[1], 'base64'),
      ),
    );
  }
}

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
