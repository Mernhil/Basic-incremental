// Contrast sweep of the screen as it is drawn: for every visible text element it takes the computed text
// colour and the most common pixel colour behind it (from a screenshot) and lists the pairs under WCAG AA.
// Usage: node scripts/contrast-sweep.mjs [port] [--view dungeon|table] ; the game must already show the view.
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9492';
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
const cdp = await page.context().newCDPSession(page);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
const raw = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const u8 = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height);
  return { width: d.width, height: d.height, data: Array.from(d.data) };
}, data);
const png = { width: raw.width, height: raw.height, data: raw.data };
const dpr = await page.evaluate(() => window.devicePixelRatio);
const items = await page.evaluate(() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    if (
      b.width < 4 ||
      b.height < 4 ||
      b.bottom < 0 ||
      b.top > innerHeight ||
      b.right < 0 ||
      b.left > innerWidth
    )
      continue;
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!top || !(el.contains(top) || top.contains(el))) continue;
    out.push({
      text: n.textContent.trim().slice(0, 28),
      color: cs.color,
      size: parseFloat(cs.fontSize),
      weight: Number(cs.fontWeight) || 400,
      cls: (el.className && el.className.baseVal === undefined ? el.className : '')
        .toString()
        .slice(0, 40),
      x: b.left,
      y: b.top,
      w: b.width,
      h: b.height,
    });
  }
  return out;
});
const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const bad = [];
for (const it of items) {
  const m = it.color.match(/[\d.]+/g).map(Number);
  const fg = m.slice(0, 3);
  const counts = new Map();
  const x0 = Math.max(0, Math.floor(it.x * dpr)),
    y0 = Math.max(0, Math.floor(it.y * dpr));
  const x1 = Math.min(png.width, Math.ceil((it.x + it.w) * dpr)),
    y1 = Math.min(png.height, Math.ceil((it.y + it.h) * dpr));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const k = (png.data[i] >> 3) + ',' + (png.data[i + 1] >> 3) + ',' + (png.data[i + 2] >> 3);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  if (!counts.size) continue;
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])[0][0]
    .split(',')
    .map((v) => Number(v) * 8 + 4);
  const need = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700) ? 3 : 4.5;
  const r = ratio(fg, top);
  if (r < need)
    bad.push({
      r: Number(r.toFixed(2)),
      need,
      text: it.text,
      cls: it.cls,
      size: it.size,
      fg: it.color,
      bg: `rgb(${top})`,
    });
}
bad.sort((a, b) => a.r - b.r);
console.log(`${items.length} text elements, ${bad.length} under AA`);
for (const b of bad) console.log(JSON.stringify(b));
await browser.close();
process.exit(0);
