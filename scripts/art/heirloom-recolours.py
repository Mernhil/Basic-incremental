#!/usr/bin/env python3
"""Recolour the 45 kept Heirloom candidates (DESIGN.md section 5, "More weapons from the
Heirloom candidates", user 2026-11-12) into new still sprites.

Input : .claude/skills/pixel-art/references/style/h-<type>-<m|v><0-3>.png (100x120)
Output: src/renderer/src/art/pixel/sprites/item-<type>-<hm|hv>-<letter>.png and the same
        file in src/renderer/src/art/pixel/hand/ (the two folders hold identical stills),
        design/heirloom-recolours.json (manifest), design/heirloom-recolours-contact.png.

Method (deterministic, no randomness, no generation): every opaque pixel is converted to HLS.
Lightness (shading, highlights) and the outline are preserved; only hue and optionally
saturation change. Pixels with lightness < 0.09 (ink outline) or saturation < 0.2 (white
glints, steel, bone) are left alone unless the sprite has a neutral tint rule.
Hue is normalised to -60..300 degrees (so reds 340-360 sit beside 0-20) and each sprite
lists rules: (hue_lo, hue_hi) -> new hue, saturation multiplier, lightness delta. The
rules per sprite ARE the palette mapping and are documented in PALETTES below.
Run: python3 scripts/art/heirloom-recolours.py
"""
import colorsys, json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '.claude/skills/pixel-art/references/style')
OUT_DIRS = [os.path.join(ROOT, 'src/renderer/src/art/pixel/sprites'),
            os.path.join(ROOT, 'src/renderer/src/art/pixel/hand')]
TYPES = 'sword greatsword spear lance dagger hammer bow staff scythe pickaxe logging_axe'.split()

# label -> (paletteName, hint, rules, neutral)
# rule = (src_lo, src_hi, new_hue, sat_mult, light_delta); neutral = (hue, sat) or None
def R(lo, hi, h, s=1.0, dl=0.0): return (lo, hi, h, s, dl)
P = {
 '1b': ('Emerald Frost', 'Sun blade turned jade green with a mint-teal flame edge.', [R(-60,30,150),R(30,100,172)], None),
 '1d': ('Amethyst Dawn', 'Radiant blade in violet with magenta rays.', [R(-60,30,305),R(30,100,272)], None),
 '2d': ('Blood Moon', 'Starry night blade in deep crimson.', [R(170,270,356,1.05)], None),
 '3b': ('Royal Violet', 'Blue greatsword in royal violet, gold trim kept.', [R(170,260,275)], None),
 '3c': ('Jade Court', 'Blue greatsword in jade green with warm trim.', [R(170,260,150)], None),
 '4b': ('Cobalt Bone', 'Red toothed blade in cold cobalt blue over bone.', [R(-60,30,215)], None),
 '4c': ('Verdant Rot', 'Spore-green blade with bone teeth.', [R(-60,50,100)], None),
 '4d': ('Violet Maw', 'Bone-fanged blade in bruised violet.', [R(-60,50,272)], None),
 '5b': ('Sunfire Gold', 'Icy winged spear flipped to molten gold.', [R(150,260,42)], None),
 '5d': ('Rose Quartz', 'Frost spear in soft rose pink.', [R(150,260,340)], None),
 '6b': ('Royal Purple', 'Serpent spear in royal purple.', [R(100,200,272)], None),
 '6c': ('Ember Orange', 'Serpent spear glowing ember orange.', [R(100,200,24)], None),
 '6d': ('Crimson Coil', 'Serpent spear in deep crimson.', [R(100,200,354)], None),
 '7b': ('Azure Valor', 'Sunrider banner lance in azure blue.', [R(-60,70,208)], None),
 '8b': ('Midnight Violet', 'Bone-and-banner lance in midnight violet.', [R(-60,60,265)], None),
 '8d': ('Venom Green', 'Doom lance banner in toxic green.', [R(-60,60,125)], None),
 '9b': ('Rosewater', 'Golden fang dagger in rose and pink.', [R(-60,100,335)], None),
 '9c': ('Azure Gleam', 'Fang dagger in bright azure.', [R(-60,100,200)], None),
 '9d': ('Jade Gleam', 'Fang dagger in cool jade.', [R(-60,100,160)], None),
 '10b': ('Crimson Venom', 'Dripping dagger in blood red.', [R(60,180,352)], None),
 '10c': ('Violet Venom', 'Dripping dagger in poisonous violet.', [R(60,180,282)], None),
 '10d': ('Cobalt Venom', 'Dripping dagger in icy cobalt.', [R(60,180,215)], None),
 '11b': ('Azure Storm', 'Starred hammer in storm blue.', [R(-60,70,205)], None),
 '11c': ('Verdant Forge', 'Starred hammer in forge green.', [R(-60,70,132)], None),
 '11d': ('Violet Forge', 'Starred hammer in violet flame.', [R(-60,70,282)], None),
 '12b': ('Blood Iron', 'Frost-lit anvil hammer in blood-red iron.', [R(140,250,356,1.4,-0.04)], (358,0.55)),
 '13c': ('Golden Dawn', 'Star bow turned warm gold.', [R(160,250,42,1.35,0.04)], None),
 '14b': ('Crimson Night', 'Thorned bow in dark crimson.', [R(230,300,350,1.7)], None),
 '14c': ('Teal Abyss', 'Thorned bow in deep sea teal.', [R(230,300,176,1.5)], None),
 '14d': ('Ember Gloom', 'Winged bow in smouldering amber.', [R(230,300,28,2.2,0.03)], None),
 '15b': ('Azure Orchid', 'Blossom staff in blue petals with gold leaves.', [R(-60,30,205),R(120,170,42),R(30,70,50)], None),
 '16c': ('Magenta Void', 'Swirling orb staff in magenta.', [R(100,220,308)], None),
 '17d': ('Azure Mercy', 'Golden scythe in azure steel.', [R(-60,100,208)], None),
 '18b': ('Emerald Grim', 'Skull scythe with an emerald blade.', [R(-60,60,145)], None),
 '18c': ('Violet Grim', 'Skull scythe with a violet blade.', [R(-60,60,275)], None),
 '18d': ('Azure Grim', 'Skull scythe with an azure blade.', [R(-60,60,205)], None),
 '19b': ('Azure Heart', 'Heart pickaxe in azure with gold trim.', [R(-60,30,205)], None),
 '19c': ('Emerald Silver', 'Heart pickaxe in emerald with silver trim.', [R(-60,30,140),R(30,100,200,0.25)], None),
 '20b': ('Crimson Fang', 'Jaw pickaxe in crimson.', [R(60,230,350)], None),
 '20c': ('Violet Fang', 'Jaw pickaxe in violet.', [R(60,230,275)], None),
 '20d': ('Amber Fang', 'Jaw pickaxe in amber.', [R(60,230,35)], None),
 '21c': ('Tidal Bronze', 'Vine axe in tidal blue with bronze.', [R(55,160,205)], None),
 '21d': ('Violet Bronze', 'Vine axe in violet with bronze.', [R(55,160,285)], None),
 '22b': ('Frozen Teal', 'Rotted axe in frost blue and teal.', [R(-60,45,215),R(45,120,176)], None),
 '22c': ('Plum Rot', 'Rotted axe in crimson and plum.', [R(-60,45,345),R(45,120,290)], None),
}

def src_info(label):
    g = int(label[:-1]); i = ord(label[-1]) - 97
    return TYPES[(g - 1) // 2], ('mythic' if g % 2 else 'void'), i

def recolour(im, rules, neutral):
    out = im.copy(); px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
            if l < 0.09: continue
            if s < 0.2:
                if neutral and 0.12 < l < 0.93:
                    h, s = neutral[0]/360, neutral[1]
                else: continue
            else:
                hd = h * 360
                if hd >= 300: hd -= 360
                for lo, hi, nh, sm, dl in rules:
                    if lo <= hd < hi:
                        h = nh/360; s = min(1, s*sm); l = min(.97, max(.1, l+dl)); break
                else: continue
            nr, ng, nb = colorsys.hls_to_rgb(h, l, s)
            px[x, y] = (round(nr*255), round(ng*255), round(nb*255), 255)
    return out

def main():
    manifest = []; made = {}
    for label, (name, hint, rules, neutral) in P.items():
        t, side, i = src_info(label); sc = 'm' if side == 'mythic' else 'v'
        letter = chr(97 + i)
        im = Image.open(f'{SRC}/h-{t}-{sc}{i}.png').convert('RGBA')
        res = recolour(im, rules, neutral)
        fn = f'item-{t}-h{sc}-{letter}.png'
        for d in OUT_DIRS: res.save(os.path.join(d, fn))
        made[label] = res
        manifest.append(dict(label=label, type=t, side=side, letter=letter, file=fn,
                             source=f'.claude/skills/pixel-art/references/style/h-{t}-{sc}{i}.png',
                             paletteName=name, hint=hint))
    with open(os.path.join(ROOT, 'design/heirloom-recolours.json'), 'w') as f:
        json.dump(manifest, f, indent=2); f.write('\n')
    contact(made)

def contact(made):
    font = ImageFont.load_default(size=11)
    rows = []
    for t in TYPES:
        for sc in 'mv':
            labels = [l for l in P if src_info(l)[0] == t and src_info(l)[1] == ('mythic' if sc == 'm' else 'void')]
            rows.append((t, sc, labels))
    cw, ch = 110, 140
    W = cw * 5; H = ch * len(rows)
    sheet = Image.new('RGBA', (W, H), (58, 60, 72, 255)); d = ImageDraw.Draw(sheet)
    for ri, (t, sc, labels) in enumerate(rows):
        o = Image.open(f'{OUT_DIRS[0]}/item-{t}-h{sc}.png').convert('RGBA')
        cells = [(o, f'{t} h{sc} ORIGINAL')] + [(made[l], f'{l} {P[l][0]}') for l in labels]
        for ci, (im, lab) in enumerate(cells):
            x, y = ci * cw + 5, ri * ch
            sheet.alpha_composite(im.resize((100, 120), Image.NEAREST), (x, y))
            d.text((x, y + 121), lab[:17], fill=(255, 255, 255, 255), font=font)
    sheet.save(os.path.join(ROOT, 'design/heirloom-recolours-contact.png'))

if __name__ == '__main__': main()
