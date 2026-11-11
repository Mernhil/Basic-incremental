# The balance update — implementation plan

> **For the sessions that build this:** you are one of several sessions working at the same time. Read "Rules for every package" and your own package before anything else. Inside your package, plan your own tasks and work test-first (write the failing test, see it fail, make it pass, commit).

**Goal:** build everything `docs/DESIGN.md` gained on 2026-11-11 (commit "Design: the balance update") and ship it as one release.

**Spec:** `docs/DESIGN.md` on this branch. Every rule tagged `[To build]`, `[Differs]` or `[Default]` with the date 2026-11-11 is in scope; the changelog line of 2026-11-11 (§17) lists them. The spec wins over this plan; a gap is filled in place as `[Default]` and listed in §16, never asked of the user mid-build.

**Architecture:** one long branch, `feat/balance-update`. Twelve packages in six waves. Packages in one wave own different files and run at the same time; a wave starts only when the wave before it is merged. One save format, 26, for the whole release.

**Tech stack:** Electron, TypeScript, electron-vite, vitest, zod content schemas, `break_eternity.js`.

## Rules for every package

1. **Branch.** Your worktree is already cut from `feat/balance-update`; do not make another worktree and never touch the main checkout at `C:\Basic Incremental`. After `npm ci`, run `node node_modules/electron/install.js` once.
2. **Pull request.** Open your PR **into `feat/balance-update`**, never into `main`. Do not merge it. When CI is green, end your turn with the PR number; the orchestrator merges PRs one at a time. If the orchestrator asks, merge `origin/feat/balance-update` into your branch, fix conflicts, and wait for CI again. Never force-push.
3. **Your files.** Each package lists the files it owns. Change a file you do not own only when your package cannot work otherwise, keep that change as small as possible, and list it in the PR under "Outside my files".
4. **Save format 26.** The foundation package bumps the save to 26 and adds every new state field. Nobody bumps it again: if you need another field, add it to the format 26 migration and to "Interfaces" below, and say so in the PR.
5. **Numbers are placeholders.** Put every new number in `src/data/content` behind its schema, pick a sensible first value and move on. Package 11 tunes all of them. Do not spend time on balance.
6. **Keep the sim alive.** `npm run sim -- --hours 2 --seeds 2` must still run after your PR. Teach the sim player the least it needs (package 10 does the rest).
7. **Docs in the same PR.** Update the entries of `docs/PROJECT_OVERVIEW.md` you change, flip the `docs/DESIGN.md` tags of the rules you build (`[To build]` or `[Differs]` becomes `[Built]`; a `[Default]` you build becomes `[Default · in game]`), and update `docs/UI_RULES.md` for any UI change.
8. **UI.** New screens are plain working screens in today's layout and pixel-frame style, built from existing widgets. No new art, no PixelLab, no redesign: the one-table redesign is a separate job.
9. **Verify before you report.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and for UI a screenshot of the running app (`scripts/shoot-*.mjs`, `BI_PROFILE=<your package>` so dev apps do not share a save). Report what you ran and what failed.
10. **Logic stays out of the UI**, game numbers use `Decimal`, content lives in data files, and time-split invariance holds: online, offline and any split of time give the same totals (the existing tests show how).
11. **No release, no version bump, no tag.** Package 12 does that.

## Interfaces

Built by package 1 (save format 26). This section is exact: every later package learns the state from here. Everything below is exported through `src/game/index.ts`. Nothing reads these fields yet; each package that builds a system starts reading and writing its own.

**Save format 26.** `CURRENT_SAVE_VERSION = 26` in `src/game/save.ts`. Nobody bumps it again in this update (rule 4): a package that needs another field adds it to `state.ts` (type, initial value, `clone*`), to `serializedStateSchema`, `serializeState` and `deserializeState` in `save.ts`, and to `v25ToV26` in `migrations.ts`, then lists it here.

**`GameState` (`src/game/state.ts`), new fields:**

| Field                      | Type                                                                                       | New game                                                                                                                                                             | Ascension (`resetProduction`, `ascend`) |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `production.workers`       | `Record<string, string[]>`: tree or mine id → card ids working it, in slot order           | `initialWorkers(content)`: each logging and mining start card on its job's first tree / mine, today `{ oak: ['apprentice_feller'], copper_quarry: ['cave_digger'] }` | kept                                    |
| `production.harvestGauges` | `Record<string, BurstGauge>` (`{ gauge: number; timer: number }`): tree or mine id → gauge | `{}` (missing = empty gauge)                                                                                                                                         | reset to `{}`                           |
| `production.tools`         | `Record<string, number>`: tool line id → level                                             | `{}` (missing = level 0)                                                                                                                                             | reset to `{}`                           |
| `production.depth`         | `Record<string, DepthProgress>`: tree or mine id → `{ layer: number; progress: Decimal }`  | `{}` (missing = layer 1, nothing broken); `layer` is 1-based, `progress` is hardness broken on that layer                                                            | reset to `{}`                           |
| `production.forge`         | `ForgeState`: `{ recipe: string \| null; progress: Decimal; worker: string \| null }`      | `initialForge()` = `{ recipe: null, progress: 0, worker: null }`                                                                                                     | kept                                    |
| `cards.wishlist`           | `string[]`: marked card ids, in the order marked, owned or not                             | `[]`                                                                                                                                                                 | kept                                    |
| `combat.stageKills`        | `Record<string, number>`: stage key → kills on that stage, ever                            | `{}`                                                                                                                                                                 | kept                                    |
| `combat.stageChests`       | `Record<string, number>`: stage key → star levels whose chest is paid, 0..6                | `{}` (missing = 0)                                                                                                                                                   | kept                                    |
| `combat.overflow`          | `Record<string, boolean>`: stage key → overflow switch on                                  | `{}` (missing = off)                                                                                                                                                 | kept                                    |
| `automation` (top level)   | `AutomationState`: `{ treeLevels: boolean; mineLevels: boolean; reservePercent: number }`  | `initialAutomation()` = `{ treeLevels: false, mineLevels: false, reservePercent: 0 }`; `reservePercent` is 0..100 of the Money held                                  | kept                                    |

Types and helpers exported from `state.ts`: `DepthProgress`, `ForgeState`, `AutomationState`, `initialForge()`, `initialAutomation()`, `initialWorkers(content)`; `cloneState`, `cloneProduction`, `cloneCombat` and `cloneCards` copy every new container.

**Stage keys (`src/game/floors.ts`).** `stageKey(dungeonId: string, difficulty: Difficulty, floor: number): string` returns `"<dungeonId>:<difficulty>:<floor>"`, for example `"mossy_cellar:normal:10"`. `parseStageKey(key: string): StageRef | null` reads it back as `{ dungeonId, difficulty, floor }` and returns null for anything `stageKey` cannot have written (wrong part count, unknown difficulty, floor not a positive integer without leading zeros). `Difficulty` is `'normal' | 'hard' | 'nightmare' | 'endless'`; stage stars use the first three (DESIGN §6), and the key format accepts `endless` so overflow on the depths can use it if package 3 wants it. The text is saved, so changing it needs a migration.

**Loading a format 26 save (`deserializeState`).** Unknown dungeon ids and keys that are not stage keys are dropped from `stageKills`, `stageChests` and `overflow`; a chest count above 6 becomes 6. Unknown tree and mine ids are dropped from `workers`, `harvestGauges` and `depth`. A worker is dropped when the card is unknown, not owned, of the wrong job (a logging card works trees, a mining card works mines) or already working somewhere else (the first place in save order keeps it); an empty list is dropped. `forge.worker` is kept only for an owned card that works nowhere else. Unknown cards and repeats leave the wishlist. `tools` and `forge.recipe` are kept as saved: there is no content to check them against yet (package 6 adds that check when it adds the content). Slot counts are not enforced on load: they are derived, so package 4 checks them.

**Resource.** `star_dust` in `resources.json`: name "Star Dust", kind `material`, tier 3, starts at 0. As a material it is reset by an Ascension today (`ascend` resets every resource that is not `crystal` or `prestige`), which matches DESIGN §9 as written ("Money and materials start again"); package 2 or 9 changes that only if the design says so.

**Migration 25 to 26 (`v25ToV26` in `src/game/migrations.ts`).** Reads only the save, never the content (snapshots: first tree `oak`, first mine `copper_quarry`, Normal floors 10 / 20 / 30 / 40 / 50 / 60 for the six dungeons).

- `cards.loadouts.logging.main`, if any, becomes `production.workers.oak = [main]`; `cards.loadouts.mining.main` becomes `production.workers.copper_quarry = [main]`. Supports are not moved. A job with no main card gets no worker.
- `bursts.logging` is copied to `production.harvestGauges.oak` and `bursts.mining` to `production.harvestGauges.copper_quarry`, only when that job got a worker and the gauge is not empty (`gauge` or `timer` above 0).
- Each `combat.kills[dungeonId] > 0` of the six dungeons becomes `combat.stageKills["<dungeonId>:normal:<last floor>"]`; other ids (the Glimmer Trial) are skipped.
- `cards` is untouched (stars, tiers, levels, star bars, loadouts) apart from `wishlist: []`.
- `production.tools = {}`, `production.depth = {}`, `production.forge = { recipe: null, progress: '0', worker: null }`, `combat.stageChests = {}`, `combat.overflow = {}`, `automation = { treeLevels: false, mineLevels: false, reservePercent: 0 }`. No chest counts as paid, so package 3 decides what the star levels earned by migrated kills pay.
- The old fields stay and the game still reads them: `cards.loadouts.logging` / `.mining` and `bursts.logging` / `.mining` (package 4 removes them and their reads), `combat.kills` and `mastery.bossTiers` (package 3 removes the medals). A package that removes one of them deletes it from `serializedStateSchema` too; the format stays 26, because zod strips unknown keys on parse, so a format 26 save that still holds the removed field loads fine.
- `tests/fixtures/saves/v25-dev-tools.save.txt` is a real format 25 save written by the 0.5.5 code; `tests/migrations.test.ts` loads it.

**Derived, never saved:** worker slots (2 plus one per Ascension, up to one per tree and mine, plus second slots from the Starlight shop), skill points (account level plus stage star levels plus achievements), which weapon circles are open (from the tiers of the owned cards of that item type), star levels of a stage (from `stageKills` and the kill counts in `combat.json`).

## Waves and packages

| Wave | Package                     | Model  | Owns                                                                                                                                                                       |
| ---- | --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | 1 Foundation                | Opus   | `state.ts`, `save.ts`, `migrations.ts`, `resources.json`, this section "Interfaces"                                                                                        |
| 1    | 2 Cards from the start      | Sonnet | star, tier and look code in `cards.ts`; `cardRules.json`; `art/items.ts`; shard shop; `scripts/sim/rarity.ts`                                                              |
| 1    | 3 Stage stars and overflow  | Opus   | `combat.ts`, `floors.ts`, `drops.ts`, `mastery.ts` (medals), `combat.json`, `dungeons.json`, the Dungeons page                                                             |
| 1    | 4 Workers                   | Opus   | `production.ts`, `harvest.ts`, `productionView.ts`, loadout code in `cards.ts`, the Production page, `loadoutCards.ts`, the Loadouts tab, production cards in `cards.json` |
| 1    | 5 Skill tree engine         | Sonnet | `account.ts` (tree and levels), `account.json`, the Skill Tree page                                                                                                        |
| 2    | 6 Production mechanics      | Sonnet | the production files of package 4, `production.json`, `trees.json`, `mines.json`, `upgrades.json`                                                                          |
| 2    | 7 Fighting depth            | Sonnet | fighting cards in `cards.json`, crit, gauge and element code in `combat.ts`, the card stat tiles                                                                           |
| 2    | 8 Wishlist and enhancements | Sonnet | `portals.ts`, `portals.json`, the Summon page, enhancement code in `account.ts`, `enhancements.json`                                                                       |
| 3    | 9 Ascension and Starlight   | Sonnet | `prestige.ts`, `prestige.json`, autobuyers in `tick.ts`, the Shop page                                                                                                     |
| 3    | 10a Tree content and goals  | Sonnet | skills in `account.json`, `achievements.json`, `progression.json`, `goals.ts`, `achievements.ts`                                                                           |
| 4    | 10 Sim                      | Opus   | `scripts/sim/`                                                                                                                                                             |
| 5    | 11 Balance run              | Opus   | every number in `src/data/content`, DESIGN §14 and §16                                                                                                                     |
| 6    | 12 Release                  | Sonnet | version, plan doc removal, the PR into `main`                                                                                                                              |

### 1 Foundation (wave 0, alone)

- Bump `CURRENT_SAVE_VERSION` to 26; add every field of "Interfaces" with its initial value, `cloneState`, save and load; write the 25 to 26 migration and its tests in `tests/migrations.test.ts` (one old save per migration rule above).
- Export `stageKey` and `parseStageKey`; add `star_dust`.
- Nothing reads the new fields yet: the game plays exactly as before, and the sim prints the same milestones for the same seeds.
- Rewrite "Interfaces" with the real names and types.
- **Done when:** all checks pass, an exported 0.5.5 save loads, and "Interfaces" is exact.

### 2 Cards from the start (wave 1)

DESIGN §5: Stars, Stars get dearer by tier, Star bar, Star dust, Weapon looks, Base damage, Star fill in the shard shop.

- `applyFreeStars` and the zero-cost stars go; a new card is Wood ★1 at every rarity; old saves keep their stars.
- `cardRules.json` `starBar`: the cost of a star in copies per rarity **and tier** (a fraction at low tiers, 1 at the card's top tier). Star dust pays for the missing part of a star (`starUpWithDust`), priced by rarity and tier.
- `lookTier` and `itemName` follow the card's tier; Gold keeps the interim art.
- Rarity ratios 1 / 1.6 / 2.5 / 4 / 7 / 12 for damage and health; `scripts/sim/rarity.ts` still passes, and now also checks that a fresh Legendary beats a maxed Common.
- The shard shop sells copies of every card, priced by rarity.
- **Tests:** a fresh Mythic is Wood ★1 with the wooden item name; a copy fills by the tier's cost and the rest carries; dust tops up a star and is refused when short; a format 25 save with free stars keeps them.
- **Do not touch:** loadout functions in `cards.ts` (package 4), `combat.ts`.

### 3 Stage stars and overflow (wave 1)

DESIGN §6: Stage stars, Overflow, Enemies do not grow with Ascension, Harder modes pay more.

- Every mini-boss and last-floor boss is a stage. Count kills per `stageKey`; six star levels at 1, 10, 100, 1,000, 10,000 and 100,000 kills (`combat.json`). A new level pays its chest once (crystals, bigger per level and per tier; star dust from Gold up), gives +5% damage on that stage and better loot there. The boss medals and their bonuses go; migrated kills count.
- Overflow: leftover damage is lost unless `combat.overflow[key]` is on, and the switch exists only from Silver. On wave floors it follows the next stage below. Push and farm both obey it. Time-split invariance must hold with it on and off.
- `hpScalingPerPrestige` and its purse growth go.
- Harder modes pay more: wage, Cores and card XP get a per-tier multiplier in `combat.json` `difficulties` so each tier pays more per second of everything than the one below for a loadout that farms it; add a test that states exactly that for a loadout strong enough to one-hit both.
- Dungeons page: the star level and kills to the next on the stage line, the overflow switch, and a plain stage map (dungeon by tier by stage) with claimed chests.
- **Do not touch:** crit, gauge and element code beyond what stars need (package 7), `cards.ts`.

### 4 Workers (wave 1)

DESIGN §4: Workers, Worker slots, Worker abilities, Workers play the field, Harvest burst; §5 Loadouts, Cost.

- Logging and mining have no loadout. `assignWorker(state, content, producerId, cardId | null)`; a card works one place; slots are derived (2, plus one per Ascension, at most one per tree or mine until package 9 adds second slots).
- A tree's or mine's output = its level rate × its worker's power (rarity, level, tier, stars); no worker means the plain level rate. Strike rhythm from the card's interval; harvest crits from the card; one harvest gauge per worker.
- Each of the 14 production cards gets one worker ability in `cards.json` in place of main and support effects; production enhancements and the two support shelf upgrades are reworked to match.
- Production page: each row shows its worker card (click to pick, as the Loadouts tab does today) and its gauge; the Cards page Loadouts tab keeps fighting only; Home panels follow.
- The sim player assigns its best cards to its best trees and mines.
- **Do not touch:** star, tier and look functions in `cards.ts` (package 2), `combat.ts`.

### 5 Skill tree engine (wave 1)

DESIGN §10: Skill tree, Branches (the six existing ones), Hidden weapon circles (engine), account level cap.

- No level cap: the curve continues past 50 and the reward track repeats a reward every 5 levels.
- Skills have ranks, a ring and a kind (small, large, keystone); a ring is open when the Ascension count reaches it. Skill points are derived: account level + stage star levels + achievements. Respec as today.
- Circles: a circle per item type, hidden until a card of that type reaches Gold, with steps at Prismatic, Mythic or Void and the Heirloom. Build the engine and one worked example circle (sword); package 10a writes the rest.
- Rebuild the six existing branches on one skeleton (about 15 skills each, ranks included) generated from a small table in `account.json`, not written by hand one by one.
- Skill Tree page: pan and zoom, rings, dim outlines for hidden circles, rank counters.
- **Do not touch:** enhancement code in `account.ts` (package 8).

### 6 Production mechanics (wave 2, four PRs in order)

DESIGN §4: Tool lines, Depth and growth, The forge, Lucky strikes.

1. Tool lines: per job, yield, strike speed, crit chance, crit damage; built on the Training pattern (`training.ts`, `bulk.ts`).
2. Depth and growth: layers and ages with a hardness the worker's damage breaks; each layer multiplies the yield; shown on the row.
3. The forge: recipes in data (gems to star dust among them), a worker slot, progress per second by the worker's power.
4. Lucky strikes: a timed bonus target on a worked tree or mine; the economy uses the expected value so offline matches.

### 7 Fighting depth (wave 2)

DESIGN §5 Show the stats, Weapon identities; §6 Elements in combat. Use the identity table and the element defaults as written, all six bosses.

### 8 Wishlist and enhancements (wave 2)

DESIGN §7 Wishlist; §5 Level, Weapon skills, Earlier and wider.

- A pull of a marked card's rarity lands on a marked card of that rarity; rates, pity and the guarantee do not change. The Summon page gets the marking UI.
- Enhancements open from Bronze, with new options unlocked at milestone levels.

### 9 Ascension and Starlight (wave 3)

DESIGN §9: What Ascension means, More to buy with Starlight; §15 autobuyers. Reset tool lines and depth; second worker slots; autobuyers for tree and mine levels with an on / off switch and a reserve.

### 10a Tree content and goals (wave 3)

The five new branches (Workers, Forge, Elements, Dungeons, Ascension) and the eleven weapon circles on package 5's skeleton; achievements and goal rules for stars, workers, the forge, the wishlist and the tree; more gem mastery tiers; the cost cap's top value.

### 10 Sim (wave 4)

The sim player uses every new system well: wishlist, star dust, overflow, tool lines, depth, forge, tree points, autobuyers. It reports the hours to a maxed weapon and keeps the band check.

### 11 Balance run (wave 5)

`npm run sim -- --hours 40 --seeds 20` against DESIGN §14, plus the 200 hours for a maxed weapon; every `[Default]` number of 2026-11-11 gets its value; the ladder retune of Scope 3 phase 9, the Starlight formula and Training are part of it. Results go in the PR and in §14 "On target".

### 12 Release (wave 6)

Merge `main` into the branch, run every check, screenshot every new screen, delete this file, bump the version to 0.6.0, open the PR into `main`, wait for CI, squash-merge, tag `v0.6.0` and confirm the GitHub Release.

## What to watch in review

- An old save: stars kept, the main production cards working, medals turned into star kills, nothing lost.
- Overflow off must not slow a push to a crawl on long dungeons; one hit per floor is the floor.
- A tree or mine with no worker, a card removed from a worker slot by a tier-up or a respec, and a slot count that drops never leave a broken assignment.
- Skill points are derived, so a respec or a migration can never leave more ranks bought than points earned.
- Offline progress: workers, lucky strikes, the forge and autobuyers give the same totals as the same time played online.
