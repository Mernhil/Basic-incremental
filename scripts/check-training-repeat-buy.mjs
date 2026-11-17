// Clicks a Training Buy button five times at the same spot, pointer never moved, and expects five
// purchases (also with x10 and by keyboard). Replaces the dev save, so use a throwaway profile:
// `BI_HIDDEN_WINDOW=1 BI_PROFILE=trainclick npx electron-vite dev -- --remote-debugging-port=9477 --mute-audio`,
// then `node scripts/check-training-repeat-buy.mjs [port]`. Exit code 1 when a click is lost.
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9477';
const fsUrl = (p) => `/@fs/${resolve(p).split(String.fromCharCode(92)).join('/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
await page.waitForSelector('.shell');

await page.evaluate(
  async ({ data, game, dev }) => {
    const d = await import(data);
    const g = await import(game);
    const cheats = await import(dev);
    const content = d.loadContent();
    let s = g.createInitialState(content);
    s.activeDungeonId = 'mossy_cellar';
    const placed = cheats.devSetFloor(s, content, 'mossy_cellar', 6);
    if (placed.ok) s = placed.state;
    for (const id of ['copper_gem', 'ironbark_gem', 'iron_gem', 'oak_gem'])
      s.resources[id] = g.D ? g.D('1e30') : s.resources[id].mul(0).add(1e30);
    await window.api.writeSave(g.createSaveText(s, Date.now()));
  },
  {
    data: fsUrl('src/data/index.ts'),
    game: fsUrl('src/game/index.ts'),
    dev: fsUrl('src/game/dev.ts'),
  },
);
await page.reload();
await page.waitForSelector('[data-open="dungeon"]');
await page.click('[data-open="dungeon"]');
await page.waitForSelector('[data-key="panel-training"]');
await page.click('[data-key="panel-training"]');
await page.waitForSelector('.ur__row');
await page.waitForTimeout(1500);

const level = () => page.evaluate(() => document.querySelector('.ur__row .ur__level')?.textContent);
let failed = false;
const run = async (name, clicks, act) => {
  const before = await level();
  const log = [];
  for (let i = 0; i < clicks; i++) {
    const lv = await level();
    await act(i);
    await page.waitForTimeout(300);
    log.push(`${lv}->${await level()}`);
  }
  const ok =
    (await level()) !== before && new Set(log.map((l) => l.split('->')[1])).size === clicks;
  if (!ok) failed = true;
  console.log(ok ? 'PASS' : 'FAIL', name, log.join(' | '));
};

// Park the pointer on the first Buy button, then click five times without moving it.
// A human press lasts ~100 ms; a node re-inserted meanwhile loses the click.
const press = async () => {
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
};
const park = async () => {
  await page.waitForTimeout(400);
  const box = await (await page.$('.ur__row .ur__buy')).boundingBox();
  const at = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(...at);
};
await page.click('.buy-toggle button:nth-child(1)');
await park();
await run('x1 mouse same spot', 5, () => press());
await page.click('.buy-toggle button:nth-child(2)');
await park();
await run('x10 mouse same spot', 5, () => press());
await page.click('.buy-toggle button:nth-child(1)');
await page.focus('.ur__row .ur__buy');
await run('x1 keyboard Enter', 5, () => page.keyboard.press('Enter'));
await run('x1 keyboard Space', 5, () => page.keyboard.press('Space'));
process.exit(failed ? 1 : 0);
