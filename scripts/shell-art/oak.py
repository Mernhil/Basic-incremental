"""Carved Oak shell pieces (UI_RULES.md §2 Shell look, ASSET_RULES.md §5 Shell pieces).

Draws the small 9-slice pieces of the Carved Oak table into src/renderer/src/art/shell/oak/. Free: Pillow
plus cuts from the wood card kit (art/pixel/hand/kit-wood.png); the gold of the corner caps and edges is
the palette of the gold card kit (kit-gold.png). No PixelLab call.

Every piece is one PNG laid out [corner | tile | corner] in both directions at its final pixel size.
The browser tiles the middle and never stretches it (theme/shellOak.css, `border-image` on a zero-width
border). Sizes below are in image pixels = CSS px at 100% Windows scale; the CSS shows one image pixel
as a whole number of device pixels.

Run:  python scripts/shell-art/oak.py   (needs Pillow)
"""
import json
import os
import random

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
KIT = os.path.join(ROOT, 'src', 'renderer', 'src', 'art', 'pixel', 'hand', 'kit-wood.png')
OUT = os.path.join(ROOT, 'src', 'renderer', 'src', 'art', 'shell', 'oak')
os.makedirs(OUT, exist_ok=True)
CLEAR = (0, 0, 0, 0)
FLR, FTB = Image.FLIP_LEFT_RIGHT, Image.FLIP_TOP_BOTTOM
meta = {}


def C(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# palette ------------------------------------------------------------------------------------------
CREAM, CREAM_LT = C('f6ead0'), C('fdf5df')
INK_EDGE = C('3a2410')
GOLD, GOLD_HI, GOLD_LO = C('f4c14a'), C('ffe08a'), C('a87a22')
RED, RED_HI, RED_LO, RED_EDGE = C('a8322a'), C('d4574a'), C('6e1c18'), C('2a0c0a')
TAN, TAN_HI, TAN_LO = C('bfad86'), C('cdbb94'), C('a8956c')
WOOD_EDGE = C('0b0100')
KIT_FILL = C('241a12')  # the kit's dark plate fill, swapped for the piece's own fill
# gold caps (the gold card kit's ramp)
GO, G1, G2, G3, G4, G5 = C('0b0100'), C('fdec90'), C('f4c23b'), C('eab94d'), C('bd934f'), C('7a4a08')


def save(name, im, corner=0, outset=0, scale=1):
    """Saves the piece (scaled up by whole `scale` when it was drawn on a coarser pixel grid) and records
    its slice (`corner`, in image px) and outset (image px)."""
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(os.path.join(OUT, name + '.png'))
    meta[name] = {'w': im.width, 'h': im.height, 'corner': corner * scale, 'outset': outset}


def frame(c, t, tl, br, fill, seed=1, speck=None, notch=0, grain=False):
    """A square piece of 2c+t px: rings from the outside in (`tl` for the top-left half, `br` for the
    bottom-right half), a flat `fill`, optional wood speckle on the middle rings, notched corners."""
    s = 2 * c + t
    im = Image.new('RGBA', (s, s), CLEAR)
    px = im.load()
    n = len(tl)
    for y in range(s):
        for x in range(s):
            d = min(x, y, s - 1 - x, s - 1 - y)
            if d >= n:
                px[x, y] = fill
                continue
            near_tl = min(x, y) <= min(s - 1 - x, s - 1 - y)
            col = (tl if near_tl else br)[d]
            if speck and 0 < d < n - 1:
                along = x if min(y, s - 1 - y) <= min(x, s - 1 - x) else y
                k = ((along - c) % t) // 3 if grain and c <= along < c + t else (along - c) % t if c <= along < c + t else along + 99
                r = random.Random(seed * 7919 + d * 131 + k + (0 if near_tl else 5000))
                if r.random() < speck[1]:
                    col = r.choice(speck[0])
            px[x, y] = col
    for k in range(notch):
        for j in range(notch - k):
            for (xx, yy) in ((k, j), (s - 1 - k, j), (k, s - 1 - j), (s - 1 - k, s - 1 - j)):
                px[xx, yy] = CLEAR
    return im


# ---- the wood kit cuts ------------------------------------------------------------------------
kit = Image.open(KIT).convert('RGBA')
KIT_TH = 18  # the kit's own edge is 18 thick; the piece thins it to 13 by cutting the middle 5 px


def mirror_v(strip):
    out = Image.new('RGBA', (strip.width, strip.height * 2))
    out.paste(strip, (0, 0))
    out.paste(strip.transpose(FTB), (0, strip.height))
    return out


def cut(im, xs=None, ys=None):
    """Removes columns xs (a, b) and rows ys (a, b) inclusive."""
    cols = [x for x in range(im.width) if not (xs and xs[0] <= x <= xs[1])]
    rows = [y for y in range(im.height) if not (ys and ys[0] <= y <= ys[1])]
    out = Image.new('RGBA', (len(cols), len(rows)))
    src, dst = im.load(), out.load()
    for j, y in enumerate(rows):
        for i, x in enumerate(cols):
            dst[i, j] = src[x, y]
    return out


def swap(im, to):
    p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if p[x, y] == KIT_FILL:
                p[x, y] = to
    return im


def kit_parts():
    """Corner (20x20), top edge (40x18) and left edge (20x40) of the kit frame, fill left as KIT_FILL."""
    left = mirror_v(kit.crop((27, 100, 27 + KIT_TH, 120)))  # 18 x 40, straight grain
    top = left.transpose(Image.TRANSPOSE)
    corner = kit.crop((27, 22, 47, 42)).copy()
    cp = corner.load()
    for y in range(20):
        for x in range(20):
            if x >= KIT_TH and y >= KIT_TH:
                cp[x, y] = KIT_FILL
            elif cp[x, y][3] < 128:
                cp[x, y] = CLEAR
    el = Image.new('RGBA', (20, 40), KIT_FILL)
    el.paste(left, (0, 0))
    et = Image.new('RGBA', (40, 20), KIT_FILL)
    et.paste(top, (0, 0))
    return corner, et, el


def nine(c, t, corners, edge_top, edge_left, fill):
    """Assembles [c | t | c]^2. `corners` = (tl, tr, bl, br); the other edges are mirrors."""
    s = 2 * c + t
    im = Image.new('RGBA', (s, s), CLEAR)
    px = im.load()
    for y in range(c, c + t):
        for x in range(c, c + t):
            px[x, y] = fill
    tl, tr, bl, br = corners
    im.paste(tl, (0, 0))
    im.paste(tr, (c + t, 0))
    im.paste(bl, (0, c + t))
    im.paste(br, (c + t, c + t))
    im.paste(edge_top, (c, 0))
    im.paste(edge_top.transpose(FTB), (c, c + t))
    im.paste(edge_left, (0, c))
    im.paste(edge_left.transpose(FLR), (c + t, c))
    return im


# ---- gilded corner caps: each corner has its own lighting (light from the top-left) -------------
TH, CS, ARM = 13, 32, 30  # wood thickness, corner size, gold arm length


def ramp_lit(d):  # the side facing the light: bright on the outside, darker inward
    return GO if d in (0, TH - 1) else G1 if d == 1 else G2 if d < 5 else G3 if d < 8 else G4 if d < 11 else G5


def ramp_shade(d):  # the side facing away: dark on the outside, bright inward
    return GO if d in (0, TH - 1) else G5 if d < 3 else G4 if d < 6 else G3 if d < 9 else G2 if d < 11 else G1


def cap(wood_corner, top_lit, side_lit):
    """Draws the gold cap on a top-left-oriented corner. `top_lit`: the horizontal arm faces the light;
    `side_lit`: the vertical arm does. The result is flipped for the other three corners."""
    cor = wood_corner.copy()
    p = cor.load()
    for a in range(ARM):  # along the arm
        taper = max(0, a - (ARM - 4))  # the last 3 px step in from both sides
        for d in range(TH):
            if not (taper <= d <= TH - 1 - taper):
                continue
            edge = d in (taper, TH - 1 - taper) or a == ARM - 1
            if a >= d:  # the horizontal arm owns the diagonal half
                p[a, d] = GO if edge else (ramp_lit if top_lit else ramp_shade)(d)
            if a > d:
                p[d, a] = GO if edge else (ramp_lit if side_lit else ramp_shade)(d)
    for i in range(TH):  # the mitre line
        p[i, i] = G1 if 1 <= i < TH - 1 else GO
    for (x, y, col) in ((5, 5, GO), (6, 5, GO), (5, 6, GO), (6, 6, G5), (4, 4, G1)):  # the stud
        p[x, y] = col
    p[0, 0] = CLEAR
    return cor


def sheet(inside):
    """Sheet frame (104x104, corner 32, tile 40) and, with a clear `inside`, the dungeon window frame."""
    corner, et, el = kit_parts()
    k = (8, 12)
    c2 = swap(cut(corner, k, k), inside)
    t2 = swap(cut(et, None, k), inside)
    l2 = swap(cut(el, k, None), inside)
    wood = Image.new('RGBA', (CS, CS), inside)
    wood.paste(t2.crop((0, 0, CS - 15, 15)), (15, 0))
    wood.paste(l2.crop((0, 0, 15, CS - 15)), (0, 15))
    wood.paste(c2, (0, 0))
    tl = cap(wood, True, True)
    tr = cap(wood, True, False).transpose(FLR)
    bl = cap(wood, False, True).transpose(FTB)
    br = cap(wood, False, False).transpose(FLR).transpose(FTB)
    et2 = Image.new('RGBA', (40, CS), inside)
    et2.paste(t2, (0, 0))
    el2 = Image.new('RGBA', (CS, 40), inside)
    el2.paste(l2, (0, 0))
    return nine(CS, 40, (tl, tr, bl, br), et2, el2, inside)


save('sheet', sheet(CREAM), CS, outset=6)
save('window', sheet(CLEAR), CS, outset=11)

# ---- thin wood plate and tile (22x22, corner 5, tile 12) ---------------------------------------------
WR = dict(seed=71, speck=([C('855b32'), C('623e24'), C('956a3a')], 0.4), grain=True)
WOOD_TL = [WOOD_EDGE, C('bb8c5c'), C('a27540'), C('744c2b'), WOOD_EDGE]
WOOD_BR = [WOOD_EDGE, C('58341d'), C('744c2b'), C('855b32'), WOOD_EDGE]
save('plate', frame(5, 12, WOOD_TL, WOOD_BR, CREAM, **WR), 5, outset=2)
save('tile', frame(5, 12, WOOD_TL, WOOD_BR, CREAM_LT, **WR), 5, outset=2)

# ---- readout pill, buttons (32x32, corner 8 = 4 art px at 2x) -------------------------------------------
FOCUS = C('fff1d0')


def button(name, tl, br, fill, ring=None):
    """The base piece and its states are the same frame; `ring` adds the bright outer ring of keyboard focus."""
    if ring:
        tl, br = [ring, tl[0]] + tl[1:], [ring, br[0]] + br[1:]
    save(name, frame(4, 8, tl, br, fill, notch=1), 4, outset=2, scale=2)


button('pill', [INK_EDGE, GOLD], [INK_EDGE, GOLD_LO], CREAM)
for suffix, fill, tl, br, ring in (
    ('', CREAM_LT, [INK_EDGE, GOLD_HI], [INK_EDGE, GOLD_LO], None),
    ('-hover', C('ffffff'), [INK_EDGE, GOLD_HI], [INK_EDGE, GOLD], None),
    ('-press', C('ecdcb5'), [INK_EDGE, GOLD_LO], [INK_EDGE, GOLD_LO], None),
    ('-focus', CREAM_LT, [INK_EDGE, GOLD_HI], [INK_EDGE, GOLD_LO], FOCUS),
):
    button('btn' + suffix, tl, br, fill, ring)
for suffix, fill, tl, br, ring in (
    ('', RED, [RED_EDGE, GOLD_HI, RED_HI], [RED_EDGE, GOLD_LO, RED_LO], None),
    ('-hover', C('bd3b32'), [RED_EDGE, GOLD_HI, RED_HI], [RED_EDGE, GOLD, RED_LO], None),
    ('-press', C('8e2820'), [RED_EDGE, GOLD_LO, RED_LO], [RED_EDGE, GOLD_LO, RED_LO], None),
    ('-focus', RED, [RED_EDGE, GOLD_HI, RED_HI], [RED_EDGE, GOLD_LO, RED_LO], FOCUS),
):
    button('action' + suffix, tl, br, fill, ring)
button('unusable', [INK_EDGE, TAN_HI], [INK_EDGE, TAN_LO], TAN)


# ---- header and dock planks (64x32, tiled whole) -------------------------------------------------------
def planks(x, y):
    yy = y % 16
    r = random.Random((y // 16) * 53 + (x // 7) * 3 + yy * 11)
    if yy == 15:
        return C('140c06')
    if yy == 0:
        return C('4a321e')
    return C('3f2a18') if r.random() < 0.16 else C('36230f') if r.random() < 0.1 else C('3a2616')


bar = Image.new('RGBA', (64, 32))
bp = bar.load()
for yy in range(32):
    for xx in range(64):
        bp[xx, yy] = planks(xx, yy)
save('bar', bar)

json.dump(meta, open(os.path.join(OUT, 'pieces.json'), 'w'), indent=1)
print(len(meta), 'pieces ->', OUT)
