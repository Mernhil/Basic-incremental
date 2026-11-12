"""One contact sheet per weapon: the concept cells (as PixelLab got them) above, the game sprites below at 3x.

Usage: py design/pixel/weapon-tier-sprites/contact.py <concept input dir (cut.py output)> <out dir>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
HAND = ROOT / "src/renderer/src/art/pixel/hand"
IN, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
STEPS = [("t1", 0), ("t2", 0), ("t2", 1), ("t3", 0), ("t3", 1), ("t3", 2), ("t4", 0), ("t4", 1), ("t4", 2), ("t4", 3)]
LABEL = ["Wood", "Bronze", "Bronze +1", "Silver", "Silver +1", "Silver +2", "Gold", "Gold +1", "Gold +2", "Gold FINAL"]
BG = (14, 14, 40)
for t in ["sword", "greatsword", "dagger", "hammer", "lance", "bow", "scythe", "logging_axe"]:
    concept = Image.open(IN / f"in-{t}.png").convert("RGB")
    W, H = 5 * 300, 4 * 360 + 4 * 24
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    for i, (tier, step) in enumerate(STEPS):
        col, row = i % 5, i // 5
        cell = concept.crop((col * 400, row * 480, col * 400 + 400, row * 480 + 480)).resize((300, 360), Image.LANCZOS)
        spr = Image.open(HAND / f"item-{t}-{tier}-{step}.png").convert("RGBA").resize((300, 360), Image.NEAREST)
        y0 = row * (2 * 360 + 2 * 24)
        sheet.paste(cell, (col * 300, y0 + 24))
        base = Image.new("RGBA", (300, 360), BG + (255,))
        base.alpha_composite(spr)
        sheet.paste(base.convert("RGB"), (col * 300, y0 + 24 + 360 + 24))
        d.text((col * 300 + 6, y0 + 6), f"{t} {LABEL[i]}: concept", fill=(240, 220, 170))
        d.text((col * 300 + 6, y0 + 24 + 360 + 6), f"{t} {LABEL[i]}: sprite 3x", fill=(240, 220, 170))
    sheet.save(OUT / f"{t}.png")
    print(t)
