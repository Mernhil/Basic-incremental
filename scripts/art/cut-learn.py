"""Adds the Elie Studio characters to the pixel-art skill's style references (plan: itch assets).

Usage: python -I scripts/art/cut-learn.py [PACKS_DIR]
One front (south) idle still of every Elie Studio character found in design/references/itch/,
trimmed to its bounds, written as .claude/skills/pixel-art/references/style/elie-<character>.png,
(the list in style/index.md is kept by hand). Deterministic, Pillow only.
"""
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, '.claude', 'skills', 'pixel-art', 'references', 'style')
packs = sys.argv[1] if len(sys.argv) > 1 else 'C:/Basic Incremental/design/references/itch'
SKIP = ('Bloodroot', 'Obsidian', 'Fantasy_RPG', 'Coin_Gems', 'japanese', 'Swords', 'woodland-stalker-wolf-companion')
names = []
for p, dirs, files in sorted(os.walk(packs)):
    if os.path.basename(p) != 'south' or any(s in p for s in SKIP):
        continue
    parts = p.replace(packs, '').replace(os.sep, '/').strip('/').split('/')
    if parts[-3] not in ('Idle', 'IdleBreathing') and parts[-2] not in ('Idle', 'IdleBreathing'):
        continue
    frames = sorted(f for f in files if f.endswith('.png'))
    if not frames:
        continue
    if parts[0] in ('ashen-watch-FREE', 'cursed-tide-FREE'):
        name = parts[1].lower()
    else:
        name = parts[0].replace('-FREE-COMPLETE', '').replace('-hunter-combat', '').replace('-FREE', '')
    im = Image.open(os.path.join(p, frames[0])).convert('RGBA')
    im = im.crop(im.getbbox())
    im.save(os.path.join(OUT, f'elie-{name}.png'))
    names.append((name, im.size))
print(len(names), 'characters')
