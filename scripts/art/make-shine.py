"""Shine strips for the top tiers (DESIGN.md §5 "Rank visuals", ASSET_RULES.md §5 palette cycling).

Draws `<sprite>-anim.png` next to each T5, T6 and Heirloom card item in
src/renderer/src/art/pixel/hand/: 8 frames of the sprite's own size side by side, played by the
game at 110 ms a frame (art/pixel/animate.ts). Frame 0 and the last frame are the plain sprite, so
the still frame under reduced motion is the sprite itself. Everything is whole opaque pixels:

  T5 (light effects, small animation): a soft glint band sweeps across the item once, and two
     plus-shaped sparkles blink on bright spots.
  T6 (full effects): a stronger sweep, three sparkles, a one-pixel rim glow in the item's accent
     colour that breathes, and a few motes of the side's colour drifting up.
  Heirloom (the strongest, above T6): the strongest sweep, four sparkles, a two-tone rim glow
     that pulses all loop and more, bigger motes.

Usage: python scripts/art/make-shine.py   (needs Pillow; deterministic, so re-running gives no diff)
"""
import colorsys
import os
import random
import sys

from PIL import Image

HAND = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'renderer', 'src', 'art', 'pixel', 'hand')
FRAMES = 8

# tier suffix -> (sweep strength, sweep width, sparkles, rim glow frames, motes)
LEVELS = {
    't5': dict(sweep=0.65, width=11, sparkles=3, rim=(3, 4), motes=0),
    't6m': dict(sweep=0.65, width=13, sparkles=4, rim=(1, 2, 3, 4, 5, 6), motes=5),
    't6v': dict(sweep=0.6, width=13, sparkles=4, rim=(1, 2, 3, 4, 5, 6), motes=5),
    'hm': dict(sweep=0.75, width=15, sparkles=5, rim=(1, 2, 3, 4, 5, 6), motes=9),
    'hv': dict(sweep=0.7, width=15, sparkles=5, rim=(1, 2, 3, 4, 5, 6), motes=9),
}


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def accent_of(px):
    """The sprite's accent: the average of its most saturated bright pixels."""
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


def make(path, level):
    cfg = LEVELS[level]
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    src = im.load()
    opaque = [(x, y) for y in range(h) for x in range(w) if src[x, y][3] > 0]
    colours = [src[x, y][:3] for x, y in opaque]
    accent = accent_of(colours)
    rng = random.Random(hash(os.path.basename(path)) & 0xFFFF if False else sum(map(ord, os.path.basename(path))))

    # sparkle spots: bright, not on the outline, spread apart
    spots = []
    cands = [(x, y) for x, y in opaque if lum(src[x, y]) > 150 and 3 <= x < w - 3 and 3 <= y < h - 3]
    rng.shuffle(cands)
    for x, y in cands:
        if all(abs(x - sx) + abs(y - sy) > 22 for sx, sy, _ in spots):
            spots.append((x, y, len(spots)))
        if len(spots) == cfg['sparkles']:
            break

    # rim pixels: transparent pixels touching the sprite
    rim = [
        (x, y)
        for y in range(h)
        for x in range(w)
        if src[x, y][3] == 0
        and any(
            0 <= x + dx < w and 0 <= y + dy < h and src[x + dx, y + dy][3] > 0
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
        )
    ]
    rim_a = mix(accent, (255, 255, 255), 0.15)
    rim_b = mix(accent, (255, 255, 255), 0.6)

    # motes: start near the sprite's top half edge and drift up and sideways
    top = sorted(opaque, key=lambda p: p[1])[: max(1, len(opaque) // 3)]
    motes = []
    for i in range(cfg['motes']):
        sx, sy = rng.choice(top)
        motes.append((sx + rng.randint(-5, 5), sy + rng.randint(-2, 6), rng.choice((-1, 0, 1)), i))
    mote_col = mix(accent, (255, 255, 255), 0.35)

    strip = Image.new('RGBA', (w * FRAMES, h), (0, 0, 0, 0))
    for f in range(FRAMES):
        fr = im.copy()
        px = fr.load()
        # 1. sweep: a diagonal band moves from the top-left over frames 1..6
        if 1 <= f <= 6:
            t = (f - 1) / 5.0
            centre = t * (w + h) - 0
            for x, y in opaque:
                d = abs((x + y) - centre)
                if d < cfg['width'] / 2:
                    r, g, b, a = src[x, y]
                    if lum((r, g, b)) < 45:  # keep the dark outline dark
                        continue
                    k = cfg['sweep'] * (1 - d / (cfg['width'] / 2))
                    px[x, y] = mix((r, g, b), (255, 255, 255), k) + (255,)
        # 2. rim glow
        if f in cfg['rim']:
            col = rim_b if (cfg['sparkles'] >= 5 and f % 2 == 0) else rim_a
            for x, y in rim:
                px[x, y] = col + (255,)
        # 3. sparkles: each blinks for two frames, staggered
        for sx, sy, i in spots:
            if f in (1 + i * 2 % 6, 2 + i * 2 % 6):
                big = f == 1 + i * 2 % 6
                cells = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)] + ([(2, 0), (-2, 0), (0, 2), (0, -2)] if big else [])
                for dx, dy in cells:
                    x, y = sx + dx, sy + dy
                    if 0 <= x < w and 0 <= y < h:
                        px[x, y] = (255, 255, 255, 255)
        # 4. motes drift up
        for mx, my, dx, i in motes:
            life = (f + i) % FRAMES
            x, y = mx + dx * (life // 3), my - life * 2
            size = 2 if cfg['sparkles'] >= 5 else 1
            for ox in range(size):
                for oy in range(size):
                    xx, yy = x + ox, y + oy
                    if 0 <= xx < w and 0 <= yy < h and px[xx, yy][3] == 0 and 1 <= life <= 6:
                        px[xx, yy] = mote_col + (255,)
        strip.paste(fr, (f * w, 0))
    out = path[:-4] + '-anim.png'
    strip.save(out)
    return out


def main():
    made = 0
    for name in sorted(os.listdir(HAND)):
        if not name.startswith('item-') or not name.endswith('.png') or name.endswith('-anim.png'):
            continue
        stem = name[:-4]
        level = stem.rsplit('-', 1)[1]
        if level in LEVELS:
            make(os.path.join(HAND, name), level)
            made += 1
    print(f'made {made} shine strips')


if __name__ == '__main__':
    sys.exit(main())
