"""Builds the PixelLab input sheets for concept sheet 1 (coins, medals, maul, bow, uniques).

Each concept sprite is cropped from the user's sheet, scaled so it lands at the size of the game
sprite it replaces, and placed in a cell of that sprite's size (48 x 48 or 100 x 120). The sheet is
built at 4x so PixelLab's image_to_pixelart can return it at exactly 1x (one call per sheet).

Usage: py design/pixel/concept-sheet-1/make_inputs.py <concept.jpg> <out dir>
"""
import json
import sys
from pathlib import Path

from PIL import Image

K = 4  # input sheets are 4x the output grid
BG = (20, 19, 27)  # the concept sheet's own background

# (name, crop box in the concept sheet, scale to game pixels, rotation in degrees, centre in cell)
COINS = [  # left to right on the sheet
    ("coin-B", (6, 29, 48, 71), 1.1, 0, (24, 24)),
    ("coin-F", (52, 29, 94, 71), 1.1, 0, (24, 24)),
    ("coin-S", (98, 29, 140, 71), 1.1, 0, (24, 24)),
    ("coin-G", (144, 29, 186, 71), 1.1, 0, (24, 24)),
    ("coin-V", (189, 29, 233, 71), 1.1, 0, (24, 24)),
    ("coin-void", (252, 29, 296, 71), 1.1, 0, (24, 24)),
]
STARS = [
    ("star-1", (9, 87, 46, 121), 1.32, 0, (24, 24)),
    ("star-2", (54, 87, 92, 121), 1.32, 0, (24, 24)),
    ("star-3", (99, 87, 138, 121), 1.32, 0, (24, 24)),
    ("star-4", (146, 87, 183, 121), 1.32, 0, (24, 24)),
    ("star-5", (190, 87, 229, 121), 1.32, 0, (24, 24)),
    ("star-6", (254, 87, 292, 121), 1.32, 0, (24, 24)),
]
# one scale per ladder, so the steps keep the concept's growth; the tallest step fills the old
# sprite's box (about 7 px clear at top and bottom, as the old maul and bow)
HS = 1.15
BS = 1.1
ITEMS = [
    ("hammer-1", (22, 182, 72, 258), HS, 0, (54, 60)),
    ("hammer-2", (95, 183, 145, 258), HS, 0, (54, 60)),
    ("hammer-3", (166, 179, 225, 262), HS, 0, (54, 60)),
    ("hammer-4", (243, 179, 307, 265), HS, 0, (54, 60)),
    ("hammer-5", (323, 179, 389, 267), HS, 0, (54, 60)),
    ("hammer-6", (404, 179, 476, 268), HS, 0, (54, 60)),
    ("bow-1", (540, 179, 577, 264), BS, 0, (70, 60)),
    ("bow-2", (608, 179, 648, 267), BS, 0, (68, 60)),
    ("bow-3", (665, 179, 727, 272), BS, 0, (60, 60)),
    ("bow-4", (734, 179, 794, 270), BS, 0, (60, 60)),
    ("bow-5", (802, 179, 866, 274), BS, 0, (58, 60)),
    # (the first items run cut the uniques off at the cell edge; they have their own sheet below)
]
# uniques: turned and scaled so the blade lies on the spine their live motion follows
# (EVOLUTION_GEO in art/vector/items.ts): Flameblade guard (35, 89) to tip (78, 13), Soul Reaper
# blade from (61, 22) round to (85, 89), in game pixels
UNIQ = [
    ("flameblade", (18, 425, 119, 543), 0.86, 7, (48, 63)),
    ("soul_reaper", (135, 425, 246, 542), 0.87, 0, (54, 62)),
]


def place(src, box, scale, rot, centre, cell, sheet, origin):
    crop = src.crop(box)
    if rot:
        crop = crop.rotate(rot, resample=Image.BICUBIC, expand=True, fillcolor=BG)
    w, h = round(crop.width * scale * K), round(crop.height * scale * K)
    crop = crop.resize((w, h), Image.LANCZOS)
    cx, cy = (origin[0] + centre[0]) * K, (origin[1] + centre[1]) * K
    cw, ch = cell
    # clip to the cell so neighbours never overlap
    x0, y0 = cx - w // 2, cy - h // 2
    cl = (max(0, origin[0] * K - x0), max(0, origin[1] * K - y0),
          min(w, (origin[0] + cw) * K - x0), min(h, (origin[1] + ch) * K - y0))
    sheet.paste(crop.crop(cl), (x0 + cl[0], y0 + cl[1]))


def build(src, groups, cell, cols, path):
    names = [g[0] for g in groups]
    rows = (len(groups) + cols - 1) // cols
    sheet = Image.new("RGB", (cell[0] * cols * K, cell[1] * rows * K), BG)
    layout = {}
    for i, (name, box, scale, rot, centre) in enumerate(groups):
        origin = ((i % cols) * cell[0], (i // cols) * cell[1])
        place(src, box, scale, rot, centre, cell, sheet, origin)
        layout[name] = [origin[0], origin[1], cell[0], cell[1]]
    sheet.save(path)
    return layout


def main():
    src = Image.open(sys.argv[1]).convert("RGB")
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    lay = {
        "small": build(src, COINS + STARS, (48, 48), 6, out / "in-small.png"),
        "items": build(src, ITEMS, (100, 120), 5, out / "in-items.png"),
        "uniques": build(src, UNIQ, (100, 120), 2, out / "in-uniques.png"),
    }
    (out / "layout.json").write_text(json.dumps(lay, indent=1))


if __name__ == "__main__":
    main()
