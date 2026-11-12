"""Makes the achievement badges from the achievement badges sheet (docs/ASSET_RULES.md section 5).

Usage: python -I scripts/art/make-badges.py [PACKS_DIR]

Deterministic, no hand edits except the four small glyphs drawn below as pixel rows (KEY, MOON,
SHIELD, GEAR, in the sheet's own four colours and outline weight). The sheet (`achievements.png`,
Game Boy green, four colours) holds 20 badge icons and two blank bases (round, octagonal). Two icons
copy outside brands (a block-game creeper, a video play button) and are left out. Icons that carry a
number ("50K") are cut above the number. Every achievement gets one glyph on a base (GLYPH_OF,
below), in five colourways, one per sticker style a..e: green (the sheet's own), bronze, silver,
gold, prismatic. A locked achievement shows the blank base, dimmed.
Writes src/renderer/src/art/pixel/hand/badge-<style>-<achievement>.png (32 x 32) and
badge-locked-<round|octagon>.png (dimmed, one for all styles) and
src/renderer/src/art/pixel/badges.gen.ts (which achievements sit on the octagon). Run `node scripts/art/bake-pixels.mjs` after.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'src', 'renderer', 'src', 'art', 'pixel', 'hand')

# the sheet's four colours: dark outline, mid body, light-mid rim, light highlight
SRC = {
    'D': (7, 24, 33),
    'M': (48, 104, 80),
    'L': (134, 192, 108),
    'W': (224, 248, 207),
}
STYLES = {
    'a': {'D': (7, 24, 33), 'M': (48, 104, 80), 'L': (134, 192, 108), 'W': (224, 248, 207)},  # green
    'b': {'D': (46, 24, 12), 'M': (140, 84, 40), 'L': (205, 135, 66), 'W': (250, 224, 178)},  # bronze
    'c': {'D': (26, 30, 44), 'M': (96, 106, 126), 'L': (160, 171, 190), 'W': (242, 246, 252)},  # silver
    'd': {'D': (56, 32, 4), 'M': (176, 118, 10), 'L': (236, 180, 40), 'W': (255, 247, 182)},  # gold
    'e': {'D': (46, 26, 82), 'M': (140, 96, 206), 'L': (118, 206, 226), 'W': (250, 238, 255)},  # prismatic
}

# glyphs on the sheet: (left, top, right, bottom) boxes and rows to keep (the number sits below)
SHEET_GLYPHS = {
    'crown': ((99, 260, 124, 280), 13),
    'trophy': ((131, 262, 156, 282), 13),
    'star': ((168, 260, 185, 282), 14),
    'ledger': ((196, 262, 219, 282), None),
    'heart': ((132, 291, 156, 312), 13),
    'check': ((167, 297, 184, 309), None),
    'steps': ((196, 293, 219, 315), None),
    'fangs': ((229, 295, 250, 312), None),
    'swords': ((100, 325, 123, 346), 16),
    'gem': ((134, 324, 156, 343), 11),
    'bottle': ((228, 325, 251, 345), None),
    'flag': ((99, 357, 124, 379), None),
    'cup': ((132, 357, 155, 377), 14),
    'bigcup': ((164, 356, 187, 378), None),
    'foot': ((197, 358, 218, 378), None),
    'tools': ((228, 357, 251, 378), None),
}

# small glyphs in the same style, drawn as rows (D dark, L light-mid, W light, M mid, . empty)
KEY = """
................
.....DDDDD......
....DLLLLLD.....
...DLWWWWWLD....
...DLW...WLD....
...DLW...WLD....
...DLWWWWWLD....
....DLLLLLD.....
.....DDLDD......
......DLD.......
......DLD.......
......DLDDD.....
......DLLLD.....
......DLDDD.....
......DLLLD.....
......DDDDD.....
"""
MOON = """
................
.....DDDDD......
....DLLLWWD.....
...DLLWDDDD.....
..DLLWD.........
..DLLWD.........
..DLLLWD........
..DLLLLWDD......
...DLLLLLWD.....
....DLLLLLWDD...
.....DDLLLLLD...
.......DDDDD....
................
................
................
................
"""
SHIELD = """
................
..DDDDDDDDDDDD..
..DWWLLLLLLLLD..
..DWLLLDDLLLLD..
..DWLLLDDLLLLD..
..DWLDDDDDDLLD..
..DWLDDDDDDLLD..
..DWLLLDDLLLLD..
..DWLLLDDLLLLD..
...DWLLDDLLLD...
...DWLLLLLLLD...
....DLLLLLLD....
.....DLLLLD.....
......DLLD......
.......DD.......
................
"""
GEAR = """
................
.......DD.......
....D.DLLD.D....
...DLDDLLDDLD...
....DLLLLLLD....
..DDLLWWWWLLDD..
.DLLLWDDDDWLLLD.
.DLLLWD..DWLLLD.
.DLLLWD..DWLLLD.
.DLLLWDDDDWLLLD.
..DDLLWWWWLLDD..
....DLLLLLLD....
...DLDDLLDDLD...
....D.DLLD.D....
.......DD.......
................
"""

# achievement id -> glyph. Every achievement of achievements.json gets one; unknown ids fall back
# by condition kind (KIND_GLYPH), so a new achievement still shows a badge.
GLYPH_OF = {
    'first_harvest': 'check', 'first_kill': 'swords', 'lumberjack_1': 'tools', 'lumberjack_2': 'tools',
    'prospector_1': 'gem', 'prospector_2': 'gem', 'tree_hugger': 'heart', 'deep_delver': 'foot',
    'giant_slayer_1': 'fangs', 'giant_slayer_2': 'fangs', 'giant_slayer_3': 'fangs',
    'glimmer_seeker': 'star', 'first_summon': 'bottle', 'ten_pulls': 'bottle', 'pity_breaker': 'heart',
    'silver_lining': 'star', 'golden_hour': 'star', 'six_stars': 'star', 'prismatic_dawn': 'star',
    'full_loadout': 'shield', 'dressed_up': 'crown', 'fashionista': 'crown', 'skilled': 'ledger',
    'first_ascension': 'flag', 'challenger': 'flag', 'night_owl': 'moon', 'first_milestone': 'check',
    'gem_adept': 'gem', 'medalist': 'trophy', 'masterwork': 'crown', 'first_silver': 'star',
    'golden_stage': 'star', 'mythic_stage': 'star', 'stage_collector': 'cup', 'fully_starred': 'bigcup',
    'golden_dungeon': 'bigcup', 'star_hunter_1': 'star', 'star_hunter_2': 'star', 'star_hunter_3': 'star',
    'third_hand': 'gear', 'full_crew': 'gear', 'busy_hive': 'gear', 'sharpening': 'swords',
    'well_equipped': 'shield', 'digging_deeper': 'foot', 'deep_roots': 'foot', 'forgemaster': 'tools',
    'make_a_wish': 'star', 'wish_granted': 'heart', 'dream_team': 'crown', 'branching_out': 'ledger',
    'constellation': 'ledger', 'keystone_bearer': 'key', 'rule_breaker': 'key', 'first_circle': 'key',
    'armoury': 'shield', 'bond_found': 'heart', 'first_expedition': 'steps', 'hard_won': 'cup',
    'hard_everywhere': 'cup', 'nightmare_won': 'fangs', 'nightmare_everywhere': 'fangs',
    'hard_starred': 'bigcup', 'nightmare_starred': 'bigcup', 'deep_diver': 'steps', 'abyss_walker': 'steps',
}
KIND_GLYPH = {'harvested': 'tools', 'kills': 'swords', 'pulls': 'bottle', 'stage_stars': 'star'}
# base shape per chapter-like grouping: round for gathering and cards, octagon for the rest
OCTAGON = {'swords', 'fangs', 'cup', 'bigcup', 'shield', 'flag', 'tools', 'key', 'moon'}


def rows_image(text):
    rows = [r for r in text.strip('\n').split('\n')]
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in SRC:
                px[x, y] = (*SRC[ch], 255)
    return im


def clean(im):
    """The sheet's top-left transparent pixels stay empty; green background pixels never occur here."""
    return im.convert('RGBA')


def glyph_images(sheet):
    out = {}
    for name, (box, keep) in SHEET_GLYPHS.items():
        g = sheet.crop((box[0], box[1], box[2] + 1, box[3] + 1))
        if keep:
            g = g.crop((0, 0, g.width, keep))
        bb = g.getbbox()
        out[name] = g.crop(bb)
    for name, text in (('key', KEY), ('moon', MOON), ('shield', SHIELD), ('gear', GEAR)):
        g = rows_image(text)
        out[name] = g.crop(g.getbbox())
    return out


def recolour(im, style):
    pal = STYLES[style]
    lookup = {SRC[k]: pal[k] for k in SRC}
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in lookup:
                px[x, y] = (*lookup[(r, g, b)], 255)
    return out


def dim(im):
    """Locked: the base darkened and drained of colour."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                grey = (r + g + b) / 3
                px[x, y] = tuple(round((c * 0.4 + grey * 0.6) * 0.62) for c in (r, g, b)) + (255,)
    return out


def main():
    packs = sys.argv[1] if len(sys.argv) > 1 else os.path.join('C:\\', 'Basic Incremental', 'design', 'references', 'itch')
    sheet = clean(Image.open(os.path.join(packs, 'achievements.png')))
    bases = {
        'round': sheet.crop((32, 256, 64, 288)),
        'octagon': sheet.crop((32, 304, 64, 336)),
    }
    glyphs = glyph_images(sheet)
    ids = [a['id'] for a in json.load(open(os.path.join(ROOT, 'src', 'data', 'content', 'achievements.json'), encoding='utf8'))['achievements']]
    missing = [i for i in ids if i not in GLYPH_OF]
    if missing:
        raise SystemExit(f'no glyph chosen for: {missing}')
    os.makedirs(OUT, exist_ok=True)
    for style in STYLES:
        for aid in ids:
            g = glyphs[GLYPH_OF[aid]]
            shape = 'octagon' if GLYPH_OF[aid] in OCTAGON else 'round'
            badge = bases[shape].copy()
            badge.alpha_composite(g, ((32 - g.width) // 2, (32 - g.height) // 2))
            recolour(badge, style).save(os.path.join(OUT, f'badge-{style}-{aid}.png'))
    for shape, base in bases.items():
        dim(base).save(os.path.join(OUT, f'badge-locked-{shape}.png'))
    octagons = sorted(a for a in ids if GLYPH_OF[a] in OCTAGON)
    gen = os.path.join(ROOT, 'src', 'renderer', 'src', 'art', 'pixel', 'badges.gen.ts')
    with open(gen, 'w', encoding='utf8', newline='\n') as f:
        f.write('// Generated by scripts/art/make-badges.py. Do not edit by hand.\n')
        f.write('/** Achievements whose badge sits on the octagonal base (the others are round). */\n')
        f.write('export const OCTAGON_BADGES: ReadonlySet<string> = new Set([\n')
        for a in octagons:
            f.write(f"  '{a}'," + '\n')
        f.write(']);\n')
    print(f'{len(ids)} achievements x {len(STYLES)} styles, glyphs: {", ".join(sorted(set(GLYPH_OF.values())))}')
    # a preview of every glyph on its base, green
    sheet_out = Image.new('RGBA', (8 * 34, ((len(glyphs) + 7) // 8) * 34), (58, 48, 70, 255))
    for i, (name, g) in enumerate(sorted(glyphs.items())):
        shape = 'octagon' if name in OCTAGON else 'round'
        b = bases[shape].copy()
        b.alpha_composite(g, ((32 - g.width) // 2, (32 - g.height) // 2))
        sheet_out.alpha_composite(b, ((i % 8) * 34, (i // 8) * 34))
    sheet_out.save(os.path.join(OUT, '..', '..', '..', '..', '..', '..', 'design', 'options', 'ui-layouts-built', 'itch', 'badge-glyphs.png'))


if __name__ == '__main__':
    main()
