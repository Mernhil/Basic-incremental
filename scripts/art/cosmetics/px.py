"""Pixel toolkit for the cosmetic art (beta batch B1-B10, DESIGN.md 7 and 13).

Hard pixels only: aliased polygons, a one-colour ink outline, hue-shifted ramps (shadows lean
purple, highlights lean warm), the approved light extra shading (lit band top-left, darker band
bottom-right), part lines in the part's own darkest tone, white sticker rings and plus sparkles.
Run through scripts/art/bake-pixels.mjs (export.py writes cos-*.png next to the baked sprites).
"""
from __future__ import annotations

import colorsys
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SPRITES = REPO / "src" / "renderer" / "src" / "art" / "pixel" / "sprites"

INK = (0x1A, 0x10, 0x20, 255)
WHITE = (255, 255, 255, 255)
WARM = (0xFF, 0xF4, 0xD6, 255)
DEEP = (0x14, 0x0A, 0x1C, 255)
CLEAR = (0, 0, 0, 0)


def H(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def mix(a, b, t: float):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)) + (255,)


def _hue_toward(h: float, target: float, amt: float) -> float:
    d = (target - h + 0.5) % 1.0 - 0.5
    step = math.copysign(min(abs(d), amt), d)
    return (h + step) % 1.0


def ramp(base: str) -> list[tuple[int, int, int, int]]:
    """Five hue-shifted tones: [deep shadow, shadow, base, light, highlight]."""
    r, g, b, _ = H(base)
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    out = []
    for k in (-2, -1, 0, 1, 2):
        if k == 0:
            hh, ss, vv = h, s, v
        elif k < 0:
            n = -k
            hh = _hue_toward(h, 0.74, 0.04 * n)
            ss = min(1.0, s + 0.07 * n)
            vv = v * (1 - 0.23 * n)
        else:
            hh = _hue_toward(h, 0.14, 0.035 * k)
            ss = s * (1 - 0.24 * k)
            vv = min(1.0, v + (1 - v) * 0.5 * k + 0.05 * k)
        rr, gg, bb = colorsys.hsv_to_rgb(hh, ss, vv)
        out.append((round(rr * 255), round(gg * 255), round(bb * 255), 255))
    return out


def new(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), CLEAR)


def D(img):
    return ImageDraw.Draw(img)


def _pts(pts):
    return [(int(round(x)), int(round(y))) for x, y in pts]


def poly(img, pts, c):
    D(img).polygon(_pts(pts), fill=c)


def rect(img, x0, y0, x1, y1, c):
    D(img).rectangle([x0, y0, x1, y1], fill=c)


def ell(img, x0, y0, x1, y1, c):
    D(img).ellipse([x0, y0, x1, y1], fill=c)


def ln(img, pts, c, w=1):
    D(img).line(_pts(pts), fill=c, width=w)


def put(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((int(x), int(y)), c)


def solid(img, x, y) -> bool:
    return 0 <= x < img.width and 0 <= y < img.height and img.getpixel((x, y))[3] > 0


N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))


def outline(img, c=INK, diag=False):
    """Close a one-pixel ring of colour c around everything opaque."""
    src = img.copy()
    px = src.load()
    w, h = img.size
    nb = N8 if diag else N4
    for y in range(h):
        for x in range(w):
            if px[x, y][3]:
                continue
            for dx, dy in nb:
                xx, yy = x + dx, y + dy
                if 0 <= xx < w and 0 <= yy < h and px[xx, yy][3]:
                    img.putpixel((x, y), c)
                    break
    return img


def ring(img, c=WHITE):
    return outline(img, c, diag=False)


def plus(img, x, y, c=WHITE, arm=1, core=None):
    put(img, x, y, core or c)
    for a in range(1, arm + 1):
        for dx, dy in N4:
            put(img, x + dx * a, y + dy * a, c)


def bevel(layer, lit=0.30, lit2=0.12, sh=0.24):
    """Approved light extra shading: two-step lit band top-left, darker step bottom-right."""
    out = layer.copy()
    src = layer.load()
    w, h = layer.size

    def inside(x, y):
        return 0 <= x < w and 0 <= y < h and src[x, y][3] > 0 and src[x, y][:3] != INK[:3]

    for y in range(h):
        for x in range(w):
            p = src[x, y]
            if not p[3] or p[:3] == INK[:3] or p[:3] == (255, 255, 255):
                continue
            if not inside(x - 1, y) or not inside(x, y - 1):
                out.putpixel((x, y), mix(p, WARM, lit))
            elif not inside(x - 2, y) or not inside(x, y - 2):
                out.putpixel((x, y), mix(p, WARM, lit2))
            elif not inside(x + 1, y) or not inside(x, y + 1):
                out.putpixel((x, y), mix(p, DEEP, sh))
    return out


def part(base, layer, do_bevel=True, partline=True, line_t=0.55):
    """Composite a part over base: bevel it, and where it overlaps an existing part, draw its
    edge in its own darkest tone (part line) instead of the ink."""
    L = bevel(layer) if do_bevel else layer.copy()
    if partline:
        lp = layer.load()
        bp = base.load()
        w, h = layer.size
        for y in range(h):
            for x in range(w):
                if not lp[x, y][3]:
                    continue
                for dx, dy in N4:
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy < h and not lp[xx, yy][3] and bp[xx, yy][3]:
                        L.putpixel((x, y), mix(lp[x, y], DEEP, line_t))
                        break
    base.alpha_composite(L)
    return base


def star_pts(cx, cy, n, r_out, r_in, rot=-math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def ngon(cx, cy, n, r, rot=-math.pi / 2):
    return [(cx + r * math.cos(rot + i * 2 * math.pi / n), cy + r * math.sin(rot + i * 2 * math.pi / n)) for i in range(n)]


LIGHT = (-0.7071, -0.7071)


def facet_gem(img, pts, rp, cx=None, cy=None, table=0.45, glint=True):
    """Faceted gem: a triangle fan from the centre, each facet toned by how much it faces the
    top-left light, an inner table in the light tone and a white glint."""
    if cx is None:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        mx, my = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy
        ln_ = math.hypot(mx, my) or 1
        d = (mx * LIGHT[0] + my * LIGHT[1]) / ln_
        idx = 3 if d > 0.55 else 2 if d > -0.05 else 1 if d > -0.6 else 0
        poly(img, [(cx, cy), a, b], rp[idx])
    if table:
        tp = [(cx + (p[0] - cx) * table, cy + (p[1] - cy) * table) for p in pts]
        poly(img, tp, rp[3])
        # shadow half of the table
        half = [(cx, cy)] + [p for p in tp if (p[0] - cx) + (p[1] - cy) > 0]
        if len(half) >= 3:
            poly(img, half, rp[2])
    if glint:
        gx = int(round(cx + (min(p[0] for p in pts) - cx) * 0.45))
        gy = int(round(cy + (min(p[1] for p in pts) - cy) * 0.45))
        put(img, gx, gy, WHITE)
        put(img, gx + 1, gy, WHITE)
        put(img, gx, gy + 1, WHITE)


def leaf(img, base, tip, width, rp, rib=True, light_left=True):
    """A pointed leaf from base to tip, split along the midrib into a lit and a shadow half."""
    bx, by = base
    tx, ty = tip
    L = math.hypot(tx - bx, ty - by) or 1
    ux, uy = (tx - bx) / L, (ty - by) / L
    nx, ny = -uy, ux
    left, right = [], []
    steps = max(6, int(L))
    for i in range(steps + 1):
        t = i / steps
        w = width * (math.sin(math.pi * t) ** 0.75) * (1 - 0.25 * t)
        px_, py_ = bx + ux * L * t, by + uy * L * t
        left.append((px_ + nx * w, py_ + ny * w))
        right.append((px_ - nx * w, py_ - ny * w))
    mid = [(bx + ux * L * i / steps, by + uy * L * i / steps) for i in range(steps + 1)]
    # which half faces the light
    lit_is_left = (nx * LIGHT[0] + ny * LIGHT[1]) > 0
    a_col, b_col = (rp[3], rp[2]) if lit_is_left else (rp[2], rp[3])
    poly(img, left + mid[::-1], a_col)
    poly(img, right + mid[::-1], b_col)
    if rib:
        ln(img, mid[1:-2], rp[1])


def dew(img, x, y, r=2, col=None):
    col = col or ramp("#8fe3f0")
    ell(img, x - r, y - r, x + r, y + r, col[2])
    if r >= 2:
        put(img, x + 1, y + 1, col[1])
        put(img, x + r - 1, y, col[1])
    put(img, x - (r > 1), y - (r > 1), WHITE)


def blossom(img, cx, cy, r, rp, centre="#ffd34d"):
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        px_, py_ = cx + math.cos(a) * r * 0.8, cy + math.sin(a) * r * 0.8
        tone = rp[3] if (math.cos(a) * LIGHT[0] + math.sin(a) * LIGHT[1]) > 0 else rp[2]
        ell(img, px_ - r * 0.6, py_ - r * 0.6, px_ + r * 0.6, py_ + r * 0.6, tone)
    c = ramp(centre)
    put(img, cx, cy, c[2])
    put(img, cx - 1, cy, c[3])


def mirror_x(img):
    return img.transpose(Image.FLIP_LEFT_RIGHT)


def mirror_y(img):
    return img.transpose(Image.FLIP_TOP_BOTTOM)


def clear_rect(img, x0, y0, x1, y1):
    rect(img, x0, y0, x1, y1, CLEAR)


def sweep_orphans(img, keep_white=True):
    """Remove lone pixels whose colour matches none of their 8 neighbours (not white glints or
    ink), replacing them with the most common neighbour colour."""
    src = img.copy()
    px = src.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if not p[3] or (keep_white and p[:3] == (255, 255, 255)):
                continue
            nbs = [px[x + dx, y + dy] for dx, dy in N8 if 0 <= x + dx < w and 0 <= y + dy < h]
            if any(n == p for n in nbs):
                continue
            opaque = [n for n in nbs if n[3]]
            if not opaque:
                continue
            best = max(set(opaque), key=opaque.count)
            img.putpixel((x, y), best)
    return img


def recolor(img, mapping):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            p = px[x, y]
            if p[3] and p[:3] in mapping:
                px[x, y] = mapping[p[:3]]
    return img


def sprite(name):
    return Image.open(SPRITES / f"{name}.png").convert("RGBA")


def rng(seed):
    return random.Random(seed)
