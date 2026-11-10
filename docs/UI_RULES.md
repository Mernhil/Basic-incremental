# Basic Incremental — UI Rules

The one document for the interface: screens, layout, the shell, tooltips, on-screen copy, themes, responsive and device-pixel rules, and the conventions the `ui` agent follows. Read it before any UI change. Art (sprites, palettes, effects, animation) is in `docs/ASSET_RULES.md`; game rules and numbers are in `docs/DESIGN.md`.

## How this document works

Same rules as `docs/DESIGN.md` ("How this document works"): one version of each rule, every rule starts with a status tag (`[Built]`, `[Differs]`, `[To build]`, `[Default]` or `[Default · in game]`, `[Proposed]`), a change rewrites the rule where it lives, tags move with the code in the same PR, only the user decides (gaps are written as `[Default]` and listed under Open questions), and a changed or dropped rule gets one dated line in the Changelog. `npm run lint` runs `scripts/check-design.mjs`, which checks this file too. Section references like "DESIGN §5" point to `docs/DESIGN.md`.

## 1. Working conventions

- [Built] **One UI rulebook.** This file is the only document for screens, layout and UI conventions. Art rules are in `docs/ASSET_RULES.md`; the game design is in `docs/DESIGN.md`. Read this file before any UI change.
- [Built] **Who builds UI.** UI lives in `src/renderer/**` outside the art folders and in `design/**` outside `design/pixel`; the optional `ui` agent (`.claude/agents/ui.md`) can help. Sprites and effects are art (`docs/ASSET_RULES.md`), rules and numbers are in `src/game` and `src/data`. A screen that needs a value the game does not expose yet gets the value added to the game side first (types wanted and why), not a UI-side workaround.
- [Built] **Five options first.** A design, UI or graphics brainstorm in the Claude Desktop home chat shows the user 5 options that differ in ways that matter (layout, colour, density, motion, ornament) as mockups or screenshots, and the user picks before the final version is built. Small direct jobs in Code need no options. Options are never merged into `main`.
- [Built] **Skills.** UI work uses the frontend-design skill and the Design plugin skills (critique, design system, accessibility, UX copy).
- [Built] **Game data through public entry points.** The renderer imports game code only from `src/game` and `src/data` index files, never from files inside them (ESLint enforces it).
- [Built] **Adapters, no rules.** Display logic lives in adapters (`pages/*Adapter.ts`, `pages/*Model.ts`) that turn game state into view models. No game rules in the renderer.
- [Built] **Whole pixel scales.** Layouts that hold pixel art size it with `src/renderer/src/ui/pixelScale.ts` and `pixelFit.ts` so every sprite is a whole number of device pixels per art pixel at 100%, 125%, 150% and 200% (the rule itself is Clean pixels, ASSET_RULES.md §5). A layout that cannot fit the wanted scale takes the nearest whole one and reflows.
- [Built] **Verify UI changes.** `npm run lint`, `npm run typecheck`, `npm test` and a run or screenshot of the changed screen come before saying it is done; one screenshot set per PR.
- [Built] **Branches.** UI work goes on a branch `ui/<task>` in its own worktree, with a PR and green CI (GitHub workflow in `CLAUDE.md`).

## 2. Interface and screens

- [Built] **Shell look** (user, 2026-11-10). Every page uses the starter table's pixel-frame shell (DESIGN.md §8).
  - Panels are pixel frames: a dark edge with notched corners, a light top edge and a dark bottom edge, and no rounded corners. The frame step is a whole number of device pixels (about 4 CSS px at 100%).
  - Buttons have the same notched shape: gold when they can be used, dark plum when not.
  - Pixelify Sans is used only at 18 px and up, for headings and large numbers. All other text, small numbers included, is Atkinson Hyperlegible.
  - Colours, fonts and frame values are table tokens (ASSET_RULES.md §6), so another table item can re-skin all of it.
  - The floating-number cosmetics are not part of the shell and keep their own look.
- [Built] **Header bar.** Account level with its XP bar, the mute toggle and only three resources: Money, Summon Crystals and Glamour Crystals, each with its rate. Everything else (gems, Cores, Frost Sigils, Glimmer Dust, Facet Shards, Starlight) sits behind a **Details** button, grouped as tree materials, mine materials, dungeon materials and prestige, each with its amount, rate, mastery and use. Crystals are drawn larger than Money and their pickups get a bigger moment; coins of other resources fly to the Details button. Money is the largest number in the header, in the display font.
- [Built] **Sidebar rail**, in this order: Home, Cards, Production, Dungeons, Summon, Skill Tree, Wardrobe, Achievements, Shop, Settings (user, 2026-11-10).
  - The rail is narrow and shows the approved navigation plaques (64 × 64, ASSET_RULES.md §5) with no text under them.
  - The current page gets a gold marker beside its plaque.
  - Each plaque shows its page name as a tooltip on hover and on keyboard focus, and that name is also its accessible name.
- [Built] **Panels and tooltips.** Framed panels on wide, multi-panel screens that use the desktop width. Hover tooltips on stats, items, costs and modifiers, with a breakdown by source.
- [Built] **Stage first.** The Dungeons and Production pages are the focus of the game, so they are live stages, not menus; management goes below or in a side rail.
- [Built] **Home** is a command centre: three live mini-stages (fight, logging, mining) with their rates, each opening its page, and the goal tracker on top.
- [Built] **Dungeons** is a full-bleed arena. Floors, the weapon panel (DESIGN §5) and the upgrade shelf live in a drawer that slides up from the bottom; DPS, kills per minute and time-to-kill sit in the top-right corner.
- [Built] **Production** is the pixel ledger: two bands, Logging and Mining. Each band has its own main card at 1x in its loadout fan on the left and its rows on the right. The upgrade shelf is a drawer at the bottom (user, 2026-11-10; the rules are in DESIGN.md §4).
- [Built] **Loadout fan.** A loadout shows as a fan: the main card in front and up to three support cards behind it, each peeking out at the side. A click on a support (or on its line in the list beside it) pops it out in front as a full card with its effect written out; a click on it again, anywhere else or Escape puts it back. Cards keep whole device-pixel scales and nothing is rotated, so the art stays crisp (ASSET_RULES.md §5). Production shows one fan per job band, at 1x (user, 2026-11-10).
- [Built] The same fan on the Dungeons fight screen, for the party beside the arena: the main card in front (2x on a window of at least 1280 × 720, the grid size on a smaller one; with the boss, the main card is the largest thing on the screen; user, 2026-11-10, option "Hero fan"), the supports behind it, the burst gauge under the main card and the shared health bar under the fan. A support plate reads "Support"; its effect is read in the pop-out. The lunge and knockout moves are slides only, nothing rotates.
- [Built] **Dungeon arena.** The boss is large and centred with an idle bob and its stacked HP bars. Every hit flashes and squashes it, big hits shake, and a finished HP bar shatters. The loadout faces the boss and lunges on its attacks, with its health bar visible. Boss attacks land on the cards with red numbers and a shake; a knockout is a visible moment with its countdown. The burst gauge sits on the main card; the signature attack gets a screen flash, a big number and a brief slow-down. On a kill the boss pops and its drops spill out as coins, rest a beat, then fly to the header; a rare drop gets a light beam, a slow-down and a toast.
- [Built] **Production field.** Every strike shows "+n" off its tree or mine and the coins fly to the header; a harvest burst is a wave with one big total. The main card lunges by its pattern and its supports flash when they help. Reduced motion drops lunges, shakes and flashes.
- [Built] **Numbers.** Header counters roll smoothly and pulse when coins land. Floating numbers use the number style, attack and tick cosmetics, never hardcoded looks; their size follows the hit against the current average, and crits and signature attacks look different. The starter style is sticker numerals: chunky digits with a white outline, a drop shadow and a tilt, bouncing in place.
- [Built] **Buying.** Every buy button previews its effect (for example "DPS 12 → 13, time-to-kill 11h → 2h"). One ×1 / ×10 / ×100 / Max toggle at the right end of the goals strip sets how many levels every level line buys (DESIGN.md §4); affordable buttons glow and a small bar fills toward the next affordable level.
- [Built] Max buys as many levels as are affordable (at least one) and otherwise shows the next level; a ×N buy buys exactly N or nothing.
- [Built] **Welcome back.** After offline progress, a card fan deals one small card per category (time away and the cap, resources, kills, knockouts, drops, card XP and levels, mastery tiers), then Collect sends the coins to the header.
- [Built] **Performance.** At most about 30 popups at once, rapid numbers merged, animation paused when the page or window is hidden, one shared animation loop. Under reduced motion: no shake, flash or slow-down, and numbers fade in place.
- [Built] **Screen picks.** Summon: Deck and Table, Nocturne panel (two card decks whose thickness is the pity, odds in the middle, last hand below). Wardrobe: a mannequin card with the seven slots around it and the item grid below. Skill tree: a radial constellation with gem nodes; card enhancements are a small star chart on the card. Ascension: a prismatic ring gate.
- [Built] **Shop page: Signboards** (user, 2026-11-10; replaces the awnings of the Market Stalls). Three counters side by side, each hanging under a wooden signboard on two chains: Starlight, Shards and Ascension.
  - The counters are pixel-framed shelves, and every counter is visible at once.
  - Starlight: permanent levels, each line with its level bar and price. A buy slams a BOUGHT stamp on the line.
  - Shards: card copies as tiles, then supplies and exclusives.
  - Ascension: the pixel ring around the Starlight coin, the Starlight gain, the Ascend button with its confirm step, and the Kept and Reset lists.
  - The stamp, ring and coin stay the candy pixel sprites (`art/pixel/hand/shop-*`). There are no awnings, and their sprites are deleted (user, 2026-11-10).
  - Reduced motion drops the ring, coin and stamp motion.
- [Built] **Achievements: a leather sticker book** (user, 2026-11-10).
  - The book has a stitched leather cover with gold corner caps, ruled parchment pages, a spine down the middle and ribbon bookmarks.
  - Each chapter has a coloured ribbon title with its count, and its stickers sit in a grid under it.
  - A locked sticker shows the locked sticker art.
- [Built] **Dungeons arena layout** (user, 2026-11-10, option "Hero fan").
  - The arena fills the page under the goals strip, and its background comes from the dungeon (DESIGN.md §6).
  - The party fan sits on the left, with the signature gauge and the party health bar under it.
  - The boss is at 2x, right of centre, with its name, stacked HP bar and ×N count above it.
  - Damage per second, kills per minute and time to kill sit in the top-right corner.
  - Drops land on the floor.
  - The drawer handle runs along the bottom, with Dungeons, Weapon and Upgrades tabs.
- [Built] **Settings** has reduced motion, number format, autosave interval, export / import, sound volumes and Report an issue.
- [Built] Settings layout and options: four panels (Display, Sound, Save, Help); reduced motion follows Windows by default; number formats scientific (default), suffixes or engineering, numbers under a million always in full; autosave every 10 s to 5 min (30 s default). These preferences are stored per player, not in the save.
- [Built] **Sharp cards.** The Cards collection shows the full card, the same card as everywhere else, at a whole scale: 132 × 186 (1x) four across on a standard window, 2x (264 × 372) four across when they fit (a 1080p window), fewer across and reflowing when the window is narrow (Review gate pick "Full card, 1x", 2026-11-08). Card text is real text, with a floor of 11 CSS px on the small card; its job label is left to the filters. Next to the grid, the detail panel shows the card at 2x with the weapon panel on it (DESIGN §5), the card's abilities and cost, its enhancements and the loadout buttons.
- [Built] **Owned cards first** (user, 2026-11-10). The Cards collection shows the owned cards first, then the unowned cards grouped by weapon type, each group with its collected count ("Your cards (3)", then "Sword: 1 of 7 collected" and so on, in the `items.json` order).

## 3. Open questions

Everything tagged `[Proposed]` or `[Default]` waits here for the user.

Nothing is `[Proposed]` or `[Default]` at the moment.

Not decided yet (no rule exists, ask before inventing one): on-screen copy tone and wording rules, UI-skin conventions beyond the shell look and what Wardrobe cosmetics define (DESIGN.md §8), and keyboard and gamepad navigation.

## 4. Changelog

- 2026-11-08 — Created this file: DESIGN section 11 "Interface and screens" and the UI conventions from the `ui` agent and `CLAUDE.md` moved here; no rule changed (user: exactly two graphics documents).
- 2026-11-10 — Tag drift fixed after the direction review, no rule changed: Buying names the one buy toggle in the goals strip instead of one per level line (§2).
- 2026-11-10 — UI rework (user, four rounds of mockups): the shell look, the sidebar as a plaque rail, Production as the pixel ledger with one fan per job, the Dungeons main card at 2x from 1280 × 720 and the Hero fan arena, the Shop under signboards instead of awnings, Achievements as a leather book.
- 2026-11-10 — Scope 1 (user): Buy Max, the Settings layout and Sharp cards confirmed; the unused awning sprites and their rule deleted; the Cards collection shows owned cards first; double-detail sprites cut (§2, §3).
