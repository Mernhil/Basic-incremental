import { resolve } from 'node:path';
import { chromium } from 'playwright';
const port = process.argv[2] ?? '9477';
const secs = Number(process.argv[3] ?? 60);
const speed = process.argv[4] ?? '1';
const outDir = process.argv[5] ?? '';
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell');
await page.evaluate(async ({ data, game, dev, FLOOR, LEVEL, TEAM }) => {
  const d = await import(data); const g = await import(game); const cheats = await import(dev);
  const content = d.loadContent();
  let s = g.createInitialState(content);
  s.activeDungeonId = 'ember_crypt';
  s.clearedDungeons.push('mossy_cellar');
  const placed = cheats.devSetFloor(s, content, 'ember_crypt', FLOOR);
  if (placed.ok) s = placed.state;
  s.combat.floors['ember_crypt'].autoChallenge = false;
  const team = TEAM.split(',');
  for (const id of team) s.cards.owned[id] ??= g.newOwnedCard();
  for (const o of Object.values(s.cards.owned)) o.level = LEVEL;
  s.cards.loadouts.fighting = { slots: team };
  await window.api.writeSave(g.createSaveText(s, Date.now()));
}, { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts'), dev: fsUrl('src/game/dev.ts'), FLOOR: Number(process.env.FLOOR ?? 4), LEVEL: Number(process.env.LEVEL ?? 18), TEAM: process.env.TEAM });
await page.reload(); await page.waitForSelector('.shell');
await page.evaluate(() => document.querySelector('.away button, .wb button')?.click());
await page.click('[data-open="dungeon"]');
await page.waitForSelector('.ar__scene');
await page.setViewportSize({ width: 1280, height: 720 }).catch(() => undefined);
if (speed !== '1') {
  await page.keyboard.press('Control+Shift+D');
  await page.waitForTimeout(500);
  const ok = await page.evaluate((x) => { const b = [...document.querySelectorAll('.dev-panel button')].find((e) => e.textContent === x + 'x'); b?.click(); return Boolean(b); }, speed);
  console.log('speed set', ok);
  await page.keyboard.press('Control+Shift+D');
}
const frames = [];
let cdp;
if (outDir) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(outDir, { recursive: true });
  cdp = await page.context().newCDPSession(page);
  let n = 0;
  cdp.on('Page.screencastFrame', (f) => {
    const name = `f${String(n++).padStart(5, '0')}.jpg`;
    writeFileSync(`${outDir}/${name}`, Buffer.from(f.data, 'base64'));
    frames.push([name, f.metadata.timestamp]);
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 3 });
}
await page.evaluate(() => {
  window.__log = []; const t0 = performance.now();
  const L = (k, v) => window.__log.push([Math.round(performance.now() - t0), k, v]);
  const seen = new WeakSet();
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.classList.contains('sa-canvas')) L('cutin+', '');
    if (n.classList.contains('du-skill')) L('PLATE+', n.textContent.slice(0, 40));
    if (n.classList.contains('du-word')) L('word+', n.textContent);
  } for (const n of m.removedNodes) { if (n.nodeType===1 && n.classList.contains('sa-canvas')) L('cutin-',''); } })
    .observe(document.body, { childList: true, subtree: true });
});
await page.waitForTimeout(secs * 1000);
if (cdp) {
  await cdp.send('Page.stopScreencast');
  const { writeFileSync } = await import('node:fs');
  let txt = '';
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1][1] - frames[i][1] : 0.1;
    txt += `file '${frames[i][0]}'
duration ${Math.max(d, 0.001).toFixed(4)}
`;
  }
  txt += `file '${frames.at(-1)[0]}'
`;
  writeFileSync(`${outDir}/list.txt`, txt);
}
const log = await page.evaluate(() => window.__log);
console.log(log.map((r) => r.join(' ')).join('\n'));
await browser.close();
