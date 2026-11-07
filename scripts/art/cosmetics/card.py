"""Card mockup layers on the approved frame grid (183 x 237; the card itself is 132 x 186 at
x 26..157, y 38..223). Two PNGs per card: `base` (body, panels, finish) goes under the item,
`top` (tier frame, border flourishes, stars) goes over it. Text is HTML on the page, as in game.
"""
from px import *  # noqa: F403

W, Hh = 183, 237
CARD = (26, 38, 157, 223)
BAND = 8
NAME = (35, 46, 148, 62)
WINDOW = (35, 66, 148, 157)
STATS = (35, 161, 148, 196)
FOOTER = (34, 198, 149, 215)  # keep-clear: nothing cosmetic draws here
CORNERS = {"tl": (26, 38), "tr": (157, 38), "bl": (26, 223), "br": (157, 223)}
# frame tier ornaments that cosmetics never hide (sockets, crest, bottom gem)
PROTECT = [(25, 37, 37, 49), (146, 37, 158, 49), (25, 212, 37, 224), (146, 212, 158, 224),
           (76, 22, 107, 48), (84, 212, 98, 229)]

STAR = ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", ".#...#."]


def panels(body, plate, panel, window, line, win_line=None):
    img = new(W, Hh)
    rect(img, CARD[0] + 2, CARD[1] + 2, CARD[2] - 2, CARD[3] - 2, body)
    for box, fill in ((NAME, plate), (WINDOW, window), (STATS, panel)):
        rect(img, *box, fill)
        D(img).rectangle(box, outline=win_line if (box is WINDOW and win_line) else line)
    return img


def stars(img, n=6, lit=6, col=None):
    col = col or ramp("#9ff0ff")
    layer = new(W, Hh)
    x0 = 148 - 9 * n + 2
    for i in range(n):
        c = col if i < lit else ramp("#555a70")
        for y, row in enumerate(STAR):
            for x, ch in enumerate(row):
                if ch == "#":
                    put(layer, x0 + i * 9 + x, 204 + y, c[3] if y < 3 else c[2])
        if i < lit:
            put(layer, x0 + i * 9 + 3, 205, WHITE)
    outline(layer)
    img.alpha_composite(layer)


def place_corners(tl, origin=(12, 12)):
    """Mirror a top-left flourish (drawn with the card corner at `origin`) to all four corners on
    a full card layer, clear the stars band, and return the layer (not outlined yet)."""
    layer = new(W, Hh)
    ox, oy = origin
    w, h = tl.size
    layer.alpha_composite(tl, (CORNERS["tl"][0] - ox, CORNERS["tl"][1] - oy))
    layer.alpha_composite(mirror_x(tl), (CORNERS["tr"][0] - (w - 1 - ox), CORNERS["tr"][1] - oy))
    layer.alpha_composite(mirror_y(tl), (CORNERS["bl"][0] - ox, CORNERS["bl"][1] - (h - 1 - oy)))
    layer.alpha_composite(mirror_x(mirror_y(tl)), (CORNERS["br"][0] - (w - 1 - ox), CORNERS["br"][1] - (h - 1 - oy)))
    x0, y0, x1, y1 = FOOTER
    clear_rect(layer, x0 - 1, y0 - 1, x1 + 1, y1 + 1)
    return layer


def top(frame_name, flourish=None, n_stars=6, lit=6, star_col=None):
    frame = sprite(frame_name)
    img = frame.copy()
    if flourish is not None:
        img.alpha_composite(flourish)
        for x0, y0, x1, y1 in PROTECT:
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    p = frame.getpixel((x, y))
                    if p[3]:
                        img.putpixel((x, y), p)
    stars(img, n_stars, lit, star_col)
    return img


def clip_body(layer):
    """Keep a finish inside the card body and out of the stars band."""
    x0, y0, x1, y1 = CARD
    for y in range(Hh):
        for x in range(W):
            inside = x0 + 2 <= x <= x1 - 2 and y0 + 2 <= y <= y1 - 2
            in_footer = FOOTER[0] - 1 <= x <= FOOTER[2] + 1 and FOOTER[1] - 1 <= y <= FOOTER[3] + 1
            if not inside or in_footer:
                layer.putpixel((x, y), CLEAR)
    return layer


def in_window(x, y, pad=1):
    return WINDOW[0] + pad <= x <= WINDOW[2] - pad and WINDOW[1] + pad <= y <= WINDOW[3] - pad
