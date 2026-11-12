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

# ---- part palettes: contrast recolours of 20 labels ------------------------------------
# Each weapon is split into its PARTS by position and shape (polygons, circles, lines along the
# shaft, y/x bands), refined where the source already separates a part by feature (neutral iron,
# bright shards, red eyes). Each part gets its own colour ramp K(...). Parts are tried in order,
# the first match wins, the last entry of a sprite is its fallback. The source's lightness
# is kept (shading and the pixel structure survive); hue shifts along the ramp from the
# shadow hue to the highlight hue so it reads as painted, and saturation fades in highlights.
class Pr:
    def __init__(s, f): s.f = f
    def __call__(s, x, y, l, sat, h): return s.f(x, y, l, sat, h)
    def __and__(s, o): return Pr(lambda *a: s.f(*a) and o.f(*a))
    def __or__(s, o): return Pr(lambda *a: s.f(*a) or o.f(*a))
    def __invert__(s): return Pr(lambda *a: not s.f(*a))
def circ(cx, cy, r): return Pr(lambda x, y, l, s, h: (x-cx)**2 + (y-cy)**2 <= r*r)
def poly(pts):
    def f(x, y, l, s, h):
        ins = False; n = len(pts); j = n - 1
        for i in range(n):
            xi, yi = pts[i]; xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj-xi)*(y-yi)/(yj-yi) + xi: ins = not ins
            j = i
        return ins
    return Pr(f)
def _sd(p, q, x, y):
    dx, dy = q[0]-p[0], q[1]-p[1]; n = (dx*dx + dy*dy) ** .5
    return ((x-p[0])*dy - (y-p[1])*dx) / n   # signed distance from line p-q
def _seg(p, q, x, y):
    dx, dy = q[0]-p[0], q[1]-p[1]; t = max(0, min(1, ((x-p[0])*dx + (y-p[1])*dy) / (dx*dx + dy*dy)))
    return ((x-p[0]-t*dx)**2 + (y-p[1]-t*dy)**2) ** .5
def near(p, q, w): return Pr(lambda x, y, l, s, h: _seg(p, q, x, y) <= w)
def side(p, q, lo, hi=999): return Pr(lambda x, y, l, s, h: lo <= _sd(p, q, x, y) < hi)
def X(a, b): return Pr(lambda x, y, l, s, h: a <= x < b)
def Y(a, b): return Pr(lambda x, y, l, s, h: a <= y < b)
def L(a, b): return Pr(lambda x, y, l, s, h: a <= l < b)
def S(a, b): return Pr(lambda x, y, l, s, h: a <= s < b)
def H(a, b): return Pr(lambda x, y, l, s, h: a <= h < b)
ALL = Pr(lambda *a: True)
def K(hd, hl, sat, g=1.0, dl=0.0):
    """Colour ramp: hue hd in the shadows to hl in the highlights, saturation sat, lightness l*g+dl."""
    return (hd, hl, sat, g, dl)
def _ang(a, b, t):
    d = ((b - a + 180) % 360) - 180
    return (a + d * t) % 360
def paint(col, l):
    hd, hl, sat, g, dl = col
    t = max(0, min(1, (l - .15) / .7))
    hue = _ang(hd, hl, t)
    nl = max(.1, min(.96, l * g + dl))
    ns = max(0, min(1, sat * (1 - max(0, l - .72) * 1.6)))
    r, gg, b = colorsys.hls_to_rgb(hue / 360, nl, ns)
    return (round(r*255), round(gg*255), round(b*255), 255)

# blade/shape polygons used by several labels
BL1B = poly([(40,62),(40,48),(50,40),(56,28),(66,18),(78,8),(94,6),(94,28),(86,40),(78,52),(68,64),(58,70),(48,68)])
BL1D = poly([(46,58),(48,44),(56,32),(66,20),(78,10),(90,8),(93,12),(92,26),(84,38),(74,50),(62,60),(52,64)])
BL9B = poly([(46,56),(52,48),(64,40),(76,28),(84,14),(88,8),(93,14),(93,38),(80,56),(66,68),(56,70)])
BL9C = poly([(44,46),(58,36),(70,22),(80,10),(93,8),(92,26),(80,44),(66,58),(54,64),(48,60)])
BL9D = poly([(44,48),(56,42),(68,32),(78,20),(88,8),(91,12),(90,30),(78,46),(66,60),(54,62)])

# per label: (paletteName, hint, [(part name, region, colour), ...])
ROLES = {
 '1b': ('Teal blade, crimson sun, blue gem, gold grip', 'Ice-pale blade with a teal flame edge, crimson sun rays, a sapphire gem and pommel, and a gold grip.', [
     ('gem', circ(42,72,7.5), K(222,205,.85,.95)),
     ('blade core', BL1B & L(.66,1), K(190,170,.35,1.0)),
     ('blade edge', BL1B, K(176,165,.85,.85)),
     ('pommel', circ(15,104,10), K(222,205,.85,.95)),
     ('grip', near((33,84),(17,99),6.5), K(38,50,.85,1.0)),
     ('sun rays', ALL, K(352,8,.8,.85))]),
 '1d': ('Violet blade, lime highlights, cobalt sun, magenta gem', 'Violet feather blade lit with lime, cobalt sun rays, a magenta gem, a bronze grip and a lime pommel.', [
     ('gem', circ(44,68,7.5), K(318,335,.85,1.0)),
     ('blade lit', BL1D & L(.76,1), K(82,95,.8,1.0)),
     ('blade', BL1D, K(272,285,.7,.9)),
     ('pommel', circ(14,103,10), K(82,95,.8,1.0)),
     ('grip', near((34,84),(16,99),7), K(25,38,.6,.8)),
     ('sun rays', ALL, K(215,205,.7,.95))]),
 '6b': ('Orchid head, amber core, lime tendrils, indigo coils', 'Orchid spearhead with an amber glowing core, acid-lime tendrils and an indigo serpent body.', [
     ('core', circ(62,47,6) & L(.45,1), K(40,55,.9,1.1)),
     ('head', poly([(60,26),(76,8),(92,6),(93,30),(82,38),(70,46),(58,44)]), K(318,335,.7,.95)),
     ('barbs', poly([(62,36),(84,34),(84,64),(62,64)]), K(318,335,.7,.95)),
     ('tendrils', poly([(28,46),(62,50),(62,72),(40,74)]) & L(.42,1), K(88,100,.85,1.05)),
     ('claws', Y(88,120), K(40,48,.7,1.3)),
     ('coils', ALL, K(250,262,.55,1.0))]),
 '7b': ('Teal banner, silver blade, gold socket, violet bell, crimson shaft', 'Teal banner, silver-ice spearhead, gold socket and butt, a violet bell guard and a crimson shaft.', [
     ('banner', side((14,104),(86,12),9) & Y(20,66), K(182,172,.75,.88)),
     ('blade', Y(0,24) & X(60,95), K(205,190,.3,1.05)),
     ('socket', Y(24,40) & X(66,95), K(42,52,.85,1.0)),
     ('bell', circ(32,82,15) & Y(66,97), K(272,282,.6,.95)),
     ('butt', X(0,26) & Y(90,120), K(42,50,.8,1.0)),
     ('shaft', ALL, K(352,8,.75,.85))]),
 '8b': ('Slate cloth, cyan trim, violet shaft, pale gold bone, amber eyes', 'Slate banner cloth with cyan trim, a violet shaft and spearhead, pale gold bone skull and stripes with amber eyes.', [
     ('eyes', (circ(24,76,5.5) | circ(38,80,5.5)) & S(.3,1.01), K(38,48,.95,1.3)),
     ('cloth trim', side((12,105),(88,12),-999,-7) & Y(28,120) & X(52,100) & S(.25,1.01), K(185,175,.85,1.3)),
     ('cloth', side((12,105),(88,12),-999,-7) & Y(28,120) & X(52,100), K(215,225,.28,1.1)),
     ('bone', S(0,.5) & L(.45,1), K(48,52,.55,1.0)),
     ('shaft', ALL, K(272,285,.65,1.1))]),
 '9b': ('Ice-cyan blade, crimson guard, gold gem, navy grip', 'Pale ice-cyan blade, crimson guard, a gold gem, a navy grip and a gold pommel.', [
     ('gem', circ(47,64,3.2), K(48,55,.9,1.1)),
     ('blade', BL9B, K(186,172,.55,1.0)),
     ('pommel', circ(15,103,9), K(42,52,.8,1.0)),
     ('grip', poly([(18,76),(36,70),(42,78),(30,94),(18,96)]), K(225,235,.45,.9)),
     ('guard', ALL, K(352,10,.75,.85))]),
 '9c': ('Rose blade, teal guard, amber gem, cobalt grip', 'Pale rose blade, deep teal guard, an amber gem and pommel, and a cobalt grip.', [
     ('gem', circ(41,59,3), K(38,48,.95,1.1)),
     ('blade', BL9C, K(345,358,.6,1.0)),
     ('pommel', circ(13,103,7.5), K(38,48,.95,1.1)),
     ('grip', poly([(20,76),(38,66),(46,70),(36,92),(20,96)]), K(222,212,.6,.9)),
     ('guard', ALL, K(180,170,.75,.85))]),
 '9d': ('Mint blade, violet guard, magenta gem, bronze grip', 'Pale mint blade, violet guard, a magenta gem and pommel, and a bronze grip.', [
     ('gem', circ(46,63,3), K(330,340,.9,1.1)),
     ('blade', BL9D, K(150,140,.5,1.0)),
     ('pommel', circ(12,104,8), K(330,340,.9,1.1)),
     ('grip', poly([(18,80),(38,70),(44,76),(34,94),(20,96)]), K(26,36,.6,.8)),
     ('guard', ALL, K(270,282,.6,.9))]),
 '11b': ('Steel iron, silver bands, pink flames, ice star, crimson handle', 'Steel-blue iron head, pale silver bands, hot pink flames, an ice-white star, a crimson handle and an emerald pommel.', [
     ('pommel', circ(18,101,10), K(150,160,.7,1.0)),
     ('handle', Y(74,120) & X(0,44), K(355,10,.55,.9)),
     ('star', circ(53,43,10) & L(.55,1), K(185,175,.7,1.05)),
     ('flames', H(-60,30) & S(.4,1.01), K(325,340,.85,1.0)),
     ('iron', S(0,.22), K(215,222,.28,1.25)),
     ('bands', ALL, K(48,55,.5,1.05))]),
 '11c': ('Violet iron, teal bands, amber flames, magenta star, bronze handle', 'Violet iron head, teal bands, amber flames, a magenta star, a bronze handle and a cyan pommel.', [
     ('pommel', circ(18,101,10), K(190,185,.8,1.0)),
     ('handle', Y(74,120) & X(0,44), K(25,38,.55,.85)),
     ('star', circ(56,40,10) & L(.55,1), K(320,330,.6,1.05)),
     ('flames', H(-60,30) & S(.4,1.01), K(52,60,.9,1.0)),
     ('iron', S(0,.22), K(268,275,.3,1.3)),
     ('bands', ALL, K(170,180,.7,.95))]),
 '11d': ('Maroon iron, violet bands, cyan flames, gold star, navy handle', 'Crimson-maroon iron head, violet bands, cold cyan flames, a gold star and pommel, and a navy handle.', [
     ('pommel', circ(20,98,10), K(45,52,.7,1.0)),
     ('handle', Y(74,120) & X(0,44), K(228,238,.45,.95)),
     ('star', circ(55,43,10) & L(.55,1), K(50,56,.8,1.1)),
     ('flames', H(-60,30) & S(.4,1.01), K(195,188,.85,1.0)),
     ('iron', S(0,.22), K(352,358,.4,1.3)),
     ('bands', ALL, K(280,290,.5,1.05))]),
 '14b': ('Crimson limbs, cyan runes, teal riser, amber eye, gold string', 'Crimson limbs with cyan rune lines, a deep teal riser, an amber eye and a pale gold string.', [
     ('eye', circ(37,53,4.5), K(40,52,.95,1.5)),
     ('string', near((88,36),(40,102),2.6) & Y(34,110), K(46,52,.7,1.7)),
     ('runes', L(.5,1) & S(.25,1.01), K(185,178,.8,1.1)),
     ('riser', Y(46,72), K(200,210,.55,1.3)),
     ('limbs', ALL, K(350,8,.6,1.25))]),
 '14c': ('Violet limbs, lime runes, copper riser, cyan eye, pink string', 'Violet limbs with acid-lime runes, a copper-brown riser, a cyan eye and a rose string.', [
     ('eye', circ(44,47,5), K(185,180,.95,1.4)),
     ('string', near((88,32),(38,102),2.8) & Y(26,110), K(335,345,.7,1.5)),
     ('runes', L(.5,1) & S(.25,1.01), K(78,90,.9,1.1)),
     ('riser', Y(40,70), K(22,32,.55,1.4)),
     ('limbs', ALL, K(268,280,.55,1.35))]),
 '15b': ('Azure petals, amber gem, violet ring, teal leaves, plum wood', 'Azure petals, an amber gem, a violet ring, teal leaves and a plum-brown stem.', [
     ('gem', circ(66,33,6.5), K(30,42,.95,1.1)),
     ('petals', H(-60,-5), K(205,198,.8,.95)),
     ('ring', H(30,60) & S(.4,1.01), K(272,285,.55,1.15)),
     ('leaves', H(60,170), K(168,178,.65,1.0)),
     ('wood', ALL, K(345,10,.35,.9))]),
 '17d': ('Teal blade, violet crest, rose gems, navy shaft', 'Ice-teal blade, violet crest wings, rose gems, a navy shaft and an ivory tuft.', [
     ('gems', (circ(70,32,6) | circ(60,47,4.5)) & H(-60,30), K(338,348,.9,1.0)),
     ('blade lit', Y(0,34) & X(0,58) & L(.72,1), K(186,178,.45,1.0)),
     ('blade', Y(0,34) & X(0,58), K(175,165,.8,.85)),
     ('crest', Y(8,52) & X(52,100), K(275,285,.6,1.0)),
     ('tuft', Y(92,120) & X(0,30), K(48,52,.5,1.0)),
     ('shaft', ALL, K(225,235,.55,.9))]),
 '20b': ('Crimson head, bone fangs, cyan eye, slate handle, emerald pommel', 'Crimson jaw head, ivory fangs, a cyan eye, a slate handle with gold bands and an emerald pommel.', [
     ('pommel', circ(15,104,9.5), K(150,160,.75,1.1)),
     ('eye', circ(60,44,6), K(190,180,.9,1.2)),
     ('bands', near((16,103),(48,63),9) & Y(58,100) & L(.45,1), K(45,50,.7,1.2)),
     ('handle', near((16,103),(48,63),9) & Y(58,100), K(255,265,.35,1.3)),
     ('fangs', L(.52,1), K(48,52,.5,1.05)),
     ('head', ALL, K(350,358,.65,1.1))]),
 '20c': ('Violet head, lime fangs, bronze handle, rose pommel', 'Violet jaw head, acid-lime fangs, a bronze handle with gold bands and a rose pommel.', [
     ('pommel', circ(15,104,9.5), K(335,345,.7,1.2)),
     ('bands', near((16,103),(50,60),9) & Y(56,100) & L(.45,1), K(40,48,.7,1.15)),
     ('handle', near((16,103),(50,60),9) & Y(56,100), K(25,35,.5,1.3)),
     ('fangs', L(.52,1), K(86,95,.9,1.0)),
     ('head', ALL, K(272,285,.55,1.15))]),
 '20d': ('Orange head, ice-blue fangs, green handle, crimson pommel', 'Burnt-orange jaw head, ice-blue fangs, a deep green handle with pale gold bands and a crimson pommel.', [
     ('pommel', circ(15,104,9.5), K(355,5,.8,1.2)),
     ('bands', near((18,103),(50,62),9) & Y(58,100) & L(.45,1), K(48,52,.6,1.2)),
     ('handle', near((18,103),(50,62),9) & Y(58,100), K(160,150,.45,1.3)),
     ('fangs', L(.52,1), K(205,195,.7,1.0)),
     ('head', ALL, K(24,32,.65,1.15))]),
 '21c': ('Steel rim, amber runes, wine head, teal handle, gold vines', 'Steel-blue rim, glowing amber runes, a wine-red head, a teal handle, gold vines and a sapphire pommel.', [
     ('pommel', Y(92,120) & X(0,35), K(222,210,.8,1.0)),
     ('vines', near((14,104),(52,62),9) & Y(56,120) & H(70,170), K(46,54,.75,1.1)),
     ('handle', near((14,104),(52,62),9) & Y(56,120), K(180,190,.55,.9)),
     ('runes', H(80,170), K(30,45,.95,1.2)),
     ('rim', H(35,80), K(210,200,.35,1.15)),
     ('head', ALL, K(348,358,.5,.95))]),
 '21d': ('Aqua rim, orange runes, plum head, slate handle, rose vines', 'Turquoise rim, glowing orange runes, a plum head, a slate handle, rose vines and an aqua pommel.', [
     ('pommel', Y(96,120) & X(0,25), K(178,185,.7,1.0)),
     ('runes', H(80,170) & L(.52,1), K(25,40,.95,1.2)),
     ('vines', near((12,104),(50,56),9) & Y(52,120) & H(70,170), K(350,5,.65,1.15)),
     ('handle', near((12,104),(50,56),9) & Y(52,120), K(215,225,.3,1.1)),
     ('rim', H(35,80), K(172,182,.65,1.0)),
     ('head', ALL, K(285,295,.4,1.0))]),
}

def recolour_roles(im, parts):
    out = im.copy(); px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
            if l < 0.09 or l > 0.93: continue
            hd = h * 360
            if hd >= 300: hd -= 360
            for _, reg, col in parts:
                if reg(x, y, l, s, hd):
                    px[x, y] = paint(col, l); break
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
