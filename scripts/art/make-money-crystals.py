"""Makes the Money coins and the two crystals from the asset packs (docs/ASSET_RULES.md section 5).

Usage: python -I scripts/art/make-money-crystals.py [PACKS_DIR]

Deterministic, no hand edits (Pillow only). Writes into src/renderer/src/art/pixel/hand/:
  money-<coin>.png / money-<coin>-anim.png   the eight coins of the ladder (`coins.json`): 16 x 16,
      the still (frame 0) and the 5-frame spin strip. Recolours of the Coin_Gems coins: Copper from
      the red coin, Silver from the silver coin, Gold from the gold coin, Diamond / Star / Moon from
      the silver coin tinted, Sun / Crown from the gold coin shifted. The tints follow the old coin
      tints of the header chip (`shell.css`), so each coin keeps its colour.
  res-summon.png / res-glamour.png (+ -anim)   the two crystals: 32 x 32, the pack's floating
      sapphire (Summon, blue) and floating ruby shifted to pink (Glamour), 8-frame loop. The ground
      line under the pack's gems is removed (the header crystals have no ground).
Alpha is made binary (whole pixels). Run `node scripts/art/bake-pixels.mjs` after.
"""
import colorsys
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'src', 'renderer', 'src', 'art', 'pixel', 'hand')


def tint(im, hue=None, shift=0.0, sat=1.0, grey_sat=0.0, val=1.0):
    """Recolour: `hue` replaces the hue (and greys get `grey_sat` of colour), `shift` turns it."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if hue is not None:
                h = hue
                if s < 0.15:
                    s = grey_sat * (0.55 + 0.45 * (1 - v))
            h = (h + shift) % 1.0
            s = min(1.0, s * sat)
            v = min(1.0, v * val)
            r, g, b = colorsys.hsv_to_rgb(h, s, v)
            px[x, y] = (round(r * 255), round(g * 255), round(b * 255), 255)
    return im


def whole(im):
    """Binary alpha: whole opaque pixels only."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return im


def frames_of(strip, w):
    return [strip.crop((i * w, 0, (i + 1) * w, strip.height)) for i in range(strip.width // w)]


def save(name, frames):
    w, h = frames[0].size
    frames[0].save(os.path.join(OUT, f'{name}.png'))
    s = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * w, 0))
    s.save(os.path.join(OUT, f'{name}-anim.png'))


def main():
    packs = sys.argv[1] if len(sys.argv) > 1 else os.path.join('C:\\', 'Basic Incremental', 'design', 'references', 'itch')
    os.makedirs(OUT, exist_ok=True)
    cg = os.path.join(packs, 'Coin_Gems')
    gold = frames_of(whole(Image.open(os.path.join(cg, 'MonedaD.png'))), 16)
    silver = frames_of(whole(Image.open(os.path.join(cg, 'MonedaP.png'))), 16)
    red = frames_of(whole(Image.open(os.path.join(cg, 'MonedaR.png'))), 16)
    coins = {
        'copper': [tint(f, shift=0.06, sat=0.85, val=0.85) for f in red],
        'silver': silver,
        'gold': gold,
        'diamond': [tint(f, hue=0.52, grey_sat=0.55, val=1.05) for f in silver],
        'star': [tint(f, hue=0.78, grey_sat=0.5, val=1.0) for f in silver],
        'moon': [tint(f, hue=0.6, grey_sat=0.3, val=1.08) for f in silver],
        'sun': [tint(f, shift=-0.07, sat=1.15, val=1.05) for f in gold],
        'crown': [tint(f, shift=0.78, sat=1.0, val=1.0) for f in gold],
    }
    for cid, fr in coins.items():
        save(f'money-{cid}', fr)
    print('coins:', ', '.join(coins))

    pick = os.path.join(
        packs, 'Fantasy_RPG_Pixel_Pack_FREE_v1.0', 'Fantasy_RPG_Pixel_Pack_FREE_v1.0', '04_Dungeon_Pickups_and_VFX_32x32'
    )
    sheet = whole(Image.open(os.path.join(pick, 'dungeon_pickups_and_vfx_32x32.png')))
    meta = json.load(open(os.path.join(pick, 'dungeon_pickups_and_vfx_32x32.json')))['frames']

    def row(prefix):
        out = []
        for i in range(8):
            f = meta[f'{prefix}_{i:02d}']['frame']
            out.append(sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])))
        return out

    def no_ground(frames):
        # the pack draws a dark ground line under each floating gem: drop the rows below the gem
        res = []
        for f in frames:
            f = f.copy()
            px = f.load()
            for y in range(24, f.height):
                for x in range(f.width):
                    r, g, b, a = px[x, y]
                    if a and max(r, g, b) < 60:
                        px[x, y] = (0, 0, 0, 0)
            res.append(f)
        return res

    save('res-summon', no_ground(row('gem_sapphire_float')))
    save('res-glamour', [tint(f, hue=0.9, sat=0.9, val=1.05) for f in no_ground(row('gem_ruby_float'))])
    print('crystals: res-summon, res-glamour')


if __name__ == '__main__':
    main()
