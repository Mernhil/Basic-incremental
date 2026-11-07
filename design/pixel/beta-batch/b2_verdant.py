"""B2 Verdant Reverie: five set options. Border flourishes and finish on a card at L1 / L3 / L5,
plus attack, tick, numbers, table and cursor items at the same levels.

Assumption: Verdant Reverie is Legendary (max level 5, DESIGN 11.1), so the ladder is
L1 shape, L2 accent colour, L3 gems, L4 glow, L5 ambient (drifting petals).
"""
import math

import card as K
from glyphs import numeral
from px import *  # noqa: F403

LEAF = ramp("#4caf3a")
LIME = ramp("#a6dc3c")
MOSS = ramp("#6f8f2c")
FERN = ramp("#2f9c6a")
VINE = ramp("#4f7d28")
BARK = ramp("#8a5a36")
PINK = ramp("#ffb3cf")
CREAM = ramp("#f2a65a")
EMER = ramp("#25c873")
AMBER = ramp("#f0b33a")
ROSE = ramp("#ff7fae")
DEW = ramp("#8fe3f0")

OPTS = {
    "A": dict(name="Leaf crown", glow=H("#c9ffb8"), plate=H("#2f6b2a"), panel=H("#14261a"), window=H("#0e1a12"), line=H("#7fc25a"), petal=PINK),
    "B": dict(name="Vine wrap", glow=H("#d8f7a0"), plate=H("#5a3d24"), panel=H("#1c1710"), window=H("#11140e"), line=H("#8fb04a"), petal=LEAF),
    "C": dict(name="Fern fronds", glow=H("#b5ffe0"), plate=H("#1f5a4a"), panel=H("#0f2420"), window=H("#0b1816"), line=H("#5fd0a0"), petal=FERN),
    "D": dict(name="Moss and mushrooms", glow=H("#e6ffb0"), plate=H("#4d5f20"), panel=H("#1a1f0e"), window=H("#12160b"), line=H("#a8c24a"), petal=ramp("#e8f2c0")),
    "E": dict(name="Blossom branch", glow=H("#ffe0ee"), plate=H("#3d6b34"), panel=H("#1e1a1c"), window=H("#151215"), line=H("#f29cc0"), petal=PINK),
}


def spiral(img, cx, cy, r0, r1, turns, col, w=1, start=0.0, sign=1):
    pts = []
    n = int(30 * turns)
    for i in range(n + 1):
        t = i / n
        a = start + sign * t * turns * 2 * math.pi
        r = r0 + (r1 - r0) * t
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    ln(img, pts, col, w)


def frond(img, base, tip, rp, n=6, size=5.0, bend=0.0):
    bx, by = base
    tx, ty = tip
    L = math.hypot(tx - bx, ty - by)
    ux, uy = (tx - bx) / L, (ty - by) / L
    nx, ny = -uy, ux
    spine = []
    for i in range(21):
        t = i / 20
        off = math.sin(math.pi * t) * bend
        spine.append((bx + ux * L * t + nx * off, by + uy * L * t + ny * off))
    for i in range(n):
        t = 0.15 + 0.8 * i / n
        sx, sy = spine[int(t * 20)]
        s = size * (1 - t * 0.7)
        side = 1 if i % 2 == 0 else -1
        lx, ly = sx + (ux * 0.6 + nx * side) * s, sy + (uy * 0.6 + ny * side) * s
        leaf(img, (sx, sy), (lx, ly), max(1.2, s * 0.35), rp, rib=False)
    ln(img, spine, rp[1], 1)


# ---------- border flourishes (top-left corner; card corner at (12, 12)) ----------

def flourish(opt, lvl):
    g = new(52, 62)
    if opt == "A":
        L1 = new(52, 62)
        leaf(L1, (15, 14), (37, 8), 3.6, LEAF)
        leaf(L1, (14, 15), (8, 47), 3.6, LEAF)
        part(g, L1, do_bevel=False)
        L2 = new(52, 62)
        leaf(L2, (16, 16), (3, 3), 4.6, LEAF)
        part(g, L2, do_bevel=False)
        if lvl >= 2:
            L3 = new(52, 62)
            leaf(L3, (16, 15), (25, 3), 2.6, LIME)
            leaf(L3, (15, 16), (3, 25), 2.6, LIME)
            part(g, L3, do_bevel=False)
            dew(g, 30, 10, 2)
            dew(g, 10, 36, 2)
        if lvl >= 3:
            G = new(52, 62)
            facet_gem(G, ngon(8, 8, 8, 3.6), EMER, 8, 8, table=0)
            part(g, G, do_bevel=False)
    elif opt == "B":
        S = new(52, 62)
        ln(S, [(38, 15), (24, 15), (18, 14), (14, 11), (10, 8)], VINE[2], 2)
        ln(S, [(15, 18), (15, 30), (14, 40), (15, 49)], VINE[2], 2)
        spiral(S, 7, 7, 4.5, 1.2, 1.1, VINE[2], 2, start=math.pi * 0.25)
        for b, t in (((30, 15), (34, 8)), ((22, 15), (25, 21)), ((15, 27), (8, 30)), ((15, 40), (21, 44))):
            leaf(S, b, t, 2.2, LEAF, rib=False)
        part(g, S, do_bevel=False)
        if lvl >= 2:
            T = new(52, 62)
            spiral(T, 36, 9, 3.2, 0.8, 1.0, LIME[3], 1, start=math.pi)
            spiral(T, 8, 40, 3.2, 0.8, 1.0, LIME[3], 1, start=0)
            ln(T, [(36, 12), (36, 15)], LIME[3])
            ln(T, [(11, 40), (14, 40)], LIME[3])
            g.alpha_composite(T)
        if lvl >= 3:
            for x, y in ((26, 12), (12, 33), (7, 7)):
                dew(g, x, y, 2, ramp("#e8fff4"))
    elif opt == "C":
        F = new(52, 62)
        frond(F, (15, 15), (39, 5), FERN, n=7, size=6, bend=-2)
        frond(F, (15, 15), (5, 49), FERN, n=8, size=6, bend=2)
        frond(F, (15, 15), (3, 3), FERN, n=4, size=4.5)
        part(g, F, do_bevel=False)
        if lvl >= 2:
            T = new(52, 62)
            spiral(T, 24, 6, 3.0, 0.6, 1.1, AMBER[3], 1, start=math.pi * 0.5)
            spiral(T, 6, 24, 3.0, 0.6, 1.1, AMBER[3], 1, start=math.pi)
            g.alpha_composite(T)
        if lvl >= 3:
            G = new(52, 62)
            facet_gem(G, ngon(13, 13, 6, 3.4, rot=0), AMBER, 13, 13, table=0)
            part(g, G, do_bevel=False)
    elif opt == "D":
        M = new(52, 62)
        for cx, cy, r in ((13, 13, 7), (22, 11, 5), (11, 22, 5), (30, 13, 3.5), (12, 31, 3.5), (5, 6, 3)):
            ell(M, cx - r, cy - r, cx + r, cy + r, MOSS[2])
            ell(M, cx - r + 1, cy - r + 1, cx + r * 0.2, cy + r * 0.2, MOSS[3])
        rr = rng(7)
        for _ in range(26):
            x, y = rr.randint(4, 33), rr.randint(4, 33)
            if M.getpixel((x, y))[3] and M.getpixel((x + 1, y))[3]:
                put(M, x, y, MOSS[1])
                put(M, x + 1, y, MOSS[1])
        part(g, M, do_bevel=False)
        if lvl >= 2:
            Mu = new(52, 62)
            for cx, cy in ((24, 4), (4, 23)):
                rect(Mu, cx - 1, cy + 1, cx + 1, cy + 4, H("#f3e6c8"))
                ell(Mu, cx - 4, cy - 2, cx + 4, cy + 2, CREAM[2])
                rect(Mu, cx - 4, cy + 1, cx + 4, cy + 2, CLEAR)
                ell(Mu, cx - 3, cy - 2, cx, cy, CREAM[3])
                put(Mu, cx + 2, cy - 1, H("#fff1d8"))
            part(g, Mu, do_bevel=False)
        if lvl >= 3:
            G = new(52, 62)
            facet_gem(G, ngon(14, 14, 4, 3.4, rot=0), EMER, 14, 14, table=0)
            facet_gem(G, ngon(27, 9, 4, 2.2, rot=0), EMER, 27, 9, table=0)
            part(g, G, do_bevel=False)
    elif opt == "E":
        B = new(52, 62)
        ln(B, [(17, 17), (11, 11), (4, 4)], BARK[2], 2)
        ln(B, [(16, 15), (26, 13), (37, 11)], BARK[2], 2)
        ln(B, [(15, 16), (13, 28), (10, 45)], BARK[2], 2)
        ln(B, [(26, 13), (29, 8)], BARK[2], 1)
        part(g, B, do_bevel=False)
        Lf = new(52, 62)
        for b, t in (((22, 14), (24, 20)), ((33, 12), (37, 6)), ((14, 24), (8, 26)), ((12, 37), (17, 40)), ((8, 8), (3, 12))):
            leaf(Lf, b, t, 2.0, LEAF, rib=False)
        part(g, Lf, do_bevel=False)
        if lvl >= 2:
            Bl = new(52, 62)
            for cx, cy in ((6, 5), (30, 8), (11, 34)):
                blossom(Bl, cx, cy, 3.2, PINK)
            for cx, cy in ((37, 11), (10, 44)):
                ell(Bl, cx - 1, cy - 1, cx + 1, cy + 1, ROSE[2])
            part(g, Bl, do_bevel=False)
        if lvl >= 3:
            G = new(52, 62)
            facet_gem(G, ngon(17, 17, 6, 3.2), ROSE, 17, 17, table=0)
            part(g, G, do_bevel=False)
    return g


def border_layer(opt, lvl):
    layer = K.place_corners(flourish(opt, lvl))
    outline(layer)
    if lvl >= 4:
        ring(layer, OPTS[opt]["glow"])
        for x, y in ((14, 30), (168, 30), (14, 205), (168, 205)):
            plus(layer, x, y, WHITE)
    return layer


# ---------- finish (under the item, over the panels; never over the stars band) ----------

def finish_layer(opt, lvl):
    o = OPTS[opt]
    f = new(K.W, K.Hh)
    w0, w1 = o["window"], o["line"]
    t = 0.22 if lvl < 4 else 0.36
    c = mix(w0, w1, t)
    c2 = mix(w0, w1, t * 0.6)
    x0, y0, x1, y1 = K.WINDOW
    rr = rng(11)
    if opt == "A":
        for k in range(-120, 140, 12):
            for x in range(x0, x1 + 1):
                for yy in (k + (x - x0) // 2, k + 60 - (x - x0) // 2):
                    if K.in_window(x, yy):
                        put(f, x, yy, c)
        if lvl >= 3:
            for x, y in ((50, 80), (110, 92), (80, 128), (130, 140), (45, 140)):
                dew(f, x, y, 1, DEW)
    elif opt == "B":
        for sx, ln_ in ((44, 50), (70, 26), (118, 62), (138, 34)):
            pts = [(sx + round(2 * math.sin(i / 5)), y0 + 1 + i) for i in range(ln_)]
            for p in pts:
                put(f, *p, c)
            for i in range(6, ln_, 9):
                x, y = pts[i]
                d = 1 if (i // 9) % 2 else -1
                put(f, x + d, y, c)
                put(f, x + 2 * d, y - 1, c)
                put(f, x + d, y - 1, c2)
            if lvl >= 3:
                dew(f, pts[-1][0], pts[-1][1] + 2, 1, DEW)
    elif opt == "C":
        for _ in range(16):
            x, y = rr.randint(x0 + 4, x1 - 8), rr.randint(y0 + 4, y1 - 6)
            ell(f, x, y, x + rr.choice((4, 5, 6)), y + rr.choice((2, 3)), c2)
            rect(f, x + 1, y + 1, x + 2, y + 1, c)
        if lvl >= 3:
            for _ in range(10):
                plus(f, rr.randint(x0 + 3, x1 - 3), rr.randint(y0 + 3, y1 - 3), AMBER[3] if lvl < 4 else AMBER[4])
    elif opt == "D":
        for cx, cy, r in ((x0 + 4, y1 - 3, 9), (x0 + 16, y1 - 1, 6), (x1 - 4, y1 - 3, 10), (x1 - 18, y1 - 1, 5), (x0 + 2, y1 - 18, 4), (x1 - 2, y1 - 20, 5)):
            ell(f, cx - r, cy - r, cx + r, cy + r, c2)
            ell(f, cx - r + 2, cy - r + 1, cx, cy - 1, c)
        for _ in range(40):
            x, y = rr.randint(K.CARD[0] + 3, K.CARD[2] - 3), rr.randint(K.STATS[1] + 2, K.STATS[3] - 2)
            put(f, x, y, mix(o["panel"], o["line"], 0.3))
        if lvl >= 3:
            for x, y in ((x0 + 8, y1 - 10), (x1 - 9, y1 - 12), (x1 - 22, y1 - 6)):
                rect(f, x, y + 1, x, y + 2, H("#f3e6c8"))
                rect(f, x - 1, y, x + 1, y, EMER[3] if lvl < 4 else EMER[4])
    elif opt == "E":
        for gy in range(y0 + 8, y1, 20):
            for gx in range(x0 + 8 + (10 if (gy // 20) % 2 else 0), x1 - 4, 20):
                for i in range(5):
                    a = -math.pi / 2 + i * 2 * math.pi / 5
                    put(f, gx + round(2 * math.cos(a)), gy + round(2 * math.sin(a)), c)
                if lvl >= 3:
                    put(f, gx, gy, ROSE[3] if lvl < 4 else ROSE[4])
    K.clip_body(f)
    for y in range(K.Hh):
        for x in range(K.W):
            if not K.in_window(x, y, 1) and not (K.STATS[1] < y < K.STATS[3]):
                f.putpixel((x, y), CLEAR)
    return f


def card(opt, lvl):
    o = OPTS[opt]
    base = K.panels(H("#2c1a4f"), o["plate"], o["panel"], o["window"], o["line"])
    base.alpha_composite(finish_layer(opt, lvl))
    top = K.top("frame-prismatic", border_layer(opt, lvl), n_stars=6, lit=3)
    return base, top


def petal(opt):
    o = OPTS[opt]
    p = new(7, 7)
    rp = o["petal"]
    if opt in ("A", "E"):
        ell(p, 1, 2, 5, 5, rp[2])
        ell(p, 1, 2, 3, 4, rp[3])
        put(p, 4, 1, rp[3])
    elif opt in ("B", "C"):
        leaf(p, (1, 5), (5, 1), 1.6, rp, rib=False)
    else:
        ell(p, 2, 2, 4, 4, rp[3])
        put(p, 3, 3, WHITE)
    outline(p)
    return p


# ---------- global slot items ----------

STROKE = {"A": (LEAF, LIME), "B": (VINE, LIME), "C": (FERN, ramp("#9ff5c8")), "D": (MOSS, ramp("#e8f2a0")), "E": (PINK, ramp("#fff0f6"))}


def bez(p0, p1, p2, t):
    return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])


def stroke(img, t0, t1, width, rp_body, rp_core):
    p0, p1, p2 = (8, 54), (22, 18), (58, 9)
    left, right, cl, cr = [], [], [], []
    for i in range(41):
        t = t0 + (t1 - t0) * i / 40
        x, y = bez(p0, p1, p2, t)
        x2, y2 = bez(p0, p1, p2, min(1, t + 0.01))
        dx, dy = x2 - x, y2 - y
        d = math.hypot(dx, dy) or 1
        nx, ny = -dy / d, dx / d
        u = (t - t0) / max(1e-6, t1 - t0)
        w = width * math.sin(math.pi * u) ** 0.8
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w * 0.6, y - ny * w * 0.6))
        cl.append((x + nx * w * 0.35, y + ny * w * 0.35))
        cr.append((x - nx * w * 0.2, y - ny * w * 0.2))
    poly(img, left + right[::-1], rp_body[3])
    poly(img, cl + cr[::-1], rp_core[4])


def motif(img, opt, x, y, s=1.0, alt=0):
    if opt == "A":
        leaf(img, (x, y), (x + 4 * s, y - 3 * s * (1 if alt % 2 else -1)), 1.6 * s, LEAF, rib=False)
    elif opt == "B":
        spiral(img, x, y, 2.6 * s, 0.5, 1.0, VINE[3], 1, start=alt)
    elif opt == "C":
        frond(img, (x, y), (x + 6 * s, y - 4 * s), FERN, n=3, size=3 * s)
    elif opt == "D":
        ell(img, x - 1, y - 1, x + 1 + s, y + 1 + s, MOSS[3])
        put(img, x, y, ramp("#e8f2a0")[4])
    elif opt == "E":
        ell(img, x, y, x + 2 + s, y + 1 + s, PINK[3])
        put(img, x, y, PINK[4])


def attack_frames(opt, lvl):
    body, core = STROKE[opt]
    frames = []
    specs = [(0.0, 0.35, 2.5), (0.0, 1.0, 3.2), (0.3, 1.0, 2.2), (0.65, 1.0, 1.3)]
    for fi, (t0, t1, w) in enumerate(specs):
        f = new(64, 64)
        s = new(64, 64)
        stroke(s, t0, t1, w, body, core)
        if fi >= 1:
            for k in range(3):
                tt = 0.25 + 0.2 * k
                x, y = bez((8, 54), (22, 18), (58, 9), tt)
                ln(s, [(x + 3, y + 5), (x + 9, y + 2)], body[2])
        outline(s)
        f.alpha_composite(s)
        if lvl >= 3 and fi >= 1:
            M = new(64, 64)
            pts = [(40, 26), (30, 36), (47, 18), (24, 44)]
            for i, (x, y) in enumerate(pts[: fi + 1]):
                motif(M, opt, x + fi * 3, y + fi * 2, 1.0, i)
            outline(M)
            f.alpha_composite(M)
        if lvl >= 4 and fi == 1:
            ring(f, OPTS[opt]["glow"])
        if lvl >= 5 and fi >= 2:
            P = new(64, 64)
            pt = petal(opt)
            for i, (x, y) in enumerate(((44, 30), (50, 36), (36, 40))):
                P.alpha_composite(pt, (x + fi * 2, y + fi * 3 - 6))
            f.alpha_composite(P)
        frames.append(f)
    return frames


def tick(opt, lvl):
    body, core = STROKE[opt]
    img = new(64, 34)
    n = numeral("-482", body if opt != "E" else ROSE, scale=2, bold=True)
    img.alpha_composite(n, (6, 6))
    if lvl >= 2:
        M = new(64, 34)
        motif(M, opt, 52, 10, 1.0, 0)
        outline(M)
        img.alpha_composite(M)
    if lvl >= 3:
        dew(img, 4, 6, 2, DEW)
    ring(img, WHITE)
    if lvl >= 4:
        ring(img, OPTS[opt]["glow"])
    if lvl >= 5:
        img.alpha_composite(petal(opt), (52, 24))
    return img


def numbers(opt, lvl):
    body, core = STROKE[opt]
    img = new(48, 14)
    n = numeral("12.4K", body if opt != "E" else ROSE, scale=1, bold=True, shadow=True)
    img.alpha_composite(n, (2, 2))
    if lvl >= 3:
        put(img, 44, 2, WHITE)
        put(img, 43, 3, DEW[3])
    if lvl >= 4:
        ring(img, mix(OPTS[opt]["glow"], H("#000000"), 0.55))
    return img


def table(opt, lvl):
    o = OPTS[opt]
    w, h = 96, 48
    img = new(w, h)
    base = {"A": H("#173220"), "B": H("#2b2116"), "C": H("#10302a"), "D": H("#283014"), "E": H("#2a2228")}[opt]
    rect(img, 0, 0, w - 1, h - 1, base)
    c = mix(base, o["line"], 0.18)
    rr = rng(3)
    if opt == "A":
        for k in range(-48, 96, 16):
            for x in range(w):
                put(img, x, k + x // 2, c)
                put(img, x, k + 40 - x // 2, c)
    elif opt == "B":
        for y in range(0, h, 6):
            for x in range(w):
                if (x + y * 3) % 17 < 9:
                    put(img, x, y + (x // 8) % 2, c)
    elif opt == "C":
        for _ in range(9):
            x, y = rr.randint(0, w - 10), rr.randint(4, h - 2)
            frond(img, (x, y), (x + 10, y - 6), [mix(base, o["line"], 0.12)] * 2 + [c] * 3, n=4, size=4)
    elif opt == "D":
        for _ in range(110):
            x, y = rr.randint(0, w - 2), rr.randint(0, h - 2)
            rect(img, x, y, x + 1, y, c)
    elif opt == "E":
        for gy in range(6, h, 14):
            for gx in range(6 + (7 if (gy // 14) % 2 else 0), w, 14):
                for i in range(5):
                    a = -math.pi / 2 + i * 2 * math.pi / 5
                    put(img, gx + round(2 * math.cos(a)), gy + round(2 * math.sin(a)), c)
    if lvl >= 2:
        for x, y in ((14, 12), (60, 30), (80, 8), (34, 38)):
            M = new(w, h)
            motif(M, opt, x, y, 1.0, x)
            outline(M, mix(base, H("#000000"), 0.4))
            img.alpha_composite(M)
    if lvl >= 3:
        for x, y in ((26, 20), (70, 40)):
            dew(img, x, y, 1, DEW)
    if lvl >= 4:
        for x, y in ((8, 40), (48, 6), (88, 26)):
            plus(img, x, y, o["glow"], core=WHITE)
    return img


ARROW = ["#.........", "##........", "#.#.......", "#..#......", "#...#.....", "#....#....", "#.....#...",
         "#......#..", "#.......#.", "#....#####", "#..#.#....", "#.#..#....", "##....#...", ".......#..", ".......##."]


def cursor(opt, lvl):
    body, core = STROKE[opt]
    img = new(22, 24)
    shape = new(22, 24)
    poly(shape, [(3, 2), (3, 17), (6, 14), (9, 20), (12, 19), (9, 13), (13, 13)], body[2])
    poly(shape, [(3, 2), (3, 17), (6, 14), (8, 12)], body[3])
    if opt == "A":
        ln(shape, [(4, 5), (8, 11)], body[1])
    elif opt == "B":
        for y in range(5, 18, 4):
            ln(shape, [(3, y), (7, y - 2)], VINE[1])
    elif opt == "C":
        for y in range(6, 15, 3):
            put(shape, 4, y, FERN[4])
            put(shape, 5, y + 1, FERN[4])
    elif opt == "D":
        for x, y in ((4, 9), (6, 13), (8, 15), (5, 6)):
            put(shape, x, y, MOSS[1])
    elif opt == "E":
        ln(shape, [(4, 6), (4, 14)], BARK[2])
    img.alpha_composite(shape)
    outline(img)
    if lvl >= 2:
        M = new(22, 24)
        motif(M, opt, 13, 18 if opt != "B" else 17, 1.0, 1)
        outline(M)
        img.alpha_composite(M)
    if lvl >= 3:
        dew(img, 5, 7, 1, DEW)
    ring(img, WHITE)
    if lvl >= 4:
        ring(img, OPTS[opt]["glow"])
    if lvl >= 5:
        img.alpha_composite(petal(opt), (14, 3))
    return img


LEVELS = (1, 3, 5)

if __name__ == "__main__":
    for opt in OPTS:
        for lvl in LEVELS:
            b, t = card(opt, lvl)
            save(b, f"b2/{opt}/card-L{lvl}-base")
            save(t, f"b2/{opt}/card-L{lvl}-top")
            save(border_layer(opt, lvl), f"b2/{opt}/check/border-L{lvl}")
            save(finish_layer(opt, lvl), f"b2/{opt}/check/finish-L{lvl}")
            for i, fr in enumerate(attack_frames(opt, lvl)):
                save(fr, f"b2/{opt}/attack-L{lvl}/frame_{i:02d}")
            save(tick(opt, lvl), f"b2/{opt}/tick-L{lvl}")
            save(numbers(opt, lvl), f"b2/{opt}/numbers-L{lvl}")
            save(table(opt, lvl), f"b2/{opt}/table-L{lvl}")
            save(cursor(opt, lvl), f"b2/{opt}/cursor-L{lvl}")
        save(petal(opt), f"b2/{opt}/petal")
