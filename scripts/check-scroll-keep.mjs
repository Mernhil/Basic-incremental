// Checks that no scrolling view or panel jumps back to the top when the player acts or the game
// ticks (UI_RULES §2, "Scroll and focus are kept"). For every full view it scrolls each scrolling
// container down, then (a) waits through normal state ticks and (b) clicks each safe control in the
// view, one at a time, and reports every container whose scroll position dropped. Exits 1 on a reset.
// It replaces the save of the profile it runs against, so use a throwaway one:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=<name> npx electron-vite dev -- --remote-debugging-port=9477 --mute-audio`,
// then `node scripts/check-scroll-keep.mjs [port] [--verbose]`. Runs at 1280 x 720.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '9477';
const verbose = process.argv.includes('--verbose');
const fsUrl = (p) => `/@fs/${resolve(p).replaceAll('\\', '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.waitForSelector('.shell');

// A rich save: every card owned, plenty of every resource, so lists are long and buttons live.
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const content = d.loadContent();
    const s = g.createInitialState(content);
    for (const c of content.cards) {
      s.cards.owned[c.id] = { ...g.newOwnedCard(), tier: 'bronze', level: 5 };
    }
    for (const k of Object.keys(s.resources)) s.resources[k] = new g.Decimal('1e12');
    s.account.level = 40;
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await page.reload();
await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button')?.click());
await page.setViewportSize({ width: 1280, height: 720 });
await page.addStyleTag({
  content:
    '.st-toast, .st-toasts { display: none !important; } * { animation-duration: 0s !important; transition: none !important; }',
});
await page.evaluate(() =>
  document.querySelectorAll('audio,video').forEach((m) => {
    m.muted = true;
  }),
);

const VIEWS = [
  'dungeon',
  'logging',
  'mining',
  'cards',
  'summon',
  'wardrobe',
  'skills',
  'achievements',
  'shop',
  'forge',
  'upgrades',
  'settings',
];

/** Page-side helpers: the scrolling containers of the open view, keyed by class path + index. */
await page.evaluate(() => {
  window.__sc = {
    rootSel: '.vh-view:not([hidden])',
    list() {
      const root = document.querySelector(window.__sc.rootSel);
      if (!root) return [];
      const seen = new Map();
      const out = [];
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
          const cls = String(el.className).split(/\s+/).filter(Boolean).slice(0, 2).join('.');
          const base = `${el.tagName.toLowerCase()}.${cls}`;
          const n = seen.get(base) ?? 0;
          seen.set(base, n + 1);
          out.push({ key: `${base}#${n}`, el });
        }
      }
      return out;
    },
    pos() {
      return Object.fromEntries(this.list().map((c) => [c.key, Math.round(c.el.scrollTop)]));
    },
    scrollAll() {
      for (const c of this.list()) {
        c.el.scrollTop = Math.round((c.el.scrollHeight - c.el.clientHeight) / 2);
      }
      return this.pos();
    },
  };
});

const openView = async (id) => {
  await page.evaluate(() => document.querySelector('.vh-back')?.click());
  await page.waitForTimeout(150);
  await page.evaluate((v) => document.querySelector(`[data-open="${v}"]`)?.click(), id);
  await page.waitForTimeout(500);
  return page.evaluate(
    (v) => document.querySelector(`.vh-view[data-view="${v}"]:not([hidden])`) !== null,
    id,
  );
};

/** Marks the safe controls of the open view and returns how many there are. */
const markTargets = () =>
  page.evaluate(() => {
    const root = document.querySelector(window.__sc.rootSel);
    let n = 0;
    const sel = 'button, [role="button"], [role="tab"], input[type="checkbox"], .cp-tile';
    for (const el of root.querySelectorAll(sel)) {
      if (el.disabled || el.closest('.vh-bar') || el.hasAttribute('data-open')) continue;
      const text = `${el.textContent} ${el.getAttribute('aria-label')} ${el.className}`;
      if (/reset|delete|wipe|import|export|ascend|quit|erase|hard/i.test(text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      el.setAttribute('data-sc-target', String(n++));
    }
    return n;
  });

let failed = 0;
const report = (view, what, before, after) => {
  let bad = 0;
  for (const k of Object.keys(before)) {
    if (before[k] > 20 && after[k] !== undefined && after[k] < before[k] - 4) {
      bad++;
      failed++;
      console.log(`FAIL ${view} · ${what} · ${k}: ${before[k]} -> ${after[k]}`);
    }
  }
  return bad;
};

/** Extra scenarios inside a view: the Cards tabs, the Wardrobe's Skins filter, the quest list. */
const SCENARIOS = [
  ...VIEWS.map((id) => ({ id, label: id })),
  ...['heirlooms', 'loadouts', 'bonds', 'trips'].map((t) => ({
    id: 'cards',
    label: `cards/${t}`,
    pre: `#cards-tab-${t}`,
  })),
  { id: 'wardrobe', label: 'wardrobe/skins', pre: '.wd-chips button:last-child' },
  {
    id: 'summon',
    label: 'summon/heirloom-gate',
    pre: '.sm-gate[data-gate="heirloom"] .sm-gate__row',
  },
  { id: 'table', label: 'quests', quests: true },
  // the dungeon fight's framed sheet (Weapon, Training, Dungeons buttons), opened from the hub arch
  ...['weapon', 'training', 'dungeons'].map((p) => ({
    id: 'dungeon',
    label: `fight/${p}`,
    sheet: p,
  })),
];

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
for (const sc of SCENARIOS) {
  if (only && !sc.label.startsWith(only)) continue;
  const id = sc.id;
  const label = sc.label;
  await page.evaluate(() => {
    window.__sc.rootSel = '.vh-view:not([hidden])';
  });
  if (sc.sheet) {
    await page.evaluate(() => document.querySelector('.tbl-hubback')?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-building="dungeon_arch"]')?.click());
    await page.waitForTimeout(600);
    await page.evaluate((p) => {
      window.__sc.rootSel = '.dv-sheet__body';
      document.querySelector(`[data-key="panel-${p}"]`)?.click();
    }, sc.sheet);
    await page.waitForTimeout(600);
    if (!(await page.evaluate(() => document.querySelector('.dv-sheet:not([hidden])') !== null))) {
      console.log(`skip ${label} (sheet did not open)`);
      continue;
    }
  } else if (sc.quests) {
    await page.evaluate(() => document.querySelector('.vh-back')?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__sc.rootSel = '.shell-goals__list';
      if (document.querySelector('.shell-goals__list[hidden]'))
        document.querySelector('.shell-goals__btn')?.click();
      [...document.querySelectorAll('.shell-goals__list button')]
        .find((b) => /see all/i.test(b.textContent))
        ?.click();
    });
    await page.waitForTimeout(300);
  } else if (!(await openView(id))) {
    console.log(`skip ${label} (did not open)`);
    continue;
  } else if (sc.pre) {
    await page.evaluate((sel) => document.querySelector(sel)?.click(), sc.pre);
    await page.waitForTimeout(400);
  }
  const containers = Object.keys(await page.evaluate(() => window.__sc.pos()));
  console.log(`view ${label}: ${containers.length} scroll container(s) ${containers.join(', ')}`);
  // (a) state ticks
  const b0 = await page.evaluate(() => window.__sc.scrollAll());
  await page.waitForTimeout(2500);
  report(label, 'ticks 2.5 s', b0, await page.evaluate(() => window.__sc.pos()));
  // (b) every safe control, one click at a time
  const count = await markTargets();
  for (let i = 0; i < Math.min(count, 40); i++) {
    if (
      !sc.quests &&
      !sc.sheet &&
      !(await page.evaluate(
        (v) => document.querySelector(`.vh-view[data-view="${v}"]:not([hidden])`) !== null,
        id,
      ))
    )
      break;
    await page.evaluate(() => window.__sc.scrollAll());
    const btn = await page.evaluate((i) => {
      const el = document.querySelector(`[data-sc-target="${i}"]`);
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const cls = String(el.className).split(/\s+/)[0];
      return `${el.tagName.toLowerCase()}.${cls} "${(el.textContent ?? '').trim().slice(0, 24)}"`;
    }, i);
    if (!btn) continue;
    // scrollIntoView may move a container: the baseline is taken after it
    const before = await page.evaluate(() => window.__sc.pos());
    await page.evaluate((i) => document.querySelector(`[data-sc-target="${i}"]`)?.click(), i);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__sc.pos());
    // a click that opens another view goes somewhere new: not a reset
    const now = await page.evaluate(() =>
      document.querySelector('.vh-view:not([hidden])')?.getAttribute('data-view'),
    );
    if (!sc.quests && !sc.sheet && now !== id) {
      await openView(id);
      await page.evaluate(() => window.__sc.scrollAll());
      await markTargets();
      continue;
    }
    if (report(label, `click ${btn}`, before, after) === 0 && verbose) {
      console.log(`ok   ${sc.label} · click ${btn}`);
    }
  }
}
await page.evaluate(() => document.querySelector('.vh-back')?.click());
console.log(failed === 0 ? 'OK: no container reset' : `${failed} reset(s)`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
