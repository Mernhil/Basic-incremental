"""Tiny hard-pixel drawing engine for the weapon-tier drafts (not game code).

Everything is drawn on the item's native 100 x 120 grid. Shapes are polygons in float coordinates,
rasterised at 4x and thresholded (no anti-aliasing), shaded the way the game's card items are:
five tones per material lit from the top-left, one-pixel ink outline, dark lines where parts
overlap, white glints, plus-shaped sparkles, one-pixel light rim.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

W, H, SS = 100, 120, 4
INK = (0x1A, 0x10, 0x20)
WHITE = (255, 255, 255)


def hx(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def ramp(*hexes: str) -> list[tuple[int, int, int]]:
    """Five tones: glint, light, base, shade, deep."""
    assert len(hexes) == 5
    return [hx(h) for h in hexes]


# ---------- masks ----------

def poly_mask(pts) -> np.ndarray:
    im = Image.new("L", (W * SS, H * SS), 0)
    ImageDraw.Draw(im).polygon([(x * SS, y * SS) for x, y in pts], fill=255)
    a = np.asarray(im, dtype=np.float32).reshape(H, SS, W, SS).mean(axis=(1, 3)) / 255.0
    return a >= 0.5


def circle_mask(cx, cy, r) -> np.ndarray:
    n = max(12, int(r * 8))
    return poly_mask([(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)])


def line_mask(p0, p1, w=1.0) -> np.ndarray:
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    return poly_mask([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])


def shift(m: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(m)
    ys, xs = slice(max(0, dy), H + min(0, dy)), slice(max(0, dx), W + min(0, dx))
    yd, xd = slice(max(0, -dy), H + min(0, -dy)), slice(max(0, -dx), W + min(0, -dx))
    out[ys, xs] = m[yd, xd]
    return out


CROSS = ndi.generate_binary_structure(2, 1)


def dil(m, n=1):
    return ndi.binary_dilation(m, CROSS, iterations=n) if n else m


def ero(m, n=1):
    return ndi.binary_erosion(m, CROSS, iterations=n, border_value=0) if n else m


# ---------- local frame (axis along the weapon) ----------

@dataclass
class Xf:
    """Local (s, t) -> canvas. s runs along the weapon toward its tip, t across, positive = lower right."""
    ox: float
    oy: float
    deg: float = 33.69

    def __call__(self, s, t=0.0):
        a = math.radians(self.deg)
        return (self.ox + s * math.sin(a) + t * math.cos(a), self.oy - s * math.cos(a) + t * math.sin(a))

    def poly(self, pts):
        return poly_mask([self(s, t) for s, t in pts])

    def circle(self, s, t, r):
        x, y = self(s, t)
        return circle_mask(x, y, r)

    def line(self, a, b, w=1.0):
        return line_mask(self(*a), self(*b), w)

    def half(self, side: int, s0=-999, s1=999):
        """Mask of the lit (side < 0) or shaded (side > 0) half-plane within [s0, s1]."""
        big = 300
        return self.poly([(s0, 0), (s1, 0), (s1, side * big), (s0, side * big)])


# ---------- canvas ----------

class Art:
    def __init__(self):
        self.px = np.zeros((H, W, 3), np.uint8)
        self.occ = np.zeros((H, W), bool)
        self.glint_mask = np.zeros((H, W), bool)

    def put(self, m: np.ndarray, col):
        self.px[m] = col
        self.occ |= m

    def part(self, m: np.ndarray, r, light=2, shade=2, lines=True, faces=(), glow=None):
        """A cel-shaded part: base tone, a light band on the top-left edge, shade and deep on the
        bottom-right, optional explicit faces [(mask, tone index)], a dark line where it meets earlier parts."""
        if not m.any():
            return m
        before = self.occ.copy()
        self.px[m] = r[2]
        for fm, ti in faces:
            self.px[m & fm] = r[ti]
        if light:
            lt = m & ~shift(m, light, light)
            self.px[lt & ~(m & ~shift(m, -1, -1))] = r[1]
        if shade:
            sd = m & ~shift(m, -shade, -shade)
            self.px[sd] = r[3]
            dp = m & ~shift(m, -1, -1)
            self.px[dp] = r[4]
        if lines:
            edge = m & ~ero(m)
            # a line only where the part sits on or beside earlier parts
            self.px[dil(before) & edge] = r[4]
        self.occ |= m
        return m

    def glint(self, m: np.ndarray, col=WHITE):
        m = m & self.occ
        self.px[m] = col
        self.glint_mask |= m

    def tint(self, m: np.ndarray, col):
        m = m & self.occ
        self.px[m] = col

    def finish(self, rim=(0xDF, 0xE6, 0xF2), sparkles=(), sparkle_cols=None, behind=None, rim_on=True):
        """Ink outline, optional effect pixels behind, light rim, sparkles; returns an RGBA array."""
        rgba = np.zeros((H, W, 4), np.uint8)
        sil = self.occ.copy()
        ink = dil(sil) & ~sil
        rgba[sil, :3] = self.px[sil]
        rgba[sil, 3] = 255
        rgba[ink, :3] = INK
        rgba[ink, 3] = 255
        solid = sil | ink
        if behind is not None:
            bm, bcols = behind
            put = bm & ~solid
            rgba[put, :3] = bcols[put]
            rgba[put, 3] = 255
            solid = solid | put
        if rim_on:
            rm = dil(solid) & ~solid
            rgba[rm, :3] = rim
            rgba[rm, 3] = 255
            solid = solid | rm
        for i, (cx, cy) in enumerate(sparkles):
            col = (sparkle_cols[i % len(sparkle_cols)] if sparkle_cols else WHITE)
            arm = 2 if i % 2 == 0 else 1
            for dx, dy in [(0, 0)] + [(k * sx, k * sy) for k in range(1, arm + 1) for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1))]:
                x, y = cx + dx, cy + dy
                if 0 <= x < W and 0 <= y < H and not solid[y, x]:
                    rgba[y, x, :3] = col
                    rgba[y, x, 3] = 255
        return rgba


def sweep_orphans(rgba: np.ndarray, keep=()) -> np.ndarray:
    """A pixel whose colour matches none of its 8 neighbours takes its 4-neighbours' commonest colour
    (the game's own final pass). Ink, white and listed colours stay."""
    out = rgba.copy()
    for y in range(H):
        for x in range(W):
            if rgba[y, x, 3] == 0:
                continue
            c = tuple(rgba[y, x, :3])
            if c == INK or c == WHITE or c in keep:
                continue
            alone = True
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if (dx or dy) and 0 <= x + dx < W and 0 <= y + dy < H and rgba[y + dy, x + dx, 3] and tuple(rgba[y + dy, x + dx, :3]) == c:
                        alone = False
            if alone:
                cnt: dict = {}
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H and rgba[yy, xx, 3]:
                        k = tuple(rgba[yy, xx, :3])
                        if k != INK or True:
                            cnt[k] = cnt.get(k, 0) + 1
                if cnt:
                    out[y, x, :3] = max(cnt, key=cnt.get)
    return out


def to_image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray(rgba, "RGBA")


# ---------- shape helpers ----------

def gem(art: Art, cx, cy, r, ramp_, glint=True):
    m = circle_mask(cx, cy, r)
    art.part(m, ramp_, light=1, shade=1)
    if glint:
        art.glint(circle_mask(cx - r * 0.35, cy - r * 0.4, 0.55))
    return m


def diamond(cx, cy, rx, ry):
    return poly_mask([(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)])


def noise1(seed: int, n: int) -> list[float]:
    s = seed * 9301 + 49297
    out = []
    for _ in range(n):
        s = (s * 9301 + 49297) % 233280
        out.append(s / 233280)
    return out
