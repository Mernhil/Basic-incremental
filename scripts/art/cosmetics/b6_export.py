"""B6 achievement stickers: the mini card (approved 2026-11-08) in five frame steps, the 29
achievement pictures (ach_pictures.py) and the card-shard icon.

A sticker is a tiny card echoing the Knight plate frame: a chapter-coloured band, metal corner
caps, a crest gem on top, a dark window holding the achievement picture and a metal nameplate
with three chapter pips or the tier numeral. The five sticker styles climb the card-tier ladder,
each visibly fancier than the last: a bronze (plain), b silver (corner spikes), c gold (side
spikes, gold trim, big crest), d legendary gold (crown crest with a glow, ruby studs, double
trim), e prismatic (rainbow metal, nameplate wings, radiant crown). Locked is the face-down card
back with a padlock, in the style's frame, muted.

Layers drawn by stickerArt (art/cosmetics.ts), all on the 74 x 74 grid:
  cos-sticker-<style>-<chapter|locked>   the card (nameplate with pips)
  cos-ach-<id>                           the picture, PIC x PIC, at WINDOW
  cos-sticker-<style>-plate-<numeral>    the nameplate with a numeral, at PLATE (covers the pips)
"""
from PIL import ImageChops

from ach_pictures import NUMERALS, PIC, PICTURES, picture
from glyphs import numeral as glyph
from px import *  # noqa: F403

CHAPTERS = {
    "gathering": "#4caf3a",
    "battle": "#e0443a",
    "cards": "#f2c230",
    "wardrobe": "#9b5cff",
    "journey": "#3b6be0",
}
STYLES = {"a": "Mini card", "b": "Silver card", "c": "Gold card", "d": "Legendary card", "e": "Prismatic card"}
S = 74
X0, Y0, X1, Y1 = 10, 4, 63, 72
WINDOW = (X0 + 5, Y0 + 7)  # the picture's top-left
PLATE = (X0 + 5, Y1 - 15, X1 - 5, Y1 - 6)  # inclusive
CX = (X0 + X1) / 2 + 0.5

BRONZE = ramp("#c8813f")
SILVER = ramp("#c9d2e3")
GOLD = ramp("#f2b630")
RICH = ramp("#ffc12e")
PEARL = ramp("#e4dcfa")
STEEL = ramp("#b9c3dc")
SLATE = ramp("#5b5f70")
IRON = ramp("#6c7183")
RUBY = ramp("#e0443a")
SAPPH = ramp("#3b78e8")
EMER = ramp("#2fbf6a")
PINK = ramp("#ff8ad8")
WIN = ramp("#262c4a")
PASTELS = [ramp(c) for c in ("#ff8fb0", "#ffd36e", "#7fe8a0", "#7cc8ff", "#c09cff")]
NUMINK = ramp("#5a2a1a")
SHARD_GOLD = ramp("#f2c230")

METAL = {"a": BRONZE, "b": SILVER, "c": GOLD, "d": RICH, "e": PEARL}


def muted(rp, t=0.6):
    return [mix(c, IRON[i], t) for i, c in enumerate(rp)]


def layer():
    return new(S, S)


def put_part(img, L, rp, d=1, glint=False):
    part(img, cel(L, rp, d=d, glint=glint), do_bevel=False)


def prism(L, rp=PEARL):
    """Recolour a cel-shaded pearl layer into diagonal pastel facets (keeps each pixel's tone)."""
    px_ = L.load()
    for y in range(S):
        for x in range(S):
            p = px_[x, y]
            if not p[3] or p[:3] == (255, 255, 255):
                continue
            t = next((i for i, c in enumerate(rp) if c[:3] == p[:3]), None)
            if t is not None:
                px_[x, y] = PASTELS[((x + y) // 3) % len(PASTELS)][t]
    return L


def mirror_pts(pts):
    return [(S - 1 - x, y) for x, y in pts]


# ---------------- frame ornaments, back to front ----------------

def wings(img, rp, rainbow):
    left = [(11, 56), (7, 51), (1, 50), (3, 55), (0, 58), (3, 62), (0, 66), (6, 68), (11, 67)]
    for pts in (left, mirror_pts(left)):
        L = layer()
        poly(L, pts, rp[2])
        L = cel(L, rp, d=2, glint=False)
        if rainbow:
            prism(L, rp)
        part(img, L, do_bevel=False)
    for y0, y1 in ((56, 60), (61, 64)):
        ln(img, [(2, y0 + 1), (9, y1)], rp[0])
        ln(img, [(S - 3, y0 + 1), (S - 10, y1)], rp[0])


def side_spikes(img, rp):
    left = [(11, 31), (2, 38), (11, 45)]
    for pts in (left, mirror_pts(left)):
        L = layer()
        poly(L, pts, rp[2])
        put_part(img, L, rp, d=2)


def corner_spikes(img, rp):
    top = [(11, 5), (4, 5), (11, 12)]
    bottom = [(x, Y0 + Y1 - y) for x, y in top]
    for pts in (top, bottom, mirror_pts(top), mirror_pts(bottom)):
        L = layer()
        poly(L, pts, rp[2])
        put_part(img, L, rp, d=1)


def caps(img, rp, rainbow, studs=None):
    for i, (cx, cy, sx, sy) in enumerate(((X0, Y0, 1, 1), (X1, Y0, -1, 1), (X0, Y1, 1, -1), (X1, Y1, -1, -1))):
        L = layer()
        poly(L, [(cx, cy), (cx + 8 * sx, cy), (cx + 8 * sx, cy + 3 * sy), (cx + 3 * sx, cy + 3 * sy),
                 (cx + 3 * sx, cy + 8 * sy), (cx, cy + 8 * sy)], rp[2])
        L = cel(L, rp, d=1, glint=False)
        if rainbow:
            prism(L, rp)
        img.alpha_composite(L)
        if studs:
            G = layer()
            gx, gy = cx + 1.5 * sx, cy + 2 * sy
            facet_gem(G, ngon(gx, gy, 4, 2.2, rot=0), studs[i], gx, gy, table=0, glint=False)
            img.alpha_composite(G)


def trim(img, rp, outer=False):
    D(img).rectangle([X0 + 3, Y0 + 4, X1 - 3, Y1 - 4], outline=rp[3])
    if outer:
        D(img).rectangle([X0 + 1, Y0 + 1, X1 - 1, Y1 - 1], outline=rp[2])
        D(img).line([(X0 + 1, Y0 + 1), (X1 - 1, Y0 + 1)], fill=rp[4])


def crest(img, style, cat, rp, lit):
    if style == "a":
        G = layer()
        facet_gem(G, ngon(CX, 5.5, 4, 4.5, rot=0), cat, CX, 5.5, table=0, glint=lit)
        img.alpha_composite(G)
        return
    if style in "bc":
        M = layer()
        if style == "b":
            ell(M, CX - 5.5, 1, CX + 5.5, 12, rp[2])
        else:
            poly(M, [(CX, 1), (CX + 8, 7), (CX, 13), (CX - 8, 7)], rp[2])
        put_part(img, M, rp, d=2)
        G = layer()
        cy = 6.5 if style == "b" else 7
        facet_gem(G, ngon(CX, cy, 4, 3.6 if style == "b" else 4.4, rot=0), cat, CX, cy, table=0, glint=lit)
        outline(G, rp[0])
        img.alpha_composite(G)
        return
    # d and e: a crown on the top band
    Cr = layer()
    pts = [(CX - 10, 10), (CX - 10, 3), (CX - 6, 6), (CX - 3, 1), (CX, 4), (CX + 3, 1), (CX + 6, 6), (CX + 10, 3), (CX + 10, 10)]
    poly(Cr, pts, rp[2])
    Cr = cel(Cr, rp, d=2, glint=False)
    if style == "e" and lit:
        prism(Cr, rp)
    part(img, Cr, do_bevel=False)
    G = layer()
    gem_rp = cat if style == "d" or not lit else PINK
    facet_gem(G, ngon(CX, 7, 6 if style == "e" else 4, 3.8, rot=0), gem_rp, CX, 7, table=0, glint=lit)
    outline(G, rp[0])
    img.alpha_composite(G)


def glow(img, style, cat, lit):
    """After the outline: the legendary crest's glow, the prismatic rays."""
    if not lit:
        return
    if style == "d":
        for x in (int(CX - 14.5), int(CX + 13.5)):
            plus(img, x, 3, cat[4], arm=1, core=WHITE)
    elif style == "e":
        plus(img, int(CX - 19.5), 2, WHITE)
        plus(img, int(CX + 18.5), 2, WHITE)


# ---------------- the card ----------------

def plate(img, style, cat, rp, num):
    Pl = layer()
    rect(Pl, *PLATE, rp[2])
    img.alpha_composite(cel(Pl, rp, d=2, glint=False))
    mid = (PLATE[0] + PLATE[2]) / 2 + 0.5
    my = PLATE[3] - 4
    if num:
        n = glyph(num, NUMINK if style != "e" else ramp("#4a2a7a"), 1, bold=not num.startswith("I"))
        n = n.crop(n.getbbox())
        img.alpha_composite(n, (int(round(mid - n.width / 2)), int(round(my - n.height / 2))))
    else:
        for dx in (-8, 0, 8):
            St = layer()
            facet_gem(St, ngon(mid + dx, my - 0.5, 4, 3.2, rot=0), cat, table=0, glint=False)
            outline(St)
            img.alpha_composite(St)
    if style == "d":
        for x in (PLATE[0] + 4, PLATE[2] - 4):
            G = layer()
            facet_gem(G, ngon(x, my - 0.5, 4, 2.6, rot=0), RUBY, table=0, glint=False)
            img.alpha_composite(G)


def back(img, style):
    """The face-down card back: a slate lattice inside the band, ruled frames from c up."""
    Bk = layer()
    rect(Bk, X0 + 5, Y0 + 6, X1 - 5, Y1 - 6, SLATE[1])
    for k in range(-80, 80, 7):
        ln(Bk, [(X0 + 5 + k, Y0 + 6), (X0 + 5 + k + 70, Y0 + 76)], SLATE[2])
        ln(Bk, [(X1 - 5 - k, Y0 + 6), (X1 - 5 - k - 70, Y0 + 76)], SLATE[2])
    clip = layer()
    rect(clip, X0 + 5, Y0 + 6, X1 - 5, Y1 - 6, WHITE)
    Bk.putalpha(ImageChops.multiply(alpha_mask(Bk), alpha_mask(clip)))
    img.alpha_composite(Bk)
    if style in "cde":
        D(img).rectangle([X0 + 8, Y0 + 9, X1 - 8, Y1 - 9], outline=SLATE[3])
    if style in "de":
        D(img).rectangle([X0 + 10, Y0 + 11, X1 - 10, Y1 - 11], outline=SLATE[3])


def padlock(img, x, y):
    L = layer()
    D(L).arc([x + 2, y, x + 11, y + 10], 180, 360, fill=STEEL[2], width=3)
    rect(L, x + 2, y + 5, x + 4, y + 7, STEEL[2])
    rect(L, x + 9, y + 5, x + 11, y + 7, STEEL[2])
    rect(L, x, y + 7, x + 13, y + 17, GOLD[2])
    rect(L, x, y + 7, x + 13, y + 8, GOLD[3])
    rect(L, x + 10, y + 9, x + 13, y + 17, GOLD[1])
    rect(L, x + 6, y + 10, x + 7, y + 14, DEEP)
    put(L, x + 1, y + 8, WHITE)
    outline(L)
    ring(L, WHITE)
    img.alpha_composite(L)


def card(style, chapter, num=None):
    lit = chapter != "locked"
    img = layer()
    rp = METAL[style] if lit else muted(METAL[style])
    frame = ramp(CHAPTERS[chapter]) if lit else IRON
    cat = frame if lit else SLATE
    rainbow = style == "e" and lit

    # behind the band
    if style == "e":
        wings(img, rp, rainbow)
    if style in "cde":
        side_spikes(img, rp)
    if style in "bcde":
        corner_spikes(img, rp)

    # the band, its trim and the window or the back
    F = layer()
    rect(F, X0, Y0, X1, Y1, frame[2])
    img.alpha_composite(cel(F, frame, d=3, glint=False))
    rect(img, X0 + 4, Y0 + 5, X1 - 4, Y1 - 5, frame[0])
    if style in "cde":
        T = layer()
        trim(T, rp, outer=style == "d")
        if rainbow:
            prism(T, rp)
        img.alpha_composite(T)
    if lit:
        rect(img, X0 + 5, Y0 + 6, X1 - 5, Y1 - 17, WIN[2])
        rect(img, X0 + 5, Y0 + 6, X1 - 5, Y0 + 7, WIN[1])
        rect(img, X0 + 5, Y0 + 6, X0 + 6, Y1 - 17, WIN[1])
        Bd = layer()
        ell(Bd, X0 + 9, Y0 + 10, X1 - 9, Y1 - 22, mix(WIN[2], frame[1], 0.35))
        img.alpha_composite(Bd)
        plate(img, style, cat, rp, num)
    else:
        back(img, style)

    studs = None
    if lit:
        studs = {
            "b": [SAPPH, SAPPH, cat, cat],
            "c": [SAPPH, SAPPH, EMER, EMER],
            "d": [RUBY] * 4,
            "e": PASTELS[:4],
        }.get(style)
    caps(img, rp, rainbow, studs=studs)
    crest(img, style, cat, rp, lit)
    outline(img)
    glow(img, style, cat, lit)
    if not lit:
        padlock(img, 30, 27)
    return sweep_orphans(img)


def plate_sprite(style, num):
    """The nameplate of a card carrying a numeral, cut to the plate rect."""
    full = card(style, "battle", num)
    x0, y0, x1, y1 = PLATE
    return full.crop((x0, y0, x1 + 1, y1 + 1))


def sticker(style, aid, chapter, unlocked=True):
    """The whole sticker as the game layers it (for sheets and checks)."""
    img = card(style, chapter if unlocked else "locked")
    if unlocked:
        img.alpha_composite(picture(aid), WINDOW)
        if aid in NUMERALS:
            img.alpha_composite(plate_sprite(style, NUMERALS[aid]), PLATE[:2])
    return img


def card_shard():
    """The card-shard icon (32 x 32): a broken corner of a card with its gem."""
    g = new(32, 32)
    P = new(32, 32)
    poly(P, [(5, 4), (24, 4), (27, 14), (20, 17), (23, 24), (13, 28), (5, 22)], SHARD_GOLD[2])
    poly(P, [(5, 4), (24, 4), (22, 8), (8, 8), (8, 22), (5, 22)], SHARD_GOLD[3])
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
    nums = sorted(set(NUMERALS.values()))
    for st in STYLES:
        for ch in list(CHAPTERS) + ["locked"]:
            emit(f"sticker-{st}-{ch}", card(st, ch))
        for n in nums:
            emit(f"sticker-{st}-plate-{n}", plate_sprite(st, n), sweep=False)
    for aid in PICTURES:
        emit(f"ach-{aid}", picture(aid))
    emit("card-shard", card_shard())
    meta["stickers"] = dict(
        styles=STYLES, chapters=list(CHAPTERS), achievements=sorted(PICTURES),
        numerals=dict(sorted(NUMERALS.items())), size=S, art=PIC, window=list(WINDOW),
        plate=[PLATE[0], PLATE[1], PLATE[2] - PLATE[0] + 1, PLATE[3] - PLATE[1] + 1],
    )
    meta["skins"]["sticker"] = list(STYLES)
