// Captures the code-drawn and animated game art for the overhaul review sheets (design only).
// Usage: node design/pixel/overhaul-review/tools/capture.mjs [--only key1,key2]
// Starts the harness (harness.ts, real renderer art modules, read-only) on a Vite dev server,
// drives a fake clock with Playwright and screenshots each asset at chosen times. Writes
// design/pixel/overhaul-review/_captures/<key>/<frame>.png and _captures/captures.json.
// build_sheets.py runs this first unless --no-capture is passed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const here = import.meta.dirname;
const out = join(here, '..', '_captures');
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i > 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();

const server = await createServer({ configFile: join(here, 'vite.config.mts') });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch();
const pages = new Map();
async function pageFor(dsf, reduced = false) {
  const key = `${dsf}-${reduced}`;
  if (pages.has(key)) return pages.get(key);
  const ctx = await browser.newContext({
    deviceScaleFactor: dsf,
    viewport: { width: 900, height: 900 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`page error (${key}):`, e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`console (${key}):`, m.text());
  });
  await page.clock.install({ time: 0 });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const tokens = await page.evaluate(() => window.H.init());
  await page.clock.runFor(500);
  // from here on time only moves through runFor, so frame times are exact
  const t = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(t + 1000);
  const entry = { page, tokens };
  pages.set(key, entry);
  return entry;
}

const manifest = { tokens: null, meta: null, captures: {} };

async function shoot(page, dir, name) {
  mkdirSync(dir, { recursive: true });
  const loc = page.locator('[data-cap]').first();
  await loc.screenshot({ path: join(dir, `${name}.png`), omitBackground: true, animations: 'allow' });
}

/**
 * One capture job: mount(H) runs in the page; frames are clock times in ms after mounting
 * (the fake clock runs forward between frames). `rm` adds a reduced-motion still.
 */
async function job(key, { dsf, mount, args = [], frames = [0], rm = false, settle = 400, css = null }) {
  if (only && !only.has(key)) return;
  const dir = join(out, key);
  rmSync(dir, { recursive: true, force: true });
  const { page } = await pageFor(dsf);
  await page.evaluate(([m, a]) => window.H[m](...a), [mount, args]);
  await page.clock.runFor(settle);
  let now = 0;
  const names = [];
  for (const [i, t] of frames.entries()) {
    if (t > now) await page.clock.runFor(t - now);
    now = Math.max(now, t);
    if (css !== null) await page.evaluate((ms) => window.H.cssTime(ms), css + t);
    const n = `f${i}`;
    await shoot(page, dir, n);
    names.push(n);
  }
  if (rm) {
    const { page: rp } = await pageFor(dsf, true);
    await rp.evaluate(([m, a]) => window.H[m](...a), [mount, args]);
    await rp.clock.runFor(1500);
    await shoot(rp, dir, 'rm');
    names.push('rm');
  }
  manifest.captures[key] = { dsf, frames, files: names };
  console.log('captured', key, names.length);
}

const sec = (...s) => s.map((x) => Math.round(x * 1000));

// ---- bosses and the Crystal Sentinel (1 css px per boss pixel, dsf 2 = 2x) ----
for (const art of ['root_warden', 'cinder_lich', 'glacier_colossus', 'crystal_sentinel'])
  await job(`boss-${art}`, { dsf: 2, mount: 'boss', args: [art, art === 'crystal_sentinel' ? 2 : 0], frames: sec(0.4, 0.9, 1.4, 1.9), rm: true });
for (const lv of [0, 1, 2, 3, 4])
  await job(`sentinel-${lv}`, { dsf: 2, mount: 'boss', args: ['crystal_sentinel', lv], frames: sec(1.0) });

// ---- unique evolutions (item box, 2x) ----
for (const id of ['flameblade', 'soul_reaper', 'rootbloom_staff'])
  await job(`evo-${id}`, { dsf: 2, mount: 'evo', args: [id], frames: sec(0.3, 0.7, 1.1, 1.5), rm: true });

// ---- frames with motion (2x) ----
for (const tier of ['gold', 'prismatic'])
  await job(`frame-${tier}`, { dsf: 2, mount: 'frame', args: [tier], frames: sec(0.4, 1.8, 3.2, 4.6), rm: true });

// ---- medals with motion (3x) ----
for (const tier of [3, 4])
  await job(`medal-${tier}`, { dsf: 3, mount: 'medal', args: [tier], frames: sec(0.3, 0.9, 1.5, 2.1), rm: true });

// ---- element effects on the card art window (2x of the item grid) ----
const ELEMENT_CARDS = [
  ['fire', 'ember_squire', 'sword', 'common'],
  ['storm', 'storm_duelist', 'twin_blades', 'epic'],
  ['light', 'shield_warden', 'shield', 'rare'],
  ['nature', 'grove_keeper', 'staff', 'rare'],
  ['earth', 'cave_digger', 'pickaxe', 'common'],
  ['crystal', 'gem_cutter', 'chisel', 'rare'],
  ['void', 'core_titan', 'gauntlet', 'exotic'],
];
for (const tier of ['gold', 'prismatic'])
  for (const [el, cardId, kind, rarity] of ELEMENT_CARDS)
    await job(`fx-${el}-${tier}`, {
      dsf: 2,
      mount: 'card',
      args: [{ cardId, kind, rarity, element: el, tier, stars: 1, capArt: true, pad: 0 }],
      frames: sec(0.3, 0.6, 0.9, 1.2),
      rm: true,
      settle: 800,
    });

// ---- hit effects (hit pixel = 2 css px, dsf 1 = 2x) ----
await job('hit-slash-sparks', { dsf: 1, mount: 'hit', args: ['slash-sparks', 7], frames: [20, 120, 260, 380], settle: 0 });
await job('hit-slash-chips', { dsf: 1, mount: 'hit', args: ['slash-chips', 11], frames: [20, 120, 260, 380], settle: 0 });
await job('hit-heavy-hit', { dsf: 1, mount: 'hit', args: ['heavy-hit', 5], frames: [50, 150, 300, 430], settle: 0 });
await job('tick-text', { dsf: 2, mount: 'textTick', args: ['12.4K', false], frames: [0], settle: 0, css: 350 });
await job('tick-text-crit', { dsf: 2, mount: 'textTick', args: ['48.9K', true], frames: [0], settle: 0, css: 350 });

// ---- cards: tier ladder, rarity bodies, CSS cosmetics (dsf 1.5 = frame grid at 2x) ----
for (const tier of ['bronze', 'silver', 'gold', 'prismatic'])
  await job(`card-tier-${tier}`, {
    dsf: 1.5,
    mount: 'card',
    args: [{ cardId: 'ember_squire', kind: 'sword', rarity: 'common', tier, stars: 6, element: null }],
    frames: [0],
    css: 800,
  });
for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'void'])
  await job(`card-rarity-${r}`, {
    dsf: 1.5,
    mount: 'card',
    args: [{ cardId: 'ember_squire', kind: 'sword', rarity: r, tier: 'bronze', stars: 3, element: null, name: r[0].toUpperCase() + r.slice(1) }],
    frames: [0],
    css: 800,
  });
for (const [kind, rarity, evolution] of [
  ['sword', 'common', 'flameblade'],
  ['staff', 'rare', 'rootbloom_staff'],
]) {
  await job(`card-evo-${evolution}`, {
    dsf: 1.5,
    mount: 'card',
    args: [{ cardId: 'ember_squire', kind, rarity, evolution, tier: 'gold', stars: 6, element: null }],
    frames: [700],
    css: 800,
  });
}
// cosmetics drawn in CSS (no sprite): every level, on the lowest rank that wears them
const CSS_COSMETICS = [
  ['border', 'gn_border', 1, 'gold', 1],
  ['border', 'gt_border', 5, 'gold', 1],
  ['border', 'gilded_plate', 3, 'gold', 1],
  ['border', 'gilded_filigree', 4, 'gold', 1],
  ['finish', 'gn_finish', 1, 'prismatic', 1],
  ['finish', 'gt_finish', 5, 'prismatic', 1],
  ['finish', 'aurora_veil', 4, 'prismatic', 1],
  ['finish', 'holo_hex', 3, 'prismatic', 1],
  ['finish', 'holo_waves', 3, 'prismatic', 1],
  ['border', 'ember_crown', 5, 'prismatic', 6, 'dawnblade_regent'],
];
for (const [slot, id, levels, tier, stars, exclusive] of CSS_COSMETICS)
  for (let lv = 1; lv <= levels; lv++)
    await job(`css-${id}-${lv}`, {
      dsf: 1.5,
      mount: 'card',
      args: [
        {
          cardId: exclusive ?? 'ember_squire',
          kind: 'sword',
          rarity: 'epic',
          tier,
          stars,
          element: null,
          name: 'Ember Squire',
          equips: [[slot, id, lv, exclusive]],
        },
      ],
      frames: [0],
      css: 900,
    });
// emblems (card fallback art when a card has no item)
for (const e of ['blade', 'gem', 'shield', 'pick', 'axe', 'golem', 'rock', 'tree'])
  await job(`emblem-${e}`, {
    dsf: 2,
    mount: 'card',
    args: [{ cardId: 'ember_squire', item: null, emblem: e, rarity: 'common', tier: 'bronze', stars: 1, capEmblem: true }],
    frames: [0],
    css: 0,
  });

// ---- vector line icons (ui) and the skill-tree centre star ----
{
  const { page } = await pageFor(3);
  const names = await page.evaluate(() => window.H.lineIconNames());
  for (const n of names) await job(`icon-${n}`, { dsf: 3, mount: 'lineIcon', args: [n, 24], frames: [0], settle: 0 });
}
await job('centre-star', { dsf: 2, mount: 'centreStar', frames: [0], settle: 0 });

// ---- runtime-drawn pixel numerals: tick and number styles at every level ----
{
  const { page, tokens } = await pageFor(1);
  manifest.tokens = tokens;
  const meta = await page.evaluate(() => window.H.meta());
  manifest.meta = meta;
  const numerals = {};
  for (const [kind, table, text] of [
    ['tick', meta.ticks, '+12.4K'],
    ['num', meta.numbers, '1.25M'],
  ])
    for (const [style, v] of Object.entries(table))
      for (let lv = 1; lv <= v.levels; lv++) {
        const key = `${kind}-${style}-${lv}`;
        if (only && !only.has(key) && !only.has('numerals')) continue;
        const data = await page.evaluate(
          ([k, s, t]) => (k === 'tick' ? window.H.tickPng(s, t) : window.H.numPng(s, t)),
          [kind, `${style}-${lv}`, text],
        );
        if (!data) continue;
        const dir = join(out, key);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'f0.png'), Buffer.from(data.split(',')[1], 'base64'));
        numerals[key] = { dsf: 1, frames: [0], files: ['f0'], native: true };
      }
  Object.assign(manifest.captures, numerals);
  console.log('captured numerals', Object.keys(numerals).length);
}

mkdirSync(out, { recursive: true });
const manPath = join(out, 'captures.json');
if (only) {
  // merge into the existing manifest
  const { readFileSync, existsSync } = await import('node:fs');
  if (existsSync(manPath)) {
    const old = JSON.parse(readFileSync(manPath, 'utf8'));
    manifest.captures = { ...old.captures, ...manifest.captures };
    manifest.tokens ??= old.tokens;
    manifest.meta ??= old.meta;
  }
}
writeFileSync(manPath, JSON.stringify(manifest, null, 2));
await browser.close();
await server.close();
console.log('done:', Object.keys(manifest.captures).length, 'captures');
