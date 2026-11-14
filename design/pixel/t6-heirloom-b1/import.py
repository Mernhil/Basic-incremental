"""Puts batch 1 (Dragon) in the game: the user's picked PixelLab T6 and Heirloom sprites (2026-11-14).

Usage: py design/pixel/t6-heirloom-b1/import.py <folder with item-<type>-<t6m|t6v|heirloom>.png>
Replaces every T6 picture (item-<type>-t6m / t6v and their -anim strips) and the type's original
Heirloom pictures (item-<type>-hm / hv and their -anim strips) of the 11 types in
src/renderer/src/art/pixel/hand with the 33 Dragon sprites (100 x 120, copied as they are, no
rescale, no recolour) and writes their traced silhouettes (the element effects trace them) into
hand/outlines.json. The recoloured candidates (-hm-b/c/d, -hv-b/c/d) are never touched.
"""
from __future__ import annotations

import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
HAND = ROOT / "src/renderer/src/art/pixel/hand"
spec = importlib.util.spec_from_file_location("post1", ROOT / "design/pixel/concept-sheet-1/post.py")
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

TYPES = ["sword", "greatsword", "dagger", "spear", "lance", "hammer", "bow", "staff", "scythe", "pickaxe", "logging_axe"]
OLD = re.compile(r"^item-(" + "|".join(TYPES) + r")-(t6m|t6v|hm|hv)(-anim)?$")

src = Path(sys.argv[1])
outlines = json.loads((HAND / "outlines.json").read_text())
for f in HAND.glob("item-*.png"):
    if OLD.match(f.stem):
        f.unlink()
for k in [k for k in outlines if OLD.match(k)]:
    del outlines[k]
n = 0
for t in TYPES:
    for art in ("t6m", "t6v", "heirloom"):
        name = f"item-{t}-{art}"
        im = Image.open(src / f"{name}.png").convert("RGBA")
        assert im.size == (100, 120), (name, im.size)
        shutil.copyfile(src / f"{name}.png", HAND / f"{name}.png")
        outlines[name] = P.trace(np.array(im, dtype="uint8"))
        n += 1
(HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")
print("imported", n)
