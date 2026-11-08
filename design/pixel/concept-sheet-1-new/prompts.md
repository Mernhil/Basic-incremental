# Concept sheet 1, remaining parts → draft sprites (PixelLab)

Drafts for approval only: nothing here is wired into the game, its data or DESIGN.md. Every sprite
is drawn by PixelLab (the `pixellab` MCP server); the scripts only cut, key, clean and outline. The
user's concept sheet (`design/references/concept-2026-11-08/sheet-1-mixed.jpg`) stays local and is
never committed, nor are the input sheets built from it.

## Pipeline

1. `make_inputs.py <sheet> <dir>` crops every concept sprite, scales it to its chosen size and lays
   the crops on four sheets at 4× (`items` 100 × 120 cells, `icons` 48 × 48, `fx` 64 × 64, `ui`
   packed at each piece's own size). Crops, scales and sizes are in the script and `layout.json`.
2. PixelLab converts each sheet in one call (below). Results: `pixellab/`.
3. `post.py` cleans them into `drafts/<group>/` (reusing `../concept-sheet-1/post.py`): background
   keyed out, small palette, orphans cleared; ink outline + rarity rim on card items, ink + white
   ring on icons, light-only effects (every dark pixel cleared, no outline), magic patterns snapped
   to a four-tone gold / purple / silver ramp by brightness (the conversion left the thin dotted
   lines dim), frames and panels hollowed. It also writes `drafts/items/outlines.json` (the traced
   silhouette the element effects would follow) and the attack strips.
4. `contact.py` → `contact-*.png`; `previews.py` → `previews/` (sheet.py GIFs + APNGs);
   `trail_tokens.py` → `drafts/trails/tokens.json` + `contact-trail-tokens.png`.

`pixel_check.py` on `drafts/`: 144 files, 0 errors.

## PixelLab calls (15 generations)

Conversions: `image_to_pixelart`, `faithful: true`, `init_image_strength: 200`, `seed: 11`.

| Output               | Input (4×)  | Output    | Content                                                                 |
| -------------------- | ----------- | --------- | ----------------------------------------------------------------------- |
| `pixellab/items.png` | 2000 × 1920 | 500 × 480 | 6 katanas (×1.1), 7 books (×1.45), 2 staffs (×1.2), daggers, hammer      |
| `pixellab/icons.png` | 1920 × 960  | 480 × 240 | 20 trail feathers, 7 debuffs, 4 portraits, 12 flora, 4 hex badges        |
| `pixellab/fx.png`    | 2048 × 1536 | 512 × 384 | 15 attack frames (×1.2), 27 magic patterns (×0.95)                       |
| `pixellab/ui.png`    | 2048 × 1088 | 512 × 272 | frames, panel, bars, small icons, cursors, cosmetic frames and corners   |

Gap-fills: `create_image_pixflux`, 100 × 120, `no_background`, black outline, side view, init =
the cleaned neighbour step (no rim).

| Output                     | Init        | Strength | Seed | Description (short)                                                     |
| -------------------------- | ----------- | -------- | ---- | ----------------------------------------------------------------------- |
| `katana-void.png`          | katana 6    | 110      | 21   | same ornate sword in black chrome, violet cracks, dark violet guard      |
| `staff-common.png`         | staff A     | 100      | 21   | plain wooden staff, small plain iron cross head, no gems                 |
| `staff-legendary.png`      | staff B     | 120      | 21   | broader, gold inlay, larger ruby, emerald studs, small red ribbon        |
| `staff-mythic.png`         | staff B     | 110      | 22   | pink neon runes on the shaft, crystal edge round the big gem             |
| `staff-exotic.png`         | staff B     | 110      | 23   | forked prongs on the cross head, floating golden ring, teal and gold     |
| `staff-void.png`           | staff B     | 100      | 24   | black chrome, violet cracks, dark violet crystal, purple shards          |

Tried and dropped: void katana at strength 80, seed 31 (pale blade, lost the katana's shape).

Attack gap frames: `animate_image`, 64 × 64, 4 frames, `no_background`, seed 5, first frame = the
last concept frame (cleaned). Frames used: Crimson Moon break ← anim frame 4; Triple Slash break ←
4; Piercing Thrust thin ← 3, break ← 4; Strike Burst break ← 4.

| Output                | First frame | Action                                                                       |
| --------------------- | ----------- | ---------------------------------------------------------------------------- |
| `anim-crimson-1..4`   | crimson-3   | the crimson slash arcs thin out and break apart into small fading red sparks |
| `anim-triple-1..4`    | triple-3    | the three silver slash streaks thin out and break apart into small fading white sparks |
| `anim-pierce-1..4`    | pierce-2    | the green thrust burst fades: the spear withdraws and the green energy thins and breaks into small fading sparks |
| `anim-burst-1..4`     | burst-3     | the golden star burst shrinks and breaks into small fading golden sparks |
