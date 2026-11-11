# Plan: itch.io asset packs — enemies, bosses, coins, crystals, achievements, credits

Approved in the home chat on 2026-11-11 (user decisions quoted in each section). This doc is one-use: the PR that implements it deletes it (`CLAUDE.md`, Workflow).

Picker with every pack and the user's picks: https://claude.ai/artifact/Mut1jumR2nFwDuWyRW6ayA (keep the link private).

## 0. Before you start

- Fetch, then one worktree: `git worktree add C:/bi-itch-assets -b art/itch-assets origin/main`.
- Read `CLAUDE.md`, `docs/PROJECT_OVERVIEW.md`, `docs/DESIGN.md` (§3 Coins, §6 Dungeons, §10 Achievements), `docs/UI_RULES.md` (§2 arena, Floors interim, Settings, Achievements) and `docs/ASSET_RULES.md` (§4, §5).
- **The user copies the packs** (the big zip from their Downloads folder) into `design/references/itch/`, one folder per pack. That folder is local and never committed (ASSET_RULES §5 Pixel art). Ask the user if it is missing; do not download anything from itch.io yourself.
- **Licences to read before anything ships.** Read the LICENSE/README of every pack used. Coin_Gems and the achievement badges sheet (`achievements.png`) have no licence in their files: ask the user for their itch.io page links and read the terms there. If a licence forbids use in a game, stop and tell the user.

## 1. Rule changes, committed before any code (CLAUDE.md rule 5)

All of these are the user's decisions (2026-11-11). Rewrite each rule where it lives, move tags, and add one dated Changelog line per document.

- **`CLAUDE.md`, Optional helpers:** "All art is made with PixelLab" becomes: PixelLab is the default tool; free asset packs the user picked are allowed, each listed in the credits file with its licence (user: "only more of a suggestion").
- **ASSET_RULES §4 rule 4 and §5 Pixel art:** the same exception, plus:
  - A pack's original files stay in `design/references/itch/` (never committed). Only the cut, game-ready sprites are committed.
  - Painted (non-pixel) pieces are converted to pixel art or kept out (user: "either convert or keep out").
  - Every pack used gets a line in the credits file (see §7) with its author, link and licence.
- **ASSET_RULES §5 Characters:** enemies and bosses are shown **from the front** (the packs' `south` direction), not in profile (user: "it's gonna be front"). Only idle loops are needed (user: walking is fine, attacks are not needed). The Elie Studio characters are the new style reference for characters (Keep + Learn, see §8).
- **ASSET_RULES §5 Approved assets:** the achievement stickers are replaced by the achievement badges (user: "look 1000% better than what we have now"). The old sticker art is kept in git history, not deleted from `design/`.
- **DESIGN §6 Normal enemies and Three new dungeons:** the new roster in §2 below, and mini-bosses become **their own character** instead of a "Great" copy of a normal enemy. Dungeon 4 changes theme from a storm peak to a cursed sea; it keeps the Storm element and its drops. Its new name is a `[Default]` for the user (proposal: **Stormwrack Cove**), listed under Open questions.
- **DESIGN §3 Coins:** the coin sprite is the Coin_Gems spinning coin (see §4).
- **UI_RULES §2 Floors, interim:** the labelled box is replaced by the enemy's sprite. **The arena still shows one enemy at a time in the boss's place**; how a whole wave looks stays for the floors-UI 5-options round. Do not design wave layouts in this PR.
- **UI_RULES §2 Settings:** the Help panel gets a **Credits** section (user: "we'll add a credit section in the settings").

## 2. Enemies and bosses

The user approved this table ("it works for now"). The first normal enemy is the light one, the third the heavy one (`hpWeight` 0.7 / 1 / 1.5 in `dungeons.json`). Names change to the character names; keep the existing `id`s where the save refers to them, otherwise rename with a save version bump and migration (CLAUDE.md rule 9).

| Dungeon (id)                                | Normal enemies (light, mid, heavy)                                        | Mini-boss                           | Boss                         |
| ------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- |
| Mossy Cellar (`mossy_cellar`)               | Bloodroot, Woodland Stalker Wolf, Plague Doctor                           | Plague Lantern Keeper               | Root Warden (art stays)      |
| Ember Crypt (`ember_crypt`)                 | Obsidian Crab Red, Fire Witch, Bloodroot Ember                            | Blood Duchess                       | Cinder Lich (art stays)      |
| Frostspire Vault (`frostspire_vault`)       | Ice Sorceress, Ivory Direwolf, Obsidian Crab Blue                         | Glacierbreaker Knight               | Glacier Colossus (art stays) |
| Dungeon 4 (`thunderpeak_aerie`, cursed sea) | Abyssal Sharkfang Raider, Gothic Corsair, Obsidian Crab Green             | Drowned Leviathanbeard High Admiral | Abyssal Anchor Leviathan     |
| Sunken Sanctum (`sunken_sanctum`)           | Golden Cross Novice Priestess, Ivory Sun Priestess, Cathedral Reliquary   | Holy Judiciar                       | Sanctuary Archangel          |
| Hollow of the Void (`void_hollow`)          | Shadow Slime (redrawn, see below), Hooded Rogue Assassin, Bloodroot Black | Gothic Bloodhunter                  | Faceless Void Reaper         |

Packs: the characters are Elie Studio ("elie automata", credit required); Bloodroot, Obsidian Crab and Shadow Slime come from their own packs (see §7). Hard, Nightmare and the endless depths use the same sprites for now.

**Data.** Enemies, mini-bosses and bosses get an `art` field (schema in `src/data/schemas.ts`); the mini-boss becomes its own entry per dungeon instead of `miniBossPrefix` + an enemy. The Crystal Sentinel is approved art and does not change.

**Cutting the sprites** (a deterministic script, e.g. `scripts/art/cut-pack.py`, Pillow, no hand edits):

- Take the `Idle` (or `IdleBreathing`) frames of the `south` direction.
- Trim to the union of the frames' bounds, then place them on the boss canvas, 160 × 172, centred, feet on one shared ground line, so every enemy stands where the boss stands.
- Output `<id>.png` (first frame, the still) and `<id>-anim.png` (all frames side by side), the same convention as the top-tier motion strips (ASSET_RULES §5).
- No palette changes: the packs are already pixel art with 64 colours or fewer.
- The small packs (body about 60 px: Bloodroot, Obsidian Crab, the 88 px Elie canvases) look small next to the 125 px Elie bodies. Default: draw them at the arena's scale like the others and let them be smaller; if the screenshot shows them as too small to read, ask the user before doubling their art.

**Shadow Slime** exists only as one side-view picture that is not on a pixel grid. Redraw it from the front with PixelLab, using that picture and the Elie characters as references, at the same body size as the others. Until the user approves it, the Void's light enemy keeps the labelled box.

**In the arena** (`src/renderer/src/stage/arena.ts`):

- The sprite replaces the labelled box in the boss's place, at the same 2x scale and whole device pixels (`pixelScale.ts`).
- The idle strip plays in a loop instead of the one-pixel bob. Hit flash, squash, shake and the HP-bar shatter stay as they are. Reduced motion shows the still.
- The three **new bosses** get the same treatment as the approved ones (`src/renderer/src/art/bosses.ts`): a soft aura in the boss colour and an idle effect layer (proposals to show the user: Leviathan dripping water and bubbles, Archangel drifting feathers and light motes, Void Reaper void wisps). The body stays the pack's idle loop.
- The Dungeons floor list portraits use the same still.

## 3. Crystals (Summon and Glamour)

User: "let's use the sparkle gem and just make them different by colour." Source: the Fantasy RPG pack's sparkle gems (`04_Dungeon_Pickups_and_VFX_32x32`, 8-frame loop).

- Both crystals use the same sparkle gem, recoloured: each keeps the hue of today's placeholder (`src/renderer/src/ui/resourceIcons.ts`), so the header still reads the same.
- The comment in `resourceIcons.ts` about telling them apart by shape goes; colour does it now.
- The header shows the still; the loop plays on pickup and in the crystal's glow moment. Reduced motion shows the still.

## 4. Money coins

User: "let's use the silver, gold and red coins and change the colour based on our systems." Source: Coin_Gems (`MonedaD`, `MonedaP`, `MonedaR`, 16 px, 5-frame spin).

- The eight coins of the ladder (Copper, Silver, Gold, Diamond, Star, Moon, Sun, Crown; `coins.json`) are palette recolours of these sprites: Copper from the red coin, Silver from the silver coin, Gold from the gold coin, and Diamond to Crown recoloured from the gold or silver coin, whichever reads better. One recolour script, colours from the existing coin tints.
- The header chip shows the still of the current coin. Coins that spill from a kill and fly to the header play the spin.
- These replace the placeholder Money coin only. The approved gem coins and mastery medals do not change.

## 5. Achievements

User: the green badges "look 1000% better" than the stickers.

- The sheet has 20 badge icons and two blank bases (round and octagonal). Two icons copy outside brands (a block-game creeper and a video play button): leave them out.
- There are 29 achievements (`achievements.json`). Map the fitting badges to achievements (trophies, crowns, swords, hearts, gems), and make the missing ones in the same style on the blank bases: the same four-colour palette, the same outline weight, with PixelLab or by hand-placed pixels.
- **[Default] for the user:** the five sticker styles (UI-skin slot `ui-sticker-a..e`) become five recolours of the badges along the metal ladder (stone, bronze, silver, gold, prismatic), so the slot keeps working. The green set is option A. Show it on the picker.
- A locked achievement shows the blank base, dimmed.
- The leather book, its chapters and ribbons stay as they are.

## 6. Approval before anything goes in the game

ASSET_RULES §5: every asset is approved by the user before it goes into the game. Before wiring, put on one picker page (`scripts/art/picker.mjs`):

1. The 18 cut enemy and boss sprites, each at 2x on the arena background of its dungeon, with its idle loop.
2. The redrawn Shadow Slime.
3. The three new boss aura and effect proposals.
4. The eight Money coins and the two crystals.
5. The achievement badges, the new ones marked, and the five metal recolours.

Wait for the user's Copy list. Rework what is not kept, then wire.

## 7. Credits

- A data file (e.g. `src/data/content/credits.json`, schema-validated) lists each pack used: name, author, itch.io link, licence in one line and whether credit is required.
- Settings › Help gets a Credits section that renders it. Required credits come first: **"elie automata"** for every Elie Studio character.
- Packs used in this PR: Elie Studio characters, Bloodroot, Obsidian Crab, the Japanese dark fantasy enemies sample (Shadow Slime reference), Fantasy RPG & Dungeon Pixel Art Starter Pack (sparkle gems), Coin_Gems, and the achievement badges sheet.

## 8. Learn references

The user marked all 34 Elie Studio characters Keep + Learn: "that's how perfect generation looks." Add one front (south) idle still of each to the pixel-art skill's references (`.claude/skills/pixel-art/references/`), listed first as the strongest references, with a short note on what to learn: the chibi proportions, about 125 px tall on a 256 canvas, at most 64 colours, a dark outline, a strong silhouette per character, and gold or bright trim on dark armour.

## 9. Picker fix

`scripts/art/picker.mjs` squashes wide pictures: the grid has 150 px columns and `.pic` has `max-width:100%` with a fixed height. Use a wrapping flex row so tiles take their picture's width, and let a tile scroll sideways instead of shrinking its picture. Use the fixed picker for §6.

## 10. Later (not in this PR)

The user kept these for later: the skill and element icons (Tavmir, the round set, NocCollection, Raven spells), the NocCollection card borders as new Card frames cosmetics (converted to pixel art), Raven weapons as small list icons, shopkeepers on the Shop counters (needs its own 5-options round; candidates Male Hunter, Dwarven Hammer Engineer, Royal Archon), the StewV minerals and Dusk gems for the materials behind Details and the Cores, and the spare characters as Hard and Nightmare variants or card skins.

## 11. Done when

- `npm run lint`, `npm run typecheck`, `npm test` and a build pass.
- Screenshots: the arena in each of the six dungeons (a normal enemy, a mini-boss, a boss), the header with coins and crystals, the achievement book, Settings › Help › Credits, at 100% and 150%.
- `docs/PROJECT_OVERVIEW.md` is updated in the same PR, rule tags are moved, and this plan doc is deleted.
- The PR lists the packs used, the tools installed and the user's picker picks.
