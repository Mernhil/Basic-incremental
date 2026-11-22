"""Adds the five approved starter weapon pictures (user, 2026-11-22, all five kept, dark spear try b).

Usage: py design/pixel/starters/import.py "C:/Basic Incremental/design/options/starters/approved"
Copies, byte for byte and never altered, starter-<element>-<type>.png (100 x 120) to
src/renderer/src/art/pixel/hand/item-<type>-starter.png and adds the silhouettes the element effects
trace to hand/outlines.json. Nothing else is touched.
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

STARTERS = [("earth", "hammer"), ("fire", "sword"), ("water", "staff"), ("light", "lance"), ("dark", "spear")]

src = Path(sys.argv[1])
outlines = json.loads((HAND / "outlines.json").read_text())
for element, kind in STARTERS:
    path = src / f"starter-{element}-{kind}.png"
    im = Image.open(path).convert("RGBA")
    assert im.size == (100, 120), (path, im.size)
    name = f"item-{kind}-starter"
    shutil.copyfile(path, HAND / f"{name}.png")
    outlines[name] = P.trace(np.array(im, dtype="uint8"))
(HAND / "outlines.json").write_text(json.dumps(outlines, indent=2, sort_keys=True) + "\n")
print("imported", len(STARTERS), "starter sprites")
