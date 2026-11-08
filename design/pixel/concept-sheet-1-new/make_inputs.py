"""Builds the PixelLab input sheets for the rest of concept sheet 1 (drafts, not wired into the game).

Each concept sprite is cropped from the user's sheet, scaled so it lands at its chosen game size,
and laid out on a sheet at 4x, so one PixelLab image_to_pixelart call converts a whole sheet at
exactly 1x. Sheets: `items` (100 x 120 cells), `icons` (48 x 48), `fx` (64 x 64) and `ui` (packed
pieces of their own sizes).

Usage: py design/pixel/concept-sheet-1-new/make_inputs.py <concept.jpg> <out dir>
Writes in-<sheet>.png (4x) and layout.json (each sprite's cell at 1x).
"""
import json
import sys
from pathlib import Path

from PIL import Image

K = 4
BG = (20, 19, 27)  # the concept sheet's background

# (name, crop box on the concept sheet, scale to game pixels, cell w, cell h)
ITEM = (100, 120)
KAT, BOOK, STAFF = 1.1, 1.45, 1.2
ITEMS = [
    *[(f"katana-{i + 1}", b, KAT, *ITEM) for i, b in enumerate([
        (12, 303, 80, 389), (86, 299, 156, 389), (160, 295, 237, 391),
        (239, 295, 318, 393), (320, 295, 402, 394), (405, 295, 487, 395)])],
    *[(f"book-{i + 1}", b, BOOK, *ITEM) for i, b in enumerate([
        (532, 320, 587, 386), (599, 320, 656, 386), (668, 319, 725, 386), (736, 320, 794, 387),
        (805, 319, 864, 391), (873, 319, 936, 391), (943, 319, 1006, 391)])],
    ("staff-A", (863, 178, 933, 268), STAFF, *ITEM),
    ("staff-B", (938, 178, 1013, 268), STAFF, *ITEM),
    ("unique-daggers", (258, 422, 367, 536), 0.82, *ITEM),
    ("unique-hammer", (379, 423, 489, 541), 0.9, *ITEM),
]

ICON = (48, 48)
_feathers = [(13, 645), (52, 645), (92, 645), (132, 645), (172, 645)] + [
    (x0, 645) for x0 in (226, 266, 305, 345, 386, 425, 464, 518, 558, 597, 637, 690, 731, 770, 810)
]
ICONS = [
    *[(f"trail-{i + 1:02d}", (x - 2, y - 1, x + 36, y + 37), 1.1, *ICON) for i, (x, y) in enumerate(_feathers)],
    *[(f"debuff-{i + 1}", (b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2), 1.25, *ICON) for i, b in enumerate([
        (863, 579, 896, 611), (901, 579, 934, 611), (940, 579, 972, 611), (978, 579, 1010, 611),
        (863, 616, 896, 648), (902, 616, 935, 648), (940, 616, 972, 648)])],
    *[(f"portrait-{i + 1}", (b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2), 1.0, *ICON) for i, b in enumerate([
        (708, 710, 742, 753), (758, 712, 799, 753), (811, 710, 854, 753), (864, 710, 904, 753)])],
    *[(f"flora-{i + 1:02d}", (b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2), 1.0, *ICON) for i, b in enumerate([
        (920, 712, 958, 750), (971, 712, 1010, 752), (704, 760, 745, 802), (758, 762, 797, 801),
        (811, 762, 852, 802), (867, 762, 901, 802), (917, 761, 958, 801), (971, 763, 1010, 802),
        (705, 810, 747, 853), (757, 811, 800, 852), (810, 814, 853, 849), (866, 812, 904, 853)])],
    *[(f"hex-badge-{i + 1}", (b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2), 1.0, *ICON) for i, b in enumerate([
        (10, 709, 49, 751), (55, 709, 93, 751), (101, 708, 140, 751), (146, 708, 184, 751)])],
]

FX = (64, 64)
_m1 = [9, 81, 153, 226, 298, 371, 443, 517, 589, 664, 736, 806, 880, 951]
_m2 = [9, 81, 153, 226, 298, 371, 443, 517, 589, 664, 736, 806, 880]
FXS = [
    *[(f"atk-{n}", (b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3), 1.2, *FX) for n, b in [
        ("cross-1", (15, 584, 59, 624)), ("cross-2", (72, 583, 115, 624)),
        ("cross-3", (125, 582, 161, 625)), ("cross-4", (184, 582, 223, 625)),
        ("crimson-1", (241, 583, 284, 627)), ("crimson-2", (305, 581, 338, 627)),
        ("crimson-3", (347, 582, 390, 629)),
        ("triple-1", (408, 582, 453, 627)), ("triple-2", (461, 582, 506, 627)),
        ("triple-3", (517, 581, 560, 627)),
        ("pierce-1", (575, 583, 618, 627)), ("pierce-2", (628, 582, 671, 627)),
        ("burst-1", (685, 582, 731, 627)), ("burst-2", (742, 582, 786, 627)),
        ("burst-3", (796, 582, 841, 627))]],
    *[(f"magic-{i + 1:02d}", (x, 879, x + 66, 947), 0.95, *FX) for i, x in enumerate(_m1)],
    *[(f"magic-{i + 15:02d}", (x, 950, x + 66, 1018), 0.95, *FX) for i, x in enumerate(_m2)],
]

# interface and cosmetic frames: (name, box, scale, w, h) at their own sizes, shelf-packed
UI = [
    *[(f"frame-{i + 1}", b, s, 100, 120) for i, (b, s) in enumerate([
        ((7, 756, 97, 853), 1.2), ((100, 756, 182, 853), 1.2), ((183, 752, 257, 854), 1.15),
        ((261, 752, 334, 855), 1.15)])],
    ("panel-wide", (192, 708, 314, 751), 1.0, 124, 44),
    ("bar-title", (339, 707, 504, 730), 1.0, 168, 24),
    ("bar-ribbon", (338, 731, 505, 756), 1.0, 168, 28),
    ("bar-progress", (342, 757, 429, 779), 1.0, 88, 24),
    ("icon-check", (430, 760, 448, 780), 1.0, 20, 20),
    ("icon-link", (449, 763, 466, 780), 1.0, 20, 20),
    ("cursor-knob", (342, 785, 374, 816), 1.0, 32, 32),
    ("cursor-gauntlet", (382, 785, 410, 816), 1.0, 32, 32),
    ("cursor-arrow-1", (421, 788, 442, 814), 1.0, 32, 32),
    ("cursor-arrow-2", (448, 788, 471, 816), 1.0, 32, 32),
    ("cursor-arrow-3", (352, 823, 373, 842), 1.0, 32, 32),
    ("cursor-arrow-4", (386, 819, 409, 847), 1.0, 32, 32),
    ("cursor-arrow-5", (417, 819, 442, 848), 1.0, 32, 32),
    ("cos-frame-1", (520, 710, 602, 793), 1.0, 84, 84),
    ("cos-frame-2", (606, 708, 691, 793), 1.0, 88, 88),
    ("cos-frame-wide", (519, 795, 603, 854), 1.0, 84, 60),
    ("cos-corner-1", (606, 795, 650, 841), 1.0, 44, 48),
    ("cos-corner-2", (649, 807, 691, 854), 1.0, 44, 48),
]


def place(src, box, scale, cell, origin, sheet):
    crop = src.crop(box)
    w, h = round(crop.width * scale * K), round(crop.height * scale * K)
    crop = crop.resize((w, h), Image.LANCZOS)
    cw, ch = cell
    x0 = origin[0] * K + (cw * K - w) // 2
    y0 = origin[1] * K + (ch * K - h) // 2
    cl = (max(0, origin[0] * K - x0), max(0, origin[1] * K - y0),
          min(w, (origin[0] + cw) * K - x0), min(h, (origin[1] + ch) * K - y0))
    sheet.paste(crop.crop(cl), (x0 + cl[0], y0 + cl[1]))


def grid(src, entries, cols, path):
    cw, ch = entries[0][3], entries[0][4]
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new("RGB", (cw * cols * K, ch * rows * K), BG)
    lay = {}
    for i, (name, box, scale, w, h) in enumerate(entries):
        o = ((i % cols) * cw, (i // cols) * ch)
        place(src, box, scale, (w, h), o, sheet)
        lay[name] = [o[0], o[1], w, h]
    sheet.save(path)
    return lay


def shelf(src, entries, width, path):
    """Packs pieces of different sizes left to right in rows (4 px apart), tallest first."""
    order = sorted(entries, key=lambda e: -e[4])
    x = y = row_h = 0
    pos = {}
    for name, box, scale, w, h in order:
        if x + w > width:
            x, y, row_h = 0, y + row_h + 4, 0
        pos[name] = (x, y)
        x += w + 4
        row_h = max(row_h, h)
    height = y + row_h
    height += -height % 4
    sheet = Image.new("RGB", (width * K, height * K), BG)
    lay = {}
    for name, box, scale, w, h in entries:
        place(src, box, scale, (w, h), pos[name], sheet)
        lay[name] = [pos[name][0], pos[name][1], w, h]
    sheet.save(path)
    return lay


def main():
    src = Image.open(sys.argv[1]).convert("RGB")
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    lay = {
        "items": grid(src, ITEMS, 5, out / "in-items.png"),
        "icons": grid(src, ICONS, 10, out / "in-icons.png"),
        "fx": grid(src, FXS, 8, out / "in-fx.png"),
        "ui": shelf(src, UI, 512, out / "in-ui.png"),
    }
    (out / "layout.json").write_text(json.dumps(lay, indent=2) + "\n")
    for k in lay:
        im = Image.open(out / f"in-{k}.png")
        print(k, im.size, "->", (im.width // K, im.height // K))


if __name__ == "__main__":
    main()
