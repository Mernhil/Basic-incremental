# Draws the card rank stars: 11 x 11 pixel stars (a 9 x 9 body with a 1 px ink outline), hand-drawn,
# free, deterministic (Pillow). Option "1d Chunky", picked by the user 2026-11-15.
# Writes src/renderer/src/art/pixel/hand/star-<set>-on.png for wood (stage stars only), bronze, silver and gold, star-prismatic-<0..5>-on.png
# (each Prismatic star its own rainbow colour) and star-off.png. Run `node scripts/art/bake-pixels.mjs` afterwards.
# Shading per pixel: light where y <= 4 and x <= 5, deep where y >= 7 or x >= 7, mid elsewhere.
# The colours are theme/rank.css: --shine, --star, --star-deep per tier (the Prismatic stars: the rainbow stops).
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'renderer', 'src', 'art', 'pixel', 'hand')
INK = (26, 20, 32)
SETS = {  # light, mid, deep
    'wood': ((222, 190, 150), (138, 106, 69), (100, 74, 45)),  # the stage stars' first level (Wood)
    'bronze': ((255, 226, 189), (205, 127, 50), (185, 101, 31)),
    'silver': ((255, 255, 255), (201, 209, 219), (154, 167, 184)),
    'gold': ((255, 247, 194), (246, 199, 68), (220, 154, 14)),
}
PRISM = [(255, 95, 158), (255, 179, 71), (244, 244, 107), (95, 240, 168), (95, 198, 255), (180, 140, 255)]
OFF = ((150, 150, 160), (120, 120, 132), (95, 95, 108))
S9 = ['....#....', '...###...', '...###...', '#########', '.#######.', '..#####..', '..#####..', '.###.###.', '.##...##.']
MASK = [[ch == '#' for ch in r] for r in S9]


def lighten(c, t):
    return tuple(round(v + (255 - v) * t) for v in c)


def darken(c, t):
    return tuple(round(v * (1 - t)) for v in c)


def outline(m):
    h, w = len(m), len(m[0])
    o = [[False] * (w + 2) for _ in range(h + 2)]
    for y in range(h + 2):
        for x in range(w + 2):
            if 0 < y <= h and 0 < x <= w and m[y - 1][x - 1]:
                continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y - 1 + dy, x - 1 + dx
                    if 0 <= yy < h and 0 <= xx < w and m[yy][xx] and (dx == 0 or dy == 0):
                        o[y][x] = True
    return o


def draw_star(pal):
    light, mid, deep = pal
    o = outline(MASK)
    im = Image.new('RGBA', (11, 11))
    for y in range(11):
        for x in range(11):
            if o[y][x]:
                im.putpixel((x, y), (*INK, 255))
            elif 0 < y <= 9 and 0 < x <= 9 and MASK[y - 1][x - 1]:
                c = mid
                if y >= 7 or x >= 7:
                    c = deep
                if y <= 4 and x <= 5:
                    c = light
                im.putpixel((x, y), (*c, 255))
    return im


for name, pal in SETS.items():
    draw_star(pal).save(os.path.join(OUT, f'star-{name}-on.png'))
for i, c in enumerate(PRISM):
    draw_star((lighten(c, 0.55), c, darken(c, 0.3))).save(os.path.join(OUT, f'star-prismatic-{i}-on.png'))
draw_star(OFF).save(os.path.join(OUT, 'star-off.png'))
print('ok')
