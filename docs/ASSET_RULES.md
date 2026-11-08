# Asset rules (read this before generating or changing any art)

This is the one file every asset-making session reads before it generates, draws, recolours, animates or wires a sprite. It is a living file: when the user changes a rule, **overwrite the rule here** (one version of each rule, no amendment sections) in the same PR as the change. If this file and another document disagree about how weapon art is structured, this file wins and the other document gets fixed.

Scope: weapons and tools (the signature item on a card). Frames, tiles, bosses, UI and effects follow `DESIGN.md` §12 and the pixel-art skill; the rules below still apply to anything that belongs to a weapon.

## 1. The three kinds of weapon art

Every weapon image belongs to exactly one of these. Decide which one before drawing.

| Kind                         | What it is                                                                                                                                                   | Does it change?                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Tiered weapon** (T1 to T6) | A normal weapon of a kind (sword, staff, bow, maul, ...). The backbone of the game.                                                                          | Yes, along the cosmetic ladder in §2.                       |
| **Unique**                   | A single one-off item with its own identity. It is its own separate asset, not a stage of a tiered weapon, and it does not share a style with other weapons. | **Never.** No ladder, no transformation, no "evolves into". |
| **Skin**                     | A different look for one weapon, art only (Wardrobe).                                                                                                        | Not a tier; stats do not change.                            |

## 2. The cosmetic ladder (tiered weapons)

A **cosmetic upgrade** is one visible layer added to the weapon's own picture: parts (guard, wings, wraps, crystals, engraving), a richer colour ramp, trim. Never only a recolour. Upgrades stack: each tier keeps every earlier upgrade.

| Tier           | Cosmetic upgrades   | Look                                                                     | Light, glow, animation                                    |
| -------------- | ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| **T1**         | 0                   | The basic weapon. One per kind.                                          | None.                                                     |
| **T2, T3, T4** | 2 each              | Same two-upgrade look for all three. The three differ in **stats only**. | None.                                                     |
| **T5**         | 4 (all of T1 to T5) | Fully upgraded body.                                                     | Light effects begin here: glow, flames, small animations. |
| **T6**         | 5 (all of them)     | The final form of the kind.                                              | Full effects and animation.                               |

Consequences for production:

- Per weapon kind a tiered ladder needs **four distinct pictures**: T1 (plain), the T2-T4 look, the T5 look, the T6 look. Never draw T2, T3 and T4 separately.
- T1 and T2-T4 are the starting backbone: many of them, mostly bloat, so they must be cheap to make (recolours and ornament on one shared drawing, not new drawings).
- T5 and T6 are the aspirational items (a T5 arrives within about the first 20 minutes of play): hand-shaded, animated, worth the effort.
- T1 to T4 never glow and never animate. Animation and light are what make T5 and T6 read as a step up.

## 3. Uniques

- A unique is one fixed item. It never changes, so it has exactly one picture (plus its animation), not a ladder.
- Its effects and animation are as strong as T6: full effects, its own peculiar effect, its own motion and colours.
- It is separate from the tiered families: it does not have to match the style of the weapon kind it resembles, and it is not a stage of one. A unique sword is not "T7 of the sword".
- Uniques are drawn once, in full, and are never recoloured into tiers.

## 4. Before generating anything

1. Name the weapon kind and the kind of art (tiered T?, unique, skin).
2. Look up what already exists (`design/catalogue/index.html`, `src/renderer/src/art/pixel/sprites`, `docs/DESIGN.md` §12) and reuse before drawing. Do not redraw approved art; do not spend generations on something that exists.
3. Count the pictures this rule requires (section 2: four per ladder; section 3: one per unique) and plan only those.
4. All pixel art goes through PixelLab, post-processed with the project scripts, as the rest of the project rules say.
5. Show the user options only for choices that matter, and keep approved art as it is.

## 5. Open points (the user has not decided; do not invent an answer)

- How T1 to T6 map onto the game's current names (the seven rarities Common to Void, and the tier-up ladder Bronze to Prismatic). The user said the only change is that Uniques stop being a stage inside a weapon; the rest of the naming is to be mapped when this is written into `DESIGN.md`.
- What exactly counts as one cosmetic upgrade for each weapon kind (which parts get added at which step).
