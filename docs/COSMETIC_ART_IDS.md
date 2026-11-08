# Cosmetic art ids (beta art batch B1–B10)

Every id the pixel art of the beta batch implements, so `cosmetics.json` and `sets.json` can name them (DESIGN.md §8 "UI-skin slots" and "Every option is kept"; drawn under the pixel rules of section 13). The art is drawn by `scripts/art/cosmetics/*.py` and baked by `node scripts/art/bake-pixels.mjs`; the ids are registered automatically (`src/renderer/src/art/cosmeticIds.ts` from `art/pixel/cosmetics.gen.ts`), so a typo in data fails `assertVisualsImplemented` and the registry test.

## How data names the art

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

## Styles

Level counts follow DESIGN §8 by the suggested rarity. Every set below is coherent across its seven slots.

### B2 garden sets (suggested Legendary, 5 levels, all seven slots)

| Style     | Set (suggested name)         | Border motion      | Corner   | Finish motion        |
| --------- | ---------------------------- | ------------------ | -------- | -------------------- |
| `verdant` | Verdant Reverie (leaf crown) | `ambient-rail`     | acanthus | `ambient-pop-f`      |
| `vine`    | Vine Wrap                    | `ambient-orbit`    | knot     | `ambient-rail-f`     |
| `fern`    | Fern Fronds                  | `ambient-fountain` | wings    | `ambient-pair-f`     |
| `moss`    | Moss and Mushrooms           | `ambient-pair`     | pauldron | `ambient-fountain-f` |
| `blossom` | Blossom Branch               | `ambient-pop`      | shards   | `ambient-orbit-f`    |

Ids per set: `bd-<style>-1..5`, `fn-<style>-1..5`, `px-slash-<style>-1..5`, `tk-<style>-1..5`, `num-<style>-1..5`, `tb-<style>-1..5`, `cur-<style>-1..5`. The suggested border tokens (`plate-bg`, `panel-bg`, art window, `art-line`) are in `COSMETIC_META.borders.<style>.tokens`, and each style's attack colours in `COSMETIC_META.attacks.<style>` (`edge`, `particle`).

### B3 Moonwood Dryad exclusive borders (suggested Mythic, 5 levels, `exclusiveCard: moonwood_dryad`)

| Style       | Name (draft)                      | Motion             | Corner   |
| ----------- | --------------------------------- | ------------------ | -------- |
| `heartwood` | Heartwood Halo (crescent cradles) | `ambient-orbit`    | knot     |
| `antler`    | Moonwood antlers                  | `ambient-rail`     | wings    |
| `rings`     | Growth rings                      | `ambient-pair`     | acanthus |
| `luna`      | Luna moths                        | `ambient-pop`      | shards   |
| `wreath`    | Moon wreath                       | `ambient-fountain` | pauldron |

Ids: `bd-<style>-1..5`.

### B4 Core Titan exclusive finishes (suggested Exotic, 6 levels, `exclusiveCard: core_titan`)

| Style       | Name (draft)             | Motion               |
| ----------- | ------------------------ | -------------------- |
| `corepulse` | Core Pulse (pulse rings) | `ambient-pair-f`     |
| `veins`     | Power veins              | `ambient-pop-f`      |
| `hexcore`   | Hex core                 | `ambient-orbit-f`    |
| `strata`    | Magma strata             | `ambient-fountain-f` |
| `starburst` | Starburst                | `ambient-rail-f`     |

Ids: `fn-<style>-1..6` (L6 adds the three-frame pulse by itself).

### B5 loose items (five styles, four items each)

| Style       | Common border (2 levels) | Common numbers (2) | Epic attack (4) | Epic tick (4) | Border motion      | Corner   |
| ----------- | ------------------------ | ------------------ | --------------- | ------------- | ------------------ | -------- |
| `forge`     | Rivet Brackets           | Stamped Numerals   | Anvil Strike    | Spark Tick    | `ambient-pop`      | pauldron |
| `woodcraft` | Twine Corners            | Carved Numerals    | Whittle Cut     | Woodchip Tick | `ambient-rail`     | knot     |
| `starmap`   | Compass Corners          | Inked Numerals     | Comet Slash     | Star Tick     | `ambient-orbit`    | wings    |
| `candy`     | Gumdrop Corners          | Candy Numerals     | Ribbon Swipe    | Pop Tick      | `ambient-fountain` | shards   |
| `rune`      | Rune Corners             | Rune Numerals      | Rune Cleave     | Glyph Tick    | `ambient-pair`     | acanthus |

Ids: `bd-<style>-1..2`, `num-<style>-1..2`, `px-slash-<style>-1..4`, `tk-<style>-1..4`. Not in a set.

### Existing borders and finishes (B8 / B9 spread)

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

## B8 particle motions

`ambient-<motion>` moves the border particles, `ambient-<motion>-f` the finish particles: `rail` (rail drift), `pop` (cel pop), `orbit` (frame orbit), `pair` (slow pair, 2 per slot), `fountain` (footer fountain). CSS only, transform and opacity, whole-pixel steps, at most 3 per slot (6 per card), paused off screen, a still pose under reduced motion.

## B9 corner flourishes

`corner-acanthus`, `corner-pauldron`, `corner-wings`, `corner-shards`, `corner-knot`: pixel layers on the frame grid, at most 9 px (about 7 % of the card) outside the edge, within the outer fifth of each side, footer band clear, cut around the tier sockets and crest.

## UI-skin slots (one level each; `a` is the starter, suggested rarities b Rare, c Epic, d Legendary, e Mythic)

| Slot           | Recipes             | Styles                                                                                                    | Art function                                                                       |
| -------------- | ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Starlight coin | `ui-starlight-a..e` | a silver four-point, b indigo rim five-point, c bare star burst, d moon prism, e constellation            | `starlightCoin(style)` (48 × 48)                                                   |
| Sticker style  | `ui-sticker-a..e`   | a mini card, b silver card, c gold card, d legendary card, e prismatic card                               | `stickerArt(style, achievementId, chapter, unlocked)` (74 × 74), `cardShardIcon()` |
| Skill nodes    | `ui-nodes-a..e`     | a brilliant in a bronze cup, b hex in a silver bezel, c bare rhombus, d star cut, e kite with gold prongs | `skillNode(style, branch, state, keystone?)`, `starChart(style, stars, links)`     |
| Wardrobe style | `ui-wardrobe-a..e`  | a sockets, b gilt plaques, c quiet ink, d banners, e rarity glass                                         | `wardrobeChrome(style, part, rarity?)`, `chromeCss(piece, scale)`                  |

All functions are in `src/renderer/src/art/cosmetics.ts`.
