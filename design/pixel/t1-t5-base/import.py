"""Puts the 55 PixelLab Wood to Prismatic weapon sprites (user's picks, 2026-11-14) into the game.

Usage: py design/pixel/t1-t5-base/import.py <folder with item-<type>-t<1..5>.png>
Deletes every old Wood to Prismatic picture (item-<type>-t1..t4[-step], t5, t5-anim) of the 11 types from
src/renderer/src/art/pixel/hand, copies the sprites in as they are (100 x 120, no rescale or recolour) and
writes their traced silhouettes (the element effects trace them) into hand/outlines.json.
Mythic, Void and Heirloom pictures are never touched.
"""
from __future__ import annotations

import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
HAND = ROOT / "src/renderer/src/art/pixel/hand"
spec = importlib.util.spec_from_file_location("post1", ROOT / "design/pixel/concept-sheet-1/post.py")
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

TYPES = ["sword", "greatsword", "dagger", "spear", "lance", "hammer", "bow", "staff", "scythe", "pickaxe", "logging_axe"]
OLD = re.compile(r"^item-(" + "|".join(TYPES) + r")-t[1-5](-\d|-anim)?$")

src = Path(sys.argv[1])
outlines = json.loads((HAND / "outlines.json").read_text())
for f in HAND.glob("item-*.png"):
    if OLD.match(f.stem):
        f.unlink()
        outlines.pop(f.stem, None)
for k in [k for k in outlines if OLD.match(k)]:
    del outlines[k]
n = 0
for t in TYPES:
    for tier in range(1, 6):
        name = f"item-{t}-t{tier}"
        im = Image.open(src / f"{name}.png").convert("RGBA")
        assert im.size == (100, 120), (name, im.size)
        shutil.copyfile(src / f"{name}.png", HAND / f"{name}.png")
        outlines[name] = P.trace(__import__("numpy").array(im, dtype="uint8"))
        n += 1
(HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")
print("imported", n)
