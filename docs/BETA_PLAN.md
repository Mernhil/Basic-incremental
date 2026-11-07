# Beta plan (v0.3.0)

Working checklist for the first playable beta. If context resets, read this file and continue from the first phase that is not done. Rules for the run:

- One review gate (Phase A). After the user's picks, all remaining phases run back to back.
- Stop only if something would contradict `DESIGN.md` or a decision of the beta brief, if blocked (CI failing after several real fix attempts, missing permission), or if a change would break saves without a migration.
- Any other open question: pick a sensible default, add it to `DESIGN.md` section 12, list it under "Decisions I made" in the PR.
- One PR per phase (split if big). Tests for all logic, screenshots for anything visual. Save format change = version bump + migration.
- After each phase: one line to the user with what merged (+ release link).
- Patch releases after Phases 2, 5 and 8. Phase 10 ends with v0.3.0.

## Status

| Phase | What                                                                                                                                                                                | Status      | PR                                                                                   | Notes                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| A     | Design batch + review gate (DESIGN.md 6, 11.11, 11.12, 14, 15, proposed 16; review page A1–A16)                                                                                     | **Done**    | [Mernhil/Basic-incremental#31](https://github.com/Mernhil/Basic-incremental/pull/31) | Mockups kept on branch `design/beta-review-mockups` (not merged)                                                |
| 1     | Juice pass: stages, numbers, reactions, crits, milestones, buy multipliers, previews, welcome-back, sound + header mute                                                             | In progress |                                                                                      | 1a logic merged #42 (crits, milestones, bulk buy, previews, readouts, welcome-back data); 1b UI next            |
| 2     | Progression layer: E1–E6, E8 (metal ladder, gem + boss mastery with migration, growing tiles, forged edges, ★6 evolutions, goal tracker). **Release 0.2.3**                         | In progress |                                                                                      | 2a logic: mastery (save v8), medals, stages, TierUp, evolutions, goals (DESIGN 12.9-14); 2b UI next             |
| 3     | Balance sim (lite): greedy buyer, N hours, table vs 11.7 targets. Run after every later phase                                                                                       | **Done**    | (this PR)                                                                            | `npm run sim -- --hours 40` (DESIGN 12.15); tuning to 11.7 is Phase 9                                           |
| 4     | Card Portal (DESIGN 6 Beta portals), reveal animation, remove 1% boss card drop                                                                                                     | Not started |                                                                                      |                                                                                                                 |
| 5     | Wardrobe: 7 slots, rank gating, exclusives, owned buffs, set bonuses, upgrade levels, edge flourishes, ambient max-level, borders on level system, Wardrobe Gate. **Release 0.2.4** | Not started |                                                                                      |                                                                                                                 |
| 6     | Prestige (Ascension): reset/persist rules, Starlight + shop, prestige cosmetics, boss HP/attack scaling                                                                             | Not started |                                                                                      |                                                                                                                 |
| 7     | Achievements (25 + mastery/milestone ones) and shard shop                                                                                                                           | Not started |                                                                                      |                                                                                                                 |
| 8     | Account XP, levels, cost cap growth, E7 reward track, account tree (6 branches, respec), card enhancements (Silver ★1). **Release 0.2.5**                                           | Not started |                                                                                      |                                                                                                                 |
| 9     | Balance tooling + tuning: smarter sim, dev cheats panel (excluded from release), tune to 11.7                                                                                       | Not started |                                                                                      |                                                                                                                 |
| 10    | Beta polish: Settings page (reduced motion, number format, autosave interval, export/import, sound sliders), Report-an-issue button. **Release v0.3.0**                             | Not started |                                                                                      | Brief was cut off after "pre-filled GitHub issue with version, save summary and…": confirm the rest at the gate |

## Review gate answers

Answered 2026-11-07 (two rounds).

| Set                         | Pick                                                      |
| --------------------------- | --------------------------------------------------------- |
| A1 Dungeons layout          | **D** Full-bleed stage, drawer                            |
| A2 Production layout        | **A** Two fields stacked + rail                           |
| A3 Home role                | **A** Command centre                                      |
| A4 Floating numbers         | **B** Sticker numerals                                    |
| A5 Kill + drop              | **B** Loot shower                                         |
| A6 Summon reveal            | **E** Shelf of portals + modal                            |
| A7 Wardrobe                 | **A** Mannequin card                                      |
| A8 Skill tree + enhancement | **A** Radial constellation                                |
| A9 Prestige                 | **E** Portal gate                                         |
| A10 Achievements + shop     | **C** Sticker book                                        |
| A11 Welcome back            | **B** Card fan                                            |
| A12 Medals + metal ladder   | **D** Faceted star                                        |
| A13 Tile growth             | **C** Rising plinth (redrawn per stage, solid rock mines) |
| A14 Forged edges            | **D** Ladder strip                                        |
| A15 ★6 evolutions           | **E** Beam + frame rebuild, existing art                  |
| A16 Goals + reward track    | **B** Quest scroll                                        |

Section E (DESIGN 16): all lines accepted (none rejected over two rounds); DESIGN 16 is now decided.

User guidance from round 1: reuse the art already made earlier where possible: the unique evolutions, the weapons (scimitar, reaper sickle, moon bow, cleaver, pickaxes, axes) and the hit animations from the "Item Rarity and Effects" and "Hit Animation Options" pages and the in-game `effects.ts`.

## Decided visuals

Decided with the user in the graphics session (2026-11-07).

- **Art style: pixel art** (DESIGN 13). Every existing vector asset is redrawn as pixel art and approved by the user one by one. Code phases keep using the current art until an asset here is marked approved; do not build new vector art. When an asset is approved, its pixel version replaces the vector one in its phase.
- **Tiles (A13):** the tree is the in-game `treeTile` grown over the five stages, not the review mockup's `growth.ts` trees; the mine is a crystal cluster (a chunky centre crystal, side crystals leaning into it, rock lumps at the base). Pixel draft: [Vector or Pixel](https://claude.ai/artifact/52eMxizyhHcEfXozMUuNGR). Not approved yet.

Approval queue (in order). Every asset is now approved for the beta; mockups: [Pixel Art Batch](https://claude.ai/artifact/NLU6j4dSGJZe587PWGDXdK) and [Pixel Art Round 2](https://claude.ai/artifact/MP6BXhgJFWdRJDdyLiNcs6).

Build note for the code phases: ship the sprites as pixel data on their native grid (pre-rendered at build time from the approved drawings) and draw them at whole-number scale. The browser renderers used for the mockups are in the graphics session's shared notes. Post-beta polish: a Brave Frontier pass on the tiles, and smoother tone shapes on the largest boss areas (the Lich's robe shows tone rings).

| Asset                                                                                      | Status                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production tiles: tree and crystal mine, five stages                                       | **In the game** (#45, `treeTile`/`mineTile` with a stage; passing the stage is a ui task): 58 × 64, gem-coloured leaves, crystal mine; Brave Frontier pass after the beta    |
| Card items and weapons, by rarity (swords, scimitar, sickle, bow, cleaver, pickaxes, axes) | **In the game** (#43): 100 × 120, black outline, light extra shading ([Pixel Weapons](https://claude.ai/artifact/LXvcdDWADiGMDBKkTVLbrZ), treatment E+)                      |
| Unique evolutions (Flameblade, Rootbloom Staff, Soul Reaper)                               | **In the game** (#43, `evolutionArt`; placing it on ★6 cards is a ui task): card-item treatment, animated in the effects style                                               |
| Card frames by tier                                                                        | **In the game** (#43): frame ladder (material, sockets, crest; motion on Gold and Prismatic), DESIGN 13 ([Frame Ladder](https://claude.ai/artifact/BWviG6R6coWmmMLKCCY8ga))  |
| Gem coins and resource icons                                                               | **In the game** (#45, coin metal = mastery tier once mechanics exposes it): 48 × 48, one big faceted gem, no carving lines                                                   |
| Bosses and the Crystal Sentinel                                                            | **Approved for the beta**: 160 px, Brave Frontier technique, soft aura, idle effects                                                                                         |
| Element effects and hit animations                                                         | **Approved for the beta**: pixel effects with a soft glow (P5 C), thin slash                                                                                                 |
| Mastery medals, forged edges, navigation plaques                                           | **In the game** (#45, `masteryMedal`, `forgedEdge`, `navPlaque`; placing them is a ui task): 48 px medals with holo on Gold and Prismatic; forged-edge ladder; 64 px plaques |

## Notes

- Existing data: `portals.json` Card Portal pity is "Rare at 30"; Phase 4 changes it to the decided "Legendary+ at 90" plus the 10-pull Rare guarantee.
- The review page lives on branch `design/beta-review-mockups` (`design/beta-review/`, build with `npx vite build -c design/beta-review/vite.config.mts`). Its `growth.ts` tiles are superseded by "Decided visuals" above.
- Phase 10 brief was cut off after "pre-filled GitHub issue with version, save summary and". Default: also include the last 50 log lines and OS / app info (DESIGN 12).
