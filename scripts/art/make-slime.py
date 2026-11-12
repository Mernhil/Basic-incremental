"""Shadow Slime: the PixelLab front-facing redraw (design/pixel/shadow-slime/shadow_slime.png) put on
the boss canvas with an 8-frame breathing loop (the body squashes and stretches by whole pixel rows
from its ground line). Deterministic, Pillow only. Writes foe-shadow_slime(.png, -anim.png) into
src/renderer/src/art/pixel/hand/. Run `node scripts/art/bake-pixels.mjs` after."""
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
src = Image.open(os.path.join(ROOT, 'design', 'pixel', 'shadow-slime', 'shadow_slime.png')).convert('RGBA')
px = src.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
body = src.crop(src.getbbox())
W, H, GROUND = 160, 172, 166
OUT = os.path.join(ROOT, 'src', 'renderer', 'src', 'art', 'pixel', 'hand')
heights = [0, 1, 2, 2, 1, 0, -1, -1]  # rows added to the body height
frames = []
for dh in heights:
    h = body.height + dh
    f = body.resize((body.width, h), Image.NEAREST)
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c.alpha_composite(f, ((W - body.width) // 2, GROUND - h))
    frames.append(c)
frames[0].save(os.path.join(OUT, 'foe-shadow_slime.png'))
strip = Image.new('RGBA', (W * len(frames), H), (0, 0, 0, 0))
for i, f in enumerate(frames):
    strip.alpha_composite(f, (i * W, 0))
strip.save(os.path.join(OUT, 'foe-shadow_slime-anim.png'))
print('shadow_slime', body.size, len(set(src.getdata())), 'colours')
