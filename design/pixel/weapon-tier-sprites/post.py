"""Post-processes the PixelLab conversions of the eight weapon concept sheets (2026-11-12) into card items.

PixelLab (image_to_pixelart, faithful) drew every sprite from the 4x input sheets `cut.py` builds, one
call per weapon: ten cells of 100 x 120 in 5 columns by 2 rows, in the order Wood BASE, Bronze BASE,
Bronze +1, Silver BASE, +1, +2, Gold BASE, +1, +2, FINAL. This script only cuts the cells, keys out the
sheet's navy background, snaps each sprite to one small palette per weapon (no dithering), clears orphan
pixels and puts the one-pixel ink outline on, as the other tier pictures have (art style rules, ASSET_RULES §5).

Usage: py design/pixel/weapon-tier-sprites/post.py <cut.py output dir>  (the bow string is read from its in-bow.png)
Reads pixellab/<type>.png and layout.json, writes src/renderer/src/art/pixel/hand/item-<type>-t<tier>-<step>.png
and adds their traced silhouettes to hand/outlines.json.
"""
from __future__ import annotations

import importlib.util
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import measure

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
HAND = ROOT / "src/renderer/src/art/pixel/hand"

spec = importlib.util.spec_from_file_location("post1", ROOT / "design/pixel/concept-sheet-1/post.py")
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)
P.INK = (4, 4, 8)  # the near-black ink outline of the other tier pictures (item-sword-t4 and the rest)

TYPES = ["sword", "greatsword", "dagger", "hammer", "lance", "bow", "scythe", "logging_axe"]
STEPS = [("t1", 0), ("t2", 0), ("t2", 1), ("t3", 0), ("t3", 1), ("t3", 2), ("t4", 0), ("t4", 1), ("t4", 2), ("t4", 3)]
COLOURS = 23  # plus the ink: the 24 of the other tier pictures
STRING = (228, 214, 176)  # the bow string


def key(a: np.ndarray, bg, tol: int = 30, everywhere: bool = False) -> np.ndarray:
    """Clears the sheet background: pixels near its colour, also the pockets the weapon encloses (a guard
    loop, inside a bow string), so they are see-through like the outside."""
    h, w = a.shape[:2]
    near = np.abs(a[..., :3].astype(int) - np.array(bg)).sum(-1) < tol
    seen = near.copy() if everywhere else np.zeros((h, w), bool)
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y, x] or not near[y, x]:
            continue
        seen[y, x] = True
        q.extend((x + dx, y + dy) for dx, dy in P.N4)
    out = a.copy()
    out[seen] = 0
    out[..., 3] = np.where(out[..., 3] >= 128, 255, 0)
    out[out[..., 3] == 0] = 0
    return out


GROUPS = {"t1": [0], "t2": [1, 2], "t3": [3, 4, 5], "t4": [6, 7, 8, 9]}


def palette(cells, n: int) -> np.ndarray:
    """n colours for a group of steps. Counts are flattened (power 0.3), so a small gem or wrap still gets its own colour."""
    px = np.concatenate([c[c[..., 3] > 0][:, :3] for c in cells])
    cols, cnt = np.unique(px, axis=0, return_counts=True)
    rep = np.repeat(cols, np.maximum(1, (cnt ** 0.3).astype(int) * 2), axis=0)
    strip = Image.fromarray(rep.reshape(1, -1, 3).astype(np.uint8), "RGB")
    pal = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return np.array(pal.getpalette()[: n * 3], dtype=np.uint8).reshape(-1, 3)


def bow_string(layout, i: int, concept_dir: Path) -> np.ndarray:
    """The bow string as a 1-pixel line (the converter breaks it up): the thin cream line of the concept cell."""
    from scipy import ndimage as ndi
    from skimage.morphology import skeletonize

    c = np.array(Image.open(concept_dir / "in-bow.png").convert("RGB")).astype(int)
    x, y = (i % 5) * 400, (i // 5) * 480
    cell = c[y : y + 480, x : x + 400]
    bg = np.array(layout["bow"]["bg"])
    solid = np.abs(cell - bg).sum(-1) > 60
    body = ndi.binary_dilation(ndi.binary_opening(solid, structure=np.ones((9, 9))), iterations=3)
    line = solid & ~body
    lab, k = ndi.label(ndi.binary_dilation(line, iterations=2))
    if k == 0:
        return np.zeros((120, 100), bool)
    sizes = ndi.sum(line, lab, range(1, k + 1))
    line = line & (lab == 1 + int(np.argmax(sizes)))
    small = line.reshape(120, 4, 100, 4).any(axis=(1, 3))
    sk = skeletonize(small)
    out = sk.copy()
    ys, xs = np.nonzero(sk)
    for y, x in zip(ys, xs):  # staircase corners get a pixel, so the line is one 4-connected stroke
        if y + 1 < 120 and x + 1 < 100 and sk[y + 1, x + 1] and not sk[y, x + 1] and not sk[y + 1, x]:
            out[y + 1, x] = True
        if y + 1 < 120 and x > 0 and sk[y + 1, x - 1] and not sk[y, x - 1] and not sk[y + 1, x]:
            out[y + 1, x] = True
    return out


def thin_dark_edge(a: np.ndarray) -> np.ndarray:
    """Drops the converter's own dark outline pixels on the silhouette, so the one-pixel ink outline replaces them."""
    h, w = a.shape[:2]
    out = a.copy()
    for y in range(h):
        for x in range(w):
            if a[y, x, 3] and P.lum(a[y, x, :3]) < 0.16 and any(P.colour_at(a, x + dx, y + dy) is None for dx, dy in P.N4):
                out[y, x] = 0
    return out


def main() -> None:
    import sys

    concept_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    layout = json.loads((HERE / "layout.json").read_text())
    outlines = json.loads((HAND / "outlines.json").read_text())
    for t in TYPES:
        sheet = Image.open(HERE / "pixellab" / f"{t}.png").convert("RGBA")
        bg = layout[t]["bg"]
        cells = []
        for i in range(10):
            x, y = (i % 5) * 100, (i // 5) * 120
            a = np.array(sheet.crop((x, y, x + 100, y + 120)), dtype=np.uint8)
            a = P.drop_specks(key(a, bg, everywhere=True), 12)
            if t == "bow":  # the converter's broken string is dropped; the string is drawn again below
                from scipy import ndimage as ndi

                m = a[..., 3] > 0
                keep = ndi.binary_dilation(ndi.binary_opening(m, structure=np.ones((2, 2))), iterations=1) & m
                a[~keep] = 0
            cells.append(P.drop_specks(thin_dark_edge(a), 12))
        for tier, idx in GROUPS.items():
            pal_rgb = palette([cells[i] for i in idx], COLOURS)
            for i in idx:
                a = cells[i]
                m = a[..., 3] > 0
                q = a.copy()
                d = ((a[m][:, None, :3].astype(int) - pal_rgb[None]) ** 2).sum(-1)
                q[m, :3] = pal_rgb[d.argmin(1)]
                q = P.settle_orphans(P.sweep_orphans(P.clean_orphans(q)))
                if t == "bow":
                    line = bow_string(layout, i, concept_dir) & (q[..., 3] == 0)
                    q[line] = (*STRING, 255)
                q = P.ring(q, P.INK)
                step = STEPS[i][1]
                name = f"item-{t}-{tier}-{step}"
                Image.fromarray(q, "RGBA").save(HAND / f"{name}.png")
                outlines[name] = P.trace(q)
    (HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
