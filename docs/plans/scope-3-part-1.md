# Plan: Scope 3, part 1 (design, sim, floors core)

Approved in the home chat on 2026-11-10. The user picked Scope 3, "The dungeon release", from `docs/DIRECTION_REVIEW.md` §8, widened to include everything below. This doc goes in `docs/plans/scope-3-part-1.md` and is deleted by the PR that adds it.

## The whole of Scope 3, for context

Each phase is its own plan from the home chat unless it is marked as being in this plan.

1. **Design edits** (this plan, Part A).
2. **Sim upgrades** (this plan, Part B).
3. **Floors core:** floors, clearing, normal enemies, difficulty tiers, endless depths, Ascension growth, save migration, offline, goals (this plan, Part C).
4. **Floors UI:** the arena with waves, the floor strip, the tier picker, the depth readout. It starts with a 5-options round in the home chat.
5. **Stage stars,** chests, the stage map, the medal migration, and achievements per tier.
6. **Three new dungeons:** logic and data. Their themes are picked in a 5-options round in the home chat first.
7. **Enemy and boss art** for all six dungeons, in PixelLab sessions with 5-options rounds.
8. **Arena backgrounds,** in art sessions.
9. **Ladder retune** with the new sim, including fixing the opening that is too fast since 0.5.3.
10. **Release.**

## Part A: Design edits (commit before any code)

Write each decision into the rule where it lives (CLAUDE.md rule 5). User decisions are marked `(user, 2026-11-10)`. Gaps get a `[Default]` and an Open questions line. Every change gets a changelog line. Rules not built yet stay `[To build]`.

1. **Difficulty tiers** (new rule in §6). Every dungeon has three tiers: Normal, Hard and Nightmare.
   - A dungeon starts on Normal.
   - Beating a tier's last-floor boss unlocks the next tier of that dungeon. Beating Nightmare unlocks that dungeon's endless depths.
   - Each tier has its own floors, stage stars, chests and achievements, for a completionist goal of every stage fully starred on every tier.
   - Clearing a dungeon still means beating its Normal last-floor boss, which unlocks the next dungeon and its mine (§6 Clearing).
   - Claude's defaults:
     - a tier is about ×1,000 enemy HP above the one below, with better drops;
     - unlocked tiers and the best floor of each tier are kept through Ascension.

   The user first agreed that Ascension would open Hard and Nightmare, then said the flow is beat Normal, then Hard, then Nightmare, then endless. **The beat-based flow is the rule; there is no Ascension gate.**
2. **Endless depths** (new rule in §6). Below each dungeon's Nightmare boss the floors keep going forever at the steady floor rate (§3 Ladders).
   - This makes each dungeon a scalable farming spot: the deeper you go, the harder the enemies and the better the rewards.
   - Each depth keeps dropping its own dungeon's materials, so every dungeon stays worth farming.
   - Push, farm and knockout work as on normal floors. Ascension resets the current depth and keeps the best one, as with floors.
3. **Harder each Ascension** (rewrite "slowly with Ascension" in §6 Normal enemies and wherever boss scaling with Ascension is written). Every enemy grows noticeably stronger with each Ascension. The amount is Claude's `[Default]`, tuned with the sim.
   - **Guard:** each run must still be faster overall than the one before. The sim checks that every run reaches its first 5 milestones sooner than the previous run did.
4. **Three new dungeons** (§6). Dungeons 4, 5 and 6 come after the Frostspire Vault, each with floors, three tiers, endless depths, three normal enemies, a mini-boss every 10th floor and a boss.
   - **Their themes, names, enemies, materials, and whether each opens a new mine are not decided.** Write them as `[To build]` with "themes picked in a 5-options round in the home chat" and list them under Open questions. Do not invent themes.
   - The floor counts are Claude's `[Default]` (for example 40, 50, 60), tuned with the sim.
5. **Dungeon floors** (§6) and **Clearing**: link them to the new rules. The Ascension half-start applies per tier.
6. **Offline** on floors: Claude's `[Default]` is that offline progress fights the current floor in farm mode and never pushes deeper.
7. **Pacing targets** (§14): add Claude's `[Default]` targets for Dungeons 4 to 6 and for the first Hard and first Nightmare clears, keeping the 40 h "Beta content mostly exhausted" target. The sim is tuned against these in phase 9, not now.

## Part B: Sim upgrades (no game change)

Review §4, points C and F:
- a `--seeds 20` run for balance PRs;
- a spread column and a worst-seed column;
- the check "median within 25% and worst seed within 2×";
- an idle profile (checks in every 30 min, 8 h offline a day) reported beside the active one;
- for the Ascension guard in Part C, the time to each of the first 5 milestones in each run.

The same-seed sim results of the game must not change. Show that in the PR.

## Part C: Floors core

**What it covers** (logic in `src/game`, content in `src/data/content`, unit-tested):
- the floors rules;
- Clearing;
- normal enemies, which use placeholder sprites until phase 7 (ASSET_RULES on placeholders);
- difficulty tiers;
- endless depths;
- Ascension growth;
- Dungeons 4 to 6 as data with placeholder names, enemies and art.

The three new dungeons can stay locked behind a dev flag until phase 6 gives them their themes. Mark them as such in the overview.

**Saves.**
- Save progress per dungeon and per tier from the start (current floor, best floor, best depth), so stage stars and later content need no second migration.
- Bump the save version and write a migration (rule 9). A dungeon already cleared stays cleared and starts at its Normal last floor as its best floor. Boss medals stay as they are until phase 5.
- Test the migration on the saves in the test fixtures and on an old save made with the dev tools.

**Keep main playable.** Phase 4 builds the real floors UI after a 5-options round. Until then, every PR in this plan ships a minimal working UI in the Dungeons screen: the current floor and tier as plain text, the push/farm toggle, a tier selector for unlocked tiers, and the wave shown with the existing arena. Mark it as interim in the overview and in UI_RULES as `[Default]`.

**Other systems.** Goals, achievements counting kills, the account, offline progress and Ascension must all work with floors. Fix anything tied to "boss kills clear a dungeon".

**Balance.** Do not retune the ladder; that is phase 9. Set the floor, tier and Ascension numbers only well enough that the active and idle profiles reach Normal clears of Dungeons 1 to 3. Show the sim tables in each PR.

## Verify (every PR)

- `npm run lint`, `npm test` and `npm run build` pass.
- The sim runs, with its tables in the PR.
- Screenshots of the interim Dungeons screen on Normal, Hard and an endless depth (use the dev panel).
- A loaded old save.
- `docs/PROJECT_OVERVIEW.md` is updated, and the tags match the code.

## Done when

- Part A and Part B are merged first.
- The floors core is merged across two or more PRs, with green CI and a migrated save loading.
- This plan doc is deleted in PR 1.
