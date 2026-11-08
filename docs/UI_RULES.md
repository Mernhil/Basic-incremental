# Basic Incremental — UI Rules

The one document for the interface: screens, layout, the shell, tooltips, on-screen copy, themes, responsive and device-pixel rules, and the conventions the `ui` agent follows. Read it before any UI change. Art (sprites, palettes, effects, animation) is in `docs/ASSET_RULES.md`; game rules and numbers are in `docs/DESIGN.md`.

## How this document works

Same rules as `docs/DESIGN.md` ("How this document works"): one version of each rule, every rule starts with a status tag (`[Built]`, `[Differs]`, `[To build]`, `[Default]` or `[Default · in game]`, `[Proposed]`), a change rewrites the rule where it lives, tags move with the code in the same PR, only the user decides (gaps are written as `[Default]` and listed under Open questions), and a changed or dropped rule gets one dated line in the Changelog. `npm run lint` runs `scripts/check-design.mjs`, which checks this file too. Section references like "DESIGN §5" point to `docs/DESIGN.md`.

## 1. Working conventions

- [Built] **One UI rulebook.** This file is the only document for screens, layout and UI conventions. Art rules are in `docs/ASSET_RULES.md`; the game design is in `docs/DESIGN.md`. Read this file before any UI change.
- [Built] **Who builds UI.** The `ui` agent (`.claude/agents/ui.md`) owns `src/renderer/**` except the art folders and `design/**` except `design/pixel`. Sprites and effects belong to the `pixel-art` agent, rules and numbers to `mechanics` (`docs/WORK_SPLIT.md`). A screen that needs a value the game does not expose yet gets a mechanics request (types wanted and why), not a UI-side workaround.
- [Built] **Five options first.** Every design, UI or graphics change shows the user 5 options that differ in ways that matter (layout, colour, density, motion, ornament) as mockups or screenshots, and the user picks before the final version is built. Options are never merged into `main`.
- [Built] **Skills.** UI work uses the frontend-design skill and the Design plugin skills (critique, design system, accessibility, UX copy).
- [Built] **Game data through public entry points.** The renderer imports game code only from `src/game` and `src/data` index files, never from files inside them (ESLint enforces it).
- [Built] **Adapters, no rules.** Display logic lives in adapters (`pages/*Adapter.ts`, `pages/*Model.ts`) that turn game state into view models. No game rules in the renderer.
- [Built] **Whole pixel scales.** Layouts that hold pixel art size it with `src/renderer/src/ui/pixelScale.ts` and `pixelFit.ts` so every sprite is a whole number of device pixels per art pixel at 100%, 125%, 150% and 200% (the rule itself is Clean pixels, DESIGN §12). A layout that cannot fit the wanted scale takes the nearest whole one and reflows.
- [Built] **Verify UI changes.** `npm run lint`, `npm run typecheck`, `npm test` and a run or screenshot of the changed screen come before saying it is done; one screenshot set per PR.
- [Built] **Branches.** UI work goes on a branch `ui/<task>` in its own worktree, with a PR and green CI (GitHub workflow in `CLAUDE.md`).

## 2. Interface and screens

- [Built] **Header bar.** Account level with its XP bar, the mute toggle and only three resources: Money, Summon Crystals and Glamour Crystals, each with its rate. Everything else (gems, Cores, Frost Sigils, Glimmer Dust, Facet Shards, Starlight) sits behind a **Details** button, grouped as tree materials, mine materials, dungeon materials and prestige, each with its amount, rate, mastery and use. Crystals are drawn larger than Money and their pickups get a bigger moment; coins of other resources fly to the Details button.
- [Built] **Sidebar**, in this order: Home, Cards, Production, Dungeons, Summon, Skill Tree, Wardrobe, Achievements, Shop, Settings.
- [Built] **Panels and tooltips.** Framed panels on wide, multi-panel screens that use the desktop width. Hover tooltips on stats, items, costs and modifiers, with a breakdown by source.
- [Built] **Stage first.** The Dungeons and Production pages are the focus of the game, so they are live stages, not menus; management goes below or in a side rail.
- [Built] **Home** is a command centre: three live mini-stages (fight, logging, mining) with their rates, each opening its page, and the goal tracker on top.
- [Built] **Dungeons** is a full-bleed arena. Floors, the weapon panel (DESIGN §5) and the upgrade shelf live in a drawer that slides up from the bottom; DPS, kills per minute and time-to-kill sit in the top-right corner.
- [Built] **Production** is a side stage: one row per tree kind and mine type on the left, each bought and upgraded on its own row, a sticky stage with the main card on the right and the upgrade shelf in a drawer at the bottom (user, 2026-11-08; the rules are in §4).
- [Built] **Loadout fan.** A loadout shows as a fan: the main card in front and up to three support cards behind it, each peeking out at the side. A click on a support (or on its line in the list beside it) pops it out in front as a full card with its effect written out; a click on it again, anywhere else or Escape puts it back. Cards keep whole device-pixel scales and nothing is rotated, so the art stays crisp (DESIGN §12). Built for the Production stage (the user's sketch, 2026-11-08).
- [Built] The same fan on the Dungeons fight screen, for the party beside the arena: the main card in front (about 2x on a window of at least 1200 × 760, the grid size on a smaller one), the supports behind it, the burst gauge under the main card and the shared health bar under the fan. A support plate reads "Support"; its effect is read in the pop-out. The lunge and knockout moves are slides only, nothing rotates.
- [Built] **Dungeon arena.** The boss is large and centred with an idle bob and its stacked HP bars. Every hit flashes and squashes it, big hits shake, and a finished HP bar shatters. The loadout faces the boss and lunges on its attacks, with its health bar visible. Boss attacks land on the cards with red numbers and a shake; a knockout is a visible moment with its countdown. The burst gauge sits on the main card; the signature attack gets a screen flash, a big number and a brief slow-down. On a kill the boss pops and its drops spill out as coins, rest a beat, then fly to the header; a rare drop gets a light beam, a slow-down and a toast.
- [Built] **Production field.** Every strike shows "+n" off its tree or mine and the coins fly to the header; a harvest burst is a wave with one big total. The main card lunges by its pattern and its supports flash when they help. Reduced motion drops lunges, shakes and flashes.
- [Built] **Numbers.** Header counters roll smoothly and pulse when coins land. Floating numbers use the number style, attack and tick cosmetics, never hardcoded looks; their size follows the hit against the current average, and crits and signature attacks look different. The starter style is sticker numerals: chunky digits with a white outline, a drop shadow and a tilt, bouncing in place.
- [Built] **Buying.** Every buy button previews its effect (for example "DPS 12 → 13, time-to-kill 11h → 2h"). Every level line has ×1 / ×10 / ×100 / Max; affordable buttons glow and a small bar fills toward the next affordable level.
- [Default · in game] Max buys as many levels as are affordable (at least one) and otherwise shows the next level; a ×N buy buys exactly N or nothing.
- [Built] **Welcome back.** After offline progress, a card fan deals one small card per category (time away and the cap, resources, kills, knockouts, drops, card XP and levels, mastery tiers), then Collect sends the coins to the header.
- [Built] **Performance.** At most about 30 popups at once, rapid numbers merged, animation paused when the page or window is hidden, one shared animation loop. Under reduced motion: no shake, flash or slow-down, and numbers fade in place.
- [Built] **Screen picks.** Summon: Deck and Table, Nocturne panel (two card decks whose thickness is the pity, odds in the middle, last hand below). Wardrobe: a mannequin card with the seven slots around it and the item grid below. Skill tree: a radial constellation with gem nodes; card enhancements are a small star chart on the card. Ascension: a prismatic ring gate. Achievements: a sticker book. Shop: Market Stalls, option 2 of the review sheet (user, 2026-11-08), with the candy pixel art (variant H2, Pastel Candy; user, 2026-11-08).
- [Built] **Shop page: Market Stalls.** Three striped-awning stalls side by side on a light table, every counter visible at once: the Starlight shop (permanent levels, each line with its level bar and price; a buy slams a BOUGHT stamp on it), the Shard shop (card copies as tiles, then supplies and exclusives, with a spinning shard coin on its sign) and the Ascension gate (a pixel ring around the Starlight coin, the Starlight gain, the Ascend button with its confirm step, and the Kept and Reset lists). The awnings, stamp, ring and coin are pixel sprites (`art/pixel/hand/shop-*`). Reduced motion drops the ring, coin and stamp motion.
- [Built] **Settings** has reduced motion, number format, autosave interval, export / import, sound volumes and Report an issue.
- [Default · in game] Settings layout and options: four panels (Display, Sound, Save, Help); reduced motion follows Windows by default; number formats scientific (default), suffixes or engineering, numbers under a million always in full; autosave every 10 s to 5 min (30 s default). These preferences are stored per player, not in the save.
- [Default · in game] **Sharp cards.** The Cards collection shows the full card, the same card as everywhere else, at a whole scale: 132 × 186 (1x) four across on a standard window, 2x (264 × 372) four across when they fit (a 1080p window), fewer across and reflowing when the window is narrow (Review gate pick "Full card, 1x", 2026-11-08). Card text is real text, with a floor of 11 CSS px on the small card; its job label is left to the filters. Next to the grid, the detail panel shows the card at 2x with the weapon panel on it (DESIGN §5), the card's abilities and cost, its enhancements and the loadout buttons.

## 3. Open questions

Everything tagged `[Proposed]` or `[Default]` waits here for the user.

Waiting since 2026-11-08 (`[Proposed]`):

- Double-detail sprites: an optional re-bake of the sprites at double detail for full screen (§2, DESIGN §12).

Defaults by Claude, never confirmed (`[Default]`):

- §2 Buy Max, the Settings layout and options, the Shop page holding Ascension (2026-11-08).
- §2 the Cards collection as the full card at 1x and 2x (Sharp cards), built from the review gate picks "Full card, 1x" and "On the weapon" as relayed to the ui agent; the user has not confirmed them in a chat of their own. Also the 11 px text floor on the small card and the job label left off grid cards (the weapon panel itself is DESIGN §5).

Not decided yet (no rule exists, ask before inventing one): on-screen copy tone and wording rules, theme and UI-skin conventions beyond what Wardrobe cosmetics define (DESIGN §8), and keyboard and gamepad navigation.

## 4. Changelog

- 2026-11-08 — Created this file: DESIGN section 11 "Interface and screens" and the UI conventions from the `ui` agent, `CLAUDE.md` and `docs/WORK_SPLIT.md` moved here; no rule changed (user: exactly two graphics documents).
