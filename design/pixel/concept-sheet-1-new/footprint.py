"""Footprint and flatness numbers for a sprite, to compare new art with its old in-game counterpart.

- bbox: width x height of the opaque area
- mass: opaque pixels (white sparkles and the outer rim included, as the game shows them)
- tones: distinct opaque colours
- isolated %: opaque pixels whose colour none of their 8 neighbours share
- patches/100: same-colour 4-connected regions per 100 opaque pixels (mottling: flat cel shading has
  few large patches, blotchy painterly shading many small ones)

Usage: py design/pixel/concept-sheet-1-new/footprint.py <a.png> [<b.png> ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import measure

INK = (0x1A, 0x10, 0x20)


def metrics(path: Path | str) -> dict:
    a = np.array(Image.open(path).convert("RGBA"))
    op = a[..., 3] > 0
    ys, xs = np.nonzero(op)
    if not len(xs):
        return {"bbox": "0x0", "mass": 0, "tones": 0, "isolated%": 0.0}
    rgb = a[..., :3].astype(np.int32)
    key = (rgb[..., 0] << 16) | (rgb[..., 1] << 8) | rgb[..., 2]
    key = np.where(op, key, -1)
    h, w = op.shape
    pad = np.pad(key, 1, constant_values=-2)
    same = np.zeros((h, w), bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                same |= pad[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w] == key
    white = (rgb == 255).all(-1)
    iso = op & ~same & ~white
    patches = 0
    for k in np.unique(key[op]):
        patches += measure.label(key == k, connectivity=1).max()
    return {
        "bbox": f"{xs.max() - xs.min() + 1}x{ys.max() - ys.min() + 1}",
        "mass": int(op.sum()),
        "tones": int(len(np.unique(key[op]))),
        "isolated%": float(round(100 * iso.sum() / op.sum(), 1)),
        "patches/100": float(round(100 * patches / op.sum(), 1)),
    }


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(Path(p).name, metrics(p))
