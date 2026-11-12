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
Contrast update (user 2026-11-12: "it's literally just the same color"): the 20 labels in ROLES
no longer get one hue. Each pixel is sorted into a colour ROLE (body, trim, glow or gem, neutral
metal, ...) by its source hue, lightness and saturation (a box for a few spots), and each role gets
its own hue family, as complementary or split-complementary pairs plus neutrals. Lightness
structure, the ink outline and white glints are kept. The other 25 labels keep the single-hue
rules in P above.
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
 '2d': ('Blood Moon', 'Starry night blade in deep crimson.', [R(170,270,356,1.05)], None),
 '3b': ('Royal Violet', 'Blue greatsword in royal violet, gold trim kept.', [R(170,260,275)], None),
 '3c': ('Jade Court', 'Blue greatsword in jade green with warm trim.', [R(170,260,150)], None),
 '4b': ('Cobalt Bone', 'Red toothed blade in cold cobalt blue over bone.', [R(-60,30,215)], None),
 '4c': ('Verdant Rot', 'Spore-green blade with bone teeth.', [R(-60,50,100)], None),
 '4d': ('Violet Maw', 'Bone-fanged blade in bruised violet.', [R(-60,50,272)], None),
 '5b': ('Sunfire Gold', 'Icy winged spear flipped to molten gold.', [R(150,260,42)], None),
 '5d': ('Rose Quartz', 'Frost spear in soft rose pink.', [R(150,260,340)], None),
 '6c': ('Ember Orange', 'Serpent spear glowing ember orange.', [R(100,200,24)], None),
 '6d': ('Crimson Coil', 'Serpent spear in deep crimson.', [R(100,200,354)], None),
 '8d': ('Venom Green', 'Doom lance banner in toxic green.', [R(-60,60,125)], None),
 '10b': ('Crimson Venom', 'Dripping dagger in blood red.', [R(60,180,352)], None),
 '10c': ('Violet Venom', 'Dripping dagger in poisonous violet.', [R(60,180,282)], None),
 '10d': ('Cobalt Venom', 'Dripping dagger in icy cobalt.', [R(60,180,215)], None),
 '12b': ('Blood Iron', 'Frost-lit anvil hammer in blood-red iron.', [R(140,250,356,1.4,-0.04)], (358,0.55)),
 '13c': ('Golden Dawn', 'Star bow turned warm gold.', [R(160,250,42,1.35,0.04)], None),
 '14d': ('Ember Gloom', 'Winged bow in smouldering amber.', [R(230,300,28,2.2,0.03)], None),
 '16c': ('Magenta Void', 'Swirling orb staff in magenta.', [R(100,220,308)], None),
 '18b': ('Emerald Grim', 'Skull scythe with an emerald blade.', [R(-60,60,145)], None),
 '18c': ('Violet Grim', 'Skull scythe with a violet blade.', [R(-60,60,275)], None),
 '18d': ('Azure Grim', 'Skull scythe with an azure blade.', [R(-60,60,205)], None),
 '19b': ('Azure Heart', 'Heart pickaxe in azure with gold trim.', [R(-60,30,205)], None),
 '19c': ('Emerald Silver', 'Heart pickaxe in emerald with silver trim.', [R(-60,30,140),R(30,100,200,0.25)], None),
 '22b': ('Frozen Teal', 'Rotted axe in frost blue and teal.', [R(-60,45,215),R(45,120,176)], None),
 '22c': ('Plum Rot', 'Rotted axe in crimson and plum.', [R(-60,45,345),R(45,120,290)], None),
}

# ---- role palettes: contrast recolours of 20 labels ------------------------------------
# Q(h, l, s, box, **out): match on source hue (-60..300 degrees), lightness, saturation (each a
# (lo, hi) range) and optional box (x0, y0, x1, y1); out: hh = new hue, sm = saturation multiplier,
# sa = absolute saturation (overrides sm), dl = lightness delta. First matching rule wins;
# unmatched pixels stay as they are. Ink (l < 0.09) and white glints (l > 0.93) never change.
def Q(h=None, l=None, s=None, box=None, **out): return (dict(h=h, l=l, s=s, box=box), out)
def _in(v, r): return r is None or r[0] <= v < r[1]
ROLES = {
 '1b': ('Crimson + Glacier Cyan', 'Ruby-red sun and flame body with a cold glacier-cyan lit blade.', [
     Q(l=(.58,1), hh=188, sm=.8), Q(hh=352)]),
 '1d': ('Violet + Acid Lime', 'Deep violet sun and rays with pale acid-lime lit feathers.', [
     Q(l=(.56,1), hh=85, sm=.85), Q(hh=272)]),
 '6b': ('Violet + Acid Green', 'Deep violet serpent body with bright acid-green energy tendrils.', [
     Q(l=(.5,1), s=(.2,1.01), hh=88, sm=1.3), Q(l=(0,.3), hh=268, sa=.5), Q(l=(.3,.5), hh=282, sa=.55)]),
 '7b': ('Steel Blue + Amber', 'Cold steel-blue lance and banner with a hot red-orange tip and amber glints.', [
     Q(h=(-60,12), hh=10), Q(l=(.62,1), hh=38), Q(hh=212, sm=.85)]),
 '8b': ('Purple + Pale Gold', 'Royal purple banner and spearhead over teal-black cloth with pale gold bone and stripes.', [
     Q(s=(0,.2), hh=190, sa=.3), Q(h=(-60,12), hh=282, sm=1.3), Q(h=(12,100), hh=52, sm=1.4)]),
 '9b': ('Crimson + Ice Cyan', 'Deep crimson hilt and guard with a pale ice-cyan blade.', [
     Q(l=(.55,1), hh=190, sm=.9), Q(hh=350)]),
 '9c': ('Deep Teal + Coral Rose', 'Deep teal hilt and guard with a pale coral-rose blade.', [
     Q(l=(.55,1), hh=355, sm=.9), Q(hh=178)]),
 '9d': ('Violet + Mint', 'Deep violet hilt and guard with a pale mint blade.', [
     Q(l=(.62,1), hh=100, sm=1.0, dl=-.08), Q(hh=272, sm=1.15)]),
 '11b': ('Steel Blue + Hot Pink', 'Steel-blue iron head, ivory bands, hot pink star and flames.', [
     Q(s=(0,.2), hh=215, sa=.3), Q(h=(-60,12), hh=338), Q(l=(.6,1), hh=335), Q(hh=48, sa=.4, dl=.1)]),
 '11c': ('Teal + Violet + Amber', 'Deep teal-green iron with violet bands and an amber-yellow star and flames.', [
     Q(s=(0,.2), hh=165, sa=.35), Q(h=(-60,12), hh=52), Q(l=(.6,1), hh=55), Q(hh=275, sm=1.1)]),
 '11d': ('Crimson + Cyan + Navy', 'Crimson bands over navy iron with a cyan star and flames.', [
     Q(s=(0,.2), hh=228, sa=.3), Q(h=(-60,12), hh=188), Q(l=(.6,1), hh=185, sm=.9), Q(hh=352, sm=.8, dl=-.05)]),
 '14b': ('Crimson + Cyan', 'Crimson thorned limbs with a cyan eye glow and ivory string.', [
     Q(l=(.6,1), s=(.2,1.01), hh=185), Q(s=(0,.2), l=(.3,1), hh=45, sa=.3), Q(hh=350, sa=.55)]),
 '14c': ('Teal + Gold', 'Deep teal thorned limbs with a golden eye glow and cream string.', [
     Q(l=(.6,1), s=(.2,1.01), hh=42), Q(s=(0,.2), l=(.3,1), hh=48, sa=.3), Q(hh=178, sa=.55)]),
 '15b': ('Azure + Violet + Gold', 'Azure petals and violet leaves on golden wood.', [
     Q(h=(-60,-5), hh=208), Q(h=(75,160), hh=275, sm=1.2)]),
 '17d': ('Magenta + Pale Cyan', 'Deep magenta-violet shaft and wrap with a pale ice-cyan blade.', [
     Q(h=(-60,10), hh=330), Q(l=(.58,1), hh=190, sm=.85), Q(l=(.3,.58), hh=315, sm=.95), Q(hh=262, sm=.9)]),
 '20b': ('Crimson + Bone Gold', 'Crimson jaw head with pale bone-gold fangs.', [
     Q(l=(.5,1), s=(.2,1.01), hh=48, sa=.55), Q(l=(0,.33), hh=350, sa=.5), Q(hh=355, sm=1.1)]),
 '20c': ('Violet + Acid Lime', 'Violet jaw head with acid-lime fangs.', [
     Q(l=(.5,1), s=(.2,1.01), hh=88), Q(l=(0,.33), hh=272, sa=.5), Q(hh=285)]),
 '20d': ('Burnt Orange + Ice Blue', 'Burnt-orange jaw head with ice-blue fangs.', [
     Q(l=(.5,1), s=(.2,1.01), hh=205, sm=.9), Q(l=(0,.33), hh=24, sa=.55), Q(hh=30)]),
 '21c': ('Steel Blue + Amber Runes', 'Steel-blue axe head and haft with glowing amber runes.', [
     Q(h=(75,160), hh=34, sm=1.8, dl=.08), Q(h=(5,75), hh=212, sm=1.3)]),
 '21d': ('Wine + Aqua Runes', 'Wine-red axe head and haft with glowing aqua runes.', [
     Q(h=(75,160), hh=175, sm=1.8, dl=.08), Q(h=(5,75), hh=350, sm=1.5)]),
}

def recolour_roles(im, rules):
    out = im.copy(); px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
            if l < 0.09 or l > 0.93: continue
            hd = h * 360
            if hd >= 300: hd -= 360
            for m, o in rules:
                if not (_in(hd, m['h']) and _in(l, m['l']) and _in(s, m['s'])): continue
                bx = m['box']
                if bx and not (bx[0] <= x < bx[2] and bx[1] <= y < bx[3]): continue
                ns = o['sa'] if 'sa' in o else min(1, s * o.get('sm', 1.0))
                nl = min(.96, max(.1, l + o.get('dl', 0.0)))
                nr, ng, nb = colorsys.hls_to_rgb(o['hh'] / 360, nl, ns)
                px[x, y] = (round(nr*255), round(ng*255), round(nb*255), 255)
                break
    return out

INFO = {k: v[:2] for k, v in {**P, **ROLES}.items()}
INFO = dict(sorted(INFO.items(), key=lambda kv: (int(kv[0][:-1]), kv[0][-1])))

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
    for label in sorted(INFO, key=lambda l: (int(l[:-1]), l[-1])):
        name, hint = INFO[label]
        t, side, i = src_info(label); sc = 'm' if side == 'mythic' else 'v'
        letter = chr(97 + i)
        im = Image.open(f'{SRC}/h-{t}-{sc}{i}.png').convert('RGBA')
        res = recolour_roles(im, ROLES[label][2]) if label in ROLES else recolour(im, P[label][2], P[label][3])
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
            labels = [l for l in INFO if src_info(l)[0] == t and src_info(l)[1] == ('mythic' if sc == 'm' else 'void')]
            rows.append((t, sc, labels))
    cw, ch = 110, 140
    W = cw * 5; H = ch * len(rows)
    sheet = Image.new('RGBA', (W, H), (58, 60, 72, 255)); d = ImageDraw.Draw(sheet)
    for ri, (t, sc, labels) in enumerate(rows):
        o = Image.open(f'{OUT_DIRS[0]}/item-{t}-h{sc}.png').convert('RGBA')
        cells = [(o, f'{t} h{sc} ORIGINAL')] + [(made[l], f'{l} {INFO[l][0]}') for l in labels]
        for ci, (im, lab) in enumerate(cells):
            x, y = ci * cw + 5, ri * ch
            sheet.alpha_composite(im.resize((100, 120), Image.NEAREST), (x, y))
            d.text((x, y + 121), lab[:17], fill=(255, 255, 255, 255), font=font)
    sheet.save(os.path.join(ROOT, 'design/heirloom-recolours-contact.png'))

if __name__ == '__main__': main()
