# UI style plan: Carved Oak (working name)

Status: look approved by the user on three real screens (Dungeon, Cards, Summon), 2026-11-16. Not built. The build session copies this file to `docs/plans/ui-style-carved-oak.md` as its first commit and deletes it in the last PR.

## 1. What was approved

Pictures: `design/options/ui-style/8e-*.png` (table, Dungeon view with the Weapon panel, Cards, Summon; 1920×1010 and 1280×720), with `50-*.png` as today's look.

- The layout does not change. Only the look of panels, plates, readouts, buttons, tabs, the header and the dock.
- Panels are **flat cream** (`#f6ead0`), no speckle or grain inside them, with **dark brown ink** (`#2a1c10`, muted `#6b5133`).
- Big sheets and the dungeon window wear the **carved wood edge of the wood card kit**, thinned to 13 px, with **gilded corner caps** over the corner joins (user: "a bit thinner ... more subtle", "gild those corners so the transition feels more smooth").
- Small plates and tiles wear a thin 5 px wood edge.
- Buttons, tabs, chips and readouts are light cream with a gold edge. The usable action (today's gold button, a selected tab or chip) is **red with a gold edge and cream text**. A button that cannot be used is flat tan.
- The header and the dock are dark wood planks; the table behind everything is warm near-black (`#17110d`).
- The level badge on the Weapon panel is a dark brown hexagon with the number in the card's tier colour (user: the pale badge "doesnt stand out").
- The XP text on the Weapon panel moves to the top-right corner of the ring's box, clear of the ring (user: "misplaced"). This overlap is in 0.7.20 today, whatever the style.

What the user's this-or-that answers were (keep to these when a new piece is needed): panels light, surfaces flat, mood warm, buttons light, decoration ornate, header and dock textured. No preference on frame thickness, readout style, a frame round the dungeon window, or how much changes.

## 2. Method (the reason Castle Stone failed, and what replaces it)

Castle Stone used screen-sized pictures stretched over the layout. This style uses **small 9-slice pieces at exact pixel size, tiled, never stretched**.

- Each piece is one PNG laid out `[corner | tile | corner]` in both directions.
- It is drawn with `border: 0 solid transparent; border-image: url(piece) <corner> fill / <corner>px / <outset>px repeat;`. The border width stays 0, so **no element changes size or position**. The frame hangs outside the box by `outset`.
- The previews proved this in the running game by injected CSS (`design/options/ui-style/tools/styles.mjs`, style `8e`).
- Every frame in the game already goes through one shared rule, `src/renderer/src/theme/frames.css` (the `:is(...)` list under "the drawing rule"). The style swaps that rule's box-shadow drawing for the pieces; it does not touch each page.
- Wiring: the dormant `shell-<id>` recipe hook (`theme/apply.ts`, ASSET_RULES §6 "Screen shell") is the switch. A table item that wears `shell-oak` gets the piece rules; any other table keeps `frames.css` as it is today.

Everything is **free**: Pillow scripts and cuts from `src/renderer/src/art/pixel/hand/kit-wood.png` (colours for the gold caps from `kit-gold.png`). **No PixelLab call is needed or allowed.** If a build session thinks one is needed, it stops and asks the user in chat with the price; it never spends.

## 3. Pieces (sizes in CSS px at 100% Windows scale)

Preview versions are in `design/options/ui-style/pieces/`, drawn by `tools/gen.py` and `tools/gen4.py`. The build redraws them with one clean script, `scripts/shell-art/oak.py`, into `src/renderer/src/art/shell/oak/`.

| # | Piece | File in previews | Sheet | Corner | Tile | Outset | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Sheet frame | `p-big-wood3` | 104×104 | 32 | 40 | 6 | Wood 13 thick (kit columns 27–34 and 40–44 of the left side, rows 100–120 mirrored), gold cap arms 30 long, cream fill |
| 2 | Dungeon window frame | `a-window3` | 104×104 | 32 | 40 | 11 | Same as 1 with an empty centre |
| 3 | Plate frame | `p-plate-wood` | 22×22 | 5 | 12 | 2 | Thin wood, cream fill `#f6ead0` |
| 4 | Tile | `p-tile-wood` | 22×22 | 5 | 12 | 2 | Thin wood, lighter fill `#fdf5df` |
| 5 | Readout pill | `p-pill-gold` | 32×32 | 8 | 16 | 2 | Cream, gold edge, 2 px notch (drawn at 2× art scale) |
| 6 | Button | `p-btn` | 32×32 | 8 | 16 | 2 | `#fdf5df`, gold edge |
| 7 | Action button | `p-gold` | 32×32 | 8 | 16 | 2 | Red `#a8322a`, gold edge, cream text `#fff1d0` |
| 8 | Unusable button | `p-dark` | 32×32 | 8 | 16 | 2 | Tan `#bfad86`, ink `#5a4528` |
| 9 | Header and dock planks | `a-bar` | 64×32 | — | whole | — | Background tile |

Pieces still to draw in the build, same method, each shown to the user in a real screenshot before its PR merges:

- The four corner caps each with their own lighting (the previews mirror the top-left one).
- Hover, pressed and keyboard-focus states for pieces 6 and 7.
- Tooltip, toast, dialog (welcome back, reveal, confirms), progress-bar track, scrollbar, checkbox and slider, the select's drop-down arrow.
- The round health gauges in the stat sheet (dark centres on cream today).

## 4. Colour is the real work

The pieces are small. The large job is that the game's text was written for dark panels: about 12,000 lines of CSS with hardcoded light colours (for example the XP text `#9fd8ff`, the pale level badge, muted plum labels). The previews forced dark ink with one blanket rule; the build must not.

- Set the table's tokens properly (`frame-bg`, `frame-ink`, `frame-ink-muted`, `frame-raised`, `frame-edge`, `frame-hi`, `frame-lo`, `chrome-*`, `tip-*`; ASSET_RULES §6) and make every component read tokens instead of hardcoded colours.
- Text that sits on the dark table and not on a sheet (wing titles, the Cards toolbar line "Shards · Sort · n found", view titles) keeps light ink.
- Run `node scripts/a11y-shell.mjs` on every view for this table and fix every contrast failure. Text stays at its current sizes.
- Clean pixels (UI_RULES §1 Whole pixel scales): the pieces must be a whole number of device pixels per art pixel at 100%, 125%, 150% and 200%. Screenshot one screen at each scale before the first PR merges.

## 5. Order of work

Each wave is one PR into `main` that changes nothing for players: the style ships as a table item that no player can get yet (`shell-oak`, hidden) and is worn only with a dev switch. The last PR turns it on. The user sees real screenshots (1920×1010 and 1280×720, test game hidden with `BI_HIDDEN_WINDOW=1`) and says yes before each merge. Nothing is released without the user's yes and a plain list of what the player sees differently.

1. **Foundation and the Dungeon.** `oak.py`, the pieces, the `shell-oak` wiring, the tokens; the table (header, wings, dock, dungeon window) and the Dungeon view with its Dungeons, Weapon and Training panels; the badge and the XP text fix (the XP fix applies to every table).
2. **Cards and Summon.** All five Cards tabs, the detail panel, the skin picker; Summon with its five gates, wishlist, odds, last hand and the reveal show's dialog.
3. **Gathering.** Logging, Mining, the worker picker, Forge, Upgrades and the milestone picks.
4. **The rest.** Wardrobe, Shop, Achievements (the leather book stays as it is), Settings, the Goals popup, Details, the reward track, tooltips, toasts, welcome back, every dialog.
5. **Skill Tree**, after its node-web redesign is built (not built today; not part of this plan until it is).
6. **Turn it on** (section 6), docs, release when the user says so.

## 6. Decided: it replaces the starter (user, 2026-11-16: "Replace starter")

Carved Oak becomes the starter table: every player sees it from the first launch. Plum Pixel stays in the game as a table every existing save owns and a new game also owns, so anyone can wear it again (`[Default]`, Claude: the same rule 0.7.9 used for Plum Pixel under Castle Stone). This needs a save version bump and a migration that gives Plum Pixel to existing saves and leaves a save that wears another table as it is; a save wearing the starter moves to Carved Oak.

Claude's `[Default]`s, to list under Open questions: the name "Carved Oak"; the dormant Castle Stone files (`theme/shellPictures.css`, `content/shellArt.json`, `art/shell/stone/`) are left alone; Tavern Wood (DESIGN §8, `[To build]`) is not touched, though this style covers much of what it was meant to be, which is worth the user's look when the docs are rewritten.

## 7. Docs to rewrite in place (same PRs as the code)

- `docs/UI_RULES.md` §2 **Shell look**: the Carved Oak look and the piece method; Plum Pixel's box-shadow frames described as that table's own look. §3 Open questions: the "UI-skin conventions" line. §4 Changelog: one dated line.
- `docs/ASSET_RULES.md` §5 **Shell pictures**: becomes "Shell pieces" (small 9-slice pieces at exact size, tiled, never stretched, free tools, the kit cuts). §6 **Screen shell**: the `shell-<id>` paragraph and the token table.
- `docs/DESIGN.md` §8: the starter set line or a new table rule, per section 6; Open questions; Changelog. Tags move with the code.
- `docs/PROJECT_OVERVIEW.md` in every PR that touches `src/`.
- `src/data/content/cosmetics.json` and schemas for the new table item; a save version bump and migration only if the starter changes (section 6).

## 8. Done means

- Every view in waves 1 to 4 wears the style with no layout shift, no stretched or blurred piece and no contrast failure, at 1920×1010 and 1280×720 and at 100%, 125%, 150% and 200%.
- `npm run lint`, `npm run typecheck`, `npm test` and the build pass; CI green on a branch up to date with `main`.
- The user has said yes to each wave's screenshots and to turning it on.
