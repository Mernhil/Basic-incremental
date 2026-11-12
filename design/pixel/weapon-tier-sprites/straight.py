"""Cuts the 80 weapon pictures straight out of the user's eight concept sheets (ASSET_RULES §5, Straight pictures).

The only processing: crop each weapon out of its sheet at the sheet's own resolution, remove the
navy background (a transparent PNG, one pixel of fringe trimmed and the edge softened), scale it
smoothly, and place it centred on a transparent canvas of the card's proportion, 396 x 558 px (3x the
132 x 186 card grid). No pixel-grid conversion, no palette reduction, no recolour, no redrawn outline.

Scale: one per weapon (all ten steps of a weapon share it, so the steps keep the sheet's growth), set so
the weapon's tallest step is the height the size table gives it (ASSET_RULES §5: the tallest weapon of all
is 75% of the card's height, the others relative to it).

Also writes each picture's silhouette (from its alpha) into hand/outlines.json, in item-box units, for the
element effects (`art/fx.ts`).

Usage: py design/pixel/weapon-tier-sprites/straight.py <folder with the eight concept sheets .webp>
Writes src/renderer/src/art/pixel/hand/item-<type>-t<tier>-<step>.png and updates hand/outlines.json.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
HAND = ROOT / "src/renderer/src/art/pixel/hand"

spec = importlib.util.spec_from_file_location("cut", HERE / "cut.py")
cut = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cut)
cut.SRC = Path(sys.argv[1])

CW, CH = 396, 558  # the card at 3x (132 x 186 grid): sharp up to 150% screens
# the card's height share of the weapons' tallest looks at 1320 x 1860 (ASSET_RULES §5 size table), x 0.3 here
TARGET_H = {
    "sword": 297,
    "greatsword": 366,
    "dagger": 231,
    "hammer": 312,
    "lance": 378,
    "bow": 400,
    "scythe": 400,
    "logging_axe": 369,
}
STEPS = cut.STEPS
# item-box units (200 x 240): the card canvas is drawn 177.4 x 250 units, centred on the box
UW, UH, UX, UY = 250 * CW / CH, 250.0, None, -7.0
UX = (200 - UW) / 2


def keyed(im: Image.Image, mask: np.ndarray, bg) -> np.ndarray:
    """RGBA of one weapon: background and neighbours transparent, one pixel of navy fringe trimmed."""
    a = np.array(im.convert("RGB")).astype(int)
    near = np.abs(a - np.array(bg)).sum(-1) < 30
    fg = mask & ~near
    lab, n = ndi.label(fg)  # specks go; the gaps a weapon encloses (a guard loop, inside a bow string) stay see-through
    if n:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        fg = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= 40])
    fg = ndi.binary_erosion(fg, iterations=1)
    alpha = ndi.gaussian_filter(fg.astype(float), 0.7)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    return np.dstack([a, alpha * 255]).astype(np.uint8)


def trace(alpha: np.ndarray) -> str:
    """The picture's silhouette as a closed path in item-box units, 96 points (the largest outline)."""
    m = np.pad(alpha > 128, 1)
    best = max(measure.find_contours(m.astype(float), 0.5), key=len)
    seg = np.sqrt((np.diff(best, axis=0) ** 2).sum(1))
    s = np.concatenate([[0], np.cumsum(seg)])
    pts = []
    for i in range(96):
        t = s[-1] * i / 96
        k = min(np.searchsorted(s, t, side="right") - 1, len(best) - 2)
        f = (t - s[k]) / (seg[k] or 1)
        yy, xx = best[k] + (best[k + 1] - best[k]) * f
        px, py = xx - 1 + 0.5, yy - 1 + 0.5
        pts.append(f"{round(UX + px * UW / CW, 1):g} {round(UY + py * UH / CH, 1):g}")
    return "M" + " L".join(pts) + "Z"


def main() -> None:
    layout = json.loads((HERE / "layout.json").read_text())
    outlines = json.loads((HAND / "outlines.json").read_text())
    for t in cut.TYPES:
        im, found = cut.cells(t)
        boxes = [b for row in found for b in row]
        bg = layout[t]["bg"]
        crops = []
        for b in boxes:
            x0, y0, x1, y1, mask = b
            rgba = keyed(im.crop((x0, y0, x1, y1)), mask, bg)
            pic = Image.fromarray(rgba, "RGBA")
            crops.append(pic.crop(pic.getbbox()))
        # the table's height, but never wider than 84% of the card (the sheets' weapons are diagonal, so a
        # wide one such as the lance would otherwise leave the card)
        scale = min(TARGET_H[t] / max(c.height for c in crops), 0.84 * CW / max(c.width for c in crops))
        for (tier, step), c in zip(STEPS, crops):
            w, h = max(1, round(c.width * scale)), max(1, round(c.height * scale))
            pic = c.resize((w, h), Image.LANCZOS)
            canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
            canvas.paste(pic, ((CW - w) // 2, (CH - h) // 2), pic)
            name = f"item-{t}-{tier}-{step}"
            canvas.save(HAND / f"{name}.png", optimize=True)
            outlines[name] = trace(np.array(canvas)[..., 3])
        print(t, round(scale, 3))
    (HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
