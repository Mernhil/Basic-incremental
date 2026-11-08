# Asset rules (read this before generating or changing any art)

This is the one file every asset-making session reads before it generates, draws, recolours, animates or wires a sprite. It is a living file: when the user changes a rule, **overwrite the rule here** (one version of each rule, no amendment sections) in the same PR as the change. If this file and another document disagree about how weapon art is structured, this file wins and the other document gets fixed.

Scope: all art. Sections 1 to 4 cover weapon and tool art (the signature item on a card); section 5 is the art style for everything (frames, tiles, bosses, coins, effects), sections 6 and 7 the cosmetic art system. The pixel-art skill's `references/` are drawing technique (how to draw), never rules; this file wins over them, over `DESIGN.md` and over any older note. Screens and layout are in `docs/UI_RULES.md`.

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
2. Look up what already exists (`design/catalogue/index.html`, `src/renderer/src/art/pixel/sprites`, and section 5 below) and reuse before drawing. Do not redraw approved art; do not spend generations on something that exists.
3. Count the pictures this rule requires (section 2: four per ladder; section 3: one per unique) and plan only those.
4. All pixel art goes through PixelLab, post-processed with the project scripts, as the rest of the project rules say.
5. Show the user options only for choices that matter, and keep approved art as it is.

## 5. Art style

_Moved here from `DESIGN.md` §12. Each rule keeps its status tag (tags are defined in `DESIGN.md`, "How this document works"). A `[Differs]` rule says what the game does today; the text is the target._

- [Built] **Pixel art.** Every asset is pixel art, and each one is approved by the user before it goes into the game. Reference images stay in `design/references/` and are never committed.
- [Built] **Clean pixels.** Every sprite is drawn on its own pixel grid and shown at a whole number of device pixels per art pixel (`devicePixelRatio` counts, so 125%, 150% and 200% screens each get their own whole scales), with nearest-neighbour scaling. No anti-aliasing, blur, gradients or sub-pixel sizes at rest, and art is never shrunk to make pixels. The only soft glow is the approved one behind effects and the bosses' aura. A card is a whole multiple of its 132 × 186 grid, and its frame, item and effects all share that one scale (132 × 186 CSS px on a 100% screen, 176 × 248 at 150%). Where a layout cannot fit a card at its wanted scale it takes the nearest whole scale that does, and the grid reflows (user, 2026-11-08). The scale choice is `src/renderer/src/ui/pixelScale.ts` (pure, tested) and `pixelFit.ts`; `node scripts/check-pixel-scale.mjs` measures every pixel-art element in the running app at 1x, 1.25x, 1.5x and 2x.
- [Differs] **Small art.** A few places still show art below 1x because the small drawing does not exist yet: the boss portraits in the Dungeons floor list, the card thumbnails of the Wardrobe swatches, and the gem coins in the weapon panel's price chips (the 48 px coin in a 20 px box). Each needs a small version from the pixel artist; until then they are the only art not on a whole scale.
- [Default · in game] Brief motion is exempt: a hit squash, the idle breathing and bob, a sticker's tilt and a pop may scale or turn art for a moment. At rest everything is on a whole scale.
- [Built] **Pixel rules.** A one-pixel dark ink outline around every part, a one-pixel edge in the part's darkest tone where parts overlap, and a white ring outside the ink on stickers (bosses, tiles, coins). Flat faces lit from the top-left, three to five tones per material, white glints, no stray pixels.
- [Built] **Sizes.** Card items 100 × 120; the whole card is one grid of 132 × 186; production tiles 58 × 64; bosses 160 × 172; coins and medals 48 × 48; navigation plaques 64 × 64.
- [Built] **Brave Frontier technique** (learned from their sprites, never copying them): five tones per material, shadows leaning purple and highlights leaning yellow-white, dark lines between parts, gold trim with a bright top edge, small gems with a white glint. The body barely moves; the life is in the effects.
- [Built] **Card items.** A 100 × 120 sprite with the ink outline, a subtle lighter band on each part's lit edge and a darker one on its shadow edge, a one-pixel light rim outside the outline so dark items stay readable, and plus-shaped sparkles. Items made from the user's concept sheets (maul, bow, the uniques) keep their own shading instead of the bands.
- [Built] **Approved assets** (mockups: [Pixel Art Batch](https://claude.ai/artifact/NLU6j4dSGJZe587PWGDXdK), [Pixel Art Round 2](https://claude.ai/artifact/MP6BXhgJFWdRJDdyLiNcs6)): production tiles, unique weapons, gem coins, bosses and the Crystal Sentinel, mastery medals, forged edges, navigation icons, and the achievement stickers (mini cards climbing the frame ladder in five styles, `design/pixel/achievement-stickers/`). On 2026-11-08 the tiles (by script), then the gem coins, medals, Flameblade, Soul Reaper and the maul and bow ladders (with PixelLab) were redrawn from the user's concept sheets and approved again.
- [Built] **Look.** Simple but cool: strong silhouettes, few parts, detail only where it reads at game size. Cel-shaded like Knights & Dragons and Brave Frontier: bold dark outlines, flat shadow shapes and white highlights, saturated metals, a chunky display font for card names.
- [Built] **The card is the showpiece.** The frame is the tier and rarity colours the body. The frame ladder changes material, gem sockets and crest at every tier and stays a border ([Frame Ladder](https://claude.ai/artifact/BWviG6R6coWmmMLKCCY8ga)):

  | Tier      | Material                                          | Six gem sockets                                   | Crest                 | Light and motion                                                    |
  | --------- | ------------------------------------------------- | ------------------------------------------------- | --------------------- | ------------------------------------------------------------------- |
  | Bronze    | Hammered bronze with dents and green patina spots | All empty                                         | A plain stud          | None                                                                |
  | Silver    | Polished silver with an engraved inner line       | The two top corners hold sapphires                | Small wings           | None                                                                |
  | Gold      | Gold with scrollwork and a red velvet liner       | Sapphires and emeralds in the corners, a top ruby | A small crown         | A shine sweeps across the frame; the corners twinkle                |
  | Prismatic | Crystal band cut into pastel facets               | All six hold rainbow gems                         | A small radiant crown | The band cycles through the rainbow, the shine sweeps, sparks orbit |

- [To build] **The signature item.** Inside the card is a weapon, tool or relic, not a character. How intricate it is follows its tier (sections 1 and 2), adding parts rather than only colour, never a recolour alone. The game today still draws seven rarity steps instead (Common plain; Rare a wrapped grip and gem pommel; Epic a winged guard and gem; Legendary a broader ornate shape, gold inlay and a ribbon; Mythic neon runes and a crystal edge; Exotic forked shapes and floating rings; Void black chrome, glowing cracks and orbiting shards), and the maul and bow follow the user's concept sheet (2026-11-08): the maul from a plain wooden mallet through iron and gold to a crystal-headed hammer, the bow from a plain longbow to an ornate recurve and a flaming bow. How the rarity steps map onto T1 to T6 is an open point (section 8).
- [Default] **Ladder steps.** The concept ladders (L1 to L6, 2026-11-08) are read as T1 to T6 of section 2: L1 is T1, L2 to L4 are the shared T2-T4 look (only one picture is needed for the three), L5 is T5 and L6 is T6. Uniques are not a ladder step (section 3).
- [Default] **Common look.** Commons are crude and dull: plain wood at the first step, then simple iron weapons, with no glow or effects, which is what T1 to T4 look like anyway. Their tiers end at Gold (`DESIGN.md` §5), so a Common never gets the T5 and T6 pictures.
- [Default] **Concept images.** The user's Gemini concept images are catalogued in the graphics chat (ID, asset, game size) and stored in `design/references/concept-<date>/` (local, never committed). A concept sheet is cut into one reference image per weapon/step with `design/pixel/concept-sheet-2/cut_sheet.py` (grid and labels removed, background kept, flat magenta only as a Gemini-redraw reference, not a PixelLab input).
- [Default] **PixelLab inputs.** PixelLab converts plain rectangle crops of the original concept image, one weapon per cell at its game size, keeping the image's own background, same as `design/pixel/concept-sheet-1/make_inputs.py`. Keying happens afterwards in post-processing. A Gemini redraw of a weapon (clean, large, on flat magenta) replaces its sheet crop as the input when one exists.
- [Built] **Unique weapons.** Each is one fixed item that never changes (section 3): Flameblade (a sword made entirely of flame), Rootbloom Staff (roots, petals, falling leaves, wind and floating earth crystals) and Soul Reaper (a pale curved scythe with soul fire), with their own motion. Twin daggers (violet soul fire) and a bronze hammer (forge embers) are drawn with their motion (`art/draftUniques.ts`) but no card owns them yet, so they are not in the game. The reveal: a light beam drops into the card, the frame rebuilds around it with a crest flare, then the unique weapon rises into the window. When and how a card receives its unique is a game rule in `DESIGN.md` §5, which today ties it to the last tier; whether that stays is an open point (section 8).
- [Built] **Characters** (chibi armoured figures) are used for bosses and may become special card skins later. Each boss looks like its area and has its own body shape: the Root Warden wide and squat, the Cinder Lich tall and floating, the Glacier Colossus top-heavy; drawn in the Brave Frontier pixel style with a soft aura in the boss colour. The Glimmer Trial target is the Crystal Sentinel, a floating one-eyed crystal with four orbiting shards that light up at 25, 50, 75 and 100%.
- [Built] **Element effects.** Every card has an element. Its effect is generated from the item's own shape and stays secondary to it, slow and calm, mostly behind the item with a smaller share in front, in a cartoon cel style:

  | Element              | Effect                                                                                   |
  | -------------------- | ---------------------------------------------------------------------------------------- |
  | Fire                 | Edge fire along the edges with drifting highs and lows, or a trailing stream off the tip |
  | Storm                | Arc crackle: jagged cel lightning between points on the item and off its tip             |
  | Light                | Aura shell: outlines of the item pulsing outward, shedding sparks                        |
  | Nature               | Spiral wrap: a ribbon of leaves and light coiling around the item                        |
  | Earth, crystal, void | Power cracks: jagged glowing cracks inside the item, flickering, in the item's colour    |

- [Differs] **Effects unlock with tier** (section 2): none on T1 to T4, light effects begin at T5 (glow, flames, small animations), full effects and animation at T6; a unique has T6-level effects. The element effect and the metal-ladder frame are separate from the weapon's own cosmetic upgrades. Today the game starts the element effect at Gold, stronger at Prismatic and strongest at Unique (user, 2026-11-08), and a Unique card keeps the Prismatic effects.
- [Built] **Hits.** A slash is one thin brush stroke (a white core in a yellow stroke), slightly curved, tapered, re-rolled every hit and centred on the target. Bows and pickaxes use the impact hit; there are no arrow projectiles. The hit colour follows the element.
- [Built] **Resources are carved gems.** Each gem's outline says which it is (Oak round, Ironbark pentagon, Moonwillow star, Copper square, Iron hexagon, Grotto drop) and its carved pattern comes from its source, shown on large art only. Icons set the gem in the centre of a round rimmed coin from the user's concept sheet, whose metal shows its mastery tier; an undiscovered gem is a dark void coin with a padlock. Trees are themed to their gem and hang it; mines are rock with their gems set in. Scenery is faceted like the gems.
- [Built] **One metal ladder.** Stone → bronze → silver → gold → prismatic is the progression language for frames, coins, medals, tiles and every other tier. A tier-up of anything plays a metal flash and a short toast. On coins and medals stone is a pale, dull bronze, and prismatic is a lilac coin and a rainbow star. Mastery medals are faceted stars.
- [Built] **Growing tiles.** Trees and mines grow one visible step per 25-level milestone, drawn from the user's concept sheets (2026-11-08) as hand-made sprites. Each stands on a floating island; the rim under it turns to metal as it grows and is rainbow at the last stage. Trees: sprout, young tree with a first fruit, full swirled canopy, fruiting tree, grand tree crowned with a big glowing fruit and sparkles; the fruit has the shape of the tree's gem and the island grows with the tree. Mines: a rock with one crystal, a bigger rock with a crystal cluster, a cave mouth under a crystal crown, cracked rock with glowing veins, a glowing crystal-lined cavern; the crystals take the mine's colour (copper orange, iron grey, grotto blue). Stages reset with the levels.
- [Built] **No forged edges.** The ladder strips of blades belonged to the damage lines and are gone; the weapon's own look on the card takes their place (§5).
- [Differs] **Palette cycling** (decided 2026-11-07). Sprites may rotate dedicated colour ramps, pre-rendered into about 8 frames per sprite and animated with CSS `steps()`: the Prismatic frame band and stars, holo finishes, Void cracks, embers and lava, ice shimmer, glowing mine veins. Reduced motion shows the first frame. Built: the player (`art/pixel/animate.ts`, a hand strip `<sprite>-anim.png` of 8 frames) and its use on the 13 scythe weapon skins (a travelling glint, §8); `itemBoxSprite` plays any sprite that has a strip. Not yet: the frame band and stars, finishes, Void cracks, embers, ice and mine veins. Two flame and vine bow strips (`item-bow-epic-0-red`, `item-bow-mythic-6-red`) are baked but no card uses them: the bow ladder in the game keeps the earlier bow art, and the redrawn bows become legacy bow skins (§8).
- [To build] **Pixel workers** (decided 2026-11-07). The main logging and mining card walks its field as a small chibi (about 24 × 28, shown at 2–3×): idle, walk, work and a burst swing, visual only. Supports pop in for the harvest burst; the armour trim follows the card's tier metal, and after its unique upgrade it carries the unique weapon. Workers get their own small item sprites. How they fit with the cards already playing on the field is an open question.
- [Built] **Performance.** Element effects run on one shared loop with a small canvas behind and in front of each item, only for cards on screen and at a capped frame rate; a still frame under reduced motion.

## 6. Cosmetics: how art reaches the screen

_The technical pattern for cosmetic items (merged from the old `docs/COSMETICS.md`). Game rules for cosmetics live in `DESIGN.md` §8; screens and layout in `docs/UI_RULES.md`._

### Pieces

| Piece         | Where                                | What it is                                                                              |
| ------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| Cosmetic data | `src/data/content/cosmetics.json`    | Every item: slot, set, rarity, exclusive card, starter flag, owned buff, upgrade levels |
| Rarity styles | `src/data/content/rarities.json`     | Card body colour per rarity, plus optional recipes (neon, chrome)                       |
| Wear rules    | `src/data/content/wearRules.json`    | Minimum card rank to wear a border, a finish, or a card-exclusive item                  |
| Schemas       | `src/data/schemas.ts`                | Validation, including which tokens each slot may set                                    |
| Theming logic | `src/game/theme.ts`                  | Pure functions: equip, per-card overrides, wear rules, level merging, set detection     |
| Application   | `src/renderer/src/theme/apply.ts`    | Writes the resolved tokens and recipe classes onto `<html>` and card elements           |
| Recipes       | `src/renderer/src/theme/recipes.css` | CSS for visuals a token cannot express                                                  |
| Effects       | `src/renderer/src/theme/effects.ts`  | One-shot animations for attacks and tick numbers                                        |
| Registry      | `src/renderer/src/theme/registry.ts` | The recipe and effect ids the renderer implements                                       |

### Three kinds of visual value

1. **Tokens.** Plain values (colours, sizes, fonts). A token key `plate-bg` becomes the CSS variable `--bi-plate-bg`. Rarity tokens get a `rarity-` prefix: `--bi-rarity-body`. Each slot may only set the keys listed in `SLOT_TOKENS`; anything else fails validation with a clear message. Values cannot contain `; { } < >` or a backslash.
2. **Recipes.** Named CSS classes (`.r-<id>`) for decorations and patterns: filigree corners, holo lattices, neon tubes. Data names them; `recipes.css` implements them.
3. **Effects.** Named animations. Attack items give one effect per job (`fighting`, `mining`, `logging`); tick items give one effect.

An item only lists what it changes: tokens it does not set are inherited from the starter item of its slot. Recipes and effects are not inherited.

### Screen shell

The header, sidebar, framed panels and tooltips (DESIGN.md §11) are skinned by the **table** item, so equipping a table re-skins the whole screen. Token groups, each following the card's `<surface>-bg / -line / -ink / -ink-muted` pattern:

| Group      | Tokens                                                                            | Used by                     |
| ---------- | --------------------------------------------------------------------------------- | --------------------------- |
| `chrome-*` | `bg`, `rail-bg`, `line`, `ink`, `ink-muted`, `accent`, `active-bg`                | Header and sidebar          |
| `frame-*`  | `bg`, `radius`, `line`, `title-bg`, `title-line`, `title-ink`, `ink`, `ink-muted` | Framed panels on every page |
| `tip-*`    | `bg`, `line`, `ink`, `ink-muted`                                                  | Hover and focus tooltips    |

The starter table must set every table token (a test checks this). Code: `src/renderer/src/shell/` (shell, tooltip, icons, stat breakdowns). `node scripts/a11y-shell.mjs` (with the app running on `--remote-debugging-port=9222`) checks contrast on every page for every table item, keyboard reach and focus rings.

### Layers on a card

From back to front: rarity body, panel backgrounds (plate, art window, stats), finish, decoration, card text, rank footer. Rank effects (star-6 rings, prismatic aura) sit outside the card edge, so rank and cosmetics never cover each other.

### Upgrade levels

`levels` is a list, lowest first. Level N shows levels 1..N merged: later tokens win, recipes accumulate (level 3 of Gilded Filigree applies `filigree-1`, `filigree-2` and `filigree-3`), effects are replaced. Design each level to add one visible thing.

### Adding things

- **A new cosmetic using existing recipes:** add an entry to `cosmetics.json`. No code.
- **A new recipe:** add `.r-<id>` to `recipes.css` and the id to `RECIPES` in `registry.ts`. Tests fail if data names a recipe that is not registered, or a registered recipe has no CSS.
- **A new effect:** implement it in `effects.ts` and add the id to `EFFECTS`.
- **A new slot** (for example a colour theme or a layout skin): add it to `COSMETIC_SLOTS` and `SLOT_TOKENS` in `schemas.ts`, add one starter item in `cosmetics.json`, and use its tokens in CSS. If it is drawn per card, also add it to `CARD_SLOTS` and `wearRules`. Components read tokens, so they do not need rewriting. Adding a slot changes saved loadouts only by adding a key, so old saves stay valid.

### Checks

- Startup validates all data and throws a readable error listing every problem.
- `assertVisualsImplemented` fails at startup if data names a recipe or effect that does not exist.
- `npm test` covers equipping, card-exclusive overrides, wear rules, level merging, set detection and invalid data.
- `node scripts/a11y-audit.mjs` (with `npm run dev` running) checks text contrast across every table x border x rarity, reduced motion and keyboard access.

### Weapon skins (test)

A weapon skin is not a cosmetic slot: it changes the look of one weapon and is saved per weapon (`GameState.weaponSkins`, keyed by weapon kind). Data: `src/data/content/weaponSkins.json` (weapon, base art, skins with an art id and a cost). Logic: `weaponSkinChoices`, `weaponSkinArt`, `equipWeaponSkin` in `src/game/wardrobe.ts`. UI: the Wardrobe "Weapon skins" tab (`pages/weaponSkinsTab.ts`); cards draw the worn skin with `cardItemArt`. To add a skin, drop a 100x120 sprite in `art/pixel/hand/skin-<weapon>-NN.png`, re-bake, and list it in `weaponSkins.json`.

## 7. Cosmetic art ids (beta art batch B1–B10)

Every id the pixel art of the beta batch implements, so `cosmetics.json` and `sets.json` can name them (`DESIGN.md` §8 "UI-skin slots" and "Every option is kept"; drawn under the pixel rules of section 5 above). The art is drawn by `scripts/art/cosmetics/*.py` and baked by `node scripts/art/bake-pixels.mjs`; the ids are registered automatically (`src/renderer/src/art/cosmeticIds.ts` from `art/pixel/cosmetics.gen.ts`), so a typo in data fails `assertVisualsImplemented` and the registry test.

### How data names the art

| Slot          | Per level, in `levels[n]`                                                                                                   | Notes                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Border        | `recipes: ["bd-<style>-<n>"]` on level n                                                                                    | Recipes stack, the highest level wins. At the max level also add one B8 motion (`ambient-<motion>`) and one B9 corner (`corner-<shape>`), as assigned below.                  |
| Finish        | `recipes: ["fn-<style>-<n>"]`                                                                                               | Max level: add `ambient-<motion>-f`. Core Titan finishes pulse by themselves at L6.                                                                                           |
| Attack        | `effects: { fighting: "px-slash-<style>-<n>", logging: "px-slash-<style>-<n>", mining: "heavy-hit" }` and the attack tokens | Effects are replaced per level, so every level lists its own. Suggested tokens: `attack-edge` / `attack-particle` from the table below (the impact hit uses them for mining). |
| Tick          | `recipes: ["tk-<style>-<n>"]` (keep `effect: "rise"` on level 1)                                                            | The recipe sets `--bi-tick-px`; tick numbers are then drawn as pixel numerals with the style's level steps.                                                                   |
| Number        | `recipes: ["num-<style>-<n>"]`                                                                                              | Sets `--bi-num-px`; `pixelNumberMarkup()` draws it (ui wiring pending). Keep the colour tokens as the text fallback.                                                          |
| Table         | `recipes: ["tb-<style>-<n>"]`                                                                                               | A 96 × 48 pixel tile repeated at 2×. Tokens (chrome, frame, tip) still come from data.                                                                                        |
| Cursor        | `recipes: ["cur-<style>-<n>"]`                                                                                              | 44 × 48 pixel cursor (2×), hotspot at the tip.                                                                                                                                |
| UI-skin slots | `recipes: ["ui-<skin>-<style>"]`, skin = `starlight`, `sticker`, `nodes`, `wardrobe`                                        | One level. The recipe sets `--bi-skin-<skin>: <style>`; pages call the art functions below with that style. Option `a` is the starter of each slot.                           |

### Styles

Level counts follow DESIGN §8 by the suggested rarity. Every set below is coherent across its seven slots.

#### B2 garden sets (suggested Legendary, 5 levels, all seven slots)

| Style     | Set (suggested name)         | Border motion      | Corner   | Finish motion        |
| --------- | ---------------------------- | ------------------ | -------- | -------------------- |
| `verdant` | Verdant Reverie (leaf crown) | `ambient-rail`     | acanthus | `ambient-pop-f`      |
| `vine`    | Vine Wrap                    | `ambient-orbit`    | knot     | `ambient-rail-f`     |
| `fern`    | Fern Fronds                  | `ambient-fountain` | wings    | `ambient-pair-f`     |
| `moss`    | Moss and Mushrooms           | `ambient-pair`     | pauldron | `ambient-fountain-f` |
| `blossom` | Blossom Branch               | `ambient-pop`      | shards   | `ambient-orbit-f`    |

Ids per set: `bd-<style>-1..5`, `fn-<style>-1..5`, `px-slash-<style>-1..5`, `tk-<style>-1..5`, `num-<style>-1..5`, `tb-<style>-1..5`, `cur-<style>-1..5`. The suggested border tokens (`plate-bg`, `panel-bg`, art window, `art-line`) are in `COSMETIC_META.borders.<style>.tokens`, and each style's attack colours in `COSMETIC_META.attacks.<style>` (`edge`, `particle`).

#### B3 Moonwood Dryad exclusive borders (suggested Mythic, 5 levels, `exclusiveCard: moonwood_dryad`)

| Style       | Name (draft)                      | Motion             | Corner   |
| ----------- | --------------------------------- | ------------------ | -------- |
| `heartwood` | Heartwood Halo (crescent cradles) | `ambient-orbit`    | knot     |
| `antler`    | Moonwood antlers                  | `ambient-rail`     | wings    |
| `rings`     | Growth rings                      | `ambient-pair`     | acanthus |
| `luna`      | Luna moths                        | `ambient-pop`      | shards   |
| `wreath`    | Moon wreath                       | `ambient-fountain` | pauldron |

Ids: `bd-<style>-1..5`.

#### B4 Core Titan exclusive finishes (suggested Exotic, 6 levels, `exclusiveCard: core_titan`)

| Style       | Name (draft)             | Motion               |
| ----------- | ------------------------ | -------------------- |
| `corepulse` | Core Pulse (pulse rings) | `ambient-pair-f`     |
| `veins`     | Power veins              | `ambient-pop-f`      |
| `hexcore`   | Hex core                 | `ambient-orbit-f`    |
| `strata`    | Magma strata             | `ambient-fountain-f` |
| `starburst` | Starburst                | `ambient-rail-f`     |

Ids: `fn-<style>-1..6` (L6 adds the three-frame pulse by itself).

#### B5 loose items (five styles, four items each)

| Style       | Common border (2 levels) | Common numbers (2) | Epic attack (4) | Epic tick (4) | Border motion      | Corner   |
| ----------- | ------------------------ | ------------------ | --------------- | ------------- | ------------------ | -------- |
| `forge`     | Rivet Brackets           | Stamped Numerals   | Anvil Strike    | Spark Tick    | `ambient-pop`      | pauldron |
| `woodcraft` | Twine Corners            | Carved Numerals    | Whittle Cut     | Woodchip Tick | `ambient-rail`     | knot     |
| `starmap`   | Compass Corners          | Inked Numerals     | Comet Slash     | Star Tick     | `ambient-orbit`    | wings    |
| `candy`     | Gumdrop Corners          | Candy Numerals     | Ribbon Swipe    | Pop Tick      | `ambient-fountain` | shards   |
| `rune`      | Rune Corners             | Rune Numerals      | Rune Cleave     | Glyph Tick    | `ambient-pair`     | acanthus |

Ids: `bd-<style>-1..2`, `num-<style>-1..2`, `px-slash-<style>-1..4`, `tk-<style>-1..4`. Not in a set.

#### Existing borders and finishes (B8 / B9 spread)

| Item                      | Add at its max level                  | Corner shown by default |
| ------------------------- | ------------------------------------- | ----------------------- |
| Gilded Filigree (border)  | `ambient-rail`                        | acanthus (built in)     |
| Gilded Plate (border)     | `ambient-pair`                        | pauldron (built in)     |
| Gilded Frame (border)     | `ambient-pop` (with `ambient-glints`) | knot (built in)         |
| Ember Crown (border)      | `ambient-fountain`, `corner-wings`    | none until named        |
| Aurora Veil (finish)      | `ambient-orbit-f`                     |                         |
| Hex holo (finish)         | `ambient-fountain-f`                  |                         |
| Wave holo (finish)        | `ambient-rail-f`                      |                         |
| Gilded Tradition (finish) | `ambient-pop-f`                       |                         |

All particle themes (gilt motes, embers, glints, stars, bubbles) are pixel sprites now (`cos-pt-*`).

### B8 particle motions

`ambient-<motion>` moves the border particles, `ambient-<motion>-f` the finish particles: `rail` (rail drift), `pop` (cel pop), `orbit` (frame orbit), `pair` (slow pair, 2 per slot), `fountain` (footer fountain). CSS only, transform and opacity, whole-pixel steps, at most 3 per slot (6 per card), paused off screen, a still pose under reduced motion.

### B9 corner flourishes

`corner-acanthus`, `corner-pauldron`, `corner-wings`, `corner-shards`, `corner-knot`: pixel layers on the frame grid, at most 9 px (about 7 % of the card) outside the edge, within the outer fifth of each side, footer band clear, cut around the tier sockets and crest.

### UI-skin slots (one level each; `a` is the starter, suggested rarities b Rare, c Epic, d Legendary, e Mythic)

| Slot           | Recipes             | Styles                                                                                                    | Art function                                                                       |
| -------------- | ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Starlight coin | `ui-starlight-a..e` | a silver four-point, b indigo rim five-point, c bare star burst, d moon prism, e constellation            | `starlightCoin(style)` (48 × 48)                                                   |
| Sticker style  | `ui-sticker-a..e`   | a mini card, b silver card, c gold card, d legendary card, e prismatic card                               | `stickerArt(style, achievementId, chapter, unlocked)` (74 × 74), `cardShardIcon()` |
| Skill nodes    | `ui-nodes-a..e`     | a brilliant in a bronze cup, b hex in a silver bezel, c bare rhombus, d star cut, e kite with gold prongs | `skillNode(style, branch, state, keystone?)`, `starChart(style, stars, links)`     |
| Wardrobe style | `ui-wardrobe-a..e`  | a sockets, b gilt plaques, c quiet ink, d banners, e rarity glass                                         | `wardrobeChrome(style, part, rarity?)`, `chromeCss(piece, scale)`                  |

All functions are in `src/renderer/src/art/cosmetics.ts`.

## 8. Open points (the user has not decided; do not invent an answer)

- How T1 to T6 map onto the game's current names (the seven rarities Common to Void, and the tier-up ladder Bronze to Prismatic). The user said the only change is that Uniques stop being a stage inside a weapon; the rest of the naming is to be mapped when this is written into `DESIGN.md`.
- What exactly counts as one cosmetic upgrade for each weapon kind (which parts get added at which step).
- How the seven rarity steps of the current weapon art map onto T1 to T6 (section 5, "The signature item").
- Whether a unique is still reached through the Unique tier (`DESIGN.md` §5 says so today) or is a separate item with its own way of being obtained (sections 3 and 5, "Unique weapons").
- The concept ladder reading L1-L6 = T1-T6 (section 5, "Ladder steps") is a default, not a decision.
