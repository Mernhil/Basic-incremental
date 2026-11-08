"""Fits the blade path the live motion runs along (a cubic spine plus half-width) to a sprite.

Reads a sprite's 'blade' pixels (a colour test per sprite), orders them along their principal curve,
least-squares fits a cubic bezier (chord-length parameters, endpoints kept) and prints the four control
points in item-box units (2 units per sprite pixel) and the base half-width, ready for makeBlade in
art/vector/items.ts (EVOLUTION_GEO).

Usage: py fit_blade.py <sprite.png> <soul_reaper|flameblade|dagger|hammer> [--plot out.png]
"""
from __future__ import annotations
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure, morphology

def blade_mask(a: np.ndarray, kind: str) -> np.ndarray:
    rgb = a[..., :3].astype(int); op = a[..., 3] > 0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = (0.3 * r + 0.59 * g + 0.11 * b)
    white = (rgb == 255).all(-1)
    if kind == "soul_reaper":   # pale steel blade: light, slightly blue/grey
        return op & ~white & (lum > 150) & (b >= r - 5)
    if kind == "flameblade":    # the flame blade: warm, bright
        return op & (r > 200) & (g > 90) & (b < 140)
    if kind == "dagger":        # violet blades
        return op & (b > 150) & (r > 100) & (g < 120)
    return op & (lum > 90)      # hammer: bronze head/handle

def main() -> None:
    a = np.array(Image.open(sys.argv[1]).convert("RGBA"))
    m = blade_mask(a, sys.argv[2])
    m = morphology.remove_small_objects(m, 12)
    lab = measure.label(m, connectivity=2)
    if lab.max() == 0: print("no blade pixels"); return
    for k, region in enumerate(sorted(measure.regionprops(lab), key=lambda r: -r.area)[: 2 if sys.argv[2] == "dagger" else 1]):
        mm = lab == region.label
        sk = morphology.skeletonize(mm)
        ys, xs = np.nonzero(sk)
        pts = np.column_stack([xs, ys]).astype(float)
        # order along the curve: start at one end of the skeleton (farthest from centroid), walk nearest-neighbour
        c = pts.mean(0); start = pts[np.argmax(((pts - c) ** 2).sum(1))]
        order = [start]; left = list(map(tuple, pts)); left.remove(tuple(start))
        while left:
            d = [((np.array(p) - order[-1]) ** 2).sum() for p in left]
            j = int(np.argmin(d))
            if d[j] > 36: break
            order.append(np.array(left.pop(j)))
        P = np.array(order)
        if len(P) < 6: print("skeleton too short"); continue
        t = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))]); t /= t[-1]
        B = np.column_stack([(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t ** 2 * (1 - t), t ** 3])
        p0, p3 = P[0], P[-1]
        rhs = P - np.outer(B[:, 0], p0) - np.outer(B[:, 3], p3)
        sol, *_ = np.linalg.lstsq(B[:, 1:3], rhs, rcond=None)
        ctrl = np.vstack([p0, sol[0], sol[1], p3])
        dist = ndimage.distance_transform_edt(mm)
        w0 = float(np.percentile(dist[sk], 85))
        print(f"blade {k}: spine px {np.round(ctrl).astype(int).tolist()}  -> item units {np.round(ctrl * 2).astype(int).tolist()}  half-width px {w0:.1f} (units {2*w0:.0f}) len {len(P)}")

if __name__ == "__main__":
    main()
