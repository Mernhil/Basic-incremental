"""Writes src/renderer/src/art/foeZoom.json: the whole-number zoom each small foe is drawn at.

Pack enemies keep their native pixel size on the 160 x 172 canvas, so the small ones (about 42 to
65 px tall) look tiny in the enemy card next to the 120 px bodies. A foe under 100 px tall is zoomed
to about 120 px tall (never wider than 150 px, never above the ground line), by a whole number so
the pixels stay clean. Run after cut-pack.py: `python3 scripts/art/foe-zoom.py`.
"""
import glob, json, os
from PIL import Image

HAND = 'src/renderer/src/art/pixel/hand'
TARGET_H, MAX_W, GROUND = 120, 150, 166
out = {}
for f in sorted(glob.glob(os.path.join(HAND, 'foe-*.png'))):
    name = os.path.basename(f)[4:-4]
    if name.endswith('-anim'):
        continue
    x0, y0, x1, y1 = Image.open(f).convert('RGBA').getbbox()
    w, h = x1 - x0, y1 - y0
    z = min(round(TARGET_H / h), MAX_W // w, GROUND // h)
    if h < 100 and z > 1:
        out[name] = z
with open('src/renderer/src/art/foeZoom.json', 'w') as fh:
    json.dump(out, fh, indent=2, sort_keys=True)
    fh.write('\n')
print(out)
