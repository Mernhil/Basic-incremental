// Measures, in the running app, whether any card kit covers a neighbouring card or is cut off by its scroll box,
// in the Cards views (Collection, Heirlooms, Loadouts slots and picker). Replaces the dev save, so use a profile.
// Start: `BI_PROFILE=kitfix npx electron-vite dev -- --remote-debugging-port=9533 --mute-audio`
// Run: `node scripts/check-kit-overlap.mjs [port] [outDir] [WxH] [suffix]`.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [port = '9533', out = '.', size = '1280x720', suffix = ''] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
page.setDefaultTimeout(180000);
await page.waitForSelector('.shell');
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    const own = (id, tier, stars, level) => {
      s.cards.owned[id] = { ...g.newOwnedCard(), tier, stars, level };
    };
    for (const id of ['seraph_lancer', 'gleam_phantom', 'dawnblade_regent', 'whisper_assassin'])
      own(id, 'prismatic', 6, 100);
    own('prism_paladin', 'wood', 1, 1);
    own('halfmoon_reaper', 'wood', 1, 1);
    own('ember_squire', 'bronze', 2, 10);
    own('storm_duelist', 'silver', 3, 30);
    own('jade_vanguard', 'gold', 4, 60);
    for (const id of ['violet_herald', 'moon_reaver', 'pearl_duelist', 'brine_corsair'])
      own(id, 'mythic', 2, 110);
    for (const id of ['solaris', 'grimhowl', 'skypiercer', 'auroratusk', 'maelfang', 'pearlrider'])
      own(id, 'heirloom', 3, 120);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page
  .getByRole('button', { name: 'Collect' })
  .click({ timeout: 8000 })
  .catch(() => {});
await page.addStyleTag({ content: '.st-toasts{display:none!important}' });
await page.setViewportSize({ width: W, height: H });

const measure = (label) =>
  page.evaluate(async (label) => {
    // the opaque part of each kit picture (its decorations), not the transparent picture around it
    const ext = new Map();
    const opaque = async (img) => {
      const href = img.getAttribute('href');
      if (!ext.has(href)) {
        const i = new Image();
        i.src = href;
        await i.decode();
        const c = document.createElement('canvas');
        c.width = i.width;
        c.height = i.height;
        const x = c.getContext('2d');
        x.drawImage(i, 0, 0);
        const a = x.getImageData(0, 0, c.width, c.height).data;
        let l = 1e9,
          r = -1,
          t = 1e9,
          b = -1;
        for (let y = 0; y < c.height; y++)
          for (let xx = 0; xx < c.width; xx++)
            if (a[(y * c.width + xx) * 4 + 3] > 20) {
              l = Math.min(l, xx);
              r = Math.max(r, xx + 1);
              t = Math.min(t, y);
              b = Math.max(b, y + 1);
            }
        ext.set(href, { l: l / c.width, r: r / c.width, t: t / c.height, b: b / c.height });
      }
      const e = ext.get(href);
      const q = img.getBoundingClientRect();
      return {
        left: q.left + e.l * q.width,
        right: q.left + e.r * q.width,
        top: q.top + e.t * q.height,
        bottom: q.top + e.b * q.height,
      };
    };
    const kits = [...document.querySelectorAll('.bi-card--kit:not([data-border-worn])')].filter(
      (c) => {
        const r = c.getBoundingClientRect();
        if (!r.width || !c.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
          return false;
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          Math.min(r.top + r.height / 2, innerHeight - 2),
        );
        return !!top && (c.contains(top) || top.contains(c));
      },
    );
    const rect = (e) => e.getBoundingClientRect();
    const info = [];
    for (const c of kits) {
      const px = c.querySelector('.bi-frame__px');
      if (!px) continue;
      info.push({
        c,
        name: c.querySelector('.bi-card__name')?.textContent ?? '?',
        card: rect(c),
        kit: await opaque(px),
      });
    }
    const hit = (a, b) =>
      a.left < b.right - 0.5 &&
      a.right > b.left + 0.5 &&
      a.top < b.bottom - 0.5 &&
      a.bottom > b.top + 0.5;
    const problems = [];
    for (const a of info) {
      for (const b of info) {
        if (a === b || a.c.contains(b.c) || b.c.contains(a.c)) continue;
        if (hit(a.kit, b.card))
          problems.push(
            `${a.name} kit covers ${b.name} [${a.c.closest('[class*="cp-"]')?.className.split(' ')[0]} ${Math.round(a.kit.left)},${Math.round(a.kit.top)}-${Math.round(a.kit.right)},${Math.round(a.kit.bottom)} vs ${Math.round(b.card.left)},${Math.round(b.card.top)}]`,
          );
      }
      // text under the card (tile labels): any visible leaf text element outside the card that the kit reaches
      const li = a.c.closest('li, .cp-slot');
      if (li)
        for (const t of li.querySelectorAll(
          '.cp-pick__note, .cp-pick__tag, .cp-slot__label, .cp-slot__buttons button',
        )) {
          if (hit(a.kit, rect(t)))
            problems.push(`${a.name} kit covers "${t.textContent.trim().slice(0, 20)}"`);
        }
      // clipped by a scrolling or hidden-overflow ancestor
      for (let p = a.c.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (/(auto|hidden|scroll|clip)/.test(o.overflowX + o.overflowY)) {
          const r = rect(p);
          if (
            r.width &&
            (a.kit.left < r.left - 1 || a.kit.right > r.right + 1 || a.kit.top < r.top - 1)
          ) {
            // only a problem when the cut part is on screen of that box and the box scrolls vertically from its top
            if (a.card.top >= r.top && a.card.bottom <= r.bottom)
              problems.push(`${a.name} kit cut by ${p.className.split(' ')[0]}`);
          }
          break;
        }
      }
    }
    return { label, cards: info.length, problems: [...new Set(problems)] };
  }, label);

const results = [];
const shot = async (name) => page.screenshot({ path: `${out}/${name}-${size}${suffix}.png` });
await page.click('[data-open="cards"]');
await page.waitForTimeout(1500);
results.push(await measure('collection'));
await shot('collection');
await page.getByText('Heirlooms', { exact: true }).first().click();
await page.waitForTimeout(1200);
results.push(await measure('heirlooms'));
await shot('heirlooms');
await page.getByText('Loadouts', { exact: true }).first().click();
await page.waitForTimeout(1000);
await page.locator('[data-key^="slot-"]').first().click();
await page.waitForTimeout(500);
await page
  .locator('[data-key^="slot-fighting-1"]')
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(1000);
results.push(await measure('loadouts + picker'));
await shot('loadouts');
await page.locator('.cp-pick__list').evaluate((e) => (e.scrollTop = 0));
await page.locator('.cp-pick').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await shot('picker');
for (const [key, label] of [
  ['wardrobe', 'wardrobe'],
  ['summon', 'summon'],
]) {
  await page
    .getByText('← Table')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(600);
  await page.click(`[data-open="${key}"]`).catch(() => {});
  await page.waitForTimeout(1500);
  results.push(await measure(label));
  await shot(label);
}
await page
  .getByText('← Table')
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(800);
results.push(await measure('table (dungeon hand)'));
await shot('table');
console.log(JSON.stringify(results, null, 1));
await browser.close();
