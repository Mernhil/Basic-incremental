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

Top tiers (ASSET_RULES §5, Top-tier looks): `--top` cuts the user's ten top-tier sheets the same way. The
sheets are already transparent but carry faint low-alpha noise, so the weapons are found by their solid
alpha instead of by a background colour, the row titles and the BASE / +1 captions (dark text) are dropped,
and every weapon of a sheet shares one scale (the eight type sheets: the tallest look at its size-table
height; the two Heirloom sheets: the staff at the tallest height, the other nine types in the sheet's own
relative sizes).

Usage: py design/pixel/weapon-tier-sprites/straight.py <folder with the eight concept sheets .webp>
       py design/pixel/weapon-tier-sprites/straight.py --top <folder with the ten top-tier sheets .webp>
Writes src/renderer/src/art/pixel/hand/item-<type>-t<tier>-<step>.png (--top: item-<type>-t5-<step>,
-t6m-<step>, -t6v-<step>, item-<type>-hm and -hv) and updates hand/outlines.json.
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
TOP = len(sys.argv) > 2 and sys.argv[1] == "--top"
cut.SRC = Path(sys.argv[-1])

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
    "spear": 351,
    "pickaxe": 323,
    "staff": 418,
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


# --- the top-tier sheets (Prismatic T5, Mythic and Void T6, Heirloom) ---------------------------------
# one sheet per type: three rows of looks, named on the sheet (the names are in the PR description)
TOP_TYPES = ["sword", "greatsword", "spear", "lance", "hammer", "scythe", "pickaxe", "logging_axe"]
TOP_ROWS = [("t5", 5), ("t6m", 6), ("t6v", 6)]  # art suffix and the number of looks (BASE, +1 ...) of each row
HEIRLOOM_ORDER = ["sword", "greatsword", "spear", "lance", "dagger", "hammer",
                  "bow", "staff", "scythe", "pickaxe", "logging_axe"]  # top row 6, bottom row 5
HEIRLOOM_SHEETS = {"hm": "heirloom_mythic_side", "hv": "heirloom_void_side"}  # blue = Mythic side, purple = Void side


def solid_pictures(sheet: Image.Image, merge: int, drop_text: bool):
    """The weapons of a transparent sheet: [(box, RGBA)] with the sheet's low-alpha noise gone, one pixel of
    fringe trimmed and the edge softened (same as `keyed`). Text (dark, small) is dropped; a fragment that is
    not text (a floating crystal, a ribbon) is merged into the weapon it belongs to by dilating `merge` px."""
    a = np.array(sheet.convert("RGBA"))
    solid = a[..., 3] >= 128
    if drop_text:  # first the captions and titles: small grey blobs, found before anything is merged
        lab0, _ = ndi.label(ndi.binary_dilation(solid, iterations=3))
        for i, sl in enumerate(ndi.find_objects(lab0)):
            m = (lab0[sl] == i + 1) & solid[sl]
            rgb = a[sl][..., :3][m].astype(int)
            grey = (rgb.max(-1) - rgb.min(-1)).mean() < 30  # the text is grey or black, the weapons' small parts are coloured
            if sl[0].stop - sl[0].start < 60 and grey:
                solid[sl] &= ~m
    lab, n = ndi.label(ndi.binary_dilation(solid, iterations=merge))
    out = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        m = (lab[sl] == i + 1) & solid[sl]
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h < 60 and w < 60:
            continue  # specks
        fg = ndi.binary_erosion(m, iterations=1)
        lab2, k = ndi.label(fg)
        if k:
            sizes = ndi.sum(fg, lab2, range(1, k + 1))
            fg = np.isin(lab2, [j + 1 for j, v in enumerate(sizes) if v >= 40])
        alpha = np.clip((ndi.gaussian_filter(fg.astype(float), 0.7) - 0.15) / 0.7, 0, 1)
        rgba = np.dstack([a[sl][..., :3], alpha * 255]).astype(np.uint8)
        pic = Image.fromarray(rgba, "RGBA")
        out.append(((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop), pic.crop(pic.getbbox())))
    return out


def rows_of(items, counts):
    """Group pictures into rows by their centre y (counts = expected size of each row), each sorted left to right."""
    items = sorted(items, key=lambda it: (it[0][1] + it[0][3]) / 2)
    rows, i = [], 0
    for c in counts:
        row = sorted(items[i : i + c], key=lambda it: it[0][0])
        rows.append(row)
        i += c
    assert i == len(items), (counts, len(items))
    return rows


def paste_card(c: Image.Image, scale: float) -> Image.Image:
    w, h = max(1, round(c.width * scale)), max(1, round(c.height * scale))
    pic = c.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    canvas.paste(pic, ((CW - w) // 2, (CH - h) // 2), pic)
    return canvas


def save_pic(name: str, canvas: Image.Image, outlines: dict) -> None:
    canvas.save(HAND / f"{name}.png", optimize=True)
    outlines[name] = trace(np.array(canvas)[..., 3])


def main_top() -> None:
    outlines = json.loads((HAND / "outlines.json").read_text())
    for t in TOP_TYPES:
        sheet = Image.open(cut.SRC / f"{t}.webp")
        rows = rows_of(solid_pictures(sheet, 9, True), [n for _, n in TOP_ROWS])
        pics = [c for row in rows for _, c in row]
        scale = min(TARGET_H[t] / max(c.height for c in pics), 0.84 * CW / max(c.width for c in pics))
        for (suffix, _), row in zip(TOP_ROWS, rows):
            for step, (_, c) in enumerate(row):
                save_pic(f"item-{t}-{suffix}-{step}", paste_card(c, scale), outlines)
        print(t, [len(r) for r in rows], round(scale, 3))
    for side, fname in HEIRLOOM_SHEETS.items():
        sheet = Image.open(cut.SRC / f"{fname}.webp")
        rows = rows_of(solid_pictures(sheet, 10, False), [6, 5])
        pics = [c for row in rows for _, c in row]
        kinds = HEIRLOOM_ORDER
        by = dict(zip(kinds, pics))
        # one scale for the whole sheet: the staff (the tallest weapon) at its size-table height, never wider than 84%
        scale = min(TARGET_H["staff"] / by["staff"].height, 0.84 * CW / max(c.width for c in pics))
        for kind, c in by.items():
            save_pic(f"item-{kind}-{side}", paste_card(c, scale), outlines)
        print(side, len(pics), round(scale, 3))
    (HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")


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
    main_top() if TOP else main()
