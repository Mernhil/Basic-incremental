// Plays the Phase 2 moments in the running dev app for screenshots: a gem mastery and a medal
// tier-up toast with the metal flash, and a card's Heirloom reveal (DESIGN.md §5).
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
    const card = content.cards.find((c) => c.rarity === 'mythic') ?? content.cards[0];
    const owned = { ...g.newOwnedCard(), tier: 'heirloom', stars: 1, level: 120 };
    state.cards.owned[card.id] = owned;
    const gem = content.resources.find((r) => r.gem);
    tu.playTierUps(
      [
        { kind: 'gem_mastery', id: gem.id, from: 1, to: 2, metal: 'silver' },
        { kind: 'heirloom', id: card.id, from: 0, to: 1, metal: 'prismatic' },
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
