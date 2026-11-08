# Prompt for Claude Code: game changes decided on 2026-11-08

Read `CLAUDE.md`, `docs/WORK_SPLIT.md` and `docs/DESIGN.md` first, and save this file as `docs/handoffs/2026-11-08-game-changes.md` in the first PR.

This is one sectioned run. Do Phases 0 to 4 back to back, one PR per phase (split a phase if it gets big), then stop at the review gate (Phase 5) and wait for my picks. Phase 6 starts after I answer.

Stop and ask me only if something would contradict `DESIGN.md` or a decision of mine, if CI keeps failing after real fix attempts, or if a change would break saves without a migration. Any other gap: follow CLAUDE.md rule 5 (write the choice in place as `[Default]`, list it under Open questions and under "Decisions I made" in the PR). After each phase, tell me in one line what merged.

Tags move with the code: when a phase builds a rule, its tag becomes `[Built]`, and a built `[Default]` becomes `[Default · in game]`. Every PR lists the tags it changed.

## Phase 0: DESIGN.md edits (first commit, before any code)

Docs-only PR. Rewrite these rules in `docs/DESIGN.md`, finding each by its bold name (they are currently `[Proposed]`, except Level), then run `npm run lint`.

**§4 Production**, replace "Balance after plots" and the shelf line under it:

```md
- [Default] **Balance after plots.** Every filled plot added a full copy of a tree's output, so tree and mine levels now carry that growth: the level bonus and milestones are retuned with the sim against the pacing targets (§14). Old saves get back the Money they spent on plots and slots.
- [Default] The six shelf upgrades unlocked by damage-line levels (Copper, Iron and Crystal Temper and Hardening) go with the lines, and an owned one pays its Money back. No shelf item depends on plots.
```

**§5 Weapon progression**, replace Level, XP from fighting time, Level caps and "Small bump every level" (which becomes two rules), and the star bar line (keep its table):

```md
- [Differs] **Level.** XP from fighting raises the weapon's level, up to its tier's cap. Levelling adds new moves or damage types. No resource buys a level. Today fighting cards gain XP only per boss kill, the cap also grows with stars, and levels add no moves.
- [Default] **XP from fighting time.** A fighting card in the loadout gains XP for every second it fights (not while knocked out) plus a bonus per kill, so a card stuck at a wall still levels. Production cards keep their XP per gem harvested. Rates live in `cardRules.json`.
- [Default] **Level caps by tier only:** 20 / 40 / 60 / 80 / 100 for Bronze, Silver, Gold, Prismatic and Unique. Stars no longer raise the cap. A saved card above its new cap is set to the cap, so it can tier up at once.
- [Built] **Small bump every level.** Each level adds a little to the card's power, support strength and gauge speed (`cardRules.json`).
- [Proposed] **Moves.** Milestone levels unlock new nodes on the card's enhancement chart, picked with points, and each star gives enhancement points. Which moves and damage types each card learns needs a content pass with the user.
- [Default] **Star bar.** Each duplicate fills the card's star bar by an amount set by its rarity, and each star needs more than the one before, so Commons need many copies and top rarities few. First pass from the Card Portal rates, tuned with the sim:

  | Rarity    | Copies for ★2 → ★6 | Total | Rough pulls to ★6     |
  | --------- | ------------------ | ----- | --------------------- |
  | Common    | 2, 4, 7, 11, 16    | 40    | ~175                  |
  | Rare      | 1, 2, 4, 5, 8      | 20    | ~265                  |
  | Epic      | 1, 1, 2, 2, 4      | 10    | ~330                  |
  | Legendary | 1, 0, 1, 1, 2      | 5     | ~440 (less with pity) |
  | Mythic    | 1, 0, 1, 0, 2      | 4     | ~880                  |
  | Exotic    | 1, 0, 0, 1, 0      | 2     | ~880                  |
```

**§5**, replace Star impact, Stars carry across tiers, Star fill in the shard shop, Weapon looks, Production cards and Old saves, and add the last three rules after Old saves:

```md
- [Default] **Star impact.** About ×1.25, ×1.6, ×2, ×2.6 and ×3.5 base stats at ★2 to ★6, so a maxed Common (base 100) equals a fresh Legendary (base 350).
- [Default] **Stars carry across tiers** (a Bronze ★3 becomes Silver ★3, the star colour following the tier) and a star costs only duplicates; Cores, gems and Money go to tier-ups. Saved stars stay as they are.
- [Default · in game] **Star fill in the shard shop.** The shard shop already sells copies of a chosen card, and a bought copy fills its star bar like any duplicate.
- [Default] **Weapon looks, for now.** Until each weapon has its own tier art, every tier moves the weapon one step up its existing rarity ladder: a Common sword shows the common, rare, epic and legendary swords from Bronze to Prismatic, capped at Void. The proper tier looks go through the art review (§12).
- [Default] **Production cards** follow the same level, tier and stars model, with XP from harvesting.
- [Default] **Old saves.** Damage-line levels are removed and the Money they cost is paid back.
- [Default] **Tier-up costs.** Each tier-up costs Money plus the tier's Core and its tree and mine gems, the gems scaled by the card's job as now; Gold → Prismatic also costs Frost Sigils (`cardRules.json`). The Money price is new, and every amount is tuned with the sim.
- [Default] **Base damage.** Base damage follows the same rarity ratios as health: Common 1×, Rare 1.5×, Epic 2.25×, Legendary 3.5×, Mythic 5×, Exotic 7×, Void 10×. The Common value, the growth per level and the tier and star steps are tuned together with the sim, so the pacing targets hold without damage lines (§14).
- [Default] **The Unique tier** is open only to weapons that have a unique version (today the sword and the staff); the others stop at Prismatic until theirs is drawn. A Unique weapon keeps the Prismatic frame, with the unique reveal (§12).
```

**§6 Combat**, replace "Visible chunks" and the readout rule:

```md
- [Default] **Boss attack pattern.** Every boss hits lightly at its rhythm, and every sixth attack is a telegraphed heavy slam: five light hits at 0.4× and one slam at 4× an attack, so the damage per minute in `dungeons.json` stays the same. A slam takes a visible chunk, and the health bar drops with a pale trailing segment that catches up. How the wind-up and the chunk look is picked at the review gate.
- [Default] **"You fall in" readout** beside time-to-kill, red when the loadout would fall first. At 316.57 DPS the Root Warden takes 17 min 22 s, but 100 health lasts 16 min 40 s, so it can never die, and the screen does not say so.
```

**§16 Open questions**, replace the "Waiting since 2026-11-08" list with:

```md
Waiting since 2026-11-08 (`[Proposed]`):

- Production: the row layout, picked from five mockups at the review gate (§4, §11).
- Weapons: the moves and damage types each card learns by level, and how they sit on the enhancement chart (§5).
- Cards on screen: the compact collection card, real text and whole-number growth, picked at the review gate; an optional re-bake at double detail (§11, §12).
- Beta systems: replacing Bare Hands and Single Plot; the new autobuyer list (§15).
```

and add these lines to the Defaults list, after the §5 enhancement line:

```md
- §4 the balance after plots and the plot refund; the damage-line shelf upgrades going.
- §5 (filled in 2026-11-08 to build the weapon decisions) XP from fighting time, level caps by tier, the star bar, star impact, stars carrying across tiers, tier-up costs, base damage by rarity, the Unique tier, the interim weapon looks, production cards on the same model, the damage-line refund.
- §6 (filled in 2026-11-08) the boss attack pattern and the "You fall in" readout.
```

**§17 Changelog**, add above the "2026-11-07 and earlier" line:

```md
- 2026-11-08 — Claude filled in defaults so the 2026-11-08 decisions can be built (§4, §5, §6), waiting for the user's confirmation: XP from fighting time, level caps by tier, the star bar and its impact, stars across tiers, tier-up costs, base damage, the Unique tier, interim weapon looks, the boss attack pattern and the "You fall in" readout.
```

## Phase 1: Production, one of each (mechanics, then a minimal ui fix)

Rules: §4 One of each, Balance after plots, The main card plays the field; §3 Money buys.

- Remove plots, slots and expansions: `production.json` (`startPlots`, `expansion`), the state, `production.ts`, `bulk.ts` and `previews.ts` entries, the goal rules and the sim player's plot spreading. Each unlocked tree kind and mine type produces once, at its level.
- Harvest targeting (sweep, random, all) runs across the unlocked kinds instead of plots (`harvest.ts`, `productionView.ts`).
- Save format bump and migration: drop plots and slots, pay back the Money spent on expansions (the sum of their curve prices), keep levels and unlocks.
- Tests: output with one of each, the migration refund, harvest targets across kinds.
- ui: only what keeps the Production page working (one tile per unlocked kind, no "More plots / slots" rows, no empty plots). No new layout; that comes from the gate.

## Phase 2: Weapon progression (mechanics, two PRs)

Rules: §5 Strength comes from cards, No damage lines, Base stats by rarity, Level, Tier, Stars, Stars need balancing, Unique weapon and the Defaults of Phase 0; §12 No forged edges.

**2a. Damage comes from cards.**

- Remove the three damage lines: `combat.json` `damageUpgrades`, their logic in `combat.ts`, `combat.upgradeGain`, their milestones, goals, tier-up moments, bulk buys and previews. Remove the six Temper / Hardening shelf upgrades. "First Milestone" keeps its mine half.
- Base damage by rarity in `cardRules.json` (same ratios as health). Fighting damage = the main card's base damage, grown by level, tier and stars, then the modifier pipeline as now (supports, tree, mastery, crits, bursts).
- XP from fighting time: per second fought (not while knocked out) plus a per-kill bonus, rates in `cardRules.json`. Production cards keep XP per gem.
- Level caps by tier only (20 / 40 / 60 / 80 / 100).
- Save migration: drop the damage-line levels and owned Temper / Hardening upgrades and pay their Money back; set any card above its new cap to the cap.

**2b. Tiers, stars, unique.**

- Tier-up at max level, paid with Money plus the tier's Core and gems (and Frost Sigils for Gold → Prismatic). No ★6 requirement; stars are kept.
- Star bar: each duplicate adds fill by rarity, each star needs the fill in the §5 table, and the current star-up action stays, now costing only the fill. Star multipliers ×1.25 / 1.6 / 2 / 2.6 / 3.5 on base damage and health. Duplicates past ★6 become shards.
- Unique tier after Prismatic, only for weapons with a unique version (Ember Squire's sword, Grove Keeper's staff). It keeps the Prismatic frame and shows the unique item. Remove the unique item at Gold ★6.
- Interim weapon looks: export one function from `src/game` that gives the item rarity to draw for a card's rarity and tier (one step up per tier, capped at Void, the unique item at Unique). The renderer uses it; no new art.
- Production cards use the same model.
- Update goals (star bar full, tier-up at max level), the sim player (tier-ups with Money, no damage lines), the save migration and the tests.

## Phase 3: Boss hits in chunks (mechanics)

Rules: §6 Hits land in chunks, Boss attack pattern, "You fall in" readout.

- Replace the smooth drain (`bossAttackDps`) with discrete attacks at each boss's interval: five light hits at 0.4× and a slam at 4× in every six attacks, with defence applied. Damage per minute stays as in `dungeons.json`.
- Derive the attacks from fight time, the way harvest strikes are derived, so offline and online give the same result. If that needs saved state, bump the format and migrate.
- The loadout is knocked out on the hit that empties its pool; the rest of the knockout stays as it is.
- Report events: each attack with its damage and whether it is a slam, plus when the next slam lands, for the wind-up. Expose "time until knockout" next to time-to-kill, with a flag when the loadout would fall first. The goal tracker uses it.
- Tests: same damage per minute as before, online equals offline, knockout timing.

## Phase 4: Retune and sharp pixels

**4a (mechanics).** Retune every number touched above with the sim (`npm run sim -- --hours 40 --seeds 5`) until each milestone median is within about 25% of its §14 target. Put the table in the PR, and update the §14 On target tag if it holds.

**4b (ui and pixel-art).** Build §12 Clean pixels, an approved rule the game breaks today:

- Draw all pixel art at whole-number scales, counting `devicePixelRatio`, and never shrink it.
- Card sizes are whole multiples of the 132 × 186 card grid. Where a layout shrinks a card below 1×, use the nearest whole scale that fits and let the grid reflow.
- This is the same look drawn correctly, so it needs no options. The new compact collection card is decided at the gate.

## Phase 5: Review gate (ui and pixel-art), then stop

Show me five options for each set below, as mockups or screenshots on one review page (not merged into `main`), the way the beta review worked. Then stop and wait for my picks.

1. **Production screen.** Start from the §4 Screen proposal: one row per tree kind or mine type, the buy button on the row. Vary the layout, density, where the production card stands and where the shelf sits.
2. **Cards on screen** (§11 Sharp cards): the compact collection card, the detail card's size, and real card text.
3. **Weapon panel.** Where the main card's level and XP, the tier-up (its cost and the max-level state) and the star bar live: in the dungeon drawer, replacing the damage lines, and in the Cards page detail.
4. **Boss hits:** the slam's wind-up on the boss, the chunk drop with its trailing segment, and the "You fall in" readout.
5. **Weapon tier looks** (pixel-art, five options of how the family evolves): the sword's Bronze → Silver → Gold → Prismatic → Unique ladder, and how the same approach would apply to the other 11 weapons.

## Phase 6: Build the picks (after I answer)

ui builds sets 1 to 4. pixel-art draws the picked sword ladder for approval, then queues the other weapons. Update the tags. Release only when I say "release".

## Not in this run

- The §15 beta systems: I will confirm them after these changes.
- §5 Moves: what each card learns by level needs a content pass with me first.
- The Frostspire Vault clear count (50 or 90): still an open question.
- Re-baking the sprites at double detail: still a proposal.

## Done means

`npm run lint` (with the design check), `npm run typecheck`, `npm test` and `npm run build` pass, the tags and Open questions match the game, and every PR lists the tags it changed.
