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

## Interfaces

Written by package 1 (save format 27). Every piece below is saved, loaded, cloned and validated, and is **inert**: no rule reads it yet, so the game plays exactly as 0.6.0 (the sim prints the same tables). Types live in `src/game/state.ts`, the on-disk shape in `serializedStateSchema` (`src/game/save.ts`), the step in `v26ToV27` (`src/game/migrations.ts`), its tests in `tests/saveV27.test.ts` with a real 0.6.0 save, `tests/fixtures/saves/v26-0.6.0.save.txt`.

How to extend:

- **Nobody bumps the format.** If you change or add saved state, change the type, `serializedStateSchema`, `serializeState` / `deserializeState`, `cloneState` (or the clone helper) and `v26ToV27` together, and add a case to `tests/saveV27.test.ts`. Unknown ids are dropped on load (`deserializeTableUpdate` in `save.ts`), so a rule may trust every saved id.
- **Removing an old field** (`mode`, `loadoutDamage`, the crystals): drop it from the type and from `serializedStateSchema` (zod strips unknown keys on load), and say so in your PR.
- Everything kept through Ascension unless the line says otherwise: `ascend` spreads the state, so a field is kept until the owner resets it there.

### Stage battles (package 2)

| State                             | Shape                                                                           | Meaning                                                                                                                                                                           | Owner |
| --------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `combat.floors[d].tiers[t].best`  | number (exists since format 24)                                                 | The best floor beaten on dungeon `d`, difficulty `t` (`normal`, `hard`, `nightmare`, `endless`). Unchanged.                                                                       | 2     |
| `combat.floors[d].tiers[t].floor` | number (exists)                                                                 | Becomes **the floor being farmed** (today: the floor being fought). Ascension still halves it.                                                                                    | 2     |
| `combat.floors[d].autoChallenge`  | `boolean`                                                                       | The auto-challenge switch of dungeon `d`. New dungeon entry (`initialProgress`): `true`. Migration: `true` where `mode` was `push`, `false` where it was `farm`. Replaces `mode`. | 2     |
| `combat.floors[d].mode`           | `'push' \| 'farm'` (exists)                                                     | Still read by today's push and farm. Package 2 removes it.                                                                                                                        | 2     |
| `combat.challenge`                | `{ dungeonId: string; difficulty: Difficulty; elapsedSeconds: number } \| null` | The running Challenge; `null` = farming. On load a Challenge in an unknown dungeon becomes `null`. Reset it on Ascension and when the active dungeon or difficulty changes.       | 2     |
| `combat.challengeWaitSeconds`     | number ≥ 0                                                                      | Seconds left before auto-challenge retries after a loss ([Default] 60 s). One wait for the active dungeon.                                                                        | 2     |
| `combat.enemyIndex`               | integer ≥ 0                                                                     | Index in the floor's wave (`floors.ts` wave order) of the enemy being fought; the ones before it are dead. With it, `bossHp` becomes **that enemy's HP left** (null = fresh).     | 2     |
| `bossHp`                          | `Decimal \| null` (exists)                                                      | The migration sets it to `null`, so a 0.6.0 save starts its floor fresh and no pooled HP is read as one enemy's HP.                                                               | 2     |

Derived, never saved: the Challenge floor (`best + 1` on the challenged difficulty; on the last floor of a tier there is nothing to challenge until the next tier opens), the Challenge timer length ([Default] 30 / 45 / 60 s by floor kind, data in `combat.json` when built), win and loss reasons and the enemy HP left (report only, `TickReport`), the Victory banner, "a boss dies once" (a view of the HP bars).

### Card duel (package 7)

| State               | Shape                     | Meaning                                                                                                                                                                                  | Owner |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `combat.cardDamage` | `Record<cardId, Decimal>` | Damage each team card's own health has taken; missing = full health. Only owned fighting cards are kept on load. Replaces `combat.loadoutDamage`, which today's shared pool still reads. | 7     |

Derived: **the team** is the fighting loadout in order, `cards.loadouts.fighting.main` then `supports[0..2]` (the loadout already has exactly four slots; the [Default] "first four cards" is all of it), skipping empty slots. A card's max health is its `cardStats` health (shared in equal parts per the [Default] if package 7 keeps it); **knocked out** is `cardDamage[id] ≥ max health`; the fight is lost when every team card is out; roles come from the weapon type (data in `items.json` or `cardRules.json`, package 7's choice).

### Summoning (package 3)

| State                                         | Shape                  | Meaning                                                                                                                                                                                                                                                       | Owner |
| --------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `resources.summon_scroll`                     | Decimal (resource)     | Summon Scrolls, kind `scroll` in `resources.json`, `keptOnAscend`, `startAmount` 1 (the free pull). Migration: `floor(summon_crystal / 300)`.                                                                                                                 | 3     |
| `resources.glamour_scroll`                    | Decimal (resource)     | Glamour Scrolls, kind `scroll`, `keptOnAscend`. Migration: `floor(glamour_crystal / 300)`.                                                                                                                                                                    | 3     |
| `resources.summon_crystal`, `glamour_crystal` | Decimal (exist)        | **Still held after the migration**, because today's portals pay with them. When package 3 moves the portals to scrolls it changes `v26ToV27` to drop them (and removes the crystal wage, `startAmount` 300 and the crystal kind's checks in `data/index.ts`). | 3     |
| `summon.focusKind`                            | `string \| null`       | The Focus Portal's item type, an `items.json` type `kind` (`sword` … `logging_axe`); `null` = none chosen. An unknown kind is dropped on load.                                                                                                                | 3     |
| `summon.dailyClaimedDay`                      | `"YYYY-MM-DD" \| null` | The local day the daily scroll reward was last claimed.                                                                                                                                                                                                       | 3     |

Derived: the Focus Portal's pity is the Card Portal's counter (`portals.card_portal`), its price and rates the Card Portal's ([Default]); the Focus Portal itself is a `portals.json` entry or a view of the Card Portal (package 3's choice, no state either way). "First win of a Challenge floor" pays when `best` rises, so it needs no flag. Reveal show: nothing saved ("your last hand" stays in memory). The scroll kind is hidden in the UI today (no `GROUP_OF` entry in `detailsModel.ts`, not a header resource); `KIND_ICON` and `ICON_BY_KIND` map it to the crystal icon.

### Training in gems, Legacy Gate, tier looks (package 4)

No new state. Training levels stay `combat.training`; the gem prices are data (`training.json`). The Legacy Gate's pity is `portals.legacy_gate` (exists), its skins `legacySkins` (exists), and whether it is open is the portal's `enabled` in `portals.json`. Tier looks are art keyed by the card's tier (exists).

### Presets, bonds, expeditions (package 5)

| State                     | Shape                                                                                                                                    | Meaning                                                                                                                                                                                                                                                                                                 | Owner |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `presets.dungeons`        | `Record<dungeonId, CardLoadout>`                                                                                                         | The fighting loadout each dungeon (or the Glimmer Trial) remembers; missing = none saved. On load a slot holding an unknown, unowned, non-fighting or repeated card is emptied.                                                                                                                         | 5     |
| `presets.production[job]` | `job` is `'logging' \| 'mining'`; always `PRESETS_PER_JOB` (3) entries of `{ name: string; workers: Record<placeId, cardId[]> } \| null` | Named worker presets per job; `null` = empty slot. On load places of the other job and cards not owned or of the other job are dropped. A preset over the cost cap is flagged when used, not here.                                                                                                      | 5     |
| `discoveredBonds`         | `string[]` (bond ids, discovery order)                                                                                                   | Bonds triggered at least once (the Codex shows the rest as silhouettes). Unknown ids and repeats dropped on load.                                                                                                                                                                                       | 5     |
| `expeditions.trips`       | `{ cardId: string; placeId: string; hours: number; elapsedSeconds: number }[]`                                                           | Trips under way. `hours` is one of `expeditions.json` `durationsHours`; done at `elapsedSeconds ≥ hours × 3600`. Advance it by play time **and the whole time away** (outside the offline cap). On load a trip of an unowned card, an unknown place or length, or a card already travelling is dropped. | 5     |

Derived: a bond is active while both its cards are in the fighting loadout (or, for production pairs, work the same job; package 5 decides and writes it in DESIGN); the expedition slots (1 + account tree + Starlight shop); which places are open (their dungeon is in `clearedDungeons`); whether a card is on a trip (it is in `trips`), which equipping and the worker picker must check. Content: `bonds.json` (`{ id, name, cards: [a, b], modifiers }`, the three [Default] bonds, ready to read through `collectModifiers`), `expeditions.json` (`{ durationsHours, places: [{ id, name, dungeon, element }] }`; package 5 adds the rewards to the schema). `Content.bonds`, `bondById`, `expeditions`.

### Ascension challenges (package 6)

| State                             | Shape                         | Meaning                                                                                        | Owner |
| --------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| `ascensionChallenges.active`      | `string \| null`              | The challenge id the current run is under; `null` = a normal run. Unknown ids dropped on load. | 6     |
| `ascensionChallenges.completions` | `Record<challengeId, number>` | Completions, 1..`MAX_CHALLENGE_COMPLETIONS` (3); missing = 0. Unknown ids dropped on load.     | 6     |

Derived: the next target is `targets[completions]`; the rewards are `rewards[0..completions-1]`; Auto-Ascend is open when every challenge has at least one completion; a challenge is available after the first Ascension (`prestigeCount ≥ 1`). Content: `challenges.json`, empty, schema `{ id, name, rule: string, targets: [{ dungeon, difficulty, floor }] × 3, rewards: modifier[][] × 3 }`; package 6 adds the machine-readable rule and the content. `Content.challenges`.

### Not modelled

Nothing approved was left without state. Pieces that need none: the reveal show, tier looks, "a boss dies once", "what the duel shows", the UI rework, the art.

## What the orchestrator checks before the release

- `docs/DESIGN.md` has no `[To build]` and no `[Differs]` left, or each one left is named to the user with the reason.
- A screenshot of every screen of the new UI, shown to the user in the chat, at 100% and 150%.
- The game is played from a new save and from a 0.6.0 save.
