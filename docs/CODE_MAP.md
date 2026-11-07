# Code map

Where things live, so agents can go straight to the right file instead of exploring. Keep it short; update it when you add or move a module. Public API: everything the UI may use is exported from `src/game/index.ts` and `src/data/index.ts`.

## Game logic (`src/game`, pure, `mechanics` agent)

| File                            | What it does                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `state.ts`                      | `GameState` shape, initial state, `cloneState`                                   |
| `tick.ts`                       | `advance()`: one step of production, bursts, card XP, combat, mastery            |
| `loop.ts`, `offline.ts`         | Real-time loop clamp; offline progress and the welcome-back summary              |
| `report.ts`                     | `TickReport` (what happened in a step), `TierUp` events                          |
| `modifiers.ts`                  | The one modifier pipeline (DESIGN 11.5); `collectModifiers` gathers every source |
| `production.ts`                 | Plots, slots, tree/mine unlocks, mine levels, prices (`curvePrice`), output      |
| `combat.ts`                     | Damage lines, bosses, HP bars, bursts, crits, card health, trial, stage readouts |
| `drops.ts`, `hpBars.ts`         | Boss drops and pity; stacked HP bar maths                                        |
| `milestones.ts`, `stages.ts`    | x2-every-25-levels milestones; growth stages 0..4 for tiles and edges            |
| `bulk.ts`, `previews.ts`        | x1/x10/x100/Max buying; before/after previews for buy buttons                    |
| `cards.ts`                      | Collection, loadouts, levels, star-ups, tier-ups, evolutions                     |
| `mastery.ts`                    | Gem mastery and boss medals                                                      |
| `goals.ts`                      | Goal tracker rules (quest scroll)                                                |
| `portals.ts`                    | Summon engine (Card Portal, Wardrobe Gate): pulls, pity, rates                   |
| `wardrobe.ts`, `theme.ts`       | Owning, equipping, upgrading cosmetics; resolving what is shown where            |
| `prestige.ts`                   | Ascension, Starlight, Starlight shop                                             |
| `achievements.ts`               | Achievements and the shard shop                                                  |
| `account.ts`                    | Account XP and levels, reward track, account tree, card enhancements             |
| `save.ts`, `migrations.ts`      | Save format (bump the version + add a migration on every change)                 |
| `num.ts`, `rng.ts`, `format.ts` | `Decimal` (break_eternity), injectable RNG, number formatting                    |

## Data (`src/data`)

`schemas.ts` (zod schemas, `STATS`, cosmetic slots/tokens), `index.ts` (`loadContent`, `Content`), `content/*.json` (every number and piece of content: cards, combat, dungeons, mines, trees, production, portals, cosmetics, sets, rarities, wearRules, cardRules, progression, prestige, achievements, account, enhancements, cosmeticRules, trials, resources).

## Electron (`src/main`, `src/preload`)

`main/index.ts` (window, IPC), `saves.ts`/`saveStore.ts` (save files), `updater.ts`, `fileLogger.ts`, `devPaths.ts` (`BI_PROFILE` per-agent dev saves). `preload/api.ts` is the bridge the renderer may call.

## Renderer (`src/renderer/src`, `ui` agent; art is `pixel-art`)

| Area              | Files                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell         | `app.ts` (loads content + save, runs the loop, dispatches actions), `copy.ts` (all on-screen text), `shell/` (sidebar, header, quest scroll, tooltips, stat breakdowns)      |
| Pages             | `pages/<page>.ts` + `<page>Model.ts` (view models, unit-tested) + `<page>.css`: home, production, dungeons, cards, summon, wardrobe, ascension (on Shop), achievements       |
| Stage juice       | `stage/`: arena, director (reports -> moments), numbers, fly (coins), motion (shared rAF loop), tierUp, toast, reveal (summon), welcome                                      |
| Sound             | `sound/`: registry (data), engine (Web Audio), settings, header mute                                                                                                         |
| Widgets           | `ui/`: card, buy controls, HP stack, cosmetic swatch, `skins.ts` (equipped UI-skin style), `pixelNumbers.ts` (pixel `.bi-num`)                                               |
| Theme             | `theme/`: apply (tokens/recipes), registry (implemented ids), recipes.css, effects.ts (hits, pixel-art owned)                                                                |
| Art (`pixel-art`) | `art/`: items, frame, gems/coins/tiles, bosses, evolutions, fx (element effects), `pixel/` (raster treatment, bake, baked sprites, live motion), `vector/` (source drawings) |

## Scripts and tests

`scripts/sim/` balance sim (`npm run sim -- --hours 40`), `scripts/art/bake-pixels.mjs` (bake sprites), `scripts/shoot-*.mjs` (screenshots), `tests/` (vitest; `helpers.ts` has `plainContent`, `freshState`, `newGame`).
