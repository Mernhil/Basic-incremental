"""B1 Starlight icon: five 48 x 48 options in the approved coin family."""
import math

from px import *  # noqa: F403

C = 23.5
WELL = H("#1d2335")


def coin_base(name, well=WELL):
    """Approved coin rim (sticker ring, rim metal, inner ring) with the well emptied."""
    img = sprite(name)
    for y in range(48):
        for x in range(48):
            if math.hypot(x - C, y - C) <= 14.6:
                img.putpixel((x, y), well)
    return img


def gem_layer(draw):
    g = new(48, 48)
    draw(g)
    outline(g)
    return g


def star_gem(g, n, ro, ri, rp, rot=-math.pi / 2, cx=C, cy=C):
    pts = star_pts(cx, cy, n, ro, ri, rot)
    facet_gem(g, pts, rp, cx, cy, table=0.0)
    # inner ridge: lit edge on every point (medal technique)
    for i in range(0, len(pts), 2):
        x, y = pts[i]
        ln(g, [(cx + (x - cx) * 0.25, cy + (y - cy) * 0.25), (cx + (x - cx) * 0.8, cy + (y - cy) * 0.8)], rp[4])
    put(g, round(cx), round(cy), WHITE)


PALE_GOLD = ramp("#f5d15a")
MOON = ramp("#c9b8ff")


def opt_a():
    img = coin_base("coin-round-silver")
    g = gem_layer(lambda g: star_gem(g, 4, 12, 4.2, PALE_GOLD))
    img.alpha_composite(g)
    plus(img, 33, 14, WHITE)
    return img


def opt_b():
    img = coin_base("coin-round-gold", well=H("#151a3a"))
    # recolour the gold rim into night indigo, keep the gold sticker ring
    # (by brightness, so it follows whatever the gold coin's rim is drawn with)
    nr = ramp("#4b4fb8")
    ring_c, ink = H("#ffd84a"), H("#1a1020")
    rim = {}
    for y in range(48):
        for x in range(48):
            p = img.getpixel((x, y))
            if p[3] and math.hypot(x - C, y - C) > 14.6 and p[:3] not in (ring_c[:3], ink[:3], WHITE[:3]):
                rim.setdefault(p[:3], []).append((x, y))
    tones = sorted(rim, key=lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])
    for i, c in enumerate(tones):
        for x, y in rim[c]:
            img.putpixel((x, y), nr[min(4, i * 5 // len(tones))])
    for x, y in ((14, 18), (31, 13), (34, 30), (16, 31)):
        put(img, x, y, H("#9aa6ff"))
    g = gem_layer(lambda g: star_gem(g, 5, 10.5, 4.6, PALE_GOLD, cy=C + 0.5))
    img.alpha_composite(g)
    return img


def opt_c():
    img = new(48, 48)
    g = new(48, 48)
    pts = []
    for i in range(16):
        a = -math.pi / 2 + i * math.pi / 8
        r = 21 if i % 4 == 0 else (11.5 if i % 4 == 2 else 6.5)
        pts.append((C + r * math.cos(a), C + r * math.sin(a)))
    facet_gem(g, pts, PALE_GOLD, C, C, table=0.0)
    for i in range(0, 16, 4):
        x, y = pts[i]
        ln(g, [(C + (x - C) * 0.2, C + (y - C) * 0.2), (C + (x - C) * 0.85, C + (y - C) * 0.85)], PALE_GOLD[4])
    put(g, 23, 23, WHITE)
    put(g, 24, 23, WHITE)
    put(g, 23, 24, WHITE)
    outline(g)
    ring(g, WHITE)
    img.alpha_composite(g)
    plus(img, 37, 10, WHITE)
    return img


def opt_d():
    img = coin_base("coin-round-prism")
    g = gem_layer(lambda g: star_gem(g, 4, 12, 3.6, MOON, rot=-math.pi / 2))
    img.alpha_composite(g)
    g2 = new(48, 48)
    star_gem(g2, 4, 6, 2.2, ramp("#ffffff"), rot=-math.pi / 4)
    for y in range(48):
        for x in range(48):
            p = g2.getpixel((x, y))
            if p[3] and math.hypot(x - C, y - C) < 5:
                img.putpixel((x, y), p if p[:3] != (255, 255, 255) else WHITE)
    put(img, 23, 23, WHITE)
    put(img, 24, 24, WHITE)
    return img


def opt_e():
    img = coin_base("coin-round-gold", well=H("#121735"))
    stars = [(14, 27), (19, 17), (27, 21), (33, 14), (31, 31)]
    line_c = H("#5560a8")
    for a, b in ((0, 1), (1, 2), (2, 3), (2, 4)):
        ln(img, [stars[a], stars[b]], line_c)
    for i, (x, y) in enumerate(stars):
        big = i in (2, 4)
        plus(img, x, y, PALE_GOLD[3], arm=2 if big else 1, core=WHITE)
    return img


OPTIONS = [("A", opt_a), ("B", opt_b), ("C", opt_c), ("D", opt_d), ("E", opt_e)]
