"""The five options of how a weapon family evolves Bronze -> Silver -> Gold -> Prismatic -> Unique.

A  Re-forged      same blade, richer material and more engraving each tier
B  Grows          one steel body that gets longer and gains parts (guard, wings, crystals)
C  Aura           one fixed silhouette; the shape-following element effect escalates
D  Rarity ladder  the interim DESIGN.md rule: climb the existing rarity sprites one step per tier
E  Frame kit      the weapon wears its tier's frame: metal trim, gem sockets and crest, then sparks

Every builder returns {(weapon, tier): RGBA array or None} (None = no unique drawn yet).
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

from fx import (FIRE, LEAFC, RAIN, bolts, cracks, fire_edge, merge, orbit_sparks, rainbow_shell, thin_shell)
from pix import Art, H, W, circle_mask, dil, hx, line_mask, poly_mask, sweep_orphans, INK
from weapons import (BRONZE, CYAN, EMER, GOLD, IRON, LEAF, LEATHER, MINT, PETAL, PINK, RUBY, SAPPH, SILVER, STEEL, SUN, VIOLET, WOOD,
                     bow, crystal, gem, leaf, maul, orb, ring, sparkle_spots, staff, sword, mid)

HERE = Path(__file__).resolve().parent
TIERS = ["bronze", "silver", "gold", "prismatic", "unique"]
RIM = (0xE6, 0xEA, 0xF0)
PATINA = hx("#62b59c")
VELVET = (hx("#ffd6dc"), hx("#d8405a"), hx("#a01c3c"), hx("#701030"), hx("#3a0820"))
SPARK_COLS = [hx(c) for c in ("#ffffff", "#bff4ff", "#ffd0f0", "#fff0b0")]


def existing(name: str):
    im = Image.open(HERE / "existing" / f"{name}.png").convert("RGBA")
    return np.asarray(im).copy()


def done(a: Art, nsp=0, seed=1, behind=None, sparkle_cols=None, string=None, rim_on=True):
    avoid = behind[0] if behind is not None else None
    spots = sparkle_spots(a, nsp, seed, avoid=avoid) if nsp else []
    rgba = a.finish(rim=RIM, sparkles=spots, sparkle_cols=sparkle_cols, behind=behind, rim_on=rim_on and behind is None)
    s = string if string is not None else getattr(a, "string", None)
    if s:
        (x0, y0), (x1, y1) = s
        x = int(round(x0))
        for y in range(int(y0), int(y1) + 1):
            if rgba[y, x, 3] == 0:
                rgba[y, x] = [236, 240, 246, 255]
    return sweep_orphans(sweep_orphans(rgba))


def wings_at(a: Art, x, y, ramp, n=3, ln=14, base_deg=14, step=22, lift=0.0, w2=2.3):
    """A mirrored pair of feather fans around canvas point (x, y), swept up and out."""
    for side in (-1, 1):
        for i in range(n - 1, -1, -1):
            ang = math.radians(base_deg + i * step)
            d = (side * math.cos(ang), -math.sin(ang))
            nv = (-d[1], d[0])
            l = ln - i * 2.6
            px, py = x + side * 1.5, y - lift
            tip = (px + d[0] * l, py + d[1] * l)
            m1 = (px + d[0] * l * 0.55, py + d[1] * l * 0.55)
            a.part(poly_mask([(px + nv[0] * w2, py + nv[1] * w2), (m1[0] + nv[0] * w2 * 1.1, m1[1] + nv[1] * w2 * 1.1), tip, (m1[0] - nv[0] * w2 * 1.1, m1[1] - nv[1] * w2 * 1.1), (px - nv[0] * w2, py - nv[1] * w2)]), ramp, light=1, shade=1)


def crown_at(a: Art, x, y, ramp, gem_ramp=RUBY, s=1.0, rays=False):
    pts = [(-5, 2), (-5, -3), (-2.6, -0.8), (0, -6), (2.6, -0.8), (5, -3), (5, 2)]
    if rays:
        for k, ang in enumerate((-70, -35, 0, 35, 70)):
            r = math.radians(ang - 90)
            a.part(line_mask((x, y - 3), (x + 12 * s * math.cos(r), y - 3 + 12 * s * math.sin(r)), 1.4), SUN, light=0, shade=0, lines=False)
    a.part(poly_mask([(x + px * s, y + py * s) for px, py in pts]), ramp, light=1, shade=1)
    gem(a, x, y - 0.4, 1.4 * s, gem_ramp)


# ======================================================================
# A. Re-forged
# ======================================================================

def _bronze_wear(a, T, p):
    for s, t in ((44, 2.6), (60, -2.4), (74, 2.2), (52, -1.6), (88, 0.6)):
        x, y = T(s, t)
        a.px[circle_mask(x, y, 1.15) & a.occ] = PATINA
    for s, t in ((40, -3.4), (66, 3.4), (80, -2.6)):
        x, y = T(s, t)
        a.px[circle_mask(x, y, 0.7) & a.occ] = BRONZE[4]
    # rivets on the guard
    for t in (-8, 8):
        x, y = T(p["g"], t)
        a.px[circle_mask(x, y, 0.8) & a.occ] = BRONZE[4]


def _silver_engrave(a, T, p):
    g, gl = p["g"], p["gl"]
    a.px[T.line((g, -gl + 3), (g, gl - 3), 0.8) & a.occ] = SILVER[3]
    for s in (g + 12, g + 22, g + 32):
        a.px[T.line((s, -3.2), (s + 1.4, -3.2), 0.7) & a.occ] = SILVER[3]


def _gold_scroll(a, T, p):
    g = p["g"]
    for i, s in enumerate(range(g + 8, int(p["L"] - 22), 7)):
        t = 2.4 if i % 2 else -2.4
        x, y = T(s, t)
        a.px[circle_mask(x, y, 0.8) & a.occ] = GOLD[4]
    for t in (-8.5, 8.5):
        x, y = T(g, t)
        a.px[circle_mask(x, y, 0.8) & a.occ] = GOLD[0]


def A_sword(tier):
    base = dict(L=108, g=30, hw=5.5, gl=11)
    if tier == "bronze":
        a = sword({**base, "blade": BRONZE, "guard": BRONZE, "pommel": BRONZE, "pommel_style": "stud", "fuller": False, "extras": _bronze_wear, "right_tone": 3})
        return done(a, 0)
    if tier == "silver":
        a = sword({**base, "blade": SILVER, "guard": SILVER, "pommel": SILVER, "pommel_style": "ball", "extras": _silver_engrave})
        return done(a, 2, 2)
    if tier == "gold":
        a = sword({**base, "blade": GOLD, "guard": GOLD, "pommel": GOLD, "pommel_style": "gem", "gem": RUBY, "grip": VELVET, "guard_gem": RUBY, "guard_style": "curved", "extras": _gold_scroll})
        return done(a, 4, 3)
    if tier == "prismatic":
        a = sword({**base, "hw": 6, "blade": [(31, 49, CYAN), (49, 67, PINK), (67, 86, VIOLET), (86, 108, CYAN)], "guard": MINT, "pommel": VIOLET, "pommel_style": "gem", "gem": SUN, "grip": VIOLET, "guard_gem": SUN, "guard_style": "curved", "gt": 3, "fuller": False})
        return done(a, 6, 4, sparkle_cols=SPARK_COLS)
    return existing("evo-flameblade")


def _head(orb_r, orb_ramp, leaf_ramp, leaf_len=10, cup=None, leaf_deg=40, extra=None, pre=None):
    def head(a, T, p):
        top = p["L"] - 6
        if pre:
            pre(a, T, p)
        if cup is not None:
            a.part(T.poly([(top - 6, -2.6), (top - 1, -5.2), (top + 2.5, -5.4), (top + 2.5, 5.4), (top - 1, 5.2), (top - 6, 2.6)]), cup, light=1, shade=1)
        leaf(a, T, top - 4, 0, leaf_len, leaf_deg, leaf_ramp, side=-1)
        leaf(a, T, top - 4, 0, leaf_len, leaf_deg, leaf_ramp, side=1)
        orb(a, T, top + orb_r - 1.5, 0, orb_r, orb_ramp)
        if extra:
            extra(a, T, p)
    return head


def A_staff(tier):
    base = dict(L=100, hw=2.4)
    if tier == "bronze":
        a = staff({**base, "shaft": WOOD, "foot": BRONZE, "bands": [(28, BRONZE)], "head": _head(3.4, LEAF, LEAF, 10)})
        return done(a, 0)
    if tier == "silver":
        a = staff({**base, "shaft": WOOD, "foot": SILVER, "bands": [(22, SILVER), (40, SILVER)], "head": _head(4.2, SAPPH, LEAF, 11, cup=SILVER)})
        return done(a, 2, 5)
    if tier == "gold":
        a = staff({**base, "shaft": WOOD, "foot": GOLD, "bands": [(20, GOLD), (34, GOLD), (48, GOLD)], "head": _head(4.8, EMER, GOLD, 12, cup=GOLD)})
        return done(a, 4, 6)
    if tier == "prismatic":
        a = staff({**base, "hw": 2.8, "shaft": CYAN, "foot": VIOLET, "bands": [(20, PINK), (34, PINK), (48, PINK)], "head": _head(5.2, SUN, PINK, 13, cup=VIOLET)})
        return done(a, 6, 7, sparkle_cols=SPARK_COLS)
    return existing("evo-rootbloom_staff")


def _bow_cx(depth):
    return 50 - depth / 2


def A_bow(tier):
    spec = {
        "bronze": dict(limb=BRONZE, riser=LEATHER, tips=BRONZE),
        "silver": dict(limb=SILVER, riser=LEATHER, tips=SILVER),
        "gold": dict(limb=GOLD, riser=VELVET, tips=GOLD),
        "prismatic": dict(limb=CYAN, riser=VIOLET, tips=PINK),
    }
    if tier == "unique":
        return None
    d = 22
    s = spec[tier]

    def extras(a, p):
        xr = p["cx"] + p["depth"]
        if tier == "gold":
            gem(a, xr, p["cy"], 2.4, RUBY)
        if tier == "silver":
            a.px[line_mask((xr - 2, p["cy"] - 14), (xr - 2, p["cy"] - 30), 0.8) & a.occ] = SILVER[3]
        if tier == "prismatic":
            gem(a, xr, p["cy"], 2.6, SUN)
    sp = dict(half=44, depth=d, w=7 if tier != "prismatic" else 8, cx=_bow_cx(d), cy=60, extras=extras, **s)
    if tier == "bronze":
        pass
    a = bow(sp)
    if tier == "prismatic":
        # crystal facets: second hue on the lower limb
        m = sp["limb_mask"] & poly_mask([(0, 60), (W, 60), (W, H), (0, H)])
        a.part(m, PINK, light=1, shade=1, lines=False)
        a.part(sp["riser_mask"], VIOLET, light=1, shade=1)
        gem(a, sp["cx"] + d, 60, 2.6, SUN)
    return done(a, {"bronze": 0, "silver": 2, "gold": 4, "prismatic": 6}[tier], 8 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


def A_maul(tier):
    if tier == "unique":
        return None
    base = dict(L=108, hl=16, hh=9)
    spec = {
        "bronze": dict(head=WOOD, band=BRONZE, handle=WOOD, cap=BRONZE),
        "silver": dict(head=STEEL, band=SILVER, handle=WOOD, cap=SILVER),
        "gold": dict(head=GOLD, band=GOLD, handle=VELVET, cap=GOLD),
        "prismatic": dict(head=CYAN, band=VIOLET, handle=VIOLET, cap=SUN),
    }[tier]

    def extras(a, T, p):
        hs = p["hs"]
        if tier == "gold":
            gem(a, *T(hs, 0), 2.6, RUBY)
        if tier == "prismatic":
            hh, hl = p["hh"], p["hl"]
            half = T.poly([(hs - hh - 1, 0), (hs + hh + 1, 0), (hs + hh + 1, hl + 2), (hs - hh - 1, hl + 2)])
            a.part(a.occ & half & T.poly([(hs - hh, -hl), (hs + hh, -hl), (hs + hh, hl), (hs - hh, hl)]), PINK, light=1, shade=1, lines=False)
            gem(a, *T(hs, 0), 2.6, SUN)
        if tier == "bronze":
            for s, t in ((hs - 2, -6), (hs + 3, 7), (hs, 2)):
                x, y = T(s, t)
                a.px[circle_mask(x, y, 1.0) & a.occ] = PATINA
    a = maul({**base, **spec, "extras": extras})
    return done(a, {"bronze": 0, "silver": 2, "gold": 4, "prismatic": 6}[tier], 20 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


# ======================================================================
# B. Grows
# ======================================================================

def _crystal_shards(items):
    """items: [(x, y, h, w, ramp, tilt_deg)] floating crystals in canvas space, drawn behind."""
    def back(a, T, p=None):
        from pix import Xf
        for x, y, h, w, r, tilt in items:
            Xs = Xf(x, y, tilt)
            crystal(a, Xs, 0, 0, h, w, r)
    return back


def B_sword(tier):
    if tier == "unique":
        return existing("evo-flameblade")
    c = (52, 61)
    if tier == "bronze":
        a = sword({"L": 66, "g": 20, "hw": 4.1, "gl": 8, "gt": 2.2, "blade": IRON, "guard": IRON, "pommel": IRON, "pommel_style": "stud", "fuller": False, "c": c})
        return done(a, 0)
    if tier == "silver":
        a = sword({"L": 84, "g": 25, "hw": 5, "gl": 10.5, "blade": STEEL, "guard": STEEL, "guard_style": "curved", "pommel": STEEL, "pommel_style": "ball", "c": c})
        return done(a, 1, 2)
    if tier == "gold":
        a = sword({"L": 100, "g": 30, "hw": 6.2, "gl": 11.5, "blade": STEEL, "guard": STEEL, "guard_style": "curved", "pommel": STEEL, "pommel_style": "gem", "gem": RUBY, "guard_gem": RUBY, "wings": STEEL, "wing_n": 2, "wing_len": 17, "c": c})
        return done(a, 2, 3)
    T = mid(120, 52, 62)

    def extras(a, T, p):
        # a crystal core inlaid in the fuller
        a.part(T.poly([(40, -1.4), (96, -1.0), (104, 0), (96, 1.0), (40, 1.4)]) & a.occ, CYAN, light=0, shade=0, lines=False)
        a.glint(T.line((44, -0.4), (92, -0.4), 0.7) & a.occ)

    a = sword({"L": 120, "g": 34, "hw": 7.4, "gl": 15, "gt": 3, "blade": STEEL, "guard": STEEL, "guard_style": "curved", "pommel": STEEL, "pommel_style": "gem", "gem": SUN, "guard_gem": SUN, "guard_gem_r": 3.2,
               "wings": STEEL, "wing_n": 3, "wing_len": 22, "extras": extras, "T": T})
    # three crystals hovering beside the blade
    from pix import Xf
    for (x, y, h, w, r, tilt) in ((17, 44, 11, 5, CYAN, -20), (82, 90, 11, 5, PINK, 24), (85, 38, 9, 4, VIOLET, 14)):
        crystal(a, Xf(x, y, tilt), 0, 0, h, w, r)
    return done(a, 4, 4, sparkle_cols=SPARK_COLS)


def B_staff(tier):
    if tier == "unique":
        return existing("evo-rootbloom_staff")
    pet = PINK
    if tier == "bronze":
        a = staff({"L": 64, "hw": 1.8, "shaft": WOOD, "foot": IRON, "head": _head(3.0, LEAF, LEAF, 7, leaf_deg=50), "c": (50, 62)})
        return done(a, 0)
    if tier == "silver":
        a = staff({"L": 82, "hw": 2.1, "shaft": WOOD, "foot": IRON, "bands": [(26, IRON)], "head": _head(3.8, pet, LEAF, 11, cup=IRON), "c": (50, 61)})
        return done(a, 1, 2)
    if tier == "gold":
        def pre(a, T, p):
            top = p["L"] - 6
            x, y = T(top - 3, 0)
            wings_at(a, x, y, IRON, 2, 13, base_deg=22, step=26)
        a = staff({"L": 100, "hw": 2.5, "shaft": WOOD, "foot": IRON, "bands": [(24, IRON), (44, IRON)], "head": _head(4.6, pet, LEAF, 12, cup=IRON, pre=pre)})
        return done(a, 2, 3)

    def pre(a, T, p):
        top = p["L"] - 6
        x, y = T(top - 3, 0)
        wings_at(a, x, y, IRON, 3, 17, base_deg=18, step=24)
        from pix import Xf
        for (dx, dy, h, w, r, tilt) in ((-17, 7, 10, 4.4, CYAN, -22), (16, 3, 10, 4.4, PINK, 24), (-10, -13, 8, 3.6, VIOLET, -8)):
            crystal(a, Xf(x + dx, y + dy, tilt), 0, 0, h, w, r)

    def ring_back(a, T, p):
        ring(a, T, p["L"] + 1, 0, 10.5, CYAN, 1.8)

    a = staff({"L": 106, "hw": 3.0, "shaft": WOOD, "foot": IRON, "bands": [(22, IRON), (44, IRON), (66, IRON)], "head": _head(5.8, SUN, LEAF, 13, cup=IRON, pre=pre), "back": ring_back, "c": (50, 66)})
    return done(a, 4, 4, sparkle_cols=SPARK_COLS)


def B_bow(tier):
    if tier == "unique":
        return None
    d = {"bronze": 14, "silver": 19, "gold": 23, "prismatic": 27}[tier]
    half = {"bronze": 30, "silver": 38, "gold": 47, "prismatic": 55}[tier]
    w = {"bronze": 5, "silver": 6, "gold": 7, "prismatic": 8}[tier]

    def extras(a, p):
        cx, cy, dep = p["cx"], p["cy"], p["depth"]
        xr = cx + dep
        if tier in ("gold", "prismatic"):
            gem(a, xr, cy, 2.4 if tier == "gold" else 3.0, RUBY if tier == "gold" else SUN)
            wings_at(a, xr + 2, cy - 10, IRON, 2 if tier == "gold" else 3, 11 if tier == "gold" else 15, base_deg=40, step=26, w2=2.0)
        if tier == "prismatic":
            for sgn in (-1, 1):
                from pix import Xf
                crystal(a, Xf(cx - 1, cy + sgn * (half + 2), 0 if sgn > 0 else 180), 0, 0, 9, 4.4, CYAN)
        if tier == "silver":
            for sgn in (-1, 1):
                a.part(poly_mask([(cx - 2, cy + sgn * (half + 1)), (cx + 2, cy + sgn * (half + 1)), (cx, cy + sgn * (half + 7))]), IRON, light=1, shade=1)
    sp = dict(half=half, depth=d, w=w, cx=_bow_cx(d), cy=60, limb=WOOD, riser=LEATHER, tips=IRON, extras=extras)
    a = bow(sp)
    return done(a, {"bronze": 0, "silver": 1, "gold": 2, "prismatic": 4}[tier], 30 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


def B_maul(tier):
    if tier == "unique":
        return None
    spec = {
        "bronze": dict(L=72, hl=10, hh=6),
        "silver": dict(L=88, hl=13, hh=7.5),
        "gold": dict(L=102, hl=16, hh=9),
        "prismatic": dict(L=116, hl=19, hh=11),
    }[tier]

    def extras(a, T, p):
        hs, hl, hh = p["hs"], p["hl"], p["hh"]
        if tier in ("gold", "prismatic"):
            for sgn in (-1, 1):
                a.part(T.poly([(hs - hh * 0.7, sgn * hl), (hs + hh * 0.7, sgn * hl), (hs, sgn * (hl + (7 if tier == "gold" else 11)))]), IRON, light=1, shade=1)
            a.part(T.poly([(hs + hh, -hh * 0.6), (hs + hh + (6 if tier == "gold" else 9), 0), (hs + hh, hh * 0.6)]), IRON, light=1, shade=1)
        if tier == "prismatic":
            gem(a, *T(hs, 0), 3.2, SUN)
            from pix import Xf
            for (dx, dy, h, w, r, tilt) in ((10, -7, 11, 4.6, CYAN, 28), (-4, -18, 9, 4, PINK, -18)):
                x, y = T(hs, 0)
                crystal(a, Xf(x + dx - 2, y + dy - 6, tilt), 0, 0, h, w, r)
        if tier == "gold":
            gem(a, *T(hs, 0), 2.4, RUBY)
    a = maul({**spec, "head": IRON, "band": STEEL, "handle": WOOD, "cap": IRON, "extras": extras, "head_shape": "wide" if tier == "bronze" else None})
    return done(a, {"bronze": 0, "silver": 1, "gold": 2, "prismatic": 4}[tier], 40 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


# ======================================================================
# C. Aura (one fixed body per weapon)
# ======================================================================

def _c_body_sword():
    return sword({"L": 108, "g": 30, "hw": 5.5, "gl": 11, "blade": STEEL, "guard": STEEL, "pommel": STEEL, "pommel_style": "ball", "guard_style": "curved"})


def _c_body_staff():
    return staff({"L": 100, "hw": 2.4, "shaft": WOOD, "foot": IRON, "bands": [(26, IRON)], "head": _head(4.2, EMER, LEAF, 11, cup=None)})


def _c_body_bow():
    d = 22
    sp = dict(half=44, depth=d, w=7, cx=_bow_cx(d), cy=60, limb=WOOD, riser=LEATHER, tips=IRON)
    a = bow(sp)
    a.spec = sp
    return a


def _c_body_maul():
    return maul({"L": 108, "hl": 16, "hh": 9, "head": IRON, "band": STEEL, "handle": WOOD, "cap": IRON})


def _aura(kind, tier, a, seed=1, phase=0.0):
    """Returns (behind, nsp, spark_cols) for the weapon's element: sword fire, staff nature, bow storm, maul earth."""
    occ = a.occ
    if tier == "bronze":
        return None, 0, None
    if tier == "silver":
        col = {"fire": hx("#ffb066"), "nature": hx("#9be85e"), "storm": hx("#7fdcff"), "earth": hx("#ffd65a")}[kind]
        return thin_shell(occ, col, True), 3, None
    big = tier == "prismatic"
    layers = []
    if big:
        layers.append(rainbow_shell(occ, 3.6, seed + 4, phase))
    if kind == "fire":
        layers.append(fire_edge(occ, seed, 11.0 if big else 7.5, phase))
    elif kind == "nature":
        layers.append(thin_shell(occ, hx("#46b84a")) if not big else rainbow_shell(occ, 2.6, seed, phase))
    elif kind == "storm":
        ys, xs = np.nonzero(a.occ)
        idx = np.random.default_rng(seed).choice(len(xs), size=6 if big else 4, replace=False)
        pts = [(int(xs[i]), int(ys[i])) for i in idx]
        layers.append(bolts(pts, seed, 22 if big else 15, 6 if big else 4, occ))
    elif kind == "earth":
        layers.append(thin_shell(occ, hx("#ffd65a")) if not big else rainbow_shell(occ, 2.6, seed, phase))
    behind = merge(*layers)
    return behind, 6 if big else 3, SPARK_COLS if big else None


def _leaf_spiral(a, T, p, n=5, big=False):
    """Nature: a ribbon of leaves coiling round the shaft (front and back leaves)."""
    L = p["L"]
    for i in range(n):
        s = 10 + i * ((L - 34) / max(1, n - 1))
        side = 1 if i % 2 else -1
        leaf(a, T, s, 0, 11 if big else 8, 32, LEAF, w=4.2, side=side)
        a.px[T.line((s, -0.2), (s + 4 * side * 0, 0), 0.6) & a.occ] = LEAF[4]


def C_item(weapon, tier, phase=0.0):
    if tier == "unique":
        if weapon == "sword":
            return existing("evo-flameblade")
        if weapon == "staff":
            return existing("evo-rootbloom_staff")
        return None
    kind = {"sword": "fire", "staff": "nature", "bow": "storm", "maul": "earth"}[weapon]
    a = {"sword": _c_body_sword, "staff": _c_body_staff, "bow": _c_body_bow, "maul": _c_body_maul}[weapon]()
    if weapon == "staff" and tier in ("gold", "prismatic"):
        _leaf_spiral(a, a_T(weapon), {"L": 100}, 6 if tier == "gold" else 8, tier == "prismatic")
    behind, nsp, sc = _aura(kind, tier, a, seed=3, phase=phase)
    if weapon == "maul" and tier in ("gold", "prismatic"):
        cr = cracks(a.occ, 5, 3 if tier == "gold" else 5, hx("#ffe27a"), 16)
        a.px[cr] = hx("#ffe27a")
    return done(a, nsp, 50, behind=behind, sparkle_cols=sc, rim_on=behind is None)


def a_T(weapon):
    return mid(100, 50, 60, 16)


# ======================================================================
# D. Rarity ladder (the interim rule, honest)
# ======================================================================

def D_item(weapon, tier):
    ladder = ["common", "rare", "epic", "legendary"]
    if tier == "unique":
        if weapon == "sword":
            return existing("evo-flameblade")
        if weapon == "staff":
            return existing("evo-rootbloom_staff")
        return None
    return existing(f"item-{weapon}-{ladder[TIERS.index(tier)]}")


# ======================================================================
# E. Frame kit
# ======================================================================

TRIM = {"bronze": BRONZE, "silver": SILVER, "gold": GOLD, "prismatic": MINT}
SOCKET_GEMS = [SAPPH, EMER, RUBY, SUN, PINK, VIOLET]
CROWN3 = [(4, -4.6), (-0.5, -5.0), (-4.6, -3.8), (-1.8, -1.9), (-6.2, 0), (-1.8, 1.9), (-4.6, 3.8), (-0.5, 5.0), (4, 4.6)]


def _e_gems(a, pts, tier, r=2.5):
    """The frame's six sockets: empty at Bronze, two sapphires at Silver, sapphire, emerald and a ruby at
    Gold, six rainbow gems at Prismatic. pts: the two corners first, then the rest."""
    if tier == "bronze":
        for x, y in pts[:2]:
            a.px[circle_mask(x, y, 1.3) & a.occ] = INK
            a.px[circle_mask(x, y, 0.6) & a.occ] = BRONZE[4]
    elif tier == "silver":
        for x, y in pts[:2]:
            gem(a, x, y, r, SAPPH)
    elif tier == "gold":
        for (x, y), g_ in zip(pts[:3], (SAPPH, EMER, RUBY)):
            gem(a, x, y, r, g_)
    else:
        for (x, y), g_ in zip(pts[:6], SOCKET_GEMS):
            gem(a, x, y, r, g_)


def _crest(a, tier, x, y, up=(0.0, -1.0), s=1.0):
    """The frame's crest on a free spot: stud, small wings, small crown, radiant crown. `up` points away
    from the weapon."""
    ux, uy = up
    cx_, cy_ = x + ux * 3 * s, y + uy * 3 * s
    if tier == "bronze":
        a.part(circle_mask(cx_, cy_, 2.6 * s), BRONZE, light=1, shade=1)
    elif tier == "silver":
        wings_at(a, cx_, cy_, SILVER, 2, 12 * s, base_deg=18, step=30, w2=2.2)
        a.part(circle_mask(cx_, cy_, 2.4 * s), SILVER, light=1, shade=1)
    elif tier == "gold":
        crown_at(a, cx_, cy_ + 2, GOLD, RUBY, 1.25 * s)
    else:
        for ang in (-40, 0, 40):
            r_ = math.radians(ang - 90)
            tipx, tipy = cx_ + 15 * s * math.cos(r_), cy_ - 4 + 15 * s * math.sin(r_)
            nx, ny = -math.sin(r_) * 2.4, math.cos(r_) * 2.4
            a.part(poly_mask([(cx_ + nx, cy_ - 4 + ny), (tipx, tipy), (cx_ - nx, cy_ - 4 - ny)]), SUN, light=0, shade=0, lines=False)
        crown_at(a, cx_, cy_ + 2, MINT, SUN, 1.5 * s)


def E_sword(tier):
    if tier == "unique":
        return existing("evo-flameblade")
    L, g, gl = 108, 30, 12
    trim = TRIM[tier]
    gt = 3.0
    top = g + gt

    def extras(a, T, p):
        if tier in ("bronze", "silver"):
            pts = [T(g, -gl + 2.4), T(g, gl - 2.4)]
        elif tier == "gold":
            pts = [T(g, -gl + 2.4), T(g, gl - 2.4), T(top + 2.2, 0)]
        else:
            pts = [T(g, -gl + 2.4), T(g, gl - 2.4), T(top + 3.0, 0), T(g + 28, 0), T(g + 46, 0), T(1.6, 0)]
        _e_gems(a, pts, tier, 2.3)

    spec = {"L": L, "g": g, "hw": 5.5, "gl": gl, "gt": gt, "blade": STEEL, "guard": trim, "pommel": trim,
            "pommel_style": "stud" if tier != "prismatic" else "ball", "grip": LEATHER, "extras": None, "fuller": tier != "bronze"}
    if tier == "silver":
        spec.update({"wings": SILVER, "wing_n": 2, "wing_len": 14})
    # the crown is drawn before the gems so the sockets sit on it
    def pre(a, T, p):
        if tier == "gold":
            a.part(T.poly([(top - 0.5, -7), (top + 7.5, -6.4), (top + 3.6, -3.2), (top + 10.5, 0), (top + 3.6, 3.2), (top + 7.5, 6.4), (top - 0.5, 7)]), GOLD, light=1, shade=1)
        if tier == "prismatic":
            a.part(T.poly([(top - 0.5, -8.6), (top + 8.5, -8), (top + 4.2, -4.6), (top + 13, -2.2), (top + 5, 0), (top + 13, 2.2), (top + 4.2, 4.6), (top + 8.5, 8), (top - 0.5, 8.6)]), MINT, light=1, shade=1)
        extras(a, T, p)
    spec["extras"] = pre
    a = sword(spec)
    return done(a, {"bronze": 0, "silver": 1, "gold": 3, "prismatic": 6}[tier], 60 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


def E_staff(tier):
    if tier == "unique":
        return existing("evo-rootbloom_staff")
    trim = TRIM[tier]
    L = 100

    def head(a, T, p):
        top = L - 6
        x, y = T(top + 1, 0)
        leaf(a, T, top - 4, 0, 10, 40, LEAF, side=-1)
        leaf(a, T, top - 4, 0, 10, 40, LEAF, side=1)
        orb(a, T, top + 2.5, 0, 4.4, EMER if tier != "prismatic" else SUN)
        # the crest sits under the orb
        x2, y2 = T(top - 6, 0)
        _crest(a, tier, x2, y2 + 4, (0, 1), 0.9)
        pts = [T(70, 0), T(52, 0), T(36, 0), T(20, 0), T(84, 0), T(8, 0)]
        _e_gems(a, pts, tier, 2.2)
    a = staff({"L": L, "hw": 2.6, "shaft": WOOD, "foot": trim, "bands": [(28, trim), (60, trim)], "head": head})
    return done(a, {"bronze": 0, "silver": 1, "gold": 3, "prismatic": 6}[tier], 70 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


def E_bow(tier):
    if tier == "unique":
        return None
    trim = TRIM[tier]
    d = 22

    def extras(a, p):
        cx, cy = p["cx"], p["cy"]
        xr = cx + d
        pts = [(cx + 3, cy - 36), (cx + 3, cy + 36), (xr, cy - 15), (xr + 0.5, cy + 15), (cx + 11, cy - 26), (cx + 11, cy + 26)]
        _e_gems(a, pts, tier, 2.3)
        _crest(a, tier, xr + 2, cy - 12, (1, 0), 0.9)
    sp = dict(half=44, depth=d, w=7.5, cx=_bow_cx(d), cy=60, limb=WOOD, riser=LEATHER, tips=trim, extras=extras)
    a = bow(sp)
    return done(a, {"bronze": 0, "silver": 1, "gold": 3, "prismatic": 6}[tier], 80 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


def E_maul(tier):
    if tier == "unique":
        return None
    trim = TRIM[tier]

    def extras(a, T, p):
        hs, hl, hh = p["hs"], p["hl"], p["hh"]
        pts = [T(hs, -hl + 3.2), T(hs, hl - 3.2), T(hs - 0.5, 0), T(hs + hh - 3.5, -hl + 8), T(hs + hh - 3.5, hl - 8), T(hs - hh + 3.5, 0)]
        _e_gems(a, pts, tier, 2.4)
        x, y = T(hs + hh + 2, 0)
        _crest(a, tier, x, y - 2, (-0.5, -0.87), 0.9)
    a = maul({"L": 108, "hl": 16, "hh": 9, "head": STEEL, "band": trim, "handle": WOOD, "cap": trim, "extras": extras})
    return done(a, {"bronze": 0, "silver": 1, "gold": 3, "prismatic": 6}[tier], 90 + len(tier), sparkle_cols=SPARK_COLS if tier == "prismatic" else None)


# ======================================================================

WEAPONS = ["sword", "staff", "bow", "maul"]
OPTIONS = {
    "A": {"sword": A_sword, "staff": A_staff, "bow": A_bow, "maul": A_maul},
    "B": {"sword": B_sword, "staff": B_staff, "bow": B_bow, "maul": B_maul},
    "C": {w: (lambda t, w=w: C_item(w, t)) for w in WEAPONS},
    "D": {w: (lambda t, w=w: D_item(w, t)) for w in WEAPONS},
    "E": {"sword": E_sword, "staff": E_staff, "bow": E_bow, "maul": E_maul},
}
