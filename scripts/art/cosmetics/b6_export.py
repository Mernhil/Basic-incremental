"""B6 achievement stickers: five sticker styles (die-cut circles, 74 x 74, chapter colours) and one
~50 px picture per achievement (plus its grey locked print), and the card-shard icon.

A sticker is two layers: the style's base for the chapter (`sticker-<style>-<chapter>`, or
`sticker-<style>-locked`) and the achievement picture centred on it (`ach-<id>` / `ach-<id>-grey`).
"""
import math

from b2_verdant import leaf
from px import *  # noqa: F403

CHAPTERS = {
    "gathering": "#4caf3a",
    "battle": "#e0443a",
    "cards": "#f2c230",
    "wardrobe": "#9b5cff",
    "journey": "#3b6be0",
}
STYLES = {"a": "Paper die-cut", "b": "Enamel pin", "c": "Gold bezel", "d": "Postage stamp", "e": "Holo burst"}
S = 74
C = 36.5
ART = 50

STEEL = ramp("#c4cbe0")
GOLD = ramp("#f2c230")
WOOD = ramp("#8a5a36")
BONE = ramp("#efe6d2")
LEAFR = ramp("#4caf3a")
CRYS = ramp("#7fd8ff")
VIOLET = ramp("#9b5cff")
MOON = ramp("#ffe08a")
SILVER = ramp("#c9d2e3")
RED = ramp("#e0443a")


# ---------------- sticker bases ----------------

def base(style, chapter):
    img = new(S, S)
    cat = ramp(CHAPTERS[chapter]) if chapter != "locked" else ramp("#5b5e6e")
    r = 33
    if style == "a":
        ell(img, C - r, C - r, C + r, C + r, WHITE)
        ell(img, C - r + 4, C - r + 4, C + r - 4, C + r - 4, cat[2])
        ell(img, C - r + 4, C - r + 4, C + 2, C + 2, cat[3])
        ell(img, C - r + 8, C - r + 8, C + r - 4, C + r - 4, cat[2])
    elif style == "b":
        ell(img, C - r, C - r, C + r, C + r, cat[0])
        ell(img, C - r + 2, C - r + 2, C + r - 2, C + r - 2, cat[2])
        ell(img, C - r + 2, C - r + 2, C + 4, C + 4, cat[3])
        ell(img, C - r + 6, C - r + 6, C + r - 2, C + r - 2, cat[2])
        D(img).arc([C - r + 3, C - r + 3, C + r - 3, C + r - 3], 195, 255, fill=cat[4], width=2)
        D(img).arc([C - r + 3, C - r + 3, C + r - 3, C + r - 3], 15, 75, fill=cat[1], width=2)
    elif style == "c":
        ell(img, C - r, C - r, C + r, C + r, GOLD[1])
        ell(img, C - r + 1, C - r + 1, C + r - 2, C + r - 2, GOLD[3])
        ell(img, C - r + 2, C - r + 2, C + r - 1, C + r - 1, GOLD[2])
        ell(img, C - r + 5, C - r + 5, C + r - 5, C + r - 5, GOLD[0])
        ell(img, C - r + 6, C - r + 6, C + r - 6, C + r - 6, cat[2])
        ell(img, C - r + 6, C - r + 6, C + 1, C + 1, cat[3])
        ell(img, C - r + 10, C - r + 10, C + r - 6, C + r - 6, cat[2])
        for k in range(8):
            a = k * math.pi / 4 + math.pi / 8
            x, y = C + (r - 2.5) * math.cos(a), C + (r - 2.5) * math.sin(a)
            ell(img, x - 1, y - 1, x + 1, y + 1, GOLD[4])
    elif style == "d":
        n = 28
        pts = []
        for i in range(n * 2):
            rr = r if i % 2 == 0 else r - 2
            a = i * math.pi / n
            pts.append((C + rr * math.cos(a), C + rr * math.sin(a)))
        poly(img, pts, WHITE)
        ell(img, C - r + 6, C - r + 6, C + r - 6, C + r - 6, cat[1])
        ell(img, C - r + 7, C - r + 7, C + r - 7, C + r - 7, cat[2])
        D(img).chord([C - r + 7, C - r + 7, C + r - 7, C + r - 7], 200, 340, fill=cat[3])
    elif style == "e":
        pts = star_pts(C, C, 16, r + 1, r - 4)
        rim = [ramp(c)[2] for c in ("#ff7a9a", "#ffd166", "#7ae08a", "#6ac8ff", "#b48aff")] if chapter != "locked" else [cat[2], cat[3]]
        for i in range(len(pts)):
            poly(img, [(C, C), pts[i], pts[(i + 1) % len(pts)]], rim[(i // 2) % len(rim)])
        ell(img, C - r + 6, C - r + 6, C + r - 6, C + r - 6, cat[1])
        ell(img, C - r + 7, C - r + 7, C + r - 7, C + r - 7, cat[2])
        ell(img, C - r + 7, C - r + 7, C + 2, C + 2, cat[3])
        ell(img, C - r + 11, C - r + 11, C + r - 7, C + r - 7, cat[2])
    outline(img)
    if style != "d":
        ring(img, WHITE)
    if style == "e" and chapter != "locked":
        plus(img, 60, 11, WHITE, arm=2)
    return img


# ---------------- achievement pictures (50 x 50) ----------------

def numeral(img, text, x, y):
    from glyphs import numeral as num
    n = num(text, ramp("#ffffff"), 1, bold=True)
    img.alpha_composite(n, (x, y))


def sword(g, a, b, blade=STEEL, guard=GOLD, flip=False):
    S_ = new(ART, ART)
    ln(S_, [a, b], blade[3], 4)
    ln(S_, [a, (a[0] + (b[0] - a[0]) * 0.9, a[1] + (b[1] - a[1]) * 0.9)], blade[4], 1)
    mx, my = a[0] + (b[0] - a[0]) * 0.78, a[1] + (b[1] - a[1]) * 0.78
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    ln(S_, [(mx + nx * 7, my + ny * 7), (mx - nx * 7, my - ny * 7)], guard[2], 3)
    ln(S_, [(mx, my), b], WOOD[2], 3)
    put(S_, round(b[0]), round(b[1]), guard[3])
    if flip:
        S_ = mirror_x(S_)
    part(g, S_, do_bevel=False)


def axe(g):
    H_ = new(ART, ART)
    ln(H_, [(14, 44), (32, 8)], WOOD[2], 4)
    ln(H_, [(15, 42), (31, 10)], WOOD[3], 1)
    part(g, H_, do_bevel=False)
    B = new(ART, ART)
    poly(B, [(26, 10), (40, 6), (45, 16), (40, 26), (31, 22)], STEEL[2])
    poly(B, [(26, 10), (40, 6), (42, 12), (30, 16)], STEEL[3])
    ln(B, [(40, 7), (45, 16), (40, 25)], STEEL[4], 1)
    part(g, B, do_bevel=False)


def pickaxe(g):
    H_ = new(ART, ART)
    ln(H_, [(12, 45), (32, 12)], WOOD[2], 4)
    part(g, H_, do_bevel=False)
    B = new(ART, ART)
    pts = [(6, 18), (16, 8), (30, 5), (44, 10), (48, 20), (40, 14), (30, 12), (17, 14)]
    poly(B, pts, STEEL[2])
    poly(B, [(6, 18), (16, 8), (30, 5), (44, 10), (30, 9), (16, 11)], STEEL[3])
    part(g, B, do_bevel=False)


def tree(g):
    T = new(ART, ART)
    rect(T, 21, 30, 28, 46, WOOD[2])
    rect(T, 21, 30, 23, 46, WOOD[3])
    part(g, T, do_bevel=False)
    L = new(ART, ART)
    for cx, cy, r, t in ((25, 20, 15, 2), (16, 25, 8, 2), (34, 25, 8, 1), (21, 14, 8, 3)):
        ell(L, cx - r, cy - r, cx + r, cy + r, LEAFR[t])
    part(g, L, do_bevel=False)
    for x, y in ((18, 22), (31, 17), (27, 28)):
        G = new(ART, ART)
        facet_gem(G, ngon(x, y, 6, 2.6), ramp("#d98a3a"), x, y, table=0)
        part(g, G, do_bevel=False)


def crystals(g, rp=CRYS):
    R = new(ART, ART)
    poly(R, [(4, 46), (10, 36), (40, 34), (47, 46)], ramp("#7a6a5c")[2])
    poly(R, [(4, 46), (10, 36), (24, 36), (20, 46)], ramp("#7a6a5c")[3])
    part(g, R, do_bevel=False)
    for pts in ([(18, 40), (14, 18), (20, 10), (26, 18), (26, 40)], [(26, 40), (28, 14), (34, 4), (40, 14), (38, 40)],
                [(36, 42), (40, 26), (46, 24), (46, 42)]):
        P = new(ART, ART)
        facet_gem(P, pts, rp, table=0)
        part(g, P, do_bevel=False)


def skull(g):
    S_ = new(ART, ART)
    ell(S_, 9, 6, 41, 36, BONE[2])
    ell(S_, 9, 6, 26, 22, BONE[3])
    rect(S_, 15, 30, 35, 42, BONE[2])
    ell(S_, 14, 17, 22, 26, INK)
    ell(S_, 28, 17, 36, 26, INK)
    poly(S_, [(25, 27), (22, 32), (28, 32)], INK)
    for x in (18, 22, 26, 30):
        ln(S_, [(x, 36), (x, 42)], BONE[0])
    part(g, S_, do_bevel=False)
    plus(g, 17, 20, RED[3], core=RED[4])


def eye_diamond(g):
    P = new(ART, ART)
    facet_gem(P, [(25, 2), (46, 25), (25, 48), (4, 25)], CRYS, 25, 25, table=0)
    part(g, P, do_bevel=False)
    ell(g, 17, 20, 33, 30, WHITE)
    ell(g, 21, 21, 29, 29, ramp("#3b6be0")[1])
    ell(g, 23, 23, 27, 27, INK)
    put(g, 23, 22, WHITE)


def portal(g, text=None):
    for r, t in ((21, 1), (17, 2), (13, 3), (9, 4)):
        D(g).arc([25 - r, 25 - r, 25 + r, 25 + r], 0, 300, fill=VIOLET[t], width=3)
    ell(g, 20, 20, 30, 30, VIOLET[4])
    plus(g, 25, 25, WHITE, arm=2)
    if text:
        numeral(g, text, 15, 34)


def star(g, rp=GOLD, n=5, ro=22, ri=10):
    facet_gem(g, star_pts(25, 26, n, ro, ri), rp, 25, 26, table=0)
    for i, (x, y) in enumerate(star_pts(25, 26, n, ro, ri)):
        if i % 2 == 0:
            ln(g, [(25 + (x - 25) * 0.3, 26 + (y - 26) * 0.3), (25 + (x - 25) * 0.75, 26 + (y - 26) * 0.75)], rp[4])


def card_pic(g, metal):
    Cd = new(ART, ART)
    rect(Cd, 11, 4, 39, 46, metal[2])
    rect(Cd, 11, 4, 39, 6, metal[4])
    rect(Cd, 11, 4, 13, 46, metal[3])
    rect(Cd, 15, 9, 35, 30, ramp("#1d2335")[2])
    rect(Cd, 15, 33, 35, 41, ramp("#1d2335")[3])
    part(g, Cd, do_bevel=False)
    G = new(ART, ART)
    facet_gem(G, ngon(25, 19, 4, 6, rot=0), metal, 25, 19, table=0)
    part(g, G, do_bevel=False)


def prism(g):
    cols = ["#ff5f7a", "#ffc94d", "#5fe08a", "#5fb8ff", "#b47cff", "#ff8ad8"]
    fan = [(25, 3), (36, 12), (46, 21), (36, 33), (25, 47), (14, 33), (4, 21), (14, 12)]
    for i in range(len(fan)):
        poly(g, [(25, 22), fan[i], fan[(i + 1) % len(fan)]], ramp(cols[i % 6])[2 + (i < 3)])
    ln(g, [(4, 21), (46, 21)], WHITE)
    put(g, 17, 11, WHITE)


def fan_cards(g):
    for k, (dx, metal) in enumerate(((-9, SILVER), (0, GOLD), (9, ramp("#b48aff")))):
        Cd = new(ART, ART)
        poly(Cd, [(18 + dx, 8 + abs(dx) // 3), (32 + dx, 8 + abs(dx) // 3), (32 + dx, 44), (18 + dx, 44)], metal[2])
        rect(Cd, 18 + dx, 8 + abs(dx) // 3, 32 + dx, 10 + abs(dx) // 3, metal[4])
        part(g, Cd, do_bevel=False)


def crown(g):
    Cr = new(ART, ART)
    poly(Cr, [(6, 40), (6, 16), (15, 26), (25, 8), (35, 26), (44, 16), (44, 40)], GOLD[2])
    poly(Cr, [(6, 40), (6, 16), (15, 26), (25, 8), (25, 40)], GOLD[3])
    rect(Cr, 6, 34, 44, 40, GOLD[1])
    part(g, Cr, do_bevel=False)
    for x, col in ((15, RED), (25, ramp("#3b6be0")), (35, LEAFR)):
        G = new(ART, ART)
        facet_gem(G, ngon(x, 37, 6, 2.6), col, x, 37, table=0)
        part(g, G, do_bevel=False)


def hanger(g):
    Hh = new(ART, ART)
    D(Hh).arc([20, 3, 30, 13], 180, 90, fill=STEEL[3], width=2)
    ln(Hh, [(25, 13), (25, 17)], STEEL[3], 2)
    poly(Hh, [(25, 16), (5, 32), (45, 32)], STEEL[2])
    poly(Hh, [(25, 20), (11, 30), (39, 30)], CLEAR)
    part(g, Hh, do_bevel=False)
    Cl = new(ART, ART)
    poly(Cl, [(11, 31), (39, 31), (42, 48), (8, 48)], VIOLET[2])
    poly(Cl, [(11, 31), (25, 31), (22, 48), (8, 48)], VIOLET[3])
    part(g, Cl, do_bevel=False)
    plus(g, 36, 40, GOLD[4])


def nodes(g):
    pts = [(12, 36), (25, 14), (38, 36)]
    for a, b in ((0, 1), (1, 2), (0, 2)):
        ln(g, [pts[a], pts[b]], GOLD[3], 2)
    for x, y in pts:
        G = new(ART, ART)
        facet_gem(G, ngon(x, y, 8, 7), VIOLET, x, y, table=0.45)
        part(g, G, do_bevel=False)


def ascension(g):
    for r, t in ((22, 1), (16, 2), (10, 3)):
        D(g).chord([25 - r, 44 - r, 25 + r, 44 + r], 180, 360, fill=ramp("#ffb347")[t])
    A = new(ART, ART)
    poly(A, [(25, 3), (38, 18), (30, 18), (30, 36), (20, 36), (20, 18), (12, 18)], WHITE)
    poly(A, [(25, 3), (25, 36), (20, 36), (20, 18), (12, 18)], ramp("#fff0c8")[2])
    part(g, A, do_bevel=False)


def moon(g):
    M = new(ART, ART)
    ell(M, 5, 5, 43, 43, MOON[2])
    ell(M, 5, 5, 24, 24, MOON[3])
    ell(M, 16, 0, 50, 34, CLEAR)
    part(g, M, do_bevel=False)
    plus(g, 36, 13, WHITE, arm=2)
    plus(g, 30, 32, MOON[4])
    plus(g, 42, 26, MOON[4])


def flag(g):
    P = new(ART, ART)
    rect(P, 10, 4, 13, 47, WOOD[2])
    part(g, P, do_bevel=False)
    F = new(ART, ART)
    poly(F, [(14, 6), (44, 10), (36, 18), (44, 26), (14, 24)], RED[2])
    poly(F, [(14, 6), (44, 10), (14, 14)], RED[3])
    part(g, F, do_bevel=False)
    numeral(g, "25", 18, 11)


def brilliant(g):
    facet_gem(g, ngon(25, 25, 8, 21, rot=-math.pi / 8), ramp("#33c3e0"), 25, 25, table=0.5)


def medal(g):
    R = new(ART, ART)
    poly(R, [(14, 2), (22, 2), (28, 20), (20, 20)], RED[2])
    poly(R, [(36, 2), (28, 2), (22, 20), (30, 20)], ramp("#3b6be0")[2])
    part(g, R, do_bevel=False)
    G = new(ART, ART)
    ell(G, 9, 17, 41, 49, GOLD[2])
    ell(G, 9, 17, 30, 38, GOLD[3])
    part(g, G, do_bevel=False)
    St = new(ART, ART)
    facet_gem(St, star_pts(25, 33, 5, 11, 5), GOLD, 25, 33, table=0)
    part(g, St, do_bevel=False)


def masterwork(g):
    A = new(ART, ART)
    poly(A, [(6, 30), (44, 30), (40, 37), (32, 37), (34, 46), (16, 46), (18, 37), (10, 37)], ramp("#5a6070")[2])
    rect(A, 6, 30, 44, 32, ramp("#5a6070")[4])
    part(g, A, do_bevel=False)
    Hm = new(ART, ART)
    ln(Hm, [(30, 26), (42, 6)], WOOD[2], 3)
    poly(Hm, [(28, 4), (40, 0), (44, 8), (32, 12)], STEEL[2])
    poly(Hm, [(28, 4), (40, 0), (41, 3), (29, 7)], STEEL[4])
    part(g, Hm, do_bevel=False)
    for x, y in ((14, 22), (22, 16), (10, 14)):
        plus(g, x, y, GOLD[4], core=WHITE)


def harvest(g):
    leaf(g, (8, 42), (42, 8), 11, LEAFR)
    G = new(ART, ART)
    facet_gem(G, ngon(36, 36, 8, 8), ramp("#d98a3a"), 36, 36, table=0)
    part(g, G, do_bevel=False)


def crossed(g):
    sword(g, (8, 8), (40, 40))
    sword(g, (8, 8), (40, 40), flip=True)


def luck(g):
    star(g, ramp("#5fe08a"), 4, 21, 7)
    ln(g, [(30, 14), (26, 22), (32, 26), (27, 36)], INK, 1)


PICTURES = {
    "first_harvest": harvest,
    "first_kill": crossed,
    "lumberjack_1": lambda g: (axe(g), numeral(g, "I", 4, 38)),
    "lumberjack_2": lambda g: (axe(g), numeral(g, "II", 2, 38)),
    "prospector_1": lambda g: (pickaxe(g), numeral(g, "I", 36, 38)),
    "prospector_2": lambda g: (pickaxe(g), numeral(g, "II", 34, 38)),
    "tree_hugger": tree,
    "deep_delver": crystals,
    "giant_slayer_1": lambda g: (skull(g), numeral(g, "I", 38, 36)),
    "giant_slayer_2": lambda g: (skull(g), numeral(g, "II", 36, 36)),
    "giant_slayer_3": lambda g: (skull(g), numeral(g, "III", 32, 36)),
    "glimmer_seeker": eye_diamond,
    "first_summon": portal,
    "ten_pulls": lambda g: portal(g, "10"),
    "pity_breaker": luck,
    "silver_lining": lambda g: card_pic(g, SILVER),
    "golden_hour": lambda g: card_pic(g, GOLD),
    "six_stars": star,
    "prismatic_dawn": prism,
    "full_loadout": fan_cards,
    "dressed_up": crown,
    "fashionista": hanger,
    "skilled": nodes,
    "first_ascension": ascension,
    "night_owl": moon,
    "first_milestone": flag,
    "gem_adept": brilliant,
    "medalist": medal,
    "masterwork": masterwork,
}


def picture(aid, grey=False):
    d = new(ART, ART)
    PICTURES[aid](d)
    g = new(ART + 2, ART + 2)  # one pixel of room so the ink outline never clips
    g.alpha_composite(d, (1, 1))
    outline(g)
    if grey:
        px_ = g.load()
        for y in range(ART + 2):
            for x in range(ART + 2):
                p = px_[x, y]
                if p[3] and p[:3] != INK[:3]:
                    v = int(0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2])
                    px_[x, y] = mix((60, 62, 74, 255), (150, 152, 166, 255), v / 255)
    return g


def card_shard():
    """The card-shard icon (32 x 32): a broken corner of a card with its gem."""
    g = new(32, 32)
    P = new(32, 32)
    poly(P, [(5, 4), (24, 4), (27, 14), (20, 17), (23, 24), (13, 28), (5, 22)], GOLD[2])
    poly(P, [(5, 4), (24, 4), (22, 8), (8, 8), (8, 22), (5, 22)], GOLD[3])
    rect(P, 9, 9, 20, 18, ramp("#2c1a4f")[2])
    part(g, P, do_bevel=False)
    G = new(32, 32)
    facet_gem(G, ngon(15, 14, 4, 4.4, rot=0), ramp("#b48aff"), 15, 14, table=0)
    part(g, G, do_bevel=False)
    outline(g)
    ring(g, WHITE)
    plus(g, 26, 25, WHITE)
    return g


def export(emit, meta):
    for st in STYLES:
        for ch in list(CHAPTERS) + ["locked"]:
            emit(f"sticker-{st}-{ch}", base(st, ch))
    for aid in PICTURES:
        emit(f"ach-{aid}", picture(aid))
        emit(f"ach-{aid}-grey", picture(aid, grey=True))
    emit("card-shard", card_shard())
    meta["stickers"] = dict(styles=STYLES, chapters=list(CHAPTERS), achievements=sorted(PICTURES),
                            size=S, art=ART)
    meta["skins"]["sticker"] = list(STYLES)
