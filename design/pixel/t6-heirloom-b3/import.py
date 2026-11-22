"""Adds batch 3 (Wildwood) art: the user's approved fitted sprites (2026-11-22, "fit, 100 x 120").

Usage: py design/pixel/t6-heirloom-b3/import.py "C:/Basic Incremental/design/options"
Copies, byte for byte and never altered, t6-heirloom-b3/fit/<type>-m|-v.png and h-<type>.png to
src/renderer/src/art/pixel/hand/item-<type>-wildwood-<t6m|t6v|heirloom>.png (the fox tail dagger
h-dagger-alt.png becomes item-dagger-wildwood-heirloom-alt.png) and the card kit
borders/kits/kit-t6-wildwood.png to hand/kit-t6-wildwood.png. The silhouettes the element effects
trace go into hand/outlines.json. Nothing of other batches is touched.
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

opts = Path(sys.argv[1])
fit = opts / "t6-heirloom-b3/fit"
outlines = json.loads((HAND / "outlines.json").read_text())
jobs = []
for t in TYPES:
    jobs += [(f"{t}-m", f"item-{t}-wildwood-t6m"), (f"{t}-v", f"item-{t}-wildwood-t6v"), (f"h-{t}", f"item-{t}-wildwood-heirloom")]
jobs.append(("h-dagger-alt", "item-dagger-wildwood-heirloom-alt"))
for src, name in jobs:
    path = fit / f"{src}.png"
    im = Image.open(path).convert("RGBA")
    assert im.size == (100, 120), (src, im.size)
    shutil.copyfile(path, HAND / f"{name}.png")
    outlines[name] = P.trace(np.array(im, dtype="uint8"))
shutil.copyfile(opts / "borders/kits/kit-t6-wildwood.png", HAND / "kit-t6-wildwood.png")
(HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")
print("imported", len(jobs), "sprites and the kit")
