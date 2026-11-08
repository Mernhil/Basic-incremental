# Concept sheet 1, remaining parts: draft report

Drafts for approval only (branch `art/concept-sheet-1-new`, not pushed). Nothing is in
`art/pixel/hand/`, `sprites/`, data or DESIGN.md. How they were made: `prompts.md`.

## Where to look

| Group                     | Contact sheet                                    | Files                                     |
| ------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Katana ladder             | `contact-katana.png`                             | `drafts/items/item-katana-*.png`          |
| Rune book ladder          | `contact-book.png`                               | `drafts/items/item-book-*.png`            |
| Cross staff ladder        | `contact-staff.png`                              | `drafts/items/item-staff-*.png`           |
| New uniques               | `contact-uniques.png`                            | `drafts/uniques/evo-*.png`                |
| Attacks                   | `contact-attack-frames.png`, `previews/*.gif/.apng` | `drafts/attacks/atk-*.png` (strips)    |
| Trail hues                | `contact-trails.png`, `contact-trail-tokens.png` | `drafts/trails/`, `tokens.json`           |
| Debuff icons              | `contact-debuffs.png`                            | `drafts/debuffs/`                         |
| Magic circles, VFX        | `contact-magic.png`                              | `drafts/magic/`                           |
| Interface parts           | `contact-interface.png`                          | `drafts/interface/`                       |
| Portraits, flora, frames  | `contact-cosmetics.png`                          | `drafts/cosmetics/`                       |

## Mappings

- **Katana** (6 concept swords): common … exotic ← swords 1–6, void gap-filled. Same rule as the maul
  and bow: the concept's order, one rarity per step.
- **Rune book** (7 books): common … void ← books 1–7 (the tier stars above the books are left out).
- **Cross staff** (2 concept staffs): rare ← the silver staff with the blue gem, epic ← the wooden
  staff with ruby and emeralds (more parts, so the higher step). Common, legendary, mythic, exotic
  and void are gap-filled, each from the nearest concept staff, following the §12 rarity parts
  (legendary gold inlay and ribbon, mythic neon runes and crystal edge, exotic forked shapes and a
  floating ring, void black chrome and cracks).
- **Uniques**: twin purple daggers → `evo-twin_daggers` (void window), big bronze hammer →
  `evo-bronze_hammer` (legendary window), 100 × 120 with the evo rim, like Flameblade.
- **Attacks** (frames snap 50 ms, held 130, thin 90, break 110, as `attackSheet`):
  - Cross Slash: crossed sabres → sabres with streaks → crescent → crescent (all concept).
  - Crimson Moon: thin line → crescent → triple arcs → break (gap-filled).
  - Triple Slash: sword → sword with streaks → triple streaks → break (gap-filled).
  - Piercing Thrust: spear → green burst → thin, break (both gap-filled).
  - Strike Burst: star wand → red burst → big burst → break (gap-filled).
- **Trail hues**: 20 swatches in five families by hue: rose 3, ember 5, verdant 5, tide 3, arcane 4.
  `tokens.json` gives each one `attack-edge`, `attack-glow`, `attack-particle` in the format of the
  attack entries in `cosmetics.json`.

## Sizes (to record as `[Default]`)

| Asset                                        | Size              | Why                                                       |
| -------------------------------------------- | ----------------- | --------------------------------------------------------- |
| Katana, book, staff, new uniques             | 100 × 120         | the card item box (same as every card item and evo)       |
| Attack frames                                | 64 × 64, 4 per strip (256 × 64) | the existing `cos-atk-*` sheets             |
| Trail swatches, debuff icons, portraits, flora, hex badges | 48 × 48 | coins and medals, the nearest icon size           |
| Magic circles and VFX patterns               | 64 × 64           | attack frame and plaque size; they sit under hits         |
| Interface frames (4)                         | 100 × 120         | the item box: they frame a card-sized slot                |
| Wide panel                                   | 124 × 44          | concept size, 1×                                          |
| Title bar, ribbon bar                        | 168 × 24, 168 × 28 | concept size, 1×                                         |
| Progress bar                                 | 88 × 24           | concept size, 1×                                          |
| Check and link icons                         | 20 × 20           | concept size, 1×                                          |
| Cursors, arrows, knob                        | 32 × 32           | standard cursor size, whole scale of the concept          |
| Cosmetic frames                              | 84 × 84, 88 × 88, 84 × 60 | concept size, 1×                                  |
| Cosmetic corners                             | 44 × 48           | concept size, 1×                                          |

All drawn at 1× on their own grid; the game shows them at whole-number scales.

## What wiring each group in would need

- **Katana, rune book, cross staff**: new weapon kinds. Content: the kinds in `ITEM_KINDS_DRAWN`
  (or their own list), cards in `cards.json` that use them (job: fighting for katana; book and
  staff could be fighting or a support job), their element, and drops / summon pool entries. Art:
  copy the drafts to `art/pixel/hand/` (the bake already skips hand names and adds
  `drafts/items/outlines.json` entries to `hand/outlines.json`). DESIGN §5/§12 entries for the
  ladders.
- **New uniques**: an `evolution` id per card in `cards.json`, `EVOLUTIONS` /
  `EVOLUTION_WINDOW` entries, and either their own live motion (`EVOLUTION_GEO` + an effect in
  `art/evolutions.ts`) or a still. The Unique tier opens for those weapons (DESIGN §5). Which
  card owns the twin daggers and the hammer is a content decision.
- **Attacks**: each strip becomes `cos-atk-<style>-<level>.png` (levels can reuse one strip or get
  colour variants), an `attacks.<style>` entry in the cosmetics meta (`frames: 4, size: 64`), and a
  `cosmetics.json` entry with `slot: "attack"`, effects `px-slash-<style>-<level>` and the three
  colour tokens (the trail tokens fit here). Then they appear in the Wardrobe.
- **Trail hues**: as colour variants of an attack cosmetic (a level per hue, or one cosmetic per
  family), using `tokens.json`; the 48 × 48 swatch is the Wardrobe thumbnail.
- **Debuff icons**: a status-effect combat design first (none exists): which debuffs (poison, burn,
  bleed, curse/arcane, root/nature, frailty, silence from the art), how they are applied (element,
  moves), stacks and durations, and their effect in the combat formulas (`src/game`). Then a
  status row on the arena target and the boss, with these icons and a tooltip.
- **Magic circles and patterns**: candidates for the summon portal (behind the pull), skill/spell
  hits (under the target), the tier-up flash, the Ascension screen and the Prismatic frame's
  aura. Needs a place chosen per pattern and a rotate / pulse animation (palette cycling, §12).
- **Interface parts**: hex badges as level / rank badges (the account level badge in the top bar),
  frames as panel or slot frames, the title bar as dialog headers (with its close button), the
  ribbon as section banners, the progress bar for gauges, the cursors as custom cursors. Each is a
  `ui` agent task with the 5-options rule waived only if the user says so.
- **Portraits, flora, cosmetic frames**: portraits as profile / card-skin avatars (a new cosmetic
  slot), flora as stickers or Wardrobe decorations (the Verdant set already uses leaves), frames
  and corners as portrait / showcase frames. Each needs a cosmetic slot and `cosmetics.json` entries.

## What I'm unhappy with

- **Void katana**: two tries, neither black chrome; the kept one is a lighter lavender blade, so the
  top step reads lighter than exotic.
- **Staff gap-fills** are chunkier than the two concept staffs, and the common staff kept a small
  gem though the prompt said none.
- **Magic patterns** are thin dotted lines at 64 × 64; the bright ramp is a palette remap I added
  so they read, and a few (13, 24) are sparse.
- **Attack frames** keep the concept's weapons in the hit (crossed sabres, spear, wand), unlike the
  current slashes, which are strokes only; the gap-filled break frames are softer than the concept.
- **Trail tokens**: several swatches came out with the same edge colour (10, 11, 12 share one;
  13 and 14 share one), so families have fewer distinct hues than swatches.
- **Interface pieces at 1×** are small (cursors, check and link icons), so the concept's fine
  detail is simplified.
- The twin daggers' purple glow is baked in as solid pixels (no soft glow), so it reads as a purple
  aura shape.
