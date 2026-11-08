# Code map

Where things live, so agents can go straight to the right file instead of exploring. Keep it short; update it when you add or move a module. Public API: everything the UI may use is exported from `src/game/index.ts` and `src/data/index.ts`.

## Game logic (`src/game`, pure, `mechanics` agent)

| File                              | What it does                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `state.ts`                        | `GameState` shape, initial state, `cloneState`                                                                                 |
| `tick.ts`                         | `advance()`: one step of production, bursts, card XP, combat, mastery                                                          |
| `loop.ts`, `offline.ts`           | Real-time loop clamp; offline progress and the welcome-back summary                                                            |
| `report.ts`                       | `TickReport` (what happened in a step), `TierUp`, `HarvestEvent` and `BossAttackEvent` events                                  |
| `modifiers.ts`                    | The one modifier pipeline (DESIGN §14); `collectModifiers` gathers every source                                                |
| `production.ts`                   | Tree/mine unlocks, tree and mine levels, prices (`curvePrice`, in Money), output (one of each)                                 |
| `harvest.ts`, `productionView.ts` | Main-card strikes across the unlocked kinds, burst events (DESIGN §4); `productionStageView`                                   |
| `combat.ts`                       | Fighting damage (`baseDamage` = main card), bosses, wage, drops, bursts, crits, fight XP, trial                                |
| `bossAttacks.ts`                  | Boss attack schedule on the play-time clock (light hits, a slam every sixth), lethal hit, events                               |
| `drops.ts`, `hpBars.ts`           | Boss kill rolls (rare item and pity, Money and crystal purses); stacked HP bar maths                                           |
| `milestones.ts`, `stages.ts`      | x2-every-25-levels milestones; growth stages 0..4 for tiles (tree and mine levels)                                             |
| `upgrades.ts`                     | Upgrade shelf (DESIGN §4): hidden/available/owned items, buy, lifetime Money, support power                                    |
| `bulk.ts`, `previews.ts`          | x1/x10/x100/Max buying (mine and tree levels); before/after previews                                                           |
| `cards.ts`                        | Collection, loadouts, levels (caps by tier), base stats, XP, the star bar, Money tier-ups, the Unique tier, `weaponLookRarity` |
| `mastery.ts`                      | Gem mastery and boss medals                                                                                                    |
| `goals.ts`                        | Goal tracker rules (quest scroll), star bar and tier-ups                                                                       |
| `portals.ts`                      | Summon engine (Card Portal, Wardrobe Gate): pulls, pity, rates                                                                 |
| `wardrobe.ts`, `theme.ts`         | Owning, equipping, upgrading cosmetics; resolving what is shown where                                                          |
| `prestige.ts`                     | Ascension (keeps Starlight and crystals, resets Money), Starlight, Starlight shop                                              |
| `achievements.ts`                 | Achievements and the shard shop                                                                                                |
| `account.ts`                      | Account XP and levels, reward track, account tree, card enhancements                                                           |
| `save.ts`, `migrations.ts`        | Save format (bump the version + add a migration on every change)                                                               |
| `num.ts`, `rng.ts`, `format.ts`   | `Decimal` (break_eternity), injectable RNG, number formatting                                                                  |

## Data (`src/data`)

`schemas.ts` (zod schemas, `STATS`, cosmetic slots/tokens), `index.ts` (`loadContent`, `Content`), `content/*.json` (every number and piece of content: cards, combat, dungeons, mines, trees, production, portals, cosmetics, sets, rarities, wearRules, cardRules, progression, prestige, achievements, account, enhancements, cosmeticRules, trials, resources, upgrades).

## Electron (`src/main`, `src/preload`)

`main/index.ts` (window, IPC), `saves.ts`/`saveStore.ts` (save files), `updater.ts`, `fileLogger.ts`, `devPaths.ts` (`BI_PROFILE` per-agent dev saves). `preload/api.ts` is the bridge the renderer may call.

## Renderer (`src/renderer/src`, `ui` agent; art is `pixel-art`)

| Area              | Files                                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell         | `app.ts` (loads content + save, runs the loop, dispatches actions), `copy.ts` (all on-screen text), `shell/` (sidebar, header with Money and the crystals, `details.ts` Details panel, quest scroll, tooltips, stat breakdowns)                                                                                 |
| Pages             | `pages/<page>.ts` + `<page>Model.ts` (view models, unit-tested) + `<page>.css`: home, production (+ `productionStageModel.ts`: harvest events -> moments), dungeons, cards, summon, wardrobe, ascension (on Shop), achievements                                                                                 |
| Stage juice       | `stage/`: arena, director (reports -> moments), numbers, fly (coins), motion (shared rAF loop), harvestParty (production cards, lunges, gauge), tierUp, toast, reveal (summon), welcome                                                                                                                         |
| Sound             | `sound/`: registry (data), engine (Web Audio), settings, header mute                                                                                                                                                                                                                                            |
| Widgets           | `ui/`: card, buy controls, `shelf.ts` (upgrade shelf panel; model `pages/shelfModel.ts`), `resourceIcons.ts` (swappable resource icon ids; header vs Details split; Details model `pages/detailsModel.ts`), HP stack, cosmetic swatch, `skins.ts` (equipped UI-skin style), `pixelNumbers.ts` (pixel `.bi-num`) |
| Theme             | `theme/`: apply (tokens/recipes), registry (implemented ids), recipes.css, effects.ts (hits, pixel-art owned)                                                                                                                                                                                                   |
| Art (`pixel-art`) | `art/`: items, frame, gems/coins/tiles, bosses, evolutions, fx (element effects), `pixel/` (raster treatment, bake, baked sprites, live motion), `vector/` (source drawings)                                                                                                                                    |

## Scripts and tests

`scripts/check-design.mjs` (checks `docs/DESIGN.md` against its own rules; part of `npm run lint`), `scripts/sim/` balance sim (`npm run sim -- --hours 40`), `scripts/art/bake-pixels.mjs` (bake sprites), `scripts/shoot-*.mjs` (screenshots), `tests/` (vitest; `helpers.ts` has `plainContent`, `freshState`, `newGame`).
