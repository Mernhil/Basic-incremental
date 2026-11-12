"""Cuts the enemy, mini-boss and boss sprites out of the asset packs (docs/ASSET_RULES.md section 5).

Usage: python -I scripts/art/cut-pack.py [PACKS_DIR] [--sheet PREVIEW.png]

Deterministic, no hand edits (Pillow only). For each character in ROSTER it takes the idle frames
of the `south` direction (the packs' front view) and
  1. keeps whole opaque pixels only (alpha under 128 becomes empty, the rest fully opaque),
  2. trims to the union of the frames' bounds,
  3. centres that on the boss canvas (160 x 172), feet on one shared ground line, so every enemy
     stands where the bosses stand,
  4. writes `foe-<id>.png` (the first frame, the still) and `foe-<id>-anim.png` (all frames side by
     side) into src/renderer/src/art/pixel/hand/, the strip convention of the top-tier motion strips.
No palette change, except the two Bloodroot recolours (Ember, Black), which shift the hue of the
one Bloodroot pack (its licence allows modifying). The original packs stay in
design/references/itch/ (local, never committed). Run `node scripts/art/bake-pixels.mjs` after.
"""
import colorsys
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'src', 'renderer', 'src', 'art', 'pixel', 'hand')
CANVAS = (160, 172)
GROUND = 166  # the row the feet stand on (the bosses' feet end at 163 to 170)

OBS = 'Obsidian_Crab_Pixel_Art_v1.0_AllColors/Obsidian_Crab_Pixel_Art_v1.0_AllColors'
BLOOD = 'Bloodroot_FREE_v1.0/Bloodroot_FREE_v1.0/Idle/south'

# id -> (idle folder of the south direction inside the packs dir, recolour or None)
ROSTER = {
    # Mossy Cellar
    'bloodroot': (BLOOD, None),
    'woodland_stalker_wolf': ('woodland-stalker-wolf-hunter-combat-FREE/Animations/IdleBreathing/south', None),
    'plague_doctor': ('plague-doctor-FREE/Animations/Idle/south', None),
    'plague_lantern_keeper': ('ashen-watch-FREE/Plague_Lantern_Keeper/animations/Idle/south', None),
    # Ember Crypt
    'obsidian_crab_red': (OBS + '/Red/Idle/south', None),
    'fire_witch': ('fire-witch-FREE/Animations/Idle/south', None),
    'bloodroot_ember': (BLOOD, 'ember'),
    'blood_duchess': ('blood-duchess-FREE/Animations/Idle/south', None),
    # Frostspire Vault
    'ice_sorceress': ('ice-sorceress-FREE/Animations/Idle/south', None),
    'ivory_direwolf': ('ivory-direwolf-FREE/Animations/Idle/south', None),
    'obsidian_crab_blue': (OBS + '/Blue/Idle/south', None),
    'glacierbreaker_knight': ('glacierbreaker-knight-FREE-COMPLETE/Animations/Idle/south', None),
    # Dungeon 4 (a cursed sea)
    'abyssal_sharkfang_raider': ('cursed-tide-FREE/Abyssal_Sharkfang_Raider/animations/Idle/south', None),
    'gothic_corsair': ('gothic-corsair-FREE/Animations/Idle/south', None),
    'obsidian_crab_green': (OBS + '/Green/Idle/south', None),
    'drowned_leviathanbeard_high_admiral': ('cursed-tide-FREE/Drowned_Leviathanbeard_High_Admiral/animations/Idle/south', None),
    'abyssal_anchor_leviathan': ('cursed-tide-FREE/Abyssal_Anchor_Leviathan/animations/Idle/south', None),
    # Sunken Sanctum
    'golden_cross_novice_priestess': ('golden-cross-novice-priestess-FREE/Animations/Idle/south', None),
    'ivory_sun_priestess': ('ivory-sun-priestess-FREE/Animations/Idle/south', None),
    'cathedral_reliquary': ('cathedral-reliquary-FREE/Animations/Idle/south', None),
    'holy_judiciar': ('holy-judiciar-FREE/Animations/Idle/south', None),
    'sanctuary_archangel': ('sanctuary-archangel-FREE/Animations/Idle/south', None),
    # Hollow of the Void (the Shadow Slime has no front-facing pixel art yet)
    'hooded_rogue_assassin': ('hooded-rogue-assassin-FREE/Animations/Idle/south', None),
    'bloodroot_black': (BLOOD, 'black'),
    'gothic_bloodhunter': ('gothic-bloodhunter-FREE/Animations/Idle/south', None),
    'faceless_void_reaper': ('faceless-void-reaper-FREE/Animations/Idle/south', None),
}


def recolour(px, how):
    """Hue shift of one RGB pixel (the two Bloodroot variants)."""
    r, g, b = (c / 255 for c in px)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if how == 'ember':
        # crimson and purple become glowing orange and gold: a quarter turn of hue, brighter
        if s > 0.15:
            h = (h + 0.11) % 1.0
        s = min(1.0, s * 1.15)
        v = min(1.0, v * 1.15)
    elif how == 'black':
        s *= 0.25
        v *= 0.5
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (round(r * 255), round(g * 255), round(b * 255))


def load_frames(folder, how):
    names = sorted(f for f in os.listdir(folder) if f.endswith('.png'))
    frames = []
    for n in names:
        im = Image.open(os.path.join(folder, n)).convert('RGBA')
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a < 128:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    if how:
                        r, g, b = recolour((r, g, b), how)
                    px[x, y] = (r, g, b, 255)
        frames.append(im)
    return frames


def cut(packs, name, folder, how):
    frames = load_frames(os.path.join(packs, folder), how)
    box = None
    for f in frames:
        b = f.getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    w, h = box[2] - box[0], box[3] - box[1]
    if w > CANVAS[0] or h > GROUND:
        raise SystemExit(f'{name}: {w}x{h} does not fit the boss canvas')
    ox = (CANVAS[0] - w) // 2
    oy = GROUND - h
    out = []
    for f in frames:
        c = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
        c.alpha_composite(f.crop(box), (ox, oy))
        out.append(c)
    out[0].save(os.path.join(OUT, f'foe-{name}.png'))
    strip = Image.new('RGBA', (CANVAS[0] * len(out), CANVAS[1]), (0, 0, 0, 0))
    for i, c in enumerate(out):
        strip.alpha_composite(c, (i * CANVAS[0], 0))
    strip.save(os.path.join(OUT, f'foe-{name}-anim.png'))
    return out, (w, h)


def main():
    args = sys.argv[1:]
    sheet = None
    if '--sheet' in args:
        i = args.index('--sheet')
        sheet = args[i + 1]
        del args[i : i + 2]
    packs = args[0] if args else os.path.join('C:\\', 'Basic Incremental', 'design', 'references', 'itch')
    os.makedirs(OUT, exist_ok=True)
    stills = []
    for name, (folder, how) in ROSTER.items():
        frames, size = cut(packs, name, folder, how)
        stills.append((name, frames[0]))
        print(f'{name:38s} {len(frames):2d} frames  body {size[0]}x{size[1]}')
    if sheet:
        cols = 6
        rows = (len(stills) + cols - 1) // cols
        im = Image.new('RGBA', (cols * CANVAS[0], rows * CANVAS[1]), (58, 48, 70, 255))
        for i, (_, s) in enumerate(stills):
            im.alpha_composite(s, ((i % cols) * CANVAS[0], (i // cols) * CANVAS[1]))
        im.save(sheet)


if __name__ == '__main__':
    main()
