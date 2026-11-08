"""Achievement stickers, final build: proof sheets of the baked art (not game code).

    py design/pixel/achievement-stickers/final.py

final-style-a.png     all 29 achievements in style a (mini card), lit and locked, at 3x and 1x
final-styles-a-e.png  four achievements and a locked card in each style a-e, at 3x and 1x
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "scripts" / "art" / "cosmetics"))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import b6_export as B  # noqa: E402

S = 74
PAGE = (0x2A, 0x2F, 0x38)
PAPER = (0xEF, 0xE3, 0xC6)
BG = (0x1B, 0x1E, 0x26)
TEXT = (0xF6, 0xE7, 0xC8)
MUTED = (0xC8, 0xCC, 0xD6)
DIM = (0x9A, 0xA0, 0xB0)
F = "C:/Windows/Fonts/"
BIG = ImageFont.truetype(F + "bahnschrift.ttf", 40)
MID = ImageFont.truetype(F + "segoeuib.ttf", 22)
SMALL = ImageFont.truetype(F + "segoeui.ttf", 18)
TINY = ImageFont.truetype(F + "segoeui.ttf", 14)

# data order (src/data/content/achievements.json) with the page's chapter of each
ACH = [
    ("first_harvest", "gathering"), ("first_kill", "battle"), ("lumberjack_1", "gathering"),
    ("lumberjack_2", "gathering"), ("prospector_1", "gathering"), ("prospector_2", "gathering"),
    ("tree_hugger", "gathering"), ("deep_delver", "gathering"), ("giant_slayer_1", "battle"),
    ("giant_slayer_2", "battle"), ("giant_slayer_3", "battle"), ("glimmer_seeker", "battle"),
    ("first_summon", "cards"), ("ten_pulls", "cards"), ("pity_breaker", "cards"),
    ("silver_lining", "cards"), ("golden_hour", "cards"), ("six_stars", "cards"),
    ("prismatic_dawn", "cards"), ("full_loadout", "cards"), ("dressed_up", "wardrobe"),
    ("fashionista", "wardrobe"), ("skilled", "journey"), ("first_ascension", "journey"),
    ("night_owl", "journey"), ("first_milestone", "gathering"), ("gem_adept", "gathering"),
    ("medalist", "battle"), ("masterwork", "wardrobe"),
]
assert sorted(a for a, _ in ACH) == sorted(B.PICTURES)


def big(im, z=3):
    return im.resize((im.width * z, im.height * z), Image.NEAREST)


def strip(sheet, dr, x, y, items, label):
    w = len(items) * (S + 6) + 6
    for k, bg in enumerate((PAGE, PAPER)):
        yy = y + k * (S + 14)
        dr.rectangle([x, yy, x + w, yy + S + 8], fill=bg)
        for i, im in enumerate(items):
            sheet.paste(im, (x + 6 + i * (S + 6), yy + 4), im)
    dr.text((x, y + 2 * (S + 14)), label, font=TINY, fill=DIM)
    return y + 2 * (S + 14) + 24


def style_a_sheet():
    cols = 10
    cell_w, cell_h = S * 3 + 14, S * 3 + 34
    left = 40
    W = left * 2 + cols * cell_w
    rows = (len(ACH) + 1 + cols - 1) // cols
    H = 140 + rows * cell_h + 2 * (S + 14) + 60 + 2 * (S + 14) + 80
    sheet = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(sheet)
    dr.text((left, 24), "Achievement stickers: style a, mini card", font=BIG, fill=TEXT)
    dr.text((left, 78), "All 29 pictures redrawn in the cel style, lit, then the locked card back (the same for every "
            "achievement). 3x on the page colour #2a2f38.", font=SMALL, fill=MUTED)
    dr.text((left, 102), "Below: the same at 1x, the real size (74 x 74), on the page and on the sticker book paper "
            "#efe3c6.", font=SMALL, fill=MUTED)
    cells = [(a, B.sticker("a", a, ch)) for a, ch in ACH] + [("locked", B.sticker("a", "x", "battle", False))]
    y0 = 140
    for i, (name, im) in enumerate(cells):
        x, y = left + (i % cols) * cell_w, y0 + (i // cols) * cell_h
        dr.rectangle([x, y, x + S * 3 + 4, y + S * 3 + 4], fill=PAGE)
        b = big(im)
        sheet.paste(b, (x + 2, y + 2), b)
        dr.text((x, y + S * 3 + 8), name, font=TINY, fill=DIM)
    y = y0 + rows * cell_h + 10
    lit = [im for _, im in cells[:15]]
    y = strip(sheet, dr, left, y, lit, "1x, achievements 1-15")
    y = strip(sheet, dr, left, y, [im for _, im in cells[15:]], "1x, achievements 16-29 and locked")
    sheet.save(HERE / "final-style-a.png")
    print("wrote", HERE / "final-style-a.png", sheet.size)


def styles_sheet():
    picks = [("first_kill", "battle"), ("prospector_1", "gathering"), ("ten_pulls", "cards"), ("night_owl", "journey")]
    left = 40
    label_w = 260
    cell = S * 3 + 14
    strip_w = 5 * (S + 6) + 6
    W = left + label_w + 5 * cell + 30 + strip_w + 40
    rowh = S * 3 + 30
    H = 130 + 5 * rowh + 30
    sheet = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(sheet)
    dr.text((left, 24), "Achievement stickers: the five styles", font=BIG, fill=TEXT)
    dr.text((left, 78), "Same pictures and chapter band; the frame climbs the card-tier ladder. Four achievements and "
            "the locked back per style, 3x, then 1x on page and paper.", font=SMALL, fill=MUTED)
    desc = {
        "a": "Bronze caps, small crest gem",
        "b": "Silver, corner spikes, sapphires",
        "c": "Gold, side spikes, trim, big crest",
        "d": "Legendary: crown, glow, rubies",
        "e": "Prismatic: rainbow, plate wings",
    }
    y = 130
    for st, name in B.STYLES.items():
        items = [B.sticker(st, a, ch) for a, ch in picks] + [B.sticker(st, "x", "battle", False)]
        dr.text((left, y + 60), f"{st}  {name}", font=MID, fill=TEXT)
        dr.text((left, y + 92), desc[st], font=TINY, fill=DIM)
        for i, im in enumerate(items):
            x = left + label_w + i * cell
            dr.rectangle([x, y, x + S * 3 + 4, y + S * 3 + 4], fill=PAGE)
            b = big(im)
            sheet.paste(b, (x + 2, y + 2), b)
        sx = left + label_w + 5 * cell + 30
        for k, bg in enumerate((PAGE, PAPER)):
            yy = y + 20 + k * (S + 14)
            dr.rectangle([sx, yy, sx + strip_w, yy + S + 8], fill=bg)
            for i, im in enumerate(items):
                sheet.paste(im, (sx + 6 + i * (S + 6), yy + 4), im)
        y += rowh
    sheet.save(HERE / "final-styles-a-e.png")
    print("wrote", HERE / "final-styles-a-e.png", sheet.size)


if __name__ == "__main__":
    style_a_sheet()
    styles_sheet()
