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

- **Window** (`src/main/index.ts` `createWindow`): one window with a sandboxed, context-isolated page. The window and the installer use the summon card back: `build/icon.ico` (exe, installer and uninstaller, set in `electron-builder.yml`) and `build/icon.png` (the `BrowserWindow` `icon`, shipped in the app files). New windows are refused (`https://` links open in the default browser) and in-page navigation is blocked.
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
- `scripts/ask-local.mjs` (`npm run ai:local -- --ping | "prompt" [files]`): dev-only helper that asks the local model (llama.cpp at `http://127.0.0.1:8080/v1`, model `qwen-coder`); see `docs/LOCAL-AI.md`. Not packaged.
- `oak-*.mjs`, `contrast-sweep.mjs` (sharing `scripts/lib/contrast.mjs`): screenshot views, popups and dialogs under a table cosmetic and sweep their contrast.
- `scripts/art/`, `scripts/shell-art/`: art tools. See Art code.

## Sim and dev tools

- **Balance sim**: `scripts/sim/sim.ts` `runSim` plays the real game rules fast with a scripted player and records when each pacing milestone is reached, as an `active` or an `idle` player. `tests/sim.test.ts` runs it.
- **Running it**: `npm run sim` (`scripts/sim/cli.ts`) runs several seeds in child processes and prints the milestone table. Flags: `--hours`, `--seeds`, `--seed`, `--step`, `--late-step`, `--profile`, `--strict`.
- **Extra reports** (`npx tsx scripts/sim/<file>`): `breakdown.ts` (damage sources), `timeline.ts` (state over time), `ranges.ts` (number ranges), `tiers.ts` (tier gaps), `quests.ts` (with and without quests).
- **Cheats**: `src/game/dev.ts` holds pure functions: grant resources, clear a dungeon, set a floor, set a card's stars and level, add account XP, grant a cosmetic, advance time, reset the game.
- **Panel**: `src/renderer/src/dev/devPanel.ts` calls them and adds game speed buttons (`GAME_SPEEDS` in `src/game/loop.ts`). The Dev button or Ctrl+Shift+D toggles it. Reset first copies the save to `save.before-reset-<time>.json`.
- The sim player opens the fighting loadout's skills with Cores as soon as it can (`openSkills` in `scripts/sim/sim.ts`).
- `scripts/make-new-save.ts` and `scripts/make-meta-save.ts` write a save text to a given path. `scripts/shoot-moves.mjs` screenshots the effect words in the duel and the weapon panel's attacks in the running dev app. `scripts/shoot-stats-look.mjs` shoots the weapon panel (a Gold, a Mythic, an Heirloom and a starter) in the dungeon Weapon tab and the Cards detail at 1280 x 720 and 1920 x 1080.

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
2. every farming slot of the camp adds its output (`slotRates`);
3. the forge runs;
4. farming cards gain card XP, harvested gems count for mastery and account XP;
5. combat runs (`advanceCombat`), Money earned is counted, an Ascension challenge is checked.

Level-ups and unlocks are settled only on a whole-second play-time boundary (`CARD_LEVEL_STEP_MS`): card levels, mastery, account level, bonds, achievements, quests. A span crossing many boundaries jumps to the first one where a look-ahead (`levelUpDue`) finds one of these due; the look-ahead does not check quests, so there quests settle only together with something else. `advanceChunked` runs `advance` in steps of a given size.

### Loop and offline

- `src/game/loop.ts` `GameLoop.step(now)` advances by the real time since the last step, never negative and at most `MAX_STEP_MS` (8 hours). A gap over 5 seconds is caught up in one-minute steps, otherwise one-second steps. `setSpeed` multiplies elapsed time (see Sim and dev tools). A clock that was set back by more than `MAX_STEP_MS` (set far ahead, then corrected) restarts from the new time instead of waiting for the old one; a smaller step back still waits, so no time counts twice.
- `src/game/speed.ts` holds the duel speed rule: `DUEL_SPEEDS` (1, 2, 4), `isSpeedUnlocked` (×2 after the first dungeon clear, ×4 after the first Ascension), `usableSpeed`, `speedLocks` and `fightClock`. `GameLoop.setDuelSpeed` sets the chosen speed; `effectiveDuelSpeed` is what runs, and a gap over 5 seconds always runs at ×1.
- `src/game/offline.ts` `simulateOffline` runs the time since the last save through the same tick in one-minute steps. Under 10 seconds (`MIN_OFFLINE_MS`) nothing happens. The cap is 8 hours in code (`OFFLINE_CAP_MS`), changed by modifiers on the stat `offline.capHours` (`offlineCapMs`). Expedition trips also advance through the time beyond the cap. It returns an `OfflineSummary` of what was gained.

### Modifiers (`src/game/modifiers.ts`)

- A modifier is `{ stat, kind, value, scope? }` plus the source that grants it. Stats are the `STATS` list in `src/data/schemas.ts`; scope keys are `job`, `producer`, `resource`, `dungeon`, `portal`, and all given keys must match where the stat is read.
- `collectModifiers(state, content)` gathers, in order: owned cosmetics, complete sets, cards, mastery, Starlight shop, account (tree ranks, skill web, reward track cost cap, card enhancements), Heirloom trees, milestone picks, training, elements, bonds, Ascension challenges. A challenge can hide cards or remove modifiers (`restrictedView`, `restrictModifiers`). Last, `strengthen` scales element modifiers by the stats `element.bonus`, `element.resist`, `element.production` (the stat `tool.strength` is read but no modifier has a source for it now): `element.production` scales element modifiers on `production.rate`; `element.resist` scales element modifiers with a negative value, `element.bonus` the others.
- `computeStat` (value plus the modifiers applied) and `statValue` (value only) apply: base, plus flats, times (1 + percents / 100), times each mult, `set` (last wins), highest `min`, lowest `max`. A cap (`max`) beats a floor (`min`).

### Other core files

- `src/game/bulk.ts`: prices of x1, x10, x100 or Max levels of a Training line on a cost curve (`curveBulkPrice`, `curveMaxAffordable`, `curveOffer`); each level costs what a single buy costs.
- `src/game/report.ts`: `TickReport`, what happened in a span (kills, drops, hits, harvest strikes, tier-ups, level-ups); `mergeReports` joins reports. `TickReport.healed` is the health each healer card's ultimates restored (`healTeam` and `healFromMoves` return the amount actually healed).
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
| `mines.json`         | The three ores (material, base rate, element, dungeon that opens it)                                                              | Production; Base camp                      |
| `camp.json`          | Camp level: start level, lift per level, level price, slots by level                                                              | Base camp                                  |
| `dummy.json`         | Training ground dummy: default damage, hit interval, largest damage                                                               | Base camp                                  |
| `perks.json`         | `milestones`: a Training line, a `level`, and `options` with `effects`                                                            | Production                                 |
| `portals.json`       | Portals: cost, pool, pity                                                                                                         | Summon and pulls                           |
| `prestige.json`      | Starlight gain and shop, multiplier, prizes                                                                                       | Ascension                                  |
| `production.json`    | Card power by tier (`workers.tierPower`), forge                                                                                   | Production                                 |
| `progression.json`   | Mastery, goal rules                                                                                                               | Production; Goals, quests and achievements |
| `quests.json`        | Quests                                                                                                                            | Goals, quests and achievements             |
| `rarities.json`      | Rarity names and colours                                                                                                          | Cosmetics and themes                       |
| `resources.json`     | Every resource and its kind                                                                                                       | Production                                 |
| `scrolls.json`       | Scroll sources and the reveal show                                                                                                | Summon and pulls                           |
| `sets.json`          | Cosmetic sets and bonuses                                                                                                         | Cosmetics and themes                       |
| `shellArt.json`      | Picture pieces per table                                                                                                          | Shell and table                            |
| `moves.json`         | Three attacks: kits per weapon type, tier rules, Core prices, T6 and Heirloom layers and named moves                              | Fights                                     |
| `skills.json`        | Duel skills per weapon type and card                                                                                              | Fights                                     |
| `training.json`      | Training lines                                                                                                                    | Fights                                     |
| `trees.json`         | Tree kinds                                                                                                                        | Production                                 |
| `trials.json`        | Special dungeons                                                                                                                  | Challenges and trials                      |
| `raids.json`         | The five raid bosses, their tricks, the AI ladder teams and the rank rewards                                                      | Raid bosses                                |
| `weaponSkins.json`   | Legacy weapon skins                                                                                                               | Cosmetics and themes                       |
| `wearRules.json`     | Rank a card needs to show a border, finish or exclusive                                                                           | Cosmetics and themes                       |
| `web.json`           | Skill web `arms` and `nodes` (`perLevel`, `cost`, `maxLevel`)                                                                     | Skill web                                  |

## Production

Gathering lives in the base camp (see Base camp): the forest farms three woods and the cave three ores. Production is what stays: the materials, the forge, Training, milestone picks and gem mastery. The logic is in `src/game/`, run each step by `advanceSpan` in `src/game/tick.ts` (see Game core).

### Resources

- `src/data/content/resources.json` lists every resource with its `kind`: `tree_gem`, `mine_gem`, `material`, `currency` (Money), `scroll`, `prestige` (Starlight).
- Each wood (`trees.json`) and ore (`mines.json`) makes its own gem (`resource`) and has a `baseRate`, an element and `unlockedByDungeon` (null = open from the start). Gems are spent on the camp level (`camp.json` `levelCost`), Training lines (`training.json` `cost`) and forge recipes (`production.json` `forge.recipes`).
- Money comes from dungeons (see Fights).
- Star Dust is made by the forge and spent on card stars (see Cards). Other materials, scrolls and Starlight: see Fights, Summon and pulls, Ascension.
- Not production: `coins.json` (how Money is shown), `scrolls.json` (see Summon and pulls).

### Materials and prices (`src/game/production.ts`)

- A wood or ore is open when it has no dungeon to clear or that dungeon is cleared (`isProducerUnlocked`, `unlockedProducers`, `clearDungeon`, which also returns the ores it opened).
- Price helpers shared with the camp and Training: `finalPrice` (`cost.multiplier`), `curvePrice` with `effectiveGrowth` (`cost.growth` cuts never remove more than `MAX_GROWTH_CUT` of the growth above 1), `canAfford`, `pay`. `src/game/bulk.ts` prices several levels on a curve for Training.
- Level milestones (`src/game/milestones.ts`, used by Training lines): every `milestones.every` levels multiply the line by `milestones.multiplier`.
- On Ascension `resetProduction` changes nothing: the forge and the camp are kept. `progression.json` `tileStages` is validated by the schema but the code does not read it.

### Forge workers (`src/game/workers.ts`)

- Only the forge's worker is here (`forgeWorker`, `assignForgeWorker`); camp slots are in `camp.ts`. A forge worker is an owned logging or mining card that works no camp slot and is not away; putting it on a slot takes it off the forge and the other way round. `workerPower` (re-exported from `camp.ts`) is a card's tier value in `production.json` `workers.tierPower` times `cardStatPower` (see Cards); an Heirloom uses the mythic value.

### Training (`src/game/training.ts`)

- Repeatable fighting upgrade lines (`training.json`); each line is paid in its own gem kind (`cost.resource`), not Money. Each level adds `ratePercent` and milestones multiply the line (`trainingMultiplier`, `buyTraining`). Levels are in `combat.training` and reset on Ascension.

### Milestone picks (`src/game/upgrades.ts`, `perks.json`)

- `perks.json` `milestones` gives every Training line levels (5, 15, 30) where the player picks one of two perks (`pickPerk`). A pick is final, stored in `upgrades.picks` and kept through Ascension (`keepUpgrades`); its effects apply only while the line is at or above that level (`perkModifiers`). A reached milestone with no pick waits (`waitingPicks`). The picks on trees, mines and tool lines went with them (save format 41). `upgrades.ts` also counts the lifetime Money earned (`countMoneyEarned`).

### Gem mastery (`src/game/mastery.ts`)

- Every gem harvested adds to a lifetime total (`countHarvest`, `mastery.harvested`). Totals reaching the thresholds in `progression.json` `gemMastery` raise that gem's tier (`settleMastery`, once a second), and each tier adds the `perTier` bonuses for that gem (`masteryModifiers`). The file also holds trial medals (see Challenges and trials).

### Forge (`src/game/forge.ts`)

- One production card can work the forge instead of a camp slot (`assignForgeWorker`, `forgeWorker` in `workers.ts`). The player chooses a recipe (`setForgeRecipe`). Progress per second is the forge's base `speed` times the worker's power, through the `forge.speed` modifiers; each time it reaches the recipe's `work`, the inputs are spent (less the `forge.refund` share) and the output added (times `forge.yield`) (`advanceForge`). Without enough gems it waits. The forge is kept through Ascension.

### View helpers

- `src/game/lineView.ts`: what buying levels of a Training line changes (`lineEffect`, `withLineLevel`) and its next milestone (`nextLineStep`, `lineRings`, `lineBadges`).

## Base camp

The camp replaces the old trees, mines, tool lines, harvest gauge and autobuyers (design: DESIGN section 2, Base camp). Rules: `src/game/camp.ts`; data: `camp.json`; state: `state.camp`; screens: see `views/gathering`.

- **Places and slots.** Two places, the forest (`logging` cards, woods) and the cave (`mining` cards, ores) (`CAMP_PLACES`, `placeJob`). A slot is `{ material, card }` (`CampSlot`): the node (a wood or an ore) it belongs to, and the card on it. `material` null = an open slot that waits to be placed (`waitingSlots`): it farms nothing and takes no card (`assignSlotCard` says `slot-unplaced`). A camp level that opens a slot leaves it waiting; `placeSlot` puts the next waiting slot (in opening order) on an open node of the place and it stays there (`nodeSlots` lists a node's slots; `setSlotMaterial` re-points any open slot and is only for the sim). The open slots of a place are the last `camp.json` `slots` row at or below the camp level (`levelSlots`) alone (`openSlots`; the Starlight item More Yield per Slot raises yield, not slots).
- **Who farms.** `slotWorkers` lists the cards that count, forest first in slot order: the card is owned, of the place's job, not away, on one slot only, in an open slot, within an Ascension challenge's worker limit (`challengeWorkerLimit`). A new game starts with the start axe and pickaxe on the first slots (`initialCamp` in `state.ts`). `assignSlotCard` puts a card on an open slot (it leaves any other slot and the forge; the card it replaces goes back to the collection) or empties a slot; `placeSlot` places a waiting slot (`CampFailure` says why not).
- **What a slot brings.** `slotRate`: the material's `baseRate` times `campYieldFactor` (1 plus `yieldPercentPerLevel` percent per level above 1) times the card's `workerPower`, through the `production.rate` modifiers read at the slot's job, material and resource. `workerModifiers` adds the farming cards' own abilities and their element bonus (+15 % when the card's element is the material's), scoped to the material. `advanceSpan` adds `rate` x seconds to the stock every step, so splitting time and offline progress give the same totals. Each farming card also gains card XP per gem (`productionXpPerUnit`), and the gems count for mastery and account XP. `campPerSecond` sums per resource; `materialRate` is what one power-1 slot of a material brings (expedition gem rewards are seconds of it); `workplaceOf` names the material a card farms.
- **The camp level.** `campLevelCost`: each `levelCost` line from its `fromLevel`, `base` x `growth` to the power of the levels bought, through `cost.multiplier`; `upgradeCamp` pays and adds one level. The camp is kept through Ascension.
- **Test dummy (`src/game/dummy.ts`, `trainingBattle.ts`, `dummy.json`, `state.dummy`).** Endless health and no rewards. `dummy.ts` keeps the settings in the save: `setDummyDamage` (damage of one dummy attack, 0 to `maxDamage`), `setDummyCard` (an owned fighting card in one of four trial slots, once each, one starter at most), `copyLoadoutToDummy`. The dummy's element is a display preference (`prefs.trainingElement`), not saved in the game. `trainingBattle.ts` runs the real fight on a throwaway copy: `trainingContent` adds one dungeon (`TRAINING_DUNGEON`: one floor, a boss with `1e1000` health, the attack and element set, no drops or wages) to a content copy, `startTraining` clones the state with the trial team as the fighting loadout, `stepTraining` runs `advance` on it and gathers the panel numbers, `stopTraining` ends it. A battle ends when the whole team has fallen or on stop. The real state is never changed, so nothing is earned. `trainingPanel` gives total damage, rolling (`ROLLING_SECONDS` 10) and overall damage per second, best hit, each card's share, damage the dummy dealt, fallen cards and each effect's uptime. `DUMMY_STEPS` (none, light, medium, heavy, very hard) are shares of the team's health per attack (`stepDamage`).
- **Saves.** Format 42: see Saves and Ascension. The conversion of old saves is `v41ToV42` in `src/game/migrations.ts`.
- Tests: `tests/production.test.ts`, `tests/dummy.test.ts`, `tests/trainingBattle.test.ts`, `tests/migrateV41.test.ts`.

## Cards

A card is one weapon. The player collects cards, puts fighting cards in a team of four and sets logging and mining cards to work. A card grows by levels (from XP) and by stars (from copies). The rules are in `src/game/cards.ts`, the cards in `src/data/content/cards.json`, every progression number in `src/data/content/cardRules.json`.

### The roster

- `cards.json` holds 205 cards. Each has an `id`, a `job` (`fighting`, `logging` or `mining`), a `tier`, an `element` (T6 and Heirloom only) and an `item.kind` (its weapon type). Shape: `cardSchema` in `src/data/schemas.ts`.
- There are 11 weapon types (`ITEM_KINDS`): nine for fighting, the pickaxe (mining) and the logging axe (logging). A card's job must be its type's job in `items.json` (`checkItems` in `src/data/index.ts`).
- There are seven tiers, in order (`RANK_TIERS`): Wood, Bronze, Silver, Gold, Prismatic, Mythic, Heirloom. Shown names: `tierLabel`.
- Wood to Prismatic: exactly one card per weapon type per tier, 55 cards (`checkCards` in `src/data/index.ts` refuses any other count).
- Mythic (T6): 116 cards (56 Mythic, 60 Void), five of them the starter weapons (see The starter weapon). Each has a `side`, `mythic` or `void`; a `void` card shows its tier as "Void". Only T6 and Heirloom cards have a side. A card's grade (`cardGrade`, `CARD_GRADES`) is its tier, with T6 and Heirloom cards taking their side.
- Heirloom: 34 cards with `heirloom: true` at the tier `heirloom`, which no other card has. They are separate cards in the same list, not a stage of another card: one per weapon type with no `batch`, one per type in the Leviathan batch, and twelve in the Wildwood batch (two daggers). See Heirlooms and batches.
- A new game owns the cards in `cardRules.json` `startCards` (`initialCards` in `src/game/state.ts`) and takes a starter weapon (see The starter weapon).

### The starter weapon

- Five cards of their own, one per element, listed in `src/data/content/starters.json`: `base` (earth hammer Geodefall `geodefall`, a tank; fire sword Emberbrand `emberbrand`, a Void damage dealer; water staff Tidecaller `tidecaller`, support) and `special` (light lance Dawnpiercer `dawnpiercer`, damage; dark spear Voidthorn `voidthorn`, a Void damage dealer). Each has `starterArt: true` in `cards.json` (`cardSchema`; no `heirloomArt`, `heirloomName` or `batch`), is a T6 card named by `name` alone (`itemName` returns it at every tier), and shows its approved picture `hand/item-<type>-starter.png` (`cardTierArt` in `art/items.ts`; imported byte for byte by `design/pixel/starters/import.py`, outlines in `hand/outlines.json`). They are in no portal pool and no shard shop, only in the unlocks. Their moves are the weapon type's kit with the element and side layers of `moves.json` (`cards`: skill, ultimate and lean names; sides: earth, water, light Mythic, fire, dark Void), so the hammer weakens and shields, the sword rallies and wounds, the staff heals and regens, the lance shields and hastes, the spear staggers and exposes. `checkStarters` in `src/data/index.ts` checks the lists. `isStarterCard` (`src/game/cards.ts`) asks them. The older T6 weapons that stood in for them are ordinary cards again.
- What a save may take is read from its dungeon progress, nothing is stored (`src/game/starters.ts`): `starterUnlocks` is the new game's pick plus one base starter per dungeon whose Nightmare last-floor boss is beaten (`nightmareClears`), and one special starter per dungeon with an endless depth beaten (`endlessReached`, two at most), less the starters already owned. `starterChoices` gives the cards to choose from (base first, then special), `claimStarter` takes one: owned at its own tier, ★1 Lv 1, `OwnedCard.seal` 0, always sealed, and put in the first free fighting slot only when no starter is in the team. A save that turned the pick down (`skipStarter`) earned only the Nightmare ones. `state.starter` (`done`, `skippable`) still holds the pick.
- A team holds one starter: `MAX_LOADOUT_STARTERS`, checked in `loadoutProblem` (`too-many-starters`), so the slot swap refuses; the slot picker (`slotChoices`, `starterBlocked`) shows the same message.
- Sealed means it fights as a weaker tier: `strengthTier` in `src/game/cards.ts` is Wood with no seal broken, then the `tier` of the last broken step of `seals`, and `unsealedTier` (`heirloom`) once every seal is broken. `cardBaseDamage`, `cardHealth`, `cardPower`, `cardStatPower` and `cardCost` read it, so an unsealed starter hits and has the health of an Heirloom of the same weapon type at the same level and stars; level caps, stars and shards go by the card's own tier (Mythic).
- `breakSeal` pays the next step's Cores (`nextSealCost`, through `cost.multiplier`): Silver for 4 Moss Cores, Gold for 6 Cinder, Prismatic for 8 Frost, Mythic for 10 Storm. After the last step `seal` stays at the number of steps (4): an unsealed starter. A save drops a `seal` on a card that is not a starter or past that number (`deserializeCards`); a seal was removed on unsealing before, so such a card in an older save is an ordinary T6 card. See also A card never changes tier.
- No portal or shop sells a starter, so a copy of one only comes from a reward; it would be an ordinary copy (a star bar fill, `grantCard`) and the seals stay. The weapon panel shows the tier label "Starter" (`COPY.starter.tierLabel`, `weaponModel.ts`), a label only.
- Screens: `stage/starterPick.ts` is the pick of a new game and the later choices (the app checks `starterUnlockDue` every ten ticks; one dialog at a time; Esc does not close it; a save that began before the starter has a "Not now" button); the seals are `ui/sealBlock.ts`, beside the weapon panel in the Cards detail and the dungeon's Weapon tab (the Cores' amounts and names, one button; "Unsealed" once all are broken).
- The sim (`scripts/sim/sim.ts` `options.starter`, `scripts/sim/starterStart.ts`) picks a starter and breaks seals as soon as the Cores pay.
- Tests: `tests/starters.test.ts`, `tests/migrateV42.test.ts` (format 43 added `state.starter`; this change adds no format).

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
- Elements (`ELEMENTS` in `src/data/schemas.ts`): water, fire, earth, light, dark. Only the 111 T6 and 34 Heirloom cards have one (water 24, fire 35, earth 33, light 22, dark 31: the Dragon and Leviathan cards from `design/weapon-elements-2026-11-21.json`, the Wildwood hero side earth and villain side fire; checked by `tests/elements.test.ts`); a Wood to Prismatic card has none and does plain base damage: neutral against every boss, no farming bonus, no expedition doubling. The Wildwood earth logging cards (Grovehewer, Beetlejaw) are the first that get the woods' earth bonus. In `src/game/elements.ts`, a fighting card's element against the dungeon boss's element (the circle: `elementMatchup`) changes that card's own damage there (`elementRelation`, `elementDamagePercent`), and a card on a camp slot farming a material of its own element gets an output bonus (`workerElementModifier`, read by `camp.ts`). Materials: the three woods earth; Copper and Iron earth, Grotto water; the expedition places earth, fire and water.

### Abilities and team bonuses

- A fighting card has an `ability` (its own, see Fights) and a `teamBonus` (for the team), both modifier lists in `cards.json`. A worker card has one `worker` ability that acts only at its own place.
- `cardEffectModifiers` scales them by the card's power; an ability also gains `cardRules.json` `abilityGrowth`. `cardModifiers` passes the loadout's team bonuses and the workers' abilities to the modifier pipeline (see Game core).

### The loadout

- Only fighting has a loadout: four slots (`LOADOUT_SLOTS` in `src/game/state.ts`), in order back left, front left, front right, back right (`FRONT_SLOTS`). What the rows do is in Fights.
- `loadoutProblem` refuses a loadout with a card that is unknown, not owned, not a fighting card, away on an expedition or in twice, with more than two Heirloom cards (`MAX_LOADOUT_HEIRLOOMS`), or over the cost cap.
- A card's cost is by tier (`cardRules.json` `cost`; an Heirloom card costs `heirloomCost`). The cap (`loadoutCostCap`) is `cardRules.json` `costCap` (a base plus an amount per account level), plus `loadout.costCap` modifiers, stopped at `account.json` `loadoutCostCapTop`. See Account level and reward track.

### Presets

- `src/game/presets.ts`. Each dungeon remembers the fighting loadout it was left with: `pickDungeon` stores the current one for the dungeon being left and puts on the new dungeon's. A remembered loadout that breaks a loadout rule is kept but not applied.

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
- `revealPlan` plans the old reveal from `scrolls.json` `reveal` (which cards glow, which flips last); the new reveal (the three doors) does not use it: it takes the best tier and the timeline from `bestOfPull` and `revealTimeline` in `pages/summonModel.ts`, and `reveal.glowFrom` / `entranceFrom` are no longer read. See Stage effects.
- `src/data/content/coins.json` is not part of summoning: it holds the coin steps of the Money display (`src/renderer/src/settings/coins.ts`).

## Heirlooms and batches

Heirlooms are cards that come only from the Heirloom Gate, with their own shards and bonus trees.

### What an Heirloom is

- A separate card in `src/data/content/cards.json` with `heirloom: true` and the fixed tier `heirloom`. It is never an upgrade of another card: it gets its own entry in `state.cards.owned` (`unlockHeirloom` in `src/game/heirlooms.ts`).
- There is **one Heirloom per weapon type per batch** (item types x batches), except the Wildwood batch, which has two daggers (Phoenixquill and Foxtail). `checkHeirlooms` in `src/data/index.ts` requires exactly one Heirloom without a `batch` per item type, named by `items.json` `heirloom`. A second Heirloom of a type in one batch sets `pictureAlt` (`cardSchema`): its picture key in `checkCards` gets `/alt` and its picture is `item-<type>-<batch>-heirloom-alt` (`cardTierArt`). There is no Mythic and Void Heirloom pair per type.
- `side` (`mythic` or `void`) is required on every T6 and Heirloom card and on no other (`checkCards` in `src/data/index.ts`). For an Heirloom it only chooses its grade and colour (`cardGrade`, `cardStyle`), the backdrop tint, the label and grid-cell styling on the Summon and Cards pages (`HeirloomEntry.side`), and the uniqueness key of batch pictures; it changes no stat, pool or odds.
- No Heirloom is in a portal pool. The 24 arena and raid shop Heirlooms (`shop` on the card) are sold only for coins and are outside the gate and its 34 (see Arena and the raid shops).

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
- `src/game/duelView.ts` is the read-out of that same fight for the screen: `teamView`, `duelEnemy` and an unsaved fight log (`recordDuel`: damage `perCard`, health healed `perHeal`). It changes no state. See Stage effects.
- The effects a card or the enemy is under show as words (`activeEffects` in `duel.ts`, from the skills and ultimates that fired on the clock; `teamView` `effects`, `enemyEffects`): above each hand card and under the enemy name (`stage/arena.ts`, `.du-card__effects`, `.du-foe__effects`), a plain stand-in until each effect has its art. Show only: the fight deals the averages. The card tooltip names its ultimate and skill; a skill event carries the ultimate name (`SkillEvent.name`).

### The team

- The team is the fighting loadout's cards, left to right, minus cards an Ascension challenge excludes (`teamPlacements`). Of the four slots the middle two are the front row, the outer two the back row (`src/game/state.ts` `FRONT_SLOTS`).
- With no card, bare hands deal `combat.json` `unarmedDamage` and are never hit.
- `buildTeam` gives each card its own numbers: team-wide modifiers apply to every card; a card's Ability, element bonus and Heirloom signature power apply to that card alone (`teamModifiers`).
- Each card has one passive skill from `skills.json` (`cardSkill`): an Heirloom's bought tree skill, else its weapon type's (`weapons`); the `cards` map is no longer read. A skill can scale damage and health (`damage`, `health`), be a guard (`guard`) or weaken enemy attacks while its card stands (`weaken`); a tree skill that heals with its signature (`signature.kind`, `share`) heals the team with the ultimate.
- Three attacks (`src/game/moves.ts`, `moves.json`): every fighting card has its normal hit, a skill on its own timer and an ultimate on the full gauge (`cardMoves`). Wood to Prismatic use their weapon type's kit (`kits`) and the tier opens part of it (`tiers`: Wood has no skill and an ultimate with no effect; Bronze has a skill slot; Silver adds the ultimate's effects; Gold and up shorten the skill and lengthen effects; Prismatic, T6 and Heirloom strengthen the ultimate's effects). A T6 or Heirloom card has its own names (`cards`), its element's skill layer and side layer on the ultimate (`elements`: Mythic its `mythic` list, Void its `void` list, Heirloom both), a Mark of its element (`mark`), a `lean` and an `extra` twist. A support ultimate (strike 0, the staff's Mend) does its effect at every tier. Numbers pass through the `move.*` stats.
- A skill fires only when it is open: `OwnedCard.skillOpen`, set once by `openCardSkill` for the Cores in `moves.json` `unlock` by tier (`skillUnlockCost`; Wood has none). A closed or missing skill adds nothing.
- Effects (`MOVE_EFFECT_KINDS`) are dealt as their average, like crits (`applyMoves`): an effect lasting `seconds` of every skill timer or ultimate period counts for that share of the time; one-offs count at their rate. Rally, Expose, Mark (and the resistance it gives back), Focus and Haste change the cards' hit, signature, crit and interval; Wound and the skill's hit are added to the hit; Charge adds gauge fill; Execute raises the ultimate by its health line; Weaken and Stagger become the card's `weaken` (counted in `weakenFactor` while it stands); Heal, Shield, Regen and Drain become `heals` that land when the card's ultimate fires (`healFromMoves`: self, a row, the team or the lowest card). The same effect from two cards does not stack (the strongest counts); Wounds and Charges add up.

### Our damage

- A card's damage per second is its base damage (`cardBaseDamage`: `cardRules.json` `baseDamage` and `weapons.<type>.damage`, see Cards) through the `combat.damage` modifiers, times its skill's `damage` and the crit factor.
- Crits are dealt as their average, `1 + chance x (damage - 1)`, from `combat.json` `crit` and the `combat.critChance` / `combat.critDamage` modifiers (`critStats`, `critFactor`). On-screen crits are rolled for show only (`rollHitForShow`).
- Elements: every boss has one `element` (`dungeons.json` `boss.element`; Mossy Cellar earth, Ember Crypt dark, Frostspire Vault water (changed from fire on 2026-11-23: an ice colossus), Thunderpeak Aerie water, Sunken Sanctum light, Hollow of the Void dark). The circle is `elementMatchup(attacker, defender)` in `src/game/elements.ts`: water beats fire, fire beats earth, earth beats water, and the beaten side hits the winner softer; light and dark each hit the other harder and nothing ever resists them. `weakToElement` and `resistsElement` name the partners the Dungeons panel shows. A card's element against the boss (`elementRelation`, `elementDamagePercent`) changes its own damage in that whole dungeon by `combat.json` `elements.weakness` or `elements.resistance` percent. A card with no element is neutral, and so is any dungeon without a boss element (trials).
- Card hit number k lands at k x interval seconds of play time (`hitsBy`), worth damage per second x interval; enemy attacks use the same clock. Interval, gauge size, fill and signature power: `combat.json` `bursts.fighting` through the `burst.*` modifiers (`burstStats`).
- Every hit fills the card's signature gauge; a full gauge fires the signature on that hit: extra damage of `power` hits times the ultimate's `strike` (0 for a support ultimate), and its `heals` land (`healFromMoves`). A heal only restores standing cards; a knocked-out card stays out until the floor is cleared (`healTeam` in `src/game/duel.ts`). On screen a signature hit plays the card's special attack (`stage/specialAttack.ts`, see Stage effects).
- The stage's star level multiplies all damage on that floor (`stageDamageFactor`).

### Enemies and health bars

- A floor's enemies stand one at a time (`fightStage`), their HP after the `combat.bossHp` modifiers. Saved: `state.bossHp` (HP left of the current enemy) and `state.combat.enemyIndex`.
- Damage stops at the kill and the next enemy starts at full HP. With the stage's overflow switch on, the floor is one HP pool and leftover damage carries on (`damageFloor`).
- `src/game/hpBars.ts` `hpBarState` splits an enemy's HP into equal stacked bars for display: `dungeons.json` `boss.hpBars` for the boss, half that (rounded) for a mini-boss, one for a normal enemy (`src/game/floors.ts`). `barMoment` tells the stage when a bar shatters or the enemy dies. Bars are display only; the rules have no break mechanic.

### Enemy attacks

- The floor attacks every `intervalSeconds` of play time (`dungeons.json` `boss.attack`); the damage is the boss's attack on a boss floor, a share of it on a mini-boss or wave floor (`combat.json` `floors`), times the difficulty's attack scale. `src/game/bossAttacks.ts` numbers the attacks: every `attacksPerCycle`-th is a slam, the rest are light hits (`combat.json` `bossPattern` `lightMultiplier`, `slamMultiplier`).
- Damage is reduced by the `combat.defence` percent (capped in code, `defencePercent`) and by each standing card's skill `weaken` and moves `weaken` (`weakenFactor`).
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

- The last of a dungeon's `floors` holds its `boss`, every `combat.json` `floors.miniBossEvery`-th floor its mini-boss (`miniBossAt`: the dungeon's `miniBosses` entry for that stop, floor 10 the first, floor 20 the second; Mossy Cellar's one entry only serves its endless depths, as its floor 10 is the boss), the rest a wave of its `enemies` (`floorKind`). A floor always holds the same wave (`floorSpec`).
- A floor's HP and attack are a share of the boss's, shrinking per floor above the last by the dungeon's `floorGrowth`, else `combat.json` `floors.hpGrowth` (`floorScale`).
- Four difficulties (`DIFFICULTIES` in `src/game/state.ts`): Normal, Hard, Nightmare, endless depths, each with its own progress. Hard and Nightmare multiply enemies and pay (`combat.json` `difficulties`). Each opens when the last-floor boss of the one before is beaten (`isDifficultyUnlocked`); the player switches with `setDifficulty`. Each also pays more loot (`difficultyLootFactor`, see Stage stars, closed).
- The endless depths have no last floor and no boss; each depth is one growth step stronger. In the endless depths every `miniBossEvery`-th depth holds a mini-boss (never a boss), the `miniBosses` list repeating from its start.

### Farming and pushing

- Per dungeon and difficulty the save holds the farmed `floor` and the `best` floor beaten (`floorPosition`).
- Farming: the loadout fights the farmed floor on a loop. Pushing is a Challenge: a timed fight for the floor after the farmed one (`challengeFloor`), at full health. It starts by button (`startFloorChallenge`) or by auto-challenge, a per-dungeon switch, on by default (`setAutoChallenge`). Timers: `combat.json` `challenge.timerSeconds`.
- Speed button: `advance` takes a `fightSpeed`. Only a running Challenge uses it: `advanceCombat` gives the fight `seconds × speed` and adds the difference to the runtime-only `combat.fightClockBonus` (the fight clock is `fightClock` in `speed.ts`, play time plus that bonus). Production, farming, income and offline progress keep real time; per-second fighting XP and wage, and kill pay (money, materials, kill XP; `combat.paySlow`), are divided by the speed, so they stay the same per real second. When the Challenge ends inside a step the rest of the step runs at the real pace (`endSpeedUp`).
- A win raises the best floor and moves farming to it. A loss (timer out, or every card down) returns to farming; with auto-challenge on, the next Challenge waits `challenge.autoWaitSeconds`.
- A team knocked out while farming drops one floor and sits out `knockoutSeconds`.
- An Ascension keeps best floors, restarts farming at half of each (`ascensionStartFloor`) and turns auto-challenge back on.

### Stage stars, closed (`src/game/stageStars.ts`)

- The stage stars are closed (DESIGN.md §2 Dungeons): a boss or mini-boss kill is no longer counted on its stage, so the kills a save already holds keep their star levels (`stageStarLevel`, `totalStageStarLevels`: the skill points from them stay, the achievements on them stay). A chest earned and never opened is still paid with the next boss kill on that stage (`payStageChests`).
- A stage no longer adds damage. The loot the levels gave belongs to the difficulty now: `difficultyLootFactor` (`combat.json` `difficultyLoot`, in step-sized levels: Normal 2, Hard 3, Nightmare 4, endless 4, each worth `stageStars.lootPerLevel`, the skill web's `stars.loot` widens the step) multiplies Money purses and material chances on every floor of the difficulty (`killEnemies`). The skill nodes that gave stage-star damage now give crit damage (`combat.critDamage`, same percents, to be retuned by the full sim).
- The overflow switch (`setOverflow`) is open on every stage; when on, damage left over from a kill carries into the next enemy. Other floors follow a stage's switch (`overflowStage`).

### Pay

- `dungeons.json` `drops`: `currencies` (Money range, every kill), `material` and `extraMaterials` (by chance), `rare` (last-floor boss only, `chance` with `pityThreshold`), `wages` (per second fought, paid at the next kill), `firstClear`.
- Other enemies roll the boss's table scaled by their share of its HP, without the rare item (`src/game/drops.ts`; `killEnemies` in `combat.ts`). Purses grow with depth (`floors.purseFloorBonus`).
- Also: scrolls for each floor's first win (`scrolls.json` `floorFirstWin`), Heirloom Scrolls (see Heirlooms and batches), account and card XP per kill.

## Expeditions

A card that is neither fighting nor working can go on a timed trip for materials, gems and card XP. Rules: `src/game/expeditions.ts`; data: `expeditions.json`; panel: `createExpeditionsPanel` in `src/renderer/src/pages/tablePanels.ts`.

- Three `places`, each with a `dungeon` and an `element`; a place opens once that dungeon is cleared.
- Sending (`startTrip`, `tripProblem`): the card is owned, not away, not in the fighting loadout, not on a camp slot or at the forge; the length is one of `durationsHours`; a slot is free. Slots: one, plus the Starlight shop item granting `expedition_slot`, plus `expedition.slots` modifiers (`expeditionSlots`).
- A card that is away cannot be equipped or put to work (`isOnTrip`).
- A trip is a timer that also runs through all time away, beyond the offline cap (`advanceTrips`).
- Rewards (`tripRewards`, paid by `collectTrip` when done), per hour, from the place's `rewards`: `materials`, `gems` (seconds of what one power-1 slot of that gem's material brings, `materialRate`), card XP (`cardXpLevels`, a share of the card's next level). All doubled when the card's element matches the place's.
- Recalling early (`recallTrip`) brings back nothing.

## Challenges and trials

A **challenge** is a whole Ascension run played under a handicap for a permanent bonus. A **trial** is a special dungeon: short timed attempts against one target, scored by damage. Neither is the floor Challenge above.

### Ascension challenges (`src/game/challenges.ts`, `challenges.json`)

- Six: Lone Wolf (only the first fighting card counts), Common Folk (only Wood cards count), Untrained (Training gives nothing), Drought and Glass Cannon (`penalties` on production and card health), Single Post (one worker works). Named rules are `restrictions` (`ascensionChallengeSchema`).
- Open after the first Ascension. Starting one (`startChallenge`) is an Ascension (see Ascension); the target's dungeon must be unlocked, and that dungeon tier restarts on floor 1.
- Three `targets` each (a floor of a dungeon difficulty), one per completion. When the run's farmed floor there reaches the target, the completion counts and the rule ends (`settleChallenges`).
- Each completion, three at most, gives its `rewards` entry as permanent modifiers. Leaving (`leaveChallenge`) or ascending ends the rule and earns nothing.
- Rules act through `src/game/modifiers.ts`, `duel.ts` (`challengeExcludedCards`) and `camp.ts` (`slotWorkers` reads `challengeWorkerLimit` from `challenges.ts`). Panel: `src/renderer/src/pages/challengesPanel.ts`. Tests: `tests/challenges.test.ts`.

### The trial (`trials.json`; `fightTrial` in `combat.ts`)

- One, The Glimmer Trial, opened by its `unlockedBy` dungeon and picked like a dungeon.
- Attempts of `durationSeconds` repeat while it is active. The team hits a target with fixed `hp` that does not hit back. Score: damage dealt over that HP, which can pass 1 (`trialScore`).
- Each attempt pays every `tiers` entry whose `score` was reached (`trialRewards`); a score of 1 clears the trial. Clearing the trial adds it to `clearedDungeons`, which opens any dungeon or trial whose `unlockedBy` names it.
- The best score earns medal tiers with bonuses from `progression.json` `trialMastery` (`src/game/mastery.ts`).

## Raid bosses

Five bosses, one for each element, fought with the player's fighting team after the first Ascension. All numbers are in `src/data/content/raids.json` (`raidsSchema`); the rules are `src/game/raids.ts`; tests `tests/raids.test.ts`; sim checks `scripts/sim/raidsCapture.ts` and `raidsCheck.ts`.

- `raidsOpen`: `prestigeCount` at least `unlockAscensions`. `raidTriesLeft`: `triesPerDay` per boss, counted against the local day (`localDay`); `state.raids.day` holds the day the used tries belong to, so a new day (also after time away) gives them all back with no timer.
- `fightRaid` builds the team with `buildTeam` scoped to the boss id (the element circle works through `elementDamagePercent`, which also knows raid ids, and the modifier scope is the boss id), then steps the fight a quarter second at a time: each card's hits and ultimates on the play-time clock (`cardRun`), heals and shields landing with the ultimates (`healFromMoves`), and the boss attacking one card at a time (`enemyTarget`, `weakenFactor`, `combat.defence`). It ends at a kill, a wiped team or `durationSeconds`. The state is not changed; the same team always gets the same result.
- Score: the HP taken off the boss as a share of its HP (`combat.bossHp` modifiers apply); a kill ends the fight and scores 1 plus `killBonus` times the share of the time left. Tricks (`bossTrick`): `shield` (Stoneskin) soaks `size` of the team's damage, `mend` gives the boss back `size` of its HP every `every` seconds, `curse` cuts the team's damage by `size`, each by the share `answerAt` of Expose, Wound or Rally (`teamEffectShare`, the moveset's averages) takes away; `rage` grows the boss's attack by `size` a minute; `judgement` makes every `every`-th attack hit all cards for `size` times an attack.
- Ladder (`raidLadder`, `raidRank`): the `ladder.teams` (four real cards each, a score per boss as a share of the boss's HP) and the player's best on one list, ties to the AI team. `tryRaid` spends a try, keeps the best (`state.raids.best`) and pays each `ladder.rewards` rank once per boss (`state.raids.paid` holds the best rank paid).
- Coins and shops: each try also pays raid coins of its boss and keeps the season best (see Arena and the raid shops).
- Raid level: each kill of a boss raises it one level (`state.raids.level`, `raidLevel`): its HP grows by `levelGrowth.hp` and its attack by `levelGrowth.attack` for each level (`raidBossHp`), its best score starts again (`tryRaid` `levelUp`), and the ladder shares apply at every level; the rank rewards paid stay paid once per boss.
- The screen (`src/renderer/src/views/raids/`: `raids.ts`, `raidsModel.ts`, `copy.ts`, `raids.css`; view id `raids`, registered in `table/registry.ts`): the five bosses (picture, element, weakness, trick, tries left today, best score and rank), the fight played back second by second from `RaidFight.samples` with a timer, running damage, the boss's health bar and the team (a try is spent and saved when the fight starts; Skip jumps to the end), the result with the new rank and rewards, and the ladder with the rank rewards. It is opened from the hub's Raid gate (`hubModel.ts`: `needsAscension`, `sealWhy`; the gate stays sealed with a plate until the first Ascension). The boss pictures are `art/pixel/hand|sprites/foe-raid_*.png` (the kept 160 x 172 stills, `raids.json` `art`), drawn with `foeHtml`. Tests: `tests/raidsModel.test.ts`, `tests/hubModel.test.ts`.

## Arena and the raid shops

The arena, the 4-week seasons the raids share, and the shops that sell the arena and raid Heirlooms. Numbers are in `src/data/content/arena.json` (`arenaSchema`, `checkArena`); rules in `src/game/arena.ts` and `src/game/shopPerks.ts`; tests `tests/arena.test.ts`, `tests/arenaModel.test.ts`; sim tools `scripts/sim/arenaCapture.ts`, `arenaSearch.ts`, `arenaCheck.ts`.

### Seasons (`seasonAt`, `syncSeason`)

- A season is `season.days` (28) long; season 1 starts at 00:00 UTC on `season.startsOn`. The clock is passed in (`now` in epoch ms), so tests inject it. `state.arena` (`ArenaState`, save format 48) holds the season the figures belong to, the ladder points, wins and losses, fights used today, the rival draw counter `rolls`, arena coins, raid coins by boss, the raid season bests, bought Heirloom ids, unclaimed season chests and earned frames.
- `syncSeason(state, content, now)` returns the same state when nothing changed. The first look starts the current season. When a later season has begun, the ending one is finalised once (`finalizeSeason`): one chest per mode the player played (arena if they fought, raid if they scored), each with the final place and its rank band, and the season's figures start again; coins, purchases, chests and frames stay. `paidThrough` is the newest season seen minus the one being played, so a clock jumped far ahead pays only the season the player was in, and a clock set back is ignored unless it is more than 8 hours before the current season's start, when the season check starts again with no reward and no season is paid twice.
- The app calls it on every tick (`app.ts` `step`) and the Arena and Raids views call it when they render.

### The ladder and the ranks (`arenaLadder`, `rankForPlace`)

- No server: the ladder is `ladder.size` AI rows. Row i has final points `topPoints x (1 - i / size)^curve` with a seeded wobble (`jitter`), and its points at a moment are its final points times `startShare + (1 - startShare) x season progress`, so the rows climb all season. Names are drawn from `ladder.first` and `second` by season and row. The player's row sits where their points put it; a tie goes to the AI row.
- Five ranks, which are also the season chest bands (`ranks`): Contender, Top 100, Top 50, Top 10, Champion #1 (`rankForPlace`). Each has a chest (`resources`, `arenaCoins`, `raidCoins`) and, from Top 100, a frame. `claimSeasonChest` opens the first waiting chest: it pays its resources and the coins (arena coins, or the raid coins of every boss) and keeps the frame in `arena.frames`.
- Each row belongs to a band by its place (`bands`: `fromRank`, card `level` and `stars`, `damage` and `health` strength through the modifier pipeline as `combat.damage` and `combat.health` mults, and a list of archetypes). An archetype is four fighting cards in slot order with tags (`wall`, `healer`, `rush`, `heirloom`, `mono_<element>`, `mixed`), found by `scripts/sim/arenaSearch.ts` (see below). The row plays one archetype of its band, drawn by season and row (`archetypeFor`).

### Fights (`duelTeams`, `tryArena`)

- The rival's team is a scratch state owning the archetype's cards at the band's level and stars (`rivalState`), built with `buildTeam` scoped to `arena` (`ARENA_ID`) and the band's strength (`rivalTeam`). The player's team is their own loadout with `collectModifiers` plus the perks that name a tag the rival carries (`youForArena`).
- `duelTeams` steps 0.25 s at a time, both sides attacking at once with the dungeon duel's pieces: each card's hits and ultimates on the play-time clock (`cardRun`), a target by `enemyTarget` (front row, guard first), the element circle on every hit (`elementMatchup`, `combat.json` `elements`), the defender's `combat.defence`, `weakenFactor`, heals with ultimates (`healFromMoves`). Damage is scaled by one factor for both sides (`damageFactor`) so a mirror match of equal teams lasts about `fights.targetSeconds`. A fight ends when a team is all down or at `fights.maxSeconds`, when the team with more health left wins; a tie goes to the rival. It changes no state and one pair of teams always gives one result.
- `tryArena` needs the milestone (`arenaOpen` = `firstAscensionOpen`), a season, a team and a fight left today (`fights.perDay`, counted by local day like raid tries). A win gives `points.win` (more by `higherBonus` against a rival ranked above) and `coins.win`, a loss costs `points.loss` (never below 0) and gives `coins.loss`; `rolls` goes up so a new rival is offered (`currentRival`: a row within `rivalsAbove` and `rivalsBelow` places of the player's, drawn by season and `rolls`; `otherRival` draws again).

### Raid season and coins

- A raid try pays raid coins of its boss (`raidCoinsFor`: `raid.coins.perShare` for each 1.0 of score share, plus `perKill`) and keeps the best share of the season per boss in `arena.raidBest` (`tryRaid`, `RaidTry.coins`). The raid season score is the sum of the bests; `raidSeasonLadder` and `raidSeasonRank` put it among AI rows like the arena's. The lifetime raid ladder and its once-per-boss rank rewards are unchanged.

### Shops and perks (`arenaShop`, `raidShop`, `buyShopHeirloom`, `shopPerkModifiers`)

- 24 shop Heirlooms are `heirloom: true` cards in `cards.json` with `shop: { kind, set }` and no tree; they are never in the Heirloom Gate (`heirloomCards` leaves them out). The arena's sets are `arena_s1`, `arena_s2`; each boss has one (`raid_rootstone`, `raid_ember`, `raid_tide`, `raid_lich`, `raid_seraph`) in its element and side. Their moves and enhancement options are cloned from the Wildwood Heirloom of the same weapon type (`design/pixel/shop-heirlooms/build-content.mjs`). Their picture is `item-<type>-<set>-heirloom`; one that is not in the manifest draws as an empty slot (`cardTierArt`, the shop card's "Picture not drawn yet").
- `arena.json` `shop.seasons` lists each season's Heirlooms with price and perk; the arena shop shows the last `visibleSeasons` seasons up to the current one, so a new season is data and sprites only. `raid.shops` has each boss's coin name, set and four Heirlooms. Each is bought once, with arena coins or that boss's coins.
- A perk (`shopPerkModifiers`, source `shop`, in `collectModifiers`) is a list of modifiers on the card's own loadout slot: an arena perk is scoped to `dungeon: arena`, a raid perk is copied to every raid boss id, so they count nowhere else and elsewhere the card is a normal Heirloom. An arena perk with a `vs` tag counts only against a rival whose archetype carries it (`youForArena`).

### Screens (`src/renderer/src/views/arena/`, `views/raids/`, `ui/shopCards.ts`)

- The Arena view (view id `arena`, opened from the hub's colosseum; the place is sealed with "Opens after Frostspire Vault on Normal" until `arenaOpen`): sub-tabs ← Hub, Arena, Shop. The Arena tab: the season line and arena coins, the duel floor (you, VS with Fight and Other rival, the rival, each team as four weapon boxes), the ladder (seven rows around the player or the whole ladder: rank, name, the team's weapons, power, points) and the season chest track by final rank. A fight is played back second by second from `ArenaFight.samples` (health bars, cards greyed as they fall, Skip) and ends with a result plate. A season's chest waits at the top of the tab; opening it shows the rank frame with the top number and the season written in its medallion with `rank-numerals.ttf` (8 px font, `frameHtml`). Model: `arenaModel.ts`.
- The Shop tab: the coin bar and the arena Heirlooms as big cards (`ui/shopCards.ts`: picture, name, perk, price, Buy). The Raids view has the same sub-tabs (Raid, Shop): its Shop has one tab per boss with that boss's coin bar and four cards, the boss cards show their coins, and the head shows the season rank and the raid season chest to open.
- Art in `art/pixel/hand` and `sprites`: `coin-arena`, `coin-raid-<element>`, `rank-<arena|raid>-<band>`, `frame-<arena|raid>-<band>`, the shop Heirloom sprites (imported by `design/pixel/shop-heirlooms/import.mjs`, no traced outline yet).

### Sim tools

- `scripts/sim/arenaSearch.ts`: for each rank band it climbs from random teams of four (the band's tier pool and cost cap, any slot order) by one-card changes and swaps, scoring each by its win rate against a fixed field in `duelTeams`, ranks the climbers by a round robin and keeps the best few of different element mix and role (`--write` puts them in `arena.json`). `arenaCapture.ts` saves the sim player's state when the arena opens and 2, 6 and 12 hours later; `arenaCheck.ts` fights those states against every archetype.

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

The player gives up the current run for Starlight, a permanent multiplier and guaranteed prizes. Logic: `src/game/prestige.ts`; numbers: `prestige.json`; tests: `tests/ascensionKeeps.test.ts`, `tests/ascensionModel.test.ts`, `tests/ascensionRework.test.ts`, `tests/prestige.test.ts`. The screen is the Ascension view, opened from the hub's Shrine (see Ascension screen).

- **When.** The first Ascension opens once `prestige.json` `firstAscension.dungeon` (Frostspire Vault) is cleared on Normal (`firstAscensionOpen`, `ascensionPreview().locked`); later ones whenever the player chooses, from `gain.minimum` Starlight (1). `ascend` refuses with `locked` or `too-early`. It is also called when a challenge run starts (`src/game/challenges.ts`).
- **Starlight.** `starlightBreakdown` adds two parts, both through the `prestige.gain` stat: the materials farmed this run (`runPoints`, gems weighted by tier, `(points / divisor) ^ exponent`) and progress (`runProgress`): every floor a dungeon tier stands on now past the floor the run started it on pays `gain.progress.perFloor` x the dungeon's weight (`1 + order x dungeonStep`) x the difficulty's weight, and a boss floor beaten this run pays `bossFloors` floors more. The start floors are `state.prestige.runFloors` (`dungeon:difficulty`, set by `ascend`, empty in a new game); the climb back to them is not paid again.
- **Multiplier.** `ascensionMultiplier(n)` = 1 + `multiplier.step` x n + `multiplier.growth` x n(n-1)/2. `prestigeModifiers` adds it as a `mult` modifier on `combat.damage` and `production.rate` (source `prestige` / `ascension`), so it reaches all damage and every camp yield.
- **Prizes.** Every Ascension pays `prizes.summonScrolls` Summon Scrolls and `prizes.cores` of each Core (`ascensionPrizes`), the Heirloom Scrolls of `heirlooms.json` `scrolls`, and at the Ascensions listed in `prizes.pulls` one guaranteed card of tier `mythic` or `heirloom` (`guaranteedPullCard`: the first of that tier not owned, rotating with the count; an owned one pays a duplicate or shards).
- **Preview.** `ascensionPreview` gives the gain and its two parts, the multiplier now and after, the prizes, the cosmetics, the `landmark` (the dungeon being fought at its best floor) and `faster`: `fasterEstimate` is the ratio of the new multiplier to the one now. A landmark's time is its health over damage, so the multiplier alone makes it about that many times sooner; Head Start only adds to it.
- **Resets.** Every resource to its starting amount except kinds `prestige` and `scroll` and those marked `keptOnAscend` in `resources.json`; training levels (unless Lasting Training is owned), the current fight and an unfinished challenge run. Each dungeon tier keeps its best floor and restarts on `headStartPercent` of it (50 plus Head Start's levels; `ascensionStartFloor`); auto-challenge is on again only with Auto-push.
- **Kept.** Everything `ascend` does not touch, including cards, cosmetics, the camp (level, slots and their cards), the forge, mastery, portal counters, account level, circle ranks, web levels, quests, achievements and Starlight shop levels. Milestone picks and lifetime Money are kept by `keepUpgrades`. The screen shows the lists `ASCENSION_RESETS` and `ASCENSION_PERSISTS`.
- **Starlight shop.** `prestige.json` `shop` sells unlocks: each level costs `cost.base` x `cost.growth` ^ level (`starlightPrice`, `buyStarlightItem`), kept for good in `state.prestige.shop`. Items: More Yield per Slot (`second_hands`, +20% `production.rate` on logging and mining per level, no slots), Third Raid Try (`raids.tries` +1, read by `raidTriesLeft`), Faster Skill Unlocks (`moves.unlockCost` -4% per level, read by `skillUnlockCost` and `openCardSkill`), Lasting Training (`keep_training`), Head Start (`head_start`, `percent` per level), Long Night (offline hours) and Travel Pack (`expedition_slot`). Helpers: `grantLevel`, `keepsTraining`, `headStartPercent`. The old stat items (damage, health, yield, crystals, price growth) are gone; their value is in the multiplier.
- **Saves.** Format 46 (`v45ToV46`): the Starlight spent on the removed stat items is added back, More Yield per Slot keeps its levels, the camp keeps only the slots its level opens (cards on the extra ones go back to the collection), and `prestige.runFloors` starts empty. Format 47 (`v46ToV47`): auto-challenge is a default feature (always available, a new dungeon starts with it on); the migration turns it on for every dungeon once and removes Auto-push from the shop, paying an owner its 6 Starlight back. Tests: `tests/ascensionRework.test.ts`.

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
- CSS: `theme/base.css` (card and table from tokens), `recipes.css` (recipe classes), `frames.css` (panel and button frames from table tokens; `.px-btn`, `.button`, `.shop-cancel` and `.cp-select` are at least 24 design px high), `effects.css` with `effects.ts` (floating numbers).
- The UI look vault: `src/data/vault.ts` `UI_LOOKS_VAULTED` (on) holds back the `table`, `starlight`, `sticker`, `nodes` and `wardrobe` slots, like `BACKDROP_MOTION` for backdrops. `validateContent` (`loadContent({ uiLooksVaulted })` in tests) marks those items `hidden` and cuts them from portal pools, the shard shop and the prestige, achievement and reward-track rewards; `resolveGlobal` shows the slot's starter whatever is worn (the table slot shows the hidden `gold_table`); a vaulted dungeon rare drop stays in the inventory and grants no cosmetic (`combat.ts`); the Wardrobe lists no sets and no Interface chip. Saves are untouched, so owned items keep their `ownedModifiers`; no set can be completed. `tests/uiLookVault.test.ts`.
- The table item also themes the shell (see Shell and table). The shell look is Charcoal and Gold: the `shell-gold` recipe, drawn by `theme/shellGold.css` from `art/shell/gold/` (`pieces.json` gives each piece's size and corner; `extra/` holds kit pieces, only the tooltip is used). `shell-oak` (`theme/shellOak.css`) stays in the code, unused by default. `shell-stone` is drawn by `theme/shellPictures.css` from `shellArt.json` (`applyShellArt` sets `--sh-<piece>-*`); no item in `cosmetics.json` uses it.
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
- The current save format is **48** (`src/game/save.ts` `CURRENT_SAVE_VERSION`). Format 41 added `skillOpen` to every owned card (false from the migration). Format 42 added the camp and the Training ground dummy. Format 43 added `state.starter` and `OwnedCard.seal` (the starter weapon): a save from before it gets `starter: { done: false, skippable: true }`, so it is offered the pick once on load. Format 44 added `raids` (tries used today, best scores, ladder ranks paid, boss levels; empty from the migration). Format 45 puts every slot on a node: a slot open at format 44 keeps the material it farmed, else the place's first (Oak, Copper Quarry); `v44ToV45` holds a snapshot of the slot table and the Starlight item, and a slot opened later waits to be placed. Format 46 is the Ascension rework (see Ascension, Saves): `prestige.runFloors`, the removed stat items refunded, the slots Wider Grounds added dropped. Format 47: auto-challenge on for every dungeon, Auto-push removed and refunded. Format 48 adds `arena` (season, coins, bought Heirlooms, chests, frames; empty from the migration, see Arena and the raid shops).
- `state` is the whole game state with big numbers as strings (`serializeState`; shape in `serializedStateSchema`). A card's tier is not saved; it is read from the card's data on load.

### Where and when it is written

- Desktop: a `saves` folder in the app's user data folder (`src/main/saves.ts`). `src/main/saveStore.ts` writes `save.json` through a temp file and a rename. The save already there is first copied to `save.bak.json` if it is valid JSON, or to `save.corrupt.json` if not, so a damaged file never replaces a good backup. A failed write on desktop is logged to `logs/saves.log` in the user data folder (`src/main/saves.ts`).
- Web build: the same three slots as local storage keys, same rule (`src/renderer/src/web/webSaveStore.ts`).
- The renderer saves (`src/renderer/src/app.ts` `save`) at the end of start-up, on a timer the player sets in Settings (`src/renderer/src/settings/prefs.ts` `AUTOSAVE_CHOICES`), right after each player action (`applyAndSave`), after an import, and on a flush request. `save` steps the loop to the current time before writing, so the saved state is always current. A failed save shows a toast and the game carries on.
- Save on quit: on desktop the window close is held until the renderer confirms a last save or a timeout passes (`src/main/saves.ts` `saveBeforeClose`). In the web build the flush fires when the page is hidden or closed (`src/renderer/src/web/browserApi.ts`).
- Where the dev cheats are on (`src/main/devMode.ts` `devCheatsEnabled`), a reset from the dev panel saves, then copies the save to `save.before-reset-<timestamp>.json` (`saveStore.ts` `backupBeforeReset`) before writing the fresh game.
- A build run from source has its own user data folder, so its own saves: `BI_USER_DATA_DIR` sets the folder, `BI_PROFILE=<name>` or `--bi-profile=<name>` gives `basic-incremental-dev-<name>` (`BI_PROFILE` wins over the flag; a name with other characters than letters, digits, `_` and `-` is ignored), otherwise `basic-incremental-dev` (`src/main/devPaths.ts`). The packaged local dev build keeps its saves in its own user data folder, `basic-incremental-devbuild` (`src/main/index.ts`), so it never shares the installed game's save.

### Loading

- `loadBestSave` (`src/game/save.ts`) tries the main save, then the backup. A missing file is not an error. Only a `SaveError` makes it fall back to the backup; any other error is thrown on. Any other error thrown while loading ends in the fatal box (`app.ts` `showFatal`) and nothing is written.
- A warning is shown only when a save file existed but could not be read: one text when the backup was loaded instead, another when a new game was started (`src/renderer/src/app.ts`). A missing main save with a good backup loads the backup silently. Whenever a file could not be read, `startGame` first calls `window.api.keepUnreadableSave` (`saveStore.ts` `keepUnreadable`, the web store the same under `bi:save.unreadable-<stamp>` keys), which copies the main and backup files to `save.unreadable-<timestamp>.json` / `.bak.json`; if that fails nothing is written. A new game therefore never destroys an unreadable save.
- `readSave` in order: parse the JSON, check the envelope, run the migrations, check the result against `serializedStateSchema`, rebuild the state with `deserializeState`.
- Every failure the loader detects is a `SaveError` with a code and a message safe to show the player (`src/game/saveError.ts`). A save from a newer format than this build knows is refused with `future-version` (`src/game/migrations.ts` `migrateState`).
- `deserializeState` starts from a new game and copies the saved values over it. Most ids the game does not have are dropped; `pity`, `inventory` and `combat.trialBest` are copied as saved.
- Card, Starlight shop and cosmetic levels, mastery tiers, stage chests, challenge completions and the depth layer are held within their limits; training and account levels and the camp level (at least 1) are copied as saved.
- Loadouts and dungeon presets keep only owned fighting cards, each once; camp slots keep only owned cards of the place's job (a card on one slot only) and a material that is in the game (a slot whose material left the game waits to be placed); the forge worker is an owned production card not on a slot; the Training ground's trial team keeps only owned fighting cards; a trip is kept when its card is owned and not on another trip, and its place and length still exist.

### Migrations

- `src/game/migrations.ts` `MIGRATIONS` holds one step per format change, keyed by the format it upgrades from. A step must return a new `state` object without changing its input (the contract on `MigrationStep`). `migrateState` runs the steps in order up to the current format.
- There is a step for every format from 1 upward, so format 1 is the oldest save still loaded.
- Steps work on the raw saved data and use snapshots of old game data (`src/game/migrationTeam.ts` for the 26 to 27 step), with one exception: the 37 to 38 step reads the live `src/data/content/web.json`, so a change to the web's nodes or their `absorbs` changes that migration.
- The 41 to 42 step (`v41ToV42`) builds the camp from the old trees, mines, tool lines and picks (level = min(40, 1 + floor(worth / 10)), worth = tree and mine levels + half the tool levels + 5 per pick that is not a Training pick; posted workers go to slots on their old material), refunds the autobuyer Starlight items (15 each), drops gauges, depth, tool lines, production presets and autobuyer switches, and adds the dummy. It reads no game data (it holds a snapshot of the slot table).
- `arrangeFormation` and `heirloomMigration` in `serializedStateSchema` are set only by migrations and used once while loading; the game never writes them.

### Export and import

- Settings copies the save to the clipboard or downloads it as a file, and imports a pasted string or a file (`src/renderer/src/pages/settings.ts`).
- The string is `BIv1:` plus the save text in base64 (`exportSaveString`). `importSaveString` runs the same checks and migrations as a normal load; the player confirms before it replaces the running game. An imported save starts at the current time: its `savedAt` is ignored, so an import gives no offline progress (`src/renderer/src/app.ts` `save.replace`).

### Tests

- `tests/migrations.test.ts` (runner, steps, a step for every format); `tests/save.test.ts` (round trip, bad saves, backup fallback, export/import, some older formats); `tests/saveV*.test.ts` and `tests/migrateV39.test.ts`, `tests/migrateV41.test.ts`, `tests/migrateV42.test.ts` (one step each; V42 is the starter pick offered once); `tests/summonChances.test.ts` covers the step to format 40: the Card Portal's pity counter is reset to 0 (it now counts toward a T6), `summon.firstTenPullDone` is true for a save with 10 or more Card Portal pulls, `summon.tierRewardsClaimed` starts empty, and tiers the save had already completed are paid when it loads.
- `tests/saveStore.test.ts` (desktop store), `tests/saveBackup.test.ts` (dev reset backup), `tests/webSaveStore.test.ts` (web store, browser API), `tests/devPaths.test.ts` (folders of a build run from source). Old-format saves: `tests/fixtures/saves/` and its `README.md`.

### Changing the save format

1. Change `serializedStateSchema`, `serializeState` and `deserializeState` in `src/game/save.ts`.
2. Raise `CURRENT_SAVE_VERSION` by one.
3. Add a step to `MIGRATIONS` keyed by the previous format number; without it older saves fail with `missing-migration` and `tests/migrations.test.ts` fails.
4. Add a test that loads a save of the previous format; a real one goes in `tests/fixtures/saves/` with a line in its `README.md`.

## Shell and table

The game has a header and, under it, two main screens that share one element, "the table" (`table.ts`): the hub (the default, a painted map of the base camp, see Hub) and the dungeon (the fight window; a "← Hub" button goes back, `Table.setScreen`). The dock is gone: its piles stay built but hidden, so their hints still feed the hub's "!" marks, and the hub's buildings open the views. Short paths in this section are under `src/renderer/src/`.

### Hub (`src/renderer/src/hub/`)

The hub is the main screen (DESIGN section 2, Base camp). `hub-wide-640x360.png` is the approved wide painted map, copied byte for byte and never altered. It fills the area under the header: shown at the scale that covers it exactly (`hubScale`: 3x at the 1920 x 1080 design size, a little more in a taller or wider design area; see UI scale), nearest neighbour, centred by `hubOffset` with the overflow cut evenly off the edges (mostly top rock and bottom wall), never scrolled. Each of the 13 places has an exact mask in `masks/<id>.png` (640 x 360, the place's pixels white, the rest transparent; copied byte for byte from the approved set). `hubModel.ts` (no DOM, tested in `tests/hubModel.test.ts`): `HUB_BUILDINGS` with each place's action (open a view, go to the dungeon, a small menu of views, or locked) and the views whose pile hints light its "!"; `hubScale`, `hubOffset`, `scaled`, `brighten` (x1.15 + 8, capped at 255) and `GLOW_GOLD` (#FFD66E). `hubMasks.ts`: reads the mask files (`loadMask`: alpha and box), the map's pixels (`loadMapPixels`) and builds the hover picture (`glowImage`: the place brightened and a one-map-pixel gold outline just outside it, no blur). `hub.ts` `createHub`: the click area of a place is a pixel test on its mask at the map's scale (`placeAt`); on mouseover (or Tab focus) a canvas over the map shows the hover picture and the place's name plate shows, both fading in and out in about 120 ms; a gold "!" comes from `pile.hint.ready`; a lock plate shows on the raid gate and the arena until their milestones (`sealWhy`); one invisible button per place (over the mask's box) gives Tab and Enter; a menu serves the places with several screens (Armoury and Trophy hall: Cards, Achievements; Training ground: Training, Upgrades); a Settings button sits in a corner. Selecting the dungeon entrance calls `Table.setScreen('dungeon')`. Styles `hub.css`.

### Start-up order

- `index.html` has an empty `#app` and loads `src/renderer/src/main.ts`.
- `src/renderer/src/main.ts` loads the fonts, runs `installLogCapture` (`settings/logBuffer.ts`), `installBrowserApi` (see Web build), `installMotionPref` (`settings/motion.ts`), `installDesignScale` (`ui/designScale.ts`, see UI scale) and `installPixelScale` (`ui/pixelFit.ts`), then, in a game build, dynamically imports `src/renderer/src/game-entry.ts` and calls `init()`.
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

- `contract.ts`: a view is a `ViewDef` (id, title, optional dock `pile`, `mount(host, ctx, api)` called once at start) returning a `ViewHandle` (`render()`, optional `opened` / `closed`). A `TablePieceDef` is a live table piece (`centre`, `left`, `right`) that opens a view; the dungeon window has `view: null` (it opens nothing: it is the one dungeon view). `TableContext` is what `app.ts` hands every view.
- `viewIds.ts` lists the fourteen ids (no `dungeon`: the dungeon is the table's second screen, not a view) (`training` and `expeditions` are new); `registry.ts` collects the four view packages and fixes the dock order (`DOCK`).

| Id                                           | Opened from                                  | Defined in                  | Drawn by                                                       |
| -------------------------------------------- | -------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `logging`, `mining`                          | building (forest, mine)                      | `views/gathering/index.ts`  | `views/gathering/camp.ts`                                      |
| `training`, `expeditions`                    | building (Training ground, Expedition board) | `views/gathering/index.ts`  | `views/gathering/training.ts`, `expeditions.ts`                |
| `forge`                                      | pile                                         | `views/gathering/index.ts`  | `views/gathering/forge.ts`                                     |
| `cards`, `summon`, `wardrobe`                | piles                                        | `views/collection/index.ts` | `pages/cards.ts`, `summon.ts`, `wardrobe.ts`                   |
| `skills`, `achievements`, `shop`, `settings` | piles                                        | `views/meta/index.ts`       | `pages/skills.ts`, `achievements.ts`, `shop.ts`, `settings.ts` |
| `upgrades`                                   | pile                                         | `views/meta/index.ts`       | `views/meta/upgradesView.ts`                                   |

- `table.ts` `createTable` builds the pieces, the dock and the view host. A click on a piece (outside its own controls) or its corner button opens the view; the hub has the `Screen` state and opens views from its buildings.
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

- `prefs.ts`: reduced motion, the autosave interval and the chosen duel speed (`duelSpeed`: 1, 2 or 4), in `localStorage` key `bi.ui`, not in the save. Set in the Settings view (`pages/settings.ts`).
- `motion.ts` applies it: `data-motion` on `<html>`, a wrapped `window.matchMedia`, and every `prefers-reduced-motion` CSS rule switched on or off (`motionRules.ts`).
- `cost.ts` (pure): `costText`, `hasCostArt`, `costLabel`. A price is shown once: a resource with a picture (Money's coins, and every resource with a kept icon: gems, Cores, Sigil, Dust, Shards, scrolls, Starlight) as its picture and the number, its name only in the tooltip and accessible label; one with no picture as the number and its name in words (none today).
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

- `index.ts`: the dungeon window, the only dungeon view, filling the whole area under the header (`table.css`: no wings, no side gaps) (there is no full-screen dungeon view and no expand button). It holds the duel element (`stage/arena.ts`, see Fights) with its own Challenge, auto and Speed controls, and the Dungeons, Weapon and Training buttons. Goals that point at the dungeons go to the dungeon screen (`app.ts` `goTo`).
- `stage/duelPace.ts` publishes the pace the duel's animations play at while a sped-up Challenge runs (`duelPace`, `paced`, CSS `--pace`); hits, numbers, boss hits and the cut-in follow it. The duel's Speed button (`data-key="arena-speed"`, in `stage/arena.ts`) cycles the open speeds; `app.ts` passes the choice in as `TableContext.duelSpeed`.
- The window's top left holds three buttons, Dungeons, Weapon and Training (`.dv-buttons`). Each opens its panel (built by `pages/dungeons.ts` `createDungeonPanels`, see Screens) as a sheet over the running fight; the same button, the back button or Esc closes it.
- `duelModel.ts`: hand layout and size (`HAND_SHARE`: a hand card is about 29% of the duel's height, in half steps of the art scale under the design-size zoom; `FOE_HAND_SHARE` keeps the enemy card's size), slot colours, enemy pips, feed lines, the right tab's rows (`readoutRows`: sorted by damage, `healthTone`), `bigHit`, skill plate queue; read by `stage/arena.ts`. The right tab is the fight readout (`.du-sheet`, `.du-row`: team health, then per card its sprite, health, DMG and HEAL bars, a total line; rows re-sort with a transform slide). A hit on one of our cards plays the soft rim (`hurtCard` in `stage/arena.ts`: a drop-shadow rim on the card body that follows the frame's alpha, an 8 px dip, brighter when `bigHit`; the red number is `.st-num--hurt`).

### `views/gathering`

- `index.ts`: the `logging` and `mining` views (the forest and the cave, `camp.ts`) the `forge` view, the `training` view (`training.ts`, `training.css`: the Training ground, layout A ("1a", 2026-11-27). There is no setup page: a full-width setup strip (`.trs`, about 112 px) sits under the header with the four trial slots (the card's sprite and name; a click opens a small menu of owned fighting cards; "Copy my loadout" beside the label; a first visit with nobody on trial copies the loadout), the dummy's hit presets (None to Very hard, the chosen one gold through `aria-pressed`, the damage value beside the label) and element chips (None and the five elements, each in its colour), then Restart (green) and Stop. Any change to the team, the hits or the element restarts the fight (`begin`); the screen opens already fighting. Below the strip the fight runs in a second `createArena` on the battle's throwaway state, with its own `createDirector` and a 50 ms timer that steps `stepTraining` at the open duel speed (`usableSpeed`, the same x1/x2/x4 as a Challenge; the arena's speed button is there, its Challenge, auto, doing and DPS buttons hidden); a restart clears the stage's This fight numbers (`Arena.resetLog`). The full-height Damage column on the right shows DPS over the last 10 s, time, best hit, damage the dummy dealt, each card's share (sprite, name, damage, bar, %) and Effects at work, redrawn about four times a second; a result card covers the stage when the fight ends. The typed damage number and the Training upgrades button are gone from this screen (the hub menu still opens the upgrades). The two plain blocks `.trb-stage` and `.trb-side` are what a restyle changes) and the `expeditions` view (`expeditions.ts`: the Expedition board, `createExpeditionsPanel`). The table has no side wings now.
- `camp.ts` (`createCampView`): the forest and the cave as a painted scene (`campScene.ts`: `forest-scene-640x360.png` / `mine-scene-640x360.png` in `scenes/`, and one 640 x 360 greyscale mask per node in `scenes/masks/`: oak, ironbark, moonwillow, copper, iron, grotto, copied byte for byte from the approved set), shown at the hub's scale rule (`hubScale`, `hubOffset`: the scale that covers the view exactly, 3x at the 1920 x 1080 design size, the overflow cut evenly; the node panels stand on the camp bar). Each node is lit by its mask (`loadNodeMask`, `glowImage` from the hub: a 1-map-pixel gold rim and brightening on hover or when selected; a locked node is grey and dimmed by `dimImage` with a lock plate saying which dungeon opens it; an active node shimmers faintly, still under reduced motion). At each node's foot: its slots (a tool card with its rate, or an empty slot) and, while a slot waits, a gold "Place here" tile on every open node (`placeSlot`); a slot tile opens the card picker (`workerPick.ts`, with "Take it off"). The bar at the bottom holds the camp level, its price, the raise button, the call to place new slots and the place's total. `campModel.ts` (no DOM, `campScreen`): each node's name, mask key, lock text, slots and rate. `.camp__scene` is the one named place for the picture.
- `forge.ts`: the Forge as the anvil stage (user picks 2026-11-23, Forge A): the approved painted forge (`forge-scene-640x360.png`, copied byte for byte) fills the stage at the scale that covers the space under the header exactly (3x at the design size), centred, the overflow cut evenly (`sceneUnit`). Over it: the recipes (a button per recipe in `production.json`, icons and amounts, a click starts or stops it, `setForgeRecipe`) and the worker card (`assignForgeWorker`, picked with `workerPick.ts` in an overlay) on the left, the progress plate at the top centre, and the out tray top right. While a craft is being made the worker's item swings over the anvil (CSS wind-up, hit, settle) with CSS sparks and a flickering glow on the furnace; each finished craft (the bar wraps, `craftFinished`) hops its resource icon into the tray (a view-only list of the last 14, `trayAdd`; nothing in the save). Placeholders until the art controller names pictures: the swing, sparks and glow are CSS, the ingot is the output's resource icon. Reduced motion stops the loops and the hop. `forgeStage.ts` holds the pure parts (`sceneUnit`, `craftFinished`, the tray; `tests/forgeStage.test.ts`).
- `workerPick.ts`: the tool picker of the Forge and of the camp's slots: each tool drawn as the Cards collection's card face (`cardFaceProps`, `createCard`) at a whole scale (`watchFit`); the current tool has the gold outline; the list scrolls.
- `jobModel.ts`: display helpers for the Forge (`craftsPerMinute`, `forgeFlow`, `itemSvg`).

### `views/collection`

- `index.ts`: the `cards`, `summon` and `wardrobe` piles; each view mounts its page (`pages/cards.ts`, `pages/summon.ts`, `pages/wardrobe.ts`, see Screens).
- `teamsModel.ts` `teamRows`: one row per dungeon with a remembered team, plus the dungeon being fought, for the Cards page.

### `views/meta`

- `index.ts`: the `skills`, `achievements`, `shop`, `upgrades` and `settings` piles. All but Upgrades mount a page from `pages/`.
- `upgradesView.ts`: one panel per group of `milestoneBoard` (only Training; one column) listing every line's milestones. A waiting pick shows two cards and a click picks one (`pickPerk`); a made pick shows its badge; one ahead shows both perks. A foot bar shows lifetime Money. Built by `upgradesModel.ts` `milestoneBoard`.

### The card face (`ui/card.ts`, `ui/cardFace.ts`, `pages/cardFaceModel.ts`)

`createCard(props)` builds every card (see Cosmetics and themes and Art code for its look). On a card:

- **Name**: one name, `cardDisplayName` (the weapon's item name for the card's tier), on the top plate (`.bi-card__head`).
- **Art**: the weapon picture (`item`), or a placeholder emblem when none is given.
- **Frame**: the kit from `art/frame.ts` `cardFrame`: `kit-<tier>` for Wood to Prismatic, the batch's kit for Mythic and Heirloom, and a starter weapon's own `kit-starter-<id>` at every tier. An Heirloom with a batch backdrop shows it behind a windowed kit.
- **Bottom banner** (`.bi-card__info`, only when a `face` is given): one line with the six star sprites, centred (the tier word is hidden under the tier kit with no border cosmetic worn), and an XP bar to the next level (full at the cap). There is no hit-speed line. The level is a **chip** (`.bi-card__lv`, `theme/base.css`, drawn in CSS in design pixels): the level big and white in the display font over a small "/cap", dark fill, gold edge, EXTERNAL: it hangs off the card's bottom-right corner (47 card units past the right edge, 61 x 37 units, sized as shares of the frame's outer box, as in the approved picture), and the rows and grids that hold cards leave that overhang free (the summon hand and reveal line add it to their gaps); no other level tag is drawn on a card; hidden on a card the player does not own and on a boss.
- **Stars**: six sprites, the first `rank.stars` lit; in the banner when there is one, else on the top plate.
- **Role and job**: not drawn. The job label is only in the card's accessible name; `.bi-card__job` is hidden in CSS.
- **Element**: no icon or text, and no effect on the art while `ELEMENT_FX` is off (see Element effects).
- `cardFaceModel.ts` `cardFaceOf(info)` supplies the face: level, cap and XP progress (no hit speed).

### The weapon panel (`ui/weaponPanel.ts`, `pages/weaponModel.ts`)

One component in two places: the dungeon view's Weapon panel (`drawer`: the weapon in an XP ring; tabs in `pages/dungeons.ts` switch between the fighting loadout's cards) and the Cards detail (`card`: a level badge on the card plus Tier and Card XP tiles). It shows level, XP, tier, stars, progress to the next star and what that star changes (multiplier, damage or output, health). For a card below 6 stars that is not an Heirloom the player can do exactly two things, both via `CardsModel.upgrade`:

- **Add star**, when the star bar is full (`starUp`).
- **Star with Star Dust**, offered when the bar is not full and at least 1 dust is held; shown disabled when the dust is not enough (`starUpWithDust`).

An Heirloom card and a 6-star card show no button, only the notes. The panel also lists what the next star changes (`starStats`); an Heirloom below 6 stars shows the `allStars` line text because it has no star bar.

There is no tier-up. A note says the weapon's tier is fixed (for an Heirloom: that its stars come from the Heirloom Gate, or that it is fully upgraded), plus a note while the next level is a breakthrough level. Built by `weaponModel.ts` `weaponView`. See Cards.

**Attacks** (DESIGN.md §2 Three attacks per card; `pages/movesModel.ts` `movesView`, `COPY.moves`): a list of the card's hit, skill and ultimate, each with its name, when it fires, its damage now (the card fighting alone before team effects: `soloCard` in `src/game/duel.ts`) and one line per effect (`effectText`). A skill with no slot at the tier, or not opened yet, carries a note. While the skill can be opened, its row shows the Cores (`costMarkup`, red when short) and **Open skill** (`openCardSkill` through the cards adapter's `upgrade(state, id, 'skill')`), disabled when short. They are the first entries of the panel's **What it does** list (below), not a block of their own. Read at most twice a second and redrawn only on change.

**Stats, What it does, What comes next** (read-only; `pages/weaponDetailModel.ts` `weaponDetail`, `COPY.weapon.detail`; `CardEntry.detail`): drawn by `ui/weaponPanel.ts` `renderDetail` in both places, beside the weapon (stats) and under it (the other two; in the drawer the body scrolls inside at 1280 × 720). Every number is `cardStatsFor` (the Cards tiles' numbers, ability modifiers only: a skill's own damage or health multiplier is not in them), which gained `hit` (damage of one hit, `hitDamage`; 0 for a worker).

- **The stat side** is drawn by `ui/weaponStats.ts` (+ `weaponStats.css`) in the layout the art controller drew and the user approved (2026-11-23), under the unchanged star ring and star line: a **power plaque**, a six-corner **stat graph** (ATK, ATK SPD, DPS, HP, CRIT, CRIT DMG), a chip row (role, position, element, cost, tier, XP), one **plaque per stat** (the six stat icons of `art/stat-icons/` through `art/statIcons.ts`, byte for byte; label "ATK · one hit", "DPS · average per second"; green "Lv +x%" and "★ +y%" gain chips from `DetailStat.up`), a **next-level plaque** (gain, XP bar, power gained) and the **skill rows** (hit, skill, ultimate, ability, team bonus, bonds: coloured edge, name, full sentence with numbers highlighted, effect chips, the Locked / Not at this tier state and the Open skill box). Every value is drawn in the game's own 5 x 7 pixel numerals (`ui/pixelValue.ts` over `art/pixelFont.ts`, an SVG at a whole device scale; never Pixelify, whose 5 reads as S). Moving the pointer over the next-level plaque or the star area switches the graph's dashed green after-shape between next level and next star (`weaponPanel.ts`).
- **Layout**: in the dungeon the ring (about 60% of its first size, the stars and the weapon at a whole scale unchanged) sits on one row with the power plaque and the stat graph (`.wp-hero`, `topEl` in `weaponPanel.ts`); the star line and button are a row under it; in Cards `topEl` sits above the stats. The stat plaques are three per row in the dungeon and two in Cards. At 1920 x 1080 (`--wzoom: 1.5` in `weaponStats.css`, a size multiplier since CSS `zoom` is banned by `tests/pixelScale.test.ts`) the Weapon sheet is 840 px wide and the stat side's text, numerals (`pixelValue`) and ring are 1.5 times as big and the stat icons 64 px. `stage/fly.ts` cuts the flying drops' layer where the open dungeon sheet is, so drops pass behind the panel.
- **Model** (`weaponDetailModel.ts`, tested in `tests/weaponDetailModel.test.ts`): `DetailStat` carries a `key` and `up`; `WeaponDetail.power` is `powerOf` = damage per second + a quarter of the health (a display sum, not a rule) with the power at the next star and the power the next level adds; `WeaponDetail.graph` has the six corners as shares 0 to 1 (the square root of the stat over the best card of the same tier at its level cap and six stars, floored at 0.08) now, after the next level and after the next star; a worker has none. `AttackRow.state` (`movesModel.ts`) is open, locked or none (no slot at the tier).
  The seals block (`ui/sealBlock.ts`) and the star and tier-up tag are unchanged. Tested in `tests/weaponDetailModel.test.ts`.

### Shared widgets (`ui/`)

- `buy.ts`: the ×1/×10/×100/Max toggle in each view head (kept in localStorage `bi.buyCount`, no save change) and the buy button, which always shows its label (Max with its count). `holdToBuy` repeats a buy while the button is held (`HOLD_DELAY_MS` 450, then every `HOLD_REPEAT_MS` 110) until release or nothing more can be paid; a click and the keyboard buy once. Used by `training.ts`, `upgradeRows.ts`; hold on the Training rows.
- `upgradeRows.ts`: "You hold" strip and a row per upgrade line with its buy button, what buying changes, and the milestone bar and line. Used by `training.ts`.
- `training.ts`: the Training panel (waiting pick, toggle, rows). Used by `pages/dungeons.ts`.
- `perkPick.ts`: a waiting milestone pick as two cards. Used by `training.ts`, `upgradesView.ts`.
- `hpStack.ts`: stacked enemy HP bars with "×N" left. Used by `stage/arena.ts`.
- `stars.ts`: star pips and text with "★" drawn as sprites. Used by Cards, `weaponPanel.ts`.
- **Hub pan**: cover can cut the hub map's sides or top and bottom in a window that is not 16:9, so `hub.ts` lets the player drag the map (pointer, past 6 px so a click is still a click) or use the wheel along the cut axis, clamped to the map's edges (`hubPanned`), starting centred; every one of the 13 places can be brought fully on screen.
- **UI scale** (`ui/designZoom.ts` pure and tested in `tests/designScale.test.ts`, `ui/designScale.ts` DOM): the whole UI, header included, is laid out at one design size, 1920 x 1080 CSS px, and shown through the Electron page zoom (`webFrame`, exposed by the preload as `api.getUiZoom` / `setUiZoom`; the user cannot zoom by hand, `setVisualZoomLevelLimits(1, 1)`). `installDesignScale` keeps the zoom at `designZoom` = `min(windowW / 1920, windowH / 1080)` on every resize, so a 16:9 window shows exactly the 1920 x 1080 layout shrunk or grown (1280 x 720 = 2/3) and any other window gets a design area larger than 1920 x 1080 on one side, never an empty band (layouts flex, painted scenes cover it with a fractional scale). Pointer coordinates, `getBoundingClientRect`, canvases and hit tests all stay in the same design px, so nothing needs correcting. While the zoom is on, `screenDpr()` is 1 (the clean-pixel code works in design px); art pixels may be uneven at in-between window sizes (accepted). The phone / browser build has no page zoom and keeps the screen's real ratio. The app frame (`html`, `body`, `#app`, `.shell`) is `overflow: clip`, so nothing can scroll it, and every `.focus()` in the renderer passes `{ preventScroll: true }` (a focus on a control past the frame's edge had scrolled the frame and pushed the header up); `scripts/check-ui-no-jump.mjs` proves it and `scripts/shoot-ui-scale.mjs` shoots the screens at several window sizes.
- `pixelScale.ts` (maths), `pixelFit.ts` (DOM): keep pixel art at whole device pixels; `fitCard` sizes card hosts (`step: 0.5` lets the duel's hand take half scales under the design-size zoom); `watchFit` keeps a list of cards at a whole scale as it resizes (Cards page, Forge worker picker). Used wherever cards show.
- `pixelNumbers.ts`: draws `.bi-num` numbers in the equipped Number cosmetic's pixel font (`art/pixelFont.ts`). Installed by `app.ts`.
- `resourceIcons.ts`: a resource's icon. Every resource but Money has a kept 32 x 32 icon, `hand/res-<resource id>.png` (user, 2026-11-22), listed in `KEPT_ICONS`; `keptIconMarkup(id)` draws it, `resourceIconMarkup(resource)` is the one call (kept icon, else Money's coin), and Money keeps its coin ladder (`moneyCoinArt`). Used by `app.ts` (header and Details chips), Details, Summon, arena, `resourceArt.ts`, `forge.ts`, the shop (supply lines, Starlight prices) and the Dungeons drop rows. The Achievements tooltip draws a resource reward with it. Icons show at 1x (32 CSS px, a negative margin keeps text lines as tall as before), never shrunk. Gems no longer show their mastery coin (`gemCoin` is only the Skill tree and mastery art now); the Starlight skin of the Wardrobe still shows on the shop's Ascension ring only. Still in words: reward and welcome-back lines, toasts, quest and trip rewards, challenge rewards. Old `res-summon*`, `res-glamour*` and `shop-sup1` to `5` sprites have no caller.
- `resourceIcons.ts`: a resource's icon. Used by `app.ts`, Details, Summon, arena, `resourceArt.ts`, `forge.ts`.
- `resourceArt.ts`: a resource's picture for prices. Used by `upgradeRows.ts`.
- `costMarkup.ts`: one or more prices drawn side by side by the rule in `settings/cost.ts`. Used by the Training upgrade rows and the paid respec button (`pages/skills.ts`). The header, "You hold" strips, Summon pull buttons and shop price chips already drew picture and number.
- `skillArt.ts`: skill node gems and the star chart in the equipped nodes style. Used by `pages/skills.ts`, `pages/cards.ts`.
- `webGlyphs.ts`: placeholder icons for skill web nodes. Used by `pages/skills.ts`, `pages/heirloomsMap.ts`.
- `art/goldIcons.ts`: the gold icons (`art/icons-gold/`, 64 px): the nine dock plaques (`DOCK_ICON` in `table/table.ts`), Goals, Details and the sound button; the header's Money and scroll chips use the resource icons.
- `skins.ts`: the worn UI-skin style; Starlight coin and shard icons. Used by `app.ts`, Achievements, Shop, Wardrobe.
- `cosmeticSwatch.ts`: a small sample of one cosmetic. Used by Wardrobe, Summon, `shell/rewardTrack.ts`.
- `keepScroll.ts`: keeps scroll and focus across a rebuild. Used by Cards and Wardrobe. `keepAncestorScroll` does the same for a panel that sits inside a scroller it does not own (the weapon panel in the dungeon sheet); `check-scroll-keep.mjs` also covers the dungeon's Weapon, Training and Dungeons sheets.

## Screens

`src/renderer/src/pages/` holds the screens and panels that the views mount. A screen is usually a drawing file `<name>.ts`, its styles `<name>.css` and one or more `<name>Model.ts` files with the display logic that tests cover (`tests/<name>Model.test.ts`). Not every screen has all three, and some files are shared helpers. The models hold display logic only (`slotChoices` mirrors the loadout cap and Heirloom limit to tag a picker; the game enforces them).

### Cards (`cards.ts`)

- Mounted by the `cards` view (`views/collection/index.ts`). It reads the game only through `CardsModel` (`cardsModel.ts`, filled by `cardsAdapter.ts`).
- Page width: `.shell-page--cards` (`cards.css`) has no `max-width`, so it fills the window beside the detail panel. The collection grid is `auto-fill` columns at a fixed card size: `COLLECTION_FIT_MAX` (`cards.ts`) caps the width the card scale is picked at, so a wider window adds columns of the same size, never bigger cards.
- Four tabs: Collection, Heirlooms, Loadouts, Bonds. Bonds mounts `createBondsPanel` (`tablePanels.ts`). The Expeditions tab moved to the Expedition board.
- **Collection.** Filter chips by job, by role (Tank, DPS, Support) and "Ready n" (a star can be taken). Sort: Tier, Stars, Level, Name. The grid lists every card that is not an Heirloom: "Your cards (n)" first, then the cards not found, grouped by weapon type with a collected count.
- **Detail panel.** Heading: the name, then "tier · job" (plus the slot name when the card is in the loadout). An owned card shows the weapon panel (`ui/weaponPanel.ts`, see Views and shared widgets), the skin picker (`cardSkinsModel.ts`, `setCardSkin`), stat tiles (`statsModel.ts`) and fact tiles. Buttons on an owned card: Enhancements (when the card has a chart: `cardEnhancements`, `chooseEnhancement`, `resetEnhancements`), Add to loadout (fighting cards not in the loadout) or Remove from loadout (cards in it) (`setLoadoutSlot`); Logging and Mining cards show a hint that they work from the Production page. See Cards.
- **Heirlooms.** The Heirloom cards by weapon type with their shard bars (`heirloomEntry`); a type's group wraps when it holds three or four cards. The detail shows the card with its tree's six nodes (`heirloomTreeInfo`): a click buys an affordable node (`buyHeirloomNode`), Respec clears the tree (`respecHeirloomTree`). See Heirlooms and batches.
- **Loadouts.** The fighting loadout only: a cost meter against the cap (`loadoutInfo`) and four slots named Back left, Front left, Front right, Back right. A click on a slot opens a picker of the owned fighting cards with cost and a tag (in this slot, swap, over the cap, Heirloom limit; `slotChoices` in `cardsModel.ts`); picking calls `setLoadoutSlot`. Cards can also be dragged (`pages/loadoutDrag.ts`, pointer events, wired in `cards.ts`, its CSS at the end of `cards.css`): slot to slot moves or swaps, picker to slot places, out of the frame empties the slot, Esc cancels; the drag only asks the page model to place or remove, and the game's `setLoadoutSlot` does the move or swap in one `setLoadout` call, so a refused drop shows the game's own reason in the status line (`.cp-status`). Tested in `tests/cards.test.ts`. Below: the team each dungeon remembers (`teamRows`, `views/collection/teamsModel.ts`).
- **Names and labels.** A card has one name, `cardDisplayName` (see Cards). Tier words come from `TIER_LABELS`, `tierLabel` and `gradeLabel` (`src/game/cards.ts`): Wood, Bronze, Silver, Gold, Prismatic, Mythic or Void, Heirloom. The screen writes no rarity word (Common, Rare, Epic): `rarity` in this code is the card's colour style (`cardStyle`), and the sort keyed `rarity` is labelled "Tier".
- Helpers: `cardFaceModel.ts` (`cardFaceOf`) and `loadoutCards.ts` (`cardItemArt`, `loadoutProps`, `cardFaceProps`: card faces for other screens).

### Summon (`summon.ts`, model `summonModel.ts`)

Mounted by the `summon` view (`views/collection/index.ts`).

- **Layout (the three doors).** Top: the Card Portal, Focus Portal and Heirloom Gate side by side as doors (`DOOR_ORDER`, `buildDoor`): the art controller's 160 x 160 pictures in `art/summon/doors.ts` (closed, and open while the pointer or focus is on the door), shown at a whole scale (`doorPx`: 2x on a page 1000 CSS px wide or more, else 1x), the name, one line on what it pulls (`doorAbout`), and its own Pull 1 and Pull 10 with the scroll's sprite and one cost (`portalInfo`, `pull`; `heirloomGateInfo`, `pullHeirloomGate`), disabled when it cannot be paid. The Card Portal door also carries "Hunting: ..." (marked wishlist cards); the Focus Portal door has a button per item type (`focusKinds`, `setFocusKind`); the Heirloom Gate door has its own Pity bar and keeps its Pull 10. A click on a door's picture selects it (`openGate`): what "More" shows below follows it.
- **The strip** (one panel under the doors, always the Card Portal's, which the Focus Portal shares): the level bar "Portal level n" with "pulls / next", "Your first ×10 holds a Gold or better" until that 10-pull is made, the T6 pity bar "count / threshold" with "A T6 card within n pulls", "Chances now" (a swatch, the tier and its chance per tier, `PortalView.odds`) and the Tier collection check boxes (`tierBoxes`, from `tierProgress`: a box per tier, lowest first, ticked once its reward is paid; the count and the reward "+scrolls · +n% damage" are in each row's tooltip).
- **More from the portals** (below the strip): Daily scrolls with Claim (`dailyAvailable`, `claimDaily`; amounts in `scrolls.json` `daily`), then the other gates as rows that open one at a time: the `cosmetics` portals (a locked "Wardrobe Gate" if none) and the `skins` portals, each with its old deck of card backs and its pity. On the right, the selected gate's content: the Wishlist and the odds table for a card door, the odds for a cosmetic or skin gate, the board of the 11 Heirlooms (`heirloomRows` in `pages/summonModel.ts`, with a second row "Wildwood II", key `wildwood#2`) for the Heirloom Gate, and "Your last hand". See Summon and pulls.
- A pull opens the reveal (`stage/reveal.ts`, see Stage effects) and fills "Your last hand": up to ten results. The Wardrobe and Legacy gates have no door art: their pulls open the Card Portal's door (`doorKeyOf`).
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

Layout: the shard tiles (`.shop-tiles`, `shop.css`) are `auto-fill` columns of 230 px, centred, and the lone Market counter fills the width, so a wider window shows more tiles per row at the same size. Mounted by the `shop` view (`views/meta/index.ts`), opened from the hub's Market. One counter, the Shard shop: the items of `achievements.json` `shardShop`, paid in card shards (`state.cards.shards`): Card copies, Supplies (resource bundles) and Exclusive (cosmetics), some with limited stock (`shardShop`, `buyShardItem`); view data from `achievementsModel.ts`. The Starlight shop and the Ascension gate left it for the Ascension screen.

### Ascension screen (`ascension.ts`, `ascension.css`, model `ascensionModel.ts`)

Mounted by the `ascension` view (`views/meta/index.ts`), opened from the hub's Shrine (its menu: Skill web, Ascension; `hubModel.ts`). Goals and quests that point at Ascension use the page `ascension` (`GOAL_PAGES`). Three panels filling the view, in the shell's panels, tiles and buttons with pixel numerals (`bi-num`):

- **What this Ascension gives** (`gateView`): the Starlight gain with its two parts (materials; floors climbed and bosses beaten), the multiplier now and after ("x2.1 → x2.8"), the faster line (`preview.faster`, `landmark`), the guaranteed prizes and cosmetics, a lock line until Frostspire Vault is cleared, then the Ascend button with confirm, a gate-walking sweep and a done panel (`ascensionPreview`, `ascend`).
- **What changes**: Kept and Starts over lists (`ASCENSION_PERSISTS`, `ASCENSION_RESETS`) and the challenges panel (`challengesPanel.ts`, see Challenges and trials).
- **Unlocks**: the Starlight shop (`starlightShop`, `buyStarlightItem`, `starlightViews`): level, description, effect now and next, a fill bar and the price.

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

### Dungeon panels (`dungeons.ts`, `dungeonMap.ts`, `dungeonMapModel.ts`, `dungeonsModel.ts`)

- `createDungeonPanels` builds three panels that the dungeon window (`views/dungeon/index.ts`) opens as a sheet over the running fight, from its Dungeons, Weapon and Training buttons.
- **Dungeons: the winding map** (`createDungeonMap` in `pages/dungeonMap.ts`, styles in `dungeonMap.css`; DESIGN.md §2 Dungeons). Left: one plate per dungeon (a window cut from its boss picture at 1x, the stage count, "Stage 8 of 20", a Finished or Locked tag) and the trials. Middle: the picked dungeon's scene (`art/dungeon-map/map-<name>.png`, drawn at the whole scale that covers the pane, `sceneScale`) with the road of stage stops over it, scrolling when long (it opens on the stage to beat): beaten stops are gold with a tick, the stop to beat is red with the team's banner and "Your team", the rest are grey and carry their number, the mini-boss and boss are framed pictures with a caption. The four difficulty badges sit at the top right (`setDifficulty`), the active one outlined, each with its loot in its tooltip. Right: the selected stage, its enemy, Fight (`pickDungeon`, then `startFloorChallenge` on the stage to beat), the boss's elements (`bossElements`), the drops of that stage on that difficulty with the loot of the difficulty (`effectiveDrops`, `difficultyDrops`, `stageLoot`) and the rare item's pity on the boss's stage, and the overflow switch of a boss or mini-boss stage. A trial shows its rewards instead. The stage counts are the dungeon's floors; a stop is beaten when its floor is at or below the best floor (`floorPosition`).
- `dungeonMapModel.ts` is the pure side, tested in `tests/dungeonMapModel.test.ts`: which stages are shown (`shownRange`, a window of 30 in the endless depths), their states (`pathStops`), a plate's progress (`plateProgress`), the road's layout in rows of five (`layoutRoad`), the studs that stop short of each stop (`studsBetween`), the scene scale and which scenes are light (a dark plate under the title).
- **Weapon.** The weapon panel (`ui/weaponPanel.ts`) of a card in the fighting loadout, switched by tabs. **Training.** `createTrainingPanel` (`ui/training.ts`).
- `dungeonsModel.ts` feeds the duel (`stage/arena.ts`): `barsGone`, `healthPercent`, `challengeButton`, `challengeVerdict`. `bossElements` gives the panel's element line: the boss's element, what it is weak to and what it resists.

### Settings (`settings.ts`, `settingsModel.ts`)

- Mounted by the `settings` view (`views/meta/index.ts`). Four panels: Display (the reduced-motion switch), Sound (`sound/controls.ts`), Save and Help.
- Save: autosave interval, export to the clipboard or a `.txt` file, import from pasted text or a file. Import checks with `importSaveString` and replaces the game only after a confirm that compares both saves (`saveSummary`). See Saves.
- Help: a button that opens a prefilled GitHub issue (`settings/issueReport.ts`), and the credits from `credits.json`.

### Panels and models without a page of their own

- `production.ts`: only the `PageContext` type (content, `state()`, `apply()`) the screens take.
- `forgeModel.ts`: `forgeView` for `views/gathering/forge.ts`.
- `buyModel.ts`: `BuyLineView`, `buyLabel` (used by `upgradeRowModel.ts`), and `formatRate` for the duel. `bestLine` is unused.
- `upgradeRowModel.ts`: `upgradeRow`, `upgradeRows` shape one repeatable line (a Training line) for `ui/upgradeRows.ts`; `upgradeLineName` for `ui/perkPick.ts` and the Upgrades view. The before and after for n levels come from the game's `lineEffect` and the next milestone from `nextLineStep` (`src/game/lineView.ts`); the model only formats them: `delta` (the signed gain), `scope` ("after 10 levels"), `says` (the whole sentence for the tooltip and aria label) and `nextTip` (what each pick of the next milestone does). Tests: `tests/upgradeRowModel.test.ts`.
- `tablePanels.ts`: `createBondsPanel` and `createExpeditionsPanel` (the Bonds tab of the Cards screen and the Expedition board). See Expeditions.
- `challengesPanel.ts`: the Ascension challenges list in the Ascension screen (`ascension.ts`) with Start (clicked twice; `startChallenge`) and Leave (`leaveChallenge`). See Challenges and trials.
- `ascensionModel.ts`: `gateView`, `starlightViews`, `rewardView` for the Ascension screen. See Ascension.
- `accountModel.ts`: `levelBadge` (header level and XP bar), `trackView` (reward track), `levelUpView` (level-up toast), for `app.ts` and `shell/rewardTrack.ts`.
- `progressionModel.ts`: `goalRows`, `questRow` (Goals popup, `app.ts`, `shell/quest.ts`), `medalTip`, `tierUpText`. `detailsModel.ts`: `detailsView` for the Details panel (`shell/details.ts`).
- `statsModel.ts`: `statTiles` for the Cards detail (via `cardsAdapter.ts`). `welcomeModel.ts`: `welcomeCards` for `stage/welcome.ts`.

## Stage effects

`src/renderer/src/stage/` holds the duel and the effects over the screens. They only show; none changes the game state.

- **`director.ts`**: `createDirector`, built in `app.ts`, which calls `afterStep` after every game step. It turns the step's `TickReport` into show events: `duel`, `bossAttack`, `knockout`, `challenge`, `kill` (heard by the arena) and `harvests` (heard by the job view). It also emits `signature` and `harvestBurst` from the step, and two timers (`start()`) emit `hit` (one per the lead card's interval) and `harvest` (once a second); nothing listens to these four. Except `duel`, nothing is sent while the window is hidden.
- **`arena.ts`**: `createArena`, the card duel, created in `views/dungeon/index.ts`. It draws the hand, the enemy card, the hit feed, the stat sheet, the Challenge buttons and the Victory or Defeat banner. On director events cards hop, a slam flashes and shakes, damage numbers pop, loot coins fly to the header and a rare drop gets a toast. See Fights.
  - On a `duel` event every signature (strike, heal or buff) queues the card's special attack (`enqueueSpecial`, `pumpSpecials`): one at a time in firing order, the next when `waitMs` allows. A card has at most one waiting (a newer one takes its place) and at most `SPECIAL_WAIT_MAX` (4) wait; a replaced or dropped one keeps only the hop. The dim holds one level across the queue. The skill plates (`du-plates`) are screen-reader only. CRIT! and BREAK! are stamps placed by `stampSpot` (BREAK! upper, CRIT! lower, `STAMP_GAP`), a new one replacing the one of its kind. The queue and stamp maths are pure in `specialQueue.ts` (`queueSpecial`, `stampSpot`), tested in `tests/specialQueue.test.ts`. While it plays the enemy's damage tag holds its value (`tagHeld`, `showTag`); as the hit lands the tag shows the new total and pops, and the signature's feed line pops (`is-landed`, `arena.css`). A burst without a special pops the tag too. The arena dims (`is-special`) all but the source card and the enemy.
- **`specialAttack.ts`**: `createSpecialAttack(host)` gives `play`, `busy`, `cancel` and `waitMs` (time until the next may start). One canvas over the duel at 25 frames a second in whole-pixel steps: stage dim, slanted cut-in with the weapon and the skill's name, wind-up, lunge, impact frame, the drawn hit sheet with the weapon swiping along it, shake (`shake(el, 'heavy')` for heavy weapons), settle. The weapon is the card's own sprite, only moved, scaled and rotated. The sheet player (`sheetFrame`, `recoloured`, `sheetImage`) plays a drawn sheet from `art/fx/`, recoloured to the material. 300 ms cooldown; a hidden window cancels it; under reduced motion (`calm`) no slide, lunge, shake, flash or particles. `playCutIn(host, req)` plays only the cut-in on its own canvas (used by the summon reveal; null without an element effect).
- **`specialData.ts`**: the data the special attack plays. `WEAPON_MOTIONS`: one motion per fighting weapon type (sword, greatsword, dagger, spear, lance, hammer, scythe, bow, staff; axe and pickaxe have none, they never fight): strokes, poses, weight, its `sheet` and `elementSheet`. `HIT_SHEETS` (one drawn hit per type), `ELEMENT_SHEETS` (one drawn slash per element), `MATERIAL_EFFECTS` (Wood to Prismatic) and `ELEMENT_EFFECTS` (the five elements). `effectOf(tier, element)` picks the material's effect from Wood to Prismatic, else the element's (Mythic and Heirloom); `hasSpecial(kind, element, tier)` says whether a card has one. `ELEMENT_SHEETS` has fire, light, earth and dark (dark plays the void slash); water has no drawn slash and plays the code-drawn hit in the old crystal colours. Tested in `tests/specialElements.test.ts`.
- **`arenaBackground.ts`**: `backgroundFor` maps a dungeon's `background` id to one of six painted 640 x 360 pictures (`stage/bg/`; the Challenge trial uses the Void Hollow's, the training dummy sets `mossy_cellar` and wears its own straw-dummy picture `foe-training_dummy` (the boss's `sprite`, shown like any enemy picture); Raids play on their own panel, not on this stage). `stageScale` and `stageBox` give the scale that covers the duel exactly (3 at the design size), centred, overflow cut evenly; `arena.ts` `fitScene` sets them and `--ar-s`. The enemy card is the hand card's 132 x 186 rectangle at 1.25x the hand card's height, at most 116 px per stage scale (`--du-foe-want`, `--du-foe-w`), so every window size shows the 1920 x 1080 look (UI scale); the hand wants 34% of the duel height (a whole scale); the enemy sprite stands at the bottom of its card, feet above the health bar, at the largest whole scale its drawn pixels (72% x 77% of the frame) fit (`fitFoe`); the two bright pictures add a dark plate behind the left info (`.ar--bright`); a knocked-out hand stays opaque and darkens (`.du-card__grey`).
- **`bossHitModel.ts`**: maths only: the screen-edge pulse before a boss slam (`edgeStrength`), each hit's place on the health bar (`bossHitShows`), the "You fall in" banner (`fallBanner`).
- **`numbers.ts`**: `popNumber`, `popGain`: floating numbers of the duel and the job views, capped, quick gains on one spot merged. Their look follows the equipped number and tick cosmetics.
- **`fly.ts`**: `flyCoins` flies copies of a header chip's glyph to that chip. Used by the arena, the job view and the welcome overlay.
- **`reveal.ts`**: `showReveal`, the summon reveal (the three doors): a modal whose stage holds the pulled gate's door (closed, then open), a mark "Best of this pull: <tier>" and a glow on the door that show the best tier before any card moves (`bestOfPull`), and a line of the pulled cards along the bottom at 1x (overlapping to fit ten). Ordinary cards fly out of the door with transform and opacity only, the ten of a pull through in about a second; a T6 (Mythic or Void) or a whole Heirloom stops everything and plays the cut-in of the special attack (`playCutIn` in `specialAttack.ts`: the same slanted band, large weapon, tier line and name as the duel's, an axe or pickaxe borrowing the sword's timing), then its card flies in. The timeline is `revealTimeline` (`FLY_MS`, `CUTIN_MS`). Skip (button, click, Space, Enter, Escape) shows the end at once; then Pull again (when it can be paid) and Continue. Reduced motion shows the end at once, with no flight and no cut-in; the speed button's speeds do not apply. Called by `pages/summon.ts`, and by `pages/shop.ts` for a shard purchase. See Summon and pulls. The old "Fan Deck" (card backs dealt, orbs, per-card flips, full-screen entrance) and `revealCircle.ts` are gone.
- **`toast.ts`**: `toast`, short messages in one live region, three at most. `holdToasts(true/false)` queues toasts while the summon reveal is open; they show in order after it closes.
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

- `art/pixel/sprites/` holds every sprite (1,558 PNGs). `art/pixel/hand/` holds the 868 sprites the bake copies into `sprites/` unchanged (pictures made outside the game and the output of the scripts listed under Scripts and data), plus `outlines.json` (outlines of card items). The rest is 37 sprites baked from vector code and 653 cosmetic sprites (`cos-*`, see Cosmetics and themes).
- The file name is the key. Counts by prefix in `sprites/`:
  - `item-` 208: weapons, 100 x 120. `item-<type>-t1` to `-t5` (11 types x 5 tiers = 55), `-t6m` and `-t6v` (22), `-heirloom` (11), `item-<type>-leviathan-t6m|t6v|heirloom` (33), `item-<type>-wildwood-t6m|t6v|heirloom` and `item-dagger-wildwood-heirloom-alt` (34), `item-<type>-hm-<letter>` and `-hv-<letter>` (45 recoloured Heirlooms, 13 of them recoloured again with PixelLab on 2026-11-22, see `docs/ASSET_RULES.md` section 5), 6 other bow and maul pictures, 2 motion strips.
  - `skin-` 37 (weapon skins, 19 stills and 18 strips), `evo-` 9.
  - `kit-` 15: card kits, 212 x 256. `frame-` 4.
  - `foe-` 43, all 160 x 172 stills with no idle strip: 13 PixelLab stills and the 25 mini-boss and boss redraws (2026-11-23, copied from `design/options/mini-bosses/approved/`) and 5 raid bosses; no asset-pack figure is left (see `docs/ASSET_RULES.md` section 5). `boss-` 3: the Crystal Sentinel and its two shards.
  - `bg-` 5, `bgfish-` 64, `bgbig-` 16: Heirloom backdrops and their fish.
  - `coin-` 36, `tile-` 30, `medal-` 5, `plaque-` 10, `edge-` 15, `money-` 16, `res-` 25, `star-` 11, `shop-` 10, `badge-` 332.
- `art/shell/stone/` (34 PNGs) and `art/shell/oak/` (15 PNGs and `pieces.json`) hold the table's pieces; see Shell and table.
- `art/fx/` holds the 16 drawn sheets of the special attack (see Stage effects): `hit-<weapon>.png` for sword, greatsword, hammer, scythe, staff, lance, dagger, spear and bow, recoloured per material from Wood to Prismatic; `slash-<element>.png` for fire, storm, light, nature, earth, crystal and void, played on Mythic and Heirloom by the sword and the scythe. Since the five elements only fire, light, earth and `slash-void` (for dark) are played; storm, nature and crystal stay unused.

### Asking for a picture

- `art/pixel/sprites.ts`: `sprite(name)` returns the URL, native size and outline, or undefined when there is no such file. `spriteImage` gives an SVG `<image>`. `strip(name)` finds the motion strip `<name>-anim`; `animatedSpriteImage` and `animatedSpriteHtml` play it, or show the still when there is none.
- `art/pixel/manifest.ts` (`MANIFEST`) lists every sprite's size, the outline of card items and the frame count of animated ones. It is generated by `scripts/art/bake-pixels.mjs`. `art/pixel/badges.gen.ts` and `art/pixel/cosmetics.gen.ts` are generated files too; do not edit them by hand.
- Weapons, `art/items.ts`: `cardTierArt(card, tier?)` is the call a card makes. It picks the type's picture for the tier, the Mythic or Void one at T6 by the card's side, and at T6 and Heirloom the card's batch picture or its own `heirloomArt` letter. `itemBoxSprite(name)` draws any 100 x 120 sprite in the 200 x 240 item box with its hidden outline; its branch for pictures 300 px wide or more matches no item, skin or evolution sprite.
- Card kits, `art/frame.ts`: `cardFrame(tier, batchKit, windowed)` draws the one picture holding frame, name plate, art window and banner. `kitName` picks `kit-<tier>` up to Prismatic and the batch's kit (`batches.json` `kit`) at T6 and Heirloom, plus `-window` (window cut out) for an Heirloom with a backdrop. A starter weapon wears its own `kit-starter-<id>` (`baseKitOf` in `game/theme.ts`, five hand kits, 212 x 256) at every tier.
- Icons, `art/gems.ts`: `gemCoin`, `treeTile`, `mineTile`, `navPlaque`, `masteryMedal`. `forgedEdge` has no caller in the game.
- Foes, `art/foes.ts`: `foeHtml(id, scale)` draws a still as one frame (`hasFoeSprite` needs only the still); an idle strip, if one is ever added, would play with CSS `steps()`. `art/foeFit.json` holds a whole-pixel nudge [dx, dy] per still that centres it and stands it on the ground line (row 166), so the files stay as approved. An enemy with no picture gets `placeholderHtml`: the `foe-hooded_rogue_assassin` silhouette in one dark colour with a "?" from the pixel font; dropping `hand/foe-<id>.png` and baking gives the enemy its picture. No enemy shows the placeholder today. A boss with no `sprite` in `dungeons.json` uses `foe-<boss art id>`. Mini-boss pictures come from `dungeon.miniBosses` by id (`stage/arena.ts`). `art/bosses.ts` `bossArt(art, level)` draws the one baked boss, the Crystal Sentinel, with aura and specks (`hasBossSprite`); the three dungeon bosses' vector drawings stay in `art/vector/bosses.ts`, no longer baked. See Fights.
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
- The old per-element pixel-scale check script is retired: the window scale is the page zoom now (UI scale), so art is whole at the 1920 x 1080 design size only and uneven at in-between window sizes by decision. `tests/pixelScale.test.ts` keeps testing the pure maths and the CSS guard that cards scale only through `--card-k`; the maths runs at `dpr` 1 in the design space.

### Scripts and data

- `scripts/art/`: `bake-pixels.mjs`, `cosmetics-gen.mjs`, `cosmetics/` (bake); `cut-pack.py`, `foe-zoom.py`, `make-slime.py` (foes); `make-badges.py`, `make-money-crystals.py`, `make-stars.py`, `make-shine.py`, `heirloom-recolours.py` (other hand sprites); `shoot-*.mjs` (screenshots); `picker.mjs` (picker page); `recraft-generate.mjs` (trials), `cut-learn.py` (style references for the pixel-art skill).
- `scripts/shell-art/`: `oak.py` draws the oak pieces; `cut.py` cuts the stone pieces using the `stone*.py` specs.
- `src/data/content/shellArt.json` lists each stone piece's file, size and slice, read by `theme/apply.ts`. `credits.json` lists asset packs and licences, shown in Settings.
