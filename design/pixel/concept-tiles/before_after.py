"""Before / after sheet for the production tiles: for each tile row, the old tiles (stages 0-4) above
the new ones, at 1x and at 3x (nearest neighbour), on the dark production panel colour.

Usage: py design/pixel/concept-tiles/before_after.py <old sprites dir> <new sprites dir> <out.png>
(the old tiles can be pulled from git, e.g. `git show main:src/renderer/src/art/pixel/sprites/...`).
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROWS = [
    ("mine-square", "Copper Quarry"),
    ("mine-hexagon", "Iron Deeps"),
    ("mine-drop", "Crystal Grotto"),
    ("tree-round", "Oak"),
    ("tree-pentagon", "Ironbark"),
    ("tree-star", "Moonwillow"),
]
W, H, BIG = 58, 64, 3
BG = (30, 33, 46)
CARD = (40, 44, 60)
INK = (226, 230, 240)
DIM = (150, 156, 176)
LABEL_W = 150
GAP = 10


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("segoeuib.ttf" if bold else "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    old, new, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    small_w = 5 * (W + GAP)
    big_w = 5 * (W * BIG + GAP)
    row_h = 2 * (H * BIG + GAP) + 24
    width = LABEL_W + small_w + 40 + big_w + 20
    height = 70 + len(ROWS) * (row_h + 16)
    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)
    d.text((20, 16), "Production tiles: before and after", fill=INK, font=font(22, True))
    d.text(
        (20, 44),
        "Each row: the current tiles on top, the new tiles from the concept sheets below. "
        "Left 1x (game size), right 3x.",
        fill=DIM,
        font=font(14),
    )
    y = 70
    for key, label in ROWS:
        d.rounded_rectangle((10, y - 6, width - 10, y + row_h - 4), 8, fill=CARD)
        d.text((20, y + 4), label, fill=INK, font=font(17, True))
        d.text((20, y + 28), f"tile-{key}-0..4", fill=DIM, font=font(12))
        for half, (src, tag) in enumerate(((old, "before"), (new, "after"))):
            yy = y + 24 + half * (H * BIG + GAP)
            d.text((20, yy + H * BIG // 2 - 8), tag, fill=DIM, font=font(15))
            for s in range(5):
                t = Image.open(src / f"tile-{key}-{s}.png").convert("RGBA")
                x1 = LABEL_W + s * (W + GAP)
                img.paste(t, (x1, yy + H * BIG - H), t)
                tb = t.resize((W * BIG, H * BIG), Image.NEAREST)
                x3 = LABEL_W + small_w + 40 + s * (W * BIG + GAP)
                img.paste(tb, (x3, yy), tb)
        y += row_h + 16
    img.save(out)
    print(f"wrote {out} ({width} x {height})")


if __name__ == "__main__":
    main()
