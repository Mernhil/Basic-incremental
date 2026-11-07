"""B3 Heartwood Halo (border, Moonwood Dryad, Mythic: 5 levels) and B4 Core Pulse (finish, Core
Titan, Exotic: 6 levels). Both cards are Prismatic 6 stars (card-exclusive wear rank)."""
import math

import card as K
from b2_verdant import leaf, spiral
from px import *  # noqa: F403

HEART = ramp("#a8452f")
BARKM = ramp("#a59ccc")
MGOLD = ramp("#f2d27a")
MSTONE = ramp("#bfe2ff")
LUNA = ramp("#9fe6c4")
PINKN = ramp("#ff5fc0")
ORANGE = ramp("#ff8a1f")
VIOLET = ramp("#9b5cff")
HOTC = ramp("#ffd166")

B3 = {
    "A": dict(name="Crescent cradles", glow=H("#ffd6f0")),
    "B": dict(name="Moonwood antlers", glow=H("#e3dcff")),
    "C": dict(name="Growth rings", glow=H("#ffd2c0")),
    "D": dict(name="Luna moths", glow=H("#d0ffe8")),
    "E": dict(name="Moon wreath", glow=H("#fff1c0")),
}


def arc(img, cx, cy, r, a0, a1, col, w=2):
    D(img).arc([cx - r, cy - r, cx + r, cy + r], a0, a1, fill=col, width=w)


def halo_flourish(opt, lvl):
    g = new(52, 62)
    if opt == "A":
        S = new(52, 62)
        ell(S, 0, 0, 22, 22, HEART[2])
        ell(S, 5, 5, 27, 27, CLEAR)
        ell(S, 1, 1, 12, 12, HEART[3])
        ell(S, 4, 4, 27, 27, CLEAR)
        part(g, S, do_bevel=False)
        S2 = new(52, 62)
        poly(S2, [(19, 12), (36, 9), (24, 15)], HEART[2])
        poly(S2, [(12, 19), (9, 40), (15, 24)], HEART[2])
        part(g, S2, do_bevel=False)
        if lvl >= 2:
            arc(g, 11, 11, 9, 190, 260, MGOLD[3], 1)
            ln(g, [(22, 11), (33, 9)], MGOLD[3])
            ln(g, [(11, 22), (9, 37)], MGOLD[3])
        if lvl >= 3:
            G = new(52, 62)
            for cx, cy, r in ((4, 16, 2.6), (16, 4, 2.6), (6, 6, 3.4)):
                facet_gem(G, ngon(cx, cy, 6, r), MSTONE, cx, cy, table=0)
            part(g, G, do_bevel=False)
    elif opt == "B":
        S = new(52, 62)
        ln(S, [(16, 16), (9, 9), (3, 3)], BARKM[2], 2)
        ln(S, [(9, 9), (5, 14), (3, 20)], BARKM[2], 1)
        ln(S, [(9, 9), (14, 5), (20, 3)], BARKM[2], 1)
        ln(S, [(16, 14), (27, 12), (38, 8)], BARKM[2], 2)
        ln(S, [(27, 12), (30, 5)], BARKM[2], 1)
        ln(S, [(14, 16), (12, 30), (8, 46)], BARKM[2], 2)
        ln(S, [(12, 30), (5, 33)], BARKM[2], 1)
        part(g, S, do_bevel=False)
        if lvl >= 2:
            L = new(52, 62)
            for b, t in (((30, 5), (34, 1)), ((5, 33), (2, 38)), ((38, 8), (43, 7)), ((20, 3), (25, 2))):
                leaf(L, b, t, 1.8, MGOLD, rib=False)
            part(g, L, do_bevel=False)
        if lvl >= 3:
            G = new(52, 62)
            for cx, cy in ((3, 3), (20, 13), (13, 22)):
                facet_gem(G, ngon(cx, cy, 6, 2.6), MSTONE, cx, cy, table=0)
            part(g, G, do_bevel=False)
    elif opt == "C":
        S = new(52, 62)
        for r, tone in ((20, HEART[1]), (16, HEART[2]), (12, HEART[3]), (8, HEART[2])):
            arc(S, 13, 13, r, 180, 270, tone, 2)
        ln(S, [(13, 13), (5, 5)], HEART[0], 1)
        part(g, S, do_bevel=False)
        if lvl >= 2:
            arc(g, 13, 13, 14, 185, 265, MGOLD[3], 1)
            arc(g, 13, 13, 22, 200, 250, MGOLD[2], 1)
        if lvl >= 3:
            G = new(52, 62)
            facet_gem(G, ngon(5, 5, 8, 3.4), MSTONE, 5, 5, table=0)
            part(g, G, do_bevel=False)
    elif opt == "D":
        S = new(52, 62)
        for wing in ([(13, 13), (2, 4), (8, -1 + 1), (20, 6)], [(13, 13), (4, 2), (-1 + 1, 8), (6, 20)]):
            poly(S, wing, LUNA[2])
        poly(S, [(13, 13), (6, 6), (14, 3)], LUNA[3])
        poly(S, [(13, 13), (6, 6), (3, 14)], LUNA[3])
        poly(S, [(14, 14), (6, 24), (3, 30), (10, 26)], LUNA[2])
        poly(S, [(14, 14), (24, 6), (30, 3), (26, 10)], LUNA[2])
        part(g, S, do_bevel=False)
        if lvl >= 2:
            for cx, cy in ((9, 3), (3, 9)):
                ell(g, cx - 1, cy - 1, cx + 1, cy + 1, PINKN[2])
            for cx, cy in ((24, 7), (7, 24)):
                put(g, cx, cy, MGOLD[3])
                put(g, cx + 1, cy, MGOLD[3])
        if lvl >= 3:
            G = new(52, 62)
            facet_gem(G, [(10, 10), (15, 13), (16, 16), (13, 15)], MSTONE, table=0)
            facet_gem(G, ngon(10, 10, 6, 2.2), MSTONE, 10, 10, table=0)
            part(g, G, do_bevel=False)
    elif opt == "E":
        S = new(52, 62)
        arc(S, 16, 16, 13, 180, 270, MSTONE[3], 2)
        part(g, S, do_bevel=False)
        L = new(52, 62)
        for i in range(6):
            a = math.radians(185 + i * 15)
            x, y = 16 + 13 * math.cos(a), 16 + 13 * math.sin(a)
            leaf(L, (x, y), (x + 5 * math.cos(a - 1.2), y + 5 * math.sin(a - 1.2)), 1.7, ramp("#5fae6a"), rib=False)
        ln(L, [(18, 4), (34, 8)], ramp("#5fae6a")[2], 1)
        ln(L, [(4, 18), (8, 44)], ramp("#5fae6a")[2], 1)
        part(g, L, do_bevel=False)
        if lvl >= 2:
            M = new(52, 62)
            ell(M, 2, 2, 9, 9, MGOLD[2])
            ell(M, 4, 1, 11, 8, CLEAR)
            g.alpha_composite(M)
            for x, y in ((24, 6), (28, 7), (6, 26), (7, 32)):
                put(g, x, y, MGOLD[3])
        if lvl >= 3:
            G = new(52, 62)
            for cx, cy in ((34, 8), (8, 44)):
                facet_gem(G, ngon(cx, cy, 6, 2.4), PINKN, cx, cy, table=0)
            part(g, G, do_bevel=False)
    return g


def halo_layer(opt, lvl):
    layer = K.place_corners(halo_flourish(opt, lvl))
    outline(layer)
    if lvl >= 4:
        ring(layer, B3[opt]["glow"])
    return layer


def halo_card(opt, lvl):
    base = K.panels(H("#1d0d19"), H("#4a1d2a"), H("#1a0c14"), H("#120a10"), H("#7a3a4e"), PINKN[2])
    top = K.top("frame-prismatic", halo_layer(opt, lvl), 6, 6)
    return base, top


def mote(col):
    p = new(5, 5)
    plus(p, 2, 2, col, core=WHITE)
    return p


# ---------------- B4 Core Pulse ----------------

B4 = {
    "A": dict(name="Pulse rings"),
    "B": dict(name="Power veins"),
    "C": dict(name="Hex core"),
    "D": dict(name="Magma strata"),
    "E": dict(name="Starburst"),
}
WIN = H("#140a06")
CX, CY = 91, 112


def pulse_layer(opt, lvl, phase=None):
    """Finish at a level. phase (0..2) draws one ambient frame of the max-level animation."""
    f = new(K.W, K.Hh)
    t = 0.26 if lvl < 5 else 0.42
    c = mix(WIN, ORANGE[2], t)
    c2 = mix(WIN, ORANGE[2], t * 0.6)
    acc = mix(WIN, VIOLET[3], 0.55 if lvl < 5 else 0.75)
    x0, y0, x1, y1 = K.WINDOW
    rr = rng(5)
    if opt == "A":
        radii = [18, 30] if lvl < 2 else [12, 18, 24, 30, 38, 46]
        for i, r in enumerate(radii):
            col = acc if (lvl >= 3 and i < 2) else (c if i % 2 == 0 else c2)
            if phase is not None:
                col = c if (i % 3) == phase else c2
            D(f).ellipse([CX - r, CY - r, CX + r, CY + r], outline=col)
        if lvl >= 2:
            for r in (8, 14):
                D(f).ellipse([CX - r * 3, 178 - r, CX + r * 3, 178 + r], outline=c2)
        if lvl >= 4:
            for a in range(4):
                ang = math.pi / 4 + a * math.pi / 2
                x, y = CX + 30 * math.cos(ang), CY + 30 * math.sin(ang)
                G = new(K.W, K.Hh)
                facet_gem(G, ngon(x, y, 4, 2.6, rot=0), HOTC, x, y, table=0)
                outline(G)
                f.alpha_composite(G)
    elif opt == "B":
        branches = 6 if lvl < 2 else 11
        for b in range(branches):
            ang = rr.uniform(0, 2 * math.pi)
            x, y = CX, CY
            pts = [(x, y)]
            for s in range(rr.randint(8, 14)):
                ang += rr.uniform(-0.6, 0.6)
                x += 4 * math.cos(ang)
                y += 4 * math.sin(ang)
                pts.append((x, y))
            col = c if phase is None else (c if b % 3 == phase else c2)
            ln(f, pts, col)
            if lvl >= 3:
                ln(f, pts[:3], acc)
            if lvl >= 4:
                jx, jy = pts[len(pts) // 2]
                ell(f, jx - 1, jy - 1, jx + 1, jy + 1, HOTC[3])
                put(f, round(jx) - 1, round(jy) - 1, WHITE)
    elif opt == "C":
        s = 7
        for row in range(-3, 20):
            for col_ in range(-2, 12):
                hx = x0 + col_ * s * 1.5 * 1.0 + 4
                hy = y0 + row * s * 1.73 + (s * 0.866 if col_ % 2 else 0)
                if lvl < 2 and math.hypot(hx - CX, hy - CY) > 40:
                    continue
                d = math.hypot(hx - CX, hy - CY)
                colr = c2
                if lvl >= 3 and d < 18:
                    colr = acc
                if phase is not None and int(d / 12) % 3 == phase:
                    colr = c
                D(f).polygon(ngon(hx, hy, 6, s, rot=0), outline=colr)
        if lvl >= 4:
            G = new(K.W, K.Hh)
            facet_gem(G, ngon(CX, CY, 6, 6, rot=0), HOTC, CX, CY, table=0)
            outline(G)
            f.alpha_composite(G)
    elif opt == "D":
        bands = range(y1 - 4, y0 + 30 if lvl >= 2 else y1 - 40, -8)
        for i, by in enumerate(bands):
            col = c if i % 2 == 0 else c2
            if lvl >= 3 and i == 0:
                col = acc
            for x in range(x0, x1 + 1):
                put(f, x, by + round(2 * math.sin(x / 9 + i)), col)
        if lvl >= 2:
            for x in range(K.STATS[0], K.STATS[2] + 1):
                put(f, x, K.STATS[3] - 4 + round(math.sin(x / 7)), c2)
        if lvl >= 4:
            for x, y in ((50, 150), (120, 146), (88, 152)):
                G = new(K.W, K.Hh)
                facet_gem(G, ngon(x, y, 4, 2.4, rot=0), HOTC, x, y, table=0)
                outline(G)
                f.alpha_composite(G)
        if phase is not None:
            for k in range(8):
                x = x0 + 8 + k * 14
                y = y1 - 12 - ((k * 7 + phase * 10) % 40)
                put(f, x, y, ORANGE[3])
                put(f, x, y - 1, ORANGE[4])
    elif opt == "E":
        n = 12 if lvl < 2 else 24
        for i in range(n):
            a = i * 2 * math.pi / n + (math.pi / n if phase == 1 else 0)
            colr = acc if (lvl >= 3 and i % 4 == 0) else c if i % 2 == 0 else c2
            for r in range(10, 70, 2 if lvl >= 2 else 3):
                put(f, round(CX + r * math.cos(a)), round(CY + r * math.sin(a)), colr)
        if lvl >= 4:
            G = new(K.W, K.Hh)
            facet_gem(G, star_pts(CX, CY, 4, 8, 3), HOTC, CX, CY, table=0)
            outline(G)
            f.alpha_composite(G)
    K.clip_body(f)
    for y in range(K.Hh):
        for x in range(K.W):
            if not (K.in_window(x, y, 1) or (K.STATS[0] < x < K.STATS[2] and K.STATS[1] < y < K.STATS[3])):
                f.putpixel((x, y), CLEAR)
    if lvl >= 5:
        # glow: a one-pixel bright core on every pattern pixel next to the centre
        px_ = f.load()
        for y in range(K.Hh):
            for x in range(K.W):
                if px_[x, y][3] and math.hypot(x - CX, y - CY) < 22 and px_[x, y][:3] not in ((255, 255, 255),):
                    px_[x, y] = mix(px_[x, y], ORANGE[4], 0.5)
    return f


def pulse_card(opt, lvl):
    base = K.panels(H("#1f1108"), H("#3a1f0c"), H("#1a0e06"), WIN, H("#7a4a20"), ORANGE[2])
    base.alpha_composite(pulse_layer(opt, lvl))
    top = K.top("frame-prismatic", None, 6, 6)
    return base, top
