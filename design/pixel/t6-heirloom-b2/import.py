"""Adds batch 2 (Leviathan) to the game: the user's picked PixelLab T6 and Heirloom sprites (2026-11-14).

Usage: py design/pixel/t6-heirloom-b2/import.py <folder with item-<type>-<t6m|t6v|heirloom>.png>
Batch 2 is ADDED next to the Dragon batch: the 33 sprites are copied as they are (100 x 120, no
rescale, no recolour) to src/renderer/src/art/pixel/hand/item-<type>-leviathan-<t6m|t6v|heirloom>.png
and their traced silhouettes (the element effects trace them) go into hand/outlines.json.
Nothing of the Dragon batch or the recoloured candidates is touched.
"""
from __future__ import annotations

import importlib.util
import json
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

src = Path(sys.argv[1])
outlines = json.loads((HAND / "outlines.json").read_text())
n = 0
for t in TYPES:
    for art in ("t6m", "t6v", "heirloom"):
        im = Image.open(src / f"item-{t}-{art}.png").convert("RGBA")
        assert im.size == (100, 120), (t, art, im.size)
        name = f"item-{t}-leviathan-{art}"
        shutil.copyfile(src / f"item-{t}-{art}.png", HAND / f"{name}.png")
        outlines[name] = P.trace(np.array(im, dtype="uint8"))
        n += 1
(HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")
print("imported", n)
