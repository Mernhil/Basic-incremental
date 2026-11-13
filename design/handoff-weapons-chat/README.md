# Hand-off: "Missing weapons in cards" chat (2026-11-12 to 13)

Paste this into the main chat. Repo: Mernhil/Basic-incremental. Everything below is already on GitHub (PRs and branches), so the main chat can read it there.

## What was decided in this chat (the user's words, in short)
- Cards show the weapon of their tier, but the user wants the pulled cards to be different weapons ("it's a gacha"). The 22 original Heirlooms must be visible on cards.
- 45 kept Heirloom candidates become 45 NEW weapon cards (20 Mythic, 25 Void), each a recolour of a DIFFERENT picked model (b, c or d), with exclusive names. The 22 in-game Heirlooms stay. Names must follow the final colours (e.g. "Jade Vanguard" is now a violet sword, so rename).
- Next tier preview button on the Cards detail panel (see what you can unlock later).
- Art now comes from the user's own ChatGPT pictures, used as they are. Claude's own recolouring was rejected twice ("same shade on everything").
- Wanted at the end: merge everything, bump the version and release, "once fully done both" (#214 and the Heirloom Gate).

## Merged and released
- #205 dungeon view centred and small enemies zoomed. #206 the 45 new cards (roster 77 to 122) plus the Next tier preview. #207 release 0.7.1. Releases up to v0.7.7 are live (installer, blockmap and latest.yml all present).
- The user had v0.7.0 installed (the app did not update; log is `%APPDATA%\basic-incremental\logs\updater.log`; a dev build never updates). They updated to 0.7.7.
- The dungeon crop and off-centre they saw were fixed in 0.7.1 and 0.7.4 (#213); checked on 0.7.7 at 1905x985, 1586x973 and 1280x650.

## Open right now
1. **PR #214** top-tier weapon looks (136 straight pictures + 22 Heirloom pictures from the user's sheets). It conflicted with main; I merged main into its branch `claude/weapons-top-tier-24e753` (head d2b6b55, docs conflicts resolved, 1568 tests pass) and CI is green. NOT merged: the user said merge and release once both #214 and the Heirloom Gate are done.
2. **PR #219 (draft)** Heirloom Gate: the 22 Heirlooms become separate cards from a fourth gate. Phase 1 (design and plan `docs/plans/heirloom-gate.md`) is done; phase 2 (the build: data, game logic, save migration, sim, UI) has NOT started. It is blocked on the user picking layouts: the five-option previews (`design/options/heirloom-gate/pick.html`, group 1 Summon gate, group 2 Cards Heirlooms section) were never committed. The user said they will upload them. A mockup agent I started was stopped on their request.
3. **Recolours of the 20 flagged weapons** (labels 1b 1d 6b 7b 8b 9b 9c 9d 11b 11c 11d 14b 14c 15b 17d 20b 20c 20d 21c 21d): the user is redoing them in ChatGPT. Their last file recoloured the in-game model (candidate "a") instead of the picked b/c/d models, so it cannot be used as is. The correct base models: zip `base_models_to_recolour.zip` (all 45) and the page https://claude.ai/artifact/2LeK2MTLzQRmpH26joJx9o (the 20). My part-by-part versions are on branch `fix/heirloom-recolour-contrast` (no PR). The other 25 recolours in main are my older single-hue ones (not flagged by the user).
4. **Queued task card** (not started): the dungeon Weapon panel cannot switch between the four team cards' weapons; add a way to pick the card shown.
5. The new weapons are still still pictures (no animation). The old Heirloom animation example was the Worldforge hammer strip (8 frames of 100x120).

## The other two cloud sessions on this repo (read from their transcripts)
- "Battle fullscreen centering and sprite sizing" (session_014cA2Fnk8WMEX4vUC3WUAPc, finished): fixed the dungeon full view sitting off-centre on wide windows (the generic 1400px page cap, `table/viewHost.css`) and the half-width view when opened from the table window, and zoomed the small pack enemies (Bloodroot, Obsidian Crabs, Hooded Rogue Assassin, Plague Lantern Keeper and a few more) by a whole number from the ground line (`art/foeZoom.json`, `scripts/art/foe-zoom.py`, applied in `art/foes.ts`). PR #205, CI green, squash-merged into main (b6bdaf5), in releases 0.7.1 and later. Nothing is left open there.
- An earlier "Missing weapons in cards" session (session_014cA2Fo8A5LPNK3VKFNTgub, idle): it only started pulling the repo to look at how weapon cards are listed and stopped after about two minutes; no changes, no PR. This chat is the one that carried on.
- The other PRs that landed or are open (#209 balance pass 3, #208 weapon tier looks, #211 cosmetics cleanup, #213 to #223 duel and numbers, #214 top-tier looks, #219 Heirloom Gate) were made by sessions that are not in this cloud list (they ran locally on the user's other PC), so this file only knows them from GitHub.

## Notes for whoever continues
- Branch `claude/weapons-cards-missing-bmt3fz` is the old working branch (its work is merged via #206); `fix/dungeon-view-crop` and others were scratch and deleted.
- This cloud session cannot open chatgpt.com (network policy); the user uploads files instead.
- Rules in CLAUDE.md apply (design edits committed before code, overview updated in every src PR, CI on an up-to-date branch before a squash merge, tag after the release PR).
