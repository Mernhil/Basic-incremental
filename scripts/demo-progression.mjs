// Plays the Phase 2 moments in the running dev app for screenshots: a gem mastery and a medal
// tier-up toast with the metal flash, and Ember Squire's ★6 evolution moment (A15 E).
// Start the app with `npx electron-vite dev -- --remote-debugging-port=9333`, then run
// `node scripts/demo-progression.mjs [port]` and shoot within ~3 s.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const port = process.argv[2] ?? '9333';
const fsUrl = (p) => `/@fs/${resolve(p).replace(/\\/g, '/')}`;
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
void pathToFileURL;
await page.evaluate(
  async ({ data, game }) => {
    const d = await import(data);
    const g = await import(game);
    const tu = await import('/src/stage/tierUp.ts');
    const lc = await import('/src/pages/loadoutCards.ts');
    const content = d.loadContent();
    const state = g.createInitialState(content);
    const card = content.cards.find((c) => c.evolution === 'flameblade') ?? content.cards[0];
    const owned = { ...g.newOwnedCard(), tier: 'gold', stars: 6, level: 60 };
    state.cards.owned[card.id] = owned;
    const gem = content.resources.find((r) => r.gem);
    tu.playTierUps(
      [
        { kind: 'gem_mastery', id: gem.id, from: 1, to: 2, metal: 'silver' },
        { kind: 'evolution', id: card.id, from: 0, to: 1, metal: 'gold' },
      ],
      {
        content,
        cardProps: (id) => lc.loadoutProps(content, state, id, 'main', []),
      },
    );
  },
  { data: fsUrl('src/data/index.ts'), game: fsUrl('src/game/index.ts') },
);
await browser.close();
