"""Weapon builders for the weapon-tier drafts. Every builder takes a spec dict and returns an Art
(see pix.py); the option modules in options.py decide the specs per tier."""
from __future__ import annotations

import math

import numpy as np

from pix import (Art, Xf, circle_mask, diamond, gem, hx, line_mask, poly_mask, ramp, shift, dil, ero, W, H)

# ---------- materials: glint, light, base, shade, deep (shadows lean purple, lights lean warm) ----------
BRONZE = ramp("#fff2d0", "#f2c47e", "#b87038", "#6c3a28", "#381e24")
SILVER = ramp("#ffffff", "#e9eef8", "#b4c0d8", "#7c88ac", "#4a4e78")
GOLD = ramp("#fff7c0", "#ffdc50", "#eaa51a", "#b0680f", "#69371a")
STEEL = ramp("#ffffff", "#e6ebf3", "#aeb8cc", "#78829f", "#454968")
IRON = ramp("#eef0f5", "#c2cad6", "#8d98ad", "#5d6781", "#383c58")
LEATHER = ramp("#dfa66e", "#a8683c", "#7a4528", "#52301e", "#33201a")
WOOD = ramp("#e4b680", "#b9814e", "#8a5a34", "#5e3a22", "#3a2416")
CYAN = ramp("#ffffff", "#d6fcff", "#92e4f6", "#5aa9e6", "#3a58b0")
PINK = ramp("#ffffff", "#ffdaf2", "#ffa0da", "#d468d2", "#7c3aa8")
VIOLET = ramp("#ffffff", "#e6dbff", "#b9a0ff", "#8868e2", "#4a3aa0")
MINT = ramp("#ffffff", "#daffe8", "#92f2bc", "#50bc8c", "#2a6a7c")
SUN = ramp("#ffffff", "#fff0b8", "#ffd28a", "#f09a6a", "#9a4a7a")
RUBY = ramp("#ffd6dc", "#ff6a80", "#e0243e", "#a01030", "#5a0a2c")
SAPPH = ramp("#d6f2ff", "#5cb6ff", "#2a7ae2", "#1a4ab2", "#122a72")
EMER = ramp("#dcffdc", "#6ee88c", "#22b45c", "#127c42", "#0a4a36")
LEAF = ramp("#e8ffa8", "#9be85e", "#46b84a", "#238240", "#124a3a")
PETAL = ramp("#fff0f6", "#ffb8d8", "#ff7ab0", "#d04a90", "#80286e")
STONE = ramp("#e8e0f0", "#b8b0c8", "#8a82a0", "#5e5878", "#3a3452")
VOID = ramp("#b8a8f0", "#6a5a98", "#3a3252", "#241e38", "#120c20")
RAINBOW = [CYAN, MINT, SUN, PINK, VIOLET]
GEMS = [SAPPH, EMER, RUBY, SUN, PINK, VIOLET]


def mid(L, cx=52, cy=60, deg=33.69):
    """A frame whose axis midpoint (s = L / 2) sits at (cx, cy)."""
    a = math.radians(deg)
    return Xf(cx - (L / 2) * math.sin(a), cy + (L / 2) * math.cos(a), deg)


# ======================================================================
# sword
# ======================================================================

def sword(p: dict) -> Art:
    """p: L (pommel to tip), g (guard s), hw (blade half width), gl (guard half length), blade (ramp or
    list of (s0, s1, ramp) facets), fuller, guard (ramp), guard_style, grip, pommel_style, pommel
    (ramp), gem (ramp), wings (ramp or None), extras (callable(art, T, p))."""
    a = Art()
    L, g, hw, gl = p["L"], p["g"], p["hw"], p["gl"]
    T = p.get("T") or mid(L, *p.get("c", (52, 60)))
    p["T"] = T
    br = p["blade"]
    gr = p.get("guard", SILVER)
    tip = p.get("tip", hw * 3.3)
    Lt = L - tip

    # swept wings sit behind the blade: a fan of feathers from the guard ends
    if p.get("wings"):
        wr = p["wings"]
        n = p.get("wing_n", 3)
        for side in (-1, 1):
            for i in range(n):
                phi = math.radians(72 - i * 24 + p.get("wing_spread", 0))
                ln = p.get("wing_len", 20) - i * 4.2
                piv = (g - 1 + i * 0.5, side * (gl * 0.62))
                d = (math.sin(phi), side * math.cos(phi))  # (along s, across t): upright feathers first
                nv = (-d[1], d[0])
                w2 = 2.5
                tipp = (piv[0] + d[0] * ln, piv[1] + d[1] * ln)
                pts = [(piv[0] + nv[0] * w2, piv[1] + nv[1] * w2), (piv[0] + d[0] * ln * 0.55 + nv[0] * w2 * 1.15, piv[1] + d[1] * ln * 0.55 + nv[1] * w2 * 1.15), tipp, (piv[0] + d[0] * ln * 0.55 - nv[0] * w2 * 1.15, piv[1] + d[1] * ln * 0.55 - nv[1] * w2 * 1.15), (piv[0] - nv[0] * w2, piv[1] - nv[1] * w2)]
                a.part(T.poly(pts), wr, light=1, shade=1)

    # grip and pommel
    gripm = T.poly([(3.5, -2.3), (g - 0.5, -2.3), (g - 0.5, 2.3), (3.5, 2.3)])
    a.part(gripm, p.get("grip", LEATHER), light=1, shade=1, lines=False)
    gm = p.get("grip", LEATHER)
    k = 6.0
    while k < g - 2:
        a.px[T.line((k, -2.3), (k - 2.2, 2.3), 0.9) & gripm] = gm[4]
        k += 4.0
    ps = p.get("pommel_style", "ball")
    pr = p.get("pommel", gr)
    if ps == "ball":
        a.part(T.circle(1.6, 0, 4.0), pr, light=1, shade=1)
    elif ps == "stud":
        a.part(T.circle(1.4, 0, 3.4), pr, light=1, shade=1)
    elif ps == "gem":
        a.part(T.circle(1.6, 0, 4.6), pr, light=1, shade=1)
        gem(a, *T(1.6, 0), 2.0, p.get("gem", RUBY))
    elif ps == "spike":
        a.part(T.poly([(-4, 0), (0.5, -3.6), (5.5, 0), (0.5, 3.6)]), pr, light=1, shade=1)
        gem(a, *T(1.8, 0), 1.6, p.get("gem", RUBY))
    elif ps == "crown":
        a.part(T.poly([(-3.5, -4.2), (-1, -2.2), (-0.6, -5.6), (1.4, -3), (3.4, -5.6), (3.6, -2.4), (5.8, -4.2), (5.8, 4.2), (3.6, 2.4), (3.4, 5.6), (1.4, 3), (-0.6, 5.6), (-1, 2.2), (-3.5, 4.2)]), pr, light=1, shade=1)
        gem(a, *T(1.8, 0), 1.9, p.get("gem", RUBY))

    # blade
    bm = T.poly([(g + 1, -hw), (Lt, -hw), (L, -hw * 0.15), (L, hw * 0.15), (Lt, hw), (g + 1, hw)])
    if is_facets(br):
        # crystal facets: each strip is its own hue, no dark line between them
        for (s0, s1, r) in br:
            k_ = p.get("slant", 0.8) * 90
            sm = bm & T.poly([(s0 - k_ - 0.1, -90), (s1 - k_ + 0.1, -90), (s1 + k_ + 0.1, 90), (s0 + k_ - 0.1, 90)])
            a.part(sm, r, light=1, shade=1, lines=False, faces=[(T.half(-1), 1)])
        # a ridge line in the darkest tone of the first strip keeps the blade reading as one piece
    else:
        a.part(bm, br, light=2, shade=2, lines=False, faces=[(T.half(-1), 1)] + ([(T.half(1), p["right_tone"])] if p.get("right_tone") else []))
    if p.get("fuller", True):
        fr = br[0][2] if is_facets(br) else br
        f0, f1 = g + 6, Lt - 5
        a.px[T.line((f0, 1.3), (f1, 1.3), 1.0) & bm] = fr[3]
        a.px[T.line((f0 + 1, 0.2), (f1 - 1, 0.2), 0.7) & bm] = fr[0]
    # glint along the lit edge
    a.glint(T.line((g + 5, -hw * 0.62), (L - tip * 0.9, -hw * 0.5), 0.9) & bm)
    a.glint(circle_mask(*T(L - 0.8, 0), 0.7))

    # guard (on top of the blade root)
    gs = p.get("guard_style", "bar")
    gt = p.get("gt", 2.6)
    if gs == "bar":
        gmask = T.poly([(g - gt, -gl), (g + gt, -gl), (g + gt, gl), (g - gt, gl)])
    elif gs == "curved":  # quillons bend up toward the tip
        gmask = T.poly([(g - gt, -gl + 1), (g + gt + 4.5, -gl - 1.5), (g + gt + 4.5, -gl + 1.2), (g + gt, -gl + 3.6), (g + gt, gl - 3.6), (g + gt + 4.5, gl - 1.2), (g + gt + 4.5, gl + 1.5), (g - gt, gl - 1)])
    else:
        gmask = T.poly([(g - gt, -gl), (g + gt, -gl), (g + gt, gl), (g - gt, gl)])
    a.part(gmask, gr, light=1, shade=1)
    a.glint(T.line((g - gt + 0.5, -gl + 1.5), (g - gt + 0.5, -gl + 5), 0.9) & gmask)
    if p.get("guard_gem"):
        gem(a, *T(g, 0), p.get("guard_gem_r", 2.6), p["guard_gem"])
    if p.get("extras"):
        p["extras"](a, T, p)
    return a


def sparkle_spots(a: Art, n: int, seed: int, pad: int = 3, avoid=None) -> list[tuple[int, int]]:
    """Deterministic plus-sparkle centres that sit clear of the weapon."""
    near = dil(a.occ | (avoid if avoid is not None else False), pad + 2)
    r = np.random.default_rng(seed)
    out: list[tuple[int, int]] = []
    tries = 0
    while len(out) < n and tries < 4000:
        tries += 1
        x, y = int(r.integers(6, W - 6)), int(r.integers(6, H - 6))
        if near[max(0, y - 2) : y + 3, max(0, x - 2) : x + 3].any():
            continue
        if any(abs(x - ox) + abs(y - oy) < 24 for ox, oy in out):
            continue
        out.append((x, y))
    return out


def is_facets(b) -> bool:
    return isinstance(b[0][2], list)


# ======================================================================
# shared little parts
# ======================================================================

def leaf(a: Art, T: Xf, s, t, ln, deg, r, w=4.4, side=1):
    """A leaf from local (s, t) pointing `deg` degrees off the axis toward `side`."""
    phi = math.radians(deg)
    d = (math.cos(phi), side * math.sin(phi))
    n = (-d[1], d[0])
    tip = (s + d[0] * ln, t + d[1] * ln)
    midp = (s + d[0] * ln * 0.45, t + d[1] * ln * 0.45)
    pts = [(s, t), (midp[0] + n[0] * w / 2, midp[1] + n[1] * w / 2), tip, (midp[0] - n[0] * w / 2, midp[1] - n[1] * w / 2)]
    m = T.poly(pts)
    a.part(m, r, light=1, shade=1)
    return m


def orb(a: Art, T: Xf, s, t, rad, r, glint=True):
    m = T.circle(s, t, rad)
    a.part(m, r, light=1 if rad < 5 else 2, shade=1 if rad < 5 else 2)
    if glint:
        a.glint(circle_mask(*T(s - rad * 0.3, t - rad * 0.45), max(0.6, rad * 0.16)))
    return m


def crystal(a: Art, T: Xf, s, t, h, w, r, tilt=0.0):
    """A pointed crystal standing on local (s, t): a long hexagon cut in two lit faces."""
    pts = [(s, t - w / 2), (s + h * 0.72, t - w / 2 + tilt * 0.4), (s + h, t + tilt), (s + h * 0.72, t + w / 2 + tilt * 0.4), (s, t + w / 2)]
    m = T.poly(pts)
    a.part(m, r, light=1, shade=1, faces=[(T.poly([(s - 1, t - w), (s + h + 2, t - w), (s + h + 2, t + tilt * 0.5), (s - 1, t + tilt * 0.5)]), 1)])
    a.glint(T.line((s + 1.5, t - w * 0.25), (s + h * 0.6, t - w * 0.25 + tilt * 0.3), 0.8) & m)
    return m


def ring(a: Art, T: Xf, s, t, rad, r, width=1.6):
    m = T.circle(s, t, rad) & ~T.circle(s, t, rad - width)
    a.part(m, r, light=1, shade=1, lines=False)
    return m


# ======================================================================
# staff
# ======================================================================

def staff(p: dict) -> Art:
    """p: L, shaft (ramp), hw, foot (ramp), bands [(s, ramp)], back (callable), head (callable)."""
    a = Art()
    L = p["L"]
    T = p.get("T") or mid(L, *p.get("c", (50, 60)), deg=p.get("deg", 16))
    p["T"] = T
    hw = p.get("hw", 2.2)
    if p.get("back"):
        p["back"](a, T, p)
    sr = p.get("shaft", WOOD)
    sm = T.poly([(0, -hw), (L - 6, -hw * 0.9), (L - 6, hw * 0.9), (0, hw)])
    a.part(sm, sr, light=1, shade=1, lines=False, faces=[(T.half(-1), 1)] if hw > 2.4 else [])
    a.glint(T.line((6, -hw * 0.5), (L * 0.55, -hw * 0.5), 0.8) & sm)
    for s, br in p.get("bands", []):
        a.part(T.poly([(s - 1.3, -hw - 0.9), (s + 1.3, -hw - 0.9), (s + 1.3, hw + 0.9), (s - 1.3, hw + 0.9)]), br, light=1, shade=1)
    fr = p.get("foot", sr)
    a.part(T.poly([(-2.5, -hw - 0.6), (3.2, -hw - 0.6), (3.2, hw + 0.6), (-2.5, hw + 0.6)]), fr, light=1, shade=1)
    if p.get("head"):
        p["head"](a, T, p)
    if p.get("extras"):
        p["extras"](a, T, p)
    return a


# ======================================================================
# bow (vertical, bulging left, string on the right)
# ======================================================================

def bow(p: dict) -> Art:
    """p: half (half height), depth (bulge), w (limb thickness), limb (ramp), riser (ramp), tips (ramp),
    cx, cy, extras (callable(art, p)), string_col."""
    a = Art()
    half, depth, wmax = p["half"], p["depth"], p["w"]
    cx, cy = p.get("cx", 66), p.get("cy", 60)
    lim = p["limb"]
    N = 28
    left, right = [], []
    for i in range(N + 1):
        f = -1 + 2 * i / N
        x = cx + depth * (1 - f * f)
        y = cy + f * half
        w = wmax * (1 - 0.62 * abs(f) ** 1.5)
        left.append((x - w / 2, y))
        right.append((x + w / 2, y))
    # tips curl a touch back toward the string
    m = poly_mask(left + right[::-1])
    p["limb_mask"] = m
    if p.get("back"):
        p["back"](a, p)
    a.part(m, lim, light=1, shade=1, lines=False)
    # lit edge glint along the upper-left of the limb
    gl_ = np.zeros((H, W), bool)
    for y in range(int(cy - half * 0.7), int(cy - 9)):
        xs = np.nonzero(m[y])[0]
        if len(xs):
            gl_[y, xs[0] + 1] = True
    a.glint(gl_)
    # riser (grip wrap)
    rr = p.get("riser", LEATHER)
    gy0, gy1 = cy - 8, cy + 8
    xr = cx + depth
    rm = poly_mask([(xr - wmax * 0.5 - 1.8, gy0), (xr + wmax * 0.5 + 1.8, gy0), (xr + wmax * 0.5 + 1.8, gy1), (xr - wmax * 0.5 - 1.8, gy1)])
    a.part(rm, rr, light=1, shade=1)
    for yy in range(int(gy0) + 2, int(gy1), 3):
        a.px[line_mask((xr - wmax * 0.5 - 1.8, yy), (xr + wmax * 0.5 + 1.8, yy + 1), 0.9) & rm] = rr[4]
    tr = p.get("tips", rr)
    for sgn in (-1, 1):
        ty = cy + sgn * half
        a.part(circle_mask(cx - 0.4, ty - sgn * 1.5, 2.6), tr, light=1, shade=1)
    p["riser_mask"] = rm
    if p.get("extras"):
        p["extras"](a, p)
    a.string = ((cx - 0.4, cy - half + 1.5), (cx - 0.4, cy + half - 1.5))
    return a


# ======================================================================
# maul (hammer head up-left, handle down-right)
# ======================================================================

def maul(p: dict) -> Art:
    """p: L, head (ramp), band (ramp), handle (ramp), hl (head half length across), hh (head half height
    along the handle), cap (ramp), back (callable), extras (callable)."""
    a = Art()
    L = p["L"]
    T = p.get("T") or mid(L, *p.get("c", (54, 62)), deg=p.get("deg", -30))
    p["T"] = T
    hl, hh = p["hl"], p["hh"]
    hs = p.get("hs", L - hh - 3)  # head centre s
    p["hs"] = hs
    hr = p.get("handle", WOOD)
    if p.get("back"):
        p["back"](a, T, p)
    hm = T.poly([(0, -2.1), (hs, -2.1), (hs, 2.1), (0, 2.1)])
    a.part(hm, hr, light=1, shade=1, lines=False)
    k = 7.0
    while k < hs - hh:
        a.px[T.line((k, -2.1), (k - 2, 2.1), 0.9) & hm] = hr[4]
        k += 4.5
    a.part(T.circle(1.4, 0, 3.3), p.get("cap", p.get("band", IRON)), light=1, shade=1)
    hd = p["head"]
    body = T.poly([(hs - hh, -hl), (hs + hh, -hl), (hs + hh, hl), (hs - hh, hl)])
    if p.get("head_shape") == "crystal":
        body = T.poly([(hs - hh, -hl + 2), (hs - hh * 0.4, -hl - 1.5), (hs + hh * 0.5, -hl - 0.5), (hs + hh, -hl + 2), (hs + hh, hl - 2), (hs + hh * 0.5, hl + 0.5), (hs - hh * 0.4, hl + 1.5), (hs - hh, hl - 2)])
    if p.get("head_shape") == "wide":
        body = T.poly([(hs - hh, -hl), (hs + hh, -hl + 1.5), (hs + hh, hl - 1.5), (hs - hh, hl)])
    a.part(body, hd, light=2, shade=2, faces=[(T.half(-1, hs - 99, hs + 99) & T.poly([(hs - hh - 1, -99), (hs + hh + 1, -99), (hs + hh + 1, 99), (hs - hh - 1, 99)]), 1)] if False else [])
    a.glint(T.line((hs - hh + 1.2, -hl + 2.5), (hs - hh + 1.2, -hl + 7), 0.9) & body)
    a.glint(T.line((hs - hh + 2, -hl + 1.5), (hs + hh - 2, -hl + 1.5), 0.9) & body)
    br = p.get("band")
    if br is not None:
        for sgn in (-1, 1):
            a.part(T.poly([(hs - hh - 0.8, sgn * (hl - 5.2)), (hs + hh + 0.8, sgn * (hl - 5.2)), (hs + hh + 0.8, sgn * (hl - 1.6)), (hs - hh - 0.8, sgn * (hl - 1.6))]), br, light=1, shade=1)
    if p.get("extras"):
        p["extras"](a, T, p)
    return a
