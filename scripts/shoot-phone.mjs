// Drives the web build (out-web/) like an iPhone in landscape and shoots the main screens, the
// "turn sideways" screen and a tooltip opened by tap. Measures the smallest text in real pixels.
// `npm run build:web && node scripts/make-phone-save.ts ...` first; then
// `node scripts/shoot-phone.mjs [outDir] [saveFile] [webkit|chromium]`.
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const out = process.argv[2] ?? 'shots-phone';
const saveFile = process.argv[3] ?? 'phone-save.txt';
const engine = process.argv[4] ?? 'webkit';
mkdirSync(out, { recursive: true });
const saveText = readFileSync(saveFile, 'utf8');

const root = resolve('out-web');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let f = join(root, p === '/' ? 'index.html' : p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await (engine === 'webkit' ? webkit : chromium).launch(
  engine === 'chromium' ? { args: ['--mute-audio'] } : {},
);
const sizes = process.env.ONLY
  ? [[844, 390]]
  : [
      [844, 390],
      [932, 430],
    ];
const results = {};
try {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({
      ...devices['iPhone 15'],
      viewport: { width: w, height: h },
      screen: { width: w, height: h },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript((text) => {
      if (!localStorage.getItem('bi:save')) localStorage.setItem('bi:save', text);
    }, saveText);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    page.on(
      'console',
      (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 200)),
    );
    console.log('goto');
    await page.goto(url, { timeout: 20000 });
    console.log('loaded');
    await page.waitForSelector('.shell', { state: 'attached', timeout: 30000 });
    await page.waitForTimeout(2500);
    for (let i = 0; i < 6; i++) {
      const b = await page.$('.wb button, .away button');
      if (!b) break;
      await b.evaluate((el) => el.click());
      await page.waitForTimeout(300);
    }
    const info = await page.evaluate(() => ({
      inner: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      scale: visualViewport ? visualViewport.scale : null,
      viewport: document.querySelector('meta[name=viewport]').content,
    }));
    console.log(w, h, JSON.stringify(info));
    const tag = `${w}x${h}`;
    results[tag] = { info, screens: {} };
    const clickJs = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
    const home = async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    };
    const smallest = () =>
      page.evaluate(() => {
        const scale = visualViewport?.scale ?? 1;
        const found = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent.trim();
          const el = n.parentElement;
          if (!text || !el || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
          const r = el.getBoundingClientRect();
          if (
            r.width < 1 ||
            r.height < 1 ||
            r.right < 0 ||
            r.bottom < 0 ||
            r.left > innerWidth ||
            r.top > innerHeight
          )
            continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0)
            continue;
          found.push({ text: text.slice(0, 28), css: parseFloat(cs.fontSize), chars: text.length });
        }
        found.sort((a, b) => a.css - b.css);
        const total = found.reduce((t, f) => t + f.chars, 0);
        let acc = 0;
        let median = 0;
        for (const f of [...found].sort((a, b) => a.css - b.css)) {
          acc += f.chars;
          if (acc >= total / 2) {
            median = f.css;
            break;
          }
        }
        const seen = new Set();
        const distinct = found
          .filter((f) => !seen.has(f.text) && seen.add(f.text))
          .slice(0, 8)
          .map((f) => f.css + ':' + f.text);
        const small = found.filter((f) => f.css < 11).reduce((t, f) => t + f.chars, 0);
        return {
          scale,
          min: found[0],
          distinct,
          smallShare: Math.round((100 * small) / total),
          medianCss: median,
          lines: found.length,
        };
      });
    const screens = [
      [
        'dungeons',
        async () => {
          await clickJs('[data-building="dungeon_arch"]');
        },
      ],
      [
        'cards',
        async () => {
          await clickJs('[data-building="armoury"]');
          await page.waitForTimeout(500);
          await page.evaluate(() =>
            [...document.querySelectorAll('[role=menuitem]')]
              .find((b) => /Armoury/.test(b.textContent))
              ?.click(),
          );
        },
      ],
      [
        'shop',
        async () => {
          await clickJs('[data-building="market"]');
        },
      ],
      [
        'farming',
        async () => {
          await clickJs('[data-building="dungeon_arch"]');
          await page.waitForTimeout(900);
          await page.evaluate(() =>
            [...document.querySelectorAll('button')]
              .find((b) => b.textContent.trim() === 'Farming')
              ?.click(),
          );
        },
      ],
      [
        'arena',
        async () => {
          await clickJs('[data-building="arena"]');
        },
      ],
    ];
    for (const [name, go] of screens) {
      await home();
      await go();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/${name}-${tag}.png` });
      const m = await smallest();
      results[tag].screens[name] = m;
      console.log(
        tag,
        name,
        'min',
        m.min.css,
        'median',
        m.medianCss,
        'share<11px',
        m.smallShare + '%',
        'smallest:',
        m.distinct.join(' | '),
      );
    }
    await home();
    if (engine === 'webkit' && w === 844) {
      await home();
      const c = await page.evaluate(() => {
        const r = document.querySelector('.shell-currency').getBoundingClientRect();
        const k = visualViewport.scale; // the touchscreen works in screen px, the page in design px
        return { x: (r.left + r.width / 2) * k, y: (r.top + r.height / 2) * k };
      });
      await page.touchscreen.tap(c.x, c.y);
      await page.waitForTimeout(500);
      const shown = await page.evaluate(() => {
        const t = document.querySelector('.shell-tip');
        return !!t && !t.hidden;
      });
      console.log('webkit touchscreen tap on a header number opens its tooltip:', shown);
      if (shown) await page.screenshot({ path: `${out}/tooltip-by-tap-${tag}.png` });
      results[tag].webkitTap = shown;
    }
    if (engine === 'chromium' && w === 844) {
      // real touch events through the devtools protocol: a long press on a card tile opens its tooltip, a tap elsewhere closes it
      const cdp = await ctx.newCDPSession(page);
      const touch = async (x, y, ms) => {
        const pt = [{ x, y, id: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
        await page.waitForTimeout(ms);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(300);
      };
      const centre = (sel) =>
        page.evaluate((q) => {
          const r = document.querySelector(q).getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, sel);
      await home();
      const tipShown = () =>
        page.evaluate(() => {
          const t = document.querySelector('.shell-tip');
          return !!t && !t.hidden;
        });
      const chip = await centre('.shell-currency');
      const level = await centre('.shell-level');
      await touch(chip.x, chip.y, 80); // a short tap on a header number (it does nothing else)
      const tapShown = await tipShown();
      await page.screenshot({ path: `${out}/tooltip-by-tap-${tag}.png` });
      await touch(60, 360, 80); // a tap elsewhere closes it
      const tapClosed = !(await tipShown());
      await touch(level.x, level.y, 800); // a long press
      const longShown = await tipShown();
      await touch(60, 360, 80);
      const closed = !(await tipShown());
      console.log(
        'tap opens:',
        tapShown,
        'tap elsewhere closes:',
        tapClosed,
        'long press opens:',
        longShown,
        'closes:',
        closed,
      );
      results[tag].tooltip = { tapShown, tapClosed, longShown, closed };
      await cdp.detach();
    }
    await ctx.close();
  }
  {
    // portrait: the turn-sideways screen; and the saved game survives a reload, offline
    const ctx = await browser.newContext({
      ...devices['iPhone 15'],
      viewport: { width: 390, height: 844 },
      screen: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForSelector('.turn-screen', { state: 'attached' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/portrait-turn-sideways.png` });
    console.log(
      'portrait: turn screen visible',
      await page.evaluate(() => getComputedStyle(document.querySelector('.turn-screen')).display),
    );
    // offline: wait for the worker to cache, go offline, reload
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => 0)).catch(() => 0);
    await page.waitForTimeout(3000);
    const cached = await page.evaluate(async () => (await caches.keys()).join(','));
    await ctx.setOffline(true);
    await page.reload().catch((e) => console.log('offline reload failed', e.message.slice(0, 100)));
    await page.waitForSelector('.turn-screen', { state: 'attached', timeout: 15000 });
    console.log(
      'offline: caches',
      cached,
      'reloaded OK, persisted:',
      await page.evaluate(() => navigator.storage.persisted?.()),
    );
    results.offline = { cached };
    await ctx.close();
  }
} catch (e) {
  console.log('FAILED', e.message.slice(0, 300));
  process.exit(1);
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(results));
