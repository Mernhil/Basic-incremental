"""A chunky 5 x 7 pixel numeral font for tick and number drafts (sticker numerals, A4 B)."""
from px import *  # noqa: F403

FONT = {
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    ".": ["..", "..", "..", "..", "..", "##", "##"],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "-": ["...", "...", "...", "###", "...", "...", "..."],
    "I": ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
    "V": ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
}


def mask(text, bold=False):
    cols = []
    for ch in text:
        g = FONT[ch]
        w = len(g[0])
        for x in range(w):
            cols.append([g[y][x] == "#" for y in range(7)])
        cols.append([False] * 7)
        if bold:
            cols.append([False] * 7)
    cols = cols[: -2 if bold else -1]
    if bold:
        out = [[False] * 7 for _ in range(len(cols) + 1)]
        for x, c in enumerate(cols):
            for y in range(7):
                if c[y]:
                    out[x][y] = out[x + 1][y] = True
        cols = out
    return cols


def numeral(text, rp, scale=1, bold=False, shadow=False):
    m = mask(text, bold)
    w, h = len(m) * scale, 7 * scale
    img = new(w + 4, h + 4)
    for x, col in enumerate(m):
        for y, on in enumerate(col):
            if on:
                tone = rp[4] if y < 2 else rp[3] if y < 4 else rp[2]
                rect(img, 1 + x * scale, 1 + y * scale, 1 + x * scale + scale - 1, 1 + y * scale + scale - 1, tone)
    if shadow:
        sh = new(w + 4, h + 4)
        sh.alpha_composite(img, (1, 1))
        px_ = sh.load()
        for yy in range(sh.height):
            for xx in range(sh.width):
                if px_[xx, yy][3]:
                    px_[xx, yy] = INK
        sh.alpha_composite(img)
        return sh
    outline(img)
    return img
