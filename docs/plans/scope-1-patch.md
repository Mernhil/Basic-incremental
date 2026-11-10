# Plan: Scope 1 "Tidy beta" patch (0.5.2)

Approved in the home chat on 2026-11-10. The user picked Scope 1 from `docs/DIRECTION_REVIEW.md` §8 as a patch, with Scope 3 (the dungeon release) next. The numbers below (#2, #3 …) are the review's §9 decision list. This doc goes in `docs/plans/scope-1-patch.md` and is deleted by the PR that carries it out.

## Part A: Design edits (commit before any code)

Write each decision into the rule where it lives (CLAUDE.md rule 5). User decisions are marked `(user, 2026-11-10)`, and every change gets a changelog line. Do not add any new sections.

1. #2 Confirm defaults. Every `[Default · in game]` rule listed in review §2.4 becomes a user decision, tagged `[Built]`, and leaves Open questions. These are not confirmed:
   - The shard-shop copies. Point 5 below changes them.
   - The Starlight formula and extra resets. They stay `[Default · in game]` and are revisited with Scope 3.
   - The Star bar. Point 7 below changes it.
   - The awning sprites. Point 10 below deletes them.
   - Dev tools. Point 12 below changes them.
2. #3 First summon. The game starts with enough Summon Crystals for one pull. The first goal is to summon your first card.
3. #4 Crystals. Crystals come as a wage while fighting a dungeon, not per kill. Each dungeon pays its own wage. Purses stay only on first clears, and later on stage stars and chests in Scope 3. The wage amounts are `[Default]` numbers, listed under Open questions.
4. #16 Second source of Frost Cores and Sigils. The Ember Crypt (Dungeon 2) drops a few Frost Cores and Frost Sigils at a low rate. A Gold card stuck at Dungeon 3 can then still grow. The user chose the Ember Crypt over the Glimmer Trial's top tiers because the stalled run never reaches the Glimmer Trial. The rate is a `[Default]` number, listed under Open questions.
5. #5 Shard shop. It sells copies only of Common and Uncommon cards, the rarities that can use copies for stars, for every such card. It no longer sells copies of Rare or better cards.
6. #6 Legacy Gate. It stays closed until a later card release. Until then, the locked legacy skins are hidden from the Weapon skins tab.
7. #7 Free stars. Stars that cost nothing apply by themselves. A Rare or better card arrives at its free star level, and the star flash plays once. This rewrites the Star bar rule.
8. #10 Full-art card layout. Confirmed as built.
9. #11 Reaper Test Card. It gets a real name and loses the "Test" badge. Claude picks the name as a `[Default]`, listed under Open questions so the user can change it.
10. #19 Awning sprites. Delete the unused awning sprites and their rule in UI_RULES §2.
11. #21 Frostspire Vault. Accept the 90-kill clear until floors replace it. The floors rules stay `[To build]`.
12. #22 Dev cheats panel. Add a small panel that exists in dev builds only and calls the existing `game/dev` functions. It never ships in a release build.
13. #17 Pixel workers and #18 double-detail sprites are cut. Remove their rules, Open questions lines and goal mentions in DESIGN, UI_RULES and ASSET_RULES, with a changelog line saying the user cut them.
14. Owned cards first (review idea 7.2). The Cards collection shows owned cards first, then unowned cards grouped by weapon type, each group with a collected count. This is a small direct UI job, so no 5-options round is needed (UI_RULES "Five options first").

## Part B: Build

- Content changes go in data files (CLAUDE.md rule 6): the starting crystals, the per-dungeon crystal wage (the wage code path already exists for Money), the Ember Crypt drops, the Reaper card's name and the shard-shop list. Logic stays in `src/game` and is unit-tested.
- Free stars: `grantCard` and `tierUp` apply stars whose cost is 0.
- Save format: no change is expected. If one turns out to be needed, add a version bump and a migration (rule 9).
- Balance sim: fix the `openAllPortals` default so it matches the game, with the Legacy Gate closed.
- `[Default]` numbers: pick the wage amounts and the Ember Crypt rate with the sim. Aim for:
  - First summon inside its 5–10 min target;
  - Summons at 12 to 15 pulls an hour at every stage, using DESIGN §14's 25% rule on medians;
  - the stalled seed (seed 2) clearing Dungeon 3 within 40 h;
  - no other milestone median moving out of its target.

  Do not retune anything else. The full retune with bands, worst seed and an idle profile belongs to Scope 3.

- Docs: update `docs/PROJECT_OVERVIEW.md` and every tag this PR builds or changes. In `docs/DIRECTION_REVIEW.md`, mark the Scope 1 decisions as decided. Do not delete the review; Scope 3 still uses it.

## Part C: Verify

- `npm run lint`, `npm test` and `npm run build` pass.
- Run `npm run sim -- --hours 40 --seeds 5` before and after, and put both milestone tables in the PR, plus the pulls per hour at 2 h, 10 h and 40 h.
- Take screenshots of:
  - a new game showing the first goal and the crystals;
  - the Cards collection sort;
  - the Shop's shard shop;
  - the Weapon skins tab without the locked legacy skins;
  - the dev panel, in a dev build.

## Done when

- The PR is merged with green CI and this plan doc deleted.
- 0.5.2 is tagged and the GitHub Release is live.
