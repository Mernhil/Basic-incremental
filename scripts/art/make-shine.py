"""Motion strips for the top tiers (DESIGN.md §5 "Rank visuals", ASSET_RULES.md §5 palette cycling).

Draws `<sprite>-anim.png` next to each T5, T6 and Heirloom card item in
src/renderer/src/art/pixel/hand/: 8 frames of the sprite's own size side by side, played by the
game at 110 ms a frame (art/pixel/animate.ts). The picture itself is the still under reduced
motion. Everything is whole opaque pixels.

Every item gets a base shine (a glint sweep, sparkles and, from T6, a breathing rim glow in its
own accent colour). On top of that each weapon has its own recipe of moving parts, built from a
few motions: flames that lick and flicker, gems and eyes that pulse, ghosts, stars and shards that
orbit, petals, leaves, feathers and grains that fall with a sway, embers, bubbles and souls that
rise, and drips. A recipe names the weapon's own colours (flame orange, ghost cyan, petal pink) to
find the part that moves, so the effect sits on the right part of the picture.

Usage: python scripts/art/make-shine.py   (needs Pillow; deterministic, so re-running gives no diff)
"""
import colorsys
import math
import os
import sys

from PIL import Image

HAND = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'renderer', 'src', 'art', 'pixel', 'hand')
FRAMES = 8

# base shine per tier: sweep strength and width, sparkle count, rim glow frames
BASE = {
    't5': dict(sweep=0.65, width=11, sparkles=3, rim=(3, 4)),
    't6m': dict(sweep=0.5, width=13, sparkles=3, rim=(1, 2, 3, 4, 5, 6)),
    't6v': dict(sweep=0.45, width=13, sparkles=3, rim=(1, 2, 3, 4, 5, 6)),
    'hm': dict(sweep=0.55, width=15, sparkles=4, rim=(1, 2, 3, 4, 5, 6)),
    'hv': dict(sweep=0.5, width=15, sparkles=4, rim=(1, 2, 3, 4, 5, 6)),
}


# ---- colour families: hue range (degrees), minimum saturation and value ---------------------------
def fam(h0, h1, s=0.35, v=0.35):
    return (h0, h1, s, v)


FAM = {
    'flame': fam(12, 58, 0.5, 0.6),        # orange and yellow fire
    'gold': fam(36, 56, 0.45, 0.55),
    'red': fam(345, 18, 0.5, 0.35),
    'green': fam(75, 160, 0.35, 0.35),
    'toxic': fam(70, 130, 0.5, 0.45),
    'cyan': fam(160, 205, 0.35, 0.5),
    'blue': fam(205, 250, 0.4, 0.4),
    'violet': fam(255, 300, 0.3, 0.3),
    'pink': fam(300, 350, 0.2, 0.7),
    'orange': fam(15, 40, 0.5, 0.5),
    'white': 'white',
}


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def matches(p, key):
    f = FAM[key]
    if f == 'white':
        return lum(p) > 215 and max(p[:3]) - min(p[:3]) < 40
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    h *= 360
    lo, hi, smin, vmin = f
    inside = lo <= h <= hi if lo <= hi else (h >= lo or h <= hi)
    return inside and s >= smin and v >= vmin


def accent_of(px):
    scored = []
    for p in px:
        h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
        if v > 0.45 and s > 0.25:
            scored.append((s * v, p))
    if not scored:
        return (255, 235, 160)
    scored.sort(reverse=True)
    top = [p for _, p in scored[:40]]
    return tuple(sum(c[i] for c in top) // len(top) for i in range(3))


# ---- little shapes: offsets from the particle's anchor ---------------------------------------------
SHAPES = {
    'dot': [(0, 0)],
    'dot2': [(0, 0), (1, 0), (0, 1), (1, 1)],
    'plus': [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)],
    'petal': [(0, 0), (1, 0), (1, 1), (2, 1), (2, 2)],
    'leaf': [(0, 0), (1, 0), (2, 0), (1, 1), (2, 1), (3, 1), (3, 2)],
    'feather': [(0, 0), (0, 1), (1, 1), (0, 2), (1, 2), (1, 3)],
    'grain': [(0, 0), (1, 0), (0, 1), (1, 1), (0, 2)],
    'bubble': [(1, 0), (2, 0), (0, 1), (3, 1), (0, 2), (3, 2), (1, 3), (2, 3)],
    'drop': [(0, 0), (0, 1), (0, 2), (1, 2)],
    'shard': [(0, 0), (0, 1), (1, 1), (1, 2)],
    'smoke': [(0, 0), (1, 0), (0, 1), (1, 1)],
    'ghost': [(1, 0), (2, 0), (3, 0), (0, 1), (1, 1), (2, 1), (3, 1), (4, 1), (0, 2), (1, 2), (3, 2), (4, 2),
              (0, 3), (1, 3), (2, 3), (3, 3), (4, 3), (0, 4), (2, 4), (4, 4)],
}
GHOST_EYES = [(1, 2), (3, 2)]  # drawn dark inside the ghost body


class Item:
    def __init__(self, path):
        self.im = Image.open(path).convert('RGBA')
        self.w, self.h = self.im.size
        self.src = self.im.load()
        self.opaque = [(x, y) for y in range(self.h) for x in range(self.w) if self.src[x, y][3] > 0]
        self.accent = accent_of([self.src[x, y][:3] for x, y in self.opaque])
        self.name = os.path.basename(path)

    def mask(self, key):
        return [(x, y) for x, y in self.opaque if matches(self.src[x, y][:3], key)]

    def box(self, pts):
        xs = [p[0] for p in pts] or [self.w // 2]
        ys = [p[1] for p in pts] or [self.h // 2]
        return min(xs), min(ys), max(xs), max(ys)


def put(layer, x, y, col, only_empty=None):
    w, h = layer.size
    if 0 <= x < w and 0 <= y < h:
        if only_empty is not None and only_empty[x, y][3] > 0:
            return
        layer.putpixel((x, y), col + (255,))


def draw_shape(layer, shape, x, y, col, eyes=False, only_empty=None):
    for dx, dy in SHAPES[shape]:
        put(layer, x + dx, y + dy, col, only_empty)
    if eyes:
        for dx, dy in GHOST_EYES:
            put(layer, x + dx, y + dy, (20, 35, 60), only_empty)


# ---- the motions -----------------------------------------------------------------------------------
def fx_flicker(it, f, spr, back, front, key, spread=1, tint=0.35):
    """Fire licks: masked pixels throw a lighter copy one pixel up or sideways onto empty space."""
    src = it.src
    for x, y in it.mask(key):
        n = (x * 31 + y * 17 + f * 13) % 7
        dx = -1 if n < 2 else (1 if n > 4 else 0)
        dy = -1 if (n == 3 and f % 2) or (n == 6 and f % 3 == 0) else 0
        if (dx or dy) and 0 <= x + dx < it.w and 0 <= y + dy < it.h and src[x + dx, y + dy][3] == 0:
            put(front, x + dx * spread, y + dy, mix(src[x, y][:3], (255, 245, 190), tint))


def fx_pulse(it, f, spr, back, front, key, amount=0.55, phase=0.0, rate=1):
    """Gems, eyes and runes glow brighter and dimmer."""
    k = amount * (0.5 + 0.5 * math.sin(2 * math.pi * (f * rate / FRAMES) + phase))
    for x, y in it.mask(key):
        r, g, b, _ = it.src[x, y]
        spr.putpixel((x, y), mix((r, g, b), (255, 255, 255), k) + (255,))


def fx_sway(it, f, spr, back, front, key, amp=1):
    """Cloth and banners ripple: the masked pixels slide sideways in a wave down their length."""
    pts = it.mask(key)
    if not pts:
        return
    top = min(p[1] for p in pts)
    for x, y in pts:
        off = round(amp * math.sin((y - top) * 0.55 + f * math.pi / 4))
        if off and 0 <= x + off < it.w and it.src[x + off, y][3] == 0:
            put(front, x + off, y, it.src[x, y][:3])


def particles(it, f, back, front, key, shape, col, count, mode, speed=2, sway=1, eyes=False, spread=None, seed=0,
              lifespan=FRAMES):
    """Falling and rising bits that start around the masked part and loop."""
    pts = it.mask(key)
    x0, y0, x1, y1 = it.box(pts)
    spread = (spread or 0) + 6
    x0, x1 = x0 - spread, x1 + spread
    for i in range(count):
        life = (f + i * lifespan // count + seed) % lifespan
        bx = x0 + (i * 37 + seed * 11) % max(1, (x1 - x0 + 1))
        by = y0 + life * speed * 3 if mode == 'fall' else y1 - life * speed * 3
        bx += round(sway * math.sin(life * 0.9 + i)) if sway else 0
        if 0 < life < lifespan - 1:
            draw_shape(front, shape, bx, by, col, eyes=eyes, only_empty=it.src)


def fx_orbit(it, f, spr, back, front, key, shape, col, count=3, rx=None, ry=None, direction=1, eyes=False, speed=1):
    """Ghosts, stars and shards circle the part: behind the item on the far side, in front on the near."""
    pts = it.mask(key)
    x0, y0, x1, y1 = it.box(pts)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx = rx if rx is not None else (x1 - x0) / 2 + 7
    ry = ry if ry is not None else max(5, (y1 - y0) / 2 + 4)
    for i in range(count):
        th = direction * 2 * math.pi * (f * speed / FRAMES) + i * 2 * math.pi / count
        x, y = round(cx + rx * math.cos(th) - 2), round(cy + ry * math.sin(th) - 2)
        draw_shape(front if math.sin(th) >= 0 else back, shape, x, y, col, eyes=eyes)


def fx_twinkle(it, f, spr, back, front, key, col, count=3, seed=0):
    pts = it.mask(key)
    if not pts:
        return
    for i in range(count):
        x, y = pts[(i * 53 + seed * 17) % len(pts)]
        life = (f + i * 3) % FRAMES
        if life in (1, 2):
            for dx, dy in SHAPES['plus'] + ([(2, 0), (-2, 0), (0, 2), (0, -2)] if life == 1 else []):
                put(front, x + dx, y + dy, col)


def apply(it, f, spr, back, front, recipe):
    for name, key, kw in recipe:
        if name == 'flicker':
            fx_flicker(it, f, spr, back, front, key, **kw)
        elif name == 'pulse':
            fx_pulse(it, f, spr, back, front, key, **kw)
        elif name == 'sway':
            fx_sway(it, f, spr, back, front, key, **kw)
        elif name == 'orbit':
            fx_orbit(it, f, spr, back, front, key, **kw)
        elif name == 'twinkle':
            fx_twinkle(it, f, spr, back, front, key, **kw)
        else:  # rise / fall
            particles(it, f, back, front, key, mode=name, **kw)


C = dict(  # particle colours
    gold=(255, 214, 90), cream=(255, 244, 205), white=(250, 252, 255), pink=(255, 170, 205), leaf=(120, 190, 80),
    cyan=(150, 240, 245), teal=(90, 215, 200), violet=(170, 110, 240), ember=(255, 150, 50), ash=(200, 90, 80),
    poison=(120, 235, 90), blue=(140, 190, 255), shadow=(150, 110, 220), bone=(240, 230, 205), lilac=(190, 150, 255),
)


def R(*steps):
    return list(steps)


def P(name, key, **kw):
    return (name, key, kw)


# ---- per-weapon recipes (the file name after "item-" and before ".png") ----------------------------
RECIPES = {
    # Heirlooms, Mythic side
    'sword-hm': R(P('flicker', 'flame'), P('rise', 'flame', shape='dot2', col=C['ember'], count=6, speed=2, sway=1),
                  P('pulse', 'gold', amount=0.4)),
    'greatsword-hm': R(P('pulse', 'blue', amount=0.6), P('rise', 'gold', shape='dot2', col=C['gold'], count=6, speed=2),
                       P('twinkle', 'gold', col=C['white'], count=3)),
    'spear-hm': R(P('fall', 'white', shape='feather', col=C['white'], count=5, speed=2, sway=2, spread=6),
                  P('pulse', 'blue', amount=0.4), P('twinkle', 'white', col=C['white'], count=2)),
    'lance-hm': R(P('sway', 'orange', amp=1), P('flicker', 'orange'),
                  P('rise', 'orange', shape='dot2', col=C['ember'], count=5), P('pulse', 'gold', amount=0.4)),
    'dagger-hm': R(P('pulse', 'white', amount=0.5), P('rise', 'white', shape='dot', col=C['cream'], count=5, speed=2),
                   P('twinkle', 'white', col=C['white'], count=3)),
    'hammer-hm': R(P('flicker', 'flame'), P('rise', 'flame', shape='dot2', col=C['ember'], count=7, speed=2, sway=1),
                   P('pulse', 'white', amount=0.45)),
    'bow-hm': R(P('orbit', 'blue', shape='plus', col=C['white'], count=3, rx=30, ry=30),
                P('twinkle', 'white', col=C['white'], count=4), P('pulse', 'blue', amount=0.5)),
    'staff-hm': R(P('fall', 'pink', shape='petal', col=C['pink'], count=9, speed=2, sway=3, spread=10),
                  P('rise', 'green', shape='dot2', col=C['gold'], count=4, speed=1, sway=1), P('pulse', 'green', amount=0.5)),
    'scythe-hm': R(P('fall', 'gold', shape='grain', col=C['gold'], count=7, speed=2, sway=1, spread=6),
                   P('twinkle', 'gold', col=C['white'], count=3), P('pulse', 'orange', amount=0.4)),
    'pickaxe-hm': R(P('pulse', 'red', amount=0.7, rate=2), P('rise', 'red', shape='dot2', col=C['gold'], count=5, speed=2),
                    P('twinkle', 'gold', col=C['white'], count=3)),
    'logging_axe-hm': R(P('fall', 'green', shape='leaf', col=C['leaf'], count=6, speed=2, sway=2, spread=8),
                        P('pulse', 'green', amount=0.5), P('twinkle', 'gold', col=C['white'], count=2)),
    # Heirlooms, Void side
    'sword-hv': R(P('orbit', 'blue', shape='plus', col=C['blue'], count=3, rx=32, ry=20),
                  P('pulse', 'blue', amount=0.6), P('twinkle', 'white', col=C['white'], count=3)),
    'greatsword-hv': R(P('pulse', 'red', amount=0.7, rate=2),
                       P('rise', 'red', shape='dot2', col=C['ember'], count=6, speed=2, sway=1), P('flicker', 'red')),
    'spear-hv': R(P('rise', 'cyan', shape='bubble', col=C['teal'], count=6, speed=2, sway=1, spread=6),
                  P('pulse', 'cyan', amount=0.55)),
    'lance-hv': R(P('sway', 'red', amp=1), P('pulse', 'red', amount=0.7, rate=2),
                  P('rise', 'red', shape='smoke', col=C['ash'], count=4, speed=1)),
    'dagger-hv': R(P('fall', 'toxic', shape='drop', col=C['poison'], count=4, speed=3), P('pulse', 'toxic', amount=0.6)),
    'hammer-hv': R(P('flicker', 'cyan'), P('rise', 'cyan', shape='dot2', col=C['cyan'], count=6, speed=2, sway=1),
                   P('pulse', 'cyan', amount=0.5)),
    'bow-hv': R(P('rise', 'violet', shape='smoke', col=C['shadow'], count=5, speed=1, sway=1, spread=8),
                P('pulse', 'violet', amount=0.6), P('orbit', 'violet', shape='dot', col=C['lilac'], count=3, rx=28, ry=34)),
    # Soulwell: the ghosts drawn in its orb stay as drawn (no circling ghosts, the user's call); the flames flicker
    'staff-hv': R(P('flicker', 'cyan'), P('pulse', 'cyan', amount=0.45)),
    'scythe-hv': R(P('pulse', 'red', amount=0.7), P('fall', 'red', shape='dot', col=C['ash'], count=6, speed=2, sway=1, spread=6),
                   P('twinkle', 'white', col=C['bone'], count=2)),
    'pickaxe-hv': R(P('rise', 'cyan', shape='bubble', col=C['teal'], count=6, speed=2, sway=1, spread=6),
                    P('pulse', 'cyan', amount=0.6, rate=2)),
    'logging_axe-hv': R(P('rise', 'toxic', shape='dot2', col=C['poison'], count=5, speed=1, sway=1, spread=8),
                        P('pulse', 'toxic', amount=0.6), P('fall', 'toxic', shape='drop', col=C['poison'], count=3, speed=3)),
}
# T5 and T6: one recipe per tier and side (gold motes rise from Mythic, violet shards orbit Void)
for _t in ('sword', 'greatsword', 'spear', 'lance', 'dagger', 'hammer', 'bow', 'staff', 'scythe', 'pickaxe', 'logging_axe'):
    RECIPES[f'{_t}-t6m'] = R(P('rise', 'gold', shape='dot2', col=C['gold'], count=5, speed=2, sway=1, spread=6),
                             P('pulse', 'gold', amount=0.45), P('twinkle', 'white', col=C['white'], count=2))
    RECIPES[f'{_t}-t6v'] = R(P('orbit', 'violet', shape='shard', col=C['violet'], count=3, rx=26, ry=30),
                             P('pulse', 'violet', amount=0.55))
    RECIPES[f'{_t}-t5'] = R(P('pulse', 'cyan', amount=0.35), P('twinkle', 'white', col=C['white'], count=2))


def make(path, level, recipe):
    cfg = BASE[level]
    it = Item(path)
    im, w, h, src = it.im, it.w, it.h, it.src
    seed = sum(map(ord, it.name))
    spots = []
    cands = [(x, y) for x, y in it.opaque if lum(src[x, y]) > 150 and 3 <= x < w - 3 and 3 <= y < h - 3]
    for x, y in cands[seed % 7::5]:
        if all(abs(x - sx) + abs(y - sy) > 22 for sx, sy, _ in spots):
            spots.append((x, y, len(spots)))
        if len(spots) == cfg['sparkles']:
            break
    rim = [(x, y) for y in range(h) for x in range(w)
           if src[x, y][3] == 0 and any(0 <= x + dx < w and 0 <= y + dy < h and src[x + dx, y + dy][3] > 0
                                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    rim_a = mix(it.accent, (255, 255, 255), 0.15)
    rim_b = mix(it.accent, (255, 255, 255), 0.6)

    strip = Image.new('RGBA', (w * FRAMES, h), (0, 0, 0, 0))
    for f in range(FRAMES):
        spr = im.copy()
        px = spr.load()
        back = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        front = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        if 1 <= f <= 6:  # base shine: a glint sweep
            centre = (f - 1) / 5.0 * (w + h)
            for x, y in it.opaque:
                d = abs((x + y) - centre)
                if d < cfg['width'] / 2 and lum(src[x, y][:3]) >= 45:
                    px[x, y] = mix(src[x, y][:3], (255, 255, 255), cfg['sweep'] * (1 - d / (cfg['width'] / 2))) + (255,)
        if f in cfg['rim']:  # a breathing rim glow
            col = rim_b if (level.startswith('h') and f % 2 == 0) else rim_a
            for x, y in rim:
                back.putpixel((x, y), col + (255,))
        for sx, sy, i in spots:  # sparkles
            if f in (1 + i * 2 % 6, 2 + i * 2 % 6):
                big = f == 1 + i * 2 % 6
                for dx, dy in SHAPES['plus'] + ([(2, 0), (-2, 0), (0, 2), (0, -2)] if big else []):
                    put(front, sx + dx, sy + dy, (255, 255, 255))
        apply(it, f, spr, back, front, recipe)  # the weapon's own moving parts
        frame = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        frame.alpha_composite(back)
        frame.alpha_composite(spr)
        frame.alpha_composite(front)
        strip.paste(frame, (f * w, 0))
    strip.save(path[:-4] + '-anim.png')


def main():
    made = 0
    for name in sorted(os.listdir(HAND)):
        if not name.startswith('item-') or not name.endswith('.png') or name.endswith('-anim.png'):
            continue
        stem = name[len('item-'):-4]
        level = stem.rsplit('-', 1)[1]
        if level in BASE:
            make(os.path.join(HAND, name), level, RECIPES.get(stem, []))
            made += 1
    print(f'made {made} motion strips')


if __name__ == '__main__':
    sys.exit(main())
