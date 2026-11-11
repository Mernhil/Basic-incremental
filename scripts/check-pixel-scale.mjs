// Measures every pixel-art element in the running app and lists the ones drawn at a fractional
// number of device pixels per art pixel (DESIGN.md §12 Clean pixels).
// Start the app with `npx electron-vite dev -- --remote-debugging-port=9444`, then run
// `node scripts/check-pixel-scale.mjs [port] [--reload] [--shots=<dir>] [--dpr=1,1.25,1.5,2] [--pages=home,cards]`.
// Exit code 1 when any element is not a whole scale (use in review; CI cannot run Electron).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, dflt) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;
const port = args.find((a) => /^\d+$/.test(a)) ?? '9444';
const shots = flag('shots', '');
const dprs = flag('dpr', '1,1.25,1.5,2').split(',').map(Number);
const pageIds = flag(
  'pages',
  'home,cards,production,dungeons,summon,wardrobe,skills,achievements',
).split(',');
const size = flag('size', '1600x960').split('x').map(Number);
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (args.includes('--reload')) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
}
const cdp = await page.context().newCDPSession(page);
// measure the resting layout: hit squashes, sways and bobs are transient (listed in the PR)
const still = '*,*::before,*::after{animation:none!important;transition:none!important}';

// Pixel art that is still shown below 1x because the layout needs a small version that does not
// exist yet (a pixel-art request, listed in the PR). Everything else must be a whole scale.
const KNOWN = [
  // invisible landing spots for flying coins (opacity 0)
  { where: /shell-details__land/ },
  // boss portraits in the floor list: the 160 px boss sprite in a 38 px box
  { where: /dp-floor__art/ },
  // the weapon panel's price chips: the 48 px gem coin in a 20 px box (needs a small coin)
  { where: /wp-cost__art/ },
];
const knownSeen = new Set();

// Runs inside the page: every pixel-art element with its device pixels per art pixel.
const measure = async () => {
  const dpr = window.devicePixelRatio;
  const nat = new Map();
  const native = (url) =>
    nat.get(url) ??
    nat
      .set(
        url,
        new Promise((res) => {
          const im = new Image();
          im.onload = () => res(im.naturalWidth);
          im.onerror = () => res(0);
          im.src = url;
        }),
      )
      .get(url);
  const where = (el) => {
    const bits = [];
    for (let n = el.parentElement; n && bits.length < 3; n = n.parentElement) {
      const c = [...n.classList].find((x) =>
        /^(bi-card|ar-|pp-|dp-|wp-|cards|wd-|prod|reveal|sk-|ach|table|shell|loadout|home|mini|card)/.test(
          x,
        ),
      );
      if (c) bits.push(c);
    }
    return bits.join('<');
  };
  const out = [];
  const add = (el, name, w, nativeW, extra = 1) => {
    if (!nativeW || w < 1) return;
    const k = (w * dpr) / nativeW / extra;
    out.push({
      name,
      k: Math.round(k * 1000) / 1000,
      where: where(el),
      nw: nativeW,
      css: Math.round((w / (extra || 1)) * 10) / 10,
    });
  };
  for (const im of document.querySelectorAll('image[data-sprite]')) {
    const m = im.getScreenCTM();
    const r = im.getBoundingClientRect();
    if (!m || (r.width === 0 && r.height === 0)) continue;
    const href = im.getAttribute('href');
    const nw = await native(href);
    const sx = Math.hypot(m.a, m.b) * im.width.baseVal.value;
    add(im, im.dataset.sprite, sx, nw);
  }
  for (const cv of document.querySelectorAll('canvas')) {
    if (getComputedStyle(cv).imageRendering !== 'pixelated') continue;
    const r = cv.getBoundingClientRect();
    if (r.width === 0) continue;
    add(cv, `canvas.${cv.className || 'anon'}`, r.width, cv.width);
  }
  for (const img of document.querySelectorAll('img')) {
    if (getComputedStyle(img).imageRendering !== 'pixelated') continue;
    const r = img.getBoundingClientRect();
    if (r.width === 0) continue;
    add(img, `img.${img.className || 'anon'}`, r.width, img.naturalWidth);
  }
  return out;
};

let bad = 0;
const seen = new Map();
for (const dpr of dprs) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: size[0],
    height: size[1],
    deviceScaleFactor: dpr,
    mobile: false,
  });
  // the emulation changes the ratio without a resize event (a real zoom or monitor move fires one)
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);
  // the welcome-back cards cover the page after a reload until Collect is pressed
  const dismiss = async () => {
    if (!(await page.$('.wb'))) return;
    await page.click('.wb__collect', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('.wb', { state: 'detached', timeout: 5000 }).catch(() => {});
  };
  await dismiss();
  await page.waitForTimeout(900);
  for (const id of pageIds) {
    await dismiss();
    await page.click(`[data-open="${id}"]`, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (shots) {
      // the CDP capture is in device pixels (Playwright would scale it back to CSS pixels)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${shots}/${id}-dpr${dpr}.png`, Buffer.from(data, 'base64'));
    }
    const styleTag = await page.addStyleTag({ content: still });
    // finish what can finish (a flying coin removes itself then), cancel what loops
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => {
        try {
          a.finish();
        } catch {
          a.cancel();
        }
      }),
    );
    const list = await page.evaluate(`(${measure})()`);
    await styleTag.evaluate((el) => el.remove());
    const real = await page.evaluate(() => window.devicePixelRatio);
    if (Math.abs(real - dpr) > 0.001)
      console.log(`  warning: window.devicePixelRatio is ${real}, wanted ${dpr}`);
    const all = list.filter((e) => Math.abs(e.k - Math.round(e.k)) > 0.02 || e.k < 0.98);
    const known = all.filter((e) => KNOWN.some((x) => x.where.test(e.where)));
    const off = all.filter((e) => !known.includes(e));
    for (const e of known) knownSeen.add(`${e.name} [${e.where}]`);
    bad += off.length;
    console.log(
      `DPR ${dpr} ${id}: ${list.length} art elements, ${off.length} not whole` +
        (known.length ? ` (+${known.length} known, need smaller art)` : ''),
    );
    for (const e of off) {
      const key = `${e.name.replace(/-(bronze|silver|gold|prism|stone|locked|lit|dim)$/, '')} native${e.nw} css${e.css} [${e.where}]`;
      const g = seen.get(key) ?? { ks: new Set(), at: new Set() };
      g.ks.add(e.k);
      g.at.add(`${id}@${dpr}`);
      seen.set(key, g);
    }
  }
}
if (knownSeen.size) {
  console.log('\nKnown exceptions (shown below 1x until the art gets a small version):');
  for (const k of [...knownSeen].sort()) console.log(`  ${k}`);
}
console.log('\nNot whole, by element:');
for (const [k, g] of [...seen].sort())
  console.log(`  ${k}  x${[...g.ks].slice(0, 4).join('/')}  (${g.at.size} views)`);
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
process.exit(bad ? 1 : 0);
