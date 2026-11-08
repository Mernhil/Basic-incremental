# Weapon tier looks (set 5 of the game-changes review gate)

Five options for how a weapon family evolves Bronze, Silver, Gold, Prismatic, Unique (DESIGN.md section 5, Tier).
Drafts only: nothing here is in the game. Open `index.html` straight from disk.

| Option | How the family evolves | New art for 12 weapons x 4 tiers |
| ------ | ---------------------- | -------------------------------- |
| A Re-forged | Same blade, richer metal and more engraving each tier | about 25 SE |
| B Grows | One steel body, longer and wider with added parts (guard, wings, crystals) | about 41 SE |
| C Aura | One fixed silhouette, the shape-following element effect escalates | about 3 SE |
| D Rarity ladder | The interim DESIGN.md rule: the existing rarity sprites, one step per tier | 0 SE |
| E Frame kit (hybrid) | The weapon wears its frame: tier metal on the hilt, gem sockets, crest | about 11 SE |

SE = sprite-equivalent: one new hand-shaded 100 x 120 weapon from scratch is 1 SE, a recolour plus 10 to 30 px of
ornament about 0.35, a palette swap 0.1. Estimates, not measurements. Every option also needs about 30 SE for the 10
weapon uniques that are not drawn yet.

## Folder

- `index.html`: the review page (all five side by side, then each option on the sword, staff, bow and maul, how it applies to the other weapons, trade-offs, cost table).
- `sprites/<A|B|C|E>/<weapon>-<tier>.png`: the 64 new draft sprites, native 100 x 120 (item grid), 1x.
- `sheets/<option>-1x.png`, `-2x.png`: tiers across, sword, staff, bow, maul down.
- `cards/<option>-<weapon>-1x.png`, `-2x.png`: each ladder inside its tier frame (the Unique keeps the Prismatic frame). An approximation of the card: the shipped frame sprite, a dark body and the item at true size.
- `anim/c-*_preview.gif` and `_sheet.png`: 6-frame motion previews of option C's aura (built with `sheet.py`).
- `existing/`: the game's own approved sprites, copied unchanged for comparison (option D, the Unique steps, frames).
- `pixel_check.txt`: output of `pixel_check.py` on `sprites/`.
- `pix.py`, `weapons.py`, `options.py`, `fx.py`, `page.py`, `build.py`: the generator. `py design/pixel/weapon-tiers/build.py` rebuilds everything, deterministically.

## Checks run

- `pixel_check.py sprites --max-colors 40`: 64 files, 0 errors, no orphan pixels, 9 warnings. All 9 are option C's outer aura pixels, which sit outside the ink outline on purpose.
- `pixel_check.py anim`: 0 errors. `pixel_check.py --scale 2` on the 2x sheets and cards: clean 2x scaling.
- `sheet.py` for the four C animation previews. I could look at the frames but not watch the GIF at real speed.
- The page was opened over a local server: 174 images, none broken, no horizontal overflow.

## Not done

- No unique is drawn for the bow and maul (shown as "No unique drawn yet"); the other 8 weapons are described in each option's table, not drawn.
- No motion preview of option E's sparks; no check inside the real card (nothing was merged or run in the game, and git was not touched).
- The sprites are generated from code with the same rules as the shipped items (five tones, top-left light, ink outline, rim, plus sparkles), not hand-pixelled; a chosen option would be redrawn and approved before it goes into the game.
