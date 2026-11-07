"""B5 lower-rarity loose cosmetics, B6 achievement stickers, B7 skill tree nodes + star chart."""
import math

import card as K
from b2_verdant import bez, leaf, spiral, stroke
from glyphs import numeral
from px import *  # noqa: F403

# ---------------- B5: 2 Common + 2 Epic loose items, five art styles ----------------
# Items: Common border (max 2: shape, ambient), Common numbers (max 2: shape, ambient),
#        Epic attack (max 4: shape, accent, gem + glow, ambient), Epic tick (same ladder).

B5 = {
    "A": dict(name="Forge", metal=ramp("#8a92a6"), acc=ramp("#d9a441"), names=("Rivet Brackets", "Stamped Numerals", "Anvil Strike", "Spark Tick")),
    "B": dict(name="Woodcraft", metal=ramp("#a8743f"), acc=ramp("#d9c49a"), names=("Twine Corners", "Carved Numerals", "Whittle Cut", "Woodchip Tick")),
    "C": dict(name="Star chart", metal=ramp("#c6cfe6"), acc=ramp("#6aa8ff"), names=("Compass Corners", "Inked Numerals", "Comet Slash", "Star Tick")),
    "D": dict(name="Candy enamel", metal=ramp("#ff7aa8"), acc=ramp("#7ae0ff"), names=("Gumdrop Corners", "Candy Numerals", "Ribbon Swipe", "Pop Tick")),
    "E": dict(name="Runestone", metal=ramp("#7d7f8c"), acc=ramp("#4fe0c0"), names=("Rune Corners", "Rune Numerals", "Rune Cleave", "Glyph Tick")),
}


def b5_corner(opt):
    o = B5[opt]
    m, a = o["metal"], o["acc"]
    g = new(52, 62)
    S = new(52, 62)
    if opt == "A":
        rect(S, 6, 6, 26, 11, m[2])
        rect(S, 6, 6, 11, 30, m[2])
        rect(S, 6, 6, 26, 7, m[3])
        rect(S, 6, 6, 7, 30, m[3])
        part(g, S, do_bevel=False)
        for x, y in ((9, 9), (22, 9), (9, 26)):
            ell(g, x - 1, y - 1, x + 1, y + 1, a[2])
            put(g, x - 1, y - 1, a[4])
    elif opt == "B":
        for k in range(4):
            ln(S, [(5 + k * 3, 14 - k), (14 - k, 5 + k * 3)], m[2 + (k % 2)], 2)
        ln(S, [(14, 9), (30, 9)], a[2], 2)
        ln(S, [(9, 14), (9, 34)], a[2], 2)
        part(g, S, do_bevel=False)
    elif opt == "C":
        facet_gem(S, star_pts(9, 9, 4, 8, 2.2), m, 9, 9, table=0)
        part(g, S, do_bevel=False)
        ln(g, [(17, 10), (32, 10)], m[3])
        ln(g, [(10, 17), (10, 38)], m[3])
        put(g, 32, 9, a[3])
        put(g, 9, 38, a[3])
    elif opt == "D":
        for cx, cy, r in ((8, 8, 5), (18, 7, 3.4), (7, 18, 3.4), (26, 9, 2.4), (9, 26, 2.4)):
            ell(S, cx - r, cy - r, cx + r, cy + r, m[2] if r > 3 else a[2])
            put(S, round(cx - r / 2), round(cy - r / 2), WHITE)
        part(g, S, do_bevel=False)
    elif opt == "E":
        poly(S, [(3, 3), (22, 5), (20, 13), (13, 13), (13, 20), (5, 22)], m[2])
        poly(S, [(3, 3), (22, 5), (13, 9), (9, 13), (5, 22)], m[3])
        part(g, S, do_bevel=False)
        ln(g, [(8, 7), (8, 12), (11, 9)], a[3])
    return g


def b5_border(opt, lvl):
    layer = K.place_corners(b5_corner(opt))
    outline(layer)
    if lvl >= 2:
        for x, y in ((20, 32), (163, 32), (20, 228), (163, 228)):
            plus(layer, x, y, WHITE)
    return layer


def b5_card(opt, lvl):
    base = K.panels(H("#2a2f38"), H("#353a46"), H("#1c2028"), H("#12141b"), H("#5a6070"))
    top = K.top("frame-gold", b5_border(opt, lvl), 6, 1, ramp("#ffd34d"))
    return base, top


def b5_numbers(opt, lvl):
    o = B5[opt]
    img = new(50, 16)
    img.alpha_composite(numeral("12.4K", o["metal"], 1, bold=True, shadow=True), (2, 3))
    if lvl >= 2:
        plus(img, 46, 3, o["acc"][4], core=WHITE)
    return img


def b5_attack(opt, lvl):
    o = B5[opt]
    f = new(64, 64)
    s = new(64, 64)
    stroke(s, 0.0, 1.0, 3.0, o["metal"], o["acc"] if lvl >= 2 else o["metal"])
    outline(s)
    f.alpha_composite(s)
    if lvl >= 3:
        G = new(64, 64)
        x, y = bez((8, 54), (22, 18), (58, 9), 0.95)
        facet_gem(G, ngon(x, y + 1, 4, 3, rot=0), o["acc"], x, y + 1, table=0)
        outline(G)
        f.alpha_composite(G)
        ring(f, mix(o["acc"][4], WHITE, 0.4))
    if lvl >= 4:
        for x, y in ((40, 34), (30, 42), (48, 26)):
            plus(f, x, y, o["acc"][4], core=WHITE)
    return f


def b5_tick(opt, lvl):
    o = B5[opt]
    img = new(56, 30)
    img.alpha_composite(numeral("-96", o["acc"] if lvl >= 2 else o["metal"], 2, bold=True), (4, 6))
    if lvl >= 3:
        G = new(56, 30)
        facet_gem(G, ngon(48, 8, 4, 3.2, rot=0), o["acc"], 48, 8, table=0)
        outline(G)
        img.alpha_composite(G)
    ring(img, WHITE)
    if lvl >= 3:
        ring(img, mix(o["acc"][4], WHITE, 0.4))
    if lvl >= 4:
        plus(img, 50, 24, o["acc"][4], core=WHITE)
    return img


# ---------------- B6: achievement stickers ----------------

CAT = {"harvest": "#4caf3a", "kill": "#e0443a", "slayer": "#e0443a", "six": "#f2c230", "prism": "#9b5cff", "owl": "#3b5bdb"}
STEEL = ramp("#c4cbe0")
GOLD = ramp("#f2c230")


def glyph(kind, grey=False):
    g = new(30, 30)
    if kind == "harvest":
        leaf(g, (6, 25), (25, 5), 6.5, ramp("#4caf3a"))
        G = new(30, 30)
        facet_gem(G, ngon(22, 22, 8, 4.2), ramp("#d98a3a"), 22, 22, table=0)
        part(g, G, do_bevel=False)
    elif kind in ("kill",):
        for flip in (False, True):
            S = new(30, 30)
            ln(S, [(5, 5), (21, 21)], STEEL[3], 3)
            ln(S, [(5, 5), (19, 19)], STEEL[4], 1)
            ln(S, [(17, 23), (23, 17)], GOLD[2], 2)
            ln(S, [(22, 22), (26, 26)], ramp("#8a5a36")[2], 2)
            if flip:
                S = mirror_x(S)
            part(g, S, do_bevel=False)
    elif kind == "slayer":
        S = new(30, 30)
        ell(S, 5, 3, 25, 21, ramp("#efe6d2")[2])
        ell(S, 5, 3, 16, 13, ramp("#efe6d2")[3])
        rect(S, 9, 18, 21, 25, ramp("#efe6d2")[2])
        ell(S, 8, 10, 13, 15, INK)
        ell(S, 17, 10, 22, 15, INK)
        poly(S, [(15, 16), (13, 19), (17, 19)], INK)
        for x in (11, 14, 17, 20):
            ln(S, [(x, 21), (x, 25)], ramp("#efe6d2")[0])
        part(g, S, do_bevel=False)
    elif kind == "six":
        facet_gem(g, star_pts(15, 16, 5, 14, 6), GOLD, 15, 16, table=0)
    elif kind == "prism":
        pts = [(15, 2), (27, 12), (15, 28), (3, 12)]
        cols = ["#ff5f7a", "#ffc94d", "#5fe08a", "#5fb8ff", "#b47cff", "#ff8ad8"]
        fan = [(15, 2), (21, 7), (27, 12), (21, 20), (15, 28), (9, 20), (3, 12), (9, 7)]
        for i in range(len(fan)):
            poly(g, [(15, 13), fan[i], fan[(i + 1) % len(fan)]], ramp(cols[i % 6])[2 + (i < 3)])
        ln(g, [(3, 12), (27, 12)], WHITE)
        put(g, 11, 7, WHITE)
    elif kind == "owl":
        S = new(30, 30)
        ell(S, 3, 3, 25, 25, ramp("#ffe08a")[2])
        ell(S, 3, 3, 14, 14, ramp("#ffe08a")[3])
        ell(S, 10, 0, 30, 20, CLEAR)
        part(g, S, do_bevel=False)
        plus(g, 22, 8, WHITE, arm=2)
        plus(g, 18, 20, ramp("#ffe08a")[4])
    outline(g)
    if grey:
        px_ = g.load()
        for y in range(30):
            for x in range(30):
                p = px_[x, y]
                if p[3] and p[:3] != INK[:3]:
                    v = int(0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2])
                    px_[x, y] = mix((60, 62, 74, 255), (150, 152, 166, 255), v / 255)
    return g


def sticker(style, kind, locked=False):
    img = new(48, 48)
    cat = ramp(CAT[kind]) if not locked else ramp("#5b5e6e")
    gl = glyph(kind, grey=locked)
    if style == "A":
        img.alpha_composite(gl, (9, 9))
        ring(img, WHITE)
        ring(img, WHITE)
        outline(img)
    elif style == "B":
        ell(img, 4, 4, 43, 43, cat[1])
        ell(img, 6, 6, 41, 41, cat[2])
        ell(img, 6, 6, 30, 30, cat[3])
        ell(img, 9, 9, 40, 40, cat[2])
        D(img).arc([6, 6, 41, 41], 200, 250, fill=cat[4], width=1)
        img.alpha_composite(gl, (9, 9))
        outline(img)
        ring(img, WHITE)
    elif style == "C":
        shield = [(5, 4), (42, 4), (42, 24), (36, 36), (24, 44), (12, 36), (5, 24)]
        poly(img, shield, cat[2])
        poly(img, [(5, 4), (24, 4), (24, 44), (12, 36), (5, 24)], cat[3])
        D(img).polygon(shield, outline=GOLD[3])
        img.alpha_composite(gl, (9, 8))
        outline(img)
        ring(img, WHITE)
    elif style == "D":
        rect(img, 3, 3, 44, 44, WHITE)
        for k in range(3, 45, 4):
            for x, y in ((k, 3), (k, 44), (3, k), (44, k)):
                put(img, x, y, CLEAR)
        rect(img, 7, 7, 40, 40, cat[2])
        rect(img, 7, 7, 40, 14, cat[3])
        img.alpha_composite(gl, (9, 10))
        outline(img)
    elif style == "E":
        pts = star_pts(23.5, 23.5, 12, 21, 17)
        rim = [ramp(c)[2] for c in ("#ff7a9a", "#ffd166", "#7ae08a", "#6ac8ff", "#b48aff")] if not locked else [cat[2]]
        fan = pts
        for i in range(len(fan)):
            poly(img, [(23.5, 23.5), fan[i], fan[(i + 1) % len(fan)]], rim[i % len(rim)])
        ell(img, 7, 7, 40, 40, cat[1])
        ell(img, 8, 8, 39, 39, cat[2])
        img.alpha_composite(gl, (9, 9))
        outline(img)
        ring(img, WHITE)
        plus(img, 39, 6, WHITE)
    if locked and style != "A":
        pass
    return img


KINDS = ["harvest", "kill", "slayer", "six", "prism", "owl"]
KIND_NAMES = ["First Harvest", "First Kill", "Giant Slayer II", "Six Stars", "Prismatic Dawn", "Night Owl"]


def slayer_numeral(img):
    n = numeral("II", ramp("#ffffff"), 1, bold=False)
    img.alpha_composite(n, (33, 33))
    return img


# ---------------- B7: skill tree gem nodes + card enhancement star chart ----------------

BRANCHES = [("Logging", "#4caf3a"), ("Mining", "#e07a32"), ("Combat", "#e0303a"),
            ("Summoning", "#9b5cff"), ("Collection", "#f2c230"), ("Automation", "#33c3e0")]
B7 = {
    "A": dict(name="Brilliant in a bronze cup"),
    "B": dict(name="Hex cut in a silver bezel"),
    "C": dict(name="Bare rhombus, sticker ring"),
    "D": dict(name="Star cut, like the medals"),
    "E": dict(name="Kite cut with gold prongs"),
}


def node(style, col, state, size=24):
    """state: 0 locked, 1 available, 2 owned."""
    img = new(size, size)
    c = size / 2 - 0.5
    r = size / 2 - 3
    rp = ramp(col) if state else ramp("#6b6e7e")
    if state == 1:
        rp = [mix(t, H("#2a2238"), 0.45) for t in rp]
    if style == "A":
        cup = ramp("#b8743a")
        ell(img, c - r, c - r, c + r, c + r, cup[2])
        ell(img, c - r, c - r, c + r - 2, c + r - 2, cup[3])
        ell(img, c - r + 2, c - r + 2, c + r - 2, c + r - 2, cup[1])
        G = new(size, size)
        facet_gem(G, ngon(c, c, 8, r - 3), rp, c, c, table=0.45, glint=state == 2)
        part(img, G, do_bevel=False)
    elif style == "B":
        sv = ramp("#c4cbe0")
        poly(img, ngon(c, c, 6, r + 1, rot=0), sv[2])
        poly(img, ngon(c - 0.5, c - 0.5, 6, r, rot=0)[2:5] + [(c, c)], sv[3])
        G = new(size, size)
        facet_gem(G, ngon(c, c, 6, r - 2, rot=0), rp, c, c, table=0.45, glint=state == 2)
        part(img, G, do_bevel=False)
    elif style == "C":
        facet_gem(img, [(c, c - r - 1), (c + r - 1, c), (c, c + r + 1), (c - r + 1, c)], rp, c, c, table=0.4, glint=state == 2)
    elif style == "D":
        facet_gem(img, star_pts(c, c + 0.5, 5, r + 1.5, (r + 1.5) * 0.48), rp, c, c, table=0, glint=False)
        for i, (x, y) in enumerate(star_pts(c, c + 0.5, 5, r + 1.5, (r + 1.5) * 0.48)):
            if i % 2 == 0:
                ln(img, [(c + (x - c) * 0.3, c + (y - c) * 0.3), (c + (x - c) * 0.75, c + (y - c) * 0.75)], rp[4])
        if state == 2:
            put(img, round(c), round(c), WHITE)
    elif style == "E":
        kite = [(c, c - r - 1), (c + r - 2, c - 2), (c, c + r + 1), (c - r + 2, c - 2)]
        facet_gem(img, kite, rp, c, c - 1, table=0.4, glint=state == 2)
        gd = ramp("#f2c230")
        for x, y in kite:
            put(img, round(x + (c - x) * 0.1), round(y + (c - y) * 0.1), gd[3])
    outline(img)
    if style in ("C",) or state == 2:
        ring(img, WHITE if state == 2 else H("#3a3550"))
    if state == 2 and size >= 24:
        plus(img, size - 4, 3, WHITE)
    return img


def chart(style, col="#9b5cff"):
    """Card enhancement star chart (Omni SP style): options as stars on a small sky, linked."""
    w, h = 200, 120
    img = new(w, h)
    rect(img, 0, 0, w - 1, h - 1, H("#120f22"))
    rr = rng(9)
    for _ in range(40):
        put(img, rr.randint(1, w - 2), rr.randint(1, h - 2), H("#3a3560"))
    nodes = [(24, 90), (52, 64), (84, 80), (100, 44), (128, 70), (150, 32), (170, 86), (60, 26), (118, 100)]
    edges = [(0, 1), (1, 2), (1, 7), (2, 3), (3, 4), (3, 5), (4, 6), (2, 8)]
    owned = {0, 1, 2, 3, 7}
    lit = ramp(col)
    for a, b in edges:
        on = a in owned and b in owned
        (x0, y0), (x1, y1) = nodes[a], nodes[b]
        n = int(math.hypot(x1 - x0, y1 - y0))
        for i in range(n):
            if on or i % 4 < 2:
                put(img, round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), lit[3] if on else H("#4a4470"))
    for i, (x, y) in enumerate(nodes):
        st = 2 if i in owned else (1 if any((i in e) and ((e[0] in owned) or (e[1] in owned)) for e in edges) else 0)
        nd = node(style, col, st, 18 if i not in (3,) else 24)
        img.alpha_composite(nd, (x - nd.width // 2, y - nd.height // 2))
    return img


if __name__ == "__main__":
    for opt in B5:
        for lvl in (1, 2):
            b, t = b5_card(opt, lvl)
            save(b, f"b5/{opt}/card-L{lvl}-base")
            save(t, f"b5/{opt}/card-L{lvl}-top")
            save(b5_numbers(opt, lvl), f"b5/{opt}/numbers-L{lvl}")
        for lvl in (1, 4):
            save(b5_attack(opt, lvl), f"b5/{opt}/attack-L{lvl}")
            save(b5_tick(opt, lvl), f"b5/{opt}/tick-L{lvl}")
    for style in "ABCDE":
        for k in KINDS:
            s = sticker(style, k)
            if k == "slayer":
                slayer_numeral(s)
            save(s, f"b6/{style}/{k}")
        save(sticker(style, "owl", locked=True), f"b6/{style}/locked")
    for style in B7:
        for name, col in BRANCHES:
            for st in range(3):
                save(node(style, col, st), f"b7/{style}/{name.lower()}-{st}")
        save(node(style, "#9b5cff", 2, 32), f"b7/{style}/keystone")
        save(chart(style), f"b7/{style}/chart")
