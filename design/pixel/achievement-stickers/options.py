"""Achievement sticker redo: five option drafts (not game art).

Draws a representative set of achievement pictures in the game's cel-shaded pixel style (ink
outline, flat hard shadow shapes, lit band, white glint) and composes them five different ways on
the 74 x 74 sticker grid. Writes per-option sprites (1x) to opt<N>/, the current art to current/,
and the comparison sheet options.png.

    py design/pixel/achievement-stickers/options.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "scripts" / "art" / "cosmetics"))

from PIL import Image, ImageChops, ImageDraw, ImageFont  # noqa: E402

from glyphs import numeral as glyph_numeral  # noqa: E402
from px import (  # noqa: E402
    CLEAR, DEEP, INK, N4, SPRITES, WHITE, D, ell, facet_gem, leaf, ln, mix, new, ngon, outline,
    part, plus, poly, put, ramp, rect, ring, star_pts, sweep_orphans,
)

S = 74
CHAPTERS = {
    "gathering": "#4caf3a",
    "battle": "#e0443a",
    "cards": "#f2c230",
    "wardrobe": "#9b5cff",
    "journey": "#3b6be0",
}
SET = [  # (achievement, chapter, numeral)
    ("first_kill", "battle", None),
    ("giant_slayer_2", "battle", "II"),
    ("first_harvest", "gathering", None),
    ("prospector_1", "gathering", "I"),
    ("first_summon", "cards", None),
    ("ten_pulls", "cards", "10"),
    ("dressed_up", "wardrobe", None),
    ("night_owl", "journey", None),
]
GREY = ["giant_slayer_2", "dressed_up"]

STEEL = ramp("#b9c3dc")
GOLD = ramp("#f2b630")
WOOD = ramp("#9a6232")
BONE = ramp("#efe2c4")
HORN = ramp("#8a5a44")
LEAFR = ramp("#4caf3a")
CRYS = ramp("#5fd0f0")
RUBY = ramp("#e0443a")
VIOLET = ramp("#9b5cff")
OAKGEM = ramp("#e08a32")
MOON = ramp("#ffd877")
OWL = ramp("#9a6a48")
OWLB = ramp("#e8cfa0")
EYE = ramp("#ffc83a")
NAVY = ramp("#2a3150")
SLATE = ramp("#5b5f70")
IRON = ramp("#6c7183")
PARCH = ramp("#ecdcb2")
LAV = (0xC9, 0xBF, 0xDA, 255)
LOCKRING = (0xC6, 0xC9, 0xD3, 255)


# ---------------------------------------------------------------- cel tools

def alpha_mask(img):
    return img.getchannel("A").point(lambda v: 255 if v else 0)


def cel(layer, rp, d=None, lit=1, glint=True, deep=False):
    """Flat cel shading of a one-colour part: base tone, a hard shadow crescent on the bottom-right
    (the part's mask offset toward the light), a one-pixel lit band on the top-left and a white glint."""
    a = alpha_mask(layer)
    w, h = a.size
    bb = a.getbbox()
    if not bb:
        return layer
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    if d is None:
        d = max(1, round(min(bw, bh) * 0.26))
    A = a.load()

    def ins(x, y):
        return 0 <= x < w and 0 <= y < h and A[x, y]

    out = new(w, h)
    for y in range(h):
        for x in range(w):
            if not A[x, y]:
                continue
            c = rp[2]
            if not ins(x + d, y + d):
                c = rp[1]
                if deep and not ins(x + 1, y + 1) and min(bw, bh) > 10:
                    c = rp[0]
            if lit and (not ins(x - lit, y) or not ins(x, y - lit)):
                c = rp[3]
            out.putpixel((x, y), c)
    if glint and min(bw, bh) >= 5:
        best = None
        for y in range(h):
            for x in range(w):
                if ins(x, y) and ins(x - 2, y) and ins(x, y - 2) and ins(x - 2, y - 2) and ins(x + 1, y + 1):
                    key = (x + y, x)
                    if best is None or key < best[0]:
                        best = (key, x, y)
        if best:
            _, gx, gy = best
            put(out, gx, gy, WHITE)
            if min(bw, bh) >= 11:
                put(out, gx + 1, gy, WHITE)
                put(out, gx, gy + 1, WHITE)
    return out


def shape(n, fn):
    L = new(n, n)
    fn(L)
    return L


class Pic:
    """A picture drawn in 52-unit design space at scale k."""

    def __init__(self, k):
        self.k = k
        self.n = int(math.ceil(52 * k)) + 4
        self.img = new(self.n, self.n)

    def P(self, pts):
        return [(x * self.k + 2, y * self.k + 2) for x, y in pts]

    def E(self, x0, y0, x1, y1):
        k = self.k
        return [x0 * k + 2, y0 * k + 2, x1 * k + 2, y1 * k + 2]

    def W(self, w):
        return max(1, round(w * self.k))

    def add(self, layer, rp=None, **kw):
        if rp is not None:
            layer = cel(layer, rp, **kw)
        part(self.img, layer, do_bevel=False)

    def layer(self):
        return new(self.n, self.n)

    def done(self):
        outline(self.img)
        return sweep_orphans(self.img)


def rot(cx, cy, w, h, ang):
    a = math.radians(ang)
    c, s = math.cos(a), math.sin(a)
    out = []
    for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        out.append((cx + dx * c - dy * s, cy + dx * s + dy * c))
    return out


# ---------------------------------------------------------------- pictures

def sword(p: Pic, a, b, guard=GOLD):
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    s = 1 if (-nx - ny) > 0 else -1

    def at(t, v):
        return (ax + ux * L * t + nx * v * s, ay + uy * L * t + ny * v * s)

    G = p.layer()
    poly(G, p.P([at(0.05, -1.9), at(0.22, -1.9), at(0.22, 1.9), at(0.05, 1.9)]), WOOD[2])
    p.add(G, WOOD, d=1, glint=False)
    B = p.layer()
    poly(B, p.P([at(0.24, -3.6), at(0.84, -3.2), at(1, 0), at(0.84, 3.2), at(0.24, 3.6)]), STEEL[1])
    poly(B, p.P([at(0.24, 0), at(1, 0), at(0.84, 3.2), at(0.24, 3.6)]), STEEL[3])
    ln(B, p.P([at(0.27, 0.4), at(0.9, 0.4)]), STEEL[4])
    put(B, *[round(v) for v in p.P([at(0.9, 1.6)])[0]], WHITE)
    p.add(B)
    Gd = p.layer()
    poly(Gd, p.P([at(0.2, -8.5), at(0.2, 8.5), at(0.255, 8.5), at(0.255, -8.5)]), GOLD[2])
    p.add(Gd, guard, d=1)
    Pm = p.layer()
    cx, cy = at(0.03, 0)
    ell(Pm, *p.E(cx - 2.8, cy - 2.8, cx + 2.8, cy + 2.8), RUBY[2])
    p.add(Pm, RUBY, d=1)


def pic_first_kill(p):
    sword(p, (43, 45), (7, 7))
    sword(p, (9, 45), (45, 7))


def pic_giant_slayer(p):
    for flip in (False, True):
        Hn = p.layer()
        pts = [(15, 19), (8, 15), (3, 7), (4, 1), (9, 8), (18, 12)]
        if flip:
            pts = [(52 - x, y) for x, y in pts]
        poly(Hn, p.P(pts), HORN[2])
        p.add(Hn, HORN, d=p.W(2))
    Sk = p.layer()
    ell(Sk, *p.E(11, 8, 41, 37), BONE[2])
    poly(Sk, p.P([(15, 28), (37, 28), (35, 45), (17, 45)]), BONE[2])
    p.add(Sk, BONE, d=p.W(6))
    F = p.layer()
    poly(F, p.P([(15, 19), (24, 23), (23, 29), (16, 27)]), DEEP)
    poly(F, p.P([(37, 19), (28, 23), (29, 29), (36, 27)]), DEEP)
    poly(F, p.P([(26, 30), (23.5, 35), (28.5, 35)]), DEEP)
    for x in (20, 24, 28, 32):
        ln(F, p.P([(x, 38), (x, 44)]), BONE[0])
    ln(F, p.P([(30, 9), (27, 14), (30, 18)]), BONE[0])
    p.img.alpha_composite(F)
    for x, y in ((20, 25), (32, 25)):
        cx, cy = p.P([(x, y)])[0]
        plus(p.img, round(cx), round(cy), RUBY[3], core=RUBY[4])


def pic_first_harvest(p):
    Tw = p.layer()
    ln(Tw, p.P([(4, 8), (18, 15), (30, 20), (31, 26)]), WOOD[2], p.W(3))
    p.add(Tw, WOOD, d=1, glint=False)
    for base, tip, wd in (((16, 14), (4, 34), 7), ((22, 17), (44, 4), 7)):
        Lf = p.layer()
        leaf(Lf, p.P([base])[0], p.P([tip])[0], wd * p.k, LEAFR)
        p.add(Lf)
    G = p.layer()
    cx, cy = p.P([(31, 36)])[0]
    facet_gem(G, ngon(cx, cy, 10, 13 * p.k, rot=-math.pi / 2 + 0.3), OAKGEM, cx, cy, table=0.5)
    p.add(G)
    sx, sy = p.P([(46, 28)])[0]
    plus(p.img, round(sx), round(sy), WHITE, arm=1 if p.k < 0.9 else 2)


def pic_prospector(p):
    R = p.layer()
    ell(R, *p.E(18, 41, 51, 50), SLATE[2])
    p.add(R, SLATE, d=p.W(3), glint=False)
    for pts in ([(28, 46), (27, 28), (33, 19), (39, 28), (39, 46)],
                [(38, 46), (41, 33), (48, 29), (50, 39), (47, 46)],
                [(21, 46), (22, 37), (27, 34), (28, 46)]):
        C = p.layer()
        facet_gem(C, p.P(pts), CRYS, table=0)
        p.add(C)
    Hd = p.layer()
    ln(Hd, p.P([(6, 47), (27, 14)]), WOOD[2], p.W(4))
    p.add(Hd, WOOD, d=1)
    Hm = p.layer()
    poly(Hm, p.P([(9, 9), (18, 4), (28, 6), (37, 11), (46, 24), (36, 16), (28, 13), (18, 11), (9, 12)]), STEEL[2])
    p.add(Hm, STEEL, d=p.W(2))
    Cl = p.layer()
    poly(Cl, p.P(rot(27, 12, 7, 7, 32)), GOLD[2])
    p.add(Cl, GOLD, d=1)
    for x, y, c in ((44, 22, WHITE), (49, 18, CRYS[3])):
        cx, cy = p.P([(x, y)])[0]
        plus(p.img, round(cx), round(cy), c)


def summon_card(p, cx, cy, ang, metal=GOLD):
    Cd = p.layer()
    poly(Cd, p.P(rot(cx, cy, 19, 26, ang)), metal[2])
    p.add(Cd, metal, d=p.W(3))
    Wn = p.layer()
    poly(Wn, p.P(rot(cx, cy - 1, 12, 17, ang)), VIOLET[1])
    p.add(Wn, ramp("#4a2a8a"), d=p.W(3), glint=False)
    Gm = p.layer()
    gx, gy = p.P([(cx, cy - 1)])[0]
    facet_gem(Gm, ngon(gx, gy, 4, 4.6 * p.k, rot=math.radians(ang)), VIOLET, gx, gy, table=0)
    p.add(Gm)


def portal(p):
    Rg = p.layer()
    ell(Rg, *p.E(2, 35, 50, 51), GOLD[2])
    p.add(Rg, GOLD, d=p.W(2))
    In = p.layer()
    ell(In, *p.E(7, 38, 45, 48), VIOLET[3])
    ell(In, *p.E(13, 40, 39, 46), VIOLET[4])
    ell(In, *p.E(19, 42, 33, 44), WHITE)
    p.img.alpha_composite(In)


def pic_first_summon(p):
    portal(p)
    summon_card(p, 26, 21, -10)
    for x, y in ((8, 8), (45, 26)):
        cx, cy = p.P([(x, y)])[0]
        plus(p.img, round(cx), round(cy), WHITE, arm=1 if p.k < 0.9 else 2)


def pic_ten_pulls(p):
    portal(p)
    summon_card(p, 15, 25, -22, metal=ramp("#c9d2e3"))
    summon_card(p, 37, 25, 20, metal=ramp("#c9d2e3"))
    summon_card(p, 26, 18, -2)


def pic_dressed_up(p):
    Pl = p.layer()
    poly(Pl, p.P([(22, 10), (27, 3), (36, 0), (46, 2), (51, 10), (49, 20), (44, 12), (36, 8), (30, 11)]), RUBY[2])
    p.add(Pl, RUBY, d=p.W(3))
    Hm = p.layer()
    poly(Hm, p.P([(10, 24), (12, 14), (18, 8), (26, 6), (34, 8), (40, 14), (42, 24), (42, 40), (37, 47), (15, 47), (10, 40)]), STEEL[2])
    p.add(Hm, STEEL, d=p.W(8), deep=True)
    Rd = p.layer()
    poly(Rd, p.P([(24, 7), (28, 7), (28, 47), (24, 47)]), GOLD[2])
    rect(Rd, *p.E(11, 41, 41, 45), GOLD[2])
    p.add(Rd, GOLD, d=1)
    V = p.layer()
    poly(V, p.P([(13, 24), (24, 26), (24, 29), (13, 28)]), DEEP)
    poly(V, p.P([(39, 24), (28, 26), (28, 29), (39, 28)]), DEEP)
    for y in (33, 37):
        for x in (17, 34):
            cx, cy = p.P([(x, y)])[0]
            put(V, round(cx), round(cy), DEEP)
            if p.k >= 0.9:
                put(V, round(cx) + 1, round(cy), DEEP)
    p.img.alpha_composite(V)


def pic_night_owl(p):
    M = p.layer()
    ell(M, *p.E(2, 4, 46, 48), MOON[2])
    ell(M, *p.E(15, -6, 60, 38), CLEAR)
    p.add(M, MOON, d=p.W(5))
    Cr = p.layer()
    ell(Cr, *p.E(7, 24, 12, 29), MOON[1])
    ell(Cr, *p.E(14, 38, 19, 42), MOON[1])
    p.img.alpha_composite(Cr)
    B = p.layer()
    ell(B, *p.E(25, 17, 49, 47), OWL[2])
    poly(B, p.P([(27, 22), (27, 11), (34, 19)]), OWL[2])
    poly(B, p.P([(47, 22), (47, 11), (40, 19)]), OWL[2])
    p.add(B, OWL, d=p.W(5))
    Bl = p.layer()
    ell(Bl, *p.E(30, 31, 44, 46), OWLB[2])
    p.add(Bl, OWLB, d=p.W(3), glint=False)
    for x0 in (27, 37):
        Ey = p.layer()
        ell(Ey, *p.E(x0, 20, x0 + 10, 30), EYE[3])
        p.add(Ey, EYE, d=p.W(3), glint=False)
        cx, cy = p.P([(x0 + 5.5, 25.5)])[0]
        r = max(1, round(2 * p.k))
        rect(p.img, round(cx) - r + 1, round(cy) - r + 1, round(cx), round(cy), INK)
        put(p.img, round(cx) - r + 1, round(cy) - r + 1, WHITE)
    Bk = p.layer()
    poly(Bk, p.P([(35, 29), (39, 29), (37, 34)]), OAKGEM[2])
    p.add(Bk, OAKGEM, d=1, glint=False)
    sx, sy = p.P([(10, 8)])[0]
    plus(p.img, round(sx), round(sy), WHITE, arm=1 if p.k < 0.9 else 2)


PICTURES = {
    "first_kill": pic_first_kill,
    "giant_slayer_2": pic_giant_slayer,
    "first_harvest": pic_first_harvest,
    "prospector_1": pic_prospector,
    "first_summon": pic_first_summon,
    "ten_pulls": pic_ten_pulls,
    "dressed_up": pic_dressed_up,
    "night_owl": pic_night_owl,
}


def picture(aid, k):
    p = Pic(k)
    PICTURES[aid](p)
    return p.done()


# ---------------------------------------------------------------- shared helpers

def trim(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img


def paste_c(dst, src, cx, cy):
    src = trim(src)
    dst.alpha_composite(src, (int(round(cx - src.width / 2)), int(round(cy - src.height / 2))))


def lum(c):
    return (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255


def remap(img, tones, keep_ink=True):
    """Map every non-ink pixel by brightness onto a short ramp (dark to light)."""
    out = img.copy()
    px_ = out.load()
    n = len(tones)
    for y in range(out.height):
        for x in range(out.width):
            p = px_[x, y]
            if not p[3] or (keep_ink and p[:3] == INK[:3]):
                continue
            px_[x, y] = tones[min(n - 1, int(lum(p) * n))]
    return out


def flat(img, c, keep_ink=True):
    out = img.copy()
    px_ = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px_[x, y]
            if p[3] and not (keep_ink and p[:3] == INK[:3]):
                px_[x, y] = c
    return out


def ring_side(img, c, side="br"):
    """Outline only on the bottom-right side (a paper-thickness lip under a die-cut)."""
    src = img.copy()
    p = src.load()
    w, h = img.size
    nb = ((-1, 0), (0, -1)) if side == "br" else ((1, 0), (0, 1))
    for y in range(h):
        for x in range(w):
            if p[x, y][3]:
                continue
            for dx, dy in nb:
                xx, yy = x + dx, y + dy
                if 0 <= xx < w and 0 <= yy < h and p[xx, yy][3]:
                    img.putpixel((x, y), c)
                    break
    return img


def num_img(text, rp=None, ink_on=True):
    rp = rp or ramp("#ffffff")
    return glyph_numeral(text, rp, 1, bold=True)


def deboss(pic, rp):
    """A picture sunk into the coin: flat dark, lit on its bottom-right inner edge."""
    out = flat(pic, rp[0], keep_ink=False)
    a = alpha_mask(out).load()
    px_ = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if a[x, y] and not (x + 1 < out.width and y + 1 < out.height and a[x + 1, y] and a[x, y + 1]):
                px_[x, y] = rp[2]
    return out


def padlock(img, x, y, rp=STEEL, big=False):
    L = new(S, S)
    if big:
        D(L).arc([x + 2, y, x + 11, y + 10], 180, 360, fill=rp[2], width=3)
        rect(L, x + 2, y + 5, x + 4, y + 7, rp[2])
        rect(L, x + 9, y + 5, x + 11, y + 7, rp[2])
        rect(L, x, y + 7, x + 13, y + 17, GOLD[2])
        rect(L, x, y + 7, x + 13, y + 8, GOLD[3])
        rect(L, x + 10, y + 9, x + 13, y + 17, GOLD[1])
        rect(L, x + 6, y + 10, x + 7, y + 14, DEEP)
        put(L, x + 1, y + 8, WHITE)
        outline(L)
        ring(L, WHITE)
        img.alpha_composite(L)
        return
    D(L).arc([x + 1, y, x + 7, y + 7], 180, 360, fill=rp[2], width=2)
    rect(L, x, y + 4, x + 8, y + 10, rp[2])
    rect(L, x, y + 4, x + 8, y + 5, rp[3])
    rect(L, x + 6, y + 6, x + 8, y + 10, rp[1])
    rect(L, x + 4, y + 6, x + 4, y + 8, DEEP)
    outline(L)
    img.alpha_composite(L)


# ---------------------------------------------------------------- option 1: die-cut sticker

def opt1(aid, ch, num, locked=False):
    img = new(S, S)
    rp = ramp(CHAPTERS[ch]) if not locked else SLATE
    B = new(S, S)
    ell(B, 12, 10, 50, 48, rp[2])
    img.alpha_composite(cel(B, rp, d=7))
    pic = picture(aid, 1.0)
    if locked:
        pic = remap(pic, [SLATE[0], SLATE[1], SLATE[2], ramp("#80859a")[2]])
    paste_c(img, pic, 38, 38)
    if num:
        n = num_img(num, ramp("#ffffff") if not locked else ramp("#a4a9b8"))
        img.alpha_composite(n, (60 - n.width + 4, 54))
    outline(img)
    edge = WHITE if not locked else LOCKRING
    ring(img, edge)
    ring(img, edge)
    ring_side(img, LAV)
    return img


# ---------------------------------------------------------------- option 2: struck medallion

def opt2(aid, ch, num, locked=False):
    img = new(S, S)
    C = 36.5
    metal = GOLD if not locked else IRON
    enamel = ramp(CHAPTERS[ch]) if not locked else SLATE
    R = new(S, S)
    ell(R, C - 33, C - 33, C + 33, C + 33, metal[2])
    img.alpha_composite(cel(R, metal, d=4, glint=False))
    for i in range(12):
        a = i * math.pi / 6 + math.pi / 12
        x, y = C + 30.5 * math.cos(a), C + 30.5 * math.sin(a)
        rect(img, round(x) - 1, round(y) - 1, round(x), round(y), metal[0])
    W = new(S, S)
    ell(W, C - 26, C - 26, C + 26, C + 26, enamel[0])
    ell(W, C - 23, C - 23, C + 27, C + 27, enamel[1])
    img.alpha_composite(W)
    D(img).ellipse([C - 27, C - 27, C + 27, C + 27], outline=metal[0], width=1)
    pic = picture(aid, 0.7 if not num else 0.64)
    relief = [STEEL[0], STEEL[1], STEEL[2], STEEL[3], STEEL[4]] if not locked else [enamel[0], enamel[0], enamel[1], enamel[1]]
    pic = remap(pic, relief, keep_ink=True)
    if locked:
        pic = deboss(pic, enamel)
    else:
        sh = flat(pic, enamel[0], keep_ink=False)
        tmp = new(S, S)
        paste_c(tmp, sh, 37.5, 34 if num else 37.5)
        img.alpha_composite(tmp)
    paste_c(img, pic, 36.5, 33 if num else 36.5)
    if num and not locked:
        n = num_img(num, metal)
        paste_c(img, n, 36.5, 58)
    outline(img)
    ring(img, WHITE if not locked else LOCKRING)
    if locked:
        padlock(img, 48, 47, STEEL, big=True)
    return img


# ---------------------------------------------------------------- option 3: knight crest

SHIELD = [(9, 5), (65, 5), (65, 34), (61, 48), (51, 59), (37, 68), (23, 59), (13, 48), (9, 34)]


def inset(pts, d):
    cx = sum(p[0] for p in pts) / len(pts)
    cy = 30
    return [(cx + (x - cx) * (1 - d / 28), cy + (y - cy) * (1 - d / 38)) for x, y in pts]


def opt3(aid, ch, num, locked=False):
    img = new(S, S)
    metal = STEEL if not locked else IRON
    field = ramp(CHAPTERS[ch]) if not locked else SLATE
    Sh = new(S, S)
    poly(Sh, SHIELD, metal[2])
    img.alpha_composite(cel(Sh, metal, d=3, glint=False))
    Fd = new(S, S)
    poly(Fd, inset(SHIELD, 5), field[2])
    half = new(S, S)
    poly(half, inset(SHIELD, 5), field[1])
    poly(half, [(0, 0), (37, 0), (37, 74), (0, 74)], CLEAR)
    Fd2 = cel(Fd, field, d=0, lit=1, glint=False)
    Fd2.alpha_composite(half)
    img.alpha_composite(Fd2)
    D(img).polygon(inset(SHIELD, 5), outline=metal[0])
    stud = GOLD if not locked else IRON
    for x, y in ((13, 9), (61, 9), (13, 32), (61, 32)):
        St = new(S, S)
        rect(St, x - 1, y - 1, x + 1, y + 1, stud[2])
        put(St, x - 1, y - 1, WHITE if not locked else stud[3])
        put(St, x - 1, y, stud[3])
        rect(St, x, y + 1, x + 1, y + 1, stud[1])
        put(St, x + 1, y, stud[1])
        img.alpha_composite(St)
    pic = picture(aid, 0.62)
    if locked:
        pic = flat(pic, SLATE[0])
    paste_c(img, pic, 37, 28)
    # banner across the point
    Bn = new(S, S)
    tails = [(1, 50), (9, 50), (9, 60), (1, 60), (5, 55)]
    poly(Bn, tails, (PARCH if not locked else SLATE)[1])
    poly(Bn, [(73 - x, y) for x, y in tails], (PARCH if not locked else SLATE)[1])
    outline(Bn)
    img.alpha_composite(Bn)
    Bm = new(S, S)
    poly(Bm, [(7, 47), (67, 47), (67, 57), (7, 57)], (PARCH if not locked else IRON)[2])
    img.alpha_composite(cel(Bm, PARCH if not locked else IRON, d=3, glint=False))
    outline(img)
    if num:
        n = num_img(num, ramp("#6a2a2a") if not locked else IRON)
        paste_c(img, n, 37, 52)
    else:
        Gm = new(S, S)
        facet_gem(Gm, ngon(37, 52, 4, 4.5, rot=0), field, 37, 52, table=0, glint=not locked)
        outline(Gm)
        img.alpha_composite(Gm)
    if locked:
        padlock(img, 30, 20, STEEL, big=True)
    ring(img, WHITE if not locked else LOCKRING)
    return img


# ---------------------------------------------------------------- option 4: object on a cel burst

def burst_pts(seed, n=13, ro=35, ri=24):
    import random
    r = random.Random(seed)
    pts = []
    for i in range(n * 2):
        a = -math.pi / 2 + i * math.pi / n + r.uniform(-0.06, 0.06)
        rr = (ro + r.uniform(-3, 1)) if i % 2 == 0 else (ri + r.uniform(-2, 2))
        pts.append((37 + rr * math.cos(a), 37 + rr * math.sin(a)))
    return pts


def opt4(aid, ch, num, locked=False):
    img = new(S, S)
    pts = burst_pts(sum(map(ord, ch)))
    if not locked:
        rp = ramp(CHAPTERS[ch])
        facet_gem(img, pts, rp, 37, 37, table=0, glint=False)
        outline(img)
    else:
        G = new(S, S)
        D(G).polygon([(round(x), round(y)) for x, y in pts], outline=SLATE[2])
        px_ = G.load()
        for y in range(S):
            for x in range(S):
                if px_[x, y][3] and (x + y) % 4 >= 2:
                    px_[x, y] = CLEAR
        img.alpha_composite(G)
    pic = picture(aid, 1.1)
    if locked:
        pic = flat(pic, SLATE[0])
    else:
        ring(pic, WHITE)
    paste_c(img, pic, 37, 37)
    if num:
        n = num_img(num, ramp("#ffffff") if not locked else SLATE)
        img.alpha_composite(n, (S - n.width - 2, S - n.height - 2))
    return img


# ---------------------------------------------------------------- option 5: mini card

def opt5(aid, ch, num, locked=False):
    img = new(S, S)
    x0, y0, x1, y1 = 10, 4, 63, 72
    frame = ramp(CHAPTERS[ch]) if not locked else IRON
    F = new(S, S)
    rect(F, x0, y0, x1, y1, frame[2])
    img.alpha_composite(cel(F, frame, d=3, glint=False))
    rect(img, x0 + 4, y0 + 5, x1 - 4, y1 - 5, frame[0])
    if not locked:
        win = ramp("#262c4a")
        rect(img, x0 + 5, y0 + 6, x1 - 5, y1 - 17, win[2])
        rect(img, x0 + 5, y0 + 6, x1 - 5, y0 + 7, win[1])
        rect(img, x0 + 5, y0 + 6, x0 + 6, y1 - 17, win[1])
        Bd = new(S, S)
        ell(Bd, x0 + 9, y0 + 10, x1 - 9, y1 - 22, mix(win[2], frame[1], 0.35))
        img.alpha_composite(Bd)
        pic = picture(aid, 0.74)
        paste_c(img, pic, (x0 + x1) / 2 + 0.5, (y0 + y1 - 11) / 2 + 0.5)
        Pl = new(S, S)
        rect(Pl, x0 + 5, y1 - 15, x1 - 5, y1 - 6, GOLD[2])
        img.alpha_composite(cel(Pl, GOLD, d=2, glint=False))
        if num:
            n = num_img(num, ramp("#5a2a1a"))
            paste_c(img, n, (x0 + x1) / 2 + 0.5, y1 - 10)
        else:
            for dx in (-8, 0, 8):
                St = new(S, S)
                facet_gem(St, ngon((x0 + x1) / 2 + 0.5 + dx, y1 - 10.5, 4, 3.2, rot=0), frame, table=0, glint=False)
                outline(St)
                img.alpha_composite(St)
    else:
        back = SLATE
        Bk = new(S, S)
        rect(Bk, x0 + 5, y0 + 6, x1 - 5, y1 - 6, back[1])
        for k in range(-80, 80, 7):
            ln(Bk, [(x0 + 5 + k, y0 + 6), (x0 + 5 + k + 70, y0 + 76)], back[2])
            ln(Bk, [(x1 - 5 - k, y0 + 6), (x1 - 5 - k - 70, y0 + 76)], back[2])
        clip = new(S, S)
        rect(clip, x0 + 5, y0 + 6, x1 - 5, y1 - 6, WHITE)
        Bk.putalpha(ImageChops.multiply(alpha_mask(Bk), alpha_mask(clip)))
        img.alpha_composite(Bk)
        F2 = new(S, S)
        rect(F2, x0, y0, x1, y1, frame[2])
        rect(F2, x0 + 5, y0 + 6, x1 - 5, y1 - 6, CLEAR)
        img.alpha_composite(cel(F2, frame, d=2, glint=False))
        padlock(img, 30, 27, STEEL, big=True)
    # gold corner caps
    for cx, cy, sx, sy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        Cp = new(S, S)
        g = GOLD if not locked else IRON
        poly(Cp, [(cx, cy), (cx + 8 * sx, cy), (cx + 8 * sx, cy + 3 * sy), (cx + 3 * sx, cy + 3 * sy), (cx + 3 * sx, cy + 8 * sy), (cx, cy + 8 * sy)], g[2])
        img.alpha_composite(cel(Cp, g, d=1, glint=False))
    # crest gem on top
    Cg = new(S, S)
    facet_gem(Cg, ngon(36.5, 5.5, 4, 4.5, rot=0), frame if not locked else SLATE, 36.5, 5.5, table=0, glint=not locked)
    img.alpha_composite(Cg)
    outline(img)
    return sweep_orphans(img)


OPTIONS = [
    ("Option 1", "Die-cut sticker", "The object itself is the sticker: cel-shaded with ink, a thick white die-cut border and a small chapter-coloured disc behind. Locked: a slate print of the same cut.", opt1),
    ("Option 2", "Struck medallion", "A notched gold coin like the resource coins; the picture is struck in one silver relief on chapter enamel, numerals stamped below. Locked: an iron coin, picture sunk dark, padlock.", opt2),
    ("Option 3", "Knight crest", "A steel heater shield with gold rivets, the chapter as a split enamel field, the picture as its emblem and a banner carrying the tier numeral. Locked: iron shield, dark emblem, padlock.", opt3),
    ("Option 4", "Cel burst", "No disc: the object is drawn big with a white rim over a faceted, hard-edged burst in the chapter colour. Locked: a flat dark silhouette over a dotted burst outline.", opt4),
    ("Option 5", "Mini card", "A tiny card echoing the Knight plate frame: chapter-coloured band, gold corners, crest gem, dark window with the object, gold nameplate with the numeral. Locked: face-down card back with a padlock.", opt5),
]


def current(aid, ch, locked=False):
    img = new(S, S)
    img.alpha_composite(Image.open(SPRITES / f"cos-sticker-a-{'locked' if locked else ch}.png").convert("RGBA"))
    img.alpha_composite(Image.open(SPRITES / f"cos-ach-{aid}{'-grey' if locked else ''}.png").convert("RGBA"), (11, 11))
    return img


# ---------------------------------------------------------------- sheet

def cells(fn):
    out = []
    for aid, ch, num in SET:
        out.append((aid, sweep_orphans(fn(aid, ch, num, False))))
    for aid in GREY:
        ch, num = next((c, n) for a, c, n in SET if a == aid)
        out.append((aid + "-grey", sweep_orphans(fn(aid, ch, num, True))))
    return out


def build():
    rows = [("Current", "Beta B6 style a", "Flat disc plus a flat picture pasted on top: no cel shadow shapes, weak highlights, generic clip-art shapes.",
             [(a, current(a, c)) for a, c, _ in SET] + [(a + "-grey", current(a, next(c for x, c, _ in SET if x == a), True)) for a in GREY])]
    for i, (label, name, desc, fn) in enumerate(OPTIONS, 1):
        cs = cells(fn)
        d = HERE / f"opt{i}"
        d.mkdir(exist_ok=True)
        for nm, im in cs:
            im.save(d / f"{nm}.png")
        rows.append((label, name, desc, cs))
    cd = HERE / "current"
    cd.mkdir(exist_ok=True)
    for nm, im in rows[0][3]:
        im.save(cd / f"{nm}.png")

    BG = (0x2A, 0x2F, 0x38)
    PAPER = (0xEF, 0xE3, 0xC6)
    Z = 3
    cell = S * Z + 14
    left = 40
    ncell = len(rows[0][3])
    strip_w = ncell * (S + 6) + 12
    W = left + ncell * cell + 30 + strip_w + 30
    rowh = 58 + S * Z + 34
    H = 150 + len(rows) * rowh + 20
    sheet = Image.new("RGB", (W, H), (0x1B, 0x1E, 0x26))
    dr = ImageDraw.Draw(sheet)
    F = "C:/Windows/Fonts/"
    big = ImageFont.truetype(F + "bahnschrift.ttf", 44)
    mid = ImageFont.truetype(F + "segoeuib.ttf", 22)
    small = ImageFont.truetype(F + "segoeui.ttf", 18)
    tiny = ImageFont.truetype(F + "segoeui.ttf", 15)
    dr.text((left, 24), "Achievement stickers: five directions", font=big, fill=(0xF6, 0xE7, 0xC8))
    dr.text((left, 82), "Each row: the same 8 achievements lit (battle, battle, gathering, gathering, cards, cards, wardrobe, journey) and 2 locked, at 3x on the achievements page colour #2a2f38.", font=small, fill=(0xC8, 0xCC, 0xD6))
    dr.text((left, 106), "Right: the same row at 1x, the real in-game size (74 x 74 CSS px), on #2a2f38 and on the sticker book paper #efe3c6 they actually sit on.", font=small, fill=(0xC8, 0xCC, 0xD6))
    names = [a for a, _, _ in SET] + [a + " (locked)" for a in GREY]
    y = 150
    for ri, (label, name, desc, cs) in enumerate(rows):
        accent = (0xF2, 0xC2, 0x30) if ri else (0x9A, 0xA0, 0xB0)
        dr.rectangle([left, y, left + 8, y + 40], fill=accent)
        dr.text((left + 20, y - 6), f"{label}", font=big, fill=accent)
        lw = dr.textlength(label, font=big)
        dr.text((left + 40 + lw, y + 2), name, font=mid, fill=(0xF6, 0xE7, 0xC8))
        dr.text((left + 40 + lw, y + 30), desc, font=tiny, fill=(0xC8, 0xCC, 0xD6))
        cy = y + 58
        for ci, (nm, im) in enumerate(cs):
            x = left + ci * cell
            dr.rectangle([x, cy, x + S * Z + 4, cy + S * Z + 4], fill=BG)
            sheet.paste(im.resize((S * Z, S * Z), Image.NEAREST), (x + 2, cy + 2), im.resize((S * Z, S * Z), Image.NEAREST))
            if ri == 0:
                pass
            dr.text((x, cy + S * Z + 8), names[ci], font=tiny, fill=(0x9A, 0xA0, 0xB0))
        sx = left + ncell * cell + 30
        for k, bg in enumerate((BG, PAPER)):
            yy = cy + k * (S + 16)
            dr.rectangle([sx, yy, sx + strip_w, yy + S + 10], fill=bg)
            for ci, (nm, im) in enumerate(cs):
                sheet.paste(im, (sx + 6 + ci * (S + 6), yy + 5), im)
        dr.text((sx, cy + 2 * (S + 16) + 2), "1x on page / on book paper", font=tiny, fill=(0x9A, 0xA0, 0xB0))
        y += rowh
    sheet.save(HERE / "options.png")
    print("wrote", HERE / "options.png", sheet.size)


if __name__ == "__main__":
    build()
