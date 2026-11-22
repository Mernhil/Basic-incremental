# Basic Incremental — Project Overview

The game as it is built now, written from the code: one section per system, each naming the files that hold it. A brief names the sections a chat should read; nobody needs to read the whole file.

How this file is kept:

- It describes only what the code does today. No history, no plans, no opinions: what is decided but not built, open questions and choices a chat made without the user are in `docs/DESIGN.md`.
- Tunable numbers are not repeated here; each rule names the data file and key that holds them.
- Every PR that changes `src/` updates the sections it touches in the same PR. `scripts/check-workflow.mjs` (in `npm run lint`) fails when a file named here does not exist or when a code file or folder is not named anywhere in this file.

## Project shape

A Windows desktop game built with Electron, TypeScript and Vite (through electron-vite).

- `src/game`: the game rules, with no DOM, Electron or Node imports. The page imports it only through `src/game/index.ts`, except `src/game/dev.ts`.
- `src/data`: content JSON, schemas and loader. See Data files and schemas.
- `src/main`: the Electron main process. `src/preload`: its bridge to the page. `src/renderer`: the page (`index.html` loads `src/renderer/src/main.ts`).
- `tests`: Vitest tests (`tests/**/*.test.ts`) and `tests/fixtures`.
- `scripts`: checks, screenshot scripts, art tools, the balance sim. `design`: mockups and screenshots (not linted). `docs`: the documents and `plans/`.
- Build output, git-ignored: `out/` (desktop), `release/` (installer), `out-web/` (web), `out-dev/` (local dev build).

npm commands (`package.json` `scripts`):

- `dev`: runs the app from source. `typecheck`: `tsc --noEmit` on both configs below.
- `build`: `typecheck`, the electron-vite build into `out/`, then `scripts/check-release-bundle.mjs`.
- `test`: Vitest. `lint`: ESLint, Prettier check, `scripts/check-design.mjs`, `scripts/check-workflow.mjs`. `format`: Prettier write.
- `dist`: `build`, then electron-builder makes the Windows installer without publishing; `release` publishes too.
- `build:web`: `vite build --config vite.web.config.ts` into `out-web/`. `design:check`: `check-design.mjs` and `check-workflow.mjs` without ESLint and Prettier. `preview`: `electron-vite preview`. `design:build`, `design:shoot`: build and screenshot `design/explorations`.

TypeScript: `tsconfig.base.json` holds the shared strict options; `tsconfig.node.json` covers main, preload, game, data, tests and `scripts/sim`; `tsconfig.web.json` covers the page, `src/preload/api.ts`, game and data with DOM types.

## Desktop app (Electron)

- **Window** (`src/main/index.ts` `createWindow`): one window with a sandboxed, context-isolated page. New windows are refused (`https://` links open in the default browser) and in-page navigation is blocked.
- **Bridge**: `src/preload/index.ts` exposes `window.api`; its shape (`AppApi`) and channel names (`IPC_CHANNELS`) are in `src/preload/api.ts`.
- **Saves on disk**: `<userData>/saves` (`src/main/saves.ts`). `src/main/saveStore.ts` writes `save.json` through a temp file and a rename, first copying the previous save to `save.bak.json` when it is valid JSON, or to `save.corrupt.json` when it is not. For the save text see Saves.
- **Closing**: `saveBeforeClose` holds the window until the page confirms a last save or a timeout passes.
- **Logs**: `<userData>/logs` holds `main.log`, `updater.log` and `saves.log`. `src/main/fileLogger.ts` writes them and rotates a large file to `<name>.old`; `src/main/logTail.ts` merges their last lines by time for the page.
- **Updater** (`src/main/updater.ts`): a packaged release checks for an update at start, downloads it in the background, tells the page when it is ready and installs on restart or quit.
- **Packaging**: `electron-builder.yml` makes an unsigned one-click NSIS installer from `out/` into `release/`, with GitHub as the update source.

Switches:

- Run from source, the app uses its own `userData` folder `basic-incremental-dev` (`src/main/devPaths.ts`). `BI_PROFILE=<name>` or `--bi-profile=<name>` (letters, digits, `_` and `-`, up to 32 characters, starting with a letter or digit; anything else is ignored) uses `basic-incremental-dev-<name>`; `BI_USER_DATA_DIR=<folder>` uses that folder.
- `BI_HIDDEN_WINDOW=1` (from source only): the window opens off-screen, without focus or taskbar button (`hiddenTestWindow` in `src/main/devMode.ts`).
- `BI_NO_CHEATS=1` (from source only): hides the dev cheats (`devCheatsEnabled` in `src/main/devMode.ts`).
- `BI_DEV_BUILD=1` at build time: `electron.vite.config.ts` builds into `out-dev/` and bakes in `__BI_DEV_BUILD__` (`src/main/buildFlag.ts`). That packaged build keeps the cheats, uses the folder `basic-incremental-devbuild` and never checks for updates.

## Web build

The same page runs in a browser, for example on a phone.

- `vite.web.config.ts` builds it as a static site into `out-web/`, with `__BI_DEV_BUILD__` false.
- `src/renderer/src/main.ts` calls `installBrowserApi` (`src/renderer/src/web/installBrowserApi.ts`). When no desktop bridge exists it installs a `window.api` made by `createBrowserApi` (`src/renderer/src/web/browserApi.ts`): no updater, no dev cheats.
- The save lives in `localStorage` under `bi:save`, with `bi:save.bak` and `bi:save.corrupt` under the desktop's backup rule (`src/renderer/src/web/webSaveStore.ts`).
- The final-save request fires when the page is hidden or closed.
- `npm run serve:web` (`scripts/serve-web.mjs`) builds, serves `out-web/` on the local network and prints the addresses.

## Scripts, checks and CI

Run automatically:

- `scripts/check-design.mjs` checks the shape of `docs/DESIGN.md` and `docs/UI_RULES.md`; `scripts/check-workflow.mjs` checks that a change to `src/` comes with a change to this overview, that no plan doc is left in `docs/plans/`, and that this overview names only files that exist and covers the code folders. Both run in `npm run lint`.
- `scripts/check-release-bundle.mjs`: in `npm run build`.
- `.github/workflows/ci.yml`: on every pull request (also when its description is edited) and push to `main`: lint, test, build.
- `.github/workflows/release.yml`: on a `v*` tag: checks the tag equals the `package.json` version, lint, test, `npm run dist`, then creates the GitHub Release. `RELEASING.md` lists the steps to cut a release.

Run by hand, with Playwright against a running dev app (its `--remote-debugging-port`) or dev server:

- `shoot-*.mjs`, `demo-progression.mjs`: screenshots of a screen or state.
- The other `check-*.mjs`: click through or measure the app and report one kind of fault.
- `a11y-audit.mjs`, `a11y-cards.mjs` and `a11y-shell.mjs`: contrast and keyboard audits; `a11y-measure.mjs` is their shared contrast helper.
- `scripts/probe-app.mjs "<expression>" [port]` evaluates an expression in the running dev app over its `--remote-debugging-port`.
- `oak-*.mjs`, `contrast-sweep.mjs` (sharing `scripts/lib/contrast.mjs`): screenshot views, popups and dialogs under a table cosmetic and sweep their contrast.
- `scripts/art/`, `scripts/shell-art/`: art tools. See Art code.

## Sim and dev tools

- **Balance sim**: `scripts/sim/sim.ts` `runSim` plays the real game rules fast with a scripted player and records when each pacing milestone is reached, as an `active` or an `idle` player. `tests/sim.test.ts` runs it.
- **Running it**: `npm run sim` (`scripts/sim/cli.ts`) runs several seeds in child processes and prints the milestone table. Flags: `--hours`, `--seeds`, `--seed`, `--step`, `--late-step`, `--profile`, `--strict`.
- **Extra reports** (`npx tsx scripts/sim/<file>`): `breakdown.ts` (damage sources), `timeline.ts` (state over time), `ranges.ts` (number ranges), `tiers.ts` (tier gaps), `quests.ts` (with and without quests).
- **Cheats**: `src/game/dev.ts` holds pure functions: grant resources, clear a dungeon, set a floor, set a card's stars and level, add account XP, grant a cosmetic, advance time, reset the game.
- **Panel**: `src/renderer/src/dev/devPanel.ts` calls them and adds game speed buttons (`GAME_SPEEDS` in `src/game/loop.ts`). The Dev button or Ctrl+Shift+D toggles it. Reset first copies the save to `save.before-reset-<time>.json`.
- `scripts/make-new-save.ts` and `scripts/make-meta-save.ts` write a save text to a given path.

Keeping cheats out of releases:

- `src/renderer/src/app.ts` imports the panel and `game/dev` only behind `import.meta.env.DEV || __BI_DEV_BUILD__`, so a release build drops them.
- The main process answers `devCheatsEnabled` false in a packaged release and registers the dev save handlers only when cheats are on.
- `scripts/check-release-bundle.mjs` fails the build when a file in `out/` contains `DEV_CHEATS_MARKER` from `src/game/dev.ts`; `tests/releaseBundle.test.ts` tests the check.

## Game core

The rules of the game live in `src/game` as plain functions over one state object.

### State (`src/game/state.ts`)

`GameState` is built by `createInitialState` and copied by `cloneState`. Its parts:

- `resources`, `production`, `mastery`, `upgrades`, `automation`: see Production.
- `cards`, `discoveredBonds`, `presets`: see Cards.
- `combat`, `bursts`, `activeDungeonId`, `bossHp`, `pity`, `inventory`, `clearedDungeons`: see Fights and Dungeons, floors and stages.
- `portals`, `summon`: see Summon and pulls. `heirlooms`: see Heirlooms and batches.
- `expeditions`: see Expeditions. `ascensionChallenges`: see Challenges and trials.
- `account`: see Account level and reward track, and Skill web.
- `achievements`, `quests`, `shardShop`: see Goals, quests and achievements.
- `prestige`, `prestigeCount`: see Ascension.
- `cosmetics`, `cardSkins`, `legacySkins`: see Cosmetics and themes.
- `stats`: play time, boss kills, longest offline session.

### Numbers and chance

- Amounts (resources, damage, costs, XP) are `Decimal` from break_eternity.js, imported only through `src/game/num.ts`; counters, levels and times are plain numbers. `formatShort` there is the one short number format: up to two decimals below 10, whole digits up to 9,999, then three significant digits and a suffix (k, M, B, T, Qa ...), always rounded toward zero. `src/game/format.ts` `formatDuration` writes times.
- Randomness is passed in as an `Rng` (`src/game/rng.ts`): `defaultRng` in the game, `createSeededRng` for repeatable runs.

### One tick (`src/game/tick.ts`)

`advance(state, content, dtMs, rng)` returns a new state and a report. Each span, with one fixed modifier list (`advanceSpan`), in order:

1. play time and expedition trips advance; the field cache pays scrolls;
2. every work site adds its output, records strikes and lucky strikes, and digs; harvest gauges fill;
3. the forge runs;
4. workers gain card XP, harvested gems count for mastery and account XP;
5. combat runs (`advanceCombat`), Money earned is counted, an Ascension challenge is checked.

Level-ups and unlocks are settled only on a whole-second play-time boundary (`CARD_LEVEL_STEP_MS`): card levels, mastery, depth, autobuyers, account level, bonds, achievements, quests. A span crossing many boundaries jumps to the first one where a look-ahead (`levelUpDue`) finds one of these due; the look-ahead does not check quests, so there quests settle only together with something else. `advanceChunked` runs `advance` in steps of a given size.

### Loop and offline

- `src/game/loop.ts` `GameLoop.step(now)` advances by the real time since the last step, never negative and at most `MAX_STEP_MS` (8 hours). A gap over 5 seconds is caught up in one-minute steps, otherwise one-second steps. `setSpeed` multiplies elapsed time (see Sim and dev tools).
- `src/game/offline.ts` `simulateOffline` runs the time since the last save through the same tick in one-minute steps. Under 10 seconds (`MIN_OFFLINE_MS`) nothing happens. The cap is 8 hours in code (`OFFLINE_CAP_MS`), changed by modifiers on the stat `offline.capHours` (`offlineCapMs`). Expedition trips also advance through the time beyond the cap. It returns an `OfflineSummary` of what was gained.

### Modifiers (`src/game/modifiers.ts`)

- A modifier is `{ stat, kind, value, scope? }` plus the source that grants it. Stats are the `STATS` list in `src/data/schemas.ts`; scope keys are `job`, `producer`, `resource`, `dungeon`, `portal`, and all given keys must match where the stat is read.
- `collectModifiers(state, content)` gathers, in order: owned cosmetics, complete sets, cards, mastery, Starlight shop, account (tree ranks, skill web, reward track cost cap, card enhancements), Heirloom trees, milestone picks, training, tool lines, elements, bonds, Ascension challenges. A challenge can hide cards or remove modifiers (`restrictedView`, `restrictModifiers`). Last, `strengthen` scales tool-line and element modifiers by the stats `tool.strength`, `element.bonus`, `element.resist`, `element.production`: `tool.strength` scales only tool-line upgrade modifiers (per job); `element.production` scales element modifiers on `production.rate`; `element.resist` scales element modifiers with a negative value, `element.bonus` the others.
- `computeStat` (value plus the modifiers applied) and `statValue` (value only) apply: base, plus flats, times (1 + percents / 100), times each mult, `set` (last wins), highest `min`, lowest `max`. A cap (`max`) beats a floor (`min`).

### Other core files

- `src/game/bulk.ts`: buying x1, x10, x100 or Max levels of trees and mines on a cost curve; each level costs what a single buy costs.
- `src/game/report.ts`: `TickReport`, what happened in a span (kills, drops, hits, harvest strikes, tier-ups, level-ups); `mergeReports` joins reports.
- `src/game/meta.ts`: the game title and version label.
- `src/game/index.ts`: the public surface. The renderer imports only `game` and `data` through their `index.ts`; `src/game` imports no Electron, Node, main, preload or renderer code. Both rules are `no-restricted-imports` in `eslint.config.mjs`. Dev cheats are a separate entry, `src/game/dev.ts`.

## Data files and schemas

Game content is JSON in `src/data/content/`, imported by `src/data/index.ts`. `loadContent()` calls `validateContent`, which parses each file with its zod schema in `contentSchemas` (`src/data/schemas.ts`), then runs cross-file checks. Problems throw `ContentValidationError`. The result is the typed `Content` object with by-id maps. Big amounts are strings turned into `Decimal`. Portals with `enabled: false` are always left out of `portals` (they stay in `allPortals`); dungeons with `enabled: false` are left out of `dungeons` unless the `unreleased` option is set (they stay in `allDungeons`). No script in `scripts/` writes these files; the one-off `design/pixel/t6-heirloom-b2/build-content.mjs` wrote parts of five of them.

| File                 | Holds                                                                                                                             | Section                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `account.json`       | Account XP, level curve, `rewardTrack` (one entry per `level`), skill tree (`skeleton`, `branches`, `circles`), respec            | Account level and reward track             |
| `achievements.json`  | `achievements` (condition, reward) and `shardShop` stock                                                                          | Goals, quests and achievements             |
| `batches.json`       | Art batches: kit and backdrops                                                                                                    | Heirlooms and batches                      |
| `bonds.json`         | Named card pairs and their modifiers                                                                                              | Cards                                      |
| `cardRules.json`     | Card levels, XP, power, costs, start cards                                                                                        | Cards                                      |
| `cards.json`         | One entry per card: `id`, `name`, `job`, `tier`, `element`, `item`, then `role`, `ability` and `teamBonus` (fighting) or `worker` | Cards                                      |
| `challenges.json`    | Ascension challenges                                                                                                              | Challenges and trials                      |
| `coins.json`         | The coins Money is shown in                                                                                                       | Views and shared widgets                   |
| `combat.json`        | Bursts, floors, difficulties, stage stars, crit, elements, boss abilities                                                         | Fights                                     |
| `cosmeticRules.json` | Cosmetic max levels, ladders, upgrade costs                                                                                       | Cosmetics and themes                       |
| `cosmetics.json`     | Every cosmetic                                                                                                                    | Cosmetics and themes                       |
| `credits.json`       | Asset packs and licences                                                                                                          | Screens                                    |
| `dungeons.json`      | Dungeons, their enemies and drops                                                                                                 | Dungeons, floors and stages                |
| `enhancements.json`  | Unlock rank, budget per tier, and per card id its options (`id`, `name`, `cost`, `milestone`, `modifiers`)                        | Cards                                      |
| `expeditions.json`   | Trip lengths, places, rewards                                                                                                     | Expeditions                                |
| `heirlooms.json`     | Heirloom Gate, scroll sources, one tree per Heirloom                                                                              | Heirlooms and batches                      |
| `items.json`         | Item types and their names per tier                                                                                               | Cards                                      |
| `mines.json`         | Mine types                                                                                                                        | Production                                 |
| `perks.json`         | `milestones`: a line (tree, mine, tool or training), a `level`, and `options` with `effects`                                      | Production                                 |
| `portals.json`       | Portals: cost, pool, pity                                                                                                         | Summon and pulls                           |
| `prestige.json`      | Starlight gain and shop, ascension rewards                                                                                        | Ascension                                  |
| `production.json`    | Tool lines, workers, forge, lucky strikes                                                                                         | Production                                 |
| `progression.json`   | Mastery, tile stages, goal rules                                                                                                  | Production; Goals, quests and achievements |
| `quests.json`        | Quests                                                                                                                            | Goals, quests and achievements             |
| `rarities.json`      | Rarity names and colours                                                                                                          | Cosmetics and themes                       |
| `resources.json`     | Every resource and its kind                                                                                                       | Production                                 |
| `scrolls.json`       | Scroll sources and the reveal show                                                                                                | Summon and pulls                           |
| `sets.json`          | Cosmetic sets and bonuses                                                                                                         | Cosmetics and themes                       |
| `shellArt.json`      | Picture pieces per table                                                                                                          | Shell and table                            |
| `skills.json`        | Duel skills per weapon type and card                                                                                              | Fights                                     |
| `training.json`      | Training lines                                                                                                                    | Fights                                     |
| `trees.json`         | Tree kinds                                                                                                                        | Production                                 |
| `trials.json`        | Special dungeons                                                                                                                  | Challenges and trials                      |
| `weaponSkins.json`   | Legacy weapon skins                                                                                                               | Cosmetics and themes                       |
| `wearRules.json`     | Rank a card needs to show a border, finish or exclusive                                                                           | Cosmetics and themes                       |
| `web.json`           | Skill web `arms` and `nodes` (`perLevel`, `cost`, `maxLevel`)                                                                     | Skill web                                  |

## Production

Two gathering jobs, logging and mining, make gems every second on their own. Trees and mines are levelled with Money and worked by cards. The logic is in `src/game/`, run each step by `advanceSpan` in `src/game/tick.ts` (see Game core).

### Resources

- `src/data/content/resources.json` lists every resource with its `kind`: `tree_gem`, `mine_gem`, `material`, `currency` (Money), `scroll`, `prestige` (Starlight).
- Each tree and mine yields its own gem (`resource` in `trees.json` / `mines.json`). Gems are spent on tree unlocks (`trees.json` `unlockCost`), Training lines (`training.json` `cost`) and forge recipes (`production.json` `forge.recipes`).
- Money comes from dungeons (see Fights) and buys tree levels, mine levels and tool lines.
- Star Dust is made by the forge and spent on card stars (see Cards). Other materials, scrolls and Starlight: see Fights, Summon and pulls, Ascension.
- Not production: `coins.json` (how Money is shown), `scrolls.json` (see Summon and pulls).

### Trees and mines (`src/game/production.ts`)

- A tree with an empty `unlockCost` is open from the start; the others are unlocked once by paying gems (`unlockTree`). A mine is open when its `unlockedByDungeon` is null or that dungeon has been cleared (`isProducerUnlocked`, `clearDungeon`).
- Levels are bought with Money on a growing price curve (`level.cost`; `curvePrice`). `cost.growth` cuts never remove more than a fixed share of the growth above 1 (`MAX_GROWTH_CUT`).
- Buying several levels or Max is in `src/game/bulk.ts` (`buyTreeLevels`, `buyMineLevels`, `curveOffer`).
- Output per second (`producerRate`, `workSites`, `siteOutput`): base rate, plus `level.ratePercent` per level, times the level milestones, through the `production.rate` modifiers, times the workers' power, the depth yield, the average crit factor and the lucky strike factor. Nothing is rolled.
- Level milestones (`src/game/milestones.ts`, used by trees, mines, yield/speed tool lines and Training lines): every `milestones.every` levels multiply the line by `milestones.multiplier`.
- Tile growth (`src/game/stages.ts`): a tree or mine tile's growth stage is `tileStage`, the level milestones its line has reached, capped at stage 4 (`growthStage` in `src/game/milestones.ts`); it follows the level, so an Ascension resets it. `milestoneTierUps` turns the milestones crossed by a level buy into the tier-up events `src/game/bulk.ts` reports. `progression.json` `tileStages` is validated by the schema but the code does not read it.
- On Ascension (`resetProduction`) levels, tool lines, depth and harvest gauges start over; unlocked trees, worker assignments and the forge are kept.

### Workers (`src/game/workers.ts`)

- Logging cards work trees and mining cards work mines; a card works one place (`assignWorker`). The saved assignment is `production.workers`; `activeWorkers` leaves out anything invalid (not owned, wrong job, locked place, on an expedition, over the limits).
- Slots (`workerSlots`): a base plus a number per Ascension, capped by the number of places, plus second slots from the Starlight shop item granting `second_worker_slots` (first places in content order first); numbers in `production.json` `workers.slots`. An Ascension challenge can cap the total worker slots (`challengeWorkerLimit`, see Challenges and trials).
- A worker's power (`workerPower`) is its tier's value in `production.json` `workers.tierPower` times `cardStatPower` (see Cards); an Heirloom uses the mythic value. A place's power is the sum of its workers' (`placePower`). Every unlocked place produces: one with no worker yields its level rate (with the yield of the layer it has already reached), but no strikes, crits, gauge, digging or lucky strikes.
- `workerModifiers` gives each working card's worker ability, scoped to its own place, plus an output bonus when the card's element matches the place's `element` (`workerElementModifier` in `src/game/elements.ts`). Picked perks with `card.teamBonusPower` make a job's worker abilities stronger (`teamBonusPower` in `src/game/upgrades.ts`, applied in `workerModifiers`).
- Each step, workers earn card XP for what their place harvested (bursts included) and the harvested gems feed gem mastery and account XP (`advanceSpan` in `src/game/tick.ts`; see Cards and Account level and reward track).

### Harvest (`src/game/harvest.ts`)

- A place's first worker strikes in its card's pattern (`worker.harvest` in `cards.json`: `intervalSeconds`, `strikes`), faster with `harvest.speed`. Strikes are events for the screen only (`recordStrikes`).
- Harvest crits: base in `production.json` `harvest.crit`, changed by `harvest.critChance` and `harvest.critDamage` (`harvestCrit` in `production.ts`).
- Each worked place fills a harvest gauge (`production.harvestGauges`); when full it pays several seconds of the place's output at once (`advanceHarvestGauges`). Numbers: `combat.json` `bursts.logging` / `bursts.mining`.

### Depth (`src/game/depth.ts`)

- Each tree has ages and each mine has layers (`depth` in `trees.json` / `mines.json`). Workers break the current layer's hardness at `digRate` times their power and strike speed (`digPerSecond`); each layer broken multiplies the place's yield by `yieldGrowth` (`layerYield`). Layers settle once a second (`settleDepth`).

### Lucky strikes (`src/game/lucky.ts`)

- A worked place shows a lucky strike for a short window in every period (`production.json` `lucky`). Its payout is in the output as an average (`luckyFactor`, stat `lucky.payout`); `luckyWindow` and `recordLuckyStrikes` only show it.

### Tool lines (`src/game/toolLines.ts`)

- Each job has repeatable lines bought with Money (`production.json` `tools`): yield and strike speed lines multiply their stat and have level milestones; crit chance and crit damage lines add to the harvest crit. Levels: `production.tools` (`buyTool`, `toolModifiers`). `items.json` holds no tools; it names the card weapon types (see Cards).

### Training (`src/game/training.ts`)

- Repeatable fighting upgrade lines (`training.json`); each line is paid in its own gem kind (`cost.resource`), not Money. Each level adds `ratePercent` and milestones multiply the line (`trainingMultiplier`, `buyTraining`). Levels are in `combat.training` and reset on Ascension.

### Milestone picks (`src/game/upgrades.ts`, `perks.json`)

- `perks.json` `milestones` gives every tree, mine, tool and Training line levels where the player picks one of two perks (`pickPerk`). A pick is final, stored in `upgrades.picks` and kept through Ascension (`keepUpgrades`); its effects apply only while the line is at or above that level (`perkModifiers`). A reached milestone with no pick waits (`waitingPicks`).

### Gem mastery (`src/game/mastery.ts`)

- Every gem harvested adds to a lifetime total (`countHarvest`, `mastery.harvested`). Totals reaching the thresholds in `progression.json` `gemMastery` raise that gem's tier (`settleMastery`, once a second), and each tier adds the `perTier` bonuses for that gem (`masteryModifiers`). The file also holds trial medals (see Challenges and trials).

### Forge (`src/game/forge.ts`)

- One production card can work the forge instead of a place (`assignForgeWorker`, `forgeWorker` in `workers.ts`); it uses a worker slot. The player chooses a recipe (`setForgeRecipe`). Progress per second is the forge's base `speed` times the worker's power, through the `forge.speed` modifiers; each time it reaches the recipe's `work`, the inputs are spent (less the `forge.refund` share) and the output added (times `forge.yield`) (`advanceForge`). Without enough gems it waits. The forge is kept through Ascension.

### Autobuyers (`src/game/autobuyers.ts`)

- Two Starlight shop items (those granting `autobuyer_trees` and `autobuyer_mines`; see Ascension) buy tree and mine levels once a second, cheapest affordable first, while switched on in `state.automation`. They never spend below `reservePercent` of what was held when the pass began (`settleAutobuyers`, `setAutomation`).

### View helpers

- `src/game/productionView.ts` (each place's display, the worker picker), `src/game/lineView.ts` (what buying levels of a line changes, its next milestone) and `src/game/previews.ts` (output before and after a level buy).

## Cards

A card is one weapon. The player collects cards, puts fighting cards in a team of four and sets logging and mining cards to work. A card grows by levels (from XP) and by stars (from copies). The rules are in `src/game/cards.ts`, the cards in `src/data/content/cards.json`, every progression number in `src/data/content/cardRules.json`.

### The roster

- `cards.json` holds 200 cards. Each has an `id`, a `job` (`fighting`, `logging` or `mining`), a `tier`, an `element` (T6 and Heirloom only) and an `item.kind` (its weapon type). Shape: `cardSchema` in `src/data/schemas.ts`.
- There are 11 weapon types (`ITEM_KINDS`): nine for fighting, the pickaxe (mining) and the logging axe (logging). A card's job must be its type's job in `items.json` (`checkItems` in `src/data/index.ts`).
- There are seven tiers, in order (`RANK_TIERS`): Wood, Bronze, Silver, Gold, Prismatic, Mythic, Heirloom. Shown names: `tierLabel`.
- Wood to Prismatic: exactly one card per weapon type per tier, 55 cards (`checkCards` in `src/data/index.ts` refuses any other count).
- Mythic (T6): 111 cards (53 Mythic, 58 Void). Each has a `side`, `mythic` or `void`; a `void` card shows its tier as "Void". Only T6 and Heirloom cards have a side. A card's grade (`cardGrade`, `CARD_GRADES`) is its tier, with T6 and Heirloom cards taking their side.
- Heirloom: 34 cards with `heirloom: true` at the tier `heirloom`, which no other card has. They are separate cards in the same list, not a stage of another card: one per weapon type with no `batch`, one per type in the Leviathan batch, and twelve in the Wildwood batch (two daggers). See Heirlooms and batches.
- A new game owns the cards in `cardRules.json` `startCards` (`initialCards` in `src/game/state.ts`).

### A card never changes tier

- A card is gained at its own tier, one star, level 1 (`freshCard`, `grantCard`). `OwnedCard.tier` copies the card's `tier`; when a save loads it is read from `cards.json`, not from the save (`deserializeCards` in `src/game/save.ts`).
- No function in `src/` raises a card's tier; the only write, in the dev tool (`src/game/dev.ts`), refuses a tier other than the card's own. `tests/noCardRarity.test.ts` fails if a list of removed tier-up and rarity-cap names, or `card.rarity`, appears in `src/game`, `src/renderer/src`, `src/data` or `scripts/sim`.

### No card rarity

- Cards have no rarity field. `RARITIES` and `rarities.json` serve cosmetics and colour: `rarities.json` holds one card-body colour style per step, and a card uses the style at the position of its grade (`gradeStyle`, `cardStyle` in `src/data/schemas.ts`). See Cosmetics and themes.

### Name

- A card has one name, its weapon's: `cardDisplayName` (through `itemName`) in `src/game/cards.ts`.
- Wood to Prismatic: material word plus type word (`items.json` `materials`, `types[].noun`).
- Mythic: the card's own `heirloomName` if it has one, otherwise its type's `mythic` or `void` name in `items.json`, by side.
- Heirloom: the card's `heirloomName` if it has one, otherwise its type's `heirloom` name in `items.json`.
- Every card in `cards.json` also has a `name`. Below the Heirloom tier it is a character-style name that no player sees: only the data checks and the dev-only gallery (`src/renderer/src/gallery/gallery.ts`) read it. An Heirloom card's `name` is its weapon's name (checked in `src/data/index.ts`), and the Heirloom skill-tree tab shows it through `cardName` in `src/renderer/src/pages/heirloomMapModel.ts`.

### Levels and XP

- The level cap depends on the tier only (`levelCap`, `cardRules.json` `levelCaps`); stars do not raise it.
- XP for the next level: `xpToNextLevel` (`xpCurve`). The first levels past each lower tier's cap are breakthrough levels (`breakthroughTier`): they need much more XP (`xpCurve.stepWall`).
- Fighting cards in the loadout earn XP per second fought and per boss kill (`fightingXpPerSecond`, `fightingXpPerKill`; `cardRules.json` `xp`). A worker earns XP per unit its place harvests (`productionXpPerUnit`). All go through the `xp.card` stat. A card at its cap gains none.

### Stars and copies

- A card has 1 to 6 stars (`MAX_STARS`). A copy of an owned card adds one to its star bar (`OwnedCard.starFill`); a star costs one copy at every tier (`starFillNeeded`, `starUp`). Level and XP stay.
- Star dust (resource `star_dust`) pays for the missing part of a star, priced by tier in `cardRules.json` `starBar.dust` (`starDustCost`, `starUpWithDust`).
- A copy the bar cannot use (six stars, or fill for every star left) becomes card shards, by tier in `cardRules.json` `shards`, spent in the shard shop (`shardShop` in `src/game/achievements.ts`).
- A copy of an owned Heirloom card always gives shards; its stars are covered in Heirlooms and batches.

### What level, stars and tier do to the numbers

- Base damage and health (`cardBaseDamage`, `cardHealth`): the tier's base (`cardRules.json` `baseDamage`, `health`; an Heirloom reads the Mythic row) times the weapon type's factor (`weapons`) times `cardStatPower`, which grows with level (`power.perLevel`), stars (`power.starMultiplier`) and the tier step (`power.statTier`).
- Abilities and team bonuses scale with `cardPower`: level, stars (`power.perStar`, `power.star6Bonus`) and a smaller tier step (`power.tier`).
- The tier step comes with levels (`tierStepAt`): a card starts on the Wood step and climbs a step each time its level passes a lower tier's cap, spread over `power.tierStepLevels` levels, up to its own tier. An Heirloom card has its own fixed step.
- The figures shown on a card come from `src/game/cardStats.ts`.

### Jobs, roles and elements

- Jobs (`JOBS`): fighting cards go in the loadout; logging and mining cards are workers (see Production).
- Roles (`CARD_ROLES`): every fighting card has a `role` in `cards.json`: Tank, DPS or Support. It is a label and a filter on the Cards page; no game rule reads it. `cardRules.json` `weaponRoles` is read by no code.
- Elements (`ELEMENTS` in `src/data/schemas.ts`): water, fire, earth, light, dark. Only the 111 T6 and 34 Heirloom cards have one (water 24, fire 35, earth 33, light 22, dark 31: the Dragon and Leviathan cards from `design/weapon-elements-2026-11-21.json`, the Wildwood hero side earth and villain side fire; checked by `tests/elements.test.ts`); a Wood to Prismatic card has none and does plain base damage: neutral against every boss, no worker bonus, no expedition doubling. The Wildwood earth logging cards (Grovehewer, Beetlejaw) are the first that get the trees' earth bonus. In `src/game/elements.ts`, a fighting card's element against a dungeon boss's weakness or resistance changes that card's own damage there (`elementRelation`, `elementDamagePercent`), and a worker on a tree or mine of its own element gets an output bonus. Places: the trees earth; Iron Deeps and the quarry earth, Crystal Grotto water; the expedition places earth, fire and water.

### Abilities and team bonuses

- A fighting card has an `ability` (its own, see Fights) and a `teamBonus` (for the team), both modifier lists in `cards.json`. A worker card has one `worker` ability that acts only at its own place.
- `cardEffectModifiers` scales them by the card's power; an ability also gains `cardRules.json` `abilityGrowth`. `cardModifiers` passes the loadout's team bonuses and the workers' abilities to the modifier pipeline (see Game core).

### The loadout

- Only fighting has a loadout: four slots (`LOADOUT_SLOTS` in `src/game/state.ts`), in order back left, front left, front right, back right (`FRONT_SLOTS`). What the rows do is in Fights.
- `loadoutProblem` refuses a loadout with a card that is unknown, not owned, not a fighting card, away on an expedition or in twice, with more than two Heirloom cards (`MAX_LOADOUT_HEIRLOOMS`), or over the cost cap.
- A card's cost is by tier (`cardRules.json` `cost`; an Heirloom card costs `heirloomCost`). The cap (`loadoutCostCap`) is `cardRules.json` `costCap` (a base plus an amount per account level), plus `loadout.costCap` modifiers, stopped at `account.json` `loadoutCostCapTop`. See Account level and reward track.

### Presets

- `src/game/presets.ts`. Each dungeon remembers the fighting loadout it was left with: `pickDungeon` stores the current one for the dungeon being left and puts on the new dungeon's. A remembered loadout that breaks a loadout rule is kept but not applied.
- Logging and mining each have three named presets of which cards work which place (`PRESETS_PER_JOB`).

### Bonds, sets and enhancements

- Bonds (`src/game/bonds.ts`, `bonds.json`): two named cards at work together (both in the fighting loadout, or both working) give a bonus. A bond is discovered the first time it is active (`bondCodex`).
- Sets (`sets.json`) are cosmetic sets, not card sets: see Cosmetics and themes.
- Enhancements (`enhancements.json`; code in `src/game/account.ts`): every card has its own list of options. A card gets a point budget by tier (`budget`) from the rank in `unlockRank`; an option costs points and may need a card level (`milestone` times `milestoneEvery`). `chooseEnhancement` picks one, `resetEnhancements` clears them for free. Options count only while the card is in the loadout or working, a worker's only at its own place.

## Summon and pulls

The player spends scrolls at portals to pull cards, cosmetics and legacy weapon skins, one pull or ten at a time.

### Portals

- `src/data/content/portals.json` lists three portals, each with a `kind`:
  - **Card Portal** (`card_portal`, `cards`): every card except the Heirloom cards. Paid in `summon_scroll`. It has a level (`levels`, `minShare`), a T6 pity with a rising chance (`pity.softFrom`) and a first 10-pull guarantee (`firstTenPullGuarantee`); the other portals have none of these.
  - **Wardrobe Gate** (`wardrobe_gate`, `cosmetics`): cosmetics. Paid in `glamour_scroll`.
  - **Legacy Gate** (`legacy_gate`, `skins`): legacy weapon skins. Paid in `glamour_scroll`.
- **Focus Portal** (`focus_portal`) is not in the file. `resolvePortal` in `src/game/portals.ts` builds it from the Card Portal: the pool is cut to the cards of the item type the player chose (`state.summon.focusKind`, `setFocusKind` in `src/game/summon.ts`). Each tier keeps its Card Portal chance, split equally over the cards left. Price, pity, level and counters are the Card Portal's, and so are its tier chances. With no type chosen a pull fails (`no-focus`).
- **Unlocking**: no portal has an unlock condition. `enabled: false` in `portals.json` leaves a portal out of `content.portals` (`src/data/index.ts`); all three are enabled.

### How a pull is rolled (`pull` in `src/game/portals.ts`)

1. The price (`cost.single` or `cost.ten` in `cost.resource`, through the `cost.multiplier` stat, `pullPrice`) is paid once.
2. Tier chances (`tierChances`). A portal with `levels` takes the row of its level: `portalLevel` is the last level whose `pulls` the portal's pull count has reached (no save field of its own). Each tier keeps at least `minShare`, never more than its level-1 chance, until it is complete (`tierComplete` in `src/game/tierRewards.ts`: every card of it the Card Portal can pull is at six stars); a complete tier leaves the pool, and the shares are scaled back to a whole. A portal without levels weighs its tiers by their entries' weights.
3. Rising pity: past `pity.softFrom` the chance of the pity grade or better rises in a straight line, from that pull to a sure result at the threshold.
4. The pick (`pick`): one random number picks a tier by those chances, and the rest of it picks the entry in that tier by weight. Wishlist (card portals): when the tier has marked cards in the pool, the pick is made among them only.
5. Hard pity: when the pulls since the last result of the pity grade or better, plus one, reach the threshold (`pity.threshold` through the `summon.pityThreshold` stat), the pick is made only among tiers of that grade or better. It is off once every card of that grade or better is complete (`pityOpen`). The Card Portal's pity grade is T6 (`mythic`, both sides).
6. 10-pull guarantee: on the last pull of a 10-pull, if no earlier pull reached the guarantee and it is not a pity pull, the pick is made only among tiers of that grade or better. The first 10-pull of a new game on the Card or Focus Portal uses `firstTenPullGuarantee` (Gold) and sets `state.summon.firstTenPullDone`; later ones use `tenPullGuarantee`. A second random number decides the reveal's upgrade flash (`reveal.upgradeFlashChance`).
7. The item is granted (`grantItem`); the pity counter resets on a result of the pity grade or better, else rises by one. After a card portal pull, `settleTierRewards` pays any tier just completed (see Tier completion).

- All pulls together give account XP (`account.json` `xp.perPull`), see Account level and reward track.
- A card portal's file entries name a `tier` (T6 split into `mythic` and `void`). `portalSchema` in `src/data/schemas.ts` maps them onto the seven-step key `rarity` (`gradeStyle`) the engine uses for every portal.
- Counters (`pity`, `pulls`, `pityHits`) are per portal in `state.portals`. `portalInfo` gives the Summon page prices, pity (with `softFrom` and whether it is open), the level (`PortalLevelInfo`), the first 10-pull guarantee while it is due, and the odds of the next pull with the level and the rising pity counted.

### Tier completion (`src/game/tierRewards.ts`)

- A tier is complete when every card of it the Card Portal can pull is at six stars; at T6 the Mythic and Void sides are two tiers (`tierComplete`, `tierProgress` for the Summon page).
- `settleTierRewards` pays each complete tier once: its Summon Scrolls (`cardRules.json` `tierReward.scrolls`) and the grade added to `state.summon.tierRewardsClaimed`. It runs as time passes (`tick.ts`), after a card portal pull and when a save loads.
- `tierRewardModifiers` (in `collectModifiers`) gives `tierReward.damagePercent` percent `combat.damage` per paid tier, for as long as the save lives.

### What a pulled item becomes

- **Card** (`grantCard` in `src/game/cards.ts`): a new card is added at its own tier. An owned card gains one on its star bar (`starFill`); at the top star, or with the bar full, the copy pays card shards (`cardRules.json` `shards`). A copy of an owned Heirloom card (only reachable from other grant paths, since no pool holds one) always pays card shards and never fills a star bar. See Cards.
- **Cosmetic** (`grantCosmetic` in `src/game/wardrobe.ts`): new, or one more copy for its upgrade levels. See Cosmetics and themes.
- **Legacy skin** (`grantLegacySkin` in `src/game/portals.ts`): new, or if owned it pays back `duplicatePayback` of a single pull's price.
- **Wishlist**: `setWishlisted` marks or unmarks a Card Portal card in `state.cards.wishlist`. At most `wishlistPerTier` (`portals.json`) cards per tier can be marked, the two T6 sides counted separately.

### Scrolls and the reveal (`src/game/summon.ts`, `src/data/content/scrolls.json`)

- This file pays Summon and Glamour Scrolls for the first win of a floor (`floorFirstWin`, by floor kind and difficulty), the field cache (`fieldCache`, a lump per `everyMinutes` of play time while a dungeon is active) and the daily reward (`daily`, once per local day, `claimDaily`).
- `revealPlan` plans the reveal from `scrolls.json` `reveal`: which cards glow, and which card of a multi-pull flips last. See Stage effects.
- `src/data/content/coins.json` is not part of summoning: it holds the coin steps of the Money display (`src/renderer/src/settings/coins.ts`).

## Heirlooms and batches

Heirlooms are cards that come only from the Heirloom Gate, with their own shards and bonus trees.

### What an Heirloom is

- A separate card in `src/data/content/cards.json` with `heirloom: true` and the fixed tier `heirloom`. It is never an upgrade of another card: it gets its own entry in `state.cards.owned` (`unlockHeirloom` in `src/game/heirlooms.ts`).
- There is **one Heirloom per weapon type per batch** (item types x batches), except the Wildwood batch, which has two daggers (Phoenixquill and Foxtail). `checkHeirlooms` in `src/data/index.ts` requires exactly one Heirloom without a `batch` per item type, named by `items.json` `heirloom`. A second Heirloom of a type in one batch sets `pictureAlt` (`cardSchema`): its picture key in `checkCards` gets `/alt` and its picture is `item-<type>-<batch>-heirloom-alt` (`cardTierArt`). There is no Mythic and Void Heirloom pair per type.
- `side` (`mythic` or `void`) is required on every T6 and Heirloom card and on no other (`checkCards` in `src/data/index.ts`). For an Heirloom it only chooses its grade and colour (`cardGrade`, `cardStyle`), the backdrop tint, the label and grid-cell styling on the Summon and Cards pages (`HeirloomEntry.side`), and the uniqueness key of batch pictures; it changes no stat, pool or odds.
- No Heirloom is in a portal pool.

### Batches

- `src/data/content/batches.json` lists the art batches in order, each with a card kit sprite (`kit`) and optional Heirloom backdrops (`backdrop`). `batches.json` itself holds art only; the batch's cards (T6 and Heirloom) are ordinary cards in `cards.json` and the Heirloom ones are in the Heirloom Gate's pool. See Art code.
- Cards of the first batch have no `batch` field; later ones name their batch (`checkBatches`). Only T6 and Heirloom cards carry one.
- T6 is the tier `mythic`; a T6 card is Mythic or Void by its `side`. The Leviathan batch has one Mythic T6 card, one Void T6 card and one Heirloom per weapon type (`tests/leviathanBatch.test.ts`).
- The Wildwood batch (batch 3, kit `kit-t6-wildwood`, no backdrop) has 22 T6 cards, 11 hero (Mythic, earth) and 11 villain (Void, fire), and 12 Heirlooms, 7 earth (side `mythic`) and 5 fire (side `void`). Ids are the shown weapon names in snake case. Each card is cloned from the Dragon card of its type and side (stats, ability, team bonus); its `enhancements.json` options, `heirlooms.json` tree (the type's Dragon nodes and numbers, its own tree and capstone names), shard shop copies (`achievements.json`) and portal pool entries were added with it. Made by `design/pixel/t6-heirloom-b3/build-content.mjs` and `import.py`; tested in `tests/wildwoodBatch.test.ts`.

### The Heirloom Gate (`pullHeirloomGate`, `heirlooms.json` `gate`)

- Paid in `heirloom_scroll`, single or 10-pull.
- Each pull first picks one Heirloom at equal chance among all 34 (`heirloomCards`). The pull is that whole Heirloom if the pity counter is due (`pity`) or at chance `wholeChance`: not owned, it unlocks it; owned, it gives `wholeRepeatShards` of it. Otherwise it gives between `shards.min` and `shards.max` shards of the picked Heirloom.
- The pity counter resets on every whole Heirloom. The gate has no 10-pull guarantee and no wishlist.
- Shards (`addHeirloomShards`) are spent at once: `unlockShards` unlock the card, then `starShards` buy each star. At the top star each further shard becomes card shards (`cardShardsPerOverflow`).
- `state.heirlooms` (shards, pity, pulls, trees) is kept through Ascension (`tests/heirloomGate.test.ts`).

### Heirloom Scrolls (`heirlooms.json` `scrolls`)

- Paid for a Nightmare last-floor boss (first win, then each kill) and every `endlessDepthEvery`-th endless depth first reached (`heirloomScrollsForClear`), for the top stage chest on Nightmare (`src/game/stageStars.ts`), and for each Ascension from `ascensionFrom` on (`heirloomScrollsForAscension`).

### Heirloom trees (`heirlooms.json` `trees`, `points`)

- One tree per Heirloom. Points come from its stars (`perStar`) and from reaching `points.levels` (`heirloomPoints`). `buyHeirloomNode` buys a node when a required node is bought and points are free; `respecHeirloomTree` clears the tree for free.
- Bought nodes act only while the Heirloom is at work (`heirloomTreeModifiers`); a node with a `skill` gives that duel skill (`heirloomSkill`). See Fights.

## Fights

The active dungeon is fought automatically: the fighting loadout's cards hit the floor's enemies one at a time, the floor hits back, and kills pay loot and XP. The loop is `fightDungeon` in `src/game/combat.ts`, run by `advanceCombat` on every `advance` (`src/game/tick.ts`). Floors, Challenges, difficulties and stage stars: see Dungeons, floors and stages.

### What "duel" means

- There is one team and one set of card rules (`src/game/duel.ts`: the team, each card's hits, health, targeting), used by both fight loops in `combat.ts`: `fightDungeon` for floors and `fightTrial` for trials. `combat.ts` runs them and pays rewards.
- `src/game/duelView.ts` is the read-out of that same fight for the screen: `teamView`, `duelEnemy` and an unsaved fight log (`recordDuel`). It changes no state. See Stage effects.

### The team

- The team is the fighting loadout's cards, left to right, minus cards an Ascension challenge excludes (`teamPlacements`). Of the four slots the middle two are the front row, the outer two the back row (`src/game/state.ts` `FRONT_SLOTS`).
- With no card, bare hands deal `combat.json` `unarmedDamage` and are never hit.
- `buildTeam` gives each card its own numbers: team-wide modifiers apply to every card; a card's Ability, element bonus and Heirloom signature power apply to that card alone (`teamModifiers`).
- Each card has one skill from `skills.json` (`cardSkill`): an Heirloom's bought tree skill, else the card's own (`cards`), else its weapon type's (`weapons`). A skill can scale damage and health (`damage`, `health`), be a guard (`guard`), weaken enemy attacks while its card stands (`weaken`) or heal with its signature (`signature.kind`, `share`).

### Our damage

- A card's damage per second is its base damage (`cardBaseDamage`: `cardRules.json` `baseDamage` and `weapons.<type>.damage`, see Cards) through the `combat.damage` modifiers, times its skill's `damage` and the crit factor.
- Crits are dealt as their average, `1 + chance x (damage - 1)`, from `combat.json` `crit` and the `combat.critChance` / `combat.critDamage` modifiers (`critStats`, `critFactor`). On-screen crits are rolled for show only (`rollHitForShow`).
- Elements: a card whose element is the dungeon boss's `weakness` or `resistance` (`dungeons.json` `boss`) has its own damage changed in that whole dungeon by `combat.json` `elements.weakness` or `elements.resistance` percent (`src/game/elements.ts`). Every boss has a weakness; `resistance` is optional and only water, fire or earth (nothing resists light or dark); Frostspire Vault, Sunken Sanctum and Hollow of the Void have none. A card with no element is neutral.
- Card hit number k lands at k x interval seconds of play time (`hitsBy`), worth damage per second x interval; enemy attacks use the same clock. Interval, gauge size, fill and signature power: `combat.json` `bursts.fighting` through the `burst.*` modifiers (`burstStats`).
- Every hit fills the card's signature gauge; a full gauge fires the signature on that hit: extra damage of `power` hits, or for a healing skill a heal of every standing card by `share` of its max health (`healTeam`) instead. A heal only restores standing cards; a knocked-out card stays out until the floor is cleared (`healTeam` in `src/game/duel.ts`). On screen a signature hit plays the card's special attack (`stage/specialAttack.ts`, see Stage effects).
- The stage's star level multiplies all damage on that floor (`stageDamageFactor`).

### Enemies and health bars

- A floor's enemies stand one at a time (`fightStage`), their HP after the `combat.bossHp` modifiers. Saved: `state.bossHp` (HP left of the current enemy) and `state.combat.enemyIndex`.
- Damage stops at the kill and the next enemy starts at full HP. With the stage's overflow switch on, the floor is one HP pool and leftover damage carries on (`damageFloor`).
- `src/game/hpBars.ts` `hpBarState` splits an enemy's HP into equal stacked bars for display: `dungeons.json` `boss.hpBars` for the boss, half that (rounded) for a mini-boss, one for a normal enemy (`src/game/floors.ts`). `barMoment` tells the stage when a bar shatters or the enemy dies. Bars are display only; the rules have no break mechanic.

### Enemy attacks

- The floor attacks every `intervalSeconds` of play time (`dungeons.json` `boss.attack`); the damage is the boss's attack on a boss floor, a share of it on a mini-boss or wave floor (`combat.json` `floors`), times the difficulty's attack scale. `src/game/bossAttacks.ts` numbers the attacks: every `attacksPerCycle`-th is a slam, the rest are light hits (`combat.json` `bossPattern` `lightMultiplier`, `slamMultiplier`).
- Damage is reduced by the `combat.defence` percent (capped in code, `defencePercent`) and by each standing card's `weaken`.
- A direct attack hits one card (`enemyTarget`): among the standing front-row cards (the back row only when none stands) the guard first, else a repeatable seeded pick.
- Boss abilities (`combat.json` `bossAbilities`): each names the floor kinds and difficulties it acts on. Every `every`-th attack (at `offset`, never a slam) becomes the ability's hit instead of a direct one, dealing `multiplier` x a normal attack to each card of its `target`: `front`, `back`, `back-one`, `all` or `lowest` (least health left). `front`, `back` and `back-one` fall to the other row when none of theirs stands. A guard does not redirect it (`abilityTargets`). An ability whose targets include the card under direct attack is skipped.
- Each card has its own health: `cardHealth` (`cardRules.json` `health`, `weapons.<type>.health`), the `combat.health` modifiers applied to the team's sum and shared in proportion, times the skill's `health`. Damage taken is saved in `state.combat.cardDamage`.

### Knockouts and losing

- A card whose health runs out is knocked out (`state.combat.cardsOut`) and stops attacking until the floor is cleared. A cleared floor, a new Challenge and the end of a team knockout bring every card back at full health (`reviveTeam`).
- Last card down while farming: the floor resets, the farmed floor drops by one (never below 1) and the team sits out `combat.json` `knockoutSeconds`.
- Last card down in a Challenge, or its timer out: the Challenge is lost and farming resumes at full health.

### What a kill pays

- `killEnemies` (`combat.ts`) pays each kill; the rolls are in `src/game/drops.ts`. Drop tables: per dungeon in `dungeons.json` `drops`, adjusted by `drops.*` modifiers (`effectiveDrops`), the difficulty (`difficultyDrops`) and the stage's star loot (`stageLoot`).
- The boss rolls the whole table (`rollBossDrop`): every `currencies` entry (`min` to `max`), the `material` (`chance`, `amount`), each `extraMaterials` entry, and the `rare` item by `chance`, guaranteed on the `pityThreshold`-th boss kill in a row without it (`state.pity`). A rare cosmetic joins the wardrobe (see Cosmetics and themes).
- Normal enemies and mini-bosses roll the same table scaled by their share of the boss (`rollEnemyDrops`), without the rare item.
- Currency purses are multiplied by the floor's `purseScale` (`src/game/floors.ts`), so deeper floors pay more.
- `drops.wages` accrue per second fought (`state.combat.wageOwed`) and are paid at the next kill.
- XP: each kill gives account XP (`killXp`, `account.json` `xp.perKill`, `killTierGrowth`) and card XP to the fighting loadout (`cardRules.json` `xp.perKill`, `tierGrowth`), by the enemy's share of a boss; time fought gives card XP too (`xp.perSecond`).
- A mini-boss or last-floor boss kill also counts on its stage and pays any star-level chest reached (`payStageChests`, `src/game/combat.ts`); see Dungeons, floors and stages.
- The first Challenge win on the Normal last-floor boss marks the dungeon cleared and pays `drops.firstClear` (`markCleared`). First-win scroll lumps and Heirloom Scrolls: see Summon and pulls, Heirlooms and batches.

### Trials and time away

- In a trial nothing hits back; the team's damage is summed per attempt (`fightTrial`). See Challenges and trials.
- Time away is fought too: `simulateOffline` (`src/game/offline.ts`) runs it, capped, through the same `advance`. See Game core.

## Dungeons, floors and stages

A dungeon is a stack of floors the fighting loadout fights by itself. Content files are in `src/data/content/`. The player picks one dungeon (or the trial, or nothing; `setActiveDungeon` in `src/game/combat.ts`), farms a beaten floor for loot and pushes deeper. The fight itself: see Fights.

### Dungeons and unlocking

- Six in `dungeons.json`: Mossy Cellar, Ember Crypt, Frostspire Vault, Stormwrack Cove (id `thunderpeak_aerie`), Sunken Sanctum, Hollow of the Void.
- An enemy's shown `name` matches its picture (`sprite`), the ids stay: Moss Slime, Bramble Beast, Frost Imp, Ice Wisp, Storm Harpy, Drowned Deckhand (id `spark_wisp`), Lantern Moth, Gilded Acolyte, Shade Mote, Rift Maw (2026-11-22). How a picture is drawn: see Where the pictures live.
- The first is open from the start; each other opens when the dungeon in its `unlockedBy` is cleared (`isDungeonUnlocked`).
- A dungeon is cleared the first time its Normal last-floor boss is beaten (`markCleared`). That pays `drops.firstClear` and unlocks the mines whose `unlockedByDungeon` names it (see Production).

### Floors (`src/game/floors.ts`)

- The last of a dungeon's `floors` holds its `boss`, every `combat.json` `floors.miniBossEvery`-th floor its `miniBoss`, the rest a wave of its `enemies` (`floorKind`). A floor always holds the same wave (`floorSpec`).
- A floor's HP and attack are a share of the boss's, shrinking per floor above the last by the dungeon's `floorGrowth`, else `combat.json` `floors.hpGrowth` (`floorScale`).
- Four difficulties (`DIFFICULTIES` in `src/game/state.ts`): Normal, Hard, Nightmare, endless depths, each with its own progress. Hard and Nightmare multiply enemies and pay (`combat.json` `difficulties`). Each opens when the last-floor boss of the one before is beaten (`isDifficultyUnlocked`); the player switches with `setDifficulty`.
- The endless depths have no last floor and no boss; each depth is one growth step stronger. In the endless depths every `miniBossEvery`-th depth holds the mini-boss (never a boss).

### Farming and pushing

- Per dungeon and difficulty the save holds the farmed `floor` and the `best` floor beaten (`floorPosition`).
- Farming: the loadout fights the farmed floor on a loop. Pushing is a Challenge: a timed fight for the floor after the farmed one (`challengeFloor`), at full health. It starts by button (`startFloorChallenge`) or by auto-challenge, a per-dungeon switch, on by default (`setAutoChallenge`). Timers: `combat.json` `challenge.timerSeconds`.
- A win raises the best floor and moves farming to it. A loss (timer out, or every card down) returns to farming; with auto-challenge on, the next Challenge waits `challenge.autoWaitSeconds`.
- A team knocked out while farming drops one floor and sits out `knockoutSeconds`.
- An Ascension keeps best floors, restarts farming at half of each (`ascensionStartFloor`) and turns auto-challenge back on.

### Stage stars (`src/game/stageStars.ts`)

- A stage is a mini-boss or last-floor boss floor on Normal, Hard or Nightmare (`isStageFloor`).
- Kills on a stage are counted for ever; the star level follows from `combat.json` `stageStars.kills`. Levels: Wood, Bronze, Silver, Gold, Prismatic, Mythic (`STAGE_STAR_NAMES`).
- Each level pays a one-time chest (`stageStars.chests`), adds damage and loot on that stage (`damagePerLevel`, `lootPerLevel`) and counts towards skill points (see Skill web).
- From level `stageStars.overflowFromLevel` a stage has an overflow switch (`setOverflow`): when on, damage left over from a kill carries into the next enemy. Other floors follow a stage's switch (`overflowStage`).

### Pay

- `dungeons.json` `drops`: `currencies` (Money range, every kill), `material` and `extraMaterials` (by chance), `rare` (last-floor boss only, `chance` with `pityThreshold`), `wages` (per second fought, paid at the next kill), `firstClear`.
- Other enemies roll the boss's table scaled by their share of its HP, without the rare item (`src/game/drops.ts`; `killEnemies` in `combat.ts`). Purses grow with depth (`floors.purseFloorBonus`).
- Also: scrolls for each floor's first win (`scrolls.json` `floorFirstWin`), Heirloom Scrolls (see Heirlooms and batches), account and card XP per kill.

`src/game/stages.ts` is not about dungeons: it is tree and mine tile growth.

## Expeditions

A card that is neither fighting nor working can go on a timed trip for materials, gems and card XP. Rules: `src/game/expeditions.ts`; data: `expeditions.json`; panel: `createExpeditionsPanel` in `src/renderer/src/pages/tablePanels.ts`.

- Three `places`, each with a `dungeon` and an `element`; a place opens once that dungeon is cleared.
- Sending (`startTrip`, `tripProblem`): the card is owned, not away, not in the fighting loadout, not working a tree, mine or the forge; the length is one of `durationsHours`; a slot is free. Slots: one, plus the Starlight shop item granting `expedition_slot`, plus `expedition.slots` modifiers (`expeditionSlots`).
- A card that is away cannot be equipped or put to work (`isOnTrip`).
- A trip is a timer that also runs through all time away, beyond the offline cap (`advanceTrips`).
- Rewards (`tripRewards`, paid by `collectTrip` when done), per hour, from the place's `rewards`: `materials`, `gems` (seconds of that gem's tree or mine output), card XP (`cardXpLevels`, a share of the card's next level). All doubled when the card's element matches the place's.
- Recalling early (`recallTrip`) brings back nothing.

## Challenges and trials

A **challenge** is a whole Ascension run played under a handicap for a permanent bonus. A **trial** is a special dungeon: short timed attempts against one target, scored by damage. Neither is the floor Challenge above.

### Ascension challenges (`src/game/challenges.ts`, `challenges.json`)

- Six: Lone Wolf (only the first fighting card counts), Common Folk (only Wood cards count), Untrained (Training gives nothing), Drought and Glass Cannon (`penalties` on production and card health), Single Post (one worker works). Named rules are `restrictions` (`ascensionChallengeSchema`).
- Open after the first Ascension. Starting one (`startChallenge`) is an Ascension (see Ascension); the target's dungeon must be unlocked, and that dungeon tier restarts on floor 1.
- Three `targets` each (a floor of a dungeon difficulty), one per completion. When the run's farmed floor there reaches the target, the completion counts and the rule ends (`settleChallenges`).
- Each completion, three at most, gives its `rewards` entry as permanent modifiers. Leaving (`leaveChallenge`) or ascending ends the rule and earns nothing.
- Rules act through `src/game/modifiers.ts`, `duel.ts` (`challengeExcludedCards`) and `workers.ts` (`challengeWorkerLimit`). Panel: `src/renderer/src/pages/challengesPanel.ts`. Tests: `tests/challenges.test.ts`.

### The trial (`trials.json`; `fightTrial` in `combat.ts`)

- One, The Glimmer Trial, opened by its `unlockedBy` dungeon and picked like a dungeon.
- Attempts of `durationSeconds` repeat while it is active. The team hits a target with fixed `hp` that does not hit back. Score: damage dealt over that HP, which can pass 1 (`trialScore`).
- Each attempt pays every `tiers` entry whose `score` was reached (`trialRewards`); a score of 1 clears the trial. Clearing the trial adds it to `clearedDungeons`, which opens any dungeon or trial whose `unlockedBy` names it.
- The best score earns medal tiers with bonuses from `progression.json` `trialMastery` (`src/game/mastery.ts`).

## Account level and reward track

The save has one account level. Playing fills its XP bar; each level pays skill points and sometimes a reward. Logic: `src/game/account.ts`; numbers: `src/data/content/account.json` (`accountFileSchema` in `src/data/schemas.ts`).

### XP and levels

- XP comes from gems harvested by logging and mining (`harvestXp`, granted in `src/game/tick.ts`), enemy kills (`killXp`, grows with the dungeon tier; a normal enemy is worth its share of a boss kill) and Glimmer Trial attempts (both `src/game/combat.ts`), pulls (`src/game/portals.ts`, `src/game/heirlooms.ts`) and an Ascension (`src/game/prestige.ts`). Rates: `account.json` `xp`. Every grant passes through `grantAccountXp` and the `xp.account` stat.
- A save starts at level 1. The next level costs `xpBase` × `xpGrowth` ^ (level − 1) (`account.json` `levels`, `xpToNextAccountLevel`). There is no level cap.
- `settleAccount` applies level-ups on the tick's one-second grid and pays the track rewards. `accountInfo` feeds the shell's level badge.

### What a level gives

- **Skill points.** Never saved, always worked out (`skillPoints`): levels above 1 × `skillPointsPerLevel`, plus stage star levels × `pointsPerStageStar`, plus unlocked achievements × `pointsPerAchievement`. Spent points are the weapon circles' ranks plus the skill web's levels (`skillPointsSpent`).
- **Reward track.** `rewardTrack` lists levels that give resources, cosmetics or a cost cap rise; past the last listed level, every `rewardRepeat.every` levels gives `rewardRepeat.resources` (`trackReward`). `rewardTrack()` builds the rows the shell shows.
- **Loadout cost cap.** The cap grows with the account level (`cardRules.json` `costCap`) plus the track's `costCap` rises; the fighting loadout's cap stops at `loadoutCostCapTop` (`loadoutCostCap` in `src/game/cards.ts`; see Cards).

### What else `account.ts` owns

- **Weapon circles.** One circle per item type (`account.json` `circles`). Its steps (`circleSteps`) open from the tier and stars of owned cards of that type (`weaponCircles`), with nothing saved. Circle skills are bought with skill points (`buySkill`; cost and rank limit in `skillKinds`) and act only where a card of that type is at work (`circleScopesOf`).
- **Generated branch tree.** `generateTree` in `schemas.ts` also builds eleven branches from `skeleton` and `branches` into `content.account.tree`. The Skills page shows and buys only web nodes and circle skills (`src/renderer/src/pages/skills.ts`), though `buySkill` and `accountModifiers` still accept branch nodes.
- **Respec.** `respecSkills` clears every circle rank and web level: free `respec.freePerAscension` times per run, then `respec.cost` Starlight.
- **Loading.** `fitSkillsToPoints` and `fitWebToPoints` (called from `src/game/save.ts`) drop ranks and levels that are closed or exceed the points earned.
- **Card enhancements** (`chooseEnhancement`); see Cards.
- `accountModifiers` feeds `collectModifiers` (see Game core).

## Skill web

The skill web is where skill points are spent: nodes on the Skills page, bought level by level. Helpers: `src/game/web.ts`; buying: `buyWebNode` in `src/game/account.ts`; nodes: `src/data/content/web.json` (`webNodeSchema`); layout: `src/renderer/src/pages/webModel.ts` (see Screens).

- **Arms.** Four, fixed in the schema (`WEB_ARMS`): logging, mining, dungeon, cards. Each has exactly one first node (`parent` null); every other node hangs off a parent in the same arm, one step `forward`, `left` or `right` (`checkWeb` in `src/data/index.ts`).
- **Levels.** A node has `maxLevel` levels. Each adds its `perLevel` modifiers: percent and flat ones are multiplied by the level, other kinds apply as written (`webNodeModifiers`).
- **Keystones.** Nodes marked `keystone: true`; in `web.json` each has one level.
- **Opening.** A node can be bought when its parent has a level and the Ascension count has reached its `gate`, if it has one (`webNodeOpen`).
- Levels are saved in `state.account.web` and kept through an Ascension.

### What a level costs

- **Skill points only.** The next level costs `cost.base` × `cost.growth` ^ (levels held), rounded (`webNextCost`). `buyWebNode` checks that the free skill points cover it and adds the level; it takes nothing from `state.resources`. The cost is counted by `webSpentPoints` inside `skillPointsSpent`.
- The schema lets `cost.resource` be a resource id instead of `skill_points`, and `checkWeb` validates one, but every node in `web.json` says `skill_points` and no game code reads `cost.resource`. No node level is paid in materials.

### Related files

- A node's `absorbs` is read only by the save migration (`src/game/migrations.ts`; see Saves).
- `src/data/content/skills.json` is not part of the web: it holds the duel skills of weapons and cards, read by `src/game/duel.ts` (see Fights).
- The Heirlooms tab of the Skills page is not owned by `web.ts` or `account.ts`; see Heirlooms and batches.

## Goals, quests and achievements

Quests are tasks whose reward is claimed by a click. Achievements pay by themselves on unlock. Goals are computed hints with no reward.

### Quests

- `src/game/quests.ts`, data `quests.json`. A quest has a `group` (dungeons, cards, gathering, account), a `condition`, a `page` to open and a `reward` list of resources.
- A condition is any achievement condition or a quest-only kind in `measureQuest` (stage kills, floor reached, cards owned, grade owned, card level, account level, training levels).
- `settleQuests` marks a quest done once its condition holds (on the tick's one-second grid, after offline progress, after a claim). Done is saved in `state.quests`, so it stays done when an Ascension resets what the condition read.
- The reward is paid once, only by `claimQuest` or `claimAllQuests`.
- The shell's Goals button opens the quests (`questPopup`, `questsByGroup`, wired in `src/renderer/src/app.ts`).

### Achievements

- `src/game/achievements.ts`, data `achievements.json` `achievements`. Each has a `condition` (kinds in `measure`) and a `reward` of cosmetics and resources.
- `settleAchievements` unlocks every achievement whose condition is met and pays it at once, with no click (tick grid and offline progress; `checkAchievements` after player actions). Unlocks are saved in `state.achievements`, and each one counts towards skill points.
- The file also owns the shard shop (`achievements.json` `shardShop`, `buyShardItem`): card shards buy a card copy, a resource bundle or a cosmetic, with optional stock.

### Goals

- `src/game/goals.ts`, rules in `progression.json` `goals`: each names a kind coded in `RULES`, the page to open and an optional `minProgress`.
- A goal is not saved and pays nothing. It has a title, a progress value and an estimated time from current income (`incomePerSecond`); `allGoals` sorts by that time.
- The quest popup shows the nearest goal as a hint (`nextGoals`, `app.ts`).

## Ascension

The player gives up the current run for Starlight, which buys permanent bonuses. Logic: `src/game/prestige.ts`; numbers: `prestige.json`; tests: `tests/ascensionKeeps.test.ts`, `tests/ascensionModel.test.ts`.

- **When.** The Starlight on offer is worked out from the production gems harvested this run, weighted by gem tier (`runPoints`, `starlightGain`, `prestige.json` `gain`, the `prestige.gain` stat). The player can ascend once it reaches `gain.minimum` (`ascensionPreview`). `ascend` is called from the Shop page (`src/renderer/src/pages/shop.ts`) and when a challenge run starts (`src/game/challenges.ts`).
- **Resets.** Tree and mine levels, tool lines, depth and harvest gauges (`resetProduction` in `src/game/production.ts`); every resource to its starting amount except kinds `prestige` and `scroll` and those marked `keptOnAscend` in `resources.json`; training levels, the current fight, harvest bursts and an unfinished challenge run. Each dungeon tier keeps its best floor and restarts from half of it with auto-challenge on (`ascensionStartFloor` in `src/game/floors.ts`).
- **Kept.** Everything `ascend` does not touch, including cards, cosmetics, unlocked trees, workers, the forge, mastery, portal counters, account level, circle ranks, web levels, quests, achievements and Starlight shop levels. Milestone picks and lifetime Money are kept by `keepUpgrades`. The gate shows the lists `ASCENSION_RESETS` and `ASCENSION_PERSISTS`.
- **Gained.** Starlight; one more on the Ascension count (`state.prestigeCount`), which opens skill web gates, worker slots (see Production) and challenges (see Challenges and trials); the cosmetics listed for that Ascension in `prestige.json` `rewards`; Heirloom Scrolls from the Ascension set in `heirlooms.json` `scrolls`; account XP; and the free respec again.
- **Starlight shop.** `prestige.json` `shop`: each item level costs `cost.base` × `cost.growth` ^ level in Starlight (`starlightPrice`, `buyStarlightItem`) and is kept for good in `state.prestige.shop`. An item gives `perLevel` modifiers (`prestigeModifiers`) or switches on a feature through `grants` (second worker slots, tree and mine autobuyers, an expedition slot). The second worker slots item stays locked until the Ascensions have opened every first slot (`starlightItemLocked`).

## Cosmetics and themes

Cosmetics are items the player collects and wears to change how cards, the table, the cursor and parts of the interface look. Card skins swap a card's weapon picture. Owning cosmetics and wearing whole sets also changes game numbers.

### Kinds of cosmetic

- Ten slots, fixed in `src/data/schemas.ts` `COSMETIC_SLOTS`: `border`, `finish`, `tick`, `number`, `table`, `cursor` and four UI-skin slots: `starlight` (the Starlight coin), `sticker` (achievement stickers), `nodes` (skill nodes), `wardrobe` (the Wardrobe's own look).
- `border` and `finish` are card slots (`CARD_SLOTS`): chosen globally or per card. The rest are global only.
- Items are in `src/data/content/cosmetics.json` (`cosmeticSchema`). `finish`, `tick` and `number` hold no items there, so they show nothing.
- A slot with items has exactly one `starter` (`checkCosmetics` in `src/data/index.ts`); an empty slot shows it. A new game owns every starter and every `ownedAtStart` item (`createInitialState` in `src/game/state.ts`).
- Each cosmetic has one of the seven `RARITIES`.
- `rarities.json` holds one colour style per rarity. `resolveCard` gives it to every card as `--bi-rarity-*` variables, picked by the card's grade (`cardStyle`): it is the card body colour, not a cosmetic.

### How they are obtained

`cosmeticSource` in `src/game/wardrobe.ts` names an item's source; `grantCosmetic` adds it (first copy: owned at level 1; later copies are kept for upgrades).

- Starter or owned at start.
- A dungeon's rare drop (`dungeons.json` `drops.rare.itemId`).
- Ascension rewards (`prestige.json` `rewards`).
- Achievement rewards and the shard shop (`achievements.json`).
- The account reward track (`account.json` `rewardTrack`).
- The portal of kind `cosmetics` (Wardrobe Gate, `portals.json`); see Summon and pulls.

Cosmetics are kept through an ascension (`ASCENSION_PERSISTS` in `src/game/prestige.ts`).

### Upgrade levels

- Highest level (`cosmeticMaxLevel` in `src/game/theme.ts`): `cosmeticRules.json` `slotMaxLevel` for the slot, otherwise `maxLevel` by rarity. A starter has only its own levels.
- `ladders` names what each level adds. The next level costs `copiesPerLevel` duplicates plus the step's `materials` amount times `rarityCost` (`upgradeCosmetic` in `wardrobe.ts`). Worn copies follow the new level.

### Wearing and wear rules

- The loadout is `state.cosmetics.loadout`: `slots` (global) and `cards` (per card, card slots only). `equipCosmetic` and `unequipCosmetic` are in `wardrobe.ts`; the checks are `equipProblem` in `theme.ts`.
- An item with `exclusiveCard` can be equipped on that card only, never globally.
- `resolveCard` decides what a card shows: its own choice, else the global one. The item shows only if the card's rank (tier and stars) meets `wearRequirement`, read from `wearRules.json` (`border`, `finish`, `exclusive`); otherwise the card shows the starter.
- A worn non-starter border hides the card's base frame (`data-border-worn`, set in `src/renderer/src/theme/apply.ts`, rule in `theme/base.css`).

### Card skins and legacy skins

- A skin is a weapon picture a card wears instead of its own ("Original"), chosen per card in `state.cardSkins`. It is not a cosmetic slot. Logic: `src/game/cardSkins.ts`.
- Card skin (`card:<cardId>`): the own weapon picture of another card of the same item type that has `heirloomArt` or `batch` (`givesSkin`); wearable once that card is owned.
- Legacy skin: an entry of `weaponSkins.json` (per item type, with `art` and `rarity`), owned in `state.legacySkins` after it is pulled from the portal of kind `skins` (Legacy Gate). A duplicate pays back `duplicatePayback` of one pull (`grantLegacySkin` in `src/game/portals.ts`).
- Heirloom cards wear no skin and their picture is never a skin.
- `setCardSkin` sets or clears the choice; `resolveCardSkin` gives the skin shown.
- `cardItemArt` in `src/renderer/src/pages/loadoutCards.ts` picks the picture: the legacy skin's art, or the source card's top-tier picture, else the card's own. The picker is `pages/cardSkinsModel.ts` and `pages/weaponSkinsTab.ts`.

### How a look is applied in the page

- Each level of an item holds `tokens` (limited per slot by `SLOT_TOKENS`), `recipes` and an optional `effect`. `slotVisual` fills missing tokens from the slot's starter.
- Tokens become CSS variables `--bi-<key>` (`cssVars`); recipes become classes `r-<id>`.
- `applyGlobalTheme` in `theme/apply.ts` puts the global slots on `<html>` (called from `src/renderer/src/app.ts`). `applyCardTheme` puts a card's variables and classes on its element and marks `data-lv-<slot>` and `data-max-<slot>`.
- `theme/registry.ts` lists every recipe and effect the page implements, with the generated ids of `art/cosmeticIds.ts`. `assertVisualsImplemented` stops the game at start if the data names a missing one.
- CSS: `theme/base.css` (card and table from tokens), `recipes.css` (recipe classes), `frames.css` (panel and button frames from table tokens), `effects.css` with `effects.ts` (floating numbers).
- The table item also themes the shell (see Shell and table). The `shell-oak` recipe is drawn by `theme/shellOak.css`. `shell-stone` is drawn by `theme/shellPictures.css` from `shellArt.json` (`applyShellArt` sets `--sh-<piece>-*`); no item in `cosmetics.json` uses it.
- UI-skin recipes set `--bi-skin-<slot>` to a style letter; `skinStyle` in `ui/skins.ts` reads it (`ui/skillArt.ts` reads the `nodes` recipe from the loadout instead) and pages draw that style with `art/cosmetics.ts`.

### Effect on game numbers

- Every owned cosmetic adds its `ownedModifiers` (percent bonuses to combat damage, production rate or card XP in the current data), worn or not and at any upgrade level; items with an empty list add nothing (`collectModifiers` in `src/game/modifiers.ts`).
- A set is complete when every item of the set is equipped in its own global slot (`loadout.slots`; per-card choices and card rank do not count; `detectSets` in `theme.ts`). A complete set adds its `sets.json` `modifiers` through `collectModifiers`; the starter set `gilded_nocturne` has none. `detectSets` also drives the full-set achievement check in `src/game/achievements.ts`.
- Upgrade levels, card skins and legacy skins change no number.

### Credits

`credits.json` lists the asset packs used, with licence and whether credit is required; Settings shows it (`src/renderer/src/pages/settings.ts`).

Tests: `tests/cosmeticContent.test.ts`, `wardrobe*.test.ts`, `cardSkins*.test.ts`, `legacySkins.test.ts`.

## Saves

The game keeps one save, writes it by itself and reads it back at start, upgrading saves written by earlier versions. The player can also export the save as a text string and import one.

### What a save is

- Plain JSON text with three fields: `version` (the save format number), `savedAt` (epoch milliseconds, used for offline progress, see Game core) and `state` (`src/game/save.ts` `createSaveText`). No compression, encryption or checksum.
- The current save format is **40** (`src/game/save.ts` `CURRENT_SAVE_VERSION`).
- `state` is the whole game state with big numbers as strings (`serializeState`; shape in `serializedStateSchema`). A card's tier is not saved; it is read from the card's data on load.

### Where and when it is written

- Desktop: a `saves` folder in the app's user data folder (`src/main/saves.ts`). `src/main/saveStore.ts` writes `save.json` through a temp file and a rename. The save already there is first copied to `save.bak.json` if it is valid JSON, or to `save.corrupt.json` if not, so a damaged file never replaces a good backup. A failed write on desktop is logged to `logs/saves.log` in the user data folder (`src/main/saves.ts`).
- Web build: the same three slots as local storage keys, same rule (`src/renderer/src/web/webSaveStore.ts`).
- The renderer saves (`src/renderer/src/app.ts` `save`) at the end of start-up, on a timer the player sets in Settings (`src/renderer/src/settings/prefs.ts` `AUTOSAVE_CHOICES`), right after each player action (`applyAndSave`), after an import, and on a flush request. `save` steps the loop to the current time before writing, so the saved state is always current. A failed save shows a toast and the game carries on.
- Save on quit: on desktop the window close is held until the renderer confirms a last save or a timeout passes (`src/main/saves.ts` `saveBeforeClose`). In the web build the flush fires when the page is hidden or closed (`src/renderer/src/web/browserApi.ts`).
- Where the dev cheats are on (`src/main/devMode.ts` `devCheatsEnabled`), a reset from the dev panel saves, then copies the save to `save.before-reset-<timestamp>.json` (`saveStore.ts` `backupBeforeReset`) before writing the fresh game.
- A build run from source has its own user data folder, so its own saves: `BI_USER_DATA_DIR` sets the folder, `BI_PROFILE=<name>` or `--bi-profile=<name>` gives `basic-incremental-dev-<name>` (`BI_PROFILE` wins over the flag; a name with other characters than letters, digits, `_` and `-` is ignored), otherwise `basic-incremental-dev` (`src/main/devPaths.ts`). The packaged local dev build keeps its saves in its own user data folder, `basic-incremental-devbuild` (`src/main/index.ts`), so it never shares the installed game's save.

### Loading

- `loadBestSave` (`src/game/save.ts`) tries the main save, then the backup. A missing file is not an error. Only a `SaveError` makes it fall back to the backup; any other error is thrown on.
- A warning is shown only when a save file existed but could not be read: one text when the backup was loaded instead, another when a new game was started (`src/renderer/src/app.ts`). A missing main save with a good backup loads the backup silently.
- `readSave` in order: parse the JSON, check the envelope, run the migrations, check the result against `serializedStateSchema`, rebuild the state with `deserializeState`.
- Every failure the loader detects is a `SaveError` with a code and a message safe to show the player (`src/game/saveError.ts`). A save from a newer format than this build knows is refused with `future-version` (`src/game/migrations.ts` `migrateState`).
- `deserializeState` starts from a new game and copies the saved values over it. Most ids the game does not have are dropped; `pity`, `inventory` and `combat.trialBest` are copied as saved.
- Card, Starlight shop and cosmetic levels, mastery tiers, stage chests, challenge completions and the depth layer are held within their limits; tree, mine, training, tool and account levels are copied as saved.
- Loadouts and dungeon presets keep only owned fighting cards, each once; tree and mine workers and production presets keep only owned cards of that job (a worker only once); the forge worker is an owned production card not working elsewhere; a trip is kept when its card is owned and not on another trip, and its place and length still exist.

### Migrations

- `src/game/migrations.ts` `MIGRATIONS` holds one step per format change, keyed by the format it upgrades from. A step must return a new `state` object without changing its input (the contract on `MigrationStep`). `migrateState` runs the steps in order up to the current format.
- There is a step for every format from 1 upward, so format 1 is the oldest save still loaded.
- Steps work on the raw saved data and use snapshots of old game data (`src/game/migrationTeam.ts` for the 26 to 27 step), with one exception: the 37 to 38 step reads the live `src/data/content/web.json`, so a change to the web's nodes or their `absorbs` changes that migration.
- `arrangeFormation` and `heirloomMigration` in `serializedStateSchema` are set only by migrations and used once while loading; the game never writes them.

### Export and import

- Settings copies the save to the clipboard or downloads it as a file, and imports a pasted string or a file (`src/renderer/src/pages/settings.ts`).
- The string is `BIv1:` plus the save text in base64 (`exportSaveString`). `importSaveString` runs the same checks and migrations as a normal load; the player confirms before it replaces the running game. An imported save starts at the current time: its `savedAt` is ignored, so an import gives no offline progress (`src/renderer/src/app.ts` `save.replace`).

### Tests

- `tests/migrations.test.ts` (runner, steps, a step for every format); `tests/save.test.ts` (round trip, bad saves, backup fallback, export/import, some older formats); `tests/saveV*.test.ts` and `tests/migrateV39.test.ts` (one step each); `tests/summonChances.test.ts` covers the step to format 40: the Card Portal's pity counter is reset to 0 (it now counts toward a T6), `summon.firstTenPullDone` is true for a save with 10 or more Card Portal pulls, `summon.tierRewardsClaimed` starts empty, and tiers the save had already completed are paid when it loads.
- `tests/saveStore.test.ts` (desktop store), `tests/saveBackup.test.ts` (dev reset backup), `tests/webSaveStore.test.ts` (web store, browser API), `tests/devPaths.test.ts` (folders of a build run from source). Old-format saves: `tests/fixtures/saves/` and its `README.md`.

### Changing the save format

1. Change `serializedStateSchema`, `serializeState` and `deserializeState` in `src/game/save.ts`.
2. Raise `CURRENT_SAVE_VERSION` by one.
3. Add a step to `MIGRATIONS` keyed by the previous format number; without it older saves fail with `missing-migration` and `tests/migrations.test.ts` fails.
4. Add a test that loads a save of the previous format; a real one goes in `tests/fixtures/saves/` with a line in its `README.md`.

## Shell and table

The game is one screen: a header and, under it, "the table": the fight in the middle, Logging left, Mining right, a row of piles along the bottom. Short paths in this section are under `src/renderer/src/`.

### Start-up order

- `index.html` has an empty `#app` and loads `src/renderer/src/main.ts`.
- `src/renderer/src/main.ts` loads the fonts, runs `installLogCapture` (`settings/logBuffer.ts`), `installBrowserApi` (see Web build), `installMotionPref` (`settings/motion.ts`) and `installPixelScale` (`ui/pixelFit.ts`), then, in a game build, dynamically imports `src/renderer/src/game-entry.ts` and calls `init()`.
- `game-entry.ts` `init` reads the version from `window.api`, calls `startGame` in `src/renderer/src/app.ts`, then adds the update notice.
- `app.ts` `startGame`, in order: `loadContent()`, `assertVisualsImplemented` and `configureCardLevels` (an error box on failure); `window.api.readSave()` and `loadBestSave` (see Saves); `simulateOffline` when a save was found; one `GameLoop`; the theme (see Cosmetics and themes); header, reward track, table, stage director, sound; the welcome-back screen (`stage/welcome.ts`) when a save was loaded; quest list, views (`table.build`), Details panel; the 100 ms timer and autosave; the first `rendered()`, `table.enter()` (entrance animation) and a first save.
- If the save had errors, `startGame` shows a warning notice (`COPY.load.usedBackup` / `startedFresh`); in dev builds with cheats enabled it then loads `dev/devPanel` (see Sim and dev tools).
- The shell is attached to `#app` after `table.build` and the Details panel; `director.start()` runs after the 100 ms timer is set.

### Game logic and the desktop bridge

- The renderer imports game code only from `src/game/index.ts` and `src/data/index.ts`; `eslint.config.mjs` enforces it (`no-restricted-imports`, `game/dev` exempt). The other rule in `src/renderer/CLAUDE.md` (no game rules in the renderer) has no lint check.
- Views read state with `TableContext.state()` and change it by passing a pure game function's result to `TableContext.apply` (`applyAndSave` in `app.ts`): it checks achievements, redraws and saves at once.
- `window.api` (`AppApi` in `src/preload/api.ts`, see Desktop app (Electron)) is the bridge: `app.ts` reads and writes the save through it, answers the save request before the window closes, and asks whether dev cheats are on (see Sim and dev tools).

### Redrawing

- Every 100 ms the timer calls `step()` then `rendered()`. `step()` advances the loop and passes its report to notices, celebrations and the stage director (see Stage effects).
- `rendered()` updates the header, the Details panel (only while open), the quest list (at most once a second) and `table.render()`, which redraws the open view, or the table pieces when none is open. `table.render()` also refreshes the pile hint lines at most once a second.
- Header amounts roll between ticks on animation frames (`shell/shell.ts`); Money shows its value at once.

### The table and its views (`src/renderer/src/table/`)

- `contract.ts`: a view is a `ViewDef` (id, title, optional dock `pile`, `mount(host, ctx, api)` called once at start) returning a `ViewHandle` (`render()`, optional `opened` / `closed`). A `TablePieceDef` is a live table piece (`centre`, `left`, `right`) that opens a view. `TableContext` is what `app.ts` hands every view.
- `viewIds.ts` lists the twelve ids; `registry.ts` collects the four view packages and fixes the dock order (`DOCK`).

| Id                                           | Opened from            | Defined in                  | Drawn by                                                       |
| -------------------------------------------- | ---------------------- | --------------------------- | -------------------------------------------------------------- |
| `dungeon`                                    | centre piece           | `views/dungeon/index.ts`    | `stage/arena.ts`, `pages/dungeons.ts`                          |
| `logging`, `mining`                          | side wings (`wing.ts`) | `views/gathering/index.ts`  | `views/gathering/job.ts`                                       |
| `forge`                                      | pile                   | `views/gathering/index.ts`  | `views/gathering/forge.ts`                                     |
| `cards`, `summon`, `wardrobe`                | piles                  | `views/collection/index.ts` | `pages/cards.ts`, `summon.ts`, `wardrobe.ts`                   |
| `skills`, `achievements`, `shop`, `settings` | piles                  | `views/meta/index.ts`       | `pages/skills.ts`, `achievements.ts`, `shop.ts`, `settings.ts` |
| `upgrades`                                   | pile                   | `views/meta/index.ts`       | `views/meta/upgradesView.ts`                                   |

- `table.ts` `createTable` builds the pieces, the dock and the view host. A click on a piece (outside its own controls), its corner button or a pile opens the view.
- `viewHost.ts` mounts every view once in its own frame and keeps it mounted while closed. One view is open at a time. It closes with the back button, Esc, Alt + Left or the mouse back button; Esc is ignored while a layer in `ESC_FIRST` is on screen (a modal dialog, the reward track, the goal list, a lifted card, the workbench `.wb`, the evolution scene `.st-evo`); in the dungeon view Esc first closes an open panel.
- Code navigates with `TableContext.open` / `close` / `current`; goals and quests map to views in `goalView` (`app.ts`).
- `motion.ts` (transform and opacity only): `dealIn` deals items in one by one from the opener, `dealOut` sends a closing view back. Timings are CSS variables in `motion.css`; the stagger is `stagger.ts`. Under reduced motion `dealIn` and `dealOut` do nothing.
- `views/`, `ui/`: see Views and shared widgets. `pages/`: see Screens.

### Header and panels (`src/renderer/src/shell/`)

- `shell.ts` `createShell`: the header (name and version, account level button, Goals button, a chip per header resource, Details button, mute), the table area, the notices layer and the reward track panel.
- `quest.ts`: the content of the list under the Goals button (rows, claim, see all); `shell.ts` opens and closes it: a click outside, Esc or a picked goal closes it (see Goals, quests and achievements).
- `rewardTrack.ts`: opens from the account level button; Esc, Close or a click outside closes it (see Account level and reward track).
- `details.ts`: the Details dialog, a modal list of resources by group (rows from `pages/detailsModel.ts`); Esc, Close or the backdrop closes it.
- `tooltip.ts`: one shared tooltip (`attachTooltip`), shown on hover or keyboard focus. `stats.ts` `statTip`: a stat's base, modifiers and total. `modifierText.ts` words modifiers.

### Text (`src/renderer/src/copy.ts`)

- `COPY`: the on-screen text in one object, grouped by screen or feature, as strings or small functions. Each view package adds `views/<package>/copy.ts`.

### Settings (`src/renderer/src/settings/`)

- `prefs.ts`: reduced motion and the autosave interval, in `localStorage` key `bi.ui`, not in the save. Set in the Settings view (`pages/settings.ts`).
- `motion.ts` applies it: `data-motion` on `<html>`, a wrapped `window.matchMedia`, and every `prefers-reduced-motion` CSS rule switched on or off (`motionRules.ts`).
- `cost.ts` (pure): `costText`, `hasCostArt`, `costLabel`. A price is shown once: a resource with a picture (Money coins, gems, scrolls, Starlight) as its picture and the number, its name only in the tooltip and accessible label; one with no picture yet (Cores, Sigils, Dust, Shards) as the number and its name in words.
- `numberFormat.ts` `fmt` is the one number format. `coins.ts` shows Money as a count of the biggest coin it fills, coins from `coins.json`.
- `logBuffer.ts`, `logRing.ts`: recent console lines and uncaught errors. `issueReport.ts` builds the pre-filled GitHub issue link the Settings view opens.

### Sound (`src/renderer/src/sound/`)

- `registry.ts` `SOUNDS`: each sound is data (tone and noise layers, a play-rate limit) synthesised with Web Audio; there are no audio files.
- `engine.ts`: `initSound` unlocks audio on the first click or key press; `playSound(id)` plays unless muted or rate-limited. Views get it as `TableContext.sound`; `app.ts` plays `click` on every button without class `buy-btn`.
- `settings.ts`: master and effects volume, mute, mute while unfocused, in `localStorage` key `bi.sound`. `controls.ts`: the header mute button and the Settings view's Sound panel.

### Gallery (`src/renderer/src/gallery/`)

- `gallery.ts` `renderGallery` is a developer page of cards with a cosmetics picker, in dev builds only: Ctrl+Shift+G toggles `#gallery` and reloads, and `main.ts` then loads it instead of the game.

## Views and shared widgets

A view is one full screen the player opens from the table (see Shell and table). The four folders under `src/renderer/src/views/` each export a `ViewPackage` (`table/contract.ts`): `views` (id, title, optional dock `pile`, and `mount`, called once) and optional `pieces` (live parts of the table), listed in `table/registry.ts` `PACKAGES`. Each folder keeps its text in `copy.ts`; `*Model.ts` files are DOM-free display logic, unit tested in `tests/`. Shared widgets live in `src/renderer/src/ui/`.

### `views/dungeon`

- `index.ts`: the table's centre piece and the `dungeon` view share one duel element (`stage/arena.ts`, see Fights), moved between them on open and close.
- The view's title bar holds three buttons, Dungeons, Weapon and Training. Each opens its panel (built by `pages/dungeons.ts` `createDungeonPanels`, see Screens) as a sheet over the running fight; the same button, the back button or Esc closes it.
- `duelModel.ts`: hand layout, slot colours, enemy pips, feed lines, stat sheet rows, skill plate queue; read by `stage/arena.ts`.

### `views/gathering`

- `index.ts`: the Logging (left) and Mining (right) wings, the `logging`, `mining` and `forge` views (Forge is a dock pile).
- `wing.ts`: read-only table piece: the job's output per second, a plate per tree kind or mine type (rate, level, price, its worker and its layer) and how many tool lines are affordable.
- `job.ts` (`createJobView`, both jobs): a plate per tree or mine with a buy button (`ui/buy.ts`, held to repeat) and its next milestone line, an unlock button on a locked tree, and a worker block that opens the worker picker (`workerPick.ts`) to place or remove a worker (`assignWorker`). The level-up and unlock buttons show their price once (`ui/costMarkup.ts`); a locked tree's note says to pay the cost on the button. Side column: the job's waiting milestone pick (`ui/perkPick.ts`), its tool lines (`ui/toolLines.ts`), worker presets (`pages/tablePanels.ts`) and buttons that open Forge and Shop. The ×1/×10/×100/Max toggle sits in the title bar. See Production.
- `forge.ts`: recipe buttons (a click starts or stops a recipe, `setForgeRecipe`), the recipe being forged with progress and its worker (`assignForgeWorker`, picked with `workerPick.ts`), and the tool lines of both jobs.
- `workerPick.ts`: the worker picker of Logging, Mining and the Forge. Each tool is drawn as the Cards collection's card face (`cardFaceProps`, `createCard`) at a whole scale (`watchFit`), in the same list as the Cards slot picker; under each card its multiplier, effect and place ("Works here", "Works at <place> (moves here)", or greyed "No free slot"). The current tool has the gold outline; the list scrolls.
- `jobModel.ts`: display helpers (wording and small derived numbers such as `forgeFlow`, `toolsReady`, `strikeSeconds`) for both.

### `views/collection`

- `index.ts`: the `cards`, `summon` and `wardrobe` piles; each view mounts its page (`pages/cards.ts`, `pages/summon.ts`, `pages/wardrobe.ts`, see Screens).
- `teamsModel.ts` `teamRows`: one row per dungeon with a remembered team, plus the dungeon being fought, for the Cards page.

### `views/meta`

- `index.ts`: the `skills`, `achievements`, `shop`, `upgrades` and `settings` piles. All but Upgrades mount a page from `pages/`.
- `upgradesView.ts`: three panels (Logging, Mining, Training) listing every line's milestones. A waiting pick shows two cards and a click picks one (`pickPerk`); a made pick shows its badge; one ahead shows both perks. A foot bar shows lifetime Money. Built by `upgradesModel.ts` `milestoneBoard`.

### The card face (`ui/card.ts`, `ui/cardFace.ts`, `pages/cardFaceModel.ts`)

`createCard(props)` builds every card (see Cosmetics and themes and Art code for its look). On a card:

- **Name**: one name, `cardDisplayName` (the weapon's item name for the card's tier), on the top plate (`.bi-card__head`).
- **Art**: the weapon picture (`item`), or a placeholder emblem when none is given.
- **Frame**: the kit from `art/frame.ts` `cardFrame`: `kit-<tier>` for Wood to Prismatic, the batch's kit for Mythic and Heirloom. An Heirloom with a batch backdrop shows it behind a windowed kit.
- **Bottom banner** (`.bi-card__info`, only when a `face` is given): a line "hits every Ns", a line with the six stars, "Lv level/cap" and the tier word, and an XP bar to the next level (full at the cap). With the tier kit and no border cosmetic worn (`theme/base.css`), the tier word is hidden and the "hits every" line shows only on a big card (`--card-full`, set by `ui/pixelFit.ts`); a small card shows stars, level and the bar.
- **Stars**: six sprites, the first `rank.stars` lit; in the banner when there is one, else on the top plate.
- **Role and job**: not drawn. The job label is only in the card's accessible name; `.bi-card__job` is hidden in CSS.
- **Element**: no icon or text, and no effect on the art while `ELEMENT_FX` is off (see Element effects).
- `cardFaceModel.ts` `cardFaceOf` supplies the banner: hit speed (the fight tick for a fighting card, harvest interval divided by strikes for a worker), level, cap and XP progress.

### The weapon panel (`ui/weaponPanel.ts`, `pages/weaponModel.ts`)

One component in two places: the dungeon view's Weapon panel (`drawer`: the weapon in an XP ring; tabs in `pages/dungeons.ts` switch between the fighting loadout's cards) and the Cards detail (`card`: a level badge on the card plus Tier and Card XP tiles). It shows level, XP, tier, stars, progress to the next star and what that star changes (multiplier, damage or output, health). For a card below 6 stars that is not an Heirloom the player can do exactly two things, both via `CardsModel.upgrade`:

- **Add star**, when the star bar is full (`starUp`).
- **Star with Star Dust**, offered when the bar is not full and at least 1 dust is held; shown disabled when the dust is not enough (`starUpWithDust`).

An Heirloom card and a 6-star card show no button, only the notes. The panel also lists what the next star changes (`starStats`); an Heirloom below 6 stars shows the `allStars` line text because it has no star bar.

There is no tier-up. A note says the weapon's tier is fixed (for an Heirloom: that its stars come from the Heirloom Gate, or that it is fully upgraded), plus a note while the next level is a breakthrough level. Built by `weaponModel.ts` `weaponView`. See Cards.

### Shared widgets (`ui/`)

- `buy.ts`: the ×1/×10/×100/Max toggle in each view head (kept in localStorage `bi.buyCount`, no save change) and the buy button, which always shows its label (Max with its count). `holdToBuy` repeats a buy while the button is held (`HOLD_DELAY_MS` 450, then every `HOLD_REPEAT_MS` 110) until release or nothing more can be paid; a click and the keyboard buy once. Used by the gathering views, `training.ts`, `upgradeRows.ts`; hold on the tool and Training rows and the tree and mine Level up.
- `upgradeRows.ts`: "You hold" strip and a row per upgrade line with its buy button, what buying changes, and the milestone bar and line. Used by `training.ts`, `toolLines.ts`.
- `training.ts`: the Training panel (waiting pick, toggle, rows). Used by `pages/dungeons.ts`.
- `toolLines.ts`: a job's tool-line rows. Used by `job.ts`, `forge.ts`.
- `perkPick.ts`: a waiting milestone pick as two cards. Used by `training.ts`, `job.ts`, `upgradesView.ts`.
- `hpStack.ts`: stacked enemy HP bars with "×N" left. Used by `stage/arena.ts`.
- `stars.ts`: stage-star pips and text with "★" drawn as sprites. Used by Cards, `pages/dungeons.ts`, arena, `weaponPanel.ts`.
- `pixelScale.ts` (maths), `pixelFit.ts` (DOM): keep pixel art at whole device pixels; `fitCard` sizes card hosts; `watchFit` keeps a list of cards at a whole scale as it resizes (Cards page, worker picker). Used wherever cards show.
- `pixelNumbers.ts`: draws `.bi-num` numbers in the equipped Number cosmetic's pixel font (`art/pixelFont.ts`). Installed by `app.ts`.
- `resourceIcons.ts`: a resource's icon. Used by `app.ts`, Details, Summon, arena, `resourceArt.ts`, `forge.ts`.
- `resourceArt.ts`: a resource's picture for prices. Used by `upgradeRows.ts`, `job.ts`.
- `costMarkup.ts`: one or more prices drawn side by side by the rule in `settings/cost.ts`. Used by the upgrade rows (Training, tool lines), the Logging and Mining level-up and unlock buttons (`buy.ts`, `pages/buyModel.ts`), the wing plates' prices (`wing.ts`) and the paid respec button (`pages/skills.ts`). The header, "You hold" strips, Summon pull buttons and shop price chips already drew picture and number.
- `skillArt.ts`: skill node gems and the star chart in the equipped nodes style. Used by `pages/skills.ts`, `pages/cards.ts`.
- `webGlyphs.ts`: placeholder icons for skill web nodes. Used by `pages/skills.ts`, `pages/heirloomsMap.ts`.
- `skins.ts`: the worn UI-skin style; Starlight coin and shard icons. Used by `app.ts`, Achievements, Shop, Wardrobe.
- `cosmeticSwatch.ts`: a small sample of one cosmetic. Used by Wardrobe, Summon, `shell/rewardTrack.ts`.
- `keepScroll.ts`: keeps scroll and focus across a rebuild. Used by Cards and Wardrobe.

## Screens

`src/renderer/src/pages/` holds the screens and panels that the views mount. A screen is usually a drawing file `<name>.ts`, its styles `<name>.css` and one or more `<name>Model.ts` files with the display logic that tests cover (`tests/<name>Model.test.ts`). Not every screen has all three, and some files are shared helpers. The models hold display logic only (`slotChoices` mirrors the loadout cap and Heirloom limit to tag a picker; the game enforces them).

### Cards (`cards.ts`)

- Mounted by the `cards` view (`views/collection/index.ts`). It reads the game only through `CardsModel` (`cardsModel.ts`, filled by `cardsAdapter.ts`).
- Five tabs: Collection, Heirlooms, Loadouts, Bonds, Expeditions. The last two mount `createBondsPanel` and `createExpeditionsPanel` (`tablePanels.ts`).
- **Collection.** Filter chips by job, by role (Tank, DPS, Support) and "Ready n" (a star can be taken). Sort: Tier, Stars, Level, Name. The grid lists every card that is not an Heirloom: "Your cards (n)" first, then the cards not found, grouped by weapon type with a collected count.
- **Detail panel.** Heading: the name, then "tier · job" (plus the slot name when the card is in the loadout). An owned card shows the weapon panel (`ui/weaponPanel.ts`, see Views and shared widgets), the skin picker (`cardSkinsModel.ts`, `setCardSkin`), stat tiles (`statsModel.ts`) and fact tiles. Buttons on an owned card: Enhancements (when the card has a chart: `cardEnhancements`, `chooseEnhancement`, `resetEnhancements`), Add to loadout (fighting cards not in the loadout) or Remove from loadout (cards in it) (`setLoadoutSlot`); Logging and Mining cards show a hint that they work from the Production page. See Cards.
- **Heirlooms.** The Heirloom cards by weapon type with their shard bars (`heirloomEntry`); a type's group wraps when it holds three or four cards. The detail shows the card with its tree's six nodes (`heirloomTreeInfo`): a click buys an affordable node (`buyHeirloomNode`), Respec clears the tree (`respecHeirloomTree`). See Heirlooms and batches.
- **Loadouts.** The fighting loadout only: a cost meter against the cap (`loadoutInfo`) and four slots named Back left, Front left, Front right, Back right. A click on a slot opens a picker of the owned fighting cards with cost and a tag (in this slot, swap, over the cap, Heirloom limit; `slotChoices` in `cardsModel.ts`); picking calls `setLoadoutSlot`. Cards can also be dragged (`pages/loadoutDrag.ts`, pointer events, wired in `cards.ts`, its CSS at the end of `cards.css`): slot to slot moves or swaps, picker to slot places, out of the frame empties the slot, Esc cancels; the drag only asks the page model to place or remove, and the game's `setLoadoutSlot` does the move or swap in one `setLoadout` call, so a refused drop shows the game's own reason in the status line (`.cp-status`). Tested in `tests/cards.test.ts`. Below: the team each dungeon remembers (`teamRows`, `views/collection/teamsModel.ts`).
- **Names and labels.** A card has one name, `cardDisplayName` (see Cards). Tier words come from `TIER_LABELS`, `tierLabel` and `gradeLabel` (`src/game/cards.ts`): Wood, Bronze, Silver, Gold, Prismatic, Mythic or Void, Heirloom. The screen writes no rarity word (Common, Rare, Epic): `rarity` in this code is the card's colour style (`cardStyle`), and the sort keyed `rarity` is labelled "Tier".
- Helpers: `cardFaceModel.ts` (`cardFaceOf`) and `loadoutCards.ts` (`cardItemArt`, `loadoutProps`, `cardFaceProps`: card faces for other screens).

### Summon (`summon.ts`, model `summonModel.ts`)

Mounted by the `summon` view (`views/collection/index.ts`).

- Left column: Daily scrolls with Claim (`dailyAvailable`, `claimDaily`; amounts in `scrolls.json` `daily`), then the gates in a fixed order: the `cards` portals of `portals.json` (Focus Portal after `card_portal`), the `cosmetics` portals (a locked "Wardrobe Gate" if none), the `skins` portals, the Heirloom Gate (`heirlooms.json` `gate`). One gate is open at a time. The Heirloom Gate board has a row per batch (`heirloomRows` in `pages/summonModel.ts`), and a second row "Wildwood II" (key `wildwood#2`) for the batch's second dagger.
- The open gate shows a deck of card backs, on a card portal a level bar "Portal level n" with "pulls / next" ("top level" at the last), a Pity bar "count / threshold", and Pull 1 and Pull 10 with the price (one resource per gate; `portals.json`, `heirlooms.json` `gate.cost`), disabled when it cannot be paid (`portalInfo`, `pull`; `heirloomGateInfo`, `pullHeirloomGate`). The Focus Portal adds a button per item type (`focusKinds`, `setFocusKind`). See Summon and pulls.
- A pull opens the reveal (`stage/reveal.ts`, see Stage effects) and fills "Your last hand": up to ten results.
- **Odds.** "Odds per pull" lists the open gate only: a row per step with its chance, then notes: "Every ×10 holds a <step> or better". Card portals name the steps with tier words; the cosmetic and skin gates use the rarity names of `rarities.json`.
- **Wishlist.** The panel belongs to the card portal that has `wishlistPerTier` above zero (`wishlistView`, `wishlistPanelView`) and shows whenever a card gate (Card Portal or Focus Portal) is open: a row per tier with "marked / limit" and a tile per card in weapon type columns. A click marks or unmarks (`setWishlisted`).
- **First 10-pull.** On a card portal, "Your first ×10 holds a Gold or better" under the pity bar until that 10-pull is made.
- **Tier collection.** On a card portal, a panel with a check box per tier, lowest first (`tierBoxes`, from `tierProgress`): the tier, "done / total" cards at six stars and the reward "+scrolls · +n% damage"; the box is ticked once the reward is paid. Under the odds a note gives the portal level and says a tier leaves the pool only when all its cards are at six stars.
- **Pity.** The Card Portal's line reads "A T6 card within n pulls, rising from the middle" and its bar "A T6 card within n pulls"; other card decks read "<tier> or better within n pulls" (n is the threshold); the Legacy (skins) gate reads "<rarity> or better within n pulls"; the Wardrobe Gate's line reads "Cosmetics · duplicates feed upgrades". The Heirloom Gate reads "A whole Heirloom within n pulls" with the chance of a whole one against shards, and a board of stars and shard bars per art batch and weapon type (`heirloomBoardView`).
- Cards are named with `cardDisplayName`; a card pulled from a card portal is labelled with its tier word; an Heirloom Gate pull is labelled "Mythic" or "Void" (its side), never "Heirloom"; a cosmetic or skin with its rarity name.

### Heirlooms map (`heirloomsMap.ts`, model `heirloomMapModel.ts`)

- The Heirlooms tab of the Skill tree screen (`createHeirloomsTab`, called from `pages/skills.ts`): a map with one cluster per tree in `heirlooms.json` `trees`, the Heirloom's card as hub (a "?" card back until found) and its six perks.
- Names: the hub card shows `cardDisplayName`; its caption shows the tree's name (`heirlooms.json` `trees` `name`) above the card's `cards.json` `name` (`ClusterView.cardName`). For every Heirloom card that `name` equals its weapon name, so the player sees one card name.
- A click selects a perk; the side panel shows free points, effect, cost, what it needs, Learn (also a double click; `buyHeirloomNode`) and Respec (`respecHeirloomTree`).

### Wardrobe (`wardrobe.ts`, model `wardrobeModel.ts`)

- Mounted by the `wardrobe` view (`views/collection/index.ts`).
- Filter chips: All, Worn, Card frames, Effects, Table, Interface, Can upgrade, Weapon skins. One grid of cosmetics (`wardrobeItems`), owned first. Tiles and the detail show the cosmetic's rarity name (`rarities.json`), the only rarity words outside the Summon cosmetic and skin gates.
- A "Mannequin" of slot plates shows what the preview card wears; a click selects that slot (`slotViews`). Card-slot items show a "wearable from <rank>" rule.
- Selected item: level ladder (`cosmeticLadder`), owned buff, set, source, next level's price; Upgrade (`upgradeCosmetic`), Equip or Unequip (`equipCosmetic`, `unequipCosmetic`), for card slots also on the preview card alone; set chips (`setBonuses`).
- Preview card: picked from "Preview on" (owned cards); an item not worn is tried on there only (`tryOnLoadout`).
- Weapon skins chip (`weaponSkinsTab.ts`): weapon type, your cards of it that own a skin, the skins, a preview and Apply (`setCardSkin`).
- `wardrobeSkin.ts` builds the stylesheet of the equipped Wardrobe interface style. See Cosmetics and themes.

### Shop (`shop.ts`)

Mounted by the `shop` view (`views/meta/index.ts`). Three counters; its view data comes from `ascensionModel.ts` and `achievementsModel.ts`.

- **Starlight.** The items of `prestige.json` `shop`: permanent levels paid in Starlight (`prestige.json` `currency`) (`starlightShop`, `buyStarlightItem`), priced by `starlightPrice`; some stay locked until a condition is met (`starlightItemLocked`). Autobuyer switches show once one is owned (`autobuyerOwned`, `setAutomation`).
- **Shards.** The items of `achievements.json` `shardShop`, paid in card shards (`state.cards.shards`): Card copies, Supplies (resource bundles) and Exclusive (cosmetics), some with limited stock (`shardShop`, `buyShardItem`).
- **Ascension.** The Starlight gain, what is still needed, Ascend through ready, confirm, a gate-walking animation and a done screen (`ascensionPreview`, `ascend`, `shop.ts` `Mode`), Kept and Reset lists and the challenges panel (`challengesPanel.ts`). See Ascension; Challenges and trials.

### Skill Tree (`skills.ts`, `skillsModel.ts`, `webModel.ts`, `skills.css`, `skillWeb.css`)

- Mounted by the `skills` view (`views/meta/index.ts`, `createSkillsPage`).
- **Two tabs** over the stage, "Skill Tree" and "Heirlooms" (`COPY.heirloomMap.tabSkills`, `tabHeirlooms`). The Heirlooms tab is `createHeirloomsTab` (`heirloomsMap.ts`); see Heirlooms and batches. Each tab shows how many nodes can be bought now; the arm colour key is shown only on the Skill Tree tab.
- **How the web is drawn.** `webView` (`webModel.ts`) places each node of `web.json` one fixed step from its parent (or the centre), in its arm's direction (`arms[].degrees`) turned by its `slot` (forward, left, right). `skills.ts` draws links as SVG lines and each node as a button plate with a glyph, its level ("2/5") and its name. A link is solid when the node has a level, dashed when reachable, dim otherwise. A node one step past one you own or can buy shows as "?"; nodes further out are not drawn. The centre hub shows the skill points left. The four arms are Logging, Mining, Dungeon and Cards, one colour each (`AREA_COLOUR`).
- Weapon circles sit around the web (`treeView`, `skillsModel.ts`): a dim outline with "?" until revealed, then its skills as nodes. Of `content.account.tree` only the circle skills are drawn.
- Drag pans; the wheel and the +, − and ⌂ buttons zoom.
- **Buying.** A click selects a node. A double click on a buyable node, or the side panel's Learn button, buys one level: `buyWebNode` for a web node, `buySkill` for a circle skill. **The cost shown is skill points only**: the Cost row reads "n points (have m)" and the button "Learn · n points", from `webNextCost` (`cost.base` × `cost.growth` ^ level). No other resource is shown or charged.
- The respec block under it (`respecView`, `respecInfo`, `respecSkills`) confirms in the page. Rules: see Skill web.
- `skillsModel.ts` also holds `starChartView` for the Cards screen.

### Achievements (`achievements.ts`, `achievementsModel.ts`)

- Mounted by the `achievements` view (`views/meta/index.ts`). A two-page sticker book: `bookView` sorts `achievementList` into five chapters (gathering, battle, cards, wardrobe, journey), `spread` splits them over the pages.
- Each achievement is a sticker in the equipped sticker style; its tooltip gives progress and rewards. Nothing is bought or claimed here; see Goals, quests and achievements.
- The model also gives `unlockToast` (`app.ts`) and the shard counter of the Shop screen (`shardOfferViews`, `shardGainView`, `shardsText`).

### Dungeon panels (`dungeons.ts`, `dungeonsModel.ts`)

- `createDungeonPanels` builds three panels that the `dungeon` view (`views/dungeon/index.ts`) opens as a sheet over the running fight, from its Dungeons, Weapon and Training buttons.
- **Dungeons.** Left: dungeons and trials with stars and medals (`bossMastery`). Right, for the picked one: difficulty tiers (`setDifficulty`), Fight here (`pickDungeon`), the stage map, a row per stage and a column per tier (`stageMap`), with Overflow switches (`setOverflow`), a line naming the boss's weakness and resistance with their percents and that Wood to Prismatic cards do base damage (`bossElements` in `dungeonsModel.ts`, tested in `tests/dungeonsModel.test.ts`), trial rewards (`trialRewards`), and the drops of the dungeon being fought (`effectiveDrops`, `bossStatus`). See Dungeons, floors and stages.
- **Weapon.** The weapon panel (`ui/weaponPanel.ts`) of a card in the fighting loadout, switched by tabs. **Training.** `createTrainingPanel` (`ui/training.ts`).
- `dungeonsModel.ts` also feeds the duel (`stage/arena.ts`): `barsGone`, `healthPercent`, `challengeButton`, `challengeVerdict`. Its `overflowSwitch` is unused.

### Settings (`settings.ts`, `settingsModel.ts`)

- Mounted by the `settings` view (`views/meta/index.ts`). Four panels: Display (the reduced-motion switch), Sound (`sound/controls.ts`), Save and Help.
- Save: autosave interval, export to the clipboard or a `.txt` file, import from pasted text or a file. Import checks with `importSaveString` and replaces the game only after a confirm that compares both saves (`saveSummary`). See Saves.
- Help: a button that opens a prefilled GitHub issue (`settings/issueReport.ts`), and the credits from `credits.json`.

### Panels and models without a page of their own

- `production.ts`: only the `PageContext` type (content, `state()`, `apply()`) the screens take.
- `productionModel.ts`: `productionRows`, `jobRateValue` for the Logging and Mining views (`views/gathering/job.ts`, `wing.ts`). `productionStageModel.ts`: `harvestMoments`, `strikeLook`, `pickOptions` for the job view and `stage/harvestParty.ts`. See Production.
- `forgeModel.ts`: `forgeView` for `views/gathering/forge.ts`.
- `buyModel.ts`: `BuyLineView` and the mine and tree buy lines for the chosen count (`mineLevelViews`, `treeLevelViews`, used by `productionModel.ts`), `buyLabel` (used by `upgradeRowModel.ts`), and `formatRate` for the duel. `bestLine` is unused.
- `upgradeRowModel.ts`: `upgradeRow`, `upgradeRows` shape one repeatable line (a tree or mine level, a tool line, a Training line) for `ui/upgradeRows.ts` and the job view; `upgradeLineName` for `ui/perkPick.ts` and the Upgrades view. The before and after for n levels come from the game's `lineEffect` and the next milestone from `nextLineStep` (`src/game/lineView.ts`); the model only formats them: `delta` (the signed gain), `scope` ("after 10 levels"), `says` (the whole sentence for the tooltip and aria label) and `nextTip` (what each pick of the next milestone does). Tests: `tests/upgradeRowModel.test.ts`.
- `tablePanels.ts`: `createPresetsPanel` (worker presets of a job view); `createBondsPanel` and `createExpeditionsPanel` (the Bonds and Expeditions tabs of the Cards screen). See Expeditions.
- `challengesPanel.ts`: the Ascension challenges list in the Ascension counter of the Shop screen (`shop.ts`) with Start (clicked twice; `startChallenge`) and Leave (`leaveChallenge`). See Challenges and trials.
- `ascensionModel.ts`: `gateView`, `starlightViews`, `rewardView` for the Shop screen. See Ascension.
- `accountModel.ts`: `levelBadge` (header level and XP bar), `trackView` (reward track), `levelUpView` (level-up toast), for `app.ts` and `shell/rewardTrack.ts`.
- `progressionModel.ts`: `goalRows`, `questRow` (Goals popup, `app.ts`, `shell/quest.ts`), `medalTip`, `tierUpText`. `detailsModel.ts`: `detailsView` for the Details panel (`shell/details.ts`).
- `statsModel.ts`: `statTiles` for the Cards detail (via `cardsAdapter.ts`). `welcomeModel.ts`: `welcomeCards` for `stage/welcome.ts`.

## Stage effects

`src/renderer/src/stage/` holds the duel and the effects over the screens. They only show; none changes the game state.

- **`director.ts`**: `createDirector`, built in `app.ts`, which calls `afterStep` after every game step. It turns the step's `TickReport` into show events: `duel`, `bossAttack`, `knockout`, `challenge`, `kill` (heard by the arena) and `harvests` (heard by the job view). It also emits `signature` and `harvestBurst` from the step, and two timers (`start()`) emit `hit` (one per the lead card's interval) and `harvest` (once a second); nothing listens to these four. Except `duel`, nothing is sent while the window is hidden.
- **`arena.ts`**: `createArena`, the card duel, created in `views/dungeon/index.ts`. It draws the hand, the enemy card, the hit feed, the stat sheet, the Challenge buttons and the Victory or Defeat banner. On director events cards hop, a slam flashes and shakes, damage numbers pop, loot coins fly to the header and a rare drop gets a toast. See Fights.
  - On a `duel` event a lone signature hit (`signature` and one hit) plays the card's special attack (`playSpecial`), one at a time; a busy or failed one keeps the hop. Its `strike` skill plate is left out, the other plates stay. While it plays the enemy's damage tag holds its value (`tagHeld`, `showTag`); as the hit lands the tag shows the new total and pops, and the signature's feed line pops (`is-landed`, `arena.css`). A burst without a special pops the tag too. The arena dims (`is-special`) all but the source card and the enemy.
- **`specialAttack.ts`**: `createSpecialAttack(host)` gives `play`, `busy`, `cancel`. One canvas over the duel at 25 frames a second in whole-pixel steps: stage dim, slanted cut-in with the weapon and the skill's name, wind-up, lunge, impact frame, the drawn hit sheet with the weapon swiping along it, shake (`shake(el, 'heavy')` for heavy weapons), settle. The weapon is the card's own sprite, only moved, scaled and rotated. The sheet player (`sheetFrame`, `recoloured`, `sheetImage`) plays a drawn sheet from `art/fx/`, recoloured to the material. 700 ms cooldown; a hidden window cancels it; under reduced motion (`calm`) no slide, lunge, shake, flash or particles.
- **`specialData.ts`**: the data the special attack plays. `WEAPON_MOTIONS`: one motion per fighting weapon type (sword, greatsword, dagger, spear, lance, hammer, scythe, bow, staff; axe and pickaxe have none, they never fight): strokes, poses, weight, its `sheet` and `elementSheet`. `HIT_SHEETS` (one drawn hit per type), `ELEMENT_SHEETS` (one drawn slash per element), `MATERIAL_EFFECTS` (Wood to Prismatic) and `ELEMENT_EFFECTS` (the five elements). `effectOf(tier, element)` picks the material's effect from Wood to Prismatic, else the element's (Mythic and Heirloom); `hasSpecial(kind, element, tier)` says whether a card has one. `ELEMENT_SHEETS` has fire, light, earth and dark (dark plays the void slash); water has no drawn slash and plays the code-drawn hit in the old crystal colours. Tested in `tests/specialElements.test.ts`.
- **`arenaBackground.ts`**: `backgroundFor` maps a dungeon's `background` id to a CSS class of `arena.css`; other ids get the brick room.
- **`bossHitModel.ts`**: maths only: the screen-edge pulse before a boss slam (`edgeStrength`), each hit's place on the health bar (`bossHitShows`), the "You fall in" banner (`fallBanner`).
- **`numbers.ts`**: `popNumber`, `popGain`: floating numbers of the duel and the job views, capped, quick gains on one spot merged. Their look follows the equipped number and tick cosmetics.
- **`fly.ts`**: `flyCoins` flies copies of a header chip's glyph to that chip. Used by the arena, the job view and the welcome overlay.
- **`harvestParty.ts`**: `createWorkerCell`, the worker chip and harvest gauge of a production row (`views/gathering/job.ts`).
- **`reveal.ts`, `revealCircle.ts`**: `showReveal`, the modal that deals pulled cards face down and flips them one by one; `createCircle` draws its turning circle. Called by `pages/summon.ts`, and by `pages/shop.ts` for a shard purchase. See Summon and pulls.
- **`toast.ts`**: `toast`, short messages in one live region, three at most.
- **`welcome.ts`**: `showWelcomeBack`, called by `app.ts` at start when offline progress was applied: a fan of cards and a Collect button that flies coins to the header.
- **`motion.ts`**: shared frame loop (`onFrame`), `reducedMotion`, `replay`, `shake` (normal, strong, or `'heavy'`: `st-shake--heavy` in `numbers.css`), `flash`, `slowDown`. **`math.ts`**: pure helpers (popup size, rolling counters, merging, throttling).

### `tierUp.ts`

- The "tier" is never a card's tier. `app.ts` (`onTierUps`) calls `playTierUps` with the `TierUp` list of a game step or a purchase. The game emits four kinds: `gem_mastery`, `boss_mastery` (`settleMastery`, `src/game/mastery.ts`) and `mine_milestone`, `tree_milestone` (buying levels, `src/game/bulk.ts`). A batch gives one flash in the metal's colour, a sound and up to three toasts (`tierUpText`), then one "+n" toast.
- `playUpgradeMoment`: the same flash, sound and toast for a cosmetic level bought in the Wardrobe (`pages/wardrobe.ts`).
- `showEvolution` (a card overlay with a light beam) runs only for kind `heirloom`. No game code emits that kind, nor `tile_stage`, so it is never shown.

### Reduced motion

- The Settings switch (`settings/motion.ts`) sets `data-motion` on the page and overrides `prefers-reduced-motion` for scripts and CSS; with no choice the Windows setting applies. `reducedMotion()` in `stage/motion.ts` reads it.
- When on: no shake, flash, slow-down or metal flash; coins do not fly; floating numbers fade in place; worker chips do not lunge; the reveal and the duel keep their steps without the movement, and the slam warning is a steady glow.

## Art code

The game's pictures are PNGs under `src/renderer/src/art/`; the code here turns a picture's name into markup and adds motion.

### Where the pictures live

- `art/pixel/sprites/` holds every sprite (1,538 PNGs). `art/pixel/hand/` holds the 848 sprites the bake copies into `sprites/` unchanged (pictures made outside the game and the output of the scripts listed under Scripts and data), plus `outlines.json` (outlines of card items). The rest is 37 sprites baked from vector code and 653 cosmetic sprites (`cos-*`, see Cosmetics and themes).
- The file name is the key. Counts by prefix in `sprites/`:
  - `item-` 208: weapons, 100 x 120. `item-<type>-t1` to `-t5` (11 types x 5 tiers = 55), `-t6m` and `-t6v` (22), `-heirloom` (11), `item-<type>-leviathan-t6m|t6v|heirloom` (33), `item-<type>-wildwood-t6m|t6v|heirloom` and `item-dagger-wildwood-heirloom-alt` (34), `item-<type>-hm-<letter>` and `-hv-<letter>` (45 recoloured Heirlooms, 13 of them recoloured again with PixelLab on 2026-11-22, see `docs/ASSET_RULES.md` section 5), 6 other bow and maul pictures, 2 motion strips.
  - `skin-` 37 (weapon skins, 19 stills and 18 strips), `evo-` 9.
  - `kit-` 10: card kits, 212 x 256. `frame-` 4.
  - `foe-` 59, all 160 x 172: 23 pack foes with a still and an idle strip each, and 13 approved PixelLab stills with no strip (2026-11-22, see `docs/ASSET_RULES.md` section 5). `boss-` 3: the Crystal Sentinel and its two shards.
  - `bg-` 5, `bgfish-` 64, `bgbig-` 16: Heirloom backdrops and their fish.
  - `coin-` 36, `tile-` 30, `medal-` 5, `plaque-` 10, `edge-` 15, `money-` 16, `res-` 5, `star-` 11, `shop-` 10, `badge-` 332.
- `art/shell/stone/` (34 PNGs) and `art/shell/oak/` (15 PNGs and `pieces.json`) hold the table's pieces; see Shell and table.
- `art/fx/` holds the 16 drawn sheets of the special attack (see Stage effects): `hit-<weapon>.png` for sword, greatsword, hammer, scythe, staff, lance, dagger, spear and bow, recoloured per material from Wood to Prismatic; `slash-<element>.png` for fire, storm, light, nature, earth, crystal and void, played on Mythic and Heirloom by the sword and the scythe. Since the five elements only fire, light, earth and `slash-void` (for dark) are played; storm, nature and crystal stay unused.

### Asking for a picture

- `art/pixel/sprites.ts`: `sprite(name)` returns the URL, native size and outline, or undefined when there is no such file. `spriteImage` gives an SVG `<image>`. `strip(name)` finds the motion strip `<name>-anim`; `animatedSpriteImage` and `animatedSpriteHtml` play it, or show the still when there is none.
- `art/pixel/manifest.ts` (`MANIFEST`) lists every sprite's size, the outline of card items and the frame count of animated ones. It is generated by `scripts/art/bake-pixels.mjs`. `art/pixel/badges.gen.ts` and `art/pixel/cosmetics.gen.ts` are generated files too; do not edit them by hand.
- Weapons, `art/items.ts`: `cardTierArt(card, tier?)` is the call a card makes. It picks the type's picture for the tier, the Mythic or Void one at T6 by the card's side, and at T6 and Heirloom the card's batch picture or its own `heirloomArt` letter. `itemBoxSprite(name)` draws any 100 x 120 sprite in the 200 x 240 item box with its hidden outline; its branch for pictures 300 px wide or more matches no item, skin or evolution sprite.
- Card kits, `art/frame.ts`: `cardFrame(tier, batchKit, windowed)` draws the one picture holding frame, name plate, art window and banner. `kitName` picks `kit-<tier>` up to Prismatic and the batch's kit (`batches.json` `kit`) at T6 and Heirloom, plus `-window` (window cut out) for an Heirloom with a backdrop.
- Icons, `art/gems.ts`: `gemCoin`, `treeTile`, `mineTile`, `navPlaque`, `masteryMedal`. `forgedEdge` has no caller in the game.
- Foes, `art/foes.ts`: `foeHtml(id, scale)` plays the idle strip, or draws a still with no strip as one frame (`hasFoeSprite` needs only the still); the three bosses in `FX` also get an aura and drifting specks. `art/foeZoom.json` holds a whole-number zoom for small pack foes; `art/foeFit.json` a whole-pixel nudge [dx, dy] per new still that centres it and stands it on the ground line (row 166), so the files stay as approved. An enemy with no picture gets `placeholderHtml`: the `foe-hooded_rogue_assassin` silhouette in one dark colour with a "?" from the pixel font. That is the per-enemy switch: dropping `hand/foe-<id>.png` (and `-anim.png` for an idle loop) and baking gives the enemy its picture. No enemy shows the placeholder today. A boss with no `sprite` in `dungeons.json` uses `foe-<boss art id>`, which is how the Root Warden, Cinder Lich and Glacier Colossus get their new stills. Six pack pictures have no enemy now and stay for the dungeon rework's stage bosses: `abyssal_sharkfang_raider`, `bloodroot_black`, `ivory_direwolf`, `ivory_sun_priestess`, `plague_doctor`, `woodland_stalker_wolf`. `art/bosses.ts` `bossArt(art, level)` draws the one baked boss, the Crystal Sentinel, with aura and specks (`hasBossSprite`); the three dungeon bosses' vector drawings stay in `art/vector/bosses.ts`, no longer baked; `bossInItemBox` has no caller. See Fights.
- `art/evolutions.ts` `evolutionArt(id)`: a weapon with its own motion; the game calls it only for the Flameblade skin (`pages/loadoutCards.ts`).
- `art/cosmetics.ts`: see Cosmetics and themes.
- `art/pixelFont.ts`: the glyphs of the pixel numerals: digits, signs and every suffix of the short number format (k, M, B, T, U, g and the rest, and ∞), plus the "?" of the enemy placeholder. `tests/pixelFont.test.ts` walks the format's `SUFFIXES` and real `formatShort` outputs and fails if a character has no glyph.
- `art/defs.ts` `installArtDefs` adds shared SVG filters at start; `art/art.css` holds the strip animation; `art/kit.ts` holds SVG helpers.

### The pixel pipeline

- `pixel/raster.ts`: pure functions on a pixel grid (palette snap, stray-pixel clean-up, shading, ink outline, sparkles, outer ring).
- `pixel/bake.ts`: build-time only. Draws the vector sources through `raster.ts`, skipping names that have a hand sprite.
- `scripts/art/bake-pixels.mjs` runs `bake.ts` in headless Chromium, empties `sprites/`, writes the baked sprites, copies `hand/` in unchanged, runs the cosmetic export and writes `manifest.ts`.
- `pixel/live.ts`: one shared loop at 12 frames a second for canvas layers (`defineLive`, `liveMarkup`), only for layers on screen. `harden` snaps drawn effects to hard pixels of a set palette.
- `pixel/animate.ts`: plays a strip with CSS steps, one frame per `FRAME_MS`.
- Under reduced motion each shows a still.

### Vector code

`art/vector/` (`items.ts`, `frame.ts`, `gems.ts`, `bosses.ts`, `tiles.ts`) draws SVG. None of it is drawn on screen: the bake and tests use it, and the game reads constants from it. The bake turns it into 40 sprites: `plaque-`, `edge-`, `boss-`, `frame-` and the Rootbloom Staff. The `frame-` sprites have no caller in the game; the `tiles.ts` drawings are not baked.

### Element effects

- `fxGeometry.ts` `ELEMENT_FX` is the switch for the element effects on every card and is off (user, 2026-11-21: "on the weapons everywhere"), so no card shows one; the code below is kept. The duel's special attack does not use it.
- `art/fx.ts` `attachElementFx(artBox, element, strength)`, called from `ui/card.ts`, does nothing while the switch is off. `fxGeometry.ts` `effectStrength(tier, on)` gives 0 at every tier while it is off; when on, none below Gold, weak at Gold, strong at Prismatic, and the card treats T6 and Heirloom as Prismatic.
- The effect reads the weapon's hidden outline in the card, samples it into points and draws from those: fire sends flames up off the edge, water jumps bolts between points or outwards (the old storm effect, a stand-in), light draws a pulsing shell of the outline with sparks, earth circles leaves round the weapon (the old nature effect), and dark draws glowing cracks inside it. A weapon with no outline in the manifest gets no effect; the 45 recoloured Heirloom pictures (`item-<type>-hm-<letter>`, `-hv-<letter>`) and the `skin-` pictures have none.
- Three canvases on the weapon's own grid: a blurred glow and a back layer behind the weapon, and a front layer over it (about a fifth of fire and light particles, 30% of water's bolts, the near half of earth's leaves; cracks are all in front). One loop at 30 frames a second, for cards on screen only.

### Heirloom backdrops

- `art/backdrop.ts` `mountBackdrop(host, spec)` fills the 136 x 160 box behind the kit's window with the batch's picture (`batches.json` `backdrop`; see Heirlooms and batches).
- `art/seaSim.ts` `SeaSim` is the fish and bubble simulation for `motion: "sea"`. `BACKDROP_MOTION` is the switch for all backdrop motion and is off, so backdrops show as stills.

### Whole-pixel scaling

- `spriteImage` and the strip markup set `image-rendering: pixelated`; `animatedSpriteHtml` and `wholeScale` round a scale to a whole number, never below one.
- Cards pick a whole number of device pixels per art pixel in `ui/pixelScale.ts` (maths) and `ui/pixelFit.ts` (applies it).
- `scripts/check-pixel-scale.mjs` measures every pixel-art element in a running app at several screen scales and fails on a fractional scale outside its `KNOWN` list. `npm run lint` does not run it.

### Scripts and data

- `scripts/art/`: `bake-pixels.mjs`, `cosmetics-gen.mjs`, `cosmetics/` (bake); `cut-pack.py`, `foe-zoom.py`, `make-slime.py` (foes); `make-badges.py`, `make-money-crystals.py`, `make-stars.py`, `make-shine.py`, `heirloom-recolours.py` (other hand sprites); `shoot-*.mjs` (screenshots); `picker.mjs` (picker page); `recraft-generate.mjs` (trials), `cut-learn.py` (style references for the pixel-art skill).
- `scripts/shell-art/`: `oak.py` draws the oak pieces; `cut.py` cuts the stone pieces using the `stone*.py` specs.
- `src/data/content/shellArt.json` lists each stone piece's file, size and slice, read by `theme/apply.ts`. `credits.json` lists asset packs and licences, shown in Settings.
