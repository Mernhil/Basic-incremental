# Castle Stone shell (and Tavern Wood table)

Approved 2026-11-13 by the user:

- PixelLab mockup **1b Castle Stone** becomes the **new default look** for everyone (the starter table).
- **Plum Pixel** stays as a table every player owns, so they can switch back to it.
- Mockup **1a Tavern Wood** becomes a new unlockable Wardrobe table, built the same way.

The rules are already written: DESIGN §8 (Starter set; Plum Pixel and Tavern Wood tables), UI_RULES §2 Shell look, ASSET_RULES §5 Shell pictures. This plan is how to build them. The layout does not change: this is a re-skin of mockup 4a and every full view.

## Sources

- Mockups and parts (local, never committed): `C:/Basic Incremental/design/options/ui-medieval/`
  - `1b-castle-stone.png` and `1a-tavern-wood.png`: the full 688 × 384 pictures.
  - `current.png`: today's screen. `pieces.json`: the layout boxes it was made from.
  - `1b-parts/Medieval_UI_B_-_castle_stone/elements/*.png` and `1a-parts/.../elements/*.png`: 39 parts each. `menu_icon/` and `Goals_button/` hold `hover.png` and `pressed.png`.
  - `pick.html` and `states.html`: the pages the user saw.
- The same assets are in the user's PixelLab account:
  - UI asset ids: 1b template `1530d78f-6d35-4d11-8953-e98e386e76be`, 1a template `e4cd5643-8e9f-44ee-b35e-a64320f59f99`.
  - ZIP: `https://api.pixellab.ai/mcp/ui-assets/<id>/zip`.
- **PixelLab budget: at most 500 generations for this whole UI rework** (user, 2026-11-13: "lets not waste too many the absolute limit for the whole ui rework is 500"). The account had 2,496.4 left on 2026-11-13 (Tier 2, resets 2026-12-08).
  - Before each paid call, write its price (the tool descriptions give it) and the running total in a log, `design/options/ui-medieval/spend.md` (local).
  - Check `get_balance` at the start and the end; the PR states the total spent.
  - Never go past 500. If the work needs more, stop and ask the user.
  - Free first: `pixelart_workbench`, `vfx_workbench` and `update_ui_asset` (9-slices, splitting) cost nothing, so cleaning, erasing and cutting are always done with them.
  - Never regenerate the 1a or 1b pictures the user picked (memory: ask before changing approved art).
  - Paid calls are allowed only for the pieces listed under "Paid pieces" below.

## Paid pieces (planned about 200 of the 500)

| What                                                                                                                                                                                                                                         | Tool                                                                        | Estimate                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hover, pressed and disabled states for the remaining 1b buttons and plates (Details, sound, Tools, the wing plates, the chips), one call per group so they match                                                                             | `create_ui_states` on the split 1b elements                                 | 3 calls × 10–25 ≈ 50                                                             |
| The pieces the full views need that the mockup does not have: tabs and chips, a toggle and a checkbox, a scrollbar, a slider, a dialog with a title bar, a tooltip, a progress bar. Pass the 1b full picture as `style_image` so they match. | `create_ui_asset` with `elements`, at 256 × 256 (10 each) or 341 × 341 (15) | 3–4 sheets ≈ 45                                                                  |
| Their states                                                                                                                                                                                                                                 | `create_ui_states`                                                          | ≈ 15                                                                             |
| The same three groups for 1a Tavern Wood                                                                                                                                                                                                     | as above                                                                    | ≈ 90                                                                             |
| **Planned total**                                                                                                                                                                                                                            |                                                                             | **≈ 200**, leaving about 300 of the cap for a retry when a sheet comes out wrong |

The paid pieces are new art. They are shown to the user at 4× on a picker page (CLAUDE.md, Workflow) before they go into the game.

## Part mapping (1b; 1a uses the same names)

| Game piece                    | 1b part                                                             | Notes                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Header bar                    | `top_resource_bar`                                                  | Middle tiles horizontally.                                                                                                 |
| Level badge, XP bar           | `level_badge`, `xp_bar`                                             | Erase "LEVEL 1" and "XP".                                                                                                  |
| Goals, Details, sound buttons | `Goals_button` (+ hover, pressed), `Details_button`, `sound_button` | Erase the words; one blank button 9-slice serves all `.px-btn`.                                                            |
| Money and scroll chips        | `gold_counter`, `blue_scroll_counter`, `pink_scroll_counter`        | Erase the 0s and icons; our coin and crystal icons go on top.                                                              |
| Wings (Logging, Mining)       | `left_side_panel_Logging`, `right_side_panel_Mining`                | The cloth banner is the wing title; erase its word. The crop includes the rows: erase them or 9-slice from the edges only. |
| Wing plates                   | `resource_row*`                                                     | Erase the icons. Also the `.px-tile` look in views.                                                                        |
| Tools line                    | `Tools_button*`                                                     | Erase "TOOLS".                                                                                                             |
| Dungeon window border         | `central_dungeon_arena_window`                                      | Rune pillars and torches as the left and right borders. Our arena room stays inside.                                       |
| Floor plate                   | `floor_name_plate`                                                  | Erase "FLOOR Name Plate". Also the view title bar plate.                                                                   |
| Readouts (left column)        | `stat_plate*`                                                       | Erase "HP" and "ATK". Also `.px-well`.                                                                                     |
| This fight sheet              | `fight_stats_sheet`                                                 | Slate scroll. Also big panels in views (`.px-panel`).                                                                      |
| Enemy card frame              | `enemy_card`                                                        | Erase the figure. Our foe sprite and HP bar go inside.                                                                     |
| Dock                          | `bottom_navigation_bar`                                             | Middle tiles.                                                                                                              |
| Dock pile sockets             | `menu_icon` (+ hover, pressed)                                      | Erase the rune gem. The pile's own icon goes inside.                                                                       |
| Player card                   | not used                                                            | Our cards keep their own frames (approved art).                                                                            |

## Steps

1. **Set up.** Work in worktree `C:/bi-castle-stone` on the branch `ui/castle-stone-shell`, which already holds this plan and the rule edits.
   - `git fetch`, then merge `origin/main` into the branch.
   - `npm ci`, then Electron's install script (memory: worktree setup).
   - Read CLAUDE.md, PROJECT_OVERVIEW, UI_RULES, ASSET_RULES §5 and §6, and DESIGN §8.
2. **Clean the parts (free).** For each 1b part in the mapping, erase the placeholder text, figures and rune letters with `pixelart_workbench`, filling with the part's own face colour. Nothing is recoloured, redrawn or upscaled.
   - Save the results to `src/renderer/src/art/shell/stone/<piece>.png`, one file per game piece, with clean names.
   - Make the "Paid pieces" (above) for 1b, inside the budget, and log each call.
   - Show the cleaned parts and the new pieces to the user together, on one picker page at 4×, before wiring them in.
3. **Shell art as data** (CLAUDE.md rule 6). Add `src/data/content/shellArt.json`, validated by a schema in `src/data/schemas.ts`. Each table that has picture frames lists, per piece, its image and 9-slice insets in art pixels, and whether its middle stretches or tiles. Use `update_ui_asset(nine_slice=…)` only if it helps to read the insets; it is free.
4. **Recipe.** Add a table recipe `shell-pictures` (registry plus a new `theme/shellPictures.css` imported next to `frames.css`).
   - When the worn table has shell art, the `.px-panel` / `.px-tile` / `.px-btn` / `.px-well` recipe and the header, dock, wings, window, floor plate, sheet and enemy card switch from the box-shadow pixel frame to `border-image` 9-slices.
   - The image URLs and insets come from the data, written as CSS variables by `theme/apply.ts`.
   - Art scale: a whole number of device pixels per art pixel. Work it out from `--dpr` the way `frames.css` does for `--fs`: about 2 CSS px per art px at 100%, and whole device pixels at 125, 150 and 200%. `node scripts/check-pixel-scale.mjs` must pass.
   - Hover and pressed: the PixelLab states for the socket and the button, elsewhere `filter: brightness(1.15)` and a one-step `translateY`. Disabled: dimmed.
   - Only `transform` and `opacity` animate.
   - Tables without shell art (Plum Pixel and the other six) keep `frames.css` exactly as it is.
5. **Dock sockets.** The 1b socket replaces each pile's plaque frame, with the pile's own icon centred inside. Size it with `pixelFit` at the largest whole scale that fits the dock. If 2× does not fit the 132 px dock with the name and hint lines, the dock may grow a little.
6. **Castle Stone table item** (`cosmetics.json`).
   - New `castle_stone_table`, `"starter": true`, in set `gilded_nocturne` in place of `gn_table`. It sets every table token (a test checks this): colours sampled from the 1b picture (stone greys, slate, rune cyan `chrome-accent`, torch orange), the fonts unchanged.
   - `node scripts/a11y-shell.mjs` must pass on every page.
   - `gn_table` (Plum Pixel) loses `starter`, stays Common, and leaves the set or stays in it, whichever keeps the Gilded Nocturne set rules (set detection only counts non-starter items) behaving as today. Check `src/game/theme.ts` and its tests.
   - Starter-token inheritance: the other tables inherit missing tokens from the starter, which is now Castle Stone. Take screenshots of all six other tables before and after. If any changes, give it the tokens it used to inherit, so it looks the same as today.
7. **Save format 31** (CLAUDE.md rule 9; main is at 30 since 0.7.8). Bump `CURRENT_SAVE_VERSION`.
   - The migration adds `gn_table` to `cosmetics.owned`, and so does a new game's base state, so everyone can switch back to it.
   - [Default] A save that explicitly wears `gn_table` has that slot cleared, so it shows the new starter. A test covers both cases.
8. **Tavern Wood.** Repeat steps 2 and 6 for 1a: art in `art/shell/tavern/`, the item `tavern_table`, Legendary, no set, one level, Wardrobe Gate pool (DESIGN §8 Default).
   - 1a has more placeholder content to erase: the numbers, row icons, the goblin and the card's sword.
   - Give the Wardrobe a swatch for both new tables, the way the other tables have one.
9. **Docs in the same PR.**
   - Retag the rules to `[Built]`: DESIGN §8 (two rules), UI_RULES §2 Shell look, ASSET_RULES §5 Shell pictures.
   - Update ASSET_RULES §6 "Screen shell" for picture frames.
   - Update PROJECT_OVERVIEW (the theme, shell, art and save sections).
   - Delete this plan file.
10. **Verify** (CLAUDE.md rule 10):
    - `npm run lint`, `npm run typecheck`, `npm test` and the build.
    - `check-pixel-scale.mjs` and `a11y-shell.mjs`.
    - Screenshots at 1280 × 720, at 100% and 150%: the table plus the Cards, Summon, Wardrobe, Dungeons and Settings views, with Castle Stone worn, Tavern Wood worn and Plum Pixel worn.
    - Show them to the user in chat next to `1b-castle-stone.png`, and wait for their OK before merging (memory: previews before layout changes).
11. **PR and merge.** Follow the GitHub workflow in CLAUDE.md: PR summary with the DESIGN tags changed and the save bump, branch up to date with `main`, a real green CI, squash-merge, remove the worktree. Then tell the user the work is merged but not released yet (memory: release after merge).

## Paired prompt (for a new Code session; Sonnet, medium effort; switch to Opus if the CSS gets stuck)

> Implement `docs/plans/castle-stone-shell.md` on the existing branch `ui/castle-stone-shell` in the worktree `C:/bi-castle-stone` (create it from that branch if it is missing). The user approved it on 2026-11-13: PixelLab mockup 1b Castle Stone becomes the default look of the whole game in the same layout, Plum Pixel stays as an owned table, and 1a Tavern Wood becomes an unlockable table. The rules are already in DESIGN §8, UI_RULES §2 Shell look and ASSET_RULES §5 Shell pictures. Follow the plan's steps in order and run them to the end without asking for a go-ahead per step. The exceptions are the two show-and-wait points: the cleaned parts (step 2) and the final screenshots before merge (step 10). PixelLab: at most 500 generations for the whole UI rework (user's hard cap). Spend only on the plan's "Paid pieces", log every paid call with its price and running total, show the new pieces to the user before using them, and stop and ask before going past 500.
