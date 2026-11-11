# Plan: the table update (everything approved, one release)

User, 2026-11-11: everything approved in any chat ships together, as one release (0.7.0). This doc is one-use: the release PR into `main` deletes it.

## Scope

Done means all of these are in the game:

1. **Every `[To build]` and `[Differs]` rule in `docs/DESIGN.md`** on this branch is built and tagged `[Built]` (or `[Default · in game]`). That includes stage battles (farming and Challenge, auto-challenge), each enemy with its own HP, a boss that dies once, the first-person card duel with a team of 4, training paid in gems, summon scrolls, the Focus Portal, the reveal show, loadout presets, bonds, expeditions, Ascension challenges, the Legacy Gate and tier looks.
2. **The UI rework:** motion E ("dealt from the deck"), layout 1a ("one table, no pages"), the dungeon as the focus, the table of mockup 4a. Mockups: `design/options/ui-layouts/` in the main checkout (untracked). The full views come from the picker the user answers; until then no UI package starts.
3. **The resource art** of PR #143 (currency icons, tier 4 tree tops), merged into this branch.
4. **The itch asset packs** (enemies, bosses, coins, crystals, achievement badges, credits): its own approved plan, `itch-assets.md`, built on this branch once the user has copied the packs.

Nothing approved is "later". If a package finds an approved thing missing from this list, it tells the orchestrator.

## Rules for every package

1. Branch from `feat/table-update` in your own worktree; open a PR **into `feat/table-update`**, never `main`. Do not merge: the orchestrator merges, one PR at a time.
2. Touch only the files your package owns (below). If you need a change elsewhere, make the smallest one and say so in the PR.
3. **Save format 27 for the whole release.** Package 1 bumps it and writes `v26ToV27`. Nobody bumps again; later packages extend that migration.
4. New numbers are placeholders tagged `[Default]`; package 12 tunes them. Keep `npm run sim` running.
5. Docs in the same PR: `docs/PROJECT_OVERVIEW.md` for every `src/` change, and the tags of the rules you build in `docs/DESIGN.md` (rewrite rules in place, no amendment sections).
6. Logic stays out of the UI and is unit tested. Content lives in data files with schemas. Numbers use `break_eternity.js`. Results must not depend on how time is split into ticks.
7. Mechanics packages (1 to 6) add only plain working controls in today's layout; the UI packages replace the layout. Do not redesign screens in a mechanics package and do not change rules in a UI package.
8. Verify before reporting: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and a screenshot for anything visible (not committed). CI must conclude green on the PR.
9. No release, no version bump, no tag, except package 13.
10. Do not delete this plan doc, except package 13.

## Packages

| #     | Package                                                                                                                                                                                                                     | Wave        | Model  | Owns                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | --------------------------------------------------------------------------- |
| 1     | Foundation: save 27, all new state and interfaces                                                                                                                                                                           | 0           | Opus   | `src/game/save.ts`, state types, migrations, schemas for new content files  |
| 2     | Stage battles: farming and Challenge, auto-challenge, offline, own HP, boss dies once                                                                                                                                       | 1           | Opus   | `src/game/combat*`, `floors.ts`, offline for dungeons                       |
| 3     | Summoning: scrolls, Focus Portal, reveal show logic                                                                                                                                                                         | 1           | Sonnet | `src/game/summon*`, `portals.json`, crystal prices and rewards              |
| 4     | Training in gems, Legacy Gate, tier looks, and every other `[Differs]` rule not named in another package                                                                                                                    | 1           | Sonnet | training, legacy, tier art wiring                                           |
| 5     | Presets, bonds, expeditions                                                                                                                                                                                                 | 1           | Sonnet | new files `presets.ts`, `bonds.ts`, `expeditions.ts` and their content      |
| 6     | Ascension challenges                                                                                                                                                                                                        | 1           | Sonnet | new file `challenges.ts`, Ascension screen controls                         |
| 7     | Card duel rules: team of 4, own health and skill per card, roles by weapon type                                                                                                                                             | 2 (after 2) | Opus   | the fight model on top of package 2                                         |
| 8     | Table shell: one table, piles, full views, motion E, header                                                                                                                                                                 | 3           | Opus   | renderer shell, routing, shared CSS and motion                              |
| 9a–9d | Views on the table: (a) dungeon window and the duel's look, (b) gathering wings with workers, depth, tools, forge, (c) Cards, Summon with the reveal show, Wardrobe, (d) Skill Tree, Achievements, Shop, Upgrades, Settings | 4 (after 8) | Sonnet | one view folder each                                                        |
| 10    | Art: PR #143 and the itch assets plan                                                                                                                                                                                       | 1 to 4      | Sonnet | `design/`, sprites, `credits.json`, arena sprites (after 9a for the wiring) |
| 11    | Sim learns the new rules                                                                                                                                                                                                    | 5           | Opus   | `scripts/sim/`                                                              |
| 12    | Balance run, short sims only                                                                                                                                                                                                | 6           | Opus   | numbers in data files, §14                                                  |
| 13    | Release 0.7.0                                                                                                                                                                                                               | 7           | Sonnet | version, this doc, PR into `main`, tag                                      |

Package 1 writes the exact interfaces into this doc (state shapes, keys, derived values) before wave 1 starts, as in the balance update.

## What the orchestrator checks before the release

- `docs/DESIGN.md` has no `[To build]` and no `[Differs]` left, or each one left is named to the user with the reason.
- A screenshot of every screen of the new UI, shown to the user in the chat, at 100% and 150%.
- The game is played from a new save and from a 0.6.0 save.
