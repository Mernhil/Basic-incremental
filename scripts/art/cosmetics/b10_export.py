"""B10 Wardrobe chrome: the pixel pieces of five Wardrobe styles (slot plate, item tile, selected
tile, item socket, level-ladder rungs and links). Plates and tiles are nine-slice pieces (the
slice inset is in the meta); rungs are 16 x 16; links repeat horizontally.

a Sockets: dark steel with round gem sockets and gold coins on the ladder.
b Gilt plaques: brown plaques in an ink / gold / ink bevel; square gilt rungs.
c Quiet ink: almost no chrome, an underline and corner ticks; flat bar rungs.
d Banners: pennants notched at the end; chevron rungs.
e Rarity glass: glass panes tinted by the item's rarity (one piece per rarity); rising bars.
"""
from px import *  # noqa: F403

RARITY = {
    "common": "#c9ced6", "rare": "#5aa8ff", "epic": "#b67bff", "legendary": "#ffc23a",
    "mythic": "#ff4fb8", "exotic": "#ff8a1f", "void": "#8a5cff",
}
STEEL = ramp("#3a404c")
GILT = ramp("#d9b35a")
BROWN = ramp("#3a2f1c")
SLATE = ramp("#2e333d")
INKM = ramp("#6b7280")
STYLES = {"a": "Sockets", "b": "Gilt plaques", "c": "Quiet ink", "d": "Banners", "e": "Rarity glass"}


def box(w, h, fill, line=None, top=None):
    img = new(w, h)
    rect(img, 1, 1, w - 2, h - 2, fill)
    if line:
        D(img).rectangle([1, 1, w - 2, h - 2], outline=line)
    if top:
        rect(img, 2, 2, w - 3, 2, top)
    # round the corners by one pixel
    for x, y in ((1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)):
        put(img, x, y, CLEAR)
    outline(img)
    return img


def plate(style, on=False, rar=None):
    w, h = 48, 24
    if style == "a":
        img = box(w, h, STEEL[2], GILT[1] if not on else GILT[3], STEEL[3])
        for x, y in ((3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)):
            put(img, x, y, GILT[3])
    elif style == "b":
        img = box(w, h, BROWN[2], GILT[3] if on else GILT[2], BROWN[3])
        D(img).rectangle([3, 3, w - 4, h - 4], outline=INK)
        for x, y in ((4, 4), (w - 5, 4), (4, h - 5), (w - 5, h - 5)):
            put(img, x, y, GILT[4])
    elif style == "c":
        img = new(w, h)
        rect(img, 1, h - 3, w - 2, h - 3 if not on else h - 2, INKM[3] if on else INKM[2])
        rect(img, 1, h - 7, 1, h - 3, INKM[2])
        rect(img, w - 2, h - 7, w - 2, h - 3, INKM[2])
    elif style == "d":
        img = new(w, h)
        poly(img, [(1, 1), (w - 7, 1), (w - 2, h // 2), (w - 7, h - 2), (1, h - 2)], SLATE[3] if on else SLATE[2])
        rect(img, 1, 1, 3, h - 2, GILT[2] if on else INKM[3])
        rect(img, 4, 2, w - 8, 2, SLATE[3])
        outline(img)
    else:
        c = ramp(RARITY[rar])
        img = box(w, h, mix(H("#1c2028"), c[2], 0.22 if not on else 0.34), c[2] if not on else c[3],
                  mix(H("#1c2028"), c[3], 0.4))
        for i in range(6):
            put(img, 3 + i, 3 + 5 - i, mix(H("#1c2028"), c[4], 0.6))
    return img


def tile(style, on=False, rar=None):
    w, h = 40, 48
    if style == "a":
        img = box(w, h, SLATE[2], GILT[3] if on else STEEL[3], SLATE[3])
    elif style == "b":
        img = box(w, h, BROWN[1], GILT[3] if on else GILT[1], BROWN[2])
        D(img).rectangle([3, 3, w - 4, h - 4], outline=INK)
        rect(img, 4, h - 12, w - 5, h - 5, GILT[2] if not on else GILT[3])
        rect(img, 4, h - 12, w - 5, h - 12, GILT[4])
    elif style == "c":
        img = new(w, h)
        for x, y, dx, dy in ((1, 1, 1, 1), (w - 2, 1, -1, 1), (1, h - 2, 1, -1), (w - 2, h - 2, -1, -1)):
            for k in range(4):
                put(img, x + dx * k, y, INKM[3] if on else INKM[2])
                put(img, x, y + dy * k, INKM[3] if on else INKM[2])
    elif style == "d":
        img = box(w, h, SLATE[2], GILT[3] if on else SLATE[3])
        poly(img, [(w - 14, 1), (w - 2, 1), (w - 2, 13)], INKM[3] if not on else GILT[2])
        outline(img)
    else:
        c = ramp(RARITY[rar])
        img = box(w, h, mix(H("#1f232b"), c[2], 0.16 if not on else 0.28), c[2] if not on else c[3])
        for i in range(8):
            put(img, 4 + i, 4 + 7 - i, mix(H("#1f232b"), c[4], 0.5))
    return img


def socket(style):
    img = new(28, 28)
    if style in ("a", "e"):
        ell(img, 1, 1, 26, 26, STEEL[0])
        D(img).ellipse([1, 1, 26, 26], outline=GILT[2] if style == "a" else INKM[3])
        D(img).arc([3, 3, 24, 24], 200, 250, fill=STEEL[3])
    elif style == "b":
        rect(img, 1, 1, 26, 26, BROWN[0])
        D(img).rectangle([1, 1, 26, 26], outline=GILT[2])
        D(img).rectangle([3, 3, 24, 24], outline=INK)
    elif style == "c":
        D(img).rectangle([1, 1, 26, 26], outline=INKM[1])
    else:
        rect(img, 1, 1, 26, 26, SLATE[1])
        rect(img, 1, 1, 26, 2, SLATE[3])
    outline(img)
    return img


def rung(style, state, rar=None):
    """state: off, next, done."""
    img = new(16, 16)
    if style == "a":
        rp = GILT if state == "done" else STEEL
        ell(img, 1, 1, 14, 14, rp[2])
        ell(img, 1, 1, 9, 9, rp[3])
        ell(img, 3, 3, 12, 12, rp[2] if state == "done" else STEEL[0])
        if state == "done":
            put(img, 5, 4, WHITE)
        if state == "next":
            D(img).ellipse([1, 1, 14, 14], outline=GILT[3])
    elif style == "b":
        rp = GILT if state == "done" else ramp("#59606c")
        rect(img, 1, 1, 14, 14, rp[2])
        rect(img, 1, 1, 14, 2, rp[4])
        rect(img, 1, 1, 2, 14, rp[3])
        D(img).rectangle([3, 3, 12, 12], outline=INK if state != "next" else GILT[3])
    elif style == "c":
        rect(img, 1, 6, 14, 9, INKM[1] if state == "off" else GILT[3] if state == "done" else INKM[2])
        if state == "next":
            D(img).rectangle([1, 6, 14, 9], outline=GILT[3])
    elif style == "d":
        rp = GILT if state == "done" else SLATE
        poly(img, [(1, 2), (10, 2), (14, 8), (10, 13), (1, 13), (5, 8)], rp[2] if state != "next" else SLATE[3])
        if state == "next":
            for k in range(3, 12, 3):
                ln(img, [(2 + k // 2, 3), (6 + k // 2, 8)], SLATE[4])
    else:
        c = ramp(RARITY[rar or "common"])
        rect(img, 3, 1, 12, 14, c[2] if state == "done" else mix(H("#1f232b"), c[2], 0.2))
        rect(img, 3, 1, 12, 2, c[4] if state == "done" else mix(H("#1f232b"), c[3], 0.3))
        if state == "next":
            D(img).rectangle([3, 1, 12, 14], outline=c[3])
    if style != "c" or state != "off":
        outline(img)
    return img


def link(style, done):
    img = new(8, 4)
    col = {"a": GILT[2] if done else STEEL[0], "b": GILT[2] if done else ramp("#6a5a36")[2],
           "c": INKM[2], "d": GILT[2] if done else SLATE[2], "e": INKM[3] if done else INKM[1]}[style]
    if style == "b" and not done:
        rect(img, 0, 1, 3, 2, col)
    else:
        rect(img, 0, 1, 7, 2, col)
    return img


def export(emit, meta):
    for s in STYLES:
        rars = list(RARITY) if s == "e" else [None]
        for r in rars:
            suf = f"-{r}" if r else ""
            emit(f"wd-{s}-plate{suf}", plate(s, False, r))
            emit(f"wd-{s}-plate-on{suf}", plate(s, True, r))
            emit(f"wd-{s}-tile{suf}", tile(s, False, r))
            emit(f"wd-{s}-tile-on{suf}", tile(s, True, r))
            for st in ("off", "next", "done"):
                emit(f"wd-{s}-rung-{st}{suf}", rung(s, st, r))
        emit(f"wd-{s}-socket", socket(s))
        emit(f"wd-{s}-link", link(s, False))
        emit(f"wd-{s}-link-done", link(s, True))
    meta["wardrobe"] = dict(styles=STYLES, rarities=list(RARITY), perRarity=["e"],
                            parts={"plate": [48, 24, 6], "plate-on": [48, 24, 6], "tile": [40, 48, 6],
                                   "tile-on": [40, 48, 6], "socket": [28, 28, 0], "rung-off": [16, 16, 0],
                                   "rung-next": [16, 16, 0], "rung-done": [16, 16, 0], "link": [8, 4, 0],
                                   "link-done": [8, 4, 0]})
    meta["skins"]["wardrobe"] = list(STYLES)
