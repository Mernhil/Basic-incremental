# Beta plan (v0.3.0)

A finished plan, kept as history. The DESIGN section numbers below (11.x, 12.x and so on) refer to the old layout of `docs/DESIGN.md` at commit `ac33acd`.

Working checklist for the first playable beta. If context resets, read this file and continue from the first phase that is not done. Rules for the run:

- One review gate (Phase A). After the user's picks, all remaining phases run back to back.
- Stop only if something would contradict `DESIGN.md` or a decision of the beta brief, if blocked (CI failing after several real fix attempts, missing permission), or if a change would break saves without a migration.
- Any other open question: ask the user. If the work cannot wait, write the choice where the rule belongs in `DESIGN.md`, tagged `[Default]`, list it under Open questions there and under "Decisions I made" in the PR.
- One PR per phase (split if big). Tests for all logic, screenshots for anything visual. Save format change = version bump + migration.
- After each phase: one line to the user with what merged (+ release link).
- Patch releases after Phases 2, 5 and 8. Phase 10 ends with v0.3.0.

## Status

| Phase | What                                                                                                                                                                                | Status   | PR                                                                                                                                                                                                                                                                                                                                                                                          | Notes                                                                                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Design batch + review gate (DESIGN.md 6, 11.11, 11.12, 14, 15, proposed 16; review page A1–A16)                                                                                     | **Done** | [Mernhil/Basic-incremental#31](https://github.com/Mernhil/Basic-incremental/pull/31)                                                                                                                                                                                                                                                                                                        | Mockups kept on branch `design/beta-review-mockups` (not merged)                                                                                                                                                                                                             |
| 1     | Juice pass: stages, numbers, reactions, crits, milestones, buy multipliers, previews, welcome-back, sound + header mute                                                             | **Done** | [#42](https://github.com/Mernhil/Basic-incremental/pull/42), [#47](https://github.com/Mernhil/Basic-incremental/pull/47), [#49](https://github.com/Mernhil/Basic-incremental/pull/49), [#50](https://github.com/Mernhil/Basic-incremental/pull/50)                                                                                                                                          | 1a logic #42; 1b UI: arena + numbers + header + Home #47, production + welcome back #49, sound #50                                                                                                                                                                           |
| 2     | Progression layer: E1–E6, E8 (metal ladder, gem + boss mastery with migration, growing tiles, forged edges, ★6 evolutions, goal tracker). **Release 0.2.3**                         | **Done** | [#44](https://github.com/Mernhil/Basic-incremental/pull/44), [#52](https://github.com/Mernhil/Basic-incremental/pull/52), release 0.2.3                                                                                                                                                                                                                                                     | 2a logic: mastery (save v8), medals, stages, TierUp, evolutions, goals (DESIGN 12.9-14); 2b UI next                                                                                                                                                                          |
| 3     | Balance sim (lite): greedy buyer, N hours, table vs 11.7 targets. Run after every later phase                                                                                       | **Done** | [#46](https://github.com/Mernhil/Basic-incremental/pull/46)                                                                                                                                                                                                                                                                                                                                 | `npm run sim -- --hours 40` (DESIGN 12.15); tuning to 11.7 is Phase 9                                                                                                                                                                                                        |
| 4     | Card Portal (DESIGN 6 Beta portals), reveal animation, remove 1% boss card drop                                                                                                     | **Done** | [#51](https://github.com/Mernhil/Basic-incremental/pull/51), [#53](https://github.com/Mernhil/Basic-incremental/pull/53)                                                                                                                                                                                                                                                                    | 4a logic merged #51 (portal engine, pity in save v9, boss card drop removed; DESIGN 12.16); 4b UI next (shelf, reveal)                                                                                                                                                       |
| 5     | Wardrobe: 7 slots, rank gating, exclusives, owned buffs, set bonuses, upgrade levels, edge flourishes, ambient max-level, borders on level system, Wardrobe Gate. **Release 0.2.4** | **Done** | [#56](https://github.com/Mernhil/Basic-incremental/pull/56), [#59](https://github.com/Mernhil/Basic-incremental/pull/59), art [#68](https://github.com/Mernhil/Basic-incremental/pull/68) [#69](https://github.com/Mernhil/Basic-incremental/pull/69), data [#71](https://github.com/Mernhil/Basic-incremental/pull/71), wiring [#73](https://github.com/Mernhil/Basic-incremental/pull/73) | Folded into v0.3.0 (Phases 5 and 8 finished together, so the 0.2.4 and 0.2.5 patch releases were skipped)                                                                                                                                                                    |
| 6     | Prestige (Ascension): reset/persist rules, Starlight + shop, prestige cosmetics, boss HP/attack scaling                                                                             | **Done** | [#55](https://github.com/Mernhil/Basic-incremental/pull/55), [#57](https://github.com/Mernhil/Basic-incremental/pull/57)                                                                                                                                                                                                                                                                    | 6a logic #55 (Starlight, shop, prestige cosmetics, save v10; DESIGN 12.17); 6b UI #57 (portal gate + Starlight shop on the Shop page, DESIGN 12.19)                                                                                                                          |
| 7     | Achievements (25 + mastery/milestone ones) and shard shop                                                                                                                           | **Done** | [#58](https://github.com/Mernhil/Basic-incremental/pull/58), [#60](https://github.com/Mernhil/Basic-incremental/pull/60)                                                                                                                                                                                                                                                                    | 7a logic #58 (29 achievements, rewards, shard shop, save v12; DESIGN 12.20); 7b UI #60 (sticker book, shard shop tab, unlock toasts)                                                                                                                                         |
| 8     | Account XP, levels, cost cap growth, E7 reward track, account tree (6 branches, respec), card enhancements (Silver ★1). **Release 0.2.5**                                           | **Done** | [#61](https://github.com/Mernhil/Basic-incremental/pull/61), [#66](https://github.com/Mernhil/Basic-incremental/pull/66)                                                                                                                                                                                                                                                                    | Folded into v0.3.0 (Phases 5 and 8 finished together, so the 0.2.4 and 0.2.5 patch releases were skipped)                                                                                                                                                                    |
| 9     | Balance tooling + tuning: smarter sim, dev cheats panel (excluded from release), tune to 11.7                                                                                       | **Done** | [#67](https://github.com/Mernhil/Basic-incremental/pull/67), [#70](https://github.com/Mernhil/Basic-incremental/pull/70)                                                                                                                                                                                                                                                                    | 9a #67 (cheats, multi-seed sim, main log tail and system info); 9b tuning to 11.7, table below (DESIGN 12.25)                                                                                                                                                                |
| 10    | Beta polish: Settings page (reduced motion, number format, autosave interval, export/import, sound sliders), Report-an-issue button. **Release v0.3.0**                             | **Done** | [#63](https://github.com/Mernhil/Basic-incremental/pull/63), release v0.3.0                                                                                                                                                                                                                                                                                                                 | Settings UI built (option B two-column panels, DESIGN 12.23): reduced-motion override, number styles, autosave interval, export/import with in-page confirm, Report an issue (12.5). Waiting on mechanics: main-process log tail for the issue; release v0.3.0 after Phase 9 |

## Review gate answers

Answered 2026-11-07 (two rounds).

| Set                         | Pick                                            |
| --------------------------- | ----------------------------------------------- |
| A1 Dungeons layout          | **D** Full-bleed stage, drawer                  |
| A2 Production layout        | **A** Two fields stacked + rail                 |
| A3 Home role                | **A** Command centre                            |
| A4 Floating numbers         | **B** Sticker numerals                          |
| A5 Kill + drop              | **B** Loot shower                               |
| A6 Summon reveal            | **E** Shelf of portals + modal                  |
| A7 Wardrobe                 | **A** Mannequin card                            |
| A8 Skill tree + enhancement | **A** Radial constellation                      |
| A9 Prestige                 | **E** Portal gate                               |
| A10 Achievements + shop     | **C** Sticker book                              |
| A11 Welcome back            | **B** Card fan                                  |
| A12 Medals + metal ladder   | Faceted star, from the user's concept sheet     |
| A13 Tile growth             | Floating islands from the user's concept sheets |
| A14 Forged edges            | **D** Ladder strip                              |
| A15 ★6 evolutions           | **E** Beam + frame rebuild, existing art        |
| A16 Goals + reward track    | **B** Quest scroll                              |

Section E (DESIGN 16): all lines accepted (none rejected over two rounds); DESIGN 16 is now decided.

User guidance from round 1: reuse the art already made earlier where possible: the unique evolutions, the weapons (scimitar, reaper sickle, moon bow, cleaver, pickaxes, axes) and the hit animations from the "Item Rarity and Effects" and "Hit Animation Options" pages and the in-game `effects.ts`.

## Decided visuals

**Beta art batch B1–B10 (2026-11-07): every option is kept as a cosmetic** (DESIGN 7, "UI-skin slots" and "Every option is kept"). Four new global slots (Starlight coin, sticker style, skill nodes, Wardrobe style) take B1/B6/B7/B10 with option A as the starter. B2 gives five garden sets, B3/B4 five exclusives each, B5 twenty loose items, B8/B9 are spread over borders and finishes. Corners (B9) are redrawn in pixel art. Drafts: branches `art/beta-batch-options` and `ui/wardrobe-options`. **Art built** (#68 B1–B5, and the follow-up PR for B6–B10): every id, slot, level count and the particle / corner assignments are in `docs/COSMETIC_ART_IDS.md`; next are the data (mechanics) and the page wiring of the UI-skin art and pixel numbers (ui).

Decided with the user in the graphics session (2026-11-07).

- **Art style: pixel art** (DESIGN 13). Every existing vector asset is redrawn as pixel art and approved by the user one by one. Code phases keep using the current art until an asset here is marked approved; do not build new vector art. When an asset is approved, its pixel version replaces the vector one in its phase.
- **Tiles (A13):** approved 2026-11-08. The user's own concept sheets (floating islands, three mines and three trees, five stages each) are converted to 58 × 64 hand-made sprites in `src/renderer/src/art/pixel/hand/` by `design/pixel/concept-tiles/convert_tiles.py`; the bake copies them instead of drawing the vector tiles.

Approval queue (in order). Every asset is approved for the beta and built into the game (#43, #45, #48: baked by `scripts/art/bake-pixels.mjs`); mockups: [Pixel Art Batch](https://claude.ai/artifact/NLU6j4dSGJZe587PWGDXdK) and [Pixel Art Round 2](https://claude.ai/artifact/MP6BXhgJFWdRJDdyLiNcs6).

Build note for the code phases: ship the sprites as pixel data on their native grid (pre-rendered at build time from the approved drawings) and draw them at whole-number scale. The browser renderers used for the mockups are in the graphics session's shared notes. Post-beta polish: a Brave Frontier pass on the tiles, and smoother tone shapes on the largest boss areas (the Lich's robe shows tone rings).

| Asset                                                                                      | Status                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production tiles: tree and crystal mine, five stages                                       | **In the game** (#45, `treeTile`/`mineTile` with a stage; passing the stage is a ui task): 58 × 64, gem-coloured leaves, crystal mine; Brave Frontier pass after the beta                                                      |
| Card items and weapons, by rarity (swords, scimitar, sickle, bow, cleaver, pickaxes, axes) | **In the game** (#43): 100 × 120, black outline, light extra shading ([Pixel Weapons](https://claude.ai/artifact/LXvcdDWADiGMDBKkTVLbrZ), treatment E+)                                                                        |
| Unique evolutions (Flameblade, Rootbloom Staff, Soul Reaper)                               | **In the game** (#43, `evolutionArt`; placing it on ★6 cards is a ui task): card-item treatment, animated in the effects style                                                                                                 |
| Card frames by tier                                                                        | **In the game** (#43): frame ladder (material, sockets, crest; motion on Gold and Prismatic), DESIGN 13 ([Frame Ladder](https://claude.ai/artifact/BWviG6R6coWmmMLKCCY8ga))                                                    |
| Gem coins and resource icons                                                               | **In the game** (#45, coin metal = mastery tier once mechanics exposes it): 48 × 48, one big faceted gem, no carving lines                                                                                                     |
| Bosses and the Crystal Sentinel                                                            | **In the game** (#48): 160 px, Brave Frontier technique, soft aura, idle effects                                                                                                                                               |
| Element effects and hit animations                                                         | **In the game** (#48): pixel effects with a soft glow (P5 C), thin slash                                                                                                                                                       |
| Mastery medals, forged edges, navigation plaques                                           | **In the game** (#45, `masteryMedal`, `forgedEdge`, `navPlaque`; placing them is a ui task): 48 px medals with holo on Gold and Prismatic; forged-edge ladder; 64 px plaques                                                   |
| Achievement stickers (B6 redo)                                                             | **Approved by the user 2026-11-08** (Option 5 "Mini card", `design/pixel/achievement-stickers/`): 29 pictures redrawn in the cel style; style a = mini card; b–e = silver, gold, legendary, prismatic card on the frame ladder |

## Phase 9 balance table

Sim, 5 seeds, 45 h (`npm run sim -- --hours 45 --seeds 5`). Median of the seeds against the DESIGN 11.7 target; a milestone not reached by a seed counts as later than every seed that reached it.

| Milestone                     | Target | Sim median | Spread (min-max) | Reached | Median / target |
| ----------------------------- | ------ | ---------- | ---------------- | ------- | --------------- |
| First dungeon cleared         | 0.5 h  | 0.56 h     | 0.56-0.56 h      | 5/5     | 112%            |
| First summon                  | 0.75 h | 0.56 h     | 0.56-0.56 h      | 5/5     | 75%             |
| First Silver card             | 1.5 h  | 1.63 h     | 1.42-2.87 h      | 5/5     | 109%            |
| Dungeon 2 cleared             | 3 h    | 2.86 h     | 2.80-3.98 h      | 5/5     | 95%             |
| First Gold card               | 5 h    | 4.58 h     | 4.01-5.58 h      | 5/5     | 92%             |
| First ★6 (Gold)               | 7 h    | 7.76 h     | 7.06-9.26 h      | 5/5     | 111%            |
| First prestige (Ascension)    | 8 h    | 9.08 h     | 8.23-9.63 h      | 5/5     | 114%            |
| Dungeon 3 cleared             | 12 h   | 9.70 h     | 9.30-11.31 h     | 5/5     | 81%             |
| Glimmer Trial cleared         | 15 h   | 17.48 h    | 12.58-20.60 h    | 5/5     | 117%            |
| First Prismatic card          | 25 h   | 19.99 h    | 15.08-22.91 h    | 5/5     | 80%             |
| First max-level cosmetic      | 20 h   | 22.17 h    | 19.07-22.87 h    | 4/5     | 111%            |
| Beta content mostly exhausted | 40 h   | 31.59 h    | 23.80-31.59 h    | 3/5     | 79%             |

DPS against Mossy Cellar (median seed): 1 h 3.4e3, 2 h 1.7e4, 4 h 6.2e4, 8 h 1.5e5, 12 h 1.7e5, 20 h 2.6e5, 40 h 4.6e5. "First ★6" is the first Gold ★6; "mostly exhausted" needs every other milestone, every card and a Prismatic ★6 card. The sim's summon (0.56 h, 75%) is the edge of the 25% band; Silver, Trial, Prismatic and exhausted spread widely between seeds. Tuning decisions: DESIGN 12.25.

## Economy redesign (PR 1 of 4)

Three loops: Money (dungeons), materials (production, card upgrades), crystals (premium, kept through ascension). DESIGN 11.13 and 12.27. The Phase 9 table above is from before this change; the full pacing re-tune is pending (14 h sanity run: first clear 0.51 h, Silver 1.65 h, Dungeon 2 3.08 h, Gold 4.5 h, Dungeon 3 9.6 h; first ascension and Prismatic off target).

## Notes

- `portals.json` Card Portal pity is now the decided "Legendary+ at 90" plus the 10-pull Rare guarantee (Phase 4a).
- The review page lives on branch `design/beta-review-mockups` (`design/beta-review/`, build with `npx vite build -c design/beta-review/vite.config.mts`). Its `growth.ts` tiles are superseded by "Decided visuals" above.
- Phase 10 brief was cut off after "pre-filled GitHub issue with version, save summary and". Default: also include the last 50 log lines and OS / app info (DESIGN 12).

## After the beta

Known follow-ups, not blocking v0.3.0:

- Pixel font: add `/`, `s`, `h`, `m`, `:` so rates ("+1.05/s") and durations can use pixel numerals; a red hurt variant for pixel ticks.
- Sticker art only covers the 29 current achievements; new achievements need a sticker.
- Settings layout was picked by the agent (option B); the user can swap it (`design/settings/options.html`).
- Pacing: "mostly exhausted" lands at about 28 h (target 40 h) and the first Gold ★6 near the top of the band; Brave Frontier polish pass on tiles and the large boss areas.
