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

The foundation package creates these and replaces this section's "planned" shapes with the real names. Every later package reads them from here.

Planned state, save format 26 (`src/game/state.ts`):

- `production.workers: Record<string, string[]>` — tree or mine id to the card ids working it.
- `production.harvestGauges: Record<string, BurstGauge>` — tree or mine id to its worker's harvest gauge (replaces the logging and mining entries of `bursts`).
- `production.tools: Record<string, number>` — tool line id to level; reset on Ascension.
- `production.depth: Record<string, { layer: number; progress: Decimal }>` — tree or mine id to its layer or age; reset on Ascension.
- `production.forge: { recipe: string | null; progress: Decimal; worker: string | null }`.
- `cards.wishlist: string[]` — marked card ids.
- `combat.stageKills: Record<string, number>`, `combat.stageChests: Record<string, number>` (star levels already paid, 0 to 6) and `combat.overflow: Record<string, boolean>`, all keyed by `stageKey(dungeonId, difficulty, floor)` exported from `src/game/floors.ts`.
- `automation: { treeLevels: boolean; mineLevels: boolean; reservePercent: number }`.
- Resource `star_dust` in `resources.json`.
- Derived, never saved: worker slots (2 plus one per Ascension, up to one per tree and mine, plus second slots from the Starlight shop), skill points (account level plus stage star levels plus achievements), which weapon circles are open (from the tiers of the owned cards of that item type).

Migration 25 to 26: each production job's main card becomes the worker of that job's first tree or mine; the old harvest gauges move to that worker; `combat.kills[dungeon]` becomes the stage kills of that dungeon's Normal last floor; cards keep the stars they have; everything else starts empty.

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
