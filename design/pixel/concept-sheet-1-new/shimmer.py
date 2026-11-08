"""Palette-cycling animation for the approved scythe and recoloured bow sprites (no PixelLab).

DESIGN.md §12 plans palette cycling for glows and flames: 8 pre-rendered frames of a sprite, its own
colours shifting along their ramp, played with steps(). Two modes, picked per sprite:

- glow (sprites with bright flame, soul-fire or crystal colours): the saturated bright pixels move up
  and down their own colour ramp, out of step across the sprite so the light travels; no new colours.
- sweep (the rest, e.g. the steel scythes): a diagonal glint crosses the blade, brightening the pixels
  under it for a few frames, like the medal shine.

Usage: py design/pixel/concept-sheet-1-new/shimmer.py
Writes animated/<name>.png (8 frames in a row, 100 x 120 each), animated/gifs/<name>.gif and
animated/all.gif (every sprite in one grid, 2x).
"""
from __future__ import annotations

import colorsys
import math
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "recolored"
OUT = HERE / "animated"
FRAMES = 8
DUR = 110
BG = (18, 13, 28)


def lum(c) -> float:
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def effect_mask(a: np.ndarray) -> np.ndarray:
    m = np.zeros(a.shape[:2], bool)
    for y, x in zip(*np.nonzero(a[..., 3] > 0)):
        h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
        m[y, x] = s > 0.45 and v > 0.55
    return m


def glow_frames(a: np.ndarray, m: np.ndarray) -> list[np.ndarray]:
    ys, xs = np.nonzero(m)
    cols = sorted({tuple(a[y, x, :3]) for y, x in zip(ys, xs)}, key=lum)
    idx = {c: i for i, c in enumerate(cols)}
    n = len(cols)
    out = []
    for k in range(FRAMES):
        f = a.copy()
        for y, x in zip(ys, xs):
            i = idx[tuple(a[y, x, :3])]
            j = i + round(1.6 * math.sin(2 * math.pi * k / FRAMES + 0.45 * x + 0.7 * y))
            f[y, x, :3] = cols[max(0, min(n - 1, j))]
        out.append(f)
    return out


def sweep_frames(a: np.ndarray) -> list[np.ndarray]:
    op = a[..., 3] > 0
    ys, xs = np.nonzero(op)
    d = xs + ys
    lo, hi = d.min(), d.max()
    out = []
    for k in range(FRAMES):
        f = a.copy()
        pos = lo - 6 + (hi - lo + 12) * (k / (FRAMES - 1)) if k < FRAMES - 1 else lo - 20
        for y, x in zip(ys, xs):
            if abs((x + y) - pos) < 2.5 and lum(a[y, x, :3]) > 70:
                f[y, x, :3] = (a[y, x, :3] + (255 - a[y, x, :3]) * 0.6).astype(np.uint8)
        out.append(f)
    return out


def main() -> None:
    (OUT / "gifs").mkdir(parents=True, exist_ok=True)
    names = sorted(p.stem for p in SRC.glob("*.png"))
    modes = {}
    sheets = []
    for name in names:
        a = np.array(Image.open(SRC / f"{name}.png").convert("RGBA"))
        m = effect_mask(a)
        mode = "glow" if m.sum() >= 40 else "sweep"
        modes[name] = mode
        frames = glow_frames(a, m) if mode == "glow" else sweep_frames(a)
        strip = Image.new("RGBA", (100 * FRAMES, 120), (0, 0, 0, 0))
        for k, f in enumerate(frames):
            strip.alpha_composite(Image.fromarray(f, "RGBA"), (100 * k, 0))
        strip.save(OUT / f"{name}.png")
        ims = []
        for f in frames:
            bg = Image.new("RGBA", (300, 360), BG + (255,))
            bg.alpha_composite(Image.fromarray(f, "RGBA").resize((300, 360), Image.NEAREST))
            ims.append(bg.convert("RGB").quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
        ims[0].save(OUT / "gifs" / f"{name}.gif", save_all=True, append_images=ims[1:], duration=DUR, loop=0)
        sheets.append((name, frames))
    # one grid GIF of everything (2x, trimmed to the sprite area)
    cols = 8
    rows = (len(sheets) + cols - 1) // cols
    cw, ch = 200, 240
    grid_frames = []
    for k in range(FRAMES):
        g = Image.new("RGB", (cols * cw, rows * ch), BG)
        for n, (_, frames) in enumerate(sheets):
            t = Image.fromarray(frames[k], "RGBA").resize((cw, ch), Image.NEAREST)
            g.paste(t, ((n % cols) * cw, (n // cols) * ch), t)
        grid_frames.append(g)
    q = [g.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for g in grid_frames]
    q[0].save(OUT / "all.gif", save_all=True, append_images=q[1:], duration=DUR, loop=0)
    grid_frames[0].save(OUT / "all-frame0.png")
    grid_frames[3].save(OUT / "all-frame3.png")
    print(len(names), "sprites:", sum(v == "glow" for v in modes.values()), "glow,", sum(v == "sweep" for v in modes.values()), "sweep")


if __name__ == "__main__":
    main()
