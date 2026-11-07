# Beta plan (v0.3.0)

Working checklist for the first playable beta. If context resets, read this file and continue from the first phase that is not done. Rules for the run:

- One review gate (Phase A). After the user's picks, all remaining phases run back to back.
- Stop only if something would contradict `DESIGN.md` or a decision of the beta brief, if blocked (CI failing after several real fix attempts, missing permission), or if a change would break saves without a migration.
- Any other open question: pick a sensible default, add it to `DESIGN.md` section 12, list it under "Decisions I made" in the PR.
- One PR per phase (split if big). Tests for all logic, screenshots for anything visual. Save format change = version bump + migration.
- After each phase: one line to the user with what merged (+ release link).
- Patch releases after Phases 2, 5 and 8. Phase 10 ends with v0.3.0.

## Status

| Phase | What                                                                                                                                                                                | Status                                        | PR                                                                                   | Notes                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| A     | Design batch + review gate (DESIGN.md 6, 11.11, 11.12, 14, 15, proposed 16; review page A1–A16)                                                                                     | **Round 1 answered, round 2 open (A13, A15)** | [Mernhil/Basic-incremental#31](https://github.com/Mernhil/Basic-incremental/pull/31) | Review page: `design/beta-review/`. Screens in `design/beta-review/screens/`                                    |
| 1     | Juice pass: stages, numbers, reactions, crits, milestones, buy multipliers, previews, welcome-back, sound + header mute                                                             | Not started                                   |                                                                                      |                                                                                                                 |
| 2     | Progression layer: E1–E6, E8 (metal ladder, gem + boss mastery with migration, growing tiles, forged edges, ★6 evolutions, goal tracker). **Release 0.2.3**                         | Not started                                   |                                                                                      | Depends on section E answers                                                                                    |
| 3     | Balance sim (lite): greedy buyer, N hours, table vs 11.7 targets. Run after every later phase                                                                                       | Not started                                   |                                                                                      |                                                                                                                 |
| 4     | Card Portal (DESIGN 6 Beta portals), reveal animation, remove 1% boss card drop                                                                                                     | Not started                                   |                                                                                      |                                                                                                                 |
| 5     | Wardrobe: 7 slots, rank gating, exclusives, owned buffs, set bonuses, upgrade levels, edge flourishes, ambient max-level, borders on level system, Wardrobe Gate. **Release 0.2.4** | Not started                                   |                                                                                      |                                                                                                                 |
| 6     | Prestige (Ascension): reset/persist rules, Starlight + shop, prestige cosmetics, boss HP/attack scaling                                                                             | Not started                                   |                                                                                      |                                                                                                                 |
| 7     | Achievements (25 + mastery/milestone ones) and shard shop                                                                                                                           | Not started                                   |                                                                                      |                                                                                                                 |
| 8     | Account XP, levels, cost cap growth, E7 reward track, account tree (6 branches, respec), card enhancements (Silver ★1). **Release 0.2.5**                                           | Not started                                   |                                                                                      |                                                                                                                 |
| 9     | Balance tooling + tuning: smarter sim, dev cheats panel (excluded from release), tune to 11.7                                                                                       | Not started                                   |                                                                                      |                                                                                                                 |
| 10    | Beta polish: Settings page (reduced motion, number format, autosave interval, export/import, sound sliders), Report-an-issue button. **Release v0.3.0**                             | Not started                                   |                                                                                      | Brief was cut off after "pre-filled GitHub issue with version, save summary and…": confirm the rest at the gate |

## Review gate answers

Round 1 answered 2026-11-07. Round 2 (A13 redrawn, A15 rebuilt on the existing art) is open.

| Set                         | Pick                             |
| --------------------------- | -------------------------------- |
| A1 Dungeons layout          | **D** Full-bleed stage, drawer   |
| A2 Production layout        | **A** Two fields stacked + rail  |
| A3 Home role                | **A** Command centre             |
| A4 Floating numbers         | **B** Sticker numerals           |
| A5 Kill + drop              | **B** Loot shower                |
| A6 Summon reveal            | **E** Shelf of portals + modal   |
| A7 Wardrobe                 | **A** Mannequin card             |
| A8 Skill tree + enhancement | **A** Radial constellation       |
| A9 Prestige                 | **E** Portal gate                |
| A10 Achievements + shop     | **C** Sticker book               |
| A11 Welcome back            | **B** Card fan                   |
| A12 Medals + metal ladder   | **D** Faceted star               |
| A13 Tile growth             | **A** concept, overhaul: round 2 |
| A14 Forged edges            | **D** Ladder strip               |
| A15 ★6 evolutions           | round 2 (use the existing art)   |
| A16 Goals + reward track    | **B** Quest scroll               |

Section E (DESIGN 16): no line was rejected and the picks for A12–A16 build on E1–E8; treated as accepted unless the user says otherwise in round 2.

User guidance from round 1: reuse the art already made earlier where possible: the unique evolutions, the weapons (scimitar, reaper sickle, moon bow, cleaver, pickaxes, axes) and the hit animations from the "Item Rarity and Effects" and "Hit Animation Options" pages and the in-game `effects.ts`.

## Notes

- Existing data: `portals.json` Card Portal pity is "Rare at 30"; Phase 4 changes it to the decided "Legendary+ at 90" plus the 10-pull Rare guarantee.
- The review page is built with `npx vite build -c design/beta-review/vite.config.mts` and screenshotted with `node design/beta-review/shoot.mjs`. It stays on the review branch; nothing of it merges into `main`.
