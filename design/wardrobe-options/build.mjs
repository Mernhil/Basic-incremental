// Builds the B8-B10 options page from the REAL renderer: loads lab.js in the renderer dev server,
// then snapshots the DOM and every stylesheet (assets inlined) into one standalone HTML file,
// and takes review screenshots.
// 1. npx vite src/renderer --port 5311 --strictPort --host 127.0.0.1
// 2. node design/wardrobe-options/build.mjs [port]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const port = process.argv[2] ?? '5311';
const base = `http://127.0.0.1:${port}`;
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const shots = join(here, 'screens');
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => {
  if (!String(e).includes('getVersion')) console.error('pageerror:', String(e));
});
await page.goto(`${base}/`);
await page.addScriptTag({ type: 'module', url: fsUrl(join(here, 'lab.js')) });
await page.waitForFunction(() => window.__labReady === true, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);

// ---- snapshot ------------------------------------------------------------------------------------
const snap = await page.evaluate(async () => {
  const toData = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
    const b = await r.blob();
    return new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  };
  let css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  css = css.replace(/@font-face\s*\{[^}]*\}/g, ''); // Outfit comes from Google Fonts instead
  const app = document.getElementById('app');
  const holder = document.createElement('div');
  for (const n of document.body.children) {
    if (n.tagName === 'SCRIPT' || n.tagName.startsWith('VITE-')) continue;
    if (n === app) holder.append(n.cloneNode(true));
    else if (n.tagName === 'svg' || n.tagName === 'SVG' || n.querySelector?.('defs')) holder.append(n.cloneNode(true));
  }
  // live state that must not be frozen into the snapshot
  holder.querySelectorAll('[data-offscreen]').forEach((n) => n.removeAttribute('data-offscreen'));
  holder.querySelectorAll('.tip, .tooltip').forEach((n) => n.remove());
  let html = holder.innerHTML;
  const urls = new Set();
  for (const src of [css, html]) {
    for (const m of src.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) urls.add(m[2]);
    for (const m of src.matchAll(/(?:src|href)="(\/[^"]+)"/g)) urls.add(m[1]);
  }
  for (const u of urls) {
    if (u.startsWith('data:') || u.startsWith('#') || u.startsWith('http')) continue;
    const d = await toData(u.replace(/&amp;/g, '&'));
    css = css.split(u).join(d);
    html = html.split(u).join(d);
  }
  const root = document.documentElement;
  return {
    css,
    html,
    rootStyle: root.getAttribute('style') ?? '',
    rootClass: root.className,
    rootData: Object.fromEntries([...root.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name, a.value])),
  };
});

const runtime = `
(() => {
  const root = document.documentElement;
  ${snap.rootClass ? `root.classList.add(...${JSON.stringify(snap.rootClass.split(/\s+/).filter(Boolean))});` : ''}
  for (const [k, v] of Object.entries(${JSON.stringify(snap.rootData)})) root.setAttribute(k, v);
  const still = document.querySelector('.lab-toggle');
  still?.addEventListener('click', () => {
    const on = still.getAttribute('aria-pressed') !== 'true';
    still.setAttribute('aria-pressed', String(on));
    if (on) root.setAttribute('data-motion', 'reduced');
    else root.removeAttribute('data-motion');
  });
  const stage = document.querySelector('.lab-wd');
  const note = document.querySelector('.lab-tabnote');
  const tabs = [...document.querySelectorAll('.lab-tab')];
  const pick = (t) => {
    for (const x of tabs) {
      x.setAttribute('aria-selected', String(x === t));
      x.tabIndex = x === t ? 0 : -1;
    }
    stage.dataset.b10 = t.dataset.opt;
    note.textContent = t.dataset.note;
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus();
      pick(n);
    });
  });
  pick(tabs.find((t) => t.dataset.opt === 'a') ?? tabs[0]);
})();`;

const out = `<title>Wardrobe options B8-B10</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&display=swap">
<style>
:root{${snap.rootStyle}}
${snap.css}
</style>
${snap.html}
<script>${runtime}</script>
`;
const file = join(here, 'wardrobe-options.html');
writeFileSync(file, out);
console.log('wrote', file, `${(out.length / 1024).toFixed(0)} KB`);

// ---- screenshots -----------------------------------------------------------------------------------
const freeze = (ms) =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);
for (const id of ['b8', 'b9']) {
  await freeze(1300);
  await page.locator(`#${id}`).screenshot({ path: join(shots, `${id}.png`) });
}
for (const opt of ['ref', 'a', 'b', 'c', 'd', 'e']) {
  await page.evaluate((o) => {
    document.querySelector('.lab-wd').dataset.b10 = o;
  }, opt);
  await freeze(1300);
  await page.locator('.lab-wd').screenshot({ path: join(shots, `b10-${opt}.png`) });
}
await browser.close();
