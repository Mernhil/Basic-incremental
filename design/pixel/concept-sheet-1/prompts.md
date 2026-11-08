# Concept sheet 1 → game sprites (PixelLab)

Every sprite here was drawn by PixelLab (the `pixellab` MCP server). The project scripts only cut,
key, clean up and outline (`post.py`). The user's concept sheet
(`design/references/concept-2026-11-08/sheet-1-mixed.jpg`) is local and never committed, and neither
are the input sheets built from it.

## Pipeline

1. `make_inputs.py <sheet> <dir>` crops each concept sprite, scales it so it lands at the size of the
   game sprite it replaces, and lays the crops out on cells of the game size (48 × 48, 100 × 120), at
   4×. One PixelLab call then converts a whole sheet at exactly 1×. The uniques are turned and scaled
   so their blades lie on the spine their live motion follows (`EVOLUTION_GEO`).
2. PixelLab converts the sheets (below); the results are in `pixellab/`.
3. `post.py` cuts the cells, keys out the background, snaps each sprite to a small palette, clears
   orphan pixels, adds the ink outline (`#1a1020`) and the ring (tier colour on coins as before, white
   on medals, the light rim on card items), sets the resource's gem and the padlock from the approved
   coins back on the coins, keeps the approved plus-sparkles where they fit, and writes
   `src/renderer/src/art/pixel/hand/*.png` plus `hand/outlines.json` (the silhouette the element
   effects trace).
4. `node scripts/art/bake-pixels.mjs` (set `PYTHON=py` on Windows) copies the hand sprites into
   `sprites/`, skips baking those names and writes `manifest.ts`.
5. `before_after.py` draws `before-after.png`. `old/` holds the sprites as they were before this pass
   (the gems, padlocks and sparkles come from there).

## PixelLab calls

All conversions: `image_to_pixelart`, `faithful: true`, `init_image_strength: 200`, `seed: 11`
(faithful mode reproduces the user's art instead of reinterpreting it; 200 keeps composition and
colours while snapping to a clean grid).

| Output              | Input (4×)  | Output size | What                                               |
| ------------------- | ----------- | ----------- | -------------------------------------------------- |
| `pixellab/small.png`   | 1152 × 384  | 288 × 96    | six concept coins, six concept stars (48 × 48 each) |
| `pixellab/items.png`   | 2000 × 1440 | 500 × 360   | hammer ladder 1–6 (scale 1.15), bows 1–5 (scale 1.1) |
| `pixellab/uniques.png` | 800 × 480   | 200 × 120   | flaming sword (scale 0.86, turned 7°), scythe (0.87) |

Gap-fills (no concept column for that rarity): `create_image_pixflux`, 100 × 120,
`no_background: true`, `outline: single color black outline`, `view: side`, init image = the cleaned
step below it (no sparkles, no rim).

| Output                   | Init          | Strength | Seed | Description                                                                                                                                                                  |
| ------------------------ | ------------- | -------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pixellab/maul-void.png`  | maul exotic   | 120      | 21   | void war hammer: the same ornate hammer with crown, bands and side crystals, all in glossy black chrome with violet highlights, glowing violet cracks, dark violet crystals, pixel art with dark outline |
| `pixellab/bow-exotic.png` | bow mythic    | 180      | 7    | the same ornate recurve bow with an arrow nocked, limb tips split into forked prongs, a floating golden ring around the grip, teal and gold with warm amber flames, exotic, pixel art with dark outline |
| `pixellab/bow-void.png`   | bow mythic    | 80       | 7    | void bow: the same recurve bow with arrow nocked in glossy black chrome, glowing violet cracks along the limbs, violet flames, small dark purple shards, pixel art with dark outline |

Tried and dropped: the first items sheet at scale 1.25 (the weapons reached the edge of the 100 × 120
box; the old ones keep about 7 px clear), with the uniques on it (they were clipped); void maul at
strength 180 (kept the exotic colours) and 80 (lost the bands and crown).

Total: 12 generations (the account had only the 20 daily trial generations left).
