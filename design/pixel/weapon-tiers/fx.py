"""Stills of the shape-following element effects for option C (and the sparks of E). These are drafts of
what the live canvas loop would show on one good frame: every effect is generated from the weapon's own
silhouette (DESIGN.md §12 "generated from the item's own shape"), hard pixels only."""
from __future__ import annotations

import math

import numpy as np
from scipy import ndimage as ndi

from pix import H, W, CROSS, dil, hx, line_mask, ero

FIRE = [hx("#fff6c8"), hx("#ffd23a"), hx("#ff8a1f"), hx("#ff3b2e")]
RAIN = [hx(c) for c in ("#7ae8ff", "#ff8ad8", "#b79cff", "#8ff0b8", "#ffe08a")]
LEAFC = [hx("#e8ffa8"), hx("#9be85e"), hx("#46b84a")]
BOLT = [hx("#ffffff"), hx("#bff4ff"), hx("#55c8ff")]


def _noise(seed: int, scale_x: float, scale_y: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    gx = rng.random((H // 4 + 3, W // 4 + 3))
    ys, xs = np.mgrid[0:H, 0:W]
    return ndi.map_coordinates(gx, [ys / scale_y, xs / scale_x], order=1, mode="wrap")


def fire_edge(occ: np.ndarray, seed=1, reach=7.0, phase=0.0, palette=FIRE):
    """Edge fire: tongues licking off the silhouette, biased to rise; white-yellow core, orange, red tips."""
    dist = ndi.distance_transform_edt(~occ)
    # rising bias: pixels with weapon pixels somewhere below them within 12 rows burn higher
    below = np.zeros_like(occ)
    for k in range(1, 13):
        below[:-k] |= occ[k:]
    n = _noise(seed, 2.2, 6.0)
    n = np.roll(n, -int(phase * 2), axis=0)
    tongue = np.clip((n - 0.25) * 2.0, 0.0, 1.6)
    lim = reach * tongue * np.where(below, 1.5, 0.5)
    flame = (dist > 0.5) & (dist <= lim)
    flame = ndi.binary_opening(flame, CROSS)
    flame &= ~occ
    ratio = np.where(flame, dist / np.maximum(lim, 1e-3), 1)
    cols = np.zeros((H, W, 3), np.uint8)
    cols[:] = palette[3]
    cols[ratio < 0.66] = palette[2]
    cols[ratio < 0.4] = palette[1]
    cols[ratio < 0.2] = palette[0]
    return flame, cols


def rainbow_shell(occ: np.ndarray, width=3.0, seed=3, phase=0.0):
    """Aura shell: a stepped outline of the item pulsing outward, banded through the rainbow."""
    dist = ndi.distance_transform_edt(~occ)
    n = _noise(seed, 3.0, 3.0)
    shell = (dist > 0.5) & (dist <= width + 1.2 * (n - 0.5) * 2)
    shell = ndi.binary_opening(shell, CROSS) | ((dist > 0.5) & (dist <= 1.5))
    shell &= ~occ
    ys, xs = np.mgrid[0:H, 0:W]
    idx = (np.floor((xs * 0.55 + ys * 0.8 + phase * 6) / 6.5)).astype(int) % len(RAIN)
    cols = np.zeros((H, W, 3), np.uint8)
    for i, c in enumerate(RAIN):
        cols[idx == i] = c
    # inner ring white-hot
    inner = shell & (dist <= 1.6)
    cols[inner] = (255, 255, 255)
    return shell, cols


def thin_shell(occ: np.ndarray, col, dither=False):
    dist = ndi.distance_transform_edt(~occ)
    m = (dist > 0.5) & (dist <= 1.6) & ~occ
    if dither:
        ys, xs = np.mgrid[0:H, 0:W]
        m |= (dist > 1.6) & (dist <= 2.8) & ((xs + ys) % 2 == 0) & ~occ
    cols = np.zeros((H, W, 3), np.uint8)
    cols[:] = col
    return m, cols


def merge(*layers):
    """Stack effect layers: later ones draw over earlier ones."""
    mask = np.zeros((H, W), bool)
    cols = np.zeros((H, W, 3), np.uint8)
    for m, c in layers:
        cols[m] = c[m]
        mask |= m
    return mask, cols


def bolts(points, seed=1, length=16, n=4, occ=None):
    """Jagged arcs: n zigzag bolts starting at the given canvas points, white core in a blue stroke."""
    rng = np.random.default_rng(seed)
    mask = np.zeros((H, W), bool)
    cols = np.zeros((H, W, 3), np.uint8)
    core = np.zeros((H, W), bool)
    for k in range(min(n, len(points))):
        x, y = points[k]
        ang = rng.uniform(0, 2 * math.pi)
        pts = [(x, y)]
        for _ in range(4):
            ang += rng.uniform(-1.1, 1.1)
            step = length / 4
            x += math.cos(ang) * step
            y += math.sin(ang) * step
            pts.append((x, y))
        for a, b in zip(pts, pts[1:]):
            m = line_mask(a, b, 2.2)
            mask |= m
            core |= line_mask(a, b, 1.0)
    cols[mask] = BOLT[2]
    cols[core] = BOLT[0]
    if occ is not None:
        mask &= ~occ
    return mask, cols


def cracks(occ: np.ndarray, seed=2, n=3, col=(255, 214, 90), length=18):
    """Power cracks: jagged glowing lines inside the item's own pixels."""
    rng = np.random.default_rng(seed)
    pts = np.argwhere(ero(occ, 2))
    mask = np.zeros((H, W), bool)
    if len(pts) == 0:
        return mask
    for _ in range(n):
        y, x = pts[rng.integers(len(pts))]
        ang = rng.uniform(0, 2 * math.pi)
        cur = (float(x), float(y))
        for _ in range(5):
            ang += rng.uniform(-0.9, 0.9)
            nxt = (cur[0] + math.cos(ang) * length / 5, cur[1] + math.sin(ang) * length / 5)
            mask |= line_mask(cur, nxt, 1.0)
            cur = nxt
    return mask & ero(occ, 1)


def orbit_sparks(cx, cy, rx, ry, n, phase=0.0):
    out = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        out.append((int(round(cx + rx * math.cos(a))), int(round(cy + ry * math.sin(a)))))
    return out
