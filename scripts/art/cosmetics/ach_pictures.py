"""B6 achievement pictures, redrawn in the cel style (approved 2026-11-08 with the mini-card sticker).

Every picture is drawn in a 52-unit design space and rasterised at K (0.74) onto a small grid:
each part is one flat colour, shaded by `cel` (hard shadow shape bottom-right, lit band top-left,
white glint), parts overlap with a line in their own darkest tone, and the whole picture gets one
ink outline. `picture(aid)` returns the picture centred on a PIC x PIC canvas; the sticker card
puts it in its dark window. Tier numerals are not drawn here: they sit on the card's nameplate
(`NUMERALS`).
"""
from __future__ import annotations

import math

from px import (  # noqa: F401
    CLEAR, DEEP, INK, WHITE, D, cel, ell, facet_gem, leaf, ln, mix, new, ngon, outline, part, plus, poly,
    put, ramp, rect, star_pts, sweep_orphans,
)

K = 0.74
PIC = 44

STEEL = ramp("#b9c3dc")
GOLD = ramp("#f2b630")
WOOD = ramp("#9a6232")
PALEWOOD = ramp("#e2b778")
BONE = ramp("#efe2c4")
HORN = ramp("#8a5a44")
LEAFR = ramp("#4caf3a")
MOSS = ramp("#6cbf3a")
CRYS = ramp("#5fd0f0")
ICE = ramp("#9fe0ff")
RUBY = ramp("#e0443a")
SAPPH = ramp("#3b78e8")
EMER = ramp("#2fbf6a")
VIOLET = ramp("#9b5cff")
OAKGEM = ramp("#e08a32")
MOON = ramp("#ffd877")
OWL = ramp("#9a6a48")
OWLB = ramp("#e8cfa0")
EYE = ramp("#ffc83a")
SLATE = ramp("#5b5f70")
IRON = ramp("#6c7183")
CLOUD = ramp("#e6eaf8")
FEATHER = ramp("#f4f2ff")
CAPE = ramp("#8a3cdc")
SUN = ramp("#ff9a2e")
NIGHT = ramp("#262c4a")
OAK = ramp("#cf8e50")
IRONBARK = ramp("#8e7262")
WILLOW = ramp("#cdc8f2")
COPPER = ramp("#f08a3c")
IRONGEM = ramp("#aab4c2")
GROTTO = ramp("#9adcf2")
LAVCARD = ramp("#d9c8ff")

# Tier numerals shown on the card's nameplate (everything else shows the three chapter pips).
NUMERALS = {
    "lumberjack_1": "I",
    "lumberjack_2": "II",
    "prospector_1": "I",
    "prospector_2": "II",
    "giant_slayer_1": "I",
    "giant_slayer_2": "II",
    "giant_slayer_3": "III",
    "ten_pulls": "10",
    "first_milestone": "25",
}


class Pic:
    """A picture drawn in 52-unit design space at scale k."""

    def __init__(self, k=K):
        self.k = k
        self.n = int(math.ceil(52 * k)) + 8
        self.img = new(self.n, self.n)

    def P(self, pts):
        return [(x * self.k + 4, y * self.k + 4) for x, y in pts]

    def pt(self, x, y):
        cx, cy = self.P([(x, y)])[0]
        return round(cx), round(cy)

    def E(self, x0, y0, x1, y1):
        k = self.k
        return [x0 * k + 4, y0 * k + 4, x1 * k + 4, y1 * k + 4]

    def W(self, w):
        return max(1, round(w * self.k))

    def add(self, layer, rp=None, **kw):
        if rp is not None:
            layer = cel(layer, rp, **kw)
        part(self.img, layer, do_bevel=False)

    def flat(self, layer):
        self.img.alpha_composite(layer)

    def layer(self):
        return new(self.n, self.n)

    def spark(self, x, y, c=WHITE, big=False):
        cx, cy = self.pt(x, y)
        plus(self.img, cx, cy, c, arm=2 if big else 1)

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


def local(ox, oy, ang, pts):
    """Points given along a rotated axis (u forward, v to the side) around an origin."""
    a = math.radians(ang)
    c, s = math.cos(a), math.sin(a)
    return [(ox + u * c - v * s, oy + u * s + v * c) for u, v in pts]


def gem(p, x, y, n, r, rp, rot_=-math.pi / 2, table=0.0):
    G = p.layer()
    cx, cy = p.P([(x, y)])[0]
    facet_gem(G, ngon(cx, cy, n, r * p.k, rot=rot_), rp, cx, cy, table=table)
    p.add(G)


def star_gem(p, x, y, ro, ri, rp, n=5):
    G = p.layer()
    cx, cy = p.P([(x, y)])[0]
    facet_gem(G, star_pts(cx, cy, n, ro * p.k, ri * p.k), rp, cx, cy, table=0)
    p.add(G)


# ---------------------------------------------------------------- shared parts

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


def skull(p, eyes, horns=False):
    if horns:
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
    p.flat(F)
    for x, y in ((20, 25), (32, 25)):
        cx, cy = p.pt(x, y)
        plus(p.img, cx, cy, eyes[3], core=eyes[4])


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
    p.flat(In)


def tier_card(p, cx, cy, w, h, ang, metal, win, gem_rp, gem_n=4):
    """A small upright card for the card-tier pictures: metal frame, dark window, one gem."""
    Cd = p.layer()
    poly(Cd, p.P(rot(cx, cy, w, h, ang)), metal[2])
    p.add(Cd, metal, d=p.W(3))
    Wn = p.layer()
    poly(Wn, p.P(rot(cx, cy + 0.5, w - 7, h - 8, ang)), win[2])
    p.add(Wn, win, d=p.W(3), glint=False)
    gx, gy = p.P([(cx, cy)])[0]
    G = p.layer()
    facet_gem(G, ngon(gx, gy, gem_n, 5 * p.k, rot=math.radians(ang) - math.pi / 2), gem_rp, gx, gy, table=0)
    p.add(G)


def log_end(p, x, y, r):
    L = p.layer()
    ell(L, *p.E(x - r, y - r, x + r, y + r), PALEWOOD[2])
    p.add(L, PALEWOOD, d=p.W(2), glint=False)
    D(p.img).ellipse(p.E(x - r * 0.5, y - r * 0.5, x + r * 0.5, y + r * 0.5), outline=PALEWOOD[0])


# ---------------------------------------------------------------- gathering

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
    p.spark(46, 28)


def axe_head(p, ox, oy, ang, double=False, metal=STEEL, sc=1.0, side=1):
    """An axe head on a handle pointing along ang, centred on the handle at (ox, oy)."""
    sides = (1, -1) if double else (side,)
    for sg in sides:
        B = p.layer()
        pts = [(-4, 1.5), (-8, 7), (-6, 13), (0, 10.5), (6, 13), (8, 7), (4, 1.5)]
        poly(B, p.P(local(ox, oy, ang, [(u * sc, v * sg * sc) for u, v in pts])), metal[2])
        p.add(B, metal, d=p.W(3))
        Ed = p.layer()
        edge = [(-6, 13), (0, 10.5), (6, 13), (6, 11.4), (0, 9), (-6, 11.4)]
        poly(Ed, p.P(local(ox, oy, ang, [(u * sc, v * sg * sc) for u, v in edge])), metal[4])
        p.flat(Ed)


def pic_lumberjack_1(p):
    # a stump with an axe bitten into it
    St = p.layer()
    poly(St, p.P([(8, 31), (44, 31), (46, 46), (50, 49), (2, 49), (6, 46)]), WOOD[2])
    p.add(St, WOOD, d=p.W(5), glint=False)
    Bk = p.layer()
    for x in (16, 26, 36):
        ln(Bk, p.P([(x, 37), (x, 46)]), WOOD[0])
    p.flat(Bk)
    Tp = p.layer()
    ell(Tp, *p.E(8, 25, 44, 37), PALEWOOD[2])
    p.add(Tp, PALEWOOD, d=p.W(3), glint=False)
    D(p.img).ellipse(p.E(15, 28, 37, 34), outline=PALEWOOD[0])
    H = p.layer()
    ln(H, p.P([(20, 27), (40, 2)]), WOOD[2], p.W(4.5))
    p.add(H, WOOD, d=1, glint=False)
    ang = math.degrees(math.atan2(2 - 27, 40 - 20))
    axe_head(p, 23, 23, ang, sc=1.15, side=1)
    for x, y, a in ((7, 17, 20), (40, 22, -25)):
        Ch = p.layer()
        poly(Ch, p.P(rot(x, y, 6, 3.5, a)), PALEWOOD[2])
        p.add(Ch, PALEWOOD, d=1, glint=False)
    p.spark(5, 6)


def pic_lumberjack_2(p):
    # a gold-collared double-bit axe over a pyramid of log ends
    for x, y in ((9, 42), (24, 42), (39, 42), (16.5, 30), (31.5, 30)):
        log_end(p, x, y, 7.5)
    H = p.layer()
    ln(H, p.P([(8, 50), (40, 8)]), WOOD[2], p.W(4.5))
    p.add(H, WOOD, d=1, glint=False)
    ang = math.degrees(math.atan2(8 - 50, 40 - 8))
    axe_head(p, 35, 14.5, ang, double=True, sc=1.2)
    C = p.layer()
    poly(C, p.P(local(35, 14.5, ang, [(-4, -3), (4, -3), (4, 3), (-4, 3)])), GOLD[2])
    p.add(C, GOLD, d=1)
    p.spark(47, 30, big=True)
    p.spark(4, 22)


def pic_prospector_1(p):
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
    p.spark(44, 22)
    p.spark(49, 18, CRYS[3])


def pic_prospector_2(p):
    # a mine cart heaped with gems
    for x, y, n, r, rp, a in ((15, 17, 6, 7.5, CRYS, 0.3), (37, 17, 4, 7.5, RUBY, 0.0), (26, 12, 8, 9, GOLD, -0.3),
                              (8, 22, 4, 5, EMER, 0.4), (44, 22, 6, 5, VIOLET, 0.0)):
        gem(p, x, y, n, r, rp, rot_=-math.pi / 2 + a)
    Cb = p.layer()
    poly(Cb, p.P([(3, 21), (49, 21), (44, 41), (8, 41)]), WOOD[2])
    p.add(Cb, WOOD, d=p.W(4), glint=False)
    Bd = p.layer()
    rect(Bd, *p.E(3, 21, 49, 25), IRON[2])
    for x in (13, 37):
        poly(Bd, p.P([(x, 25), (x + 3, 25), (x + 2.4, 41), (x + 0.6, 41)]), IRON[2])
    p.add(Bd, IRON, d=1)
    for x in (14, 38):
        Wh = p.layer()
        ell(Wh, *p.E(x - 6, 37, x + 6, 49), IRON[2])
        p.add(Wh, IRON, d=p.W(3), glint=False)
        cx, cy = p.pt(x, 43)
        rect(p.img, cx - 1, cy - 1, cx, cy, GOLD[3])
    p.spark(47, 7, big=True)


def pic_tree_hugger(p):
    # one tree wearing the three tree gems: oak (round), ironbark (pentagon), moonwillow (star)
    T = p.layer()
    poly(T, p.P([(20, 26), (32, 26), (34, 46), (40, 50), (12, 50), (18, 46)]), WOOD[2])
    p.add(T, WOOD, d=p.W(4), glint=False)
    Hh = p.layer()
    hx, hy = 26, 40
    ell(Hh, *p.E(hx - 4.4, hy - 3.6, hx + 0.2, hy + 1), RUBY[2])
    ell(Hh, *p.E(hx - 0.2, hy - 3.6, hx + 4.4, hy + 1), RUBY[2])
    poly(Hh, p.P([(hx - 4.2, hy - 0.6), (hx + 4.2, hy - 0.6), (hx, hy + 4.4)]), RUBY[2])
    p.add(Hh, RUBY, d=1, glint=False)
    Cn = p.layer()
    for cx, cy, r in ((26, 15, 14), (12, 22, 9), (40, 22, 9), (19, 9, 8), (34, 9, 8)):
        ell(Cn, *p.E(cx - r, cy - r, cx + r, cy + r), LEAFR[2])
    p.add(Cn, LEAFR, d=p.W(6))
    gem(p, 13, 24, 10, 4.6, OAK, table=0)
    gem(p, 39, 24, 5, 5, IRONBARK)
    star_gem(p, 27, 16, 6.5, 2.8, WILLOW)
    p.spark(47, 4)


def pic_deep_delver(p):
    # a timbered mine mouth in a rock mound, three mine gems glowing inside, rails running out
    R = p.layer()
    poly(R, p.P([(0, 50), (2, 24), (10, 8), (24, 2), (38, 5), (48, 16), (52, 32), (52, 50)]), SLATE[2])
    p.add(R, SLATE, d=p.W(6), glint=False)
    In = p.layer()
    rect(In, *p.E(14, 15, 38, 50), NIGHT[1])
    p.flat(In)
    sh = p.layer()
    rect(sh, *p.E(14, 15, 38, 19), NIGHT[0])
    rect(sh, *p.E(14, 15, 18, 50), NIGHT[0])
    p.flat(sh)
    for x, y, n, r, rp, a in ((21, 25, 4, 4.6, COPPER, math.pi / 4), (31, 30, 6, 4.6, IRONGEM, 0), (23, 37, 6, 4.4, GROTTO, math.pi / 6)):
        gem(p, x, y, n, r, rp, rot_=-math.pi / 2 + a)
    Rl = p.layer()
    ln(Rl, p.P([(20, 44), (14, 52)]), IRON[3], p.W(2.6))
    ln(Rl, p.P([(32, 44), (38, 52)]), IRON[3], p.W(2.6))
    for y, a, b in ((47, 18.2, 33.8), (50.5, 15.6, 36.4)):
        ln(Rl, p.P([(a, y), (b, y)]), WOOD[1], p.W(2.2))
    p.add(Rl)
    Fr = p.layer()
    rect(Fr, *p.E(9, 13, 15, 50), WOOD[2])
    rect(Fr, *p.E(37, 13, 43, 50), WOOD[2])
    p.add(Fr, WOOD, d=p.W(3), glint=False)
    Ln = p.layer()
    poly(Ln, p.P([(5, 7), (47, 7), (46, 15), (6, 15)]), WOOD[2])
    p.add(Ln, PALEWOOD, d=p.W(3), glint=False)
    p.spark(47, 40)


def pic_first_milestone(p):
    # a pennant planted on a snowy summit
    M = p.layer()
    poly(M, p.P([(0, 50), (16, 26), (22, 30), (30, 20), (52, 50)]), SLATE[2])
    p.add(M, SLATE, d=p.W(6), glint=False)
    Sn = p.layer()
    poly(Sn, p.P([(16, 26), (22, 30), (30, 20), (36.5, 29), (32, 27), (27, 32), (22, 33), (18, 30), (12.5, 31)]), CLOUD[2])
    p.add(Sn, CLOUD, d=1, glint=False)
    Pl = p.layer()
    ln(Pl, p.P([(30, 22), (30, 2)]), WOOD[2], p.W(3))
    p.add(Pl, WOOD, d=1, glint=False)
    Fl = p.layer()
    poly(Fl, p.P([(32, 2), (51, 6), (44, 11), (51, 17), (32, 17)]), RUBY[2])
    p.add(Fl, RUBY, d=p.W(3))
    Fn = p.layer()
    cx, cy = p.pt(30, 1.2)
    rect(Fn, cx - 1, cy - 1, cx, cy, GOLD[2])
    p.add(Fn, GOLD, d=1, glint=False)
    p.spark(8, 10)


def pic_gem_adept(p):
    # a brilliant in a gold mastery bezel, gold laurels below
    for base, tip in (((25, 50), (4, 32)), ((27, 50), (48, 32))):
        Lf = p.layer()
        leaf(Lf, p.P([base])[0], p.P([tip])[0], 6 * p.k, GOLD)
        p.add(Lf)
    Bz = p.layer()
    ell(Bz, *p.E(5, 1, 47, 43), GOLD[2])
    for a in range(4):
        ang = math.pi / 4 + a * math.pi / 2
        x, y = 26 + 21 * math.cos(ang), 22 + 21 * math.sin(ang)
        ell(Bz, *p.E(x - 3.4, y - 3.4, x + 3.4, y + 3.4), GOLD[2])
    p.add(Bz, GOLD, d=p.W(4))
    G = p.layer()
    cx, cy = p.P([(26, 22)])[0]
    facet_gem(G, ngon(cx, cy, 8, 16.5 * p.k, rot=-math.pi / 8), ramp("#33c3e0"), cx, cy, table=0.5)
    p.add(G)
    p.spark(45, 44, big=True)


# ---------------------------------------------------------------- battle

def pic_first_kill(p):
    sword(p, (43, 45), (7, 7))
    sword(p, (9, 45), (45, 7))


def pic_giant_slayer_1(p):
    # the Mossy Cellar: a skull under a moss cap with a sprout, roots at the jaw
    for pts in ([(15, 42), (8, 46), (5, 51)], [(37, 42), (44, 46), (47, 51)]):
        Rt = p.layer()
        ln(Rt, p.P(pts), WOOD[2], p.W(4))
        p.add(Rt, WOOD, d=1, glint=False)
    skull(p, LEAFR)
    Ms = p.layer()
    poly(Ms, p.P([(9, 21), (10, 13), (17, 6), (26, 4), (35, 6), (42, 13), (43, 21), (39, 17), (35, 21), (30, 16),
                  (25, 20), (20, 15), (15, 20), (12, 16)]), MOSS[2])
    p.add(Ms, MOSS, d=p.W(3), glint=False)
    Sp = p.layer()
    ln(Sp, p.P([(27, 6), (28, 2)]), LEAFR[1], p.W(2))
    p.add(Sp)
    for base, tip in (((28, 2), (19, 0.5)), ((28, 2), (37, 0))):
        Lf = p.layer()
        leaf(Lf, p.P([base])[0], p.P([tip])[0], 3.4 * p.k, LEAFR)
        p.add(Lf)


def pic_giant_slayer_2(p):
    skull(p, RUBY, horns=True)
    Cr = p.layer()
    ln(Cr, p.P([(30, 9), (27, 14), (30, 18)]), BONE[0])
    p.flat(Cr)


def pic_giant_slayer_3(p):
    # the Frostspire Vault: a skull crowned with ice spikes, icicles on the jaw
    for pts in ([(14, 16), (12, 2), (20, 11)], [(21, 11), (26, -1), (31, 11)], [(32, 11), (40, 2), (38, 16)]):
        Ic = p.layer()
        facet_gem(Ic, p.P(pts), ICE, table=0)
        p.add(Ic)
    skull(p, SAPPH)
    for x in (18, 33):
        Ic = p.layer()
        poly(Ic, p.P([(x - 2, 44), (x + 2, 44), (x, 50)]), ICE[2])
        p.add(Ic, ICE, d=1, glint=False)
    p.spark(46, 24)


def pic_glimmer_seeker(p):
    # the Crystal Sentinel: a one-eyed diamond inside a halo, two shards orbiting
    Hl = p.layer()
    D(Hl).ellipse(p.E(3, 3, 49, 49), outline=GOLD[2], width=p.W(4))
    p.add(Hl, GOLD, d=1, glint=False)
    Dm = p.layer()
    cx, cy = p.P([(26, 26)])[0]
    facet_gem(Dm, p.P([(26, 6), (42, 26), (26, 47), (10, 26)]), CRYS, cx, cy, table=0)
    p.add(Dm)
    Ey = p.layer()
    ell(Ey, *p.E(17, 21, 35, 31), WHITE)
    p.flat(Ey)
    Ir = p.layer()
    ell(Ir, *p.E(22, 21.5, 30, 30.5), SAPPH[2])
    p.add(Ir, SAPPH, d=1, glint=False)
    ex, ey = p.pt(26.4, 26.4)
    rect(p.img, ex - 1, ey - 1, ex, ey, INK)
    put(p.img, ex - 2, ey - 2, WHITE)
    for x, y in ((6, 12), (46, 40)):
        Sh = p.layer()
        sx, sy = p.P([(x, y)])[0]
        facet_gem(Sh, ngon(sx, sy, 4, 4.4 * p.k, rot=0), CRYS, sx, sy, table=0)
        p.add(Sh)


def pic_medalist(p):
    # a silver boss medal on a red and blue ribbon
    for pts, rp in (([(12, 0), (21, 0), (29, 22), (21, 24)], RUBY), ([(40, 0), (31, 0), (23, 22), (31, 24)], SAPPH)):
        Rb = p.layer()
        poly(Rb, p.P(pts), rp[2])
        p.add(Rb, rp, d=p.W(3), glint=False)
    M = p.layer()
    ell(M, *p.E(8, 16, 44, 52), STEEL[2])
    p.add(M, STEEL, d=p.W(6))
    In = p.layer()
    ell(In, *p.E(13, 21, 39, 47), STEEL[1])
    p.flat(In)
    star_gem(p, 26, 34.5, 11, 4.8, STEEL)
    p.spark(44, 20)


# ---------------------------------------------------------------- cards

def pic_first_summon(p):
    portal(p)
    summon_card(p, 26, 21, -10)
    p.spark(8, 8, big=True)
    p.spark(45, 26, big=True)


def pic_ten_pulls(p):
    portal(p)
    summon_card(p, 15, 25, -22, metal=ramp("#c9d2e3"))
    summon_card(p, 37, 25, 20, metal=ramp("#c9d2e3"))
    summon_card(p, 26, 18, -2)


def pic_pity_breaker(p):
    # a gold lucky horseshoe, nail holes, sparkles
    Hs = p.layer()
    D(Hs).arc(p.E(6, 4, 46, 48), -25, 205, fill=GOLD[2], width=p.W(10))
    for sg in (1, -1):
        x = 26 + sg * 17.5
        rect(Hs, *p.E(x - 5.5, 10, x + 5.5, 16), GOLD[2])
    p.add(Hs, GOLD, d=p.W(4))
    for a in (-5, 30, 65, 115, 150, 185):
        r = math.radians(a)
        cx, cy = p.pt(26 + 15 * math.cos(r), 26 + 15 * math.sin(r))
        put(p.img, cx, cy, GOLD[0])
        put(p.img, cx, cy + 1, GOLD[0])
    p.spark(26, 10, big=True)
    p.spark(8, 6)
    p.spark(45, 4)


def pic_silver_lining(p):
    # a Silver card rising from a cloud with a bright rim
    tier_card(p, 26, 21, 23, 32, -8, ramp("#c9d2e3"), NIGHT, SAPPH)
    for x, y in local(26, 21, -8, [(-9, -13), (9, -13)]):
        gem(p, x, y, 4, 3.2, SAPPH, rot_=0)
    Cl = p.layer()
    for cx, cy, r in ((10, 43, 8), (22, 39, 10), (36, 40, 10), (45, 45, 6.5)):
        ell(Cl, *p.E(cx - r, cy - r, cx + r, cy + r), CLOUD[2])
    rect(Cl, *p.E(4, 44, 50, 51), CLOUD[2])
    p.add(Cl, CLOUD, d=p.W(4))


def pic_golden_hour(p):
    # a Gold card with a small crown, in front of a setting sun
    Sr = p.layer()
    for i in range(10):
        a = math.radians(i * 36 + 18)
        poly(Sr, p.P([(26 + 16 * math.cos(a - 0.25), 26 + 16 * math.sin(a - 0.25)),
                      (26 + 26 * math.cos(a), 26 + 26 * math.sin(a)),
                      (26 + 16 * math.cos(a + 0.25), 26 + 16 * math.sin(a + 0.25))]), SUN[3])
    p.add(Sr, SUN, d=1, glint=False)
    Sd = p.layer()
    ell(Sd, *p.E(8, 8, 44, 44), SUN[2])
    p.add(Sd, SUN, d=p.W(5), glint=False)
    tier_card(p, 26, 29, 22, 30, 6, GOLD, ramp("#5a1a2a"), RUBY)
    Cr = p.layer()
    poly(Cr, p.P(local(26, 13, 6, [(-6, 2), (-6, -4), (-3, -1), (0, -6), (3, -1), (6, -4), (6, 2)])), GOLD[2])
    p.add(Cr, GOLD, d=1)


def pic_six_stars(p):
    # six gold stars in a ring round a card gem
    for i in range(6):
        a = -math.pi / 2 + i * math.pi / 3
        star_gem(p, 26 + 17.5 * math.cos(a), 26 + 17.5 * math.sin(a), 8.5, 3.8, GOLD)
    gem(p, 26, 26, 4, 7, VIOLET, rot_=0)


def pic_prismatic_dawn(p):
    # a Prismatic card with a radiant crown, rising in front of a rainbow arc
    cols = ["#ff5f7a", "#ffc94d", "#5fe08a", "#5fb8ff", "#b47cff"]
    for i, c in enumerate(cols):
        Ar = p.layer()
        r0, r1 = 26 - i * 3.6, 22.4 - i * 3.6
        ell(Ar, *p.E(26 - r0, 50 - r0, 26 + r0, 50 + r0), ramp(c)[2])
        ell(Ar, *p.E(26 - r1, 50 - r1, 26 + r1, 50 + r1), CLEAR)
        rect(Ar, *p.E(-2, 50, 54, 80), CLEAR)
        p.flat(Ar)
    tier_card(p, 26, 27, 22, 30, 0, LAVCARD, ramp("#3a2a6a"), ramp("#ff8ad8"), gem_n=6)
    Cr = p.layer()
    poly(Cr, p.P([(17, 12), (17, 5), (21, 9), (26, 1), (31, 9), (35, 5), (35, 12)]), LAVCARD[2])
    p.add(Cr, LAVCARD, d=1)
    cx, cy = p.pt(26, 6)
    put(p.img, cx, cy, ramp("#5fe08a")[3])
    p.spark(7, 8)
    p.spark(46, 10, big=True)


def pic_full_loadout(p):
    # a hand of four cards, one per loadout slot
    for i, (rp, gm) in enumerate(((STEEL, RUBY), (GOLD, EMER), (STEEL, SAPPH), (GOLD, VIOLET))):
        a = -30 + i * 20
        cx, cy = local(26, 56, a - 90, [(28, 0)])[0]
        tier_card(p, cx, cy, 16, 24, a, rp, NIGHT, gm)
    p.spark(46, 8)


# ---------------------------------------------------------------- wardrobe

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
            cx, cy = p.pt(x, y)
            put(V, cx, cy, DEEP)
    p.flat(V)


def pic_fashionista(p):
    # a hanger with a gold-trimmed cape
    Hk = p.layer()
    D(Hk).arc(p.E(21, 0, 31, 10), 180, 60, fill=STEEL[2], width=p.W(2.6))
    ln(Hk, p.P([(26, 9), (26, 13)]), STEEL[2], p.W(2.6))
    p.add(Hk, STEEL, d=1, glint=False)
    Bar = p.layer()
    poly(Bar, p.P([(26, 11), (49, 23), (47, 26), (26, 15), (5, 26), (3, 23)]), STEEL[2])
    p.add(Bar, STEEL, d=1, glint=False)
    Cp = p.layer()
    poly(Cp, p.P([(11, 21), (41, 21), (46, 50), (36, 46), (26, 51), (16, 46), (6, 50)]), CAPE[2])
    p.add(Cp, CAPE, d=p.W(6))
    Fd = p.layer()
    ln(Fd, p.P([(19, 27), (16, 45)]), CAPE[1], p.W(2))
    ln(Fd, p.P([(33, 27), (36, 45)]), CAPE[1], p.W(2))
    p.flat(Fd)
    Tr = p.layer()
    rect(Tr, *p.E(10, 20, 42, 25), GOLD[2])
    p.add(Tr, GOLD, d=1)
    gem(p, 26, 24, 6, 4, RUBY)
    p.spark(47, 36, big=True)


def pic_masterwork(p):
    # a hammer striking an anvil, sparks flying
    A = p.layer()
    poly(A, p.P([(2, 26), (40, 26), (50, 22), (46, 31), (37, 34), (32, 34), (34, 44), (40, 48), (10, 48), (16, 44), (18, 34), (8, 33)]), IRON[2])
    p.add(A, IRON, d=p.W(5))
    Tp = p.layer()
    rect(Tp, *p.E(3, 26, 40, 28.5), IRON[4])
    p.flat(Tp)
    H = p.layer()
    ln(H, p.P([(30, 22), (46, 2)]), WOOD[2], p.W(4))
    p.add(H, WOOD, d=1, glint=False)
    Hh = p.layer()
    poly(Hh, p.P(local(29, 16, 38, [(-8, -4.5), (8, -4.5), (8, 4.5), (-8, 4.5)])), STEEL[2])
    p.add(Hh, STEEL, d=p.W(3))
    for x, y, big in ((12, 14, True), (19, 7, False), (6, 22, False), (40, 32, False)):
        cx, cy = p.pt(x, y)
        plus(p.img, cx, cy, GOLD[4], arm=2 if big else 1, core=WHITE)


# ---------------------------------------------------------------- journey

def pic_skilled(p):
    # a little skill tree: four gem nodes on gold links
    nodes = [(26, 42), (11, 26), (41, 26), (26, 10)]
    Lk = p.layer()
    for a, b in ((0, 1), (0, 2), (1, 3), (2, 3), (0, 3)):
        ln(Lk, p.P([nodes[a], nodes[b]]), GOLD[2], p.W(3.2))
    p.add(Lk, GOLD, d=1, glint=False)
    for (x, y), rp, n, r in zip(nodes, (VIOLET, CRYS, RUBY, GOLD), (8, 6, 6, 5), (8, 6.5, 6.5, 7.5)):
        Bz = p.layer()
        ell(Bz, *p.E(x - r - 1.5, y - r - 1.5, x + r + 1.5, y + r + 1.5), IRON[2])
        p.add(Bz, IRON, d=1, glint=False)
        if n == 5:
            star_gem(p, x, y, r, r * 0.45, rp)
        else:
            gem(p, x, y, n, r, rp, table=0.45 if n == 8 else 0)


def pic_first_ascension(p):
    # a gold arrow rising on white wings
    for sg in (1, -1):
        Wg = p.layer()
        pts = [(4, 16), (12, 14), (21, 22), (23, 38), (17, 40), (14, 35), (10, 34), (8, 28), (4, 26), (2, 20)]
        pts = [(26 + (x - 26) * 1, y) if sg == 1 else (52 - x, y) for x, y in pts]
        poly(Wg, p.P(pts), FEATHER[2])
        p.add(Wg, FEATHER, d=p.W(4))
        Fd = p.layer()
        for a, b in (((8, 23), (19, 27)), ((11, 30), (20, 32))):
            if sg == -1:
                a, b = (52 - a[0], a[1]), (52 - b[0], b[1])
            ln(Fd, p.P([a, b]), FEATHER[1])
        p.flat(Fd)
    Ar = p.layer()
    poly(Ar, p.P([(26, 1), (39, 16), (31, 16), (31, 50), (21, 50), (21, 16), (13, 16)]), GOLD[2])
    p.add(Ar, GOLD, d=p.W(4))
    gem(p, 26, 30, 4, 3.6, SAPPH, rot_=0)
    p.spark(44, 5, big=True)


def pic_night_owl(p):
    M = p.layer()
    ell(M, *p.E(2, 4, 46, 48), MOON[2])
    ell(M, *p.E(15, -6, 60, 38), CLEAR)
    p.add(M, MOON, d=p.W(5))
    Cr = p.layer()
    ell(Cr, *p.E(7, 24, 12, 29), MOON[1])
    ell(Cr, *p.E(14, 38, 19, 42), MOON[1])
    p.flat(Cr)
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
    p.spark(10, 8)


PICTURES = {
    "first_harvest": pic_first_harvest,
    "first_kill": pic_first_kill,
    "lumberjack_1": pic_lumberjack_1,
    "lumberjack_2": pic_lumberjack_2,
    "prospector_1": pic_prospector_1,
    "prospector_2": pic_prospector_2,
    "tree_hugger": pic_tree_hugger,
    "deep_delver": pic_deep_delver,
    "giant_slayer_1": pic_giant_slayer_1,
    "giant_slayer_2": pic_giant_slayer_2,
    "giant_slayer_3": pic_giant_slayer_3,
    "glimmer_seeker": pic_glimmer_seeker,
    "first_summon": pic_first_summon,
    "ten_pulls": pic_ten_pulls,
    "pity_breaker": pic_pity_breaker,
    "silver_lining": pic_silver_lining,
    "golden_hour": pic_golden_hour,
    "six_stars": pic_six_stars,
    "prismatic_dawn": pic_prismatic_dawn,
    "full_loadout": pic_full_loadout,
    "dressed_up": pic_dressed_up,
    "fashionista": pic_fashionista,
    "skilled": pic_skilled,
    "first_ascension": pic_first_ascension,
    "night_owl": pic_night_owl,
    "first_milestone": pic_first_milestone,
    "gem_adept": pic_gem_adept,
    "medalist": pic_medalist,
    "masterwork": pic_masterwork,
}


def picture(aid: str):
    """The achievement's picture, centred (by its opaque box) on a PIC x PIC canvas."""
    p = Pic()
    PICTURES[aid](p)
    img = p.done()
    bb = img.getbbox()
    src = img.crop(bb)
    out = new(PIC, PIC)
    out.alpha_composite(src, ((PIC - src.width) // 2, (PIC - src.height) // 2))
    return out
